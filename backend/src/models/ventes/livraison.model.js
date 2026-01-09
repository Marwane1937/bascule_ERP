const { getConnection } = require('../../config/database');

// Récupérer toutes les livraisons avec pagination
// Optimisé avec COUNT(*) OVER() pour éviter une requête séparée de comptage
const getAllLivraisons = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'date',
      orderDirection = 'DESC',
      search = ''
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['document_id', 'numero', 'date', 'client', 'commercial', 'total_ht', 'total_tva', 'total_ttc'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = 'WHERE s.type = 2';
    const replacements = {};

    if (search && search.trim()) {
      whereClause += ` AND (
        s.numero LIKE :search 
        OR p.nom LIKE :search
        OR c.nom LIKE :search
        OR s.description LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    // Requête unique avec COUNT(*) OVER() pour obtenir le total sans requête séparée
    const query = `
      SELECT 
        document_id,
        numero,
        date,
        description,
        part_ref,
        client,
        commercial,
        facture,
        total_ht,
        total_tva,
        total_ttc,
        total_count
      FROM (
        SELECT 
          s.id AS document_id,
          s.numero,
          s.date,
          s.description,
          s.part_ref,
          p.nom AS client,
          c.nom AS commercial,
          ISNULL(t.total_ht, 0) AS total_ht,
          ISNULL(t.total_tva, 0) AS total_tva,
          ISNULL(t.total_ttc, 0) AS total_ttc,
          CASE WHEN s.facture_id IS NULL THEN 'NON FACTURE' ELSE 'FACTURE' END AS facture,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${safeOrderBy} ${safeOrderDirection}) AS RowNum
        FROM stock s
        LEFT JOIN (
            SELECT stock_id,
                   SUM(quantite * prix) AS total_ht,
                   SUM((quantite * prix) * taux_tva) AS total_tva,
                   SUM((quantite * prix) + (quantite * prix) * taux_tva) AS total_ttc
            FROM stock_detail
            GROUP BY stock_id
        ) t ON t.stock_id = s.id
        LEFT JOIN partenaire p ON p.part_id = s.part_id
        LEFT JOIN contact c ON c.id = s.employe_id
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
      console.error('[getAllLivraisons] Erreur:', queryError.message);
      throw new Error(`Erreur lors de la récupération des livraisons: ${queryError.message || 'Erreur inconnue'}`);
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
    console.error('[getAllLivraisons] Erreur:', error.message);
    throw error;
  }
};

// Compter le total des livraisons
const countAllLivraisons = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const [result] = await sequelize.query('SELECT COUNT(*) AS total FROM stock WHERE type = 2');

    if (Array.isArray(result) && result.length > 0) {
      return result[0].total || 0;
    } else if (result && result.total !== undefined) {
      return result.total;
    }
    return 0;
  } catch (error) {
    console.error('Erreur dans countAllLivraisons:', error);
    return 0;
  }
};

// Récupérer uniquement les commandes qui n'ont pas encore été transférées en livraison
const getAllCommandesNonLivrees = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const [results] = await sequelize.query(
      `SELECT DISTINCT
        vd.document_id, 
        vd.numero, 
        vd.date, 
        vd.description, 
        p.nom AS client, 
        c.nom AS commercial
      FROM vente_document vd
      LEFT JOIN v_partenaire p ON p.part_id = vd.part_id
      LEFT JOIN contact c ON c.id = vd.contact_id
      WHERE vd.type = 2 
        AND (vd.etat IS NULL OR vd.etat = 2)
        AND NOT EXISTS (
          SELECT 1 
          FROM stock s 
          WHERE s.parent = vd.document_id 
            AND s.type = 2
        )
      ORDER BY vd.date DESC`
    );
    return Array.isArray(results) ? results : [];
  } catch (error) {
    console.error('[getAllCommandesNonLivrees] Erreur lors de la récupération des commandes non livrées:', error);
    return [];
  }
};

