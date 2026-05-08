const { getConnection } = require('../../config/database');

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 500;

const GRAND_LIVRE_SORT_COLUMNS = {
  date: 'date',
  numero: 'numero',
  client: 'client',
  document_type: 'document_type',
  total_ht: 'total_ht',
  total_tva: 'total_tva',
  total_ttc: 'total_ttc'
};

const FACTURES_CLIENT_SORT_COLUMNS = {
  facture_num: 'facture_num',
  facture_dat: 'facture_dat',
  nom: 'client_nom',
  client: 'client_nom',
  facture_ht: 'facture_ht',
  facture_tva: 'facture_tva',
  total_ttc: 'total_ttc'
};

const CA_ARTICLE_SORT_COLUMNS = {
  article_cod: 'article_cod',
  article_nom: 'article_nom',
  categorie_nom: 'categorie_nom',
  quantite_vendue: 'quantite_vendue',
  chiffre_affaires: 'chiffre_affaires',
  prix_moyen_vente: 'prix_moyen_vente'
};

const CA_CLIENT_SORT_COLUMNS = {
  client_nom: 'client_nom',
  nombre_factures: 'nombre_factures',
  chiffre_affaires: 'chiffre_affaires',
  montant_moyen: 'montant_moyen',
  derniere_facture_date: 'derniere_facture_date'
};

const toMoney = (value) => Number.parseFloat(value) || 0;
const toInt = (value) => Number.parseInt(value, 10) || 0;

