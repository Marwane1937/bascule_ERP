const { getConnection } = require('../../config/database');

const PAYMENT_ACTIONS = ['CREDIT_CLIENT', 'REMBOURSEMENT', 'COMPENSATION'];

const normalizePaymentAction = (value) => {
  const action = String(value || 'CREDIT_CLIENT').trim().toUpperCase();
  return PAYMENT_ACTIONS.includes(action) ? action : 'CREDIT_CLIENT';
};

const toDecimal = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const toInteger = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const numericValue = Number.parseInt(value, 10);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const getPaymentStatus = (action) => {
  switch (action) {
    case 'REMBOURSEMENT':
      return 'A_REMBOURSER';
    case 'COMPENSATION':
      return 'A_COMPENSER';
    case 'CREDIT_CLIENT':
    default:
      return 'CREDIT_OUVERT';
  }
};

const ensureAvoirPaymentTreatmentTable = async (sequelize, transaction = null) => {
  await sequelize.query(
    `IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'avoir_traitement_paiement'
      )
      BEGIN
        CREATE TABLE avoir_traitement_paiement (
          id INT IDENTITY(1,1) PRIMARY KEY,
          avoir_facture_id INT NOT NULL,
          avoir_facture_ind INT NULL,
          type_action NVARCHAR(30) NOT NULL,
          montant DECIMAL(18, 2) NOT NULL DEFAULT 0,
          facture_compensation_id INT NULL,
          facture_compensation_ind INT NULL,
          statut NVARCHAR(30) NOT NULL,
          note NVARCHAR(255) NULL,
          cr_date DATETIME NOT NULL DEFAULT GETDATE()
        )
      END`,
    { transaction }
  );

  await sequelize.query(
    `IF COL_LENGTH('avoir_traitement_paiement', 'mode_reglement_id') IS NULL
      ALTER TABLE avoir_traitement_paiement ADD mode_reglement_id INT NULL;

     IF COL_LENGTH('avoir_traitement_paiement', 'caisse_document_id') IS NULL
      ALTER TABLE avoir_traitement_paiement ADD caisse_document_id INT NULL;`,
    { transaction }
  );
};

const getInvoicePaymentInfo = async (sequelize, transaction, factureId) => {
  const [paymentInfo] = await sequelize.query(
    `SELECT
       COUNT(1) AS lettrage_count,
       ISNULL(SUM(montant), 0) AS montant_regle
     FROM regle_facture
     WHERE facture_id = :factureId
       AND ISNULL(facture_ind, 1) = 1`,
    {
      replacements: { factureId },
      type: sequelize.QueryTypes.SELECT,
      transaction
    }
  );

  return paymentInfo || { lettrage_count: 0, montant_regle: 0 };
};

const assertInvoiceHasPayment = async (sequelize, transaction, factureId) => {
  const paymentInfo = await getInvoicePaymentInfo(sequelize, transaction, factureId);
  if (Number(paymentInfo?.lettrage_count || 0) <= 0 && toDecimal(paymentInfo?.montant_regle, 0) <= 0) {
    throw new Error('La facture selectionnee n est pas encore encaissee');
  }

  return paymentInfo;
};

const insertRefundExpenseLine = async (sequelize, transaction, payload) => {
  const caisseDocumentId = toInteger(payload.caisse_remboursement_id || payload.caisse_document_id);
  const amount = toDecimal(payload.montant_traitement, 0);

  if (!caisseDocumentId) {
    throw new Error('La caisse de remboursement est requise');
  }

  const [caisse] = await sequelize.query(
    `SELECT TOP 1 id, etat
     FROM caisse_document
     WHERE id = :caisseDocumentId`,
    {
      replacements: { caisseDocumentId },
      type: sequelize.QueryTypes.SELECT,
      transaction
    }
  );

  if (!caisse) {
    throw new Error('Caisse de remboursement introuvable');
  }

  const etat = caisse.etat !== null && caisse.etat !== undefined ? String(caisse.etat).trim().toUpperCase() : '';
  if (etat) {
    throw new Error('La caisse de remboursement doit etre ouverte');
  }

  const [lineInfo] = await sequelize.query(
    `SELECT ISNULL(MAX(ligne), 0) + 1 AS next_ligne
     FROM caisse_document_detail
     WHERE document_id = :caisseDocumentId`,
    {
      replacements: { caisseDocumentId },
      type: sequelize.QueryTypes.SELECT,
      transaction
    }
  );

  await sequelize.query(
    `INSERT INTO caisse_document_detail (
       document_id, ligne, rubrique_id, unite_id, quantite, montant,
       description, parent, type, etat, cr_date, user_id, employe_id, sens
     )
     VALUES (
       :documentId, :ligne, NULL, NULL, 1, :montant,
       :description, :parent, NULL, 1, GETDATE(), :userId, NULL, -1
     )`,
    {
      replacements: {
        documentId: caisseDocumentId,
        ligne: Number(lineInfo?.next_ligne || 1),
        montant: amount,
        description: payload.description || `Remboursement avoir ${payload.avoir_num || ''}`.trim(),
        parent: payload.avoir_facture_id || null,
        userId: payload.user_id || null
      },
      type: sequelize.QueryTypes.INSERT,
      transaction
    }
  );

  await sequelize.query(
    `UPDATE caisse_document
     SET montant = ISNULL(fond, 0)
       + ISNULL((
           SELECT SUM(ISNULL(quantite, 0) * ISNULL(montant, 0))
           FROM caisse_document_detail
           WHERE document_id = :caisseDocumentId
             AND ISNULL(sens, 1) = 1
         ), 0)
       - ISNULL((
           SELECT SUM(ISNULL(quantite, 0) * ISNULL(montant, 0))
           FROM caisse_document_detail
           WHERE document_id = :caisseDocumentId
             AND sens = -1
         ), 0)
     WHERE id = :caisseDocumentId`,
    {
      replacements: { caisseDocumentId },
      type: sequelize.QueryTypes.UPDATE,
      transaction
    }
  );

  return { caisse_document_id: caisseDocumentId };
};