// Récupérer une livraison par ID
const getLivraisonById = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  // Récupérer les infos principales depuis stock
  let livraisonRows;
  try {
    livraisonRows = await sequelize.query(
      `SELECT 
        s.id,
        s.numero,
        s.date,
        s.description,
        s.part_id,
        s.employe_id AS contact_id,
        s.part_ref,
        p.nom AS client_nom,
        c.nom AS commercial_nom
      FROM stock s
      LEFT JOIN partenaire p ON p.part_id = s.part_id
      LEFT JOIN contact c ON c.id = s.employe_id
      WHERE s.id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );
  } catch (error) {
    console.error(`[getLivraisonById] Erreur stock:`, error.message);
    livraisonRows = [];
  }

  let livraison = Array.isArray(livraisonRows) && livraisonRows.length > 0
    ? livraisonRows[0]
    : null;

  let source = 'stock';

  // Si aucune livraison trouvée dans stock, fallback sur vente_document
  if (!livraison) {
    let livraisonDocumentRows;
    try {
      livraisonDocumentRows = await sequelize.query(
        `SELECT
          vd.document_id AS id,
          vd.numero,
          vd.date,
          vd.description,
          vd.part_id,
          vd.contact_id,
          vd.part_ref,
          p.nom AS client_nom,
          c.nom AS commercial_nom
        FROM vente_document vd
        LEFT JOIN partenaire p ON p.part_id = vd.part_id
        LEFT JOIN contact c ON c.id = vd.contact_id
        WHERE vd.document_id = :id`,
        {
          replacements: { id },
          type: sequelize.QueryTypes.SELECT
        }
      );
    } catch (error) {
      console.error(`[getLivraisonById] Erreur vente_document:`, error.message);
      livraisonDocumentRows = [];
    }

    const livraisonDocument = Array.isArray(livraisonDocumentRows) && livraisonDocumentRows.length > 0
      ? livraisonDocumentRows[0]
      : null;

    if (!livraisonDocument) {
      return null;
    }

    livraison = livraisonDocument;
    source = 'vente_document';
  }

  if (!livraison) {
    return null;
  }

  const documentId = livraison.id;

  // Récupérer les détails de la livraison depuis stock_detail
  let details = [];
  try {
    const detailRows = await sequelize.query(
      `SELECT 
        sd.id, 
        sd.id AS detail_id, 
        sd.stock_id AS document_id, 
        sd.article_id, 
        sd.quantite AS qte, 
        sd.prix AS pu, 
        sd.taux_tva AS tva,
        sd.remise,
        sd.remise_montant,
        sd.quantite * sd.prix AS ht,
        (sd.quantite * sd.prix) * sd.taux_tva AS tva_montant,
        (sd.quantite * sd.prix) + ((sd.quantite * sd.prix) * sd.taux_tva) AS ttc,
        sd.description,
        a.article_nom
      FROM stock_detail sd
      LEFT JOIN article a ON a.article_id = sd.article_id
      WHERE sd.stock_id = :id
      ORDER BY sd.id DESC`,
      {
        replacements: { id: documentId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    details = Array.isArray(detailRows) ? detailRows : [];
  } catch (error) {
    console.error(`[getLivraisonById] Erreur lors de la récupération des détails depuis stock_detail:`, error);
    details = [];
  }

  // Fallback si aucun détail dans stock_detail -> vente_document_detail
  if ((!Array.isArray(details) || details.length === 0) && source !== 'stock') {
    let detailsVdRows = [];
    let needRawFallback = false;
    try {
      detailsVdRows = await sequelize.query(
        `SELECT
          vdd.detail_id AS id,
          vdd.detail_id,
          vdd.document_id,
          vdd.article_id,
          vdd.quantite AS qte,
          vdd.pu,
          vdd.remise,
          vdd.remise_montant AS remise_montant,
          vdd.ht,
          vdd.tva,
          vdd.ttc,
          vdd.description,
          a.article_nom
        FROM vente_document_detail vdd
        LEFT JOIN article a ON a.article_id = vdd.article_id
        WHERE vdd.document_id = :id
        ORDER BY vdd.detail_id DESC`,
        {
          replacements: { id: documentId },
          type: sequelize.QueryTypes.SELECT
        }
      );
    } catch (error) {
      const messages = [];
      if (error?.message) messages.push(error.message);
      if (error?.parent?.message) messages.push(error.parent.message);
      if (Array.isArray(error?.parent?.errors)) {
        for (const err of error.parent.errors) {
          if (err?.message) messages.push(err.message);
        }
      }
      const combined = messages.join(' | ');

      if (combined.includes("Invalid column name 'remise_montant'")) {
        try {
          detailsVdRows = await sequelize.query(
            `SELECT
              vdd.detail_id AS id,
              vdd.detail_id,
              vdd.document_id,
              vdd.article_id,
              vdd.quantite AS qte,
              vdd.pu,
              vdd.remise,
              NULL AS remise_montant,
              vdd.ht,
              vdd.tva,
              vdd.ttc,
              vdd.description,
              a.article_nom
            FROM vente_document_detail vdd
            LEFT JOIN article a ON a.article_id = vdd.article_id
            WHERE vdd.document_id = :id
            ORDER BY vdd.detail_id DESC`,
            {
              replacements: { id: documentId },
              type: sequelize.QueryTypes.SELECT
            }
          );
        } catch (error2) {
          console.error('[getLivraisonById] Fallback vente_document_detail error:', combined);
          needRawFallback = true;
        }
      } else if (combined.includes("Invalid column name")) {
        console.error('[getLivraisonById] Fallback vente_document_detail error:', combined);
        needRawFallback = true;
      } else {
        throw error;
      }
    }

    if (needRawFallback) {
      let rawRows = [];
      try {
        rawRows = await sequelize.query(
          `SELECT *
           FROM vente_document_detail
           WHERE document_id = :id
           ORDER BY detail_id DESC`,
          {
            replacements: { id: documentId },
            type: sequelize.QueryTypes.SELECT
          }
        );
      } catch (rawError) {
        console.error('[getLivraisonById] Raw fallback vente_document_detail error:', rawError?.message || rawError);
        rawRows = [];
      }

      const mappedRows = (Array.isArray(rawRows) ? rawRows : []).map(row => {
        if (!row || typeof row !== 'object') {
          return {
            id: null,
            detail_id: null,
            document_id: documentId,
            article_id: null,
            qte: 0,
            pu: 0,
            remise: null,
            remise_montant: null,
            ht: 0,
            tva: 0,
            ttc: 0,
            description: '',
            article_nom: ''
          };
        }

        const entries = Object.entries(row).reduce((acc, [key, value]) => {
          if (!key) {
            return acc;
          }
          const normalizedKey = key.toLowerCase();
          acc[normalizedKey] = value;
          return acc;
        }, {});

        const quantite = Number(entries.quantite ?? entries.qte ?? entries.qty ?? entries.quantite) || 0;
        const prix = Number(entries.pu ?? entries.prix ?? entries.price) || 0;
        const htCalcul = quantite * prix;

        return {
          id: entries.detail_id ?? entries.id ?? null,
          detail_id: entries.detail_id ?? entries.id ?? null,
          document_id: entries.document_id ?? documentId ?? null,
          article_id: entries.article_id ?? entries.art_id ?? null,
          qte: quantite,
          pu: prix,
          remise: entries.remise ?? null,
          remise_montant: entries.remise_montant ?? null,
          ht: entries.ht ?? htCalcul,
          tva: entries.tva ?? entries.taux_tva ?? 0,
          ttc: entries.ttc ?? (htCalcul + (entries.tva ?? 0)),
          description: entries.description ?? '',
          article_nom: entries.article_nom ?? entries.designation ?? ''
        };
      });

      details = mappedRows;
    } else {
      details = Array.isArray(detailsVdRows) ? detailsVdRows : [];
    }
  }

  const clientId = livraison.part_id;

  // Harmoniser la structure des détails pour le frontend
  const normalizedDetails = (Array.isArray(details) ? details : []).map((detail, index) => {
    const articleId = detail.article_id ?? null;
    const prix = detail.pu ?? detail.prix ?? 0;
    const quantite = detail.qte ?? detail.quantite ?? 0;
    const taux_tva = detail.tva ?? detail.taux_tva ?? 0;
    const designation = detail.description ?? detail.designation ?? detail.article_nom ?? '';

    const isStockSource = source === 'stock';
    let remiseMode = null;
    let remiseFraction = null;
    let remiseMontant = null;

    if (isStockSource) {
      const remiseMontantStock = detail.remise_montant != null && detail.remise_montant !== undefined ? Number(detail.remise_montant) : null;
      const remiseFractionStock = detail.remise != null && detail.remise !== undefined ? Number(detail.remise) : null;

      if (detail.remise_montant != null && detail.remise_montant !== undefined && (detail.remise === null || detail.remise === undefined)) {
        remiseMode = 'montant';
        remiseMontant = remiseMontantStock !== null && !isNaN(remiseMontantStock) ? remiseMontantStock : 0;
        remiseFraction = null;
      } else if (detail.remise != null && detail.remise !== undefined && (detail.remise_montant === null || detail.remise_montant === undefined)) {
        remiseMode = 'pourcentage';
        remiseFraction = remiseFractionStock !== null && !isNaN(remiseFractionStock) ? remiseFractionStock : 0;
        remiseMontant = null;
      } else {
        remiseFraction = remiseFractionStock !== null && !isNaN(remiseFractionStock) ? remiseFractionStock : 0;
        remiseMontant = remiseMontantStock !== null && !isNaN(remiseMontantStock) ? remiseMontantStock : 0;
        remiseMode = null;
      }
    } else {
      const remiseMontantDoc = detail.remise_montant != null && detail.remise_montant !== undefined ? Number(detail.remise_montant) : null;
      const remiseFractionDoc = detail.remise != null && detail.remise !== undefined ? Number(detail.remise) : null;

      if (detail.remise_montant != null && detail.remise_montant !== undefined && (detail.remise === null || detail.remise === undefined)) {
        remiseMode = 'montant';
        remiseMontant = remiseMontantDoc !== null && !isNaN(remiseMontantDoc) ? remiseMontantDoc : 0;
        remiseFraction = null;
      } else if (detail.remise != null && detail.remise !== undefined && (detail.remise_montant === null || detail.remise_montant === undefined)) {
        remiseMode = 'pourcentage';
        remiseFraction = remiseFractionDoc !== null && !isNaN(remiseFractionDoc) ? remiseFractionDoc : 0;
        remiseMontant = null;
      } else {
        remiseFraction = remiseFractionDoc !== null && !isNaN(remiseFractionDoc) ? remiseFractionDoc : 0;
        remiseMontant = remiseMontantDoc !== null && !isNaN(remiseMontantDoc) ? remiseMontantDoc : 0;
        remiseMode = null;
      }
    }

    const rawRemiseMontant = remiseMontant;
    const rawRemisePercent = remiseFraction;
    return {
      id: detail.id ?? detail.detail_id ?? null,
      detail_id: detail.detail_id ?? detail.id ?? null,
      document_id: detail.document_id ?? documentId,
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
      remise: rawRemisePercent,
      remise_montant: rawRemiseMontant,
      remise_mode: remiseMode,
      ht: detail.ht ?? prix * quantite,
      ttc: detail.ttc ?? (prix * quantite) * (1 + (taux_tva || 0))
    };
  });

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
        selectFields.push(`p.${column} AS [${alias}]`);
      } else {
        selectFields.push(`NULL AS [${alias}]`);
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

  const result = {
    ...livraison,
    document_id: documentId,
    part_id: livraison.part_id,
    contact_id: livraison.contact_id ?? livraison.employe_id ?? null,
    client: livraison.client_nom || null,
    commercial: livraison.commercial_nom || null,
    client_nom: livraison.client_nom || null,
    commercial_nom: livraison.commercial_nom || null,
    source,
    details: Array.isArray(normalizedDetails) ? normalizedDetails : [],
    clientInfo: clientInfo || null
  };

  return result;
};

// Ajouter une nouvelle livraison dans stock (pour transfert depuis commande)
const addLivraisonFromCommande = async ({ numero, date, description, part_id, contact_id, type = 2, etat = 1, parent = null }, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getCompteurCurrent } = require('../../services/compteur.service');

  // Utiliser une transaction pour garantir l'atomicité
  return await sequelize.transaction(async (t) => {
    try {
      // Si le numéro n'est pas fourni, le générer depuis le compteur BLC
      let numeroFinal = numero;
      if (!numeroFinal || numeroFinal.trim() === '') {
        // Récupérer le compteur actuel (sans l'incrémenter)
        const compteurActuel = await getCompteurCurrent('BLC', sequelize);
        if (compteurActuel === null || compteurActuel === undefined) {
          throw new Error('Impossible de récupérer le compteur BLC');
        }

        // Formater le numéro
        const anneeCourte = new Date().getFullYear().toString().slice(2);
        numeroFinal = `BL${anneeCourte}-${compteurActuel.toString().padStart(4, '0')}`;
      }

      // Construire la requête dynamiquement selon les champs fournis
      let columns = 'numero, date, description, part_id, employe_id, type, etat';
      let values = ':numero, :date, :description, :part_id, :employe_id, :type, :etat';
      let replacements = {
        numero: numeroFinal,
        date: date || null,
        description: description || null,
        part_id: part_id || null,
        employe_id: contact_id || null,
        type: type || 2,
        etat: etat || 1
      };

      // Ajouter parent si fourni
      if (parent !== undefined && parent !== null) {
        columns += ', parent';
        values += ', :parent';
        replacements.parent = parent;
      }

      // Ajouter l'incrémentation du compteur dans la même transaction si le numéro a été généré
      let query;
      if (!numero || numero.trim() === '') {
        query = `
          INSERT INTO stock (${columns})
          OUTPUT INSERTED.id
          VALUES (${values});
          UPDATE compteur SET compteur = compteur + 1 WHERE LTRIM(RTRIM(code)) = 'BLC';
        `;
      } else {
        query = `
          INSERT INTO stock (${columns})
          OUTPUT INSERTED.id
          VALUES (${values})
        `;
      }

      const [results] = await sequelize.query(query, {
        replacements,
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      });

      let stock_id;

      if (Array.isArray(results)) {
        if (results.length > 0) {
          if (typeof results[0] === 'object' && results[0].id) {
            stock_id = results[0].id;
          } else if (typeof results[0] === 'number') {
            stock_id = results[0];
          } else {
            stock_id = results[0];
          }
        }
      } else if (typeof results === 'object' && results.id) {
        stock_id = results.id;
      } else if (typeof results === 'number') {
        stock_id = results;
      }

      if (!stock_id) {
        const [fallbackResults] = await sequelize.query(
          'SELECT TOP 1 id FROM stock ORDER BY id DESC',
          { type: sequelize.QueryTypes.SELECT, transaction: t }
        );
        if (fallbackResults && fallbackResults.id) {
          stock_id = fallbackResults.id;
        }
      }

      return stock_id;
    } catch (error) {
      console.error('❌ Erreur lors de la création de la livraison dans stock:', error);
      // Le rollback sera automatique grâce à la transaction
      throw new Error(`Erreur lors de l'ajout de la livraison: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Sauvegarder les détails dans stock_detail (pour transfert depuis commande) avec transaction
const saveDetailStock = async (detail, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  const stock_id = detail.stock_id || detail.document_id || null;
  const article_id = detail.article_id || null;
  const quantite = detail.qte || detail.quantite || 0;
  const prix = detail.pu || detail.prix || 0;
  const taux_tva = detail.tva || detail.taux_tva || 0;
  const description = detail.description || '';
  // Préserver null pour indiquer le mode de réduction
  // Si la propriété existe (même si null), l'utiliser. Sinon, utiliser 0 par défaut pour compatibilité
  const remise = detail.hasOwnProperty('remise') ? (detail.remise !== undefined ? detail.remise : null) : 0;
  const remise_montant = detail.hasOwnProperty('remise_montant') ? (detail.remise_montant !== undefined ? detail.remise_montant : null) : 0;
  const sens = detail.sens != null ? detail.sens : -1;

  // Préparer les valeurs - convertir null en 0 pour éviter les problèmes avec SQL Server
  let remiseValue = remise;
  let remiseMontantValue = remise_montant;

  // Si undefined ou null, convertir en 0
  if (remiseValue === undefined || remiseValue === null) remiseValue = 0;
  if (remiseMontantValue === undefined || remiseMontantValue === null) remiseMontantValue = 0;

  // Limiter la description à 200 caractères pour éviter la troncature SQL
  const descriptionLimited = (description || '').substring(0, 200);

  // Utiliser une requête simple avec paramètres
  const query = `
    INSERT INTO stock_detail (stock_id, article_id, quantite, prix, taux_tva, description, sens, remise, remise_montant)
    OUTPUT INSERTED.id
    VALUES (:stock_id, :article_id, :quantite, :prix, :taux_tva, :description, :sens, :remise, :remise_montant)
  `;

  const replacements = {
    stock_id: stock_id,
    article_id: article_id,
    quantite: quantite,
    prix: prix,
    taux_tva: taux_tva,
    description: descriptionLimited,
    sens: sens,
    remise: remiseValue || 0, // Toujours 0 si null/undefined
    remise_montant: remiseMontantValue || 0 // Toujours 0 si null/undefined
  };

  // Utiliser une transaction pour garantir le rollback en cas d'erreur
  return await sequelize.transaction(async (t) => {
    try {
      const [results] = await sequelize.query(query, {
        replacements: replacements,
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      });

      let detail_id;

      if (Array.isArray(results)) {
        if (results.length > 0) {
          if (typeof results[0] === 'object' && results[0].id) {
            detail_id = results[0].id;
          } else if (typeof results[0] === 'number') {
            detail_id = results[0];
          } else {
            detail_id = results[0];
          }
        }
      } else if (typeof results === 'object' && results.id) {
        detail_id = results.id;
      } else if (typeof results === 'number') {
        detail_id = results;
      }

      if (!detail_id) {
        const [fallbackResults] = await sequelize.query(
          'SELECT TOP 1 id FROM stock_detail ORDER BY id DESC',
          { type: sequelize.QueryTypes.SELECT, transaction: t }
        );
        if (fallbackResults && fallbackResults.id) {
          detail_id = fallbackResults.id;
        }
      }

      return detail_id;
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde du détail dans stock_detail:', error);
      console.error('❌ Détails de l\'erreur:', {
        message: error.message,
        stack: error.stack,
        detail: { stock_id, remise, remise_montant }
      });
      // Le rollback sera automatique grâce à la transaction
      throw new Error(`Erreur lors de la sauvegarde du détail: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Mettre à jour un détail de stock_detail
const updateDetailStock = async (id, detail, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  // Préparer les valeurs - convertir null en 0 pour éviter les problèmes avec SQL Server
  let remiseValue = detail.remise;
  let remiseMontantValue = detail.remise_montant;

  // Si undefined ou null, convertir en 0
  if (remiseValue === undefined || remiseValue === null) remiseValue = 0;
  if (remiseMontantValue === undefined || remiseMontantValue === null) remiseMontantValue = 0;

  // Limiter la description à 200 caractères pour éviter la troncature SQL
  const descriptionLimited = (detail.description || '').substring(0, 200);

  // Utiliser une requête simple avec paramètres
  const query = `
    UPDATE stock_detail
    SET article_id = :article_id,
        quantite = :quantite,
        prix = :prix,
        taux_tva = :taux_tva,
        description = :description,
        remise = :remise,
        remise_montant = :remise_montant
    WHERE id = :id
  `;

  // Préparer les replacements - utiliser 0 au lieu de null
  const replacements = {
    id: id,
    article_id: detail.article_id || null,
    quantite: detail.quantite || 0,
    prix: detail.prix || 0,
    taux_tva: detail.taux_tva || 0,
    description: descriptionLimited,
    remise: remiseValue || 0, // Toujours 0 si null/undefined
    remise_montant: remiseMontantValue || 0 // Toujours 0 si null/undefined
  };

  try {
    await sequelize.query(query, {
      replacements: replacements
    });
    return id;
  } catch (error) {
    console.error('[updateDetailStock] Erreur:', error.message);
    throw error;
  }
};

// Ajouter une nouvelle livraison (ancienne méthode - pour compatibilité) avec transaction
const addLivraison = async ({ date, description, part_id, contact_id, date_fin, etat = 3, type = 3, parent = null }, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  // Utiliser une transaction pour garantir le rollback en cas d'erreur
  return await sequelize.transaction(async (t) => {
    try {
      // Construire la requête dynamiquement
      let columns = 'date, description, part_id, contact_id, date_fin, etat';
      let values = ':date, :description, :part_id, :contact_id, :date_fin, :etat';
      let replacements = {
        date: date || null,
        description: description || null,
        part_id: part_id || null,
        contact_id: contact_id || null,
        date_fin: date_fin || null,
        etat: etat || 3
      };

      // Ajouter type et parent si fournis
      if (type !== undefined && type !== null) {
        columns += ', type';
        values += ', :type';
        replacements.type = type;
      }

      if (parent !== undefined && parent !== null) {
        columns += ', parent';
        values += ', :parent';
        replacements.parent = parent;
      }

      const query = `
        INSERT INTO vente_document (${columns})
        OUTPUT INSERTED.document_id
        VALUES (${values})
      `;

      const [results] = await sequelize.query(query, {
        replacements,
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      });

      let document_id;

      // Gérer différents formats de retour selon la version de Sequelize/SQL Server
      if (Array.isArray(results)) {
        if (results.length > 0) {
          if (typeof results[0] === 'object' && results[0].document_id) {
            document_id = results[0].document_id;
          } else if (typeof results[0] === 'number') {
            document_id = results[0];
          } else {
            document_id = results[0];
          }
        }
      } else if (typeof results === 'object' && results.document_id) {
        document_id = results.document_id;
      } else if (typeof results === 'number') {
        document_id = results;
      }

      // Fallback: si document_id n'est pas trouvé, faire une requête SELECT
      if (!document_id) {
        const [fallbackResults] = await sequelize.query(
          'SELECT TOP 1 document_id FROM vente_document ORDER BY document_id DESC',
          { type: sequelize.QueryTypes.SELECT, transaction: t }
        );
        if (fallbackResults && fallbackResults.document_id) {
          document_id = fallbackResults.document_id;
        }
      }

      return document_id;
    } catch (error) {
      console.error('❌ Erreur lors de la création de la livraison:', error);
      // Le rollback sera automatique grâce à la transaction
      throw new Error(`Erreur lors de l'ajout de la livraison: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Sauvegarder les détails d'une livraison
const saveDetail = async (detail, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  const document_id = detail.document_id || null;
  const article_id = detail.article_id || null;
  const qte = detail.qte || 0;
  const pu = detail.pu || 0;
  const remise = detail.remise || 0;
  const remise_montant = detail.remise_montant || 0;
  const ht = detail.ht || 0;
  const tva = detail.tva || 0;
  const ttc = detail.ttc || 0;
  const description = detail.description || '';

  const query = `
    INSERT INTO vente_document_detail 
    (document_id, article_id, qte, pu, remise, remise_montant, ht, tva, ttc, description)
    OUTPUT INSERTED.detail_id
    VALUES (:document_id, :article_id, :qte, :pu, :remise, :remise_montant, :ht, :tva, :ttc, :description)
  `;

  try {
    const [results] = await sequelize.query(query, {
      replacements: {
        document_id: document_id || null,
        article_id: article_id || null,
        qte: qte || 0,
        pu: pu || 0,
        remise: remise || 0,
        remise_montant: remise_montant || 0,
        ht: ht || 0,
        tva: tva || 0,
        ttc: ttc || 0,
        description: description || ''
      },
      type: sequelize.QueryTypes.INSERT
    });

    let detail_id;

    if (Array.isArray(results)) {
      if (results.length > 0) {
        if (typeof results[0] === 'object' && results[0].detail_id) {
          detail_id = results[0].detail_id;
        } else if (typeof results[0] === 'number') {
          detail_id = results[0];
        } else {
          detail_id = results[0];
        }
      }
    } else if (typeof results === 'object' && results.detail_id) {
      detail_id = results.detail_id;
    } else if (typeof results === 'number') {
      detail_id = results;
    }

    // Fallback
    if (!detail_id) {
      const [fallbackResults] = await sequelize.query(
        'SELECT TOP 1 detail_id FROM vente_document_detail ORDER BY detail_id DESC',
        { type: sequelize.QueryTypes.SELECT }
      );
      if (fallbackResults && fallbackResults.detail_id) {
        detail_id = fallbackResults.detail_id;
      }
    }

    return detail_id;
  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde du détail:', error);
    throw error;
  }
};

// Sauvegarder les informations Quill d'une livraison
const saveInfo = async (info, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  const document_id = info.document_id || null;
  const conditions = info.conditions || '';
  const note = info.note || '';

  const query = `
    IF EXISTS (SELECT 1 FROM vente_document_quill WHERE document_id = :document_id)
      UPDATE vente_document_quill 
      SET conditions = :conditions, note = :note
      WHERE document_id = :document_id
    ELSE
      INSERT INTO vente_document_quill (document_id, conditions, note)
      VALUES (:document_id, :conditions, :note)
  `;

  await sequelize.query(query, {
    replacements: {
      document_id: document_id || null,
      conditions: conditions || '',
      note: note || ''
    }
  });
};

// Mettre à jour une livraison (dans la table stock)
const updateLivraison = async (id, { date, description, part_id, contact_id, date_fin }, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  await sequelize.query(
    `UPDATE stock 
     SET date = :date, description = :description, part_id = :part_id, 
         contact_id = :contact_id, date_fin = :date_fin
     WHERE id = :id`,
    {
      replacements: { id, date, description, part_id, contact_id, date_fin }
    }
  );
};

// Supprimer une livraison
const deleteLivraison = async (ids, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('IDs invalides pour la suppression');
  }

  // Supprimer les détails
  await sequelize.query(
    `DELETE FROM vente_document_detail WHERE document_id IN (${ids.map(() => '?').join(',')})`,
    { replacements: ids }
  );

  // Supprimer les infos Quill
  await sequelize.query(
    `DELETE FROM vente_document_quill WHERE document_id IN (${ids.map(() => '?').join(',')})`,
    { replacements: ids }
  );

  // Supprimer la livraison
  await sequelize.query(
    `DELETE FROM vente_document WHERE document_id IN (${ids.map(() => '?').join(',')})`,
    { replacements: ids }
  );
};

// Supprimer des lignes de détail par IDs (dans stock_detail)
const deleteLignesParIds = async (ligneIds, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  if (!Array.isArray(ligneIds) || ligneIds.length === 0) {
    throw new Error('IDs de lignes invalides pour la suppression');
  }

  await sequelize.query(
    `DELETE FROM stock_detail WHERE id IN (${ligneIds.map(() => '?').join(',')})`,
    { replacements: ligneIds }
  );
};

const saveDetailLines = async (lignes, sequelizeConnection = null) => {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return [];
  }

  const results = [];

  for (const ligne of lignes) {
    try {
      const stockId = ligne?.stock_id ?? ligne?.document_id ?? null;
      if (!stockId) {
        results.push({
          id: ligne?.id ?? null,
          update_mode: ligne?.update_mode ?? null,
          success: false,
          error: 'stock_id manquant'
        });
        continue;
      }

      const articleId = ligne?.article_id ?? null;
      const quantite = Number(ligne?.qte ?? ligne?.quantite) || 0;
      const prix = Number(ligne?.pu ?? ligne?.prix) || 0;
      const tauxTva = ligne?.tva != null
        ? Number(ligne.tva)
        : (ligne?.taux_tva != null ? Number(ligne.taux_tva) : 0);
      const description = ligne?.designation ?? ligne?.description ?? '';
      const sens = ligne?.sens != null ? Number(ligne.sens) : -1;

      // Détecter le mode basé sur les valeurs envoyées par le frontend
      // Le frontend envoie soit remise (pourcentage décimal) avec remise_montant = null
      // Soit remise_montant (montant) avec remise = null
      const remiseValue = ligne?.remise;
      const remiseMontantValue = ligne?.remise_montant;

      let remiseFraction = 0;
      let remiseMontant = 0;
      let detectedMode = null;

      // Déterminer le mode de remise
      if (remiseMontantValue !== null && remiseMontantValue !== undefined && (remiseValue === null || remiseValue === undefined)) {
        detectedMode = 'montant';
        remiseMontant = remiseMontantValue === null || remiseMontantValue === undefined ? 0 : Number(remiseMontantValue);
        if (isNaN(remiseMontant)) remiseMontant = 0;
        remiseFraction = 0;
      }
      else if (remiseValue !== null && remiseValue !== undefined && (remiseMontantValue === null || remiseMontantValue === undefined)) {
        detectedMode = 'pourcentage';
        remiseFraction = remiseValue === null || remiseValue === undefined ? 0 : Number(remiseValue);
        if (!isNaN(remiseFraction) && remiseFraction > 1) {
          remiseFraction = remiseFraction / 100;
        }
        if (isNaN(remiseFraction)) remiseFraction = 0;
        remiseMontant = 0;
      }
      else if (remiseMontantValue !== null && remiseMontantValue !== undefined) {
        detectedMode = 'montant';
        remiseMontant = Number(remiseMontantValue);
        if (isNaN(remiseMontant)) remiseMontant = 0;
        remiseFraction = 0;
      }
      else {
        remiseFraction = 0;
        remiseMontant = 0;
      }

      // Validation finale
      if (Number.isNaN(remiseFraction) || remiseFraction < 0) {
        remiseFraction = 0;
      }
      if (Number.isNaN(remiseMontant) || remiseMontant < 0) {
        remiseMontant = 0;
      }

      const payload = {
        stock_id: stockId,
        document_id: stockId,
        article_id: articleId,
        qte: quantite,
        quantite,
        pu: prix,
        prix,
        tva: tauxTva,
        taux_tva: tauxTva,
        description,
        sens,
        // S'assurer que null est explicitement défini et non undefined
        remise: remiseFraction !== undefined ? remiseFraction : null,
        remise_montant: remiseMontant !== undefined ? remiseMontant : null
      };

      if (ligne?.update_mode === 'U' && ligne?.id) {
        await updateDetailStock(ligne.id, payload, sequelizeConnection);
        results.push({ id: ligne.id, update_mode: 'U', success: true, remise_mode: detectedMode });
      } else if (ligne?.update_mode === 'D' && ligne?.id) {
        await deleteLignesParIds([ligne.id], sequelizeConnection);
        results.push({ id: ligne.id, update_mode: 'D', success: true, remise_mode: detectedMode });
      } else {
        const insertedId = await saveDetailStock(payload, sequelizeConnection);
        console.log(`[saveDetailLines] ✅ Nouvelle ligne ${insertedId} insérée avec succès`);
        results.push({ id: insertedId, update_mode: 'I', success: true, remise_mode: detectedMode });
      }
    } catch (error) {
      console.error('Erreur lors du traitement d’une ligne stock_detail :', error);
      results.push({
        id: ligne?.id ?? null,
        update_mode: ligne?.update_mode ?? null,
        success: false,
        error: error.message || 'Erreur inconnue'
      });
    }
  }

  return results;
};

// Récupérer les données de la livraison pour la popup de confirmation
const getLivraisonDataForTransfer = async (stockId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const [results] = await sequelize.query(
      `SELECT 
        s.id,
        s.date,
        s.part_id,
        p.nom AS client_nom,
        p.part_id AS client_id
      FROM stock s
      LEFT JOIN partenaire p ON p.part_id = s.part_id
      WHERE s.id = :stockId`,
      {
        replacements: { stockId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!results || (Array.isArray(results) && results.length === 0)) {
      throw new Error('Livraison non trouvée');
    }

    const livraison = Array.isArray(results) ? results[0] : results;

    return {
      id: livraison.id,
      date: livraison.date,
      part_id: livraison.part_id,
      client_nom: livraison.client_nom || '',
      client_id: livraison.client_id
    };
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des données de livraison:', error);
    throw error;
  }
};

// Transférer une livraison vers la facturation
const transfererLivraisonVersFacturation = async (stockId, factureDate, partId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getCompteurCurrent } = require('../../services/compteur.service');

  // Valider que stockId est un nombre
  const stockIdNum = parseInt(stockId, 10);
  if (isNaN(stockIdNum) || stockIdNum <= 0) {
    throw new Error('stockId invalide');
  }

  // Valider que partId est un nombre
  const partIdNum = parseInt(partId, 10);
  if (isNaN(partIdNum) || partIdNum <= 0) {
    throw new Error('partId invalide');
  }

  // Valider la date
  if (!factureDate) {
    throw new Error('La date de facture est requise');
  }

  // 1. Récupérer le compteur FA actuel SANS l'incrémenter (en dehors de la transaction)
  const compteurFA = await getCompteurCurrent('FA');
  if (compteurFA === null || compteurFA === undefined) {
    throw new Error('Impossible de récupérer le compteur FA');
  }

  // 2. Formater le numéro de facture avec le compteur
  const anneeCourte = new Date(factureDate).getFullYear().toString().slice(2);
  const factureNum = `FA${anneeCourte}-${compteurFA.toString().padStart(4, '0')}`;


  // Utiliser sequelize.transaction() pour gérer la transaction correctement
  return await sequelize.transaction(async (t) => {
    try {
      // Récupérer l'adresse_id depuis stock
      const [stockData] = await sequelize.query(
        `SELECT adresse_id FROM stock WHERE id = :stockId`,
        {
          replacements: { stockId: stockIdNum },
          type: sequelize.QueryTypes.SELECT,
          transaction: t
        }
      );

      const adresseId = stockData && (Array.isArray(stockData) ? stockData[0]?.adresse_id : stockData.adresse_id);

      // 1. Créer d'abord l'entrée dans facture_souche (auto-incrémenté) avec sens = 1
      const adresseIdParam = adresseId || null;
      const insertFactureSoucheQuery = `
        INSERT INTO facture_souche (part_id, adresse_id, sens)
        OUTPUT INSERTED.facture_id
        VALUES (:partId, :adresseId, 1)
      `;

      const [factureSoucheResult] = await sequelize.query(insertFactureSoucheQuery, {
        replacements: {
          partId: partIdNum,
          adresseId: adresseIdParam
        },
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      });

      // Récupérer le facture_id auto-généré
      let factureId = null;
      if (Array.isArray(factureSoucheResult) && factureSoucheResult.length > 0) {
        factureId = factureSoucheResult[0].facture_id;
      } else if (factureSoucheResult && factureSoucheResult.facture_id) {
        factureId = factureSoucheResult.facture_id;
      }

      if (!factureId) {
        throw new Error('Erreur lors de la création de facture_souche : facture_id non récupéré');
      }

      // 2. Créer la facture avec le facture_id récupéré
      const insertFactureQuery = `
        INSERT INTO facture (facture_id, facture_ind, facture_num, facture_dat, facture_typ, facture_ht, facture_tva)
        VALUES (:factureId, 1, :factureNum, :factureDate, 'FA', 0, 0);
        UPDATE stock SET facture_id = :factureId WHERE id = :stockId;
        UPDATE compteur SET compteur = compteur + 1 WHERE LTRIM(RTRIM(code)) = 'FA';
      `;

      // Exécuter la requête avec le facture_id récupéré
      await sequelize.query(insertFactureQuery, {
        replacements: {
          factureId: factureId,
          factureNum: factureNum,
          factureDate: factureDate,
          stockId: stockIdNum
        },
        transaction: t
      });


      return {
        success: true,
        stockId: stockIdNum,
        factureId: factureId,
        factureNum: factureNum,
        message: 'Livraison transférée vers facturation avec succès'
      };

    } catch (error) {
      console.error('❌ Erreur lors du transfert livraison vers facturation:', error);
      throw new Error(`Erreur lors du transfert: ${error.message}`);
    }
  });
};

// Transférer une commande vers facturation (crée deux fois dans stock/stock_detail ET dans facture/facture_souche)
const transfererCommandeVersFacturation = async (commandeId, factureDate, partId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getCompteurFormate, getCompteurCurrent } = require('../../services/compteur.service');

  // Valider que commandeId est un nombre
  const commandeIdNum = parseInt(commandeId, 10);
  if (isNaN(commandeIdNum) || commandeIdNum <= 0) {
    throw new Error('commandeId invalide');
  }

  // Valider que partId est un nombre
  const partIdNum = parseInt(partId, 10);
  if (isNaN(partIdNum) || partIdNum <= 0) {
    throw new Error('partId invalide');
  }

  // Valider la date
  if (!factureDate) {
    throw new Error('La date de facture est requise');
  }

  // Utiliser une transaction pour garantir la cohérence
  return await sequelize.transaction(async (t) => {
    try {
      // 1. Récupérer la commande originale depuis vente_document
      const [commandeResults] = await sequelize.query(
        'SELECT * FROM vente_document WHERE document_id = :id',
        {
          replacements: { id: commandeIdNum },
          type: sequelize.QueryTypes.SELECT,
          transaction: t
        }
      );

      if (!commandeResults || (Array.isArray(commandeResults) && commandeResults.length === 0)) {
        throw new Error('Commande non trouvée');
      }

      const commandeData = Array.isArray(commandeResults) ? commandeResults[0] : commandeResults;

      // 2. Récupérer les détails de la commande
      const details = await sequelize.query(
        'SELECT * FROM vente_document_detail WHERE document_id = :id',
        {
          replacements: { id: commandeIdNum },
          type: sequelize.QueryTypes.SELECT,
          transaction: t
        }
      );

      if (!Array.isArray(details) || details.length === 0) {
        throw new Error('Aucun détail trouvé pour cette commande');
      }

      // 3. Générer les numéros de livraison (deux fois) - en dehors de la transaction car cela incrémente le compteur
      // Note: On doit générer les numéros avant la transaction pour éviter les problèmes de sérialisation
      const numeroLivraison1 = await getCompteurFormate('BLC', 'BL');
      const numeroLivraison2 = await getCompteurFormate('BLC', 'BL');


      // 4. Créer la première livraison dans stock (dans la transaction)
      const insertStock1 = await sequelize.query(
        `INSERT INTO stock (numero, date, description, part_id, employe_id, type, etat, parent)
         OUTPUT INSERTED.id
         VALUES (:numero, :date, :description, :part_id, :employe_id, 2, 1, :parent)`,
        {
          replacements: {
            numero: numeroLivraison1,
            date: commandeData.date || factureDate,
            description: commandeData.description,
            part_id: partIdNum,
            employe_id: commandeData.contact_id,
            parent: commandeIdNum
          },
          type: sequelize.QueryTypes.INSERT,
          transaction: t
        }
      );

      let stockId1 = null;
      const result1 = Array.isArray(insertStock1) ? insertStock1[0] : insertStock1;
      if (Array.isArray(result1) && result1.length > 0) {
        stockId1 = result1[0].id || result1[0];
      } else if (result1 && result1.id) {
        stockId1 = result1.id;
      } else if (typeof result1 === 'number') {
        stockId1 = result1;
      }

      if (!stockId1) {
        throw new Error('Erreur lors de la création de la première livraison : ID non récupéré');
      }

      // 5. Créer la deuxième livraison dans stock (dans la transaction)
      const insertStock2 = await sequelize.query(
        `INSERT INTO stock (numero, date, description, part_id, employe_id, type, etat, parent)
         OUTPUT INSERTED.id
         VALUES (:numero, :date, :description, :part_id, :employe_id, 2, 1, :parent)`,
        {
          replacements: {
            numero: numeroLivraison2,
            date: commandeData.date || factureDate,
            description: commandeData.description,
            part_id: partIdNum,
            employe_id: commandeData.contact_id,
            parent: commandeIdNum
          },
          type: sequelize.QueryTypes.INSERT,
          transaction: t
        }
      );

      let stockId2 = null;
      const result2 = Array.isArray(insertStock2) ? insertStock2[0] : insertStock2;
      if (Array.isArray(result2) && result2.length > 0) {
        stockId2 = result2[0].id || result2[0];
      } else if (result2 && result2.id) {
        stockId2 = result2.id;
      } else if (typeof result2 === 'number') {
        stockId2 = result2;
      }

      if (!stockId2) {
        throw new Error('Erreur lors de la création de la deuxième livraison : ID non récupéré');
      }


      // 6. Copier les détails dans stock_detail pour la première livraison
      for (const detail of details) {
        await sequelize.query(
          `INSERT INTO stock_detail (stock_id, article_id, quantite, prix, taux_tva, description, sens, remise, remise_montant)
           VALUES (:stock_id, :article_id, :quantite, :prix, :taux_tva, :description, -1, :remise, :remise_montant)`,
          {
            replacements: {
              stock_id: stockId1,
              article_id: detail.article_id,
              quantite: detail.quantite || detail.qte || 0,
              prix: detail.prix || detail.pu || 0,
              taux_tva: detail.taux_tva || detail.tva || 0,
              description: detail.description || '',
              remise: detail.remise || 0,
              remise_montant: detail.remise_montant || 0
            },
            type: sequelize.QueryTypes.INSERT,
            transaction: t
          }
        );
      }

      // 7. Copier les détails dans stock_detail pour la deuxième livraison
      for (const detail of details) {
        await sequelize.query(
          `INSERT INTO stock_detail (stock_id, article_id, quantite, prix, taux_tva, description, sens, remise, remise_montant)
           VALUES (:stock_id, :article_id, :quantite, :prix, :taux_tva, :description, -1, :remise, :remise_montant)`,
          {
            replacements: {
              stock_id: stockId2,
              article_id: detail.article_id,
              quantite: detail.quantite || detail.qte || 0,
              prix: detail.prix || detail.pu || 0,
              taux_tva: detail.taux_tva || detail.tva || 0,
              description: detail.description || '',
              remise: detail.remise || 0,
              remise_montant: detail.remise_montant || 0
            },
            type: sequelize.QueryTypes.INSERT,
            transaction: t
          }
        );
      }


      // 8. Générer le numéro de facture
      const compteurFA = await getCompteurCurrent('FA');
      if (compteurFA === null || compteurFA === undefined) {
        throw new Error('Impossible de récupérer le compteur FA');
      }

      const anneeCourte = new Date(factureDate).getFullYear().toString().slice(2);
      const factureNum = `FA${anneeCourte}-${compteurFA.toString().padStart(4, '0')}`;

      // 9. Créer la facture dans facture_souche et facture

      // Récupérer l'adresse_id depuis la commande ou partenaire
      const [partenaireData] = await sequelize.query(
        `SELECT TOP 1 adresse_id FROM partenaire WHERE part_id = :partId`,
        {
          replacements: { partId: partIdNum },
          type: sequelize.QueryTypes.SELECT,
          transaction: t
        }
      );

      const adresseId = partenaireData && (Array.isArray(partenaireData) ? partenaireData[0]?.adresse_id : partenaireData.adresse_id);

      // 9.1 Créer d'abord l'entrée dans facture_souche (auto-incrémenté) avec sens = 1
      const insertFactureSoucheQuery = `
        INSERT INTO facture_souche (part_id, adresse_id, sens)
        OUTPUT INSERTED.facture_id
        VALUES (:partId, :adresseId, 1)
      `;

      const [factureSoucheResult] = await sequelize.query(insertFactureSoucheQuery, {
        replacements: {
          partId: partIdNum,
          adresseId: adresseId || null
        },
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      });

      // Récupérer le facture_id auto-généré
      let factureId = null;
      if (Array.isArray(factureSoucheResult) && factureSoucheResult.length > 0) {
        factureId = factureSoucheResult[0].facture_id;
      } else if (factureSoucheResult && factureSoucheResult.facture_id) {
        factureId = factureSoucheResult.facture_id;
      }

      if (!factureId) {
        throw new Error('Erreur lors de la création de facture_souche : facture_id non récupéré');
      }

      // 9.2 Créer la facture avec le facture_id récupéré
      const insertFactureQuery = `
        INSERT INTO facture (facture_id, facture_ind, facture_num, facture_dat, facture_typ, facture_ht, facture_tva)
        VALUES (:factureId, 1, :factureNum, :factureDate, 'FA', 0, 0);
        UPDATE stock SET facture_id = :factureId WHERE id = :stockId1;
        UPDATE compteur SET compteur = compteur + 1 WHERE LTRIM(RTRIM(code)) = 'FA';
      `;

      await sequelize.query(insertFactureQuery, {
        replacements: {
          factureId: factureId,
          factureNum: factureNum,
          factureDate: factureDate,
          stockId1: stockId1
        },
        transaction: t
      });


      return {
        success: true,
        commandeId: commandeIdNum,
        stockId1: stockId1,
        stockId2: stockId2,
        numeroLivraison1: numeroLivraison1,
        numeroLivraison2: numeroLivraison2,
        factureId: factureId,
        factureNum: factureNum,
        message: 'Commande transférée vers facturation avec succès (2 livraisons + 1 facture créées)'
      };

    } catch (error) {
      console.error('❌ Erreur lors du transfert commande vers facturation:', error);
      throw new Error(`Erreur lors du transfert: ${error.message}`);
    }
  });
};

module.exports = {
  getAllLivraisons,
  countAllLivraisons,
  getAllCommandesNonLivrees,
  getLivraisonById,
  getLivraisonDataForTransfer,
  addLivraison,
  addLivraisonFromCommande,
  saveDetail,
  saveDetailStock,
  saveDetailLines,
  updateDetailStock,
  saveInfo,
  updateLivraison,
  deleteLivraison,
  deleteLignesParIds,
  transfererLivraisonVersFacturation,
  transfererCommandeVersFacturation
};

