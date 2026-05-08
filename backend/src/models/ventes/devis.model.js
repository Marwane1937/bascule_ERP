const sequelize = require('../../config/database');
const {
  BASE_QUILL_TABLE,
  COMMANDE_QUILL_TABLE,
  getVenteDocumentQuillTable,
  getVenteDocumentQuillCandidates,
  loadQuillRowsByDocument,
  mergeDetailsWithQuill,
  upsertQuillDesignation,
  deleteQuillRowsByIds
} = require('./quill-table.helper');
const {
  buildFlatComponentLines,
  toFiniteNumber
} = require('../../utils/nomenclature.helper');


const formatToSqlDateTime = (value) => {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }

  let dateStr = String(value).trim();
  if (!dateStr) return null;

  // datetime-local / ISO -> SQL datetime
  if (dateStr.includes('T')) {
    dateStr = dateStr.replace('Z', '').replace('T', ' ');
  }

  // yyyy-MM-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return `${dateStr} 00:00:00`;
  }

  // yyyy-MM-dd HH:mm
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(dateStr)) {
    return `${dateStr}:00`;
  }

  // yyyy-MM-dd HH:mm:ss(.fff)
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(dateStr)) {
    return dateStr;
  }

  // fallback parsing
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
  }

  return dateStr;
};

const getTableColumnSet = async (connectionToUse, tableName) => {
  const cols = await connectionToUse.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = :tableName
    `,
    {
      replacements: { tableName },
      type: connectionToUse.QueryTypes.SELECT
    }
  );
  return new Set((Array.isArray(cols) ? cols : []).map((c) => String(c.COLUMN_NAME || '').toLowerCase()));
};

const getDocumentTypeById = async (connectionToUse, documentId) => {
  const rows = await connectionToUse.query(
    `SELECT TOP 1 type FROM vente_document WHERE document_id = :documentId`,
    {
      replacements: { documentId },
      type: connectionToUse.QueryTypes.SELECT
    }
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return rows[0]?.type ?? null;
};

// Récupérer tous les devis avec pagination (optimisé pour les performances)
// Utilise COUNT(*) OVER() pour éviter une requête séparée de comptage
const getAllDevis = async (options = {}, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'document_id',
      orderDirection = 'DESC',
      search = '',
      dateFrom = '',
      dateTo = ''
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;
    const colSet = await getTableColumnSet(connectionToUse, 'vente_document');
    const depotExpr = colSet.has('depot_id') && colSet.has('adresse_id')
      ? 'COALESCE(vd.depot_id, vd.adresse_id)'
      : (colSet.has('depot_id') ? 'vd.depot_id' : (colSet.has('adresse_id') ? 'vd.adresse_id' : null));
    const depotSelect = depotExpr ? 'w.nom AS depot' : 'NULL AS depot';
    const warehouseJoin = depotExpr ? `LEFT OUTER JOIN warehouse w ON w.id = ${depotExpr}` : '';

    const columnMapping = {
      'document_id': 'vd.document_id',
      'numero': 'vd.numero',
      'date': 'vd.date',
      'description': 'vd.description',
      'client': 'p.nom',
      'commercial': 'c.nom'
    };

    const finalColumnMapping = {
      'document_id': 'document_id',
      'numero': 'numero',
      'date': 'date',
      'description': 'description',
      'client': 'client',
      'commercial': 'commercial'
    };

    const validColumns = ['document_id', 'numero', 'date', 'client', 'commercial', 'description'];
    const mappedColumn = validColumns.includes(orderBy) ? (columnMapping[orderBy] || 'vd.date') : 'vd.date';
    const finalOrderColumn = validColumns.includes(orderBy) ? (finalColumnMapping[orderBy] || 'date') : 'date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = 'WHERE vd.type = 1';
    const replacements = {};

    if (search && search.trim()) {
      whereClause += ` AND (
        vd.numero LIKE :search 
        OR p.nom LIKE :search
        OR c.nom LIKE :search
        OR vd.description LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    if (dateFrom && dateFrom.trim()) {
      whereClause += ` AND vd.date >= :dateFrom`;
      replacements.dateFrom = dateFrom.trim();
    }

    if (dateTo && dateTo.trim()) {
      whereClause += ` AND vd.date <= :dateTo`;
      replacements.dateTo = dateTo.trim();
    }

    // Requête unique avec COUNT(*) OVER() pour obtenir le total sans requête séparée
    const query = `
      SELECT 
        document_id,
        numero,
        date,
        description,
        client,
        commercial,
        total_count
      FROM (
        SELECT 
          vd.document_id,
          vd.numero,
          vd.date,
          vd.description,
          p.nom AS client,
          c.nom AS commercial,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${mappedColumn} ${safeOrderDirection}) AS RowNum
        FROM vente_document vd
        LEFT OUTER JOIN partenaire p ON p.part_id = vd.part_id
        LEFT OUTER JOIN contact c ON c.id = vd.contact_id
        ${whereClause}
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY ${finalOrderColumn} ${safeOrderDirection}
    `;

    let results = [];
    let total = 0;

    try {
      const queryResult = await connectionToUse.query(query, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: connectionToUse.QueryTypes.SELECT
      });

      if (Array.isArray(queryResult)) {
        results = queryResult;
      } else if (queryResult && typeof queryResult === 'object') {
        results = [queryResult];
      }

      // Extraire le total depuis la première ligne (total_count est identique pour toutes les lignes)
      if (results.length > 0) {
        total = results[0].total_count || 0;
        // Supprimer total_count des résultats pour ne pas polluer les données
        results = results.map(({ total_count, ...rest }) => rest);
      }
    } catch (queryError) {
      console.error('[getAllDevis] Erreur:', queryError.message);
      throw new Error(`Erreur lors de la récupération des devis: ${queryError.message || 'Erreur inconnue'}`);
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
    console.error('[getAllDevis] Erreur:', error.message);
    throw error;
  }
};

