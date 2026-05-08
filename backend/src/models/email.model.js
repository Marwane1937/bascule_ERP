const { getConnection } = require('../config/database');
const sequelize = require('../config/database'); // Garder pour compatibilite
const {
  getVenteDocumentQuillCandidates,
  getLivraisonQuillCandidates,
  loadQuillRowsByDocument
} = require('./ventes/quill-table.helper');
const {
  loadStockInfoByDocument
} = require('./ventes/stock-info-table.helper');

const getTableColumnSet = async (sequelizeConnection, tableName) => {
  const rows = await sequelizeConnection.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = :tableName
    `,
    {
      replacements: { tableName },
      type: sequelizeConnection.QueryTypes.SELECT,
    }
  );

  return new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.COLUMN_NAME || '').toLowerCase()));
};

const normalizeDocumentType = (documentType) => {
  if (!documentType) return null;
  const normalized = String(documentType).trim().toLowerCase();

  if (normalized === 'bl') return 'livraison';
  if (normalized === 'retour client') return 'retour';

  return normalized;
};

const escapeCompositionHtml = (value) => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const buildCompositionFallbackDesignation = (rows = []) => {
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => {
      const article = escapeCompositionHtml(row?.article_nom || 'Article sans libelle');
      if (index === 0) {
        return `<p><strong>${index + 1}. ${article}</strong></p>`;
      }

      return `<p style="margin-left: 28px;">${index + 1}. ${article}</p>`;
    })
    .join('');
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

const normalizeLotLabel = (value) => {
  return String(value ?? '').trim();
};

const loadStockLotNumbersByDetailIds = async (connectionToUse, detailIds = []) => {
  const normalizedDetailIds = Array.from(
    new Set(
      (Array.isArray(detailIds) ? detailIds : [])
        .map((detailId) => Number(detailId || 0))
        .filter((detailId) => Number.isInteger(detailId) && detailId > 0)
    )
  );

  if (normalizedDetailIds.length === 0) {
    return new Map();
  }

  const lotColSet = await getTableColumnSet(connectionToUse, 'stock_detail_lot');
  if (!lotColSet.has('detail_id') || !lotColSet.has('serie')) {
    return new Map();
  }

  const detailPlaceholders = normalizedDetailIds.map((_, index) => `:detailId${index}`).join(', ');
  const replacements = normalizedDetailIds.reduce((acc, detailId, index) => {
    acc[`detailId${index}`] = detailId;
    return acc;
  }, {});

  const lotOrderBy = [
    lotColSet.has('ligne') ? 'ISNULL(sdl.ligne, 0)' : null,
    lotColSet.has('lot_id') ? 'ISNULL(sdl.lot_id, 0)' : null,
    'ISNULL(sdl.detail_id, 0)',
    "NULLIF(LTRIM(RTRIM(ISNULL(sdl.serie, ''))), '')"
  ].filter(Boolean).join(', ');

  const lotRows = await connectionToUse.query(
    `
      SELECT
        sdl.detail_id,
        NULLIF(LTRIM(RTRIM(ISNULL(sdl.serie, ''))), '') AS serie
      FROM stock_detail_lot sdl
      WHERE sdl.detail_id IN (${detailPlaceholders})
      ORDER BY ${lotOrderBy}
    `,
    {
      replacements,
      type: connectionToUse.QueryTypes.SELECT,
    }
  );

  const lotNumbersByDetailId = new Map();
  for (const lotRow of (Array.isArray(lotRows) ? lotRows : [])) {
    const detailId = Number(lotRow?.detail_id || 0);
    const lotLabel = normalizeLotLabel(lotRow?.serie);

    if (!detailId || !lotLabel) {
      continue;
    }

    const existing = lotNumbersByDetailId.get(detailId) || [];
    if (!existing.includes(lotLabel)) {
      existing.push(lotLabel);
      lotNumbersByDetailId.set(detailId, existing);
    }
  }

  const joinedLotNumbersByDetailId = new Map();
  for (const [detailId, lotLabels] of lotNumbersByDetailId.entries()) {
    joinedLotNumbersByDetailId.set(detailId, lotLabels.join(' / '));
  }

  return joinedLotNumbersByDetailId;
};

const loadExactLivraisonCompositionDesignation = async (connectionToUse, documentId, compositionQuillId) => {
  const safeQuillId = parseInt(compositionQuillId, 10);
  if (!Number.isInteger(safeQuillId) || safeQuillId <= 0) {
    return '';
  }

  const tableCheck = await connectionToUse.query(
    `
      SELECT 1 AS found
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'vente_livraison_quill'
    `,
    {
      type: connectionToUse.QueryTypes.SELECT,
    }
  );

  if (!Array.isArray(tableCheck) || tableCheck.length === 0) {
    return '';
  }

  const columnSet = await getTableColumnSet(connectionToUse, 'vente_livraison_quill');
  const hasIdColumn = columnSet.has('id');
  const hasTypeColumn = columnSet.has('type');
  const idPredicate = hasIdColumn ? 'q.id = :quillId OR ' : '';
  const typeFilter = hasTypeColumn ? 'AND (q.type = 1 OR q.type IS NULL)' : '';
  const orderBy = hasIdColumn
    ? 'CASE WHEN q.id = :quillId THEN 0 ELSE 1 END, q.id DESC'
    : 'q.quill_id DESC';

  const rows = await connectionToUse.query(
    `
      SELECT TOP 1 q.designation
      FROM vente_livraison_quill q
      WHERE q.document_id = :documentId
        AND (${idPredicate}q.quill_id = :quillId)
        ${typeFilter}
      ORDER BY ${orderBy}
    `,
    {
      replacements: {
        documentId,
        quillId: safeQuillId
      },
      type: connectionToUse.QueryTypes.SELECT,
    }
  );

  return String((Array.isArray(rows) ? rows[0] : rows)?.designation || '').trim();
};

const getStockDocumentCompositionData = async (connectionToUse, document_id) => {
  const compositionTableCheck = await connectionToUse.query(
    `
      SELECT 1 AS found
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'stock_detail_composition'
    `,
    {
      type: connectionToUse.QueryTypes.SELECT,
    }
  );

  if (!Array.isArray(compositionTableCheck) || compositionTableCheck.length === 0) {
    return [];
  }

  const rows = await connectionToUse.query(
    `
      SELECT
        s.id AS document_id,
        s.numero,
        s.description AS client_ref,
        COALESCE(cmd.numero, stock_source.numero, s.part_ref) AS commande_numero,
        s.date,
        s.part_id,
        p.nom AS client,
        c.nom AS commercial,
        comp.article_id AS article_id,
        a.article_cod,
        a.article_nom,
        CASE WHEN comp.ligne = 1 THEN comp.quantite ELSE NULL END AS quantite,
        CASE WHEN comp.ligne = 1 THEN comp.prix ELSE NULL END AS prix,
        CASE
          WHEN comp.ligne = 1 AND comp.quantite IS NOT NULL AND comp.prix IS NOT NULL
            THEN comp.quantite * comp.prix
          ELSE NULL
        END AS remise,
        CASE WHEN comp.ligne = 1 THEN comp.taux_tva ELSE NULL END AS taux_tva,
        '' AS condition,
        '' AS expedition,
        '' AS transporteur,
        '' AS ville,
        p.adresse AS adresse,
        p.ice as ice,
        comp.quill_id AS ligne_id,
        s.type,
        s.etat,
        'LIVRAISON' AS document_kind,
        comp.ligne AS composition_ligne,
        comp.quill_id AS composition_quill_id
      FROM stock s
      INNER JOIN stock_detail sd ON sd.stock_id = s.id
      INNER JOIN stock_detail_composition comp ON comp.stock_detail_id = sd.id
      LEFT JOIN stock_document prep ON prep.id = s.parent AND prep.type = 10
      LEFT JOIN stock_document stock_source ON stock_source.id = s.parent AND stock_source.type IN (21, 22)
      LEFT JOIN vente_document cmd ON cmd.document_id = COALESCE(prep.parent, s.parent) AND cmd.type = 2
      LEFT JOIN v_partenaire p ON p.part_id = s.part_id
      LEFT JOIN contact c ON c.id = s.employe_id
      LEFT JOIN article a ON a.article_id = comp.article_id
      WHERE s.id = :id AND s.type = 2
      ORDER BY comp.ligne ASC, comp.id ASC, sd.id ASC
    `,
    {
      replacements: { id: document_id },
      type: connectionToUse.QueryTypes.SELECT,
    }
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const stockInfo = await loadStockInfoByDocument(connectionToUse, document_id);
  const firstCommercialRow = rows.find((row) => Number(row?.composition_ligne || 0) === 1) || rows[0];
  const directDesignation = await loadExactLivraisonCompositionDesignation(
    connectionToUse,
    document_id,
    firstCommercialRow?.composition_quill_id || firstCommercialRow?.ligne_id || null
  );
  const quillRows = directDesignation
    ? []
    : await loadQuillRowsByDocument(
      connectionToUse,
      document_id,
      getLivraisonQuillCandidates()
    );
  const quillMap = buildFlexibleQuillMap(quillRows);
  const quillDesignation = directDesignation
    || quillMap.get(String(firstCommercialRow?.composition_quill_id || firstCommercialRow?.ligne_id || ''))
    || '';
  const designation = quillDesignation || buildCompositionFallbackDesignation(rows);

  return [{
    ...firstCommercialRow,
    date: stockInfo?.date || firstCommercialRow?.date || null,
    condition: stockInfo?.condition || '',
    expedition: stockInfo?.expedition || '',
    transporteur: stockInfo?.transporteur || '',
    designation,
    article: designation
  }];
};

const getStockDocumentData = async (connectionToUse, document_id, forcedType = null, options = {}) => {
  const normalizedPrintMode = String(options?.printMode || '').trim().toLowerCase();
  if (normalizedPrintMode === 'composition' && forcedType !== 'retour') {
    const compositionRows = await getStockDocumentCompositionData(connectionToUse, document_id);
    if (compositionRows.length > 0) {
      return compositionRows;
    }
  }

  let stockTypeCondition = 's.type IN (2, 5)';

  if (forcedType === 'livraison') {
    stockTypeCondition = 's.type = 2';
  } else if (forcedType === 'retour') {
    stockTypeCondition = 's.type = 5';
  }

  const stockDetailColSet = await getTableColumnSet(connectionToUse, 'stock_detail');
  const hasStockDetailLigne = stockDetailColSet.has('ligne');
  const stockDetailTypeSelect = stockDetailColSet.has('type') ? 'sd.type AS ligne_type,' : 'NULL AS ligne_type,';
  const stockOrderBy = hasStockDetailLigne
    ? 'ORDER BY CASE WHEN sd.ligne IS NULL THEN 1 ELSE 0 END, sd.ligne ASC, sd.id ASC'
    : 'ORDER BY sd.id DESC';

  const rows = await connectionToUse.query(
    `
      SELECT
        s.id AS document_id,
        s.numero,
        s.description AS client_ref,
        COALESCE(cmd.numero, stock_source.numero, s.part_ref) AS commande_numero,
        s.date,
        s.part_id,
        p.nom AS client,
        c.nom AS commercial,
        sd.article_id AS article_id,
        a.article_cod,
        sd.description AS designation,
        a.article_nom,
        sd.quantite,
        sd.prix,
        CASE
          WHEN sd.description IS NULL OR LTRIM(RTRIM(CAST(sd.description AS VARCHAR(MAX)))) = ''
            THEN a.article_nom
          ELSE sd.description
        END AS article,
        sd.taux_tva,
        CASE
          WHEN sd.remise <> 0
            THEN (sd.quantite * sd.prix) - ((sd.quantite * sd.prix) * sd.remise)
          ELSE (sd.quantite * sd.prix) - ISNULL(sd.remise_montant, 0)
        END AS remise,
        '' AS condition,
        '' AS expedition,
        '' AS transporteur,
        '' AS ville,
        p.adresse AS adresse,
        p.ice as ice,
        ${hasStockDetailLigne ? 'sd.ligne AS ordre_ligne,' : 'NULL AS ordre_ligne,'}
        sd.id AS ligne_id,
        ${stockDetailTypeSelect}
        s.type,
        s.etat,
        CASE WHEN s.type = 5 THEN 'RETOUR CLIENT' ELSE 'LIVRAISON' END AS document_kind
      FROM stock s
      LEFT JOIN stock_detail sd ON sd.stock_id = s.id
      LEFT JOIN stock_document prep ON prep.id = s.parent AND prep.type = 10
      LEFT JOIN stock_document stock_source ON stock_source.id = s.parent AND stock_source.type IN (21, 22)
      LEFT JOIN vente_document cmd ON cmd.document_id = COALESCE(prep.parent, s.parent) AND cmd.type = 2
      LEFT JOIN v_partenaire p ON p.part_id = s.part_id
      LEFT JOIN contact c ON c.id = s.employe_id
      LEFT JOIN article a ON a.article_id = sd.article_id
      WHERE s.id = :id AND ${stockTypeCondition}
      ${stockOrderBy}
    `,
    {
      replacements: { id: document_id },
      type: connectionToUse.QueryTypes.SELECT,
    }
  );

  const quillRows = await loadQuillRowsByDocument(
    connectionToUse,
    document_id,
    getLivraisonQuillCandidates()
  );
  const quillMap = buildFlexibleQuillMap(quillRows);
  const stockInfo = await loadStockInfoByDocument(connectionToUse, document_id);
  const lotNumbersByDetailId = await loadStockLotNumbersByDetailIds(
    connectionToUse,
    (Array.isArray(rows) ? rows : []).map((row) => row?.ligne_id)
  );

  return (Array.isArray(rows) ? rows : []).map((row) => {
    const designation = quillMap.get(String(row.ligne_id)) || row.designation || row.article_nom || '';
    const lotNumber = lotNumbersByDetailId.get(Number(row?.ligne_id || 0)) || '';

    return {
      ...row,
      date: stockInfo?.date || row.date || null,
      condition: stockInfo?.condition || '',
      expedition: stockInfo?.expedition || '',
      transporteur: stockInfo?.transporteur || '',
      designation,
      article: designation || row.article_nom || '',
      numero_lot: lotNumber,
      serie: lotNumber
    };
  });
};

const getVenteDocumentData = async (connectionToUse, document_id, forcedType = null) => {
  let venteTypeCondition = '';

  if (forcedType === 'devis') {
    venteTypeCondition = 'AND v.type = 1';
  } else if (forcedType === 'commande') {
    venteTypeCondition = 'AND v.type = 2';
  }

  const venteDetailColSet = await getTableColumnSet(connectionToUse, 'vente_document_detail');
  const hasVenteDetailLigne = venteDetailColSet.has('ligne');
  const venteDetailTypeSelect = venteDetailColSet.has('type') ? 'vd.type AS ligne_type,' : 'NULL AS ligne_type,';
  const venteOrderBy = hasVenteDetailLigne
    ? 'ORDER BY CASE WHEN vd.ligne IS NULL THEN 1 ELSE 0 END, vd.ligne ASC, vd.id ASC'
    : 'ORDER BY vd.id ASC';

  const rows = await connectionToUse.query(
    `
      SELECT
        v.document_id,
        v.numero,
        v.description AS client_ref,
        v.date,
        p.nom AS client,
        c.nom AS commercial,
        vd.article_id AS article_id,
        a.article_cod,
        vd.description AS designation,
        a.article_nom,
        vd.quantite,
        vd.prix,
        CASE
          WHEN vd.description IS NULL OR LTRIM(RTRIM(CAST(vd.description AS VARCHAR(MAX)))) = ''
            THEN a.article_nom
          ELSE vd.description
        END AS article,
        vd.taux_tva,
        CASE
          WHEN vd.remise <> 0
            THEN (vd.quantite * vd.prix) - ((vd.quantite * vd.prix) * vd.remise)
          ELSE (vd.quantite * vd.prix) - vd.remise_montant
        END AS remise,
        vi.condition,
        vi.expedition,
        vi.transporteur,
        p.adresse AS adresse,
        p.ice as ice,
        '' AS ville,
        ${hasVenteDetailLigne ? 'vd.ligne AS ordre_ligne,' : 'NULL AS ordre_ligne,'}
        vd.id AS ligne_id,
        ${venteDetailTypeSelect}
        v.type,
        v.etat,
        v.part_id,
        CASE WHEN v.type = 2 THEN 'COMMANDE' ELSE 'DEVIS' END AS document_kind
      FROM vente_document v
      LEFT JOIN vente_document_detail vd ON v.document_id = vd.document_id
      LEFT JOIN v_partenaire p ON p.part_id = v.part_id
      LEFT JOIN contact c ON c.id = v.contact_id
      LEFT JOIN vente_document_info vi ON vi.document_id = v.document_id
      LEFT JOIN article a ON a.article_id = vd.article_id
      WHERE v.document_id = :id ${venteTypeCondition}
      ${venteOrderBy}
    `,
    {
      replacements: { id: document_id },
      type: connectionToUse.QueryTypes.SELECT,
    }
  );

  const documentType = Array.isArray(rows) && rows.length > 0 ? rows[0]?.type : null;
  const quillRows = await loadQuillRowsByDocument(
    connectionToUse,
    document_id,
    getVenteDocumentQuillCandidates(documentType)
  );
  const quillMap = buildFlexibleQuillMap(quillRows);

  return (Array.isArray(rows) ? rows : []).map((row) => {
    const designation = quillMap.get(String(row.ligne_id)) || row.designation || row.article_nom || '';
    return {
      ...row,
      designation,
      article: designation || row.article_nom || ''
    };
  });
};

const getEmailDataByDocumentId = async (document_id, sequelizeConnection = null, options = {}) => {
  const connectionToUse = sequelizeConnection || getConnection();
  const forcedType = normalizeDocumentType(options?.forceDocumentType);

  if (forcedType === 'devis' || forcedType === 'commande') {
    return getVenteDocumentData(connectionToUse, document_id, forcedType);
  }

  if (forcedType === 'livraison' || forcedType === 'retour') {
    return getStockDocumentData(connectionToUse, document_id, forcedType, options);
  }

  // Sans type force: eviter le melange en cas de collision d'ID entre vente_document et stock.
  const [checkVente, checkStock] = await Promise.all([
    connectionToUse.query(
      `SELECT document_id, type FROM vente_document WHERE document_id = :id AND type IN (1, 2)`,
      {
        replacements: { id: document_id },
        type: connectionToUse.QueryTypes.SELECT,
      }
    ),
    connectionToUse.query(
      `SELECT id, type FROM stock WHERE id = :id AND type IN (2, 5)`,
      {
        replacements: { id: document_id },
        type: connectionToUse.QueryTypes.SELECT,
      }
    )
  ]);

  if (checkVente && checkVente.length > 0) {
    return getVenteDocumentData(connectionToUse, document_id);
  }

  if (checkStock && checkStock.length > 0) {
    return getStockDocumentData(connectionToUse, document_id, null, options);
  }

  const venteFallback = await getVenteDocumentData(connectionToUse, document_id);
  if (venteFallback && venteFallback.length > 0) {
    return venteFallback;
  }

  return getStockDocumentData(connectionToUse, document_id, null, options);
};

module.exports = {
  getEmailDataByDocumentId
};
