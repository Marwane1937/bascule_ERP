const { getConnection } = require('../../config/database');
const sequelize = require('../../config/database'); // Garder pour compatibilit? QueryTypes

async function getArticleColumnSet(connectionToUse = null) {
  const conn = connectionToUse || getConnection();
  try {
    const cols = await conn.query(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'article'
      `,
      { type: connectionToUse.QueryTypes.SELECT }
    );
    return new Set((Array.isArray(cols) ? cols : []).map(c => String(c.COLUMN_NAME || '').toLowerCase()));
  } catch {
    return new Set();
  }
}

async function getViewArticleColumnSet(connectionToUse = null) {
  const conn = connectionToUse || getConnection();
  try {
    const cols = await conn.query(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'v_Article'
      `,
      { type: conn.QueryTypes.SELECT }
    );
    return new Set((Array.isArray(cols) ? cols : []).map(c => String(c.COLUMN_NAME || '').toLowerCase()));
  } catch {
    return new Set();
  }
}

// R?cup?rer tous les clients
const getAllArticle = async (sequelizeConnection = null) => {
  // Utiliser la connexion passée, sinon getConnection() pour avoir la connexion active
  const connectionToUse = sequelizeConnection || getConnection();
  const viewColSet = await getViewArticleColumnSet(connectionToUse);

  if (viewColSet.size === 0) {
    throw new Error("La vue v_Article est introuvable. getProduit utilise uniquement v_Article.");
  }

  const pickViewCol = (...candidates) => {
    for (const col of candidates) {
      if (viewColSet.has(String(col).toLowerCase())) {
        return `v.[${col}]`;
      }
    }
    return 'NULL';
  };

  const colArticleId = pickViewCol('article_id');
  const colCode = pickViewCol('Code_Article', 'article_cod', 'article_code');
  const colDesignation = pickViewCol('Designation', 'article_nom');
  const colCodeBarre = pickViewCol('code_barre', 'Code_Barre');
  const colFamille = pickViewCol('Famille', 'famille_nom');
  const colUnite = pickViewCol('Unite', 'unite_nom');
  const colQuantiteUnite = pickViewCol('Quantite_unité', 'Quantite_unite', 'quantite_unite', 'quantite');
  const colPerissabilite = pickViewCol('Perissabilite', 'perissabilite');
  const colEtat = pickViewCol('etat', 'Etat', 'etat_article');
  const colPrixAchat = pickViewCol('prix_achat', 'Prix_Achat');
  const colPrixVente = pickViewCol('prix_vente', 'Prix_Vente');
  const colDepot = pickViewCol('Depot', 'depot', 'depot_nom');
  const colStockMin = pickViewCol('stock_min', 'Stock_Min');
  const colStockMax = pickViewCol('stock_max', 'Stock_Max');
  const orderExpr = colDesignation !== 'NULL' ? colDesignation : (colCode !== 'NULL' ? colCode : colArticleId);

  const results = await connectionToUse.query(
    `SELECT
       ${colArticleId} AS article_id,
       ${colCode} AS article_cod,
       ${colDesignation} AS article_nom,
       ${colCodeBarre} AS code_barre,
       ${colFamille} AS famille_nom,
       ${colUnite} AS unite_nom,
       ${colQuantiteUnite} AS quantite_unite,
       ${colQuantiteUnite} AS quantite,
       ${colQuantiteUnite} AS prix_quantite,
       ${colStockMin} AS stock_min,
       ${colStockMax} AS stock_max,
       ${colPerissabilite} AS perissabilite,
       ${colEtat} AS etat,
       ${colPrixAchat} AS prix_achat,
       ${colPrixVente} AS prix_vente,
       ${colDepot} AS depot_nom
     FROM [v_Article] v
     ORDER BY ${orderExpr} ASC`,
    { type: connectionToUse.QueryTypes.SELECT }
  );

  console.log(`[getAllArticle] ${results.length} articles trouvés via v_Article`);
  return results;
};


