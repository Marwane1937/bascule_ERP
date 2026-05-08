const { getConnection } = require('../../config/database');

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 500;

const FACTURE_SORT_COLUMNS = {
  facture_num: 'facture_num',
  facture_dat: 'facture_dat',
  fournisseur_nom: 'fournisseur_nom',
  total_ttc: 'total_ttc'
};

const FOURNISSEUR_SORT_COLUMNS = {
  fournisseur_nom: 'fournisseur_nom',
  nombre_factures: 'nombre_factures',
  total_ttc: 'total_ttc',
  derniere_facture_date: 'derniere_facture_date'
};

const ARTICLE_SORT_COLUMNS = {
  article_cod: 'article_cod',
  article_nom: 'article_nom',
  famille_nom: 'famille_nom',
  quantite: 'quantite',
  total_ttc: 'total_ttc'
};

const toMoney = (value) => Number.parseFloat(value) || 0;
const toInt = (value) => Number.parseInt(value, 10) || 0;

const normalizePositiveInt = (value, fallback, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const normalizePagination = (options = {}) => {
  const page = normalizePositiveInt(options.page, 1);
  const pageSize = normalizePositiveInt(options.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    pageEnd: page * pageSize
  };
};

const normalizeSort = (orderBy, orderDirection, allowedColumns, defaultColumn, defaultDirection = 'DESC') => ({
  column: allowedColumns[orderBy] || allowedColumns[defaultColumn],
  direction: String(orderDirection || defaultDirection).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
});

const normalizeSearch = (search) => {
  const value = String(search || '').trim();
  return value ? `%${value}%` : null;
};

const addDateFilter = (column, options = {}, replacements = {}) => {
  let filter = '';
  if (options.dateFrom) {
    filter += ` AND CONVERT(date, ${column}) >= CONVERT(date, :dateFrom)`;
    replacements.dateFrom = options.dateFrom;
  }
  if (options.dateTo) {
    filter += ` AND CONVERT(date, ${column}) <= CONVERT(date, :dateTo)`;
    replacements.dateTo = options.dateTo;
  }
  return filter;
};

const invoiceAmountExpression = 'COALESCE(fm.total_ttc, ISNULL(f.facture_ht, 0) + ISNULL(f.facture_tva, 0), 0)';

const buildFacturesFournisseurCte = (dateFilter = '') => `
  ;WITH Factures AS (
    SELECT
      f.facture_id,
      fs.part_id AS fournisseur_id,
      ISNULL(p.nom, '') AS fournisseur_nom,
      f.facture_num,
      CONVERT(date, f.facture_dat) AS facture_dat,
      CAST(ISNULL(f.facture_ht, 0) AS decimal(18, 2)) AS total_ht,
      CAST(ISNULL(f.facture_tva, 0) AS decimal(18, 2)) AS total_tva,
      CAST(${invoiceAmountExpression} AS decimal(18, 2)) AS total_ttc
    FROM facture_souche fs
    INNER JOIN facture f ON f.facture_id = fs.facture_id
    LEFT JOIN partenaire p ON p.part_id = fs.part_id
    LEFT JOIN v_facture_montant fm ON fm.facture_id = f.facture_id
    WHERE fs.sens = 2
      AND ISNULL(f.facture_ind, 1) = 1
      ${dateFilter}
  )
`;

const getFacturesFournisseur = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { page, pageSize, offset, pageEnd } = normalizePagination(options);
  const sort = normalizeSort(options.orderBy || 'facture_dat', options.orderDirection || 'DESC', FACTURE_SORT_COLUMNS, 'facture_dat', 'DESC');
  const replacements = { search: normalizeSearch(options.search), offset, pageEnd };
  const dateFilter = addDateFilter('f.facture_dat', options, replacements);

  const query = `
    ${buildFacturesFournisseurCte(dateFilter)}
    , Filtered AS (
      SELECT *
      FROM Factures
      WHERE :search IS NULL OR fournisseur_nom LIKE :search OR facture_num LIKE :search
    ),
    OrderedResults AS (
      SELECT
        *,
        COUNT(*) OVER() AS total_count,
        ROW_NUMBER() OVER (ORDER BY ${sort.column} ${sort.direction}, facture_id DESC) AS RowNum
      FROM Filtered
    )
    SELECT *
    FROM OrderedResults
    WHERE RowNum > :offset AND RowNum <= :pageEnd
    ORDER BY RowNum
  `;

  const rows = await sequelize.query(query, { replacements, type: sequelize.QueryTypes.SELECT });
  const total = rows.length ? toInt(rows[0].total_count) : 0;
  return {
    success: true,
    data: rows.map((row) => ({
      facture_id: row.facture_id,
      fournisseur_id: row.fournisseur_id,
      fournisseur_nom: row.fournisseur_nom,
      facture_num: row.facture_num,
      facture_dat: row.facture_dat,
      total_ht: toMoney(row.total_ht),
      total_tva: toMoney(row.total_tva),
      total_ttc: toMoney(row.total_ttc)
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
  };
};

const getAchatsFournisseurs = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { page, pageSize, offset, pageEnd } = normalizePagination(options);
  const sort = normalizeSort(options.orderBy || 'total_ttc', options.orderDirection || 'DESC', FOURNISSEUR_SORT_COLUMNS, 'total_ttc', 'DESC');
  const replacements = { search: normalizeSearch(options.search), offset, pageEnd };
  const dateFilter = addDateFilter('f.facture_dat', options, replacements);

  const query = `
    ${buildFacturesFournisseurCte(dateFilter)}
    , FournisseurTotals AS (
      SELECT
        fournisseur_id,
        fournisseur_nom,
        COUNT(DISTINCT facture_id) AS nombre_factures,
        CAST(SUM(total_ht) AS decimal(18, 2)) AS total_ht,
        CAST(SUM(total_tva) AS decimal(18, 2)) AS total_tva,
        CAST(SUM(total_ttc) AS decimal(18, 2)) AS total_ttc,
        CAST(CASE WHEN COUNT(DISTINCT facture_id) > 0 THEN SUM(total_ttc) / COUNT(DISTINCT facture_id) ELSE 0 END AS decimal(18, 2)) AS montant_moyen,
        MAX(facture_dat) AS derniere_facture_date
      FROM Factures
      WHERE :search IS NULL OR fournisseur_nom LIKE :search OR facture_num LIKE :search
      GROUP BY fournisseur_id, fournisseur_nom
    ),
    OrderedResults AS (
      SELECT
        *,
        COUNT(*) OVER() AS total_count,
        ROW_NUMBER() OVER (ORDER BY ${sort.column} ${sort.direction}, fournisseur_nom ASC, fournisseur_id ASC) AS RowNum
      FROM FournisseurTotals
    )
    SELECT *
    FROM OrderedResults
    WHERE RowNum > :offset AND RowNum <= :pageEnd
    ORDER BY RowNum
  `;

  const rows = await sequelize.query(query, { replacements, type: sequelize.QueryTypes.SELECT });
  const total = rows.length ? toInt(rows[0].total_count) : 0;
  return {
    success: true,
    data: rows.map((row) => ({
      fournisseur_id: row.fournisseur_id,
      fournisseur_nom: row.fournisseur_nom,
      nombre_factures: toInt(row.nombre_factures),
      total_ht: toMoney(row.total_ht),
      total_tva: toMoney(row.total_tva),
      total_ttc: toMoney(row.total_ttc),
      montant_moyen: toMoney(row.montant_moyen),
      derniere_facture_date: row.derniere_facture_date
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
  };
};

const getAchatsArticles = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { page, pageSize, offset, pageEnd } = normalizePagination(options);
  const sort = normalizeSort(options.orderBy || 'total_ttc', options.orderDirection || 'DESC', ARTICLE_SORT_COLUMNS, 'total_ttc', 'DESC');
  const replacements = { search: normalizeSearch(options.search), offset, pageEnd };
  const dateFilter = addDateFilter('ad.[date]', options, replacements);

  const query = `
    ;WITH ArticleTotals AS (
      SELECT
        a.article_id,
        a.article_cod,
        a.article_nom,
        ISNULL(fam.nom, '') AS famille_nom,
        CAST(SUM(ISNULL(addet.quantite, 0)) AS decimal(18, 2)) AS quantite,
        CAST(SUM(ISNULL(addet.quantite, 0) * ISNULL(addet.prix, 0)) AS decimal(18, 2)) AS total_ht,
        CAST(SUM(ISNULL(addet.quantite, 0) * ISNULL(addet.prix, 0) * ISNULL(addet.taux_tva, 0)) AS decimal(18, 2)) AS total_tva,
        CAST(SUM((ISNULL(addet.quantite, 0) * ISNULL(addet.prix, 0)) + (ISNULL(addet.quantite, 0) * ISNULL(addet.prix, 0) * ISNULL(addet.taux_tva, 0))) AS decimal(18, 2)) AS total_ttc
      FROM achat_document ad
      INNER JOIN achat_document_detail addet ON addet.document_id = ad.document_id
      INNER JOIN article a ON a.article_id = addet.article_id
      LEFT JOIN famille fam ON fam.id = a.famille
      WHERE ad.type = 2
        ${dateFilter}
        AND (:search IS NULL OR a.article_cod LIKE :search OR a.article_nom LIKE :search OR fam.nom LIKE :search)
      GROUP BY a.article_id, a.article_cod, a.article_nom, fam.nom
    ),
    OrderedResults AS (
      SELECT
        *,
        COUNT(*) OVER() AS total_count,
        ROW_NUMBER() OVER (ORDER BY ${sort.column} ${sort.direction}, article_nom ASC, article_id ASC) AS RowNum
      FROM ArticleTotals
    )
    SELECT *
    FROM OrderedResults
    WHERE RowNum > :offset AND RowNum <= :pageEnd
    ORDER BY RowNum
  `;

  const rows = await sequelize.query(query, { replacements, type: sequelize.QueryTypes.SELECT });
  const total = rows.length ? toInt(rows[0].total_count) : 0;
  return {
    success: true,
    data: rows.map((row) => ({
      article_id: row.article_id,
      article_cod: row.article_cod,
      article_nom: row.article_nom,
      famille_nom: row.famille_nom,
      quantite: toMoney(row.quantite),
      total_ht: toMoney(row.total_ht),
      total_tva: toMoney(row.total_tva),
      total_ttc: toMoney(row.total_ttc)
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
  };
};

const getFournisseurSuggestions = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const term = String(options.search || '').trim();
  const limit = normalizePositiveInt(options.limit, 20, 100);
  const replacements = { search: term ? `%${term}%` : null, startsWith: term ? `${term}%` : null };

  const rows = await sequelize.query(
    `
      SELECT TOP (${limit})
        p.part_id AS fournisseur_id,
        p.code AS fournisseur_code,
        p.nom AS fournisseur_nom,
        COUNT(DISTINCT f.facture_id) AS nombre_factures,
        CAST(ISNULL(SUM(CASE WHEN fs.sens = 2 THEN ${invoiceAmountExpression} ELSE 0 END), 0) AS decimal(18, 2)) AS total_ttc
      FROM partenaire p
      LEFT JOIN facture_souche fs ON fs.part_id = p.part_id
      LEFT JOIN facture f ON f.facture_id = fs.facture_id AND ISNULL(f.facture_ind, 1) = 1
      LEFT JOIN v_facture_montant fm ON fm.facture_id = f.facture_id
      WHERE (:search IS NULL OR p.nom LIKE :search OR p.code LIKE :search)
        AND (p.type = 2 OR EXISTS (SELECT 1 FROM facture_souche fs2 WHERE fs2.part_id = p.part_id AND fs2.sens = 2))
      GROUP BY p.part_id, p.code, p.nom
      ORDER BY CASE WHEN :startsWith IS NOT NULL AND p.nom LIKE :startsWith THEN 0 ELSE 1 END, p.nom ASC
    `,
    { replacements, type: sequelize.QueryTypes.SELECT }
  );

  return {
    success: true,
    data: rows.map((row) => ({
      fournisseur_id: row.fournisseur_id,
      fournisseur_code: row.fournisseur_code,
      fournisseur_nom: row.fournisseur_nom,
      nombre_factures: toInt(row.nombre_factures),
      total_ttc: toMoney(row.total_ttc)
    }))
  };
};

const getArticleSuggestions = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const term = String(options.search || '').trim();
  const limit = normalizePositiveInt(options.limit, 20, 100);
  const replacements = { search: term ? `%${term}%` : null, startsWith: term ? `${term}%` : null };

  const rows = await sequelize.query(
    `
      SELECT TOP (${limit})
        a.article_id,
        a.article_cod,
        a.article_nom,
        ISNULL(fam.nom, '') AS famille_nom
      FROM article a
      LEFT JOIN famille fam ON fam.id = a.famille
      WHERE :search IS NULL OR a.article_cod LIKE :search OR a.article_nom LIKE :search OR fam.nom LIKE :search
      ORDER BY CASE WHEN :startsWith IS NOT NULL AND a.article_nom LIKE :startsWith THEN 0 ELSE 1 END, a.article_nom ASC
    `,
    { replacements, type: sequelize.QueryTypes.SELECT }
  );

  return { success: true, data: rows };
};

module.exports = {
  getFacturesFournisseur,
  getAchatsFournisseurs,
  getAchatsArticles,
  getFournisseurSuggestions,
  getArticleSuggestions
};