const normalizePositiveInt = (value, fallback, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
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

const normalizeSort = (orderBy, orderDirection, allowedColumns, defaultColumn, defaultDirection = 'DESC') => {
  const safeColumn = allowedColumns[orderBy] || allowedColumns[defaultColumn];
  const normalizedDirection = String(orderDirection || defaultDirection).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  return {
    column: safeColumn,
    direction: normalizedDirection
  };
};

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

const invoiceAmountExpression = `
  COALESCE(
    fm.total_ttc,
    ISNULL(f.facture_ht, 0) + ISNULL(f.facture_tva, 0),
    0
  )
`;

/**
 * Grand livre vente: factures client uniquement.
 */
const getGrandLivre = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  try {
    const { page, pageSize, offset, pageEnd } = normalizePagination(options);
    const sort = normalizeSort(options.orderBy || 'date', options.orderDirection || 'DESC', GRAND_LIVRE_SORT_COLUMNS, 'date', 'DESC');
    const replacements = {
      search: normalizeSearch(options.search),
      offset,
      pageEnd
    };

    const factureDateFilter = addDateFilter('f.facture_dat', options, replacements);

    const query = `
      ;WITH Factures AS (
        SELECT
          CONCAT('FA-', CAST(f.facture_id AS varchar(50))) AS id,
          f.facture_id AS source_id,
          fs.part_id AS client_id,
          ISNULL(p.nom, '') AS client,
          f.facture_num AS numero,
          CONVERT(date, f.facture_dat) AS date,
          'Facture' AS document_type,
          '' AS description,
          CAST(ISNULL(f.facture_ht, 0) AS decimal(18, 2)) AS total_ht,
          CAST(ISNULL(f.facture_tva, 0) AS decimal(18, 2)) AS total_tva,
          CAST(${invoiceAmountExpression} AS decimal(18, 2)) AS total_ttc
        FROM facture_souche fs
        INNER JOIN facture f ON f.facture_id = fs.facture_id
        LEFT JOIN partenaire p ON p.part_id = fs.part_id
        LEFT JOIN v_facture_montant fm ON fm.facture_id = f.facture_id
        WHERE fs.sens = 1
          AND ISNULL(f.facture_ind, 1) = 1
          AND ISNULL(f.facture_typ, '') <> 'AV'
          ${factureDateFilter}
      ),
      Source AS (
        SELECT * FROM Factures
      ),
      Filtered AS (
        SELECT *
        FROM Source
        WHERE :search IS NULL
          OR client LIKE :search
          OR numero LIKE :search
          OR description LIKE :search
          OR document_type LIKE :search
      ),
      OrderedResults AS (
        SELECT
          *,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${sort.column} ${sort.direction}, date DESC, source_id DESC) AS RowNum
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
        id: row.id,
        source_id: row.source_id,
        client_id: row.client_id,
        client: row.client,
        numero: row.numero,
        date: row.date,
        document_type: row.document_type,
        description: row.description,
        total_ht: toMoney(row.total_ht),
        total_tva: toMoney(row.total_tva),
        total_ttc: toMoney(row.total_ttc)
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  } catch (err) {
    console.error('[getGrandLivre] Erreur:', err);
    throw err;
  }
};

/**
 * Factures par client, avec nom client fiable depuis partenaire.
 */
const getFacturesByClient = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  try {
    const { page, pageSize, offset, pageEnd } = normalizePagination(options);
    const sort = normalizeSort(options.orderBy || 'facture_dat', options.orderDirection || 'DESC', FACTURES_CLIENT_SORT_COLUMNS, 'facture_dat', 'DESC');
    const replacements = {
      search: normalizeSearch(options.search),
      offset,
      pageEnd
    };
    const dateFilter = addDateFilter('f.facture_dat', options, replacements);

    const query = `
      ;WITH Factures AS (
        SELECT
          f.facture_id,
          fs.part_id AS client_id,
          ISNULL(p.nom, '') AS client_nom,
          f.facture_num,
          CONVERT(date, f.facture_dat) AS facture_dat,
          CAST(ISNULL(f.facture_ht, 0) AS decimal(18, 2)) AS facture_ht,
          CAST(ISNULL(f.facture_tva, 0) AS decimal(18, 2)) AS facture_tva,
          CAST(${invoiceAmountExpression} AS decimal(18, 2)) AS total_ttc
        FROM facture_souche fs
        INNER JOIN facture f ON f.facture_id = fs.facture_id
        LEFT JOIN partenaire p ON p.part_id = fs.part_id
        LEFT JOIN v_facture_montant fm ON fm.facture_id = f.facture_id
        WHERE fs.sens = 1
          AND ISNULL(f.facture_ind, 1) = 1
          AND ISNULL(f.facture_typ, '') <> 'AV'
          ${dateFilter}
      ),
      Filtered AS (
        SELECT *
        FROM Factures
        WHERE :search IS NULL
          OR client_nom LIKE :search
          OR facture_num LIKE :search
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
        client_id: row.client_id,
        client_nom: row.client_nom,
        nom: row.client_nom,
        facture_num: row.facture_num,
        facture_dat: row.facture_dat,
        facture_ht: toMoney(row.facture_ht),
        facture_tva: toMoney(row.facture_tva),
        total_ttc: toMoney(row.total_ttc)
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  } catch (err) {
    console.error('[getFacturesByClient] Erreur:', err);
    throw err;
  }
};

/**
 * Chiffre d'affaires par article. La categorie affichee est la famille.
 */
const getChiffreAffairesArticles = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  try {
    const { page, pageSize, offset, pageEnd } = normalizePagination(options);
    const sort = normalizeSort(options.orderBy || 'chiffre_affaires', options.orderDirection || 'DESC', CA_ARTICLE_SORT_COLUMNS, 'chiffre_affaires', 'DESC');
    const replacements = {
      search: normalizeSearch(options.search),
      offset,
      pageEnd
    };
    const dateFilter = addDateFilter('s.[date]', options, replacements);

    const query = `
      ;WITH ArticleTotals AS (
        SELECT
          a.article_id,
          a.article_cod,
          a.article_nom,
          ISNULL(fam.nom, '') AS categorie_nom,
          CAST(SUM(ISNULL(sd.quantite, 0)) AS decimal(18, 2)) AS quantite_vendue,
          CAST(SUM(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0)) AS decimal(18, 2)) AS chiffre_affaires_ht,
          CAST(SUM((ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0)) + (ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0) * ISNULL(sd.taux_tva, 0))) AS decimal(18, 2)) AS chiffre_affaires,
          CAST(
            CASE WHEN SUM(ISNULL(sd.quantite, 0)) <> 0
              THEN SUM(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0)) / SUM(ISNULL(sd.quantite, 0))
              ELSE 0
            END AS decimal(18, 2)
          ) AS prix_moyen_vente
        FROM stock s
        INNER JOIN stock_detail sd ON sd.stock_id = s.id
        INNER JOIN article a ON a.article_id = sd.article_id
        LEFT JOIN famille fam ON fam.id = a.famille
        WHERE s.type = 2
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
        categorie_nom: row.categorie_nom,
        famille_nom: row.categorie_nom,
        quantite_vendue: toMoney(row.quantite_vendue),
        chiffre_affaires_ht: toMoney(row.chiffre_affaires_ht),
        chiffre_affaires: toMoney(row.chiffre_affaires),
        prix_moyen_vente: toMoney(row.prix_moyen_vente)
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  } catch (err) {
    console.error('[getChiffreAffairesArticles] Erreur:', err);
    throw err;
  }
};

/**
 * Chiffre d'affaires par client base sur les factures client.
 */
const getChiffreAffairesClients = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  try {
    const { page, pageSize, offset, pageEnd } = normalizePagination(options);
    const sort = normalizeSort(options.orderBy || 'chiffre_affaires', options.orderDirection || 'DESC', CA_CLIENT_SORT_COLUMNS, 'chiffre_affaires', 'DESC');
    const replacements = {
      search: normalizeSearch(options.search),
      offset,
      pageEnd
    };
    const dateFilter = addDateFilter('f.facture_dat', options, replacements);

    const query = `
      ;WITH Factures AS (
        SELECT
          fs.part_id,
          ISNULL(p.nom, '') AS client_nom,
          f.facture_id,
          f.facture_num,
          CONVERT(date, f.facture_dat) AS facture_dat,
          CAST(ISNULL(f.facture_ht, 0) AS decimal(18, 2)) AS total_ht,
          CAST(ISNULL(f.facture_tva, 0) AS decimal(18, 2)) AS total_tva,
          CAST(${invoiceAmountExpression} AS decimal(18, 2)) AS total_ttc
        FROM facture_souche fs
        INNER JOIN facture f ON f.facture_id = fs.facture_id
        LEFT JOIN partenaire p ON p.part_id = fs.part_id
        LEFT JOIN v_facture_montant fm ON fm.facture_id = f.facture_id
        WHERE fs.sens = 1
          AND ISNULL(f.facture_ind, 1) = 1
          AND ISNULL(f.facture_typ, '') <> 'AV'
          ${dateFilter}
          AND (:search IS NULL OR p.nom LIKE :search OR f.facture_num LIKE :search)
      ),
      ClientTotals AS (
        SELECT
          part_id,
          client_nom,
          COUNT(DISTINCT facture_id) AS nombre_factures,
          CAST(SUM(total_ht) AS decimal(18, 2)) AS chiffre_affaires_ht,
          CAST(SUM(total_tva) AS decimal(18, 2)) AS total_tva,
          CAST(SUM(total_ttc) AS decimal(18, 2)) AS chiffre_affaires,
          CAST(CASE WHEN COUNT(DISTINCT facture_id) > 0 THEN SUM(total_ttc) / COUNT(DISTINCT facture_id) ELSE 0 END AS decimal(18, 2)) AS montant_moyen,
          MAX(facture_dat) AS derniere_facture_date
        FROM Factures
        GROUP BY part_id, client_nom
      ),
      LatestFacture AS (
        SELECT
          part_id,
          facture_num AS derniere_facture_num,
          ROW_NUMBER() OVER (PARTITION BY part_id ORDER BY facture_dat DESC, facture_id DESC) AS rn
        FROM Factures
      ),
      OrderedResults AS (
        SELECT
          ct.*,
          lf.derniere_facture_num,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${sort.column} ${sort.direction}, ct.client_nom ASC, ct.part_id ASC) AS RowNum
        FROM ClientTotals ct
        LEFT JOIN LatestFacture lf ON lf.part_id = ct.part_id AND lf.rn = 1
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
        client_id: row.part_id,
        client_nom: row.client_nom,
        nombre_factures: toInt(row.nombre_factures),
        chiffre_affaires_ht: toMoney(row.chiffre_affaires_ht),
        total_tva: toMoney(row.total_tva),
        chiffre_affaires: toMoney(row.chiffre_affaires),
        montant_moyen: toMoney(row.montant_moyen),
        derniere_facture_date: row.derniere_facture_date,
        derniere_facture_num: row.derniere_facture_num
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    };
  } catch (err) {
    console.error('[getChiffreAffairesClients] Erreur:', err);
    throw err;
  }
};