// R?cup?rer un article par ID
const getArticleById = async (article_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const colSet = await getArticleColumnSet(connectionToUse);
  const hasQuantite = colSet.has('quantite');
  const hasPrixQuantite = colSet.has('prix_quantite');
  const etatCol = colSet.has('etat_article') ? 'etat_article' : 'etat';
  let sql = `SELECT *, ${etatCol} AS etat FROM article WHERE article_id = :article_id`;
  if (hasQuantite && !hasPrixQuantite) {
    sql = `SELECT *, quantite AS prix_quantite, ${etatCol} AS etat FROM article WHERE article_id = :article_id`;
  } else if (!hasQuantite && hasPrixQuantite) {
    sql = `SELECT *, prix_quantite AS quantite, ${etatCol} AS etat FROM article WHERE article_id = :article_id`;
  }
  const results = await connectionToUse.query(
    sql,
    {
      replacements: { article_id },
      type: connectionToUse.QueryTypes.SELECT,
    }
  );
  return results[0];
};

// Ajouter un article
const addArticle = async ({ article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, prix_quantite, quantite, etat, etat_article }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const colSet = await getArticleColumnSet(connectionToUse);
  const hasQuantite = colSet.has('quantite');
  const etatCol = colSet.has('etat_article') ? 'etat_article' : 'etat';
  const qtyCol = hasQuantite ? 'quantite' : 'prix_quantite';
  const qtyValue = (quantite ?? prix_quantite ?? 1);
  const etatValue = (etat_article ?? etat ?? 1);
  const queryResult = await connectionToUse.query(
    `INSERT INTO article (article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, ${qtyCol}, ${etatCol}) 
     OUTPUT INSERTED.article_id AS article_id
     VALUES (:article_cod, :article_nom, :famille, :unite_id, :prix_achat, :prix_vente, :qty_value, :etat_value)`,
    {
      replacements: {
        article_cod,
        article_nom,
        famille,
        unite_id,
        prix_achat,
        prix_vente,
        qty_value: qtyValue,
        etat_value: etatValue
      },
      type: sequelize.QueryTypes.SELECT,
    }
  );
  const rows = Array.isArray(queryResult) && Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
  const articleId = Array.isArray(rows) ? rows?.[0]?.article_id : rows?.article_id;
  return articleId;
};

