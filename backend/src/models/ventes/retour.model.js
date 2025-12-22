const { getConnection } = require('../../config/database');

// Récupérer tous les retours avec pagination (type = 5)
// Optimisé avec COUNT(*) OVER() pour éviter une requête séparée de comptage
const getAllRetours = async (options = {}, sequelizeConnection = null) => {
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

    let whereClause = 'WHERE s.type = 5';
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
        part_id,
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
          s.part_id,
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
      console.error('[getAllRetours] Erreur:', queryError.message);
      throw new Error(`Erreur lors de la récupération des retours: ${queryError.message || 'Erreur inconnue'}`);
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
    console.error('[getAllRetours] Erreur:', error.message);
    throw error;
  }
};

// Compter le total des retours
const countAllRetours = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const [result] = await sequelize.query('SELECT COUNT(*) AS total FROM stock WHERE type = 5');

    if (Array.isArray(result) && result.length > 0) {
      return result[0].total || 0;
    } else if (result && result.total !== undefined) {
      return result.total;
    }
    return 0;
  } catch (error) {
    console.error('[countAllRetours] Erreur:', error.message);
    return 0;
  }
};

// Récupérer un retour par ID
const getRetourById = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  // Récupérer les infos principales depuis stock
  const retourRows = await sequelize.query(
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
    WHERE s.id = :id AND s.type = 5`,
    {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    }
  );

  let retour = Array.isArray(retourRows) && retourRows.length > 0
    ? retourRows[0]
    : null;

  if (!retour) {
    return null;
  }

  const documentId = retour.id;

  // Récupérer les détails du retour depuis stock_detail
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

  let details = Array.isArray(detailRows) ? detailRows : [];

  const clientId = retour.part_id;

  // Harmoniser la structure des détails pour le frontend
  const normalizedDetails = (Array.isArray(details) ? details : []).map(detail => {
    const articleId = detail.article_id ?? null;
    const prix = detail.pu ?? detail.prix ?? 0;
    const quantite = detail.qte ?? detail.quantite ?? 0;
    const taux_tva = detail.tva ?? detail.taux_tva ?? 0;
    const designation = detail.description ?? detail.designation ?? detail.article_nom ?? '';

    // Pour les retours, pas de réduction - toujours 0
    const remiseFractionStock = detail.remise != null ? Number(detail.remise) : 0;

    let remiseMode = 'montant';
    let remiseFraction = 0;
    let remiseMontant = 0;

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
      remise: remiseFraction,
      remise_montant: 0,
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
    ...retour,
    document_id: documentId,
    part_id: retour.part_id,
    contact_id: retour.contact_id ?? retour.employe_id ?? null,
    client: retour.client_nom || null,
    commercial: retour.commercial_nom || null,
    client_nom: retour.client_nom || null,
    commercial_nom: retour.commercial_nom || null,
    source: 'stock',
    details: normalizedDetails,
    clientInfo: clientInfo || null
  };
};

// Ajouter un nouveau retour dans stock (type = 5)
const addRetourFromCommande = async ({ numero, date, description, part_id, contact_id, type = 5, etat = 1, parent = null }, sequelizeConnection = null) => {
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
        numeroFinal = `RT${anneeCourte}-${compteurActuel.toString().padStart(4, '0')}`;
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
        type: type || 5,
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
      console.error('[addRetourFromCommande] Erreur:', error.message);
      throw new Error(`Erreur lors de l'ajout du retour: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Sauvegarder les détails dans stock_detail avec transaction
const saveDetailStock = async (detail, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  const stock_id = detail.stock_id || detail.document_id || null;
  const article_id = detail.article_id || null;
  const quantite = detail.qte || detail.quantite || 0;
  const prix = detail.pu || detail.prix || 0;
  const taux_tva = detail.tva || detail.taux_tva || 0;
  const description = detail.description || '';
  // Pour les retours, pas de réduction - toujours 0
  const remise = 0;
  const sens = detail.sens != null ? detail.sens : 1;

  // Utiliser une transaction pour garantir le rollback en cas d'erreur
  return await sequelize.transaction(async (t) => {
    try {
      const query = `
        INSERT INTO stock_detail (stock_id, article_id, quantite, prix, taux_tva, description, sens, remise)
        OUTPUT INSERTED.id
        VALUES (:stock_id, :article_id, :quantite, :prix, :taux_tva, :description, :sens, :remise)
      `;

      const [results] = await sequelize.query(query, {
        replacements: {
          stock_id: stock_id,
          article_id: article_id,
          quantite: quantite,
          prix: prix,
          taux_tva: taux_tva,
          description: description,
          sens: sens,
          remise: remise
        },
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
      console.error('[saveDetailStock] Erreur:', error.message);
      throw new Error(`Erreur lors de la sauvegarde du détail: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Mettre à jour un détail de stock_detail
const updateDetailStock = async (id, detail, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  // Pour les retours, pas de réduction - toujours 0
  const query = `
    UPDATE stock_detail
    SET article_id = :article_id,
        quantite = :quantite,
        prix = :prix,
        taux_tva = :taux_tva,
        description = :description,
        remise = :remise
    WHERE id = :id
  `;

  try {
    await sequelize.query(query, {
      replacements: {
        id: id,
        article_id: detail.article_id || null,
        quantite: detail.quantite || 0,
        prix: detail.prix || 0,
        taux_tva: detail.taux_tva || 0,
        description: detail.description || '',
        remise: 0
      }
    });

    return id;
  } catch (error) {
    console.error('[updateDetailStock] Erreur:', error.message);
    throw error;
  }
};

// Sauvegarder les informations Quill d'un retour
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

// Mettre à jour un retour (dans la table stock)
const updateRetour = async (id, { date, description, part_id, contact_id, date_fin }, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  await sequelize.query(
    `UPDATE stock 
     SET date = :date, description = :description, part_id = :part_id, 
         employe_id = :contact_id, date_fin = :date_fin
     WHERE id = :id AND type = 5`,
    {
      replacements: { id, date, description, part_id, contact_id, date_fin }
    }
  );
};

// Supprimer un retour
const deleteRetour = async (ids, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('IDs invalides pour la suppression');
  }

  // Supprimer les détails
  await sequelize.query(
    `DELETE FROM stock_detail WHERE stock_id IN (${ids.map(() => '?').join(',')})`,
    { replacements: ids }
  );

  // Supprimer les infos Quill
  await sequelize.query(
    `DELETE FROM vente_document_quill WHERE document_id IN (${ids.map(() => '?').join(',')})`,
    { replacements: ids }
  );

  // Supprimer le retour
  await sequelize.query(
    `DELETE FROM stock WHERE id IN (${ids.map(() => '?').join(',')}) AND type = 5`,
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
      // Pour les retours, sens = 1 par défaut (entrée)
      const sens = ligne?.sens != null ? Number(ligne.sens) : 1;

      // Pour les retours, pas de réduction - toujours 0
      const remiseFraction = 0;

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
        sens: sens,
        remise: remiseFraction
      };

      if (ligne?.update_mode === 'U' && ligne?.id) {
        await updateDetailStock(ligne.id, payload, sequelizeConnection);
        results.push({ id: ligne.id, update_mode: 'U', success: true });
      } else if (ligne?.update_mode === 'D' && ligne?.id) {
        await deleteLignesParIds([ligne.id], sequelizeConnection);
        results.push({ id: ligne.id, update_mode: 'D', success: true });
      } else {
        const insertedId = await saveDetailStock(payload, sequelizeConnection);
        results.push({ id: insertedId, update_mode: 'I', success: true });
      }
    } catch (error) {
      console.error('Erreur lors du traitement d\'une ligne stock_detail :', error);
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

module.exports = {
  getAllRetours,
  countAllRetours,
  getRetourById,
  addRetourFromCommande,
  saveDetailStock,
  saveDetailLines,
  updateDetailStock,
  saveInfo,
  updateRetour,
  deleteRetour,
  deleteLignesParIds
};