// Récupérer toutes les commandes avec pagination (optimisé pour les performances)
// Utilise COUNT(*) OVER() pour éviter une requête séparée de comptage
const getAllCommande = async (options = {}, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'date',
      orderDirection = 'DESC',
      search = ''
    } = options;

    const safePage = parseInt(page, 10) || 1;
    const safePageSize = parseInt(pageSize, 10) || 25;
    const offset = (safePage - 1) * safePageSize;
    const venteDetailColSet = await getTableColumnSet(connectionToUse, 'vente_document_detail');
    const stockDocDetailColSet = await getTableColumnSet(connectionToUse, 'stock_document_detail');
    const venteQuantiteExpr = venteDetailColSet.has('quantite')
      ? 'vdd.quantite'
      : (venteDetailColSet.has('qte') ? 'vdd.qte' : '0');
    const stockDocQuantiteExpr = stockDocDetailColSet.has('quantite')
      ? 'sdd.quantite'
      : (stockDocDetailColSet.has('qte') ? 'sdd.qte' : '0');

    const columnMapping = {
      document_id: 'vc.document_id',
      numero: 'vc.numero',
      date: 'vc.date',
      client: 'vc.client',
      depot: 'vc.depot',
      montant_ht: 'vc.Montant_HT',
      montant_tva: 'vc.Montant_TVA',
      montant_ttc: 'vc.Montant_TTC',
      status: 'vc.Status',
      progression_preparation: 'CASE WHEN ISNULL(ct.quantite_demandee, 0) > 0 THEN ROUND((ISNULL(pt.quantite_preparee, 0) * 100.0) / NULLIF(ct.quantite_demandee, 0), 2) ELSE 0 END'
    };

    const finalColumnMapping = {
      document_id: 'document_id',
      numero: 'numero',
      date: 'date',
      client: 'client',
      depot: 'depot',
      montant_ht: 'montant_ht',
      montant_tva: 'montant_tva',
      montant_ttc: 'montant_ttc',
      status: 'status',
      progression_preparation: 'progression_preparation'
    };

    const validColumns = ['document_id', 'numero', 'date', 'client', 'depot', 'montant_ht', 'montant_tva', 'montant_ttc', 'status', 'progression_preparation'];
    const mappedColumn = validColumns.includes(orderBy) ? (columnMapping[orderBy] || 'vc.date') : 'vc.date';
    const finalOrderColumn = validColumns.includes(orderBy) ? (finalColumnMapping[orderBy] || 'date') : 'date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = 'WHERE 1=1';
    const replacements = {};

    if (search && search.trim()) {
      whereClause += ` AND (
        vc.numero LIKE :search
        OR vc.client LIKE :search
        OR vc.depot LIKE :search
        OR vc.Status LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    const query = `
      WITH commande_totals AS (
        SELECT
          vdd.document_id,
          SUM(ISNULL(${venteQuantiteExpr}, 0)) AS quantite_demandee
        FROM vente_document_detail vdd
        GROUP BY vdd.document_id
      ),
      preparation_totals AS (
        SELECT
          prep.parent AS commande_id,
          SUM(ISNULL(${stockDocQuantiteExpr}, 0)) AS quantite_preparee
        FROM stock_document prep
        INNER JOIN stock_document_detail sdd ON sdd.stock_id = prep.id
        WHERE prep.type = 10
          AND prep.parent IS NOT NULL
        GROUP BY prep.parent
      )
      SELECT
        document_id,
        numero,
        date,
        client,
        depot,
        montant_ht,
        montant_tva,
        montant_ttc,
        status,
        quantite_demandee_preparation,
        quantite_preparee_preparation,
        progression_preparation,
        total_count
      FROM (
        SELECT
          vc.document_id,
          vc.numero,
          vc.date,
          vc.client,
          vc.depot,
          vc.Montant_HT AS montant_ht,
          vc.Montant_TVA AS montant_tva,
          vc.Montant_TTC AS montant_ttc,
          vc.Status AS status,
          ISNULL(ct.quantite_demandee, 0) AS quantite_demandee_preparation,
          ISNULL(pt.quantite_preparee, 0) AS quantite_preparee_preparation,
          CASE
            WHEN ISNULL(ct.quantite_demandee, 0) > 0
              THEN ROUND((ISNULL(pt.quantite_preparee, 0) * 100.0) / NULLIF(ct.quantite_demandee, 0), 2)
            ELSE 0
          END AS progression_preparation,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${mappedColumn} ${safeOrderDirection}) AS RowNum
        FROM v_commande vc
        LEFT JOIN commande_totals ct ON ct.document_id = vc.document_id
        LEFT JOIN preparation_totals pt ON pt.commande_id = vc.document_id
        ${whereClause}
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY ${finalOrderColumn} ${safeOrderDirection}
    `;

    let results = [];
    let total = 0;

    try {
      const queryResult = await connectionToUse.query(query, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: connectionToUse.QueryTypes.SELECT
      });

      if (Array.isArray(queryResult)) {
        results = queryResult;
      } else {
        results = queryResult ? [queryResult] : [];
      }

      if (results.length > 0) {
        total = results[0].total_count || 0;
        results = results.map(({ total_count, ...rest }) => rest);
      }
    } catch (queryError) {
      console.error('[getAllCommande] Erreur:', queryError.message);
      throw new Error(`Erreur lors de la recuperation des commandes: ${queryError.message || 'Erreur inconnue'}`);
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
    console.error('[getAllCommande] Erreur:', error.message);
    throw error;
  }
};

// Récupérer un devis par ID
const getDevisById = async (id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;

  try {
    // Récupérer les infos principales du devis
    const colSet = await getTableColumnSet(connectionToUse, 'vente_document');
    const depotExpr = colSet.has('depot_id') && colSet.has('adresse_id')
      ? 'COALESCE(vd.depot_id, vd.adresse_id)'
      : (colSet.has('depot_id') ? 'vd.depot_id' : (colSet.has('adresse_id') ? 'vd.adresse_id' : null));
    const depotIdSelect = depotExpr ? `${depotExpr} AS depot_id` : 'NULL AS depot_id';
    const depotNomSelect = depotExpr ? 'w.nom AS depot_nom' : 'NULL AS depot_nom';
    const warehouseJoin = depotExpr ? `LEFT JOIN warehouse w ON w.id = ${depotExpr}` : '';
    const queryResult = await connectionToUse.query(
      `SELECT
         vd.document_id,
         vd.numero,
         vd.date,
         vd.description,
         vd.type,
         vd.etat,
         vd.part_id,
         vd.contact_id,
         ${depotIdSelect},
         ${depotNomSelect}
       FROM vente_document vd
       ${warehouseJoin}
       WHERE vd.document_id = :id`,
      {
        replacements: { id },
        type: connectionToUse.QueryTypes.SELECT,
      }
    );

    let devis;
    if (Array.isArray(queryResult)) {
      if (queryResult.length === 2 && Array.isArray(queryResult[0]) && !Array.isArray(queryResult[1])) {
        devis = queryResult[0][0];
      } else if (queryResult.length > 0) {
        devis = queryResult[0];
      } else {
        devis = null;
      }
    } else if (queryResult && typeof queryResult === 'object') {
      devis = queryResult;
    } else {
      devis = null;
    }

    if (!devis) {
      return null;
    }

    const partId = devis.part_id;

    // Récupérer les détails du devis
    let details = [];
    try {
      const detailColSet = await getTableColumnSet(connectionToUse, 'vente_document_detail');
      const hasLigneColumn = detailColSet.has('ligne');
      const hasDetailTypeColumn = detailColSet.has('type');
      const detailLigneSelect = hasLigneColumn ? ', d.ligne' : '';
      const detailTypeSelect = hasDetailTypeColumn ? ', d.type' : ', NULL AS type';
      const detailOrderBy = hasLigneColumn
        ? 'ORDER BY CASE WHEN d.ligne IS NULL THEN 1 ELSE 0 END, d.ligne ASC, d.id ASC'
        : 'ORDER BY d.id ASC';
      const detailsResult = await connectionToUse.query(
        `SELECT d.id, d.article_id, d.quantite, d.prix, d.taux_tva, d.remise, d.description, d.remise_montant${detailLigneSelect}${detailTypeSelect}
     FROM vente_document_detail d
     WHERE d.document_id = :id
     ${detailOrderBy}`,
        {
          replacements: { id },
          type: connectionToUse.QueryTypes.SELECT,
        }
      );

      if (Array.isArray(detailsResult)) {
        if (detailsResult.length === 2 && Array.isArray(detailsResult[0]) && !Array.isArray(detailsResult[1])) {
          details = detailsResult[0];
        } else {
          details = detailsResult;
        }
      } else if (detailsResult && typeof detailsResult === 'object') {
        details = [detailsResult];
      } else {
        details = [];
      }

      const quillRows = await loadQuillRowsByDocument(
        connectionToUse,
        id,
        getVenteDocumentQuillCandidates(devis.type)
      );
      details = mergeDetailsWithQuill(details, quillRows, {
        detailIdField: 'id',
        designationField: 'designation',
        fallbackFields: ['description']
      });
    } catch (detailsError) {
      console.error('[getDevisById] Erreur détails:', detailsError.message);
      details = [];
    }

    // Récupérer les infos du partenaire
    let Infos = [];
    try {
      const infosResult = await connectionToUse.query(
        `SELECT nom , telephone , email , adresse , ice , cin ,rc , IF_ , PATENTE , cnss 
     FROM v_partenaire_infos
     WHERE part_id = :partId`,
        {
          replacements: { partId },
          type: connectionToUse.QueryTypes.SELECT,
        }
      );

      if (Array.isArray(infosResult)) {
        if (infosResult.length === 2 && Array.isArray(infosResult[0]) && !Array.isArray(infosResult[1])) {
          Infos = infosResult[0];
        } else {
          Infos = infosResult;
        }
      } else if (infosResult && typeof infosResult === 'object') {
        Infos = [infosResult];
      } else {
        Infos = [];
      }
    } catch (infosError) {
      Infos = [];
    }

    // Récupérer les infos du document (condition, etc.)
    let condition = [];
    try {
      const conditionResult = await connectionToUse.query(
        `SELECT  document_id	, date ,	condition ,	expedition ,	transporteur , type	 ,etat
     FROM vente_document_info
     WHERE document_id = :id`,
        {
          replacements: { id },
          type: connectionToUse.QueryTypes.SELECT,
        }
      );

      if (Array.isArray(conditionResult)) {
        if (conditionResult.length === 2 && Array.isArray(conditionResult[0]) && !Array.isArray(conditionResult[1])) {
          condition = conditionResult[0];
        } else {
          condition = conditionResult;
        }
      } else if (conditionResult && typeof conditionResult === 'object') {
        condition = [conditionResult];
      } else {
        condition = [];
      }
    } catch (conditionError) {
      condition = [];
    }

    return {
      ...devis,
      details: details || [],
      Infos: Infos || [],
      condition: condition || []
    };
  } catch (error) {
    console.error('[getDevisById] Erreur:', error.message);
    throw error;
  }
};


// Ajouter un devis
const addDevis = async ({ numero, date, description, part_id, contact_id, etat, type }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const dateSql = formatToSqlDateTime(date);

  const [result] = await connectionToUse.query(
    `INSERT INTO vente_document (numero, date , description , part_id , contact_id , etat, type) 
     OUTPUT INSERTED.document_id 
     VALUES (:numero, :dateSql , :description , :part_id , :contact_id , :etat, :type)`,
    { 
      replacements: { numero, dateSql, description, part_id, contact_id, etat: etat !== undefined ? etat : null, type: type || 1 },
      type: connectionToUse.QueryTypes.INSERT,
    }
  );
  return result.document_id;
};

// Ajouter une commande (type=2, etat=NULL)
const addCommande = async ({ numero, date, description, part_id, contact_id, depot_id, etat, type }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const dateSql = formatToSqlDateTime(date);
  const colSet = await getTableColumnSet(connectionToUse, 'vente_document');
  const depotColumn = colSet.has('depot_id') ? 'depot_id' : (colSet.has('adresse_id') ? 'adresse_id' : null);
  const depotValue = (() => {
    const n = parseInt(depot_id, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  })();

  let columns = 'numero, date , description , part_id , contact_id , etat, type';
  let values = ':numero, :dateSql , :description , :part_id , :contact_id , NULL, :type';
  const replacements = { numero, dateSql, description, part_id, contact_id, type: type || 2 };

  if (depotColumn) {
    columns += `, ${depotColumn}`;
    values += ', :depotValue';
    replacements.depotValue = depotValue;
  }

  const [result] = await connectionToUse.query(
    `INSERT INTO vente_document (${columns})
     OUTPUT INSERTED.document_id 
     VALUES (${values})`,
    {
      replacements,
      type: connectionToUse.QueryTypes.INSERT,
    }
  );
  return result.document_id;
};

const saveDetail = async (detail, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const detailColSet = await getTableColumnSet(connectionToUse, 'vente_document_detail');
  const hasLigneColumn = detailColSet.has('ligne');
  const hasTypeColumn = detailColSet.has('type');
  const touchedDocumentIds = new Set();
  const nomenclatureParents = [];

  if (!detail || !Array.isArray(detail.lignes)) {
    console.log('Aucune ligne à traiter.');
    return;
  }

  for (const ligne of detail.lignes) {
    const {
      id,
      document_id,
      article_id,
      pu,
      qte,
      remise,
      remise_montant,
      taxe,
      ligne: detailLigne,
      designation,
      update_mode,
    } = ligne;

    const normalizedPu = pu === '' || pu === null || pu === undefined || Number.isNaN(Number(pu))
      ? 0
      : Number(pu);

    let effectiveDocumentId = document_id || null;
    if (!effectiveDocumentId && id) {
      const detailRows = await connectionToUse.query(
        `SELECT TOP 1 document_id FROM vente_document_detail WHERE id = :id`,
        {
          replacements: { id },
          type: connectionToUse.QueryTypes.SELECT
        }
      );
      effectiveDocumentId = Array.isArray(detailRows) && detailRows.length > 0
        ? detailRows[0]?.document_id || null
        : null;
    }

    const documentType = effectiveDocumentId
      ? await getDocumentTypeById(connectionToUse, effectiveDocumentId)
      : null;
    const quillTable = getVenteDocumentQuillTable(documentType);
    if (effectiveDocumentId) {
      touchedDocumentIds.add(Number(effectiveDocumentId));
    }
    let normalizedLigne = hasLigneColumn ? parseInt(detailLigne, 10) : null;
    if (!Number.isInteger(normalizedLigne) || normalizedLigne <= 0) {
      normalizedLigne = null;
    }

    if (hasLigneColumn && normalizedLigne === null && effectiveDocumentId) {
      const lineRows = await connectionToUse.query(
        `SELECT ISNULL(MAX(ligne), 0) + 1 AS next_ligne
         FROM vente_document_detail
         WHERE document_id = :document_id`,
        {
          replacements: { document_id: effectiveDocumentId },
          type: connectionToUse.QueryTypes.SELECT
        }
      );
      normalizedLigne = Array.isArray(lineRows) && lineRows.length > 0
        ? Number(lineRows[0]?.next_ligne || 1)
        : 1;
    }

    const normalizedDetailType = hasTypeColumn
      ? (Number(ligne?.type ?? ligne?.ligne_type ?? ligne?.detail_type ?? 0) === 1 ? 1 : 0)
      : null;

    if (update_mode === 'I') {
      // Insertion dans vente_document_detail
      const insertColumns = [
        'document_id',
        'article_id',
        'prix',
        'quantite',
        'remise',
        'remise_montant',
        'taux_tva'
      ];
      const insertValues = [
        ':document_id',
        ':article_id',
        ':pu',
        ':qte',
        ':remise',
        ':remise_montant',
        ':taxe'
      ];
      const insertReplacements = { document_id, article_id, pu: normalizedPu, qte, remise, remise_montant, taxe };

      if (hasLigneColumn) {
        insertColumns.push('ligne');
        insertValues.push(':ligne');
        insertReplacements.ligne = normalizedLigne;
      }

      if (hasTypeColumn) {
        insertColumns.push('type');
        insertValues.push(':detailType');
        insertReplacements.detailType = normalizedDetailType;
      }

      insertColumns.push('cr_date');
      insertValues.push('GETDATE()');

      const [result] = await connectionToUse.query(
        `INSERT INTO vente_document_detail 
         (${insertColumns.join(', ')})
         OUTPUT INSERTED.id
         VALUES (${insertValues.join(', ')})`,
        {
          replacements: insertReplacements,
          type: sequelize.QueryTypes.INSERT,
        }
      );

      const insertedDetailId = normalizeInsertedDetailId(result);
      // Insertion / mise à jour dans la table Quill du document cible
      try {
        await upsertQuillDesignation(connectionToUse, {
          tableName: quillTable,
          quillId: insertedDetailId,
          documentId: effectiveDocumentId,
          designation,
          articleId: article_id
        });
      } catch (error) {
        console.error(`Erreur lors de l’insertion dans ${quillTable}:`, error);
      }
      if (hasLigneColumn && effectiveDocumentId) {
        await syncTouchedDetailLignes(connectionToUse, [Number(effectiveDocumentId)]);
      }
      if (Number(documentType) === 2 && insertedDetailId && effectiveDocumentId) {
        nomenclatureParents.push({
          id: insertedDetailId,
          document_id: effectiveDocumentId,
          article_id,
          quantite: qte,
          prix: normalizedPu,
          taux_tva: taxe,
          ligne: normalizedLigne,
          quillTable
        });
      }

    } else if (update_mode === 'U') {
      // Update dans vente_document_detail
      const updateSets = [
        'article_id = :article_id',
        'prix = :pu',
        'quantite = :qte',
        'remise = :remise',
        'remise_montant = :remise_montant',
        'taux_tva = :taxe'
      ];
      const updateReplacements = { article_id, pu: normalizedPu, qte, remise, remise_montant, taxe, id };

      if (hasLigneColumn && normalizedLigne !== null) {
        updateSets.push('ligne = :ligne');
        updateReplacements.ligne = normalizedLigne;
      }

      if (hasTypeColumn) {
        updateSets.push('type = :detailType');
        updateReplacements.detailType = normalizedDetailType;
      }

      updateSets.push('cr_date = GETDATE()');

      await connectionToUse.query(
        `UPDATE vente_document_detail
         SET ${updateSets.join(',\n             ')}
         WHERE id = :id`,
        {
          replacements: updateReplacements,
          type: sequelize.QueryTypes.UPDATE,
        }
      );

      await upsertQuillDesignation(connectionToUse, {
        tableName: quillTable,
        quillId: id,
        documentId: effectiveDocumentId,
        designation,
        articleId: article_id
      });

      if (hasLigneColumn && effectiveDocumentId) {
        await syncTouchedDetailLignes(connectionToUse, [Number(effectiveDocumentId)]);
      }
      if (Number(documentType) === 2 && id && effectiveDocumentId) {
        nomenclatureParents.push({
          id,
          document_id: effectiveDocumentId,
          article_id,
          quantite: qte,
          prix: normalizedPu,
          taux_tva: taxe,
          ligne: normalizedLigne,
          quillTable
        });
      }
    } else {
      console.warn(`Ligne ignorée : update_mode invalide (${update_mode})`);
    }
  }

  console.log('Tous les détails ont été traités.');
  await syncVenteDocumentNomenclatureComponents(connectionToUse, nomenclatureParents, hasLigneColumn);
  if (hasLigneColumn && touchedDocumentIds.size > 0) {
    await syncTouchedDetailLignes(connectionToUse, Array.from(touchedDocumentIds));
  }
};

const syncTouchedDetailLignes = async (connectionToUse, touchedDocumentIds) => {
    for (const documentId of touchedDocumentIds) {
      const orderedRows = await connectionToUse.query(
        `SELECT id, ligne
         FROM vente_document_detail
         WHERE document_id = :document_id
         ORDER BY CASE WHEN ligne IS NULL THEN 1 ELSE 0 END, ligne ASC, id ASC`,
        {
          replacements: { document_id: documentId },
          type: connectionToUse.QueryTypes.SELECT
        }
      );

      for (let index = 0; index < orderedRows.length; index++) {
        const row = orderedRows[index];
        const expectedLigne = index + 1;
        if (Number(row?.ligne || 0) === expectedLigne) {
          continue;
        }

        await connectionToUse.query(
          `UPDATE vente_document_detail
           SET ligne = :ligne
           WHERE id = :id`,
          {
            replacements: { id: row.id, ligne: expectedLigne },
            type: connectionToUse.QueryTypes.UPDATE
          }
        );
      }
    }
};

const normalizeInsertedDetailId = (result) => {
  if (Array.isArray(result)) {
    const first = result[0];
    if (Array.isArray(first)) {
      return first[0]?.id || first[0]?.detail_id || first[0] || null;
    }
    return first?.id || first?.detail_id || first || null;
  }

  return result?.id || result?.detail_id || (typeof result === 'number' ? result : null);
};

const syncVenteDocumentNomenclatureComponents = async (connectionToUse, parents = [], hasLigneColumn = false) => {
  if (!Array.isArray(parents) || parents.length === 0) {
    return;
  }

  const detailColSet = await getTableColumnSet(connectionToUse, 'vente_document_detail');
  const hasTypeColumn = detailColSet.has('type');
  const parentRows = [];
  for (const parent of parents) {
    const componentLines = await buildFlatComponentLines(connectionToUse, parent);
    if (!Array.isArray(componentLines) || componentLines.length === 0) {
      continue;
    }

    const rows = await connectionToUse.query(
      `SELECT TOP 1 id, document_id, article_id, ligne
       FROM vente_document_detail
       WHERE id = :id`,
      {
        replacements: { id: parent.id },
        type: connectionToUse.QueryTypes.SELECT
      }
    );
    const dbParent = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!dbParent?.id || !dbParent?.document_id) {
      continue;
    }

    parentRows.push({
      ...parent,
      id: dbParent.id,
      document_id: dbParent.document_id,
      ligne: Number(dbParent.ligne || parent.ligne || 0),
      componentLines
    });
  }

  parentRows.sort((a, b) => Number(b.ligne || 0) - Number(a.ligne || 0));

  for (const parent of parentRows) {
    const documentId = Number(parent.document_id || 0);
    const parentLine = Number(parent.ligne || 0);
    const components = parent.componentLines;
    if (!documentId || !parentLine || components.length === 0) {
      continue;
    }

    const followingRows = await connectionToUse.query(
      `SELECT id, article_id, ligne${hasTypeColumn ? ', type' : ''}
       FROM vente_document_detail
       WHERE document_id = :document_id
         AND id <> :parent_id
         AND ligne > :parent_line
       ORDER BY ligne ASC, id ASC`,
      {
        replacements: {
          document_id: documentId,
          parent_id: parent.id,
          parent_line: parentLine
        },
        type: connectionToUse.QueryTypes.SELECT
      }
    );

    const consumedIds = [];
    let cursor = 0;
    for (const component of components) {
      const candidate = followingRows[cursor];
      const candidateType = hasTypeColumn && candidate?.type !== null && candidate?.type !== undefined
        ? Number(candidate.type)
        : null;
      if (
        !candidate
        || (candidateType !== null && candidateType !== 1)
        || Number(candidate.article_id || 0) !== Number(component.article_id || 0)
      ) {
        break;
      }
      consumedIds.push(candidate.id);
      cursor += 1;
    }

    if (consumedIds.length > 0) {
      await deleteQuillRowsByIds(connectionToUse, [parent.quillTable || COMMANDE_QUILL_TABLE], consumedIds);
      await connectionToUse.query(
        `DELETE FROM vente_document_detail WHERE id IN (${consumedIds.map(() => '?').join(',')})`,
        {
          replacements: consumedIds,
          type: connectionToUse.QueryTypes.DELETE
        }
      );
    }

    if (hasLigneColumn) {
      await connectionToUse.query(
        `UPDATE vente_document_detail
         SET ligne = ligne + :offset
         WHERE document_id = :document_id
           AND ligne > :parent_line`,
        {
          replacements: {
            offset: components.length,
            document_id: documentId,
            parent_line: parentLine
          },
          type: connectionToUse.QueryTypes.UPDATE
        }
      );
    }

    for (let index = 0; index < components.length; index++) {
      const component = components[index];
      const insertColumns = [
        'document_id',
        'article_id',
        'prix',
        'quantite',
        'remise',
        'remise_montant',
        'taux_tva'
      ];
      const insertValues = [
        ':document_id',
        ':article_id',
        ':prix',
        ':quantite',
        ':remise',
        ':remise_montant',
        ':taux_tva'
      ];
      const replacements = {
        document_id: documentId,
        article_id: component.article_id,
        prix: toFiniteNumber(component.prix ?? component.pu, 0),
        quantite: toFiniteNumber(component.quantite ?? component.qte, 0),
        remise: 0,
        remise_montant: 0,
        taux_tva: toFiniteNumber(component.taux_tva ?? component.tva ?? parent.taux_tva, 0)
      };

      if (hasLigneColumn) {
        insertColumns.push('ligne');
        insertValues.push(':ligne');
        replacements.ligne = parentLine + index + 1;
      }

      if (hasTypeColumn) {
        insertColumns.push('type');
        insertValues.push('1');
      }

      insertColumns.push('cr_date');
      insertValues.push('GETDATE()');

      const [insertResult] = await connectionToUse.query(
        `INSERT INTO vente_document_detail
         (${insertColumns.join(', ')})
         OUTPUT INSERTED.id
         VALUES (${insertValues.join(', ')})`,
        {
          replacements,
          type: connectionToUse.QueryTypes.INSERT
        }
      );

      const insertedId = normalizeInsertedDetailId(insertResult);
      if (insertedId) {
        await upsertQuillDesignation(connectionToUse, {
          tableName: parent.quillTable || COMMANDE_QUILL_TABLE,
          quillId: insertedId,
          documentId,
          designation: component.designation || component.description || '',
          articleId: component.article_id
        });
      }
    }
  }
};

const saveInfo = async (info) => {
  console.log('info', info);

  if (!info || !info.document_id) {
    console.log('Aucune info valide à traiter.');
    return;
  }

  const { document_id, date, condition, expedition, transporteur } = info;

  try {
    // 1️⃣ Vérifier si une ligne existe déjà
    const [countResult] = await sequelize.query(
      `SELECT COUNT(document_id) AS count
       FROM vente_document_info
       WHERE document_id = :document_id`,
      {
        replacements: { document_id },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const count = countResult?.count || 0;

    if (count === 0) {
      // 2️⃣ Aucun enregistrement → INSERT
      await sequelize.query(
        `INSERT INTO vente_document_info
         (document_id, date, condition, expedition, transporteur)
         VALUES (:document_id, :date, :condition, :expedition, :transporteur)`,
        {
          replacements: { document_id, date, condition, expedition, transporteur },
          type: sequelize.QueryTypes.INSERT,
        }
      );
      console.log('Insertion effectuée dans vente_document_info.');
    } else {
      // 3️⃣ Déjà existant → UPDATE
      await sequelize.query(
        `UPDATE vente_document_info
         SET date = :date,
             condition = :condition,
             expedition = :expedition,
             transporteur = :transporteur
         WHERE document_id = :document_id`,
        {
          replacements: { document_id, date, condition, expedition, transporteur },
          type: sequelize.QueryTypes.UPDATE,
        }
      );
      console.log('Mise à jour effectuée dans vente_document_info.');
    }

  } catch (error) {
    console.error('Erreur lors de saveInfo :', error);
  }
};


// Modifier un client
const updateDevis = async (id, { date, description, part_id, contact_id, depot_id }) => {
  const dateSql = formatToSqlDateTime(date);
  const colSet = await getTableColumnSet(sequelize, 'vente_document');
  const depotColumn = colSet.has('depot_id') ? 'depot_id' : (colSet.has('adresse_id') ? 'adresse_id' : null);
  const depotValue = (() => {
    const n = parseInt(depot_id, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  })();

  let setClause = `
     date = :dateSql , description = :description , part_id = :part_id ,
     contact_id = :contact_id
  `;
  const replacements = { id, dateSql, description, part_id, contact_id };

  if (depotColumn) {
    setClause += `,\n     ${depotColumn} = :depotValue`;
    replacements.depotValue = depotValue;
  }

  await sequelize.query(
    `UPDATE vente_document 
     SET ${setClause}
     WHERE document_id = :id`,
    {
      replacements,
      type: sequelize.QueryTypes.UPDATE,
    }
  );

  // 2. Récupérer les infos du client mis à jour
  const [infosClient] = await sequelize.query(
    `SELECT nom , telephone , email , adresse , ice , cin ,rc , IF_ , PATENTE , cnss 
     FROM v_partenaire_infos 
     WHERE part_id = :part_id`,
    {
      replacements: { part_id },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  return { id, date, description, part_id, contact_id, depot_id: depotValue, client_infos: infosClient || null };
};

// Supprimer les DEVIS
const deleteDevis = async (ids) => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) return;

  const placeholders = ids.map(() => '?').join(',');


  await sequelize.query(
    `DELETE FROM vente_document WHERE document_id IN (${placeholders})`,
    {
      replacements: ids,
      type: sequelize.QueryTypes.DELETE,
    }
  );
};

// Supprimer les lignes de détails et quill
const deleteDetailsAndQuill = async (ids) => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) return;

  const detailColSet = await getTableColumnSet(sequelize, 'vente_document_detail');
  let idsToDelete = [...ids];
  const touchedDocumentIds = new Set();

  if (detailColSet.has('type') && detailColSet.has('ligne')) {
    const rows = await sequelize.query(
      `SELECT id, document_id, ligne, type
       FROM vente_document_detail
       WHERE id IN (${ids.map(() => '?').join(',')})`,
      {
        replacements: ids,
        type: sequelize.QueryTypes.SELECT
      }
    );

    for (const row of Array.isArray(rows) ? rows : []) {
      const documentId = Number(row?.document_id || 0);
      const parentLine = Number(row?.ligne || 0);
      if (!documentId) {
        continue;
      }
      touchedDocumentIds.add(documentId);
      if (!parentLine || Number(row?.type || 0) === 1) {
        continue;
      }

      const nextRows = await sequelize.query(
        `SELECT MIN(ligne) AS next_ligne
         FROM vente_document_detail
         WHERE document_id = :documentId
           AND ligne > :parentLine
           AND ISNULL(type, 0) <> 1`,
        {
          replacements: { documentId, parentLine },
          type: sequelize.QueryTypes.SELECT
        }
      );
      const nextLine = Number((Array.isArray(nextRows) ? nextRows[0] : nextRows)?.next_ligne || 0);
      const componentRows = await sequelize.query(
        `SELECT id
         FROM vente_document_detail
         WHERE document_id = :documentId
           AND type = 1
           AND ligne > :parentLine
           ${nextLine > 0 ? 'AND ligne < :nextLine' : ''}`,
        {
          replacements: { documentId, parentLine, nextLine },
          type: sequelize.QueryTypes.SELECT
        }
      );

      idsToDelete.push(...(Array.isArray(componentRows) ? componentRows : []).map((component) => component.id));
    }
  }

  idsToDelete = Array.from(new Set(idsToDelete.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
  if (idsToDelete.length === 0) {
    return;
  }

  await deleteQuillRowsByIds(sequelize, [BASE_QUILL_TABLE, COMMANDE_QUILL_TABLE], idsToDelete);

  await sequelize.query(
    `DELETE FROM vente_document_detail WHERE id IN (${idsToDelete.map(() => '?').join(',')})`,
    {
      replacements: idsToDelete,
      type: sequelize.QueryTypes.DELETE,
    }
  );

  if (touchedDocumentIds.size > 0) {
    await syncTouchedDetailLignes(sequelize, Array.from(touchedDocumentIds));
  }
};

// Transférer un devis vers une commande (créer un nouveau document avec parent)
const transfererDevisVersCommande = async (devisId, numeroCommande, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;

  try {
    // 1. Récupérer le devis d'origine avec tous ses détails
    const devis = await getDevisById(devisId, connectionToUse);

    if (!devis) {
      throw new Error(`Devis avec ID ${devisId} non trouvé`);
    }

    // 2. Date du jour (heure locale, SANS toISOString)
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');

    const dateSql =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    // 3. Créer un nouveau document commande avec parent = document_id du devis
    const [insertResult] = await connectionToUse.query(
      `INSERT INTO vente_document 
       (numero, date, description, part_id, contact_id, etat, type, parent) 
       OUTPUT INSERTED.document_id 
       VALUES (:numero, :dateSql, :description, :part_id, :contact_id, NULL, :type, :parent)`,
      {
        replacements: {
          numero: numeroCommande,
          dateSql,
          description: devis.description || '',
          part_id: devis.part_id,
          contact_id: devis.contact_id,
          type: 2, // Type commande
          parent: devisId // Référence au devis d'origine
        },
        type: connectionToUse.QueryTypes.INSERT,
      }
    );

    const nouveauDocumentId = insertResult[0]?.document_id || insertResult?.document_id;

    if (!nouveauDocumentId) {
      throw new Error('Erreur lors de la création du document commande');
    }

    // 4. Copier tous les détails du devis vers la commande
    if (devis.details && devis.details.length > 0) {
      for (const detail of devis.details) {
        // Insérer dans vente_document_detail
        const [detailResult] = await connectionToUse.query(
          `INSERT INTO vente_document_detail 
           (document_id, article_id, prix, quantite, remise, remise_montant, taux_tva, cr_date)
           OUTPUT INSERTED.id
           VALUES (:document_id, :article_id, :prix, :quantite, :remise, :remise_montant, :taux_tva, GETDATE())`,
          {
            replacements: {
              document_id: nouveauDocumentId,
              article_id: detail.article_id,
              prix: detail.prix,
              quantite: detail.quantite,
              remise: detail.remise || 0,
              remise_montant: detail.remise_montant || 0,
              taux_tva: detail.taux_tva || 0,
            },
            type: connectionToUse.QueryTypes.INSERT,
          }
        );

        const nouveauDetailId = detailResult[0]?.id || detailResult?.id;

        // Insérer dans vente_commande_quill si designation existe
        if (detail.designation) {
          try {
            await upsertQuillDesignation(connectionToUse, {
              tableName: COMMANDE_QUILL_TABLE,
              quillId: nouveauDetailId,
              documentId: nouveauDocumentId,
              designation: detail.designation,
              articleId: detail.article_id
            });
          } catch (error) {
            console.error(`Erreur lors de l'insertion dans ${COMMANDE_QUILL_TABLE}:`, error);
            // Continuer même en cas d'erreur sur quill
          }
        }
      }
    }

    // 5. Copier les infos du document (condition, expedition, etc.) si elles existent
    if (devis.condition && devis.condition.length > 0) {
      const condition = devis.condition[0];
      try {
        await connectionToUse.query(
          `INSERT INTO vente_document_info 
           (document_id, date, condition, expedition, transporteur)
           VALUES (:document_id, :date, :condition, :expedition, :transporteur)`,
          {
            replacements: {
              document_id: nouveauDocumentId,
              date: condition.date || today,
              condition: condition.condition || '',
              expedition: condition.expedition || '',
              transporteur: condition.transporteur || ''
            },
            type: connectionToUse.QueryTypes.INSERT,
          }
        );
      } catch (error) {
        console.error('Erreur lors de l\'insertion dans vente_document_info:', error);
        // Continuer même en cas d'erreur sur info
      }
    }

    return {
      document_id: nouveauDocumentId,
      numero: numeroCommande,
      date: dateSql,
      parent: devisId
    };

  } catch (error) {
    console.error('[transfererDevisVersCommande] ❌ Erreur:', error);
    throw error;
  }
};


module.exports = {
  getAllDevis,
  getAllCommande,
  getDevisById,
  addDevis,
  addCommande,
  saveDetail,
  saveInfo,
  updateDevis,
  deleteDevis,
  deleteDetailsAndQuill,
  transfererDevisVersCommande
};