const getClientSuggestions = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  try {
    const term = String(options.search || '').trim();
    const limit = normalizePositiveInt(options.limit, 20, 100);
    const replacements = {
      search: term ? `%${term}%` : null,
      startsWith: term ? `${term}%` : null
    };

    const query = `
      SELECT TOP (${limit})
        p.part_id AS client_id,
        p.code AS client_code,
        p.nom AS client_nom,
        CAST(ISNULL(SUM(CASE WHEN fs.sens = 1 AND ISNULL(f.facture_typ, '') <> 'AV' THEN ${invoiceAmountExpression} ELSE 0 END), 0) AS decimal(18, 2)) AS chiffre_affaires,
        COUNT(DISTINCT CASE WHEN fs.sens = 1 AND ISNULL(f.facture_typ, '') <> 'AV' THEN f.facture_id END) AS nombre_factures
      FROM partenaire p
      LEFT JOIN facture_souche fs ON fs.part_id = p.part_id
      LEFT JOIN facture f ON f.facture_id = fs.facture_id AND ISNULL(f.facture_ind, 1) = 1
      LEFT JOIN v_facture_montant fm ON fm.facture_id = f.facture_id
      WHERE (:search IS NULL OR p.nom LIKE :search OR p.code LIKE :search)
        AND (
          p.type = 1
          OR EXISTS (SELECT 1 FROM facture_souche fs2 WHERE fs2.part_id = p.part_id AND fs2.sens = 1)
          OR EXISTS (SELECT 1 FROM stock s WHERE s.part_id = p.part_id AND s.type = 2)
        )
      GROUP BY p.part_id, p.code, p.nom
      ORDER BY
        CASE WHEN :startsWith IS NOT NULL AND p.nom LIKE :startsWith THEN 0 ELSE 1 END,
        p.nom ASC
    `;

    const rows = await sequelize.query(query, { replacements, type: sequelize.QueryTypes.SELECT });

    return {
      success: true,
      data: rows.map((row) => ({
        client_id: row.client_id,
        client_code: row.client_code,
        client_nom: row.client_nom,
        chiffre_affaires: toMoney(row.chiffre_affaires),
        nombre_factures: toInt(row.nombre_factures)
      }))
    };
  } catch (err) {
    console.error('[getClientSuggestions] Erreur:', err);
    throw err;
  }
};