const applyInvoiceCompensation = async (sequelize, transaction, payload) => {
  const sourceFactureId = toInteger(payload.facture_id || payload.avoir_facture_id);
  const targetFactureId = toInteger(payload.facture_compensation_id);
  const targetFactureInd = toInteger(payload.facture_compensation_ind, 1);

  if (!sourceFactureId || !targetFactureId) {
    throw new Error('La facture de compensation est requise');
  }

  if (sourceFactureId === targetFactureId) {
    throw new Error('La facture de compensation doit etre differente de la facture d origine');
  }

  const [targetInvoice] = await sequelize.query(
    `SELECT TOP 1 document_id, solde
     FROM v_pre_regle_facture
     WHERE document_id = :targetFactureId
     ORDER BY date DESC`,
    {
      replacements: { targetFactureId },
      type: sequelize.QueryTypes.SELECT,
      transaction
    }
  );

  if (!targetInvoice || toDecimal(targetInvoice.solde, 0) <= 0) {
    throw new Error('La facture a compenser doit etre non encaissee');
  }

  await assertInvoiceHasPayment(sequelize, transaction, sourceFactureId);

  const updateResult = await sequelize.query(
    `UPDATE regle_facture
     SET facture_id = :targetFactureId,
         facture_ind = :targetFactureInd
     WHERE facture_id = :sourceFactureId
       AND ISNULL(facture_ind, 1) = 1`,
    {
      replacements: {
        sourceFactureId,
        targetFactureId,
        targetFactureInd
      },
      type: sequelize.QueryTypes.UPDATE,
      transaction
    }
  );

  return {
    facture_compensation_id: targetFactureId,
    facture_compensation_ind: targetFactureInd,
    regle_facture_update: updateResult
  };
};

const insertAvoirPaymentTreatment = async (sequelize, transaction, payload) => {
  await ensureAvoirPaymentTreatmentTable(sequelize, transaction);

  const action = normalizePaymentAction(payload.traitement_paiement);
  const amount = toDecimal(
    payload.montant_traitement,
    toDecimal(payload.montant_ttc, 0)
  );

  if ((action === 'REMBOURSEMENT' || action === 'COMPENSATION') && amount <= 0) {
    throw new Error('Le montant du traitement du paiement doit etre superieur a zero');
  }

  if (action === 'COMPENSATION' && !payload.facture_compensation_id) {
    throw new Error('La facture de compensation est requise');
  }

  const modeReglementId = toInteger(payload.mode_reglement_id || payload.reference_remboursement);
  const caisseDocumentId = toInteger(payload.caisse_remboursement_id || payload.caisse_document_id);

  if (action === 'REMBOURSEMENT' && !modeReglementId) {
    throw new Error('Le mode de remboursement est requis');
  }

  if (action === 'REMBOURSEMENT' && !caisseDocumentId) {
    throw new Error('La caisse de remboursement est requise');
  }

  await sequelize.query(
    `INSERT INTO avoir_traitement_paiement (
        avoir_facture_id,
        avoir_facture_ind,
        type_action,
        montant,
        facture_compensation_id,
        facture_compensation_ind,
        mode_reglement_id,
        caisse_document_id,
        statut,
        note
      )
      VALUES (
        :avoirFactureId,
        :avoirFactureInd,
        :typeAction,
        :montant,
        :factureCompensationId,
        :factureCompensationInd,
        :modeReglementId,
        :caisseDocumentId,
        :statut,
        :note
      )`,
    {
      replacements: {
        avoirFactureId: payload.avoir_facture_id,
        avoirFactureInd: payload.avoir_facture_ind || null,
        typeAction: action,
        montant: Math.max(amount, 0),
        factureCompensationId: payload.facture_compensation_id || null,
        factureCompensationInd: payload.facture_compensation_ind || null,
        modeReglementId,
        caisseDocumentId,
        statut: getPaymentStatus(action),
        note: payload.note_traitement || null
      },
      transaction
    }
  );

  return {
    traitement_paiement: action,
    montant_traitement: Math.max(amount, 0),
    statut_traitement: getPaymentStatus(action),
    facture_compensation_id: payload.facture_compensation_id || null,
    facture_compensation_ind: payload.facture_compensation_ind || null,
    mode_reglement_id: modeReglementId,
    caisse_document_id: caisseDocumentId
  };
};