// Modifier un article
// Note: certains champs sont optionnels (ex: quill_editor, quantite).
// Sur certains environnements, ces colonnes peuvent ne pas exister (ou ?tre ajout?es plus tard).
// On d?tecte donc les colonnes existantes pour ?viter une erreur SQL (500) lors de l'UPDATE.
const updatArticle = async (article_id, { article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, prix_quantite, etat, etat_article, quill_editor, quantite }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;

  // D?tecter les colonnes disponibles une fois par appel (l?ger) ? ?vite "Invalid column name"
  let columns = [];
  try {
    columns = await connectionToUse.query(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'article'
      `,
      { type: connectionToUse.QueryTypes.SELECT }
    );
  } catch (e) {
    // si la d?tection ?choue, on continue sans les champs optionnels
    columns = [];
  }

  const colSet = new Set((Array.isArray(columns) ? columns : []).map(c => String(c.COLUMN_NAME || '').toLowerCase()));
  const hasQuillEditor = colSet.has('quill_editor');
  const hasQuantite = colSet.has('quantite');
  const hasPrixQuantite = colSet.has('prix_quantite');
  const etatCol = colSet.has('etat_article') ? 'etat_article' : 'etat';
  const qtyValue = (quantite ?? prix_quantite ?? null);
  const etatValue = (etat_article ?? etat ?? 1);

  let sql = `UPDATE article
     SET article_cod = :article_cod, article_nom = :article_nom, famille = :famille,
     unite_id = :unite_id, prix_achat = :prix_achat, prix_vente = :prix_vente, ${etatCol} = :etat_value`;

  // Compat: vous avez renomm? prix_quantite -> quantite
  if (hasQuantite) {
    sql += `, quantite = COALESCE(:qty_value, quantite)`;
  } else if (hasPrixQuantite) {
    sql += `, prix_quantite = COALESCE(:qty_value, prix_quantite)`;
  }

  if (hasQuillEditor) {
    sql += `, quill_editor = COALESCE(:quill_editor, quill_editor)`;
  }

  sql += ` WHERE article_id = :article_id`;

  await connectionToUse.query(sql, {
    replacements: {
      article_id,
      article_cod,
      article_nom,
      famille,
      unite_id,
      prix_achat,
      prix_vente,
      etat_value: etatValue,
      qty_value: qtyValue,
      quill_editor: quill_editor ?? null,
    },
    type: connectionToUse.QueryTypes.UPDATE
  });

  return {
    article_id,
    article_cod,
    article_nom,
    famille,
    unite_id,
    prix_achat,
    prix_vente,
    etat: etatValue,
    prix_quantite: hasPrixQuantite ? prix_quantite : undefined,
    quill_editor: hasQuillEditor ? quill_editor : undefined,
    quantite: hasQuantite ? quantite : undefined
  };
};

// Supprimer un article par ID (suppression physique)
const deleteArticle = async (article_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    'DELETE FROM article WHERE article_id = :article_id',
    {
      replacements: { article_id },
      type: connectionToUse.QueryTypes.DELETE,
    }
  );
};

// Archiver un article (etat = 0)
const archiveArticle = async (article_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const colSet = await getArticleColumnSet(connectionToUse);
  const etatCol = colSet.has('etat_article') ? 'etat_article' : 'etat';
  await connectionToUse.query(
    `UPDATE article SET ${etatCol} = 0 WHERE article_id = :article_id`,
    {
      replacements: { article_id },
      type: connectionToUse.QueryTypes.UPDATE,
    }
  );
};

// R?cup?rer les articles pagin?s
const getArticlesPaged = async (options = {}, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const pageSizeRaw = parseInt(options.pageSize, 10) || 25;
  const pageSize = Math.min(Math.max(pageSizeRaw, 1), 200);
  const search = typeof options.search === 'string' ? options.search.trim() : '';
  const offset = (page - 1) * pageSize;
  const orderDirection = (options.orderDirection || 'ASC').toString().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  const viewColSet = await getViewArticleColumnSet(connectionToUse);

  if (viewColSet.size > 0) {
    const pickViewCol = (...candidates) => {
      for (const col of candidates) {
        if (viewColSet.has(String(col).toLowerCase())) {
          return `v.[${col}]`;
        }
      }
      return 'NULL';
    };

    const colArticleId = pickViewCol('article_id');
    const colCode = pickViewCol('Code_Article', 'article_cod', 'article_code');
    const colDesignation = pickViewCol('Designation', 'article_nom');
    const colCodeBarre = pickViewCol('code_barre', 'Code_Barre');
    const colFamille = pickViewCol('Famille', 'famille_nom');
    const colUnite = pickViewCol('Unite', 'unite_nom');
    const colQuantiteUnite = pickViewCol('Quantite_unit?', 'Quantite_unite', 'quantite_unite', 'quantite');
    const colPerissabilite = pickViewCol('Perissabilite', 'perissabilite');
    const colEtat = pickViewCol( 'etat', 'Etat');
    const colPrixAchat = pickViewCol('prix_achat', 'Prix_Achat');
    const colPrixVente = pickViewCol('prix_vente', 'Prix_Vente');
    const colDepot = pickViewCol('Depot', 'depot', 'depot_nom');
    const colStockMin = pickViewCol('stock_min', 'Stock_Min');
    const colStockMax = pickViewCol('stock_max', 'Stock_Max');

    const orderByMapView = {
      article_id: colArticleId !== 'NULL' ? colArticleId : 'v.[article_id]',
      article_cod: colCode !== 'NULL' ? colCode : (colDesignation !== 'NULL' ? colDesignation : 'v.[article_id]'),
      article_nom: colDesignation !== 'NULL' ? colDesignation : (colCode !== 'NULL' ? colCode : 'v.[article_id]'),
      code_barre: colCodeBarre !== 'NULL' ? colCodeBarre : (colCode !== 'NULL' ? colCode : 'v.[article_id]'),
      famille_nom: colFamille !== 'NULL' ? colFamille : (colDesignation !== 'NULL' ? colDesignation : 'v.[article_id]'),
      unite_nom: colUnite !== 'NULL' ? colUnite : (colDesignation !== 'NULL' ? colDesignation : 'v.[article_id]'),
      quantite_unite: colQuantiteUnite !== 'NULL' ? colQuantiteUnite : (colDesignation !== 'NULL' ? colDesignation : 'v.[article_id]'),
      prix_quantite: colQuantiteUnite !== 'NULL' ? colQuantiteUnite : (colDesignation !== 'NULL' ? colDesignation : 'v.[article_id]'),
      prix_achat: colPrixAchat !== 'NULL' ? colPrixAchat : (colDesignation !== 'NULL' ? colDesignation : 'v.[article_id]'),
      prix_vente: colPrixVente !== 'NULL' ? colPrixVente : (colDesignation !== 'NULL' ? colDesignation : 'v.[article_id]'),
      depot_nom: colDepot !== 'NULL' ? colDepot : (colDesignation !== 'NULL' ? colDesignation : 'v.[article_id]'),
      perissabilite: colPerissabilite !== 'NULL' ? colPerissabilite : (colDesignation !== 'NULL' ? colDesignation : 'v.[article_id]'),
      etat: colEtat !== 'NULL' ? colEtat : (colDesignation !== 'NULL' ? colDesignation : 'v.[article_id]'),
      stock_min: colStockMin !== 'NULL' ? colStockMin : (colDesignation !== 'NULL' ? colDesignation : 'v.[article_id]'),
      stock_max: colStockMax !== 'NULL' ? colStockMax : (colDesignation !== 'NULL' ? colDesignation : 'v.[article_id]')
    };
    const orderByView = orderByMapView[(options.orderBy || '').toString()] || orderByMapView.article_nom;

    const searchClauses = [];
    if (colDesignation !== 'NULL') searchClauses.push(`${colDesignation} LIKE '%' + :search + '%'`);
    if (colCode !== 'NULL') searchClauses.push(`${colCode} LIKE '%' + :search + '%'`);
    if (colCodeBarre !== 'NULL') searchClauses.push(`${colCodeBarre} LIKE '%' + :search + '%'`);
    if (colFamille !== 'NULL') searchClauses.push(`${colFamille} LIKE '%' + :search + '%'`);
    if (colDepot !== 'NULL') searchClauses.push(`${colDepot} LIKE '%' + :search + '%'`);
    if (colArticleId !== 'NULL') searchClauses.push(`CAST(${colArticleId} AS NVARCHAR(50)) LIKE '%' + :search + '%'`);
    const whereSearchView = (search && searchClauses.length > 0) ? `AND (${searchClauses.join(' OR ')})` : '';
    const totalResult = await connectionToUse.query(
      `SELECT COUNT(1) AS total
       FROM [v_Article] v
       WHERE 1 = 1
       ${whereSearchView}`,
      {
        replacements: { search },
        type: connectionToUse.QueryTypes.SELECT
      }
    );

    const total = parseInt(totalResult?.[0]?.total, 10) || 0;
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

    const data = await connectionToUse.query(
      `SELECT
         ${colArticleId} AS article_id,
         ${colCode} AS article_cod,
         ${colDesignation} AS article_nom,
         ${colCodeBarre} AS code_barre,
         ${colFamille} AS famille_nom,
         ${colUnite} AS unite_nom,
         ${colQuantiteUnite} AS quantite_unite,
         ${colQuantiteUnite} AS quantite,
         ${colQuantiteUnite} AS prix_quantite,
         ${colPerissabilite} AS perissabilite,
         ${colEtat} AS etat,
         ${colPrixAchat} AS prix_achat,
         ${colPrixVente} AS prix_vente,
         ${colDepot} AS depot_nom,
         ${colStockMin} AS stock_min,
         ${colStockMax} AS stock_max
       FROM [v_Article] v
       WHERE 1 = 1
       ${whereSearchView}
       ORDER BY ${orderByView} ${orderDirection}
       OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
      {
        replacements: { search, offset, pageSize },
        type: connectionToUse.QueryTypes.SELECT
      }
    );

    return { data, pagination: { total, page, pageSize, totalPages } };
  } else {
    console.warn('[getArticlesPaged] Vue v_Article introuvable. Fallback sur table article.');
    const colSet = await getArticleColumnSet(connectionToUse);
    const hasQuantite = colSet.has('quantite');
    const hasPrixQuantite = colSet.has('prix_quantite');
    const etatCol = colSet.has('etat') ? 'a.etat' : 'a.etat';
    const qtyCol = hasQuantite ? 'a.quantite' : (hasPrixQuantite ? 'a.prix_quantite' : 'NULL');

    const orderByMapTable = {
      article_id: 'a.article_id',
      article_cod: 'a.article_cod',
      article_nom: 'a.article_nom',
      prix_quantite: qtyCol,
      quantite: qtyCol,
      prix_achat: 'a.prix_achat',
      prix_vente: 'a.prix_vente',
      etat: etatCol,
      stock_min: 'NULL',
      stock_max: 'NULL'
    };
    const orderByTable = orderByMapTable[(options.orderBy || '').toString()] || orderByMapTable.article_nom;

    const whereSearchTable = search
      ? `AND (
          a.article_nom LIKE '%' + :search + '%'
          OR a.article_cod LIKE '%' + :search + '%'
          OR CAST(a.article_id AS NVARCHAR(50)) LIKE '%' + :search + '%'
        )`
      : '';

    const totalResult = await connectionToUse.query(
      `SELECT COUNT(1) AS total
       FROM article a
       WHERE 1 = 1
       ${whereSearchTable}`,
      {
        replacements: { search },
        type: connectionToUse.QueryTypes.SELECT
      }
    );

    const total = parseInt(totalResult?.[0]?.total, 10) || 0;
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

    const data = await connectionToUse.query(
      `SELECT
         a.article_id,
         a.article_cod,
         a.article_nom,
         NULL AS code_barre,
         f.nom AS famille_nom,
         u.nom AS unite_nom,
         ${qtyCol} AS quantite_unite,
         ${qtyCol} AS quantite,
         ${qtyCol} AS prix_quantite,
         NULL AS perissabilite,
         ${etatCol} AS etat,
         a.prix_achat,
         a.prix_vente,
         NULL AS depot_nom,
         NULL AS stock_min,
         NULL AS stock_max
       FROM article a
       LEFT JOIN famille f ON a.famille = f.id
       LEFT JOIN unite u ON a.unite_id = u.id
       WHERE 1 = 1
       ${whereSearchTable}
       ORDER BY ${orderByTable} ${orderDirection}
       OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
      {
        replacements: { search, offset, pageSize },
        type: connectionToUse.QueryTypes.SELECT
      }
    );

    return { data, pagination: { total, page, pageSize, totalPages } };
  }
};

const getStockDisponibleByArticleId = async (article_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || getConnection();
  const rows = await connectionToUse.query(
    `SELECT TOP 1 [article_id], [stock_disponible]
     FROM [v_stock_calcul]
     WHERE article_id = :article_id`,
    {
      replacements: { article_id },
      type: connectionToUse.QueryTypes.SELECT
    }
  );

  return rows?.[0] || { article_id, stock_disponible: 0 };
};

const toNumericValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getArticleStatistics = async (article_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || getConnection();
  const articleId = parseInt(article_id, 10);

  const [article, stockDisponibleRow, salesSummaryRows, purchaseSummaryRows, monthlySalesRows, purchaseSuppliersRows, configuredSuppliersRows] = await Promise.all([
    getArticleById(articleId, connectionToUse),
    getStockDisponibleByArticleId(articleId, connectionToUse),
    connectionToUse.query(
      `
        SELECT
          COUNT(DISTINCT s.id) AS deliveries_count,
          COUNT(DISTINCT s.part_id) AS clients_count,
          SUM(ISNULL(sd.quantite, 0)) AS quantity_sold,
          SUM(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0)) AS revenue_ht,
          SUM(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0) * ISNULL(sd.taux_tva, 0)) AS tva_total,
          SUM(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0) * (1 + ISNULL(sd.taux_tva, 0))) AS revenue_ttc,
          CASE
            WHEN SUM(ISNULL(sd.quantite, 0)) = 0 THEN 0
            ELSE SUM(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0)) / NULLIF(SUM(ISNULL(sd.quantite, 0)), 0)
          END AS average_sale_price,
          MAX(CAST(s.date AS date)) AS last_sale_date
        FROM stock_detail sd
        INNER JOIN stock s ON s.id = sd.stock_id
        WHERE sd.article_id = :article_id AND s.type = 2
      `,
      {
        replacements: { article_id: articleId },
        type: connectionToUse.QueryTypes.SELECT
      }
    ),
    connectionToUse.query(
      `
        SELECT
          COUNT(DISTINCT s.id) AS receptions_count,
          COUNT(DISTINCT s.part_id) AS suppliers_count,
          SUM(ISNULL(sd.quantite, 0)) AS quantity_purchased,
          SUM(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0)) AS purchase_total,
          CASE
            WHEN SUM(ISNULL(sd.quantite, 0)) = 0 THEN 0
            ELSE SUM(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0)) / NULLIF(SUM(ISNULL(sd.quantite, 0)), 0)
          END AS weighted_average_cost,
          MAX(CAST(s.date AS date)) AS last_purchase_date
        FROM stock_detail sd
        INNER JOIN stock s ON s.id = sd.stock_id
        WHERE sd.article_id = :article_id AND s.type = 1
      `,
      {
        replacements: { article_id: articleId },
        type: connectionToUse.QueryTypes.SELECT
      }
    ),
    connectionToUse.query(
      `
        SELECT TOP 12
          CONVERT(char(7), CAST(s.date AS date), 120) AS month_key,
          YEAR(CAST(s.date AS date)) AS year_num,
          MONTH(CAST(s.date AS date)) AS month_num,
          SUM(ISNULL(sd.quantite, 0)) AS quantity_sold,
          SUM(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0)) AS revenue_ht
        FROM stock_detail sd
        INNER JOIN stock s ON s.id = sd.stock_id
        WHERE sd.article_id = :article_id AND s.type = 2
        GROUP BY CONVERT(char(7), CAST(s.date AS date), 120), YEAR(CAST(s.date AS date)), MONTH(CAST(s.date AS date))
        ORDER BY year_num DESC, month_num DESC
      `,
      {
        replacements: { article_id: articleId },
        type: connectionToUse.QueryTypes.SELECT
      }
    ),
    connectionToUse.query(
      `
        SELECT TOP 6
          COALESCE(p.nom, 'Fournisseur inconnu') AS fournisseur,
          SUM(ISNULL(sd.quantite, 0)) AS quantity_purchased,
          SUM(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0)) AS purchase_total,
          CASE
            WHEN SUM(ISNULL(sd.quantite, 0)) = 0 THEN 0
            ELSE SUM(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0)) / NULLIF(SUM(ISNULL(sd.quantite, 0)), 0)
          END AS average_cost,
          MAX(CAST(s.date AS date)) AS last_purchase_date
        FROM stock_detail sd
        INNER JOIN stock s ON s.id = sd.stock_id
        LEFT JOIN partenaire p ON p.part_id = s.part_id AND p.type = 2
        WHERE sd.article_id = :article_id AND s.type = 1
        GROUP BY COALESCE(p.nom, 'Fournisseur inconnu')
        ORDER BY purchase_total DESC
      `,
      {
        replacements: { article_id: articleId },
        type: connectionToUse.QueryTypes.SELECT
      }
    ),
    connectionToUse.query(
      `
        SELECT
          ac.ligne,
          ac.code,
          ac.description,
          ac.part_id,
          COALESCE(p.nom, 'Fournisseur configuré') AS fournisseur
        FROM article_code ac
        LEFT JOIN partenaire p ON p.part_id = ac.part_id AND p.type = 2
        WHERE ac.article_id = :article_id
        ORDER BY ac.ligne ASC
      `,
      {
        replacements: { article_id: articleId },
        type: connectionToUse.QueryTypes.SELECT
      }
    )
  ]);

  if (!article) {
    return null;
  }

  const salesRow = Array.isArray(salesSummaryRows) ? (salesSummaryRows[0] || {}) : {};
  const purchaseRow = Array.isArray(purchaseSummaryRows) ? (purchaseSummaryRows[0] || {}) : {};
  const currentCost = toNumericValue(article.prix_achat, 0);
  const weightedAverageCost = toNumericValue(purchaseRow.weighted_average_cost, currentCost);
  const selectedCost = weightedAverageCost > 0 ? weightedAverageCost : currentCost;
  const revenueHt = toNumericValue(salesRow.revenue_ht, 0);
  const quantitySold = toNumericValue(salesRow.quantity_sold, 0);
  const estimatedCostTotal = quantitySold * selectedCost;
  const estimatedMargin = revenueHt - estimatedCostTotal;
  const supplierBreakdownSource = Array.isArray(purchaseSuppliersRows) && purchaseSuppliersRows.length > 0
    ? purchaseSuppliersRows
    : (Array.isArray(configuredSuppliersRows) ? configuredSuppliersRows.map((row) => ({ fournisseur: row.fournisseur, purchase_total: 1 })) : []);

  const supplierMap = new Map();

  (Array.isArray(configuredSuppliersRows) ? configuredSuppliersRows : []).forEach((row) => {
    const key = String(row.fournisseur || row.part_id || row.code || '').trim();
    if (!key) return;
    supplierMap.set(key, {
      fournisseur: row.fournisseur,
      code: row.code || null,
      part_id: row.part_id || null,
      source: 'configuration',
      purchase_total: 0,
      quantity_purchased: 0,
      average_cost: null,
      last_purchase_date: null
    });
  });

  (Array.isArray(purchaseSuppliersRows) ? purchaseSuppliersRows : []).forEach((row) => {
    const key = String(row.fournisseur || '').trim();
    if (!key) return;
    const existing = supplierMap.get(key) || {
      fournisseur: row.fournisseur,
      code: null,
      part_id: null,
      source: 'historique'
    };

    supplierMap.set(key, {
      ...existing,
      fournisseur: row.fournisseur,
      source: existing.source === 'configuration' ? 'configuration+historique' : 'historique',
      purchase_total: toNumericValue(row.purchase_total, 0),
      quantity_purchased: toNumericValue(row.quantity_purchased, 0),
      average_cost: toNumericValue(row.average_cost, 0),
      last_purchase_date: row.last_purchase_date || null
    });
  });

  return {
    article: {
      article_id: article.article_id,
      article_cod: article.article_cod || '',
      article_nom: article.article_nom || '',
      prix_achat: currentCost,
      prix_vente: toNumericValue(article.prix_vente, 0),
      stock_disponible: toNumericValue(stockDisponibleRow?.stock_disponible, 0)
    },
    sales: {
      deliveries_count: toNumericValue(salesRow.deliveries_count, 0),
      clients_count: toNumericValue(salesRow.clients_count, 0),
      quantity_sold: quantitySold,
      revenue_ht: revenueHt,
      tva_total: toNumericValue(salesRow.tva_total, 0),
      revenue_ttc: toNumericValue(salesRow.revenue_ttc, 0),
      average_sale_price: toNumericValue(salesRow.average_sale_price, 0),
      last_sale_date: salesRow.last_sale_date || null
    },
    purchases: {
      receptions_count: toNumericValue(purchaseRow.receptions_count, 0),
      suppliers_count: toNumericValue(purchaseRow.suppliers_count, supplierMap.size),
      quantity_purchased: toNumericValue(purchaseRow.quantity_purchased, 0),
      purchase_total: toNumericValue(purchaseRow.purchase_total, 0),
      weighted_average_cost: weightedAverageCost,
      current_cost: currentCost,
      last_purchase_date: purchaseRow.last_purchase_date || null
    },
    margin: {
      selected_cost: selectedCost,
      unit_margin: toNumericValue(salesRow.average_sale_price, 0) - selectedCost,
      estimated_cost_total: estimatedCostTotal,
      estimated_margin_total: estimatedMargin,
      margin_rate: revenueHt > 0 ? (estimatedMargin / revenueHt) * 100 : 0
    },
    suppliers: Array.from(supplierMap.values()),
    charts: {
      monthly_sales: (Array.isArray(monthlySalesRows) ? monthlySalesRows : [])
        .slice()
        .reverse()
        .map((row) => ({
          month_key: row.month_key,
          revenue_ht: toNumericValue(row.revenue_ht, 0),
          quantity_sold: toNumericValue(row.quantity_sold, 0)
        })),
      supplier_breakdown: supplierBreakdownSource.map((row) => ({
        label: row.fournisseur || 'Fournisseur',
        value: Math.max(toNumericValue(row.purchase_total, 0), 0)
      }))
    }
  };
};
module.exports = {
  getAllArticle,
  addArticle,
  deleteArticle,
  getArticleById,
  updatArticle,
  archiveArticle,
  getArticlesPaged,
  getStockDisponibleByArticleId,
  getArticleStatistics
};


