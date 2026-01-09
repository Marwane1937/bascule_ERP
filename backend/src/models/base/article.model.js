const sequelize = require('../../config/database');

async function getArticleColumnSet(connectionToUse) {
  try {
    const cols = await connectionToUse.query(
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

// Récupérer tous les clients
const getAllArticle = async (sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const colSet = await getArticleColumnSet(connectionToUse);
  const hasQuantite = colSet.has('quantite');
  const hasPrixQuantite = colSet.has('prix_quantite');
  let sql = 'SELECT * FROM article WHERE etat = 1 OR etat IS NULL';
  // Compat API: si la colonne a été renommée, exposer aussi l'autre nom
  if (hasQuantite && !hasPrixQuantite) {
    sql = 'SELECT *, quantite AS prix_quantite FROM article WHERE etat = 1 OR etat IS NULL';
  } else if (!hasQuantite && hasPrixQuantite) {
    sql = 'SELECT *, prix_quantite AS quantite FROM article WHERE etat = 1 OR etat IS NULL';
  }
  const [results] = await connectionToUse.query(sql);
  console.log(`[getAllArticle] ${results.length} articles actifs trouvés`);
  return results;
};


// Récupérer un article par ID
const getArticleById = async (article_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const colSet = await getArticleColumnSet(connectionToUse);
  const hasQuantite = colSet.has('quantite');
  const hasPrixQuantite = colSet.has('prix_quantite');
  let sql = 'SELECT * FROM article WHERE article_id = :article_id';
  if (hasQuantite && !hasPrixQuantite) {
    sql = 'SELECT *, quantite AS prix_quantite FROM article WHERE article_id = :article_id';
  } else if (!hasQuantite && hasPrixQuantite) {
    sql = 'SELECT *, prix_quantite AS quantite FROM article WHERE article_id = :article_id';
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
const addArticle = async ({ article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, prix_quantite, quantite, etat }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const colSet = await getArticleColumnSet(connectionToUse);
  const hasQuantite = colSet.has('quantite');
  const qtyCol = hasQuantite ? 'quantite' : 'prix_quantite';
  const qtyValue = (quantite ?? prix_quantite ?? 1);
  const queryResult = await connectionToUse.query(
    `INSERT INTO article (article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, ${qtyCol}, etat) 
     OUTPUT INSERTED.article_id AS article_id
     VALUES (:article_cod, :article_nom, :famille, :unite_id, :prix_achat, :prix_vente, :qty_value, :etat)`,
    {
      replacements: {
        article_cod,
        article_nom,
        famille,
        unite_id,
        prix_achat,
        prix_vente,
        qty_value: qtyValue,
        etat: etat || 1
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
// Sur certains environnements, ces colonnes peuvent ne pas exister (ou être ajoutées plus tard).
// On détecte donc les colonnes existantes pour éviter une erreur SQL (500) lors de l'UPDATE.
const updatArticle = async (article_id, { article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, prix_quantite, etat, quill_editor, quantite }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;

  // Détecter les colonnes disponibles une fois par appel (léger) — évite "Invalid column name"
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
    // si la détection échoue, on continue sans les champs optionnels
    columns = [];
  }

  const colSet = new Set((Array.isArray(columns) ? columns : []).map(c => String(c.COLUMN_NAME || '').toLowerCase()));
  const hasQuillEditor = colSet.has('quill_editor');
  const hasQuantite = colSet.has('quantite');
  const hasPrixQuantite = colSet.has('prix_quantite');
  const qtyValue = (quantite ?? prix_quantite ?? null);

  let sql = `UPDATE article
     SET article_cod = :article_cod, article_nom = :article_nom, famille = :famille,
     unite_id = :unite_id, prix_achat = :prix_achat, prix_vente = :prix_vente, etat = :etat`;

  // Compat: vous avez renommé prix_quantite -> quantite
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
      etat: etat ?? 1,
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
    prix_quantite: hasPrixQuantite ? prix_quantite : undefined,
    etat,
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
  await connectionToUse.query(
    'UPDATE article SET etat = 0 WHERE article_id = :article_id',
    {
      replacements: { article_id },
      type: connectionToUse.QueryTypes.UPDATE,
    }
  );
};

// Récupérer les articles paginés
const getArticlesPaged = async (options = {}, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const colSet = await getArticleColumnSet(connectionToUse);
  const hasQuantite = colSet.has('quantite');
  const hasPrixQuantite = colSet.has('prix_quantite');
  const qtyCol = hasQuantite ? 'a.quantite' : (hasPrixQuantite ? 'a.prix_quantite' : 'NULL');
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const pageSizeRaw = parseInt(options.pageSize, 10) || 25;
  const pageSize = Math.min(Math.max(pageSizeRaw, 1), 200);
  const search = typeof options.search === 'string' ? options.search.trim() : '';

  const orderByMap = {
    article_id: 'a.article_id',
    article_cod: 'a.article_cod',
    article_nom: 'a.article_nom',
    prix_quantite: qtyCol,
    quantite: qtyCol
  };
  const orderBy = orderByMap[(options.orderBy || '').toString()] || orderByMap.article_nom;
  const orderDirection = (options.orderDirection || 'ASC').toString().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const offset = (page - 1) * pageSize;

  const whereSearch = search
    ? `AND (
        a.article_nom LIKE '%' + :search + '%'
        OR a.article_cod LIKE '%' + :search + '%'
        OR CAST(a.article_id AS NVARCHAR(50)) LIKE '%' + :search + '%'
      )`
    : '';

  // Compter le total (uniquement les articles actifs: etat = 1 ou NULL)
  const totalResult = await connectionToUse.query(
    `SELECT COUNT(1) AS total
     FROM article a
     WHERE (a.etat = 1 OR a.etat IS NULL)
     ${whereSearch}`,
    {
      replacements: { search },
      type: connectionToUse.QueryTypes.SELECT
    }
  );

  const total = parseInt(totalResult?.[0]?.total, 10) || 0;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  // Récupérer les données avec jointures pour famille et unité
  const data = await connectionToUse.query(
    `SELECT 
       a.article_id,
       a.article_cod,
       a.article_nom,
       a.prix_achat,
       a.prix_vente,
       ${qtyCol} AS quantite,
       ${qtyCol} AS prix_quantite,
       a.famille,
       a.unite_id,
       a.etat,
       f.nom AS famille_nom,
       u.nom AS unite_nom
     FROM article a
     LEFT JOIN famille f ON a.famille = f.id
     LEFT JOIN unite u ON a.unite_id = u.id
     WHERE (a.etat = 1 OR a.etat IS NULL)
     ${whereSearch}
     ORDER BY ${orderBy} ${orderDirection}
     OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
    {
      replacements: { search, offset, pageSize },
      type: connectionToUse.QueryTypes.SELECT
    }
  );

  return { data, pagination: { total, page, pageSize, totalPages } };
};

module.exports = {
  getAllArticle,
  addArticle,
  deleteArticle,
  getArticleById,
  updatArticle,
  archiveArticle,
  getArticlesPaged
};