// Récupérer tous les avoirs avec pagination (sens = -1 dans facture_souche)
// Optimisé avec COUNT(*) OVER() pour éviter une requête séparée de comptage
const getAllAvoirs = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'facture_dat',
      orderDirection = 'DESC',
      search = ''
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['facture_id', 'facture_num', 'facture_dat', 'nom', 'facture_ht', 'facture_tva'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'facture_dat';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = "WHERE f.facture_typ = 'AV'";
    const replacements = {};

    if (search && search.trim()) {
      whereClause += ` AND (
        f.facture_num LIKE :search 
        OR p.nom LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    // Requête unique avec COUNT(*) OVER() pour obtenir le total sans requête séparée
    await ensureAvoirPaymentTreatmentTable(sequelize);

    const query = `
      SELECT 
        facture_id,
        facture_ind,
        facture_num,
        facture_dat,
        nom,
        part_id,
        type_avoir,
        facture_ht,
        facture_tva,
        facture_ttc,
        traitement_paiement,
        montant_traitement,
        statut_traitement,
        facture_compensation_id,
        facture_compensation_ind,
        mode_reglement_id,
        caisse_document_id,
        total_count
      FROM (
        SELECT 
          f.facture_id,
          f.facture_ind,
          f.facture_num,
          f.facture_dat,
          p.nom,
          fs.part_id,
          CASE 
            WHEN f.facture_id IN (SELECT facture_id FROM stock WHERE type = 5) THEN 'MARCHANDISE'
            ELSE 'FINANCIER'
          END AS type_avoir,
          ISNULL(f.facture_ht, 0) AS facture_ht,
          ISNULL(f.facture_tva, 0) AS facture_tva,
          ISNULL(f.facture_ht, 0) + ISNULL(f.facture_tva, 0) AS facture_ttc,
          ISNULL(atp.type_action, 'CREDIT_CLIENT') AS traitement_paiement,
          ISNULL(atp.montant, ISNULL(f.facture_ht, 0) + ISNULL(f.facture_tva, 0)) AS montant_traitement,
          ISNULL(atp.statut, 'CREDIT_OUVERT') AS statut_traitement,
          atp.facture_compensation_id,
          atp.facture_compensation_ind,
          atp.mode_reglement_id,
          atp.caisse_document_id,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${safeOrderBy} ${safeOrderDirection}) AS RowNum
        FROM facture f
        INNER JOIN facture_souche fs ON fs.facture_id = f.facture_id
        LEFT JOIN partenaire p ON p.part_id = fs.part_id
        OUTER APPLY (
          SELECT TOP 1
            treatment.type_action,
            treatment.montant,
            treatment.statut,
            treatment.facture_compensation_id,
            treatment.facture_compensation_ind,
            treatment.mode_reglement_id,
            treatment.caisse_document_id
          FROM avoir_traitement_paiement treatment
          WHERE treatment.avoir_facture_id = f.facture_id
            AND (treatment.avoir_facture_ind = f.facture_ind OR treatment.avoir_facture_ind IS NULL)
          ORDER BY treatment.id DESC
        ) atp
        ${whereClause}
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY RowNum
    `;

    let results = [];
    let total = 0;

    try {
      const queryResult = await sequelize.query(query, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });

      if (Array.isArray(queryResult)) {
        results = queryResult;
      } else {
        results = queryResult ? [queryResult] : [];
      }

      // Extraire le total depuis la première ligne
      if (results.length > 0) {
        total = results[0].total_count || 0;
        results = results.map(({ total_count, ...rest }) => rest);
      }
    } catch (queryError) {
      console.error('[getAllAvoirs] Erreur:', queryError.message);
      throw new Error(`Erreur lors de la récupération des avoirs: ${queryError.message || 'Erreur inconnue'}`);
    }

    const totalPages = Math.ceil(total / safePageSize);

    return {
      data: results || [],
      pagination: {
        total: total,
        page: safePage,
        pageSize: safePageSize,
        totalPages: totalPages
      }
    };
  } catch (error) {
    console.error('[getAllAvoirs] Erreur:', error.message);
    throw error;
  }
};

// Compter le total des avoirs
const countAllAvoirs = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const [result] = await sequelize.query(
      `SELECT COUNT(*) AS total 
       FROM facture f
       WHERE f.facture_typ = 'AV'`
    );

    if (Array.isArray(result) && result.length > 0) {
      return result[0].total || 0;
    } else if (result && result.total !== undefined) {
      return result.total;
    }
    return 0;
  } catch (error) {
    console.error('[countAllAvoirs] Erreur:', error.message);
    return 0;
  }
};

// Récupérer un avoir par ID
const getAvoirById = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  await ensureAvoirPaymentTreatmentTable(sequelize);

  // Récupérer les infos principales depuis facture et facture_souche
  const avoirRows = await sequelize.query(
    `SELECT 
      f.facture_id,
      f.facture_num,
      f.facture_dat,
      f.facture_typ,
      f.facture_ht,
      f.facture_tva,
      fs.part_id,
      fs.adresse_id,
      fs.sens,
      p.nom AS client_nom,
      ISNULL(atp.type_action, 'CREDIT_CLIENT') AS traitement_paiement,
      ISNULL(atp.montant, ISNULL(f.facture_ht, 0) + ISNULL(f.facture_tva, 0)) AS montant_traitement,
      ISNULL(atp.statut, 'CREDIT_OUVERT') AS statut_traitement,
      atp.facture_compensation_id,
      atp.facture_compensation_ind,
      atp.mode_reglement_id,
      atp.caisse_document_id,
      CASE 
        WHEN f.facture_id IN (SELECT facture_id FROM stock WHERE type = 5) THEN 'MARCHANDISE'
        ELSE 'FINANCIER'
      END AS type_avoir
    FROM facture f
    INNER JOIN facture_souche fs ON fs.facture_id = f.facture_id
    LEFT JOIN partenaire p ON p.part_id = fs.part_id
    OUTER APPLY (
      SELECT TOP 1
        treatment.type_action,
        treatment.montant,
        treatment.statut,
        treatment.facture_compensation_id,
        treatment.facture_compensation_ind,
        treatment.mode_reglement_id,
        treatment.caisse_document_id
      FROM avoir_traitement_paiement treatment
      WHERE treatment.avoir_facture_id = f.facture_id
        AND (treatment.avoir_facture_ind = f.facture_ind OR treatment.avoir_facture_ind IS NULL)
      ORDER BY treatment.id DESC
    ) atp
    WHERE f.facture_id = :id AND f.facture_typ = 'AV'`,
    {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    }
  );

  let avoir = Array.isArray(avoirRows) && avoirRows.length > 0
    ? avoirRows[0]
    : null;

  if (!avoir) {
    return null;
  }

  const factureId = avoir.facture_id;

  // Récupérer les détails depuis stock_detail si c'est un avoir marchandise
  // ou depuis facture_detail si c'est un avoir financier
  let detailRows = [];

  if (avoir.type_avoir === 'MARCHANDISE') {
    // Avoir marchandise : récupérer depuis stock_detail
    detailRows = await sequelize.query(
      `SELECT 
        sd.id, 
        sd.id AS detail_id, 
        sd.stock_id AS document_id, 
        sd.article_id, 
        sd.quantite AS qte, 
        sd.prix AS pu, 
        sd.taux_tva AS tva,
        sd.remise,
        sd.quantite * sd.prix AS ht,
        (sd.quantite * sd.prix) * sd.taux_tva AS tva_montant,
        (sd.quantite * sd.prix) + ((sd.quantite * sd.prix) * sd.taux_tva) AS ttc,
        sd.description,
        a.article_nom
      FROM stock_detail sd
      LEFT JOIN article a ON a.article_id = sd.article_id
      WHERE sd.stock_id = :id`,
      {
        replacements: { id: factureId },
        type: sequelize.QueryTypes.SELECT
      }
    );
  } else {
    // Avoir financier : récupérer depuis facture_detail si la table existe
    // Sinon, créer des détails factices basés sur la facture d'origine
    detailRows = await sequelize.query(
      `SELECT 
        fd.id, 
        fd.id AS detail_id, 
        fd.facture_id AS document_id, 
        fd.article_id, 
        fd.quantite AS qte, 
        fd.prix AS pu, 
        fd.taux_tva AS tva,
        fd.remise,
        fd.quantite * fd.prix AS ht,
        (fd.quantite * fd.prix) * fd.taux_tva AS tva_montant,
        (fd.quantite * fd.prix) + ((fd.quantite * fd.prix) * fd.taux_tva) AS ttc,
        fd.description,
        a.article_nom
      FROM facture_detail fd
      LEFT JOIN article a ON a.article_id = fd.article_id
      WHERE fd.facture_id = :id`,
      {
        replacements: { id: factureId },
        type: sequelize.QueryTypes.SELECT
      }
    ).catch(() => {
      // Si facture_detail n'existe pas, retourner un détail factice
      return [{
        id: null,
        detail_id: null,
        document_id: factureId,
        article_id: null,
        qte: 0,
        pu: avoir.facture_ht || 0,
        tva: 0.2,
        remise: 0,
        ht: avoir.facture_ht || 0,
        tva_montant: avoir.facture_tva || 0,
        ttc: (avoir.facture_ht || 0) + (avoir.facture_tva || 0),
        description: 'Avoir financier',
        article_nom: 'Ajustement financier'
      }];
    });
  }

  let details = Array.isArray(detailRows) ? detailRows : [];

  // Harmoniser la structure des détails pour le frontend
  const normalizedDetails = (Array.isArray(details) ? details : []).map(detail => {
    const articleId = detail.article_id ?? null;
    const prix = detail.pu ?? detail.prix ?? 0;
    const quantite = detail.qte ?? detail.quantite ?? 0;
    const taux_tva = detail.tva ?? detail.taux_tva ?? 0;
    const designation = detail.description ?? detail.designation ?? detail.article_nom ?? '';

    return {
      id: detail.id ?? detail.detail_id ?? null,
      detail_id: detail.detail_id ?? detail.id ?? null,
      document_id: detail.document_id ?? factureId,
      article_id: articleId,
      designation,
      description: detail.description ?? detail.article_nom ?? '',
      article_nom: detail.article_nom ?? designation,
      pu: prix,
      prix,
      qte: quantite,
      quantite,
      tva: taux_tva,
      taux_tva,
      remise: detail.remise ?? 0,
      remise_montant: 0,
      remise_mode: 'montant',
      ht: detail.ht ?? prix * quantite,
      ttc: detail.ttc ?? (prix * quantite) * (1 + (taux_tva || 0))
    };
  });

  const clientId = avoir.part_id;

  // Récupérer les informations du client (partenaire)
  let clientInfo = null;
  if (clientId != null) {
    const columnRows = await sequelize.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = 'partenaire'`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const availableColumns = new Set(
      Array.isArray(columnRows)
        ? columnRows
          .map((row) => {
            if (!row) return null;
            const entries = Object.values(row);
            return entries.length > 0 ? String(entries[0]).toLowerCase() : null;
          })
          .filter(Boolean)
        : []
    );

    const selectFields = ['p.part_id', 'p.nom'];

    const optionalColumns = [
      { column: 'telephone', alias: 'telephone' },
      { column: 'email', alias: 'email' },
      { column: 'adresse', alias: 'adresse' },
      { column: 'ice', alias: 'ice' },
      { column: 'cin', alias: 'cin' },
      { column: 'rc', alias: 'rc' },
      { column: 'IF_', alias: 'IF_' },
      { column: 'PATENTE', alias: 'PATENTE' },
      { column: 'cnss', alias: 'cnss' }
    ];

    optionalColumns.forEach(({ column, alias }) => {
      const key = column.toLowerCase();
      if (availableColumns.has(key)) {
        selectFields.push(`p.${column} AS ${alias}`);
      } else {
        selectFields.push(`NULL AS ${alias}`);
      }
    });

    const clientRows = await sequelize.query(
      `SELECT ${selectFields.join(', ')} 
       FROM partenaire p
       WHERE p.part_id = :part_id`,
      {
        replacements: { part_id: clientId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (Array.isArray(clientRows) && clientRows.length > 0) {
      clientInfo = clientRows[0];
    } else if (clientRows && typeof clientRows === 'object') {
      clientInfo = clientRows;
    }
  }

  return {
    ...avoir,
    document_id: factureId,
    part_id: avoir.part_id,
    client: avoir.client_nom || null,
    client_nom: avoir.client_nom || null,
    source: 'facture',
    details: normalizedDetails,
    clientInfo: clientInfo || null
  };
};

// Créer un avoir financier (basé sur une facture existante)
const createAvoirFinancier = async ({
  facture_id,
  part_id,
  date,
  montant_ht,
  montant_tva,
  description,
  adresse_id,
  traitement_paiement,
  montant_traitement,
  facture_compensation_id,
  facture_compensation_ind,
  mode_reglement_id,
  reference_remboursement,
  caisse_remboursement_id,
  note_traitement,
  user_id
}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getCompteurCurrent } = require('../../services/compteur.service');

  return await sequelize.transaction(async (t) => {
    try {
      // facture_id : doit prendre le facture_id de la facture correspondant au facture sélectionné
      const factureId = facture_id || null;

      const normalizedPaymentAction = normalizePaymentAction(traitement_paiement);

      if (!factureId) {
        throw new Error('facture_id est requis pour créer un avoir financier');
      }

      // Si part_id n'est pas fourni, le récupérer depuis la facture originale
      if (normalizedPaymentAction === 'REMBOURSEMENT' || normalizedPaymentAction === 'COMPENSATION') {
        await assertInvoiceHasPayment(sequelize, t, factureId);
      }

      let finalPartId = part_id;
      if (!finalPartId || finalPartId === 0) {
        const [factureOriginale] = await sequelize.query(
          `SELECT TOP 1 fs.part_id 
           FROM facture_souche fs
           INNER JOIN facture f ON f.facture_id = fs.facture_id
           WHERE fs.facture_id = :factureId AND f.facture_ind = 1 AND fs.sens = 1`,
          {
            replacements: { factureId: factureId },
            type: sequelize.QueryTypes.SELECT,
            transaction: t
          }
        );

        if (factureOriginale && factureOriginale.part_id) {
          finalPartId = factureOriginale.part_id;
        } else {
          // Fallback : prendre le premier part_id disponible pour cette facture
          const [fallbackPart] = await sequelize.query(
            `SELECT TOP 1 fs.part_id 
             FROM facture_souche fs
             WHERE fs.facture_id = :factureId AND fs.sens = 1
             ORDER BY fs.facture_id ASC`,
            {
              replacements: { factureId: factureId },
              type: sequelize.QueryTypes.SELECT,
              transaction: t
            }
          );

          if (fallbackPart && fallbackPart.part_id) {
            finalPartId = fallbackPart.part_id;
          }
        }
      }

      if (!finalPartId || finalPartId === 0) {
        throw new Error('part_id est requis pour créer un avoir financier. Impossible de le récupérer depuis la facture.');
      }

      // Récupérer le maximum facture_ind pour ce facture_id et l'incrémenter
      const [maxIndResult] = await sequelize.query(
        'SELECT ISNULL(MAX(facture_ind), 0) AS max_ind FROM facture WHERE facture_id = :factureId',
        {
          replacements: { factureId: factureId },
          type: sequelize.QueryTypes.SELECT,
          transaction: t
        }
      );
      const factureInd = (maxIndResult?.max_ind || 0) + 1;

      // Récupérer le compteur actuel pour AV (Avoir)
      const compteurActuel = await getCompteurCurrent('AV', sequelize);
      if (compteurActuel === null || compteurActuel === undefined) {
        throw new Error('Impossible de récupérer le compteur AV');
      }

      // Formater le numéro
      const anneeCourte = new Date().getFullYear().toString().slice(2);
      const avoirNum = `AV${anneeCourte}-${compteurActuel.toString().padStart(4, '0')}`;


      // Pour un avoir financier, on ne crée pas de nouvelle entrée dans facture_souche
      // On utilise la facture_souche existante de la facture originale

      // Créer la facture (avoir) dans la table facture
      await sequelize.query(
        `INSERT INTO facture (facture_id, facture_ind, facture_num, facture_dat, facture_typ, facture_ht, facture_tva, etat)
         VALUES (:factureId, :factureInd, :factureNum, :factureDate, 'AV', :factureHt, :factureTva, '1')`,
        {
          replacements: {
            factureId: factureId,
            factureInd: factureInd,
            factureNum: avoirNum,
            factureDate: date || new Date(),
            factureHt: montant_ht || 0,
            factureTva: montant_tva || 0
          },
          transaction: t
        }
      );

      // Incrémenter le compteur
      await sequelize.query(
        'UPDATE compteur SET compteur = compteur + 1 WHERE LTRIM(RTRIM(code)) = \'AV\'',
        { transaction: t }
      );

      const paymentTreatment = await insertAvoirPaymentTreatment(sequelize, t, {
        avoir_facture_id: factureId,
        avoir_facture_ind: factureInd,
        traitement_paiement,
        montant_traitement,
        montant_ttc: toDecimal(montant_ht, 0) + toDecimal(montant_tva, 0),
        facture_compensation_id,
        facture_compensation_ind,
        mode_reglement_id,
        reference_remboursement,
        caisse_remboursement_id,
        note_traitement: note_traitement || description
      });

      let refundResult = null;
      let compensationResult = null;

      if (paymentTreatment.traitement_paiement === 'REMBOURSEMENT') {
        refundResult = await insertRefundExpenseLine(sequelize, t, {
          avoir_facture_id: factureId,
          avoir_facture_ind: factureInd,
          avoir_num: avoirNum,
          caisse_remboursement_id,
          montant_traitement: paymentTreatment.montant_traitement,
          description: `Remboursement avoir ${avoirNum}`,
          user_id
        });
      } else if (paymentTreatment.traitement_paiement === 'COMPENSATION') {
        compensationResult = await applyInvoiceCompensation(sequelize, t, {
          facture_id: factureId,
          facture_compensation_id,
          facture_compensation_ind
        });
      }

      return {
        facture_id: factureId,
        facture_ind: factureInd,
        facture_num: avoirNum,
        facture_dat: date || new Date(),
        type_avoir: 'FINANCIER',
        ...paymentTreatment,
        refund: refundResult,
        compensation: compensationResult
      };
    } catch (error) {
      console.error('❌ Erreur lors de la création de l\'avoir financier:', error);
      throw new Error(`Erreur lors de l'ajout de l'avoir financier: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Créer un avoir marchandise (basé sur un retour)
const createAvoirMarchandise = async ({
  retour_id,
  part_id,
  date,
  adresse_id,
  traitement_paiement,
  montant_traitement,
  facture_compensation_id,
  facture_compensation_ind,
  mode_reglement_id,
  reference_remboursement,
  caisse_remboursement_id,
  note_traitement,
  user_id
}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getCompteurCurrent } = require('../../services/compteur.service');

  return await sequelize.transaction(async (t) => {
    try {
      // Vérifier que le retour existe
      const [retourCheck] = await sequelize.query(
        'SELECT id, numero, part_id FROM stock WHERE id = :retourId AND type = 5',
        {
          replacements: { retourId: retour_id },
          type: sequelize.QueryTypes.SELECT,
          transaction: t
        }
      );

      if (!retourCheck || (Array.isArray(retourCheck) && retourCheck.length === 0)) {
        throw new Error('Retour non trouvé');
      }

      const retour = Array.isArray(retourCheck) ? retourCheck[0] : retourCheck;

      // Récupérer le compteur actuel pour AV
      const compteurActuel = await getCompteurCurrent('AV', sequelize);
      if (compteurActuel === null || compteurActuel === undefined) {
        throw new Error('Impossible de récupérer le compteur AV');
      }

      // Formater le numéro
      const anneeCourte = new Date().getFullYear().toString().slice(2);
      const avoirNum = `AV${anneeCourte}-${compteurActuel.toString().padStart(4, '0')}`;

      // Récupérer le maximum facture_id existant pour en créer un nouveau
      const [maxFactureIdResult] = await sequelize.query(
        'SELECT ISNULL(MAX(facture_id), 0) AS max_id FROM facture_souche',
        { type: sequelize.QueryTypes.SELECT, transaction: t }
      );
      const factureId = (maxFactureIdResult?.max_id || 0) + 1;
      const factureInd = 1;

      // Créer facture_souche avec sens = -1 (avoir)
      await sequelize.query(
        `SET IDENTITY_INSERT facture_souche ON;
         INSERT INTO facture_souche (facture_id, part_id, adresse_id, sens)
         VALUES (:factureId, :partId, :adresseId, -1);
         SET IDENTITY_INSERT facture_souche OFF;`,
        {
          replacements: {
            factureId: factureId,
            partId: part_id || retour.part_id || null,
            adresseId: adresse_id || null
          },
          transaction: t
        }
      );

      // Calculer les totaux depuis stock_detail
      const [totaux] = await sequelize.query(
        `SELECT 
          SUM(quantite * prix) AS total_ht,
          SUM((quantite * prix) * taux_tva) AS total_tva
        FROM stock_detail
        WHERE stock_id = :stockId`,
        {
          replacements: { stockId: retour_id },
          type: sequelize.QueryTypes.SELECT,
          transaction: t
        }
      );

      const totalHt = totaux?.total_ht || 0;
      const totalTva = totaux?.total_tva || 0;

      // Créer la facture (avoir) dans la table facture
      await sequelize.query(
        `INSERT INTO facture (facture_id, facture_ind, facture_num, facture_dat, facture_typ, facture_ht, facture_tva, etat)
         VALUES (:factureId, :factureInd, :factureNum, :factureDate, 'AV', :factureHt, :factureTva, '1')`,
        {
          replacements: {
            factureId: factureId,
            factureInd: factureInd,
            factureNum: avoirNum,
            factureDate: date || new Date(),
            factureHt: totalHt,
            factureTva: totalTva
          },
          transaction: t
        }
      );

      // Mettre à jour le stock pour lier l'avoir au retour
      await sequelize.query(
        'UPDATE stock SET facture_id = :factureId WHERE id = :retourId',
        {
          replacements: {
            factureId: factureId,
            retourId: retour_id
          },
          transaction: t
        }
      );

      // Incrémenter le compteur
      await sequelize.query(
        'UPDATE compteur SET compteur = compteur + 1 WHERE LTRIM(RTRIM(code)) = \'AV\'',
        { transaction: t }
      );

      const paymentTreatment = await insertAvoirPaymentTreatment(sequelize, t, {
        avoir_facture_id: factureId,
        avoir_facture_ind: factureInd,
        traitement_paiement,
        montant_traitement,
        montant_ttc: toDecimal(totalHt, 0) + toDecimal(totalTva, 0),
        facture_compensation_id,
        facture_compensation_ind,
        mode_reglement_id,
        reference_remboursement,
        caisse_remboursement_id,
        note_traitement
      });

      let refundResult = null;

      if (paymentTreatment.traitement_paiement === 'REMBOURSEMENT') {
        refundResult = await insertRefundExpenseLine(sequelize, t, {
          avoir_facture_id: factureId,
          avoir_facture_ind: factureInd,
          avoir_num: avoirNum,
          caisse_remboursement_id,
          montant_traitement: paymentTreatment.montant_traitement,
          description: `Remboursement avoir ${avoirNum}`,
          user_id
        });
      }

      return {
        facture_id: factureId,
        facture_ind: factureInd,
        facture_num: avoirNum,
        facture_dat: date || new Date(),
        type_avoir: 'MARCHANDISE',
        retour_id: retour_id,
        ...paymentTreatment,
        refund: refundResult
      };
    } catch (error) {
      console.error('❌ Erreur lors de la création de l\'avoir marchandise:', error);
      throw new Error(`Erreur lors de l'ajout de l'avoir marchandise: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Mettre à jour un avoir
const updateAvoir = async (id, avoirData, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const factureInd = toInteger(avoirData.facture_ind);
  const whereConditions = ['facture_id = :id', "facture_typ = 'AV'"];
  const replacements = {
    id,
    date: avoirData.date || null,
    factureHt: avoirData.montant_ht || null,
    factureTva: avoirData.montant_tva || null
  };

  if (factureInd) {
    whereConditions.push('facture_ind = :factureInd');
    replacements.factureInd = factureInd;
  }

  await sequelize.query(
    `UPDATE facture 
     SET facture_dat = :date, 
         facture_ht = :factureHt, 
         facture_tva = :factureTva
     WHERE ${whereConditions.join(' AND ')}`,
    {
      replacements
    }
  );
};

// Supprimer un avoir
const deleteAvoir = async (ids, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('IDs invalides pour la suppression');
  }

  await ensureAvoirPaymentTreatmentTable(sequelize);

  await sequelize.query(
    `DELETE FROM avoir_traitement_paiement WHERE avoir_facture_id IN (${ids.map(() => '?').join(',')})`,
    { replacements: ids }
  );

  // Supprimer facture_souche
  await sequelize.query(
    `DELETE FROM facture_souche WHERE facture_id IN (${ids.map(() => '?').join(',')}) AND sens = -1`,
    { replacements: ids }
  );

  // Supprimer facture
  await sequelize.query(
    `DELETE FROM facture WHERE facture_id IN (${ids.map(() => '?').join(',')})`,
    { replacements: ids }
  );
};

// Récupérer les données pour le rapport PDF d'un avoir
const getAvoirReportById = async (factureId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    // 1. Récupérer les infos de base de l'avoir
    const [avoirInfo] = await sequelize.query(`
      SELECT  
        f.facture_id, 
        f.facture_num AS numero, 
        f.facture_dat AS date, 
        f.facture_typ, 
        f.facture_ht, 
        f.facture_tva, 
        p.nom AS nom_client, 
        a.nom AS adresse, 
        v.nom AS ville, 
        pi.identifiant AS ice, 
        CASE  
          WHEN f.facture_id IN (SELECT facture_id FROM stock WHERE type = 5) THEN 'Avoir MARCHANDISE' 
          ELSE 'Avoir FINANCIER' 
        END AS type_avoir 
      FROM facture f 
      INNER JOIN facture_souche fs ON fs.facture_id = f.facture_id 
      LEFT JOIN partenaire p ON p.part_id = fs.part_id 
      LEFT JOIN adresse a ON a.part_id = p.part_id
      LEFT JOIN ville v ON v.id = a.ville
      LEFT JOIN partenaire_identifiant pi ON pi.part_id = p.part_id AND pi.identifiant_type = 8
      WHERE f.facture_id = :factureId AND f.facture_typ = 'AV'
    `, {
      replacements: { factureId },
      type: sequelize.QueryTypes.SELECT
    });

    if (!avoirInfo) {
      console.warn('[getAvoirReportById] ⚠️ Avoir non trouvé:', factureId);
      return null;
    }

    const typeAvoir = avoirInfo.type_avoir;
    let details = [];

    if (typeAvoir && typeAvoir.includes('MARCHANDISE')) {
      // Pour les avoirs marchandises, les détails sont dans stock_detail (facture_id = stock_id)
      details = await sequelize.query(`
        SELECT 
          :factureId AS document_id,
          :numero AS numero,
          :date AS date,
          'AVOIR' AS document_kind,
          :nom_client AS client,
          ISNULL(a.article_cod, '') AS article_cod,
          ISNULL(sd.description, ISNULL(a.article_nom, '')) AS designation,
          ISNULL(a.article_nom, '') AS article_nom,
          sd.quantite,
          sd.prix,
          ISNULL(sd.taux_tva, 0) AS taux_tva,
          ISNULL(sd.remise, 0) AS remise,
          ISNULL(sd.remise_montant, 0) AS remise_montant,
          :adresse AS adresse,
          :ville AS ville,
          :ice AS ice,
          (sd.quantite * sd.prix) AS total_ht,
          (sd.quantite * sd.prix * ISNULL(sd.taux_tva, 0)) AS total_tva,
          (sd.quantite * sd.prix * (1 + ISNULL(sd.taux_tva, 0))) AS total_ttc
        FROM stock_detail sd
        LEFT JOIN article a ON a.article_id = sd.article_id
        WHERE sd.stock_id = :factureId
        ORDER BY sd.id
      `, {
        replacements: {
          factureId: avoirInfo.facture_id,
          numero: avoirInfo.numero,
          date: avoirInfo.date,
          nom_client: avoirInfo.nom_client || '',
          adresse: avoirInfo.adresse || '',
          ville: avoirInfo.ville || '',
          ice: avoirInfo.ice || ''
        },
        type: sequelize.QueryTypes.SELECT
      });
    } else {
      // Pour les avoirs financiers, on crée une ligne unique basée sur les totaux de la facture
      details = [{
        document_id: avoirInfo.facture_id,
        numero: avoirInfo.numero,
        date: avoirInfo.date,
        document_kind: 'AVOIR',
        client: avoirInfo.nom_client || '',
        article_cod: 'AVOIR',
        designation: 'Avoir financier',
        article_nom: 'Avoir financier',
        quantite: 1,
        prix: avoirInfo.facture_ht,
        taux_tva: (avoirInfo.facture_tva / avoirInfo.facture_ht) || 0,
        remise: 0,
        remise_montant: 0,
        adresse: avoirInfo.adresse || '',
        ville: avoirInfo.ville || '',
        ice: avoirInfo.ice || '',
        total_ht: avoirInfo.facture_ht,
        total_tva: avoirInfo.facture_tva,
        total_ttc: (avoirInfo.facture_ht + avoirInfo.facture_tva)
      }];
    }

    return details.length > 0 ? details : null;
  } catch (error) {
    console.error('[getAvoirReportById] ❌ Erreur:', error);
    throw error;
  }
};

module.exports = {
  getAllAvoirs,
  countAllAvoirs,
  getAvoirById,
  getAvoirReportById,
  createAvoirFinancier,
  createAvoirMarchandise,
  updateAvoir,
  deleteAvoir
};