const getArticleSuggestions = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  try {
    const term = String(options.search || '').trim();
    const limit = normalizePositiveInt(options.limit, 20, 100);
    const replacements = {
      search: term ? `%${term}%` : null,
      startsWith: term ? `${term}%` : null
    };

    const query = `
      SELECT TOP (${limit})
        a.article_id,
        a.article_cod,
        a.article_nom,
        ISNULL(fam.nom, '') AS famille_nom
      FROM article a
      LEFT JOIN famille fam ON fam.id = a.famille
      WHERE :search IS NULL
        OR a.article_cod LIKE :search
        OR a.article_nom LIKE :search
        OR fam.nom LIKE :search
      ORDER BY
        CASE WHEN :startsWith IS NOT NULL AND a.article_nom LIKE :startsWith THEN 0 ELSE 1 END,
        a.article_nom ASC
    `;

    const rows = await sequelize.query(query, { replacements, type: sequelize.QueryTypes.SELECT });

    return {
      success: true,
      data: rows.map((row) => ({
        article_id: row.article_id,
        article_cod: row.article_cod,
        article_nom: row.article_nom,
        famille_nom: row.famille_nom
      }))
    };
  } catch (err) {
    console.error('[getArticleSuggestions] Erreur:', err);
    throw err;
  }
};

module.exports = {
  getGrandLivre,
  getFacturesByClient,
  getChiffreAffairesArticles,
  getChiffreAffairesClients,
  getClientSuggestions,
  getArticleSuggestions
};
