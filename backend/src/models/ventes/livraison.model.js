const { getConnection } = require('../../config/database');
const {
  LIVRAISON_QUILL_TABLE,
  getLivraisonQuillCandidates,
  loadQuillRowsByDocument,
  mergeDetailsWithQuill,
  upsertQuillDesignation,
  deleteQuillRowsByIds
} = require('./quill-table.helper');
const {
  loadStockInfoByDocument,
  upsertStockInfo
} = require('./stock-info-table.helper');
const {
  buildFlatComponentLines
} = require('../../utils/nomenclature.helper');

const formatToSqlDateTime = (value) => {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }

  let dateStr = String(value).trim();
  if (!dateStr) return null;

  if (dateStr.includes('T')) {
    dateStr = dateStr.replace('Z', '').replace('T', ' ');
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return `${dateStr} 00:00:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(dateStr)) {
    return `${dateStr}:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(dateStr)) {
    return dateStr;
  }

  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
  }

  return null;
};

const tableColumnSetCache = new Map();

const getTableColumnSet = async (sequelize, tableName) => {
  const cacheKey = `${String(sequelize?.config?.database || 'default').toLowerCase()}:${String(tableName || '').toLowerCase()}`;
  if (tableColumnSetCache.has(cacheKey)) {
    return tableColumnSetCache.get(cacheKey);
  }

  const cols = await sequelize.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = :tableName
    `,
    {
      replacements: { tableName },
      type: sequelize.QueryTypes.SELECT
    }
  );
  const columnSet = new Set((Array.isArray(cols) ? cols : []).map((c) => String(c.COLUMN_NAME || '').toLowerCase()));
  tableColumnSetCache.set(cacheKey, columnSet);
  return columnSet;
};

const getPartenaireSelectFields = async (sequelize) => {
  const availableColumns = await getTableColumnSet(sequelize, 'partenaire');
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

  return selectFields;
};

const getPartenaireInfoById = async (sequelize, partId) => {
  if (partId == null) {
    return null;
  }

  const selectFields = await getPartenaireSelectFields(sequelize);
  const clientRows = await sequelize.query(
    `SELECT ${selectFields.join(', ')}
     FROM partenaire p
     WHERE p.part_id = :part_id`,
    {
      replacements: { part_id: partId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  if (Array.isArray(clientRows) && clientRows.length > 0) {
    return clientRows[0];
  }

  return clientRows && typeof clientRows === 'object' ? clientRows : null;
};

const normalizePositiveInt = (value) => {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const toFiniteNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const normalizedValue = typeof value === 'string'
    ? value.trim().replace(',', '.')
    : value;
  const parsed = Number(normalizedValue);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const COMPOSITION_QUILL_ID_OFFSET = 1000000000;

const buildCompositionQuillId = (compositionId) => {
  const safeId = parseInt(compositionId, 10) || 0;
  return COMPOSITION_QUILL_ID_OFFSET + safeId;
};

const buildFlexibleQuillMap = (quillRows = []) => {
  const quillMap = new Map();
  for (const row of (Array.isArray(quillRows) ? quillRows : [])) {
    if (row?.quill_id !== undefined && row?.quill_id !== null) {
      quillMap.set(String(row.quill_id), row.designation || '');
    }
    if (row?.id !== undefined && row?.id !== null) {
      quillMap.set(String(row.id), row.designation || '');
    }
  }
  return quillMap;
};

const loadLivraisonCompositionRows = async (
  sequelize,
  documentId,
  detailIds = [],
  existingQuillRows = [],
  transaction = null
) => {
  if (!Array.isArray(detailIds) || detailIds.length === 0) {
    return [];
  }

  const compositionColSet = await getTableColumnSet(sequelize, 'stock_detail_composition');
  if (compositionColSet.size === 0) {
    return [];
  }

  const rows = await sequelize.query(
    `
      SELECT
        c.id,
        c.stock_detail_id,
        c.ligne,
        c.article_id,
        c.quill_id,
        c.quantite,
        c.prix,
        c.taux_tva,
        c.etat,
        c.type,
        a.article_nom
      FROM stock_detail_composition c
      LEFT JOIN article a ON a.article_id = c.article_id
      WHERE c.stock_detail_id IN (${detailIds.map(() => '?').join(',')})
      ORDER BY c.ligne ASC, c.id ASC, c.stock_detail_id ASC
    `,
    {
      replacements: detailIds,
      type: sequelize.QueryTypes.SELECT,
      transaction
    }
  );

  const quillRows = Array.isArray(existingQuillRows) && existingQuillRows.length > 0
    ? existingQuillRows
    : await loadQuillRowsByDocument(sequelize, documentId, getLivraisonQuillCandidates(), transaction);
  const quillMap = buildFlexibleQuillMap(quillRows);

  return (Array.isArray(rows) ? rows : []).map((row) => {
    const ligne = Math.max(1, parseInt(row.ligne, 10) || 1);
    const effectiveQuillId = parseInt(row.quill_id, 10)
      || (ligne === 1 ? (parseInt(row.stock_detail_id, 10) || null) : null);

    return {
      id: row.id ?? null,
      stock_detail_id: row.stock_detail_id ?? null,
      ligne,
      article_id: row.article_id ?? null,
      quill_id: effectiveQuillId,
      quantite: row.quantite ?? null,
      prix: row.prix ?? null,
      taux_tva: row.taux_tva ?? null,
      etat: row.etat ?? 1,
      type: row.type ?? 2,
      article_nom: row.article_nom || '',
      designation: quillMap.get(String(effectiveQuillId || '')) || row.article_nom || ''
    };
  });
};

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

    const orderColumnMap = {
      document_id: 's.id',
      numero: 's.numero',
      commande_numero: 'COALESCE(cmd.numero, s.part_ref)',
      date: 's.date',
      client: 'p.nom',
      commercial: 'c.nom',
      total_ht: 'ISNULL(t.total_ht, 0)',
      total_tva: 'ISNULL(t.total_tva, 0)',
      total_ttc: 'ISNULL(t.total_ttc, 0)'
    };
    const safeOrderBy = Object.prototype.hasOwnProperty.call(orderColumnMap, orderBy) ? orderBy : 'date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const safeOrderExpression = orderColumnMap[safeOrderBy];

    let whereClause = 'WHERE s.type = 2';
    const replacements = {};

    if (search && search.trim()) {
      whereClause += ` AND (
        s.numero LIKE :search 
        OR COALESCE(cmd.numero, s.part_ref) LIKE :search
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
        commande_id,
        commande_numero,
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
          CASE WHEN cmd.document_id IS NULL THEN NULL ELSE COALESCE(prep.parent, s.parent) END AS commande_id,
          COALESCE(cmd.numero, s.part_ref) AS commande_numero,
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
          ROW_NUMBER() OVER (ORDER BY ${safeOrderExpression} ${safeOrderDirection}, s.id DESC) AS RowNum
        FROM stock s
        LEFT JOIN (
            SELECT stock_id,
                   SUM(quantite * prix) AS total_ht,
                   SUM((quantite * prix) * taux_tva) AS total_tva,
                   SUM((quantite * prix) + (quantite * prix) * taux_tva) AS total_ttc
            FROM stock_detail
            GROUP BY stock_id
        ) t ON t.stock_id = s.id
        LEFT JOIN stock_document prep ON prep.id = s.parent AND prep.type = 10
        LEFT JOIN vente_document cmd ON cmd.document_id = COALESCE(prep.parent, s.parent) AND cmd.type = 2
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

const getLivraisonLocationByNumero = async (numero, options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const safeNumero = String(numero || '').trim();

  if (!safeNumero) {
    throw new Error('numero de livraison invalide');
  }

  const {
    pageSize = 25,
    orderBy = 'date',
    orderDirection = 'DESC'
  } = options;

  const safePageSize = parseInt(pageSize, 10) || 25;
  const orderColumnMap = {
    document_id: 's.id',
    numero: 's.numero',
    commande_numero: 'COALESCE(cmd.numero, s.part_ref)',
    date: 's.date',
    client: 'p.nom',
    commercial: 'c.nom',
    total_ht: 'ISNULL(t.total_ht, 0)',
    total_tva: 'ISNULL(t.total_tva, 0)',
    total_ttc: 'ISNULL(t.total_ttc, 0)'
  };
  const safeOrderBy = Object.prototype.hasOwnProperty.call(orderColumnMap, orderBy) ? orderBy : 'date';
  const safeOrderDirection = String(orderDirection || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const safeOrderExpression = orderColumnMap[safeOrderBy];

  const query = `
    WITH OrderedLivraisons AS (
      SELECT
        s.id AS document_id,
        s.numero,
        ROW_NUMBER() OVER (ORDER BY ${safeOrderExpression} ${safeOrderDirection}, s.id DESC) AS RowNum
      FROM stock s
      LEFT JOIN (
          SELECT stock_id,
                 SUM(quantite * prix) AS total_ht,
                 SUM((quantite * prix) * taux_tva) AS total_tva,
                 SUM((quantite * prix) + (quantite * prix) * taux_tva) AS total_ttc
          FROM stock_detail
          GROUP BY stock_id
      ) t ON t.stock_id = s.id
      LEFT JOIN stock_document prep ON prep.id = s.parent AND prep.type = 10
      LEFT JOIN vente_document cmd ON cmd.document_id = COALESCE(prep.parent, s.parent) AND cmd.type = 2
      LEFT JOIN partenaire p ON p.part_id = s.part_id
      LEFT JOIN contact c ON c.id = s.employe_id
      WHERE s.type = 2
    )
    SELECT TOP 1
      document_id,
      numero,
      RowNum
    FROM OrderedLivraisons
    WHERE numero = :numero
  `;

  const result = await sequelize.query(query, {
    replacements: { numero: safeNumero },
    type: sequelize.QueryTypes.SELECT
  });

  const firstRow = Array.isArray(result) ? result[0] : result;
  if (!firstRow?.numero) {
    return null;
  }

  const rowNumber = Number(firstRow.RowNum || 1);
  return {
    document_id: Number(firstRow.document_id || 0) || null,
    numero: String(firstRow.numero || '').trim(),
    rowNumber,
    page: Math.max(1, Math.ceil(rowNumber / safePageSize)),
    pageSize: safePageSize
  };
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
        AND NOT EXISTS (
          SELECT 1
          FROM stock_document sd
          WHERE sd.parent = vd.document_id
            AND sd.type = 10
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
// Récupérer la progression d'une commande liée à une livraison
const getCommandeProgress = async (commandeId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const safeCommandeId = parseInt(commandeId, 10);

  if (!Number.isInteger(safeCommandeId) || safeCommandeId <= 0) {
    throw new Error('ID commande invalide');
  }

  const venteDetailColSet = await getTableColumnSet(sequelize, 'vente_document_detail');
  const stockDetailColSet = await getTableColumnSet(sequelize, 'stock_detail');
  const stockDocDetailColSet = await getTableColumnSet(sequelize, 'stock_document_detail');

  const venteQuantiteExpr = venteDetailColSet.has('quantite')
    ? 'vdd.quantite'
    : (venteDetailColSet.has('qte') ? 'vdd.qte' : '0');
  const venteDescriptionExpr = venteDetailColSet.has('description') ? 'vdd.description' : 'NULL';
  const stockQuantiteExpr = stockDetailColSet.has('quantite')
    ? 'sd.quantite'
    : (stockDetailColSet.has('qte') ? 'sd.qte' : '0');
  const stockDescriptionExpr = stockDetailColSet.has('description') ? 'sd.description' : 'NULL';
  const stockDocQuantiteExpr = stockDocDetailColSet.has('quantite')
    ? 'sdd.quantite'
    : (stockDocDetailColSet.has('qte') ? 'sdd.qte' : '0');
  const stockDocDescriptionExpr = stockDocDetailColSet.has('description') ? 'sdd.description' : 'NULL';

  const buildLineKeyExpr = (articleExpr, descriptionExpr) => `
    COALESCE(
      CAST(${articleExpr} AS NVARCHAR(100)),
      CONCAT('DESC:', LTRIM(RTRIM(ISNULL(${descriptionExpr}, ''))))
    )
  `;
  const buildLabelExpr = (descriptionExpr) => `
    COALESCE(
      NULLIF(LTRIM(RTRIM(ISNULL(${descriptionExpr}, ''))), ''),
      NULLIF(LTRIM(RTRIM(ISNULL(a.article_nom, ''))), ''),
      NULLIF(LTRIM(RTRIM(ISNULL(a.article_cod, ''))), ''),
      'Article sans libelle'
    )
  `;

  const queryOptions = {
    replacements: { commandeId: safeCommandeId },
    type: sequelize.QueryTypes.SELECT
  };

  const [commandeRows] = await sequelize.query(
    `
      SELECT document_id, numero
      FROM vente_document
      WHERE document_id = :commandeId
        AND type = 2
    `,
    queryOptions
  );
  const commande = Array.isArray(commandeRows) ? commandeRows[0] : commandeRows;

  if (!commande) {
    return null;
  }

  const [preparationCountRows] = await sequelize.query(
    `
      SELECT COUNT(*) AS preparation_count
      FROM stock_document
      WHERE type = 10
        AND parent = :commandeId
    `,
    queryOptions
  );
  const preparationCount = Number((Array.isArray(preparationCountRows) ? preparationCountRows[0] : preparationCountRows)?.preparation_count || 0);
  const hasPreparation = preparationCount > 0;

  const commandeDetails = await sequelize.query(
    `
      SELECT
        ${buildLineKeyExpr('vdd.article_id', venteDescriptionExpr)} AS line_key,
        vdd.article_id,
        MAX(a.article_cod) AS article_cod,
        MAX(${buildLabelExpr(venteDescriptionExpr)}) AS article_nom,
        SUM(ISNULL(${venteQuantiteExpr}, 0)) AS quantite_demandee
      FROM vente_document_detail vdd
      LEFT JOIN article a ON a.article_id = vdd.article_id
      WHERE vdd.document_id = :commandeId
      GROUP BY ${buildLineKeyExpr('vdd.article_id', venteDescriptionExpr)}, vdd.article_id
    `,
    queryOptions
  );

  const preparationDetails = await sequelize.query(
    `
      SELECT
        ${buildLineKeyExpr('sdd.article_id', stockDocDescriptionExpr)} AS line_key,
        MAX(a.article_cod) AS article_cod,
        MAX(${buildLabelExpr(stockDocDescriptionExpr)}) AS article_nom,
        SUM(ISNULL(${stockDocQuantiteExpr}, 0)) AS quantite_preparee
      FROM stock_document prep
      INNER JOIN stock_document_detail sdd ON sdd.stock_id = prep.id
      LEFT JOIN article a ON a.article_id = sdd.article_id
      WHERE prep.type = 10
        AND prep.parent = :commandeId
      GROUP BY ${buildLineKeyExpr('sdd.article_id', stockDocDescriptionExpr)}
    `,
    queryOptions
  );

  const livraisonDetails = await sequelize.query(
    `
      SELECT
        ${buildLineKeyExpr('sd.article_id', stockDescriptionExpr)} AS line_key,
        MAX(a.article_cod) AS article_cod,
        MAX(${buildLabelExpr(stockDescriptionExpr)}) AS article_nom,
        SUM(ISNULL(${stockQuantiteExpr}, 0)) AS quantite_livree
      FROM stock s
      INNER JOIN stock_detail sd ON sd.stock_id = s.id
      LEFT JOIN stock_document prep ON prep.id = s.parent AND prep.type = 10
      LEFT JOIN article a ON a.article_id = sd.article_id
      WHERE s.type = 2
        AND (
          s.parent = :commandeId
          OR prep.parent = :commandeId
        )
      GROUP BY ${buildLineKeyExpr('sd.article_id', stockDescriptionExpr)}
    `,
    queryOptions
  );

  const preparationMap = new Map((Array.isArray(preparationDetails) ? preparationDetails : []).map((row) => [
    String(row.line_key || ''),
    row
  ]));
  const livraisonMap = new Map((Array.isArray(livraisonDetails) ? livraisonDetails : []).map((row) => [
    String(row.line_key || ''),
    row
  ]));

  const normalizedLines = (Array.isArray(commandeDetails) ? commandeDetails : []).map((row) => {
    const lineKey = String(row.line_key || '');
    const preparationRow = preparationMap.get(lineKey) || {};
    const livraisonRow = livraisonMap.get(lineKey) || {};

    const quantiteDemandee = Number(row.quantite_demandee || 0);
    const quantitePreparee = Number(preparationRow.quantite_preparee || 0);
    const quantiteLivree = Number(livraisonRow.quantite_livree || 0);

    let quantiteRestantePreparation = 0;
    let quantiteRestanteLivraison = 0;
    let etatLabel = 'Livre';

    if (hasPreparation) {
      const quantiteCouverte = Math.max(quantitePreparee, quantiteLivree);
      quantiteRestantePreparation = Math.max(0, quantiteDemandee - quantiteCouverte);
      quantiteRestanteLivraison = Math.max(0, quantitePreparee - quantiteLivree);

      if (quantiteLivree >= quantiteDemandee && quantiteDemandee > 0) {
        etatLabel = 'Livre';
      } else if (quantiteRestantePreparation > 0 && quantitePreparee > 0) {
        etatLabel = 'Preparation partielle';
      } else if (quantiteRestantePreparation > 0) {
        etatLabel = 'A preparer';
      } else if (quantiteRestanteLivraison > 0 && quantiteLivree > 0) {
        etatLabel = 'Livraison partielle';
      } else if (quantiteRestanteLivraison > 0) {
        etatLabel = 'Pret a livrer';
      }
    } else {
      quantiteRestantePreparation = Math.max(0, quantiteDemandee - quantiteLivree);

      if (quantiteLivree >= quantiteDemandee && quantiteDemandee > 0) {
        etatLabel = 'Livre';
      } else if (quantiteLivree > 0) {
        etatLabel = 'Livraison partielle';
      } else {
        etatLabel = 'A preparer';
      }
    }

    return {
      line_key: lineKey,
      article_id: row.article_id ?? null,
      article_cod: row.article_cod || preparationRow.article_cod || livraisonRow.article_cod || '',
      article_nom: row.article_nom || preparationRow.article_nom || livraisonRow.article_nom || 'Article sans libelle',
      quantite_demandee: quantiteDemandee,
      quantite_preparee: quantitePreparee,
      quantite_livree: quantiteLivree,
      quantite_restante_preparation: quantiteRestantePreparation,
      quantite_restante_livraison: quantiteRestanteLivraison,
      preparation_percent: quantiteDemandee > 0 ? Number(((quantitePreparee * 100) / quantiteDemandee).toFixed(2)) : 0,
      livraison_percent: quantiteDemandee > 0 ? Number(((quantiteLivree * 100) / quantiteDemandee).toFixed(2)) : 0,
      etat_label: etatLabel,
      has_preparation: hasPreparation
    };
  });

  const pendingLines = normalizedLines
    .filter((line) => line.quantite_restante_preparation > 0 || line.quantite_restante_livraison > 0)
    .sort((a, b) => String(a.article_nom || '').localeCompare(String(b.article_nom || '')));

  const totalDemandee = normalizedLines.reduce((sum, row) => sum + Number(row.quantite_demandee || 0), 0);
  const totalPreparee = normalizedLines.reduce((sum, row) => sum + Number(row.quantite_preparee || 0), 0);
  const totalLivree = normalizedLines.reduce((sum, row) => sum + Number(row.quantite_livree || 0), 0);
  const totalRestantePreparation = normalizedLines.reduce((sum, row) => sum + Number(row.quantite_restante_preparation || 0), 0);
  const totalRestanteLivraison = normalizedLines.reduce((sum, row) => sum + Number(row.quantite_restante_livraison || 0), 0);

  return {
    commande_id: Number(commande.document_id),
    commande_numero: commande.numero || '',
    has_preparation: hasPreparation,
    totals: {
      quantite_demandee: totalDemandee,
      quantite_preparee: totalPreparee,
      quantite_livree: totalLivree,
      quantite_restante_preparation: totalRestantePreparation,
      quantite_restante_livraison: totalRestanteLivraison,
      pending_products_count: pendingLines.length,
      progression_percent: totalDemandee > 0 ? Number(((totalLivree * 100) / totalDemandee).toFixed(2)) : 0
    },
    lines: pendingLines
  };
};

// Récupérer une livraison par ID
const getLivraisonById = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const [stockColSet, vdColSet, stockDetailColSet] = await Promise.all([
    getTableColumnSet(sequelize, 'stock'),
    getTableColumnSet(sequelize, 'vente_document'),
    getTableColumnSet(sequelize, 'stock_detail')
  ]);
  const stockDepotExpr = stockColSet.has('depot_id')
    ? 's.depot_id'
    : (stockColSet.has('adresse_id') ? 's.adresse_id' : null);
  const stockDepotIdSelect = stockDepotExpr ? `${stockDepotExpr} AS depot_id` : 'NULL AS depot_id';
  const stockDepotNomSelect = stockDepotExpr ? 'w.nom AS depot_nom' : 'NULL AS depot_nom';
  const stockWarehouseJoin = stockDepotExpr ? `LEFT JOIN warehouse w ON w.id = ${stockDepotExpr}` : '';

  const vdDepotExpr = vdColSet.has('depot_id')
    ? 'vd.depot_id'
    : (vdColSet.has('adresse_id') ? 'vd.adresse_id' : null);
  const vdDepotIdSelect = vdDepotExpr ? `${vdDepotExpr} AS depot_id` : 'NULL AS depot_id';
  const vdDepotNomSelect = vdDepotExpr ? 'w.nom AS depot_nom' : 'NULL AS depot_nom';
  const vdWarehouseJoin = vdDepotExpr ? `LEFT JOIN warehouse w ON w.id = ${vdDepotExpr}` : '';

  const detailDepotExpr = stockDetailColSet.has('depot_id')
    ? 'sd.depot_id'
    : (stockDetailColSet.has('adresse_id') ? 'sd.adresse_id' : null);
  const detailDepotIdSelect = detailDepotExpr ? `${detailDepotExpr} AS depot_id` : 'NULL AS depot_id';
  const detailDepotNomSelect = detailDepotExpr ? 'wd.nom AS depot_nom' : 'NULL AS depot_nom';
  const detailWarehouseJoin = detailDepotExpr ? `LEFT JOIN warehouse wd ON wd.id = ${detailDepotExpr}` : '';

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
        ${stockDepotIdSelect},
        ${stockDepotNomSelect},
        s.part_ref,
        p.nom AS client_nom,
        c.nom AS commercial_nom
      FROM stock s
      LEFT JOIN partenaire p ON p.part_id = s.part_id
      LEFT JOIN contact c ON c.id = s.employe_id
      ${stockWarehouseJoin}
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
          ${vdDepotIdSelect},
          ${vdDepotNomSelect},
          vd.part_ref,
          p.nom AS client_nom,
          c.nom AS commercial_nom
        FROM vente_document vd
        LEFT JOIN partenaire p ON p.part_id = vd.part_id
        LEFT JOIN contact c ON c.id = vd.contact_id
        ${vdWarehouseJoin}
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
  const [stockDetailLotColSet, venteDetailColSet] = await Promise.all([
    getTableColumnSet(sequelize, 'stock_detail_lot'),
    getTableColumnSet(sequelize, 'vente_document_detail')
  ]);
  const hasStockDetailLigne = stockDetailColSet.has('ligne');
  const stockDetailOrderBy = hasStockDetailLigne
    ? 'ORDER BY CASE WHEN sd.ligne IS NULL THEN 1 ELSE 0 END, sd.ligne ASC, sd.id ASC'
    : 'ORDER BY sd.id DESC';
  const hasVenteDetailLigne = venteDetailColSet.has('ligne');
  const venteDetailLigneSelect = hasVenteDetailLigne ? ', vdd.ligne' : '';
  const stockDetailTypeSelect = stockDetailColSet.has('type') ? 'sd.type,' : 'NULL AS type,';
  const venteDetailTypeSelect = venteDetailColSet.has('type') ? 'vdd.type,' : 'NULL AS type,';
  const venteDetailOrderBy = hasVenteDetailLigne
    ? 'ORDER BY CASE WHEN vdd.ligne IS NULL THEN 1 ELSE 0 END, vdd.ligne ASC, vdd.detail_id ASC'
    : 'ORDER BY vdd.detail_id DESC';

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
        ${stockDetailTypeSelect}
        ${hasStockDetailLigne ? 'sd.ligne,' : ''}
        ${detailDepotIdSelect},
        ${detailDepotNomSelect},
        sd.quantite * sd.prix AS ht,
        (sd.quantite * sd.prix) * sd.taux_tva AS tva_montant,
        (sd.quantite * sd.prix) + ((sd.quantite * sd.prix) * sd.taux_tva) AS ttc,
        sd.description,
        a.article_nom
      FROM stock_detail sd
      LEFT JOIN article a ON a.article_id = sd.article_id
      ${detailWarehouseJoin}
      WHERE sd.stock_id = :id
      ${stockDetailOrderBy}`,
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
          ${venteDetailTypeSelect}
          ${hasVenteDetailLigne ? 'vdd.ligne,' : ''}
          vdd.ht,
          vdd.tva,
          vdd.ttc,
          vdd.description,
          a.article_nom
        FROM vente_document_detail vdd
        LEFT JOIN article a ON a.article_id = vdd.article_id
        WHERE vdd.document_id = :id
        ${venteDetailOrderBy}`,
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
              ${venteDetailTypeSelect}
              ${hasVenteDetailLigne ? 'vdd.ligne,' : ''}
              vdd.ht,
              vdd.tva,
              vdd.ttc,
              vdd.description,
              a.article_nom
            FROM vente_document_detail vdd
            LEFT JOIN article a ON a.article_id = vdd.article_id
            WHERE vdd.document_id = :id
            ${venteDetailOrderBy}`,
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
            type: null,
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
          type: entries.type ?? null,
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

  let livraisonQuillRows = [];
  if (source === 'stock' && Array.isArray(details) && details.length > 0) {
    livraisonQuillRows = await loadQuillRowsByDocument(
      sequelize,
      documentId,
      getLivraisonQuillCandidates()
    );
    details = mergeDetailsWithQuill(details, livraisonQuillRows, {
      detailIdField: 'id',
      designationField: 'designation',
      fallbackFields: ['description', 'article_nom']
    });
  }

  const clientId = livraison.part_id;
  let lotDetails = [];

  if (stockDetailLotColSet.size > 0 && source === 'stock') {
    try {
      const detailIds = (Array.isArray(details) ? details : [])
        .map((detail) => parseInt(detail?.id ?? detail?.detail_id, 10))
        .filter((detailId) => Number.isInteger(detailId) && detailId > 0);
      const ligneExpr = stockDetailLotColSet.has('ligne')
        ? 'sdl.ligne'
        : (stockDetailLotColSet.has('detail_id') ? 'sdl.detail_id' : 'NULL');
      const quantiteExpr = stockDetailLotColSet.has('quantite') ? 'sdl.quantite' : '0';
      const serieExpr = stockDetailLotColSet.has('serie') ? 'sdl.serie' : 'NULL';
      const articleIdExpr = stockDetailLotColSet.has('article_id')
        ? 'sdl.article_id'
        : (stockDetailLotColSet.has('detail_id') ? 'sd.article_id' : 'NULL');
      const lotRowIdExpr = stockDetailLotColSet.has('id') ? 'sdl.id' : 'NULL';
      const lotJoin = stockDetailLotColSet.has('detail_id')
        ? 'LEFT JOIN stock_detail sd ON sd.id = sdl.detail_id'
        : '';
      const lotFilters = [];
      const lotReplacements = { id: documentId };

      if (stockDetailLotColSet.has('stock_id')) {
        lotFilters.push('sdl.stock_id = :id');
      }

      if (stockDetailLotColSet.has('detail_id') && detailIds.length > 0) {
        const detailPlaceholders = detailIds.map((detailId, index) => {
          const key = `detailId${index}`;
          lotReplacements[key] = detailId;
          return `:${key}`;
        });
        lotFilters.push(`sdl.detail_id IN (${detailPlaceholders.join(', ')})`);
      }

      if (lotFilters.length === 0) {
        lotDetails = [];
      } else {
        const lotRows = await sequelize.query(
          `
            SELECT
              ${lotRowIdExpr} AS lot_row_id,
              ${stockDetailLotColSet.has('stock_id') ? 'sdl.stock_id' : ':id'} AS stock_id,
              ${ligneExpr} AS ligne,
              ${serieExpr} AS serie,
              ${articleIdExpr} AS article_id,
              COALESCE(
                NULLIF(LTRIM(RTRIM(ISNULL(a.article_nom, ''))), ''),
                NULLIF(LTRIM(RTRIM(ISNULL(sd.description, ''))), '')
              ) AS article_nom,
              NULLIF(LTRIM(RTRIM(ISNULL(sd.description, ''))), '') AS detail_designation,
              ${quantiteExpr} AS quantite,
              ${stockDetailLotColSet.has('detail_id') ? 'sdl.detail_id' : 'NULL'} AS detail_id
            FROM stock_detail_lot sdl
            ${lotJoin}
            LEFT JOIN article a ON a.article_id = ${articleIdExpr}
            WHERE (${lotFilters.join(' OR ')})
            ORDER BY ISNULL(${ligneExpr}, 0), ${serieExpr}
          `,
          {
            replacements: lotReplacements,
            type: sequelize.QueryTypes.SELECT
          }
        );

        lotDetails = Array.isArray(lotRows) ? lotRows : [];
      }
    } catch (error) {
      console.error('[getLivraisonById] Erreur chargement stock_detail_lot:', error);
      lotDetails = [];
    }
  }

  // Harmoniser la structure des détails pour le frontend
  const normalizedDetails = (Array.isArray(details) ? details : []).map((detail, index) => {
    const articleId = detail.article_id ?? null;
    const prix = detail.pu ?? detail.prix ?? 0;
    const quantite = detail.qte ?? detail.quantite ?? 0;
    const taux_tva = detail.tva ?? detail.taux_tva ?? 0;
    const designation = detail.designation ?? detail.description ?? detail.article_nom ?? '';

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
      depot_id: detail.depot_id ?? null,
      depot_nom: detail.depot_nom ?? null,
      remise: rawRemisePercent,
      remise_montant: rawRemiseMontant,
      remise_mode: remiseMode,
      ht: detail.ht ?? prix * quantite,
      ttc: detail.ttc ?? (prix * quantite) * (1 + (taux_tva || 0))
    };
  });

  // Récupérer les informations du client (partenaire)
  const detailIds = normalizedDetails
    .map((detail) => parseInt(detail?.id ?? detail?.detail_id, 10))
    .filter((detailId) => Number.isInteger(detailId) && detailId > 0);

  const [normalizedCompositions, clientInfo, stockInfo] = await Promise.all([
    source === 'stock'
      ? loadLivraisonCompositionRows(sequelize, documentId, detailIds, livraisonQuillRows)
      : Promise.resolve([]),
    getPartenaireInfoById(sequelize, clientId),
    loadStockInfoByDocument(sequelize, documentId)
  ]);

  const result = {
    ...livraison,
    document_id: documentId,
    part_id: livraison.part_id,
    contact_id: livraison.contact_id ?? livraison.employe_id ?? null,
    depot_id: livraison.depot_id ?? null,
    depot_nom: livraison.depot_nom ?? null,
    client: livraison.client_nom || null,
    commercial: livraison.commercial_nom || null,
    client_nom: livraison.client_nom || null,
    commercial_nom: livraison.commercial_nom || null,
    date: stockInfo?.date || livraison.date || null,
    condition: stockInfo?.condition || '',
    expedition: stockInfo?.expedition || '',
    transporteur: stockInfo?.transporteur || '',
    source,
    details: Array.isArray(normalizedDetails) ? normalizedDetails : [],
    compositions: Array.isArray(normalizedCompositions) ? normalizedCompositions : [],
    lot_details: Array.isArray(lotDetails) ? lotDetails : [],
    clientInfo: clientInfo || null
  };

  return result;
};



// Ajouter une nouvelle livraison dans stock (pour transfert depuis commande)
const addLivraisonFromCommande = async ({ numero, date, description, part_id, contact_id, depot_id, type = 2, etat = 1, parent = null }, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getCompteurCurrent } = require('../../services/compteur.service');

     // 2. Date du jour (heure locale, SANS toISOString)
     const now = new Date();
     const pad = (n) => n.toString().padStart(2, '0');
 
     const dateSql =
       `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
       `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

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

     // const dateSql = formatToSqlDateTime(date);
      // Construire la requête dynamiquement selon les champs fournis
      let columns = 'numero, date, description, part_id, employe_id, type, etat';
      let values = ':numero, :dateSql, :description, :part_id, :employe_id, :type, :etat';
      let replacements = {
        numero: numeroFinal,
        dateSql,
        description: description || null,
        part_id: part_id || null,
        employe_id: contact_id || null,
        type: type || 2,
        etat: etat || 1
      };

      const stockColSet = await getTableColumnSet(sequelize, 'stock');
      const depotColumn = stockColSet.has('depot_id') ? 'depot_id' : (stockColSet.has('adresse_id') ? 'adresse_id' : null);
      const depotValue = (() => {
        const n = parseInt(depot_id, 10);
        return Number.isInteger(n) && n > 0 ? n : null;
      })();
      if (depotColumn) {
        columns += `, ${depotColumn}`;
        values += ', :depotValue';
        replacements.depotValue = depotValue;
      }

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
const saveDetailStock = async (detail, sequelizeConnection = null, transaction = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const stockDetailColSet = await getTableColumnSet(sequelize, 'stock_detail');

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
  const detailType = detail.type !== undefined && detail.type !== null && detail.type !== ''
    ? Number(detail.type)
    : null;
  const depotColumn = stockDetailColSet.has('depot_id')
    ? 'depot_id'
    : (stockDetailColSet.has('adresse_id') ? 'adresse_id' : null);
  const depotValue = (() => {
    const n = parseInt(detail.depot_id ?? detail.adresse_id, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  })();
  const ligneValue = (() => {
    const n = parseInt(detail.ligne, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  })();

  // Préparer les valeurs - convertir null en 0 pour éviter les problèmes avec SQL Server
  let remiseValue = remise;
  let remiseMontantValue = remise_montant;

  // Si undefined ou null, convertir en 0
  if (remiseValue === undefined || remiseValue === null) remiseValue = 0;
  if (remiseMontantValue === undefined || remiseMontantValue === null) remiseMontantValue = 0;

  // Limiter la description à 200 caractères pour éviter la troncature SQL
  const descriptionLimited = (description || '').substring(0, 200);

  // Utiliser une requête simple avec paramètres
  let columns = 'stock_id, article_id, quantite, prix, taux_tva, sens, remise, remise_montant, cr_date';
  let values = ':stock_id, :article_id, :quantite, :prix, :taux_tva, :sens, :remise, :remise_montant, GETDATE()';
  if (stockDetailColSet.has('ligne') && ligneValue !== null) {
    columns += ', ligne';
    values += ', :ligneValue';
  }
  if (depotColumn) {
    columns += `, ${depotColumn}`;
    values += ', :depotValue';
  }
  if (stockDetailColSet.has('type') && detailType !== null && Number.isFinite(detailType)) {
    columns += ', type';
    values += ', :detailType';
  }
  const query = `
    INSERT INTO stock_detail (${columns})
    OUTPUT INSERTED.id
    VALUES (${values})
  `;

  const replacements = {
    stock_id: stock_id,
    article_id: article_id,
    quantite: quantite,
    prix: prix,
    taux_tva: taux_tva,
    sens: sens,
    remise: remiseValue || 0, // Toujours 0 si null/undefined
    remise_montant: remiseMontantValue || 0 // Toujours 0 si null/undefined
  };
  if (stockDetailColSet.has('ligne') && ligneValue !== null) {
    replacements.ligneValue = ligneValue;
  }
  if (depotColumn) {
    replacements.depotValue = depotValue;
  }
  if (stockDetailColSet.has('type') && detailType !== null && Number.isFinite(detailType)) {
    replacements.detailType = detailType;
  }

  const executeInsert = async (t) => {
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

      if (detail_id) {
        await upsertQuillDesignation(sequelize, {
          tableName: LIVRAISON_QUILL_TABLE,
          quillId: detail_id,
          documentId: stock_id,
          designation: description,
          articleId: article_id,
          transaction: t
        });
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
  };

  if (transaction) {
    return await executeInsert(transaction);
  }

  return await sequelize.transaction(async (t) => executeInsert(t));
};

// Mettre à jour un détail de stock_detail
const updateDetailStock = async (id, detail, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const stockDetailColSet = await getTableColumnSet(sequelize, 'stock_detail');

  // Préparer les valeurs - convertir null en 0 pour éviter les problèmes avec SQL Server
  let remiseValue = detail.remise;
  let remiseMontantValue = detail.remise_montant;

  // Si undefined ou null, convertir en 0
  if (remiseValue === undefined || remiseValue === null) remiseValue = 0;
  if (remiseMontantValue === undefined || remiseMontantValue === null) remiseMontantValue = 0;

  // Limiter la description à 200 caractères pour éviter la troncature SQL
  const descriptionLimited = (detail.description || '').substring(0, 200);

  // Utiliser une requête simple avec paramètres
  const depotColumn = stockDetailColSet.has('depot_id')
    ? 'depot_id'
    : (stockDetailColSet.has('adresse_id') ? 'adresse_id' : null);
  const depotValue = (() => {
    const n = parseInt(detail.depot_id ?? detail.adresse_id, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  })();
  const ligneValue = (() => {
    const n = parseInt(detail.ligne, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  })();
  const detailType = detail.type !== undefined && detail.type !== null && detail.type !== ''
    ? Number(detail.type)
    : null;

  let setClause = `
    article_id = :article_id,
    quantite = :quantite,
    prix = :prix,
    taux_tva = :taux_tva,
    description = :description,
    remise = :remise,
    remise_montant = :remise_montant ,
    cr_date = GETDATE()
  `;
  if (depotColumn) {
    setClause += `,\n        ${depotColumn} = :depotValue`;
  }
  if (stockDetailColSet.has('ligne') && ligneValue !== null) {
    setClause += `,\n        ligne = :ligneValue`;
  }
  if (stockDetailColSet.has('type') && detailType !== null && Number.isFinite(detailType)) {
    setClause += `,\n        type = :detailType`;
  }

  const query = `
    UPDATE stock_detail
    SET ${setClause}
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
  if (depotColumn) {
    replacements.depotValue = depotValue;
  }
  if (stockDetailColSet.has('ligne') && ligneValue !== null) {
    replacements.ligneValue = ligneValue;
  }
  if (stockDetailColSet.has('type') && detailType !== null && Number.isFinite(detailType)) {
    replacements.detailType = detailType;
  }

  try {
    await sequelize.query(query, {
      replacements: replacements
    });

    const stockRows = await sequelize.query(
      `SELECT TOP 1 stock_id, article_id FROM stock_detail WHERE id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    const stockDetailRow = Array.isArray(stockRows) && stockRows.length > 0 ? stockRows[0] : null;

    if (stockDetailRow?.stock_id && stockDetailRow?.article_id !== undefined && stockDetailRow?.article_id !== null) {
      await upsertQuillDesignation(sequelize, {
        tableName: LIVRAISON_QUILL_TABLE,
        quillId: id,
        documentId: stockDetailRow.stock_id,
        designation: detail.description || '',
        articleId: stockDetailRow.article_id
      });
    }

    return id;
  } catch (error) {
    console.error('[updateDetailStock] Erreur:', error.message);
    throw error;
  }
};

// Ajouter une nouvelle livraison (ancienne méthode - pour compatibilité) avec transaction
const addLivraison = async ({ date, description, part_id, contact_id, date_fin, etat = 3, type = 3, parent = null }, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
 
  //const dateSql = formatToSqlDateTime(date);
  const dateSql = formatToSqlDateTime(date);
  // Utiliser une transaction pour garantir le rollback en cas d'erreur
  return await sequelize.transaction(async (t) => {
    try {
      // Construire la requête dynamiquement
      let columns = 'date, description, part_id, contact_id, date_fin, etat';
      let values = ':date, :description, :part_id, :contact_id, :date_fin, :etat';
      let replacements = {
        date: dateSql || null,
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
    (document_id, article_id, qte, pu, remise, remise_montant, ht, tva, ttc, description, cr_date)
    OUTPUT INSERTED.detail_id
    VALUES (:document_id, :article_id, :qte, :pu, :remise, :remise_montant, :ht, :tva, :ttc, :description, GETDATE())
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
        description: description || '',
        cr_date: GETDATE()
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
  await upsertStockInfo(sequelize, {
    document_id: info?.document_id || null,
    date: formatToSqlDateTime(info?.date),
    condition: info?.condition || '',
    expedition: info?.expedition || '',
    transporteur: info?.transporteur || ''
  });
};

// Mettre à jour une livraison (dans la table stock)
const updateLivraison = async (id, { date, description, part_id, contact_id, depot_id, date_fin }, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const stockColSet = await getTableColumnSet(sequelize, 'stock');

  const dateSql = formatToSqlDateTime(date);
  const contactColumn = stockColSet.has('employe_id')
    ? 'employe_id'
    : (stockColSet.has('contact_id') ? 'contact_id' : null);
  const depotColumn = stockColSet.has('depot_id')
    ? 'depot_id'
    : (stockColSet.has('adresse_id') ? 'adresse_id' : null);
  const depotValue = (() => {
    const n = parseInt(depot_id, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  })();

  const setParts = [];
  const replacements = { id };

  if (stockColSet.has('date')) {
    setParts.push('date = :dateSql');
    replacements.dateSql = dateSql;
  }
  if (stockColSet.has('description')) {
    setParts.push('description = :description');
    replacements.description = description;
  }
  if (stockColSet.has('part_id')) {
    setParts.push('part_id = :part_id');
    replacements.part_id = part_id;
  }
  if (contactColumn) {
    setParts.push(`${contactColumn} = :contact_id`);
    replacements.contact_id = contact_id;
  }
  if (stockColSet.has('date_fin')) {
    setParts.push('date_fin = :date_fin');
    replacements.date_fin = date_fin;
  }

  if (depotColumn) {
    setParts.push(`${depotColumn} = :depotValue`);
    replacements.depotValue = depotValue;
  }

  if (setParts.length === 0) {
    return;
  }
  const setClause = setParts.join(',\n     ');

  await sequelize.query(
    `UPDATE stock 
     SET ${setClause}
     WHERE id = :id`,
    {
      replacements
    }
  );
};

// Supprimer une livraison
const deleteLivraison = async (ids, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const safeIds = (Array.isArray(ids) ? ids : [])
    .map(normalizePositiveInt)
    .filter(Boolean);

  if (safeIds.length === 0) {
    throw new Error('IDs invalides pour la suppression');
  }

  await sequelize.transaction(async (transaction) => {
    const stockRows = await sequelize.query(
      `SELECT id, facture_id
       FROM stock
       WHERE id IN (${safeIds.map(() => '?').join(',')}) AND type = 2`,
      {
        replacements: safeIds,
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    const stockLivraisons = Array.isArray(stockRows) ? stockRows : [];
    const facturedStockIds = stockLivraisons
      .filter((row) => row?.facture_id !== null && row?.facture_id !== undefined)
      .map((row) => Number(row.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (facturedStockIds.length > 0) {
      throw new Error('Impossible de supprimer une livraison deja facturee');
    }

    const stockIds = stockLivraisons
      .map((row) => Number(row.id))
      .filter((id) => Number.isInteger(id) && id > 0);
    const stockIdSet = new Set(stockIds);

    if (stockIds.length > 0) {
      const detailRows = await sequelize.query(
        `SELECT id
         FROM stock_detail
         WHERE stock_id IN (${stockIds.map(() => '?').join(',')})`,
        {
          replacements: stockIds,
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );

      const detailIds = (Array.isArray(detailRows) ? detailRows : [])
        .map((row) => Number(row.id))
        .filter((id) => Number.isInteger(id) && id > 0);

      const lotColSet = await getTableColumnSet(sequelize, 'stock_detail_lot');
      if (lotColSet.size > 0) {
        const lotPredicates = [];
        const lotReplacements = [];
        if (lotColSet.has('stock_id')) {
          lotPredicates.push(`stock_id IN (${stockIds.map(() => '?').join(',')})`);
          lotReplacements.push(...stockIds);
        }
        if (detailIds.length > 0 && lotColSet.has('detail_id')) {
          lotPredicates.push(`detail_id IN (${detailIds.map(() => '?').join(',')})`);
          lotReplacements.push(...detailIds);
        }

        if (lotPredicates.length > 0) {
          await sequelize.query(
            `DELETE FROM stock_detail_lot WHERE ${lotPredicates.join(' OR ')}`,
            {
              replacements: lotReplacements,
              transaction
            }
          );
        }
      }

      if (detailIds.length > 0) {
        await deleteQuillRowsByIds(sequelize, [LIVRAISON_QUILL_TABLE], detailIds, transaction);
        await deleteCompositionRowsByStockDetailIds(detailIds, sequelize, transaction);

        await sequelize.query(
          `DELETE FROM stock_detail WHERE id IN (${detailIds.map(() => '?').join(',')})`,
          {
            replacements: detailIds,
            transaction
          }
        );
      }

      const stockInfoColSet = await getTableColumnSet(sequelize, 'stock_detail_info');
      if (stockInfoColSet.has('document_id')) {
        await sequelize.query(
          `DELETE FROM stock_detail_info WHERE document_id IN (${stockIds.map(() => '?').join(',')})`,
          {
            replacements: stockIds,
            transaction
          }
        );
      }

      await sequelize.query(
        `DELETE FROM stock WHERE id IN (${stockIds.map(() => '?').join(',')}) AND type = 2`,
        {
          replacements: stockIds,
          transaction
        }
      );
    }

    const legacyCandidateIds = safeIds.filter((id) => !stockIdSet.has(id));
    let legacyLivraisonIds = [];

    if (legacyCandidateIds.length > 0) {
      const legacyRows = await sequelize.query(
        `SELECT document_id
         FROM vente_document
         WHERE document_id IN (${legacyCandidateIds.map(() => '?').join(',')}) AND type = 3`,
        {
          replacements: legacyCandidateIds,
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );

      legacyLivraisonIds = (Array.isArray(legacyRows) ? legacyRows : [])
        .map((row) => Number(row.document_id))
        .filter((id) => Number.isInteger(id) && id > 0);
    }

    if (legacyLivraisonIds.length > 0) {
      await sequelize.query(
        `DELETE FROM vente_document_detail WHERE document_id IN (${legacyLivraisonIds.map(() => '?').join(',')})`,
        {
          replacements: legacyLivraisonIds,
          transaction
        }
      );

      await sequelize.query(
        `DELETE FROM vente_document_quill WHERE document_id IN (${legacyLivraisonIds.map(() => '?').join(',')})`,
        {
          replacements: legacyLivraisonIds,
          transaction
        }
      );

      await sequelize.query(
        `DELETE FROM vente_document WHERE document_id IN (${legacyLivraisonIds.map(() => '?').join(',')}) AND type = 3`,
        {
          replacements: legacyLivraisonIds,
          transaction
        }
      );
    }

    if (stockIds.length === 0 && legacyLivraisonIds.length === 0) {
      throw new Error('Livraison introuvable ou deja supprimee');
    }
  });
};

// Supprimer des lignes de détail par IDs (dans stock_detail)
const deleteCompositionRowsByStockDetailIds = async (ligneIds, sequelize, transaction = null) => {
  const compositionColSet = await getTableColumnSet(sequelize, 'stock_detail_composition');
  if (compositionColSet.size === 0 || !Array.isArray(ligneIds) || ligneIds.length === 0) {
    return;
  }

  const compositionRows = await sequelize.query(
    `
      SELECT id, stock_detail_id, ligne, quill_id
      FROM stock_detail_composition
      WHERE stock_detail_id IN (${ligneIds.map(() => '?').join(',')})
    `,
    {
      replacements: ligneIds,
      type: sequelize.QueryTypes.SELECT,
      transaction
    }
  );

  const quillIdsToDelete = (Array.isArray(compositionRows) ? compositionRows : [])
    .map((row) => Number(row?.quill_id || 0))
    .filter((quillId) => Number.isInteger(quillId) && quillId > 0);

  if (quillIdsToDelete.length > 0) {
    await deleteQuillRowsByIds(sequelize, [LIVRAISON_QUILL_TABLE], quillIdsToDelete, transaction);
  }

  await sequelize.query(
    `DELETE FROM stock_detail_composition WHERE stock_detail_id IN (${ligneIds.map(() => '?').join(',')})`,
    {
      replacements: ligneIds,
      type: sequelize.QueryTypes.DELETE,
      transaction
    }
  );
};

const deleteLignesParIds = async (ligneIds, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  if (!Array.isArray(ligneIds) || ligneIds.length === 0) {
    throw new Error('IDs de lignes invalides pour la suppression');
  }

  const stockDetailColSet = await getTableColumnSet(sequelize, 'stock_detail');
  let idsToDelete = [...ligneIds];

  const stockRows = await sequelize.query(
    `SELECT DISTINCT stock_id
     FROM stock_detail
     WHERE id IN (${ligneIds.map(() => '?').join(',')})`,
    {
      replacements: ligneIds,
      type: sequelize.QueryTypes.SELECT
    }
  );
  const touchedStockIds = (Array.isArray(stockRows) ? stockRows : [])
    .map((row) => Number(row?.stock_id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (stockDetailColSet.has('type') && stockDetailColSet.has('ligne')) {
    const rows = await sequelize.query(
      `SELECT id, stock_id, ligne, type
       FROM stock_detail
       WHERE id IN (${ligneIds.map(() => '?').join(',')})`,
      {
        replacements: ligneIds,
        type: sequelize.QueryTypes.SELECT
      }
    );

    for (const row of Array.isArray(rows) ? rows : []) {
      const stockId = Number(row?.stock_id || 0);
      const parentLine = Number(row?.ligne || 0);
      if (!stockId || !parentLine || Number(row?.type || 0) === 1) {
        continue;
      }

      const nextRows = await sequelize.query(
        `SELECT MIN(ligne) AS next_ligne
         FROM stock_detail
         WHERE stock_id = :stockId
           AND ligne > :parentLine
           AND ISNULL(type, 0) <> 1`,
        {
          replacements: { stockId, parentLine },
          type: sequelize.QueryTypes.SELECT
        }
      );
      const nextLine = Number((Array.isArray(nextRows) ? nextRows[0] : nextRows)?.next_ligne || 0);
      const componentRows = await sequelize.query(
        `SELECT id
         FROM stock_detail
         WHERE stock_id = :stockId
           AND type = 1
           AND ligne > :parentLine
           ${nextLine > 0 ? 'AND ligne < :nextLine' : ''}`,
        {
          replacements: { stockId, parentLine, nextLine },
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

  await deleteQuillRowsByIds(sequelize, [LIVRAISON_QUILL_TABLE], idsToDelete);
  await deleteCompositionRowsByStockDetailIds(idsToDelete, sequelize);

  await sequelize.query(
    `DELETE FROM stock_detail WHERE id IN (${idsToDelete.map(() => '?').join(',')})`,
    { replacements: idsToDelete }
  );

  await syncTouchedStockDetailLignes(sequelize, touchedStockIds);
};

const syncTouchedStockDetailLignes = async (sequelize, touchedStockIds = []) => {
  const stockDetailColSet = await getTableColumnSet(sequelize, 'stock_detail');
  if (!stockDetailColSet.has('ligne')) {
    return;
  }

  const safeStockIds = Array.from(new Set((Array.isArray(touchedStockIds) ? touchedStockIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)));

  for (const stockId of safeStockIds) {
    const orderedRows = await sequelize.query(
      `SELECT id, ligne
       FROM stock_detail
       WHERE stock_id = :stockId
       ORDER BY CASE WHEN ligne IS NULL THEN 1 ELSE 0 END, ligne ASC, id ASC`,
      {
        replacements: { stockId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    for (let index = 0; index < orderedRows.length; index++) {
      const row = orderedRows[index];
      const expectedLigne = index + 1;
      if (Number(row?.ligne || 0) === expectedLigne) {
        continue;
      }

      await sequelize.query(
        `UPDATE stock_detail
         SET ligne = :ligne
         WHERE id = :id`,
        {
          replacements: { id: row.id, ligne: expectedLigne },
          type: sequelize.QueryTypes.UPDATE
        }
      );
    }
  }
};

const syncStockDetailNomenclatureComponents = async (sequelize, parents = [], hasLigneColumn = false) => {
  if (!Array.isArray(parents) || parents.length === 0) {
    return;
  }

  const stockDetailColSet = await getTableColumnSet(sequelize, 'stock_detail');
  const hasTypeColumn = stockDetailColSet.has('type');
  const parentRows = [];
  for (const parent of parents) {
    const componentLines = await buildFlatComponentLines(sequelize, parent);
    if (!Array.isArray(componentLines) || componentLines.length === 0) {
      continue;
    }

    const rows = await sequelize.query(
      `SELECT TOP 1 id, stock_id, article_id, ligne
       FROM stock_detail
       WHERE id = :id`,
      {
        replacements: { id: parent.id },
        type: sequelize.QueryTypes.SELECT
      }
    );
    const dbParent = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!dbParent?.id || !dbParent?.stock_id) {
      continue;
    }

    parentRows.push({
      ...parent,
      id: dbParent.id,
      stock_id: dbParent.stock_id,
      document_id: dbParent.stock_id,
      ligne: Number(dbParent.ligne || parent.ligne || 0),
      componentLines
    });
  }

  parentRows.sort((a, b) => Number(b.ligne || 0) - Number(a.ligne || 0));

  for (const parent of parentRows) {
    const stockId = Number(parent.stock_id || parent.document_id || 0);
    const parentLine = Number(parent.ligne || 0);
    const components = parent.componentLines;
    if (!stockId || !parentLine || components.length === 0) {
      continue;
    }

    const followingRows = await sequelize.query(
      `SELECT id, article_id, ligne${hasTypeColumn ? ', type' : ''}
       FROM stock_detail
       WHERE stock_id = :stock_id
         AND id <> :parent_id
         AND ligne > :parent_line
       ORDER BY ligne ASC, id ASC`,
      {
        replacements: {
          stock_id: stockId,
          parent_id: parent.id,
          parent_line: parentLine
        },
        type: sequelize.QueryTypes.SELECT
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
      await deleteQuillRowsByIds(sequelize, [LIVRAISON_QUILL_TABLE], consumedIds);
      await deleteCompositionRowsByStockDetailIds(consumedIds, sequelize);
      await sequelize.query(
        `DELETE FROM stock_detail WHERE id IN (${consumedIds.map(() => '?').join(',')})`,
        {
          replacements: consumedIds,
          type: sequelize.QueryTypes.DELETE
        }
      );
    }

    if (hasLigneColumn) {
      await sequelize.query(
        `UPDATE stock_detail
         SET ligne = ligne + :offset
         WHERE stock_id = :stock_id
           AND ligne > :parent_line`,
        {
          replacements: {
            offset: components.length,
            stock_id: stockId,
            parent_line: parentLine
          },
          type: sequelize.QueryTypes.UPDATE
        }
      );
    }

    for (let index = 0; index < components.length; index++) {
      const component = components[index];
      await saveDetailStock({
        stock_id: stockId,
        document_id: stockId,
        article_id: component.article_id,
        quantite: toFiniteNumber(component.quantite ?? component.qte, 0),
        prix: toFiniteNumber(component.prix ?? component.pu, 0),
        taux_tva: toFiniteNumber(component.taux_tva ?? component.tva ?? parent.taux_tva, 0),
        depot_id: parent.depot_id ?? parent.adresse_id ?? null,
        ligne: hasLigneColumn ? parentLine + index + 1 : null,
        description: component.designation || component.description || '',
        sens: parent.sens != null ? Number(parent.sens) : -1,
        remise: 0,
        remise_montant: 0,
        type: 1
      }, sequelize);
    }
  }
};

const saveDetailLines = async (lignes, sequelizeConnection = null) => {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return [];
  }

  const sequelize = sequelizeConnection || getConnection();
  const stockColSet = await getTableColumnSet(sequelize, 'stock');
  const stockDetailColSet = await getTableColumnSet(sequelize, 'stock_detail');
  const stockDepotColumn = stockColSet.has('depot_id')
    ? 'depot_id'
    : (stockColSet.has('adresse_id') ? 'adresse_id' : null);

  const results = [];
  const touchedStockIds = new Set();
  const nomenclatureParents = [];

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
      touchedStockIds.add(Number(stockId));

      const articleId = ligne?.article_id ?? null;
      const quantite = Number(ligne?.qte ?? ligne?.quantite) || 0;
      const prix = Number(ligne?.pu ?? ligne?.prix) || 0;
      const tauxTva = ligne?.tva != null
        ? Number(ligne.tva)
        : (ligne?.taux_tva != null ? Number(ligne.taux_tva) : 0);
      const description = ligne?.designation ?? ligne?.description ?? '';
      const sens = ligne?.sens != null ? Number(ligne.sens) : -1;
      const ligneNumber = stockDetailColSet.has('ligne')
        ? (() => {
            const n = parseInt(ligne?.ligne, 10);
            return Number.isInteger(n) && n > 0 ? n : null;
          })()
        : null;
      const ligneType = stockDetailColSet.has('type')
        ? (Number(ligne?.type ?? ligne?.ligne_type ?? ligne?.detail_type ?? 0) === 1 ? 1 : 0)
        : null;

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
        depot_id: ligne?.depot_id ?? ligne?.adresse_id ?? null,
        ligne: ligneNumber,
        description,
        sens,
        // S'assurer que null est explicitement défini et non undefined
        remise: remiseFraction !== undefined ? remiseFraction : null,
        remise_montant: remiseMontant !== undefined ? remiseMontant : null,
        type: ligneType
      };

      // Synchroniser le depot en en-tete (stock) a partir de la ligne si fourni.
      if (stockDepotColumn) {
        const lineDepotValue = (() => {
          const n = parseInt(ligne?.depot_id ?? ligne?.adresse_id, 10);
          return Number.isInteger(n) && n > 0 ? n : null;
        })();
        if (lineDepotValue) {
          await sequelize.query(
            `UPDATE stock SET ${stockDepotColumn} = :lineDepotValue WHERE id = :stockId`,
            {
              replacements: { lineDepotValue, stockId }
            }
          );
        }
      }

      if (ligne?.update_mode === 'U' && ligne?.id) {
        await updateDetailStock(ligne.id, payload, sequelizeConnection);
        results.push({ id: ligne.id, update_mode: 'U', success: true, remise_mode: detectedMode });
        nomenclatureParents.push({ ...payload, id: ligne.id });
      } else if (ligne?.update_mode === 'D' && ligne?.id) {
        await deleteLignesParIds([ligne.id], sequelizeConnection);
        results.push({ id: ligne.id, update_mode: 'D', success: true, remise_mode: detectedMode });
      } else {
        const insertedId = await saveDetailStock(payload, sequelizeConnection);
        console.log(`[saveDetailLines] ✅ Nouvelle ligne ${insertedId} insérée avec succès`);
        results.push({ id: insertedId, update_mode: 'I', success: true, remise_mode: detectedMode });
        if (insertedId) {
          nomenclatureParents.push({ ...payload, id: insertedId });
        }
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

  await syncStockDetailNomenclatureComponents(sequelize, nomenclatureParents, stockDetailColSet.has('ligne'));
  await syncTouchedStockDetailLignes(sequelize, Array.from(touchedStockIds));

  return results;
};

// Récupérer les données de la livraison pour la popup de confirmation
const saveCompositionLines = async (documentId, lignes, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const safeDocumentId = parseInt(documentId, 10);

  if (!Number.isInteger(safeDocumentId) || safeDocumentId <= 0) {
    throw new Error('document_id invalide');
  }

  if (!Array.isArray(lignes) || lignes.length === 0) {
    return [];
  }

  const compositionColSet = await getTableColumnSet(sequelize, 'stock_detail_composition');
  if (compositionColSet.size === 0) {
    throw new Error('Table stock_detail_composition introuvable');
  }
  const quillTableColSet = await getTableColumnSet(sequelize, LIVRAISON_QUILL_TABLE);

  return await sequelize.transaction(async (transaction) => {
    const detailRows = await sequelize.query(
      `SELECT id, article_id FROM stock_detail WHERE stock_id = :documentId`,
      {
        replacements: { documentId: safeDocumentId },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    const validDetailIds = new Set(
      (Array.isArray(detailRows) ? detailRows : [])
        .map((row) => parseInt(row?.id, 10))
        .filter((id) => Number.isInteger(id) && id > 0)
    );

    const existingCompositionRows = await sequelize.query(
      `
        SELECT id, stock_detail_id, ligne, article_id, quill_id
        FROM stock_detail_composition
        WHERE stock_detail_id IN (${Array.from(validDetailIds).map((_, index) => `:detailId${index}`).join(', ') || 'NULL'})
      `,
      {
        replacements: Array.from(validDetailIds).reduce((acc, id, index) => {
          acc[`detailId${index}`] = id;
          return acc;
        }, {}),
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    const existingById = new Map();
    const existingByStockDetailId = new Map();
    (Array.isArray(existingCompositionRows) ? existingCompositionRows : []).forEach((row) => {
      const rowId = parseInt(row?.id, 10);
      const stockDetailId = parseInt(row?.stock_detail_id, 10);
      if (Number.isInteger(rowId) && rowId > 0) {
        existingById.set(rowId, row);
      }
      if (Number.isInteger(stockDetailId) && stockDetailId > 0 && !existingByStockDetailId.has(stockDetailId)) {
        existingByStockDetailId.set(stockDetailId, row);
      }
    });

    const results = [];

    for (const ligne of lignes) {
      try {
        const stockDetailId = parseInt(ligne?.stock_detail_id ?? ligne?.detail_id, 10);
        const ligneNumber = Math.max(1, parseInt(ligne?.ligne, 10) || 1);
        let compositionId = parseInt(ligne?.id, 10);
        const articleId = parseInt(ligne?.article_id, 10);
        const existingRow = (
          (Number.isInteger(compositionId) && compositionId > 0 ? existingById.get(compositionId) : null)
          || existingByStockDetailId.get(stockDetailId)
          || null
        );
        if ((!Number.isInteger(compositionId) || compositionId <= 0) && existingRow?.id) {
          compositionId = parseInt(existingRow.id, 10);
        }
        const updateMode = String(ligne?.update_mode || (compositionId ? 'U' : 'I')).toUpperCase();

        if (!Number.isInteger(stockDetailId) || stockDetailId <= 0 || !validDetailIds.has(stockDetailId)) {
          results.push({
            id: Number.isInteger(compositionId) && compositionId > 0 ? compositionId : null,
            stock_detail_id: stockDetailId || null,
            update_mode: updateMode,
            success: false,
            error: 'stock_detail_id invalide pour ce document'
          });
          continue;
        }

        if (updateMode === 'D') {
          const rowToDelete = existingRow || (Number.isInteger(compositionId) && compositionId > 0 ? { id: compositionId } : null);
          if (!rowToDelete?.id) {
            results.push({
              id: Number.isInteger(compositionId) && compositionId > 0 ? compositionId : null,
              stock_detail_id: stockDetailId,
              update_mode: updateMode,
              success: false,
              error: 'id composition manquant pour suppression'
            });
            continue;
          }

          const quillIdToDelete = Number(rowToDelete?.quill_id || 0);
          if (Number.isInteger(quillIdToDelete) && quillIdToDelete > 0) {
            await deleteQuillRowsByIds(sequelize, [LIVRAISON_QUILL_TABLE], [quillIdToDelete], transaction);
          }

          await sequelize.query(
            `DELETE FROM stock_detail_composition WHERE id = :id`,
            {
              replacements: { id: rowToDelete.id },
              type: sequelize.QueryTypes.DELETE,
              transaction
            }
          );

          results.push({
            id: rowToDelete.id,
            stock_detail_id: stockDetailId,
            update_mode: updateMode,
            success: true
          });
          continue;
        }

        if (!Number.isInteger(articleId) || articleId <= 0) {
          results.push({
            id: Number.isInteger(compositionId) && compositionId > 0 ? compositionId : null,
            stock_detail_id: stockDetailId,
            update_mode: updateMode,
            success: false,
            error: 'article_id invalide'
          });
          continue;
        }

        const designation = String(ligne?.designation || '').trim();
        const quantite = ligneNumber === 1 ? Number(ligne?.quantite ?? ligne?.qte ?? 0) : null;
        const prix = ligneNumber === 1 ? Number(ligne?.prix ?? ligne?.pu ?? 0) : null;
        const tauxTva = ligneNumber === 1
          ? Number(ligne?.taux_tva ?? ligne?.tva ?? 0.2)
          : null;
        let quillId = parseInt(ligne?.quill_id ?? existingRow?.quill_id, 10);
        quillId = Number.isInteger(quillId) && quillId > 0 ? quillId : null;
        let effectiveQuillKey = null;
        const etat = ligne?.etat != null ? Number(ligne.etat) : 1;
        const type = ligne?.type != null ? Number(ligne.type) : 2;

        let savedCompositionId = Number.isInteger(compositionId) && compositionId > 0 ? compositionId : null;

        if (savedCompositionId) {
          await sequelize.query(
            `
              UPDATE stock_detail_composition
              SET stock_detail_id = :stockDetailId,
                  ligne = :ligne,
                  article_id = :articleId,
                  quill_id = :quillId,
                  quantite = :quantite,
                  prix = :prix,
                  taux_tva = :tauxTva,
                  etat = :etat,
                  type = :type
              WHERE id = :id
            `,
            {
              replacements: {
                id: savedCompositionId,
                stockDetailId,
                ligne: ligneNumber,
                articleId,
                quillId,
                quantite,
                prix,
                tauxTva,
                etat,
                type
              },
              type: sequelize.QueryTypes.UPDATE,
              transaction
            }
          );
        } else {
          const insertResult = await sequelize.query(
            `
              INSERT INTO stock_detail_composition
              (stock_detail_id, ligne, article_id, quill_id, quantite, prix, taux_tva, etat, type)
              OUTPUT INSERTED.id
              VALUES (:stockDetailId, :ligne, :articleId, :quillId, :quantite, :prix, :tauxTva, :etat, :type)
            `,
            {
              replacements: {
                stockDetailId,
                ligne: ligneNumber,
                articleId,
                quillId,
                quantite,
                prix,
                tauxTva,
                etat,
                type
              },
              type: sequelize.QueryTypes.INSERT,
              transaction
            }
          );

          const insertedRow = Array.isArray(insertResult) ? insertResult[0] : insertResult;
          savedCompositionId = Array.isArray(insertedRow)
            ? Number(insertedRow[0]?.id || 0)
            : Number(insertedRow?.id || 0);

          if (!savedCompositionId) {
            const fallbackRows = await sequelize.query(
              `SELECT TOP 1 id FROM stock_detail_composition ORDER BY id DESC`,
              {
                type: sequelize.QueryTypes.SELECT,
                transaction
              }
            );
            savedCompositionId = Number((Array.isArray(fallbackRows) ? fallbackRows[0] : fallbackRows)?.id || 0);
          }
        }

        if (!savedCompositionId) {
          throw new Error('Impossible de sauvegarder la composition');
        }

        if (quillId && quillTableColSet.size > 0) {
          const linkedQuillRows = await sequelize.query(
            `
              SELECT TOP 1
                ${quillTableColSet.has('id') ? 'id' : 'NULL AS id'},
                quill_id
              FROM ${LIVRAISON_QUILL_TABLE}
              WHERE ${quillTableColSet.has('id') ? 'id = :ref OR ' : ''}quill_id = :ref
              ORDER BY ${quillTableColSet.has('id') ? 'CASE WHEN id = :ref THEN 0 ELSE 1 END, ' : ''}quill_id DESC
            `,
            {
              replacements: { ref: quillId },
              type: sequelize.QueryTypes.SELECT,
              transaction
            }
          );

          const linkedQuillRow = Array.isArray(linkedQuillRows) ? linkedQuillRows[0] : null;
          effectiveQuillKey = Number(linkedQuillRow?.quill_id || 0) || null;
        }

        if (!effectiveQuillKey) {
          effectiveQuillKey = buildCompositionQuillId(savedCompositionId);
        }

        const savedQuillRow = await upsertQuillDesignation(sequelize, {
          tableName: LIVRAISON_QUILL_TABLE,
          quillId: effectiveQuillKey,
          documentId: safeDocumentId,
          designation,
          articleId,
          entryType: 1,
          transaction
        });

        const savedQuillReference = Number(savedQuillRow?.id || savedQuillRow?.quill_id || effectiveQuillKey) || effectiveQuillKey;
        await sequelize.query(
          `UPDATE stock_detail_composition SET quill_id = :quillId WHERE id = :id`,
          {
            replacements: { quillId: savedQuillReference, id: savedCompositionId },
            type: sequelize.QueryTypes.UPDATE,
            transaction
          }
        );

        results.push({
          id: savedCompositionId,
          stock_detail_id: stockDetailId,
          ligne: ligneNumber,
          quill_id: savedQuillReference,
          update_mode: updateMode,
          success: true
        });
      } catch (error) {
        results.push({
          id: ligne?.id ?? null,
          stock_detail_id: ligne?.stock_detail_id ?? ligne?.detail_id ?? null,
          ligne: ligne?.ligne ?? null,
          update_mode: ligne?.update_mode ?? null,
          success: false,
          error: error.message || 'Erreur inconnue'
        });
      }
    }

    return results;
  });
};

const saveLotDetailLines = async (documentId, lignes, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const safeDocumentId = normalizePositiveInt(documentId);

  if (!safeDocumentId) {
    throw new Error('document_id invalide');
  }

  if (!Array.isArray(lignes) || lignes.length === 0) {
    return [];
  }

  const lotColSet = await getTableColumnSet(sequelize, 'stock_detail_lot');
  if (!lotColSet.size) {
    throw new Error('Table stock_detail_lot introuvable');
  }

  const detailRows = await sequelize.query(
    `SELECT id FROM stock_detail WHERE stock_id = :documentId`,
    {
      replacements: { documentId: safeDocumentId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const validDetailIds = new Set(
    (Array.isArray(detailRows) ? detailRows : [])
      .map((row) => normalizePositiveInt(row?.id))
      .filter(Boolean)
  );

  const results = [];

  for (const ligne of lignes) {
    try {
      const stockId = normalizePositiveInt(ligne?.stock_id) || safeDocumentId;
      const detailId = normalizePositiveInt(ligne?.detail_id);
      const lotRowId = lotColSet.has('id')
        ? normalizePositiveInt(ligne?.lot_row_id ?? ligne?.id)
        : null;

      if (!detailId || !validDetailIds.has(detailId)) {
        results.push({
          lot_row_id: lotRowId,
          detail_id: detailId,
          success: false,
          error: 'detail_id invalide pour cette livraison'
        });
        continue;
      }

      const ligneNumber = normalizePositiveInt(ligne?.ligne) || 1;
      const articleId = normalizePositiveInt(ligne?.article_id);
      const quantite = toFiniteNumber(ligne?.quantite, 0);
      const serie = String(ligne?.serie ?? ligne?.numero_lot ?? '').trim().substring(0, 200);
      const originalLigne = normalizePositiveInt(ligne?.original_ligne ?? ligne?.ligne);
      const originalSerie = String(ligne?.original_serie ?? '').trim().substring(0, 200);

      const setClauses = [];
      const replacements = {};

      if (lotColSet.has('stock_id')) {
        setClauses.push('stock_id = :stockId');
        replacements.stockId = stockId;
      }
      if (lotColSet.has('detail_id')) {
        setClauses.push('detail_id = :detailId');
        replacements.detailId = detailId;
      }
      if (lotColSet.has('ligne')) {
        setClauses.push('ligne = :ligne');
        replacements.ligne = ligneNumber;
      }
      if (lotColSet.has('article_id') && articleId) {
        setClauses.push('article_id = :articleId');
        replacements.articleId = articleId;
      }
      if (lotColSet.has('quantite')) {
        setClauses.push('quantite = :quantite');
        replacements.quantite = quantite;
      }
      if (lotColSet.has('serie')) {
        setClauses.push('serie = :serie');
        replacements.serie = serie;
      }

      if (!setClauses.length) {
        results.push({
          lot_row_id: lotRowId,
          detail_id: detailId,
          success: false,
          error: 'Aucune colonne modifiable trouvee pour stock_detail_lot'
        });
        continue;
      }

      let whereClause = '';

      if (lotRowId && lotColSet.has('id')) {
        whereClause = 'id = :lotRowId';
        replacements.lotRowId = lotRowId;
      } else {
        const filters = [];

        if (lotColSet.has('stock_id')) {
          filters.push('stock_id = :whereStockId');
          replacements.whereStockId = stockId;
        }
        if (lotColSet.has('detail_id')) {
          filters.push('detail_id = :whereDetailId');
          replacements.whereDetailId = detailId;
        }
        if (lotColSet.has('ligne') && originalLigne) {
          filters.push('ligne = :whereOriginalLigne');
          replacements.whereOriginalLigne = originalLigne;
        }
        if (lotColSet.has('serie')) {
          filters.push("ISNULL(serie, '') = :whereOriginalSerie");
          replacements.whereOriginalSerie = originalSerie;
        }

        if (!filters.length) {
          results.push({
            lot_row_id: lotRowId,
            detail_id: detailId,
            success: false,
            error: 'Impossible d identifier la ligne lot a modifier'
          });
          continue;
        }

        whereClause = filters.join(' AND ');
      }

      const existingLotRows = await sequelize.query(
        `SELECT TOP 1 ${lotColSet.has('id') ? 'id' : '1 AS existing_flag'} FROM stock_detail_lot WHERE ${whereClause}`,
        {
          replacements,
          type: sequelize.QueryTypes.SELECT
        }
      );

      const existingLotRow = Array.isArray(existingLotRows) && existingLotRows.length > 0 ? existingLotRows[0] : null;
      const existingLotRowId = lotColSet.has('id') ? normalizePositiveInt(existingLotRow?.id) : null;

      if (existingLotRow) {
        const updateWhereClause = existingLotRowId && lotColSet.has('id')
          ? 'id = :targetLotRowId'
          : whereClause;
        const updateReplacements = existingLotRowId && lotColSet.has('id')
          ? { ...replacements, targetLotRowId: existingLotRowId }
          : replacements;

        await sequelize.query(
          `UPDATE stock_detail_lot SET ${setClauses.join(', ')} WHERE ${updateWhereClause}`,
          {
            replacements: updateReplacements,
            type: sequelize.QueryTypes.UPDATE
          }
        );
      } else if (serie) {
        const insertColumns = [];
        const insertValues = [];
        const insertReplacements = {};

        if (lotColSet.has('stock_id')) {
          insertColumns.push('stock_id');
          insertValues.push(':stockId');
          insertReplacements.stockId = stockId;
        }
        if (lotColSet.has('detail_id')) {
          insertColumns.push('detail_id');
          insertValues.push(':detailId');
          insertReplacements.detailId = detailId;
        }
        if (lotColSet.has('ligne')) {
          insertColumns.push('ligne');
          insertValues.push(':ligne');
          insertReplacements.ligne = ligneNumber;
        }
        if (lotColSet.has('article_id') && articleId) {
          insertColumns.push('article_id');
          insertValues.push(':articleId');
          insertReplacements.articleId = articleId;
        }
        if (lotColSet.has('quantite')) {
          insertColumns.push('quantite');
          insertValues.push(':quantite');
          insertReplacements.quantite = quantite;
        }
        if (lotColSet.has('serie')) {
          insertColumns.push('serie');
          insertValues.push(':serie');
          insertReplacements.serie = serie;
        }
        if (lotColSet.has('type')) {
          insertColumns.push('type');
          insertValues.push('1');
        }
        if (lotColSet.has('etat')) {
          insertColumns.push('etat');
          insertValues.push('1');
        }
        if (lotColSet.has('date')) {
          insertColumns.push('date');
          insertValues.push('GETDATE()');
        }
        if (lotColSet.has('cr_date')) {
          insertColumns.push('cr_date');
          insertValues.push('GETDATE()');
        }

        await sequelize.query(
          `INSERT INTO stock_detail_lot (${insertColumns.join(', ')}) VALUES (${insertValues.join(', ')})`,
          {
            replacements: insertReplacements,
            type: sequelize.QueryTypes.INSERT
          }
        );
      }

      results.push({
        lot_row_id: existingLotRowId || lotRowId,
        detail_id: detailId,
        success: true
      });
    } catch (error) {
      results.push({
        lot_row_id: normalizePositiveInt(ligne?.lot_row_id ?? ligne?.id),
        detail_id: normalizePositiveInt(ligne?.detail_id),
        success: false,
        error: error.message || 'Erreur inconnue'
      });
    }
  }

  return results;
};

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

// Transférer plusieurs livraisons vers UNE SEULE facturation
const transfererLivraisonsVersFacturation = async (stockIds, factureDate, partId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getCompteurCurrent } = require('../../services/compteur.service');

  if (!Array.isArray(stockIds) || stockIds.length === 0) {
    throw new Error('stockIds invalide');
  }

  const stockIdsNum = Array.from(
    new Set(
      stockIds
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id) && id > 0)
    )
  );

  if (stockIdsNum.length === 0) {
    throw new Error('Aucun stockId valide');
  }

  const partIdNum = parseInt(partId, 10);
  if (isNaN(partIdNum) || partIdNum <= 0) {
    throw new Error('partId invalide');
  }

  if (!factureDate) {
    throw new Error('La date de facture est requise');
  }

  const compteurFA = await getCompteurCurrent('FA');
  if (compteurFA === null || compteurFA === undefined) {
    throw new Error('Impossible de récupérer le compteur FA');
  }

  const anneeCourte = new Date(factureDate).getFullYear().toString().slice(2);
  const factureNum = `FA${anneeCourte}-${compteurFA.toString().padStart(4, '0')}`;

  return await sequelize.transaction(async (t) => {
    try {
      const idsSql = stockIdsNum.join(',');
      const stocks = await sequelize.query(
        `SELECT id, part_id, adresse_id, facture_id FROM stock WHERE id IN (${idsSql})`,
        {
          type: sequelize.QueryTypes.SELECT,
          transaction: t
        }
      );

      if (!Array.isArray(stocks) || stocks.length !== stockIdsNum.length) {
        throw new Error('Une ou plusieurs livraisons sont introuvables');
      }

      const invalidClient = stocks.find((s) => Number(s.part_id) !== partIdNum);
      if (invalidClient) {
        throw new Error('Toutes les livraisons doivent appartenir au même client');
      }

      const alreadyFactured = stocks.find((s) => s.facture_id !== null && s.facture_id !== undefined);
      if (alreadyFactured) {
        throw new Error('Une ou plusieurs livraisons sont déjà facturées');
      }

      const adresseIdCandidate = stocks.find((s) => s.adresse_id !== null && s.adresse_id !== undefined);
      const adresseId = adresseIdCandidate ? adresseIdCandidate.adresse_id : null;

      const insertFactureSoucheQuery = `
        INSERT INTO facture_souche (part_id, adresse_id, sens)
        OUTPUT INSERTED.facture_id
        VALUES (:partId, :adresseId, 1)
      `;

      const [factureSoucheResult] = await sequelize.query(insertFactureSoucheQuery, {
        replacements: { partId: partIdNum, adresseId },
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      });

      let factureId = null;
      if (Array.isArray(factureSoucheResult) && factureSoucheResult.length > 0) {
        factureId = factureSoucheResult[0].facture_id;
      } else if (factureSoucheResult && factureSoucheResult.facture_id) {
        factureId = factureSoucheResult.facture_id;
      }

      if (!factureId) {
        throw new Error('Erreur lors de la création de facture_souche : facture_id non récupéré');
      }

      const insertFactureQuery = `
        INSERT INTO facture (facture_id, facture_ind, facture_num, facture_dat, facture_typ, facture_ht, facture_tva)
        VALUES (:factureId, 1, :factureNum, :factureDate, 'FA', 0, 0);
      `;

      await sequelize.query(insertFactureQuery, {
        replacements: { factureId, factureNum, factureDate },
        transaction: t
      });

      await sequelize.query(
        `UPDATE stock SET facture_id = :factureId WHERE id IN (${idsSql})`,
        {
          replacements: { factureId },
          transaction: t
        }
      );

      await sequelize.query(
        `UPDATE compteur SET compteur = compteur + 1 WHERE LTRIM(RTRIM(code)) = 'FA'`,
        { transaction: t }
      );

      return {
        success: true,
        factureId,
        factureNum,
        stockIds: stockIdsNum,
        message: 'Livraisons transférées vers une seule facture avec succès'
      };
    } catch (error) {
      console.error('❌ Erreur lors du transfert multiple livraisons vers facturation:', error);
      throw new Error(`Erreur lors du transfert multiple: ${error.message}`);
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
          `INSERT INTO stock_detail (stock_id, article_id, quantite, prix, taux_tva, description, sens, remise, remise_montant, cr_date)
           VALUES (:stock_id, :article_id, :quantite, :prix, :taux_tva, :description, -1, :remise, :remise_montant , GETDATE())`,
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
  getLivraisonLocationByNumero,
  countAllLivraisons,
  getAllCommandesNonLivrees,
  getCommandeProgress,
  getLivraisonById,
  getLivraisonDataForTransfer,
  addLivraison,
  addLivraisonFromCommande,
  saveDetail,
  saveDetailStock,
  saveDetailLines,
  saveCompositionLines,
  saveLotDetailLines,
  updateDetailStock,
  saveInfo,
  updateLivraison,
  deleteLivraison,
  deleteLignesParIds,
  transfererLivraisonVersFacturation,
  transfererLivraisonsVersFacturation,
  transfererCommandeVersFacturation
};
