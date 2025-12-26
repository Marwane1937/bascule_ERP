const sequelize = require('../../config/database');

// Récupérer tous les clients
const getAllArticle = async (sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const [results] = await connectionToUse.query('SELECT * FROM article WHERE etat = 1 OR etat IS NULL');
  console.log(`[getAllArticle] ${results.length} articles actifs trouvés`);
  return results;
};


// Récupérer un article par ID
const getArticleById = async (article_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const results = await connectionToUse.query(
    'SELECT * FROM article WHERE article_id = :article_id',
    {
      replacements: { article_id },
      type: connectionToUse.QueryTypes.SELECT,
    }
  );
  return results[0];
};

// Ajouter un article
const addArticle = async ({ article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, prix_quantite, etat }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const queryResult = await connectionToUse.query(
    `INSERT INTO article (article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, prix_quantite, etat) 
     OUTPUT INSERTED.article_id AS article_id
     VALUES (:article_cod, :article_nom, :famille, :unite_id, :prix_achat, :prix_vente, :prix_quantite, :etat)`,
    {
      replacements: { article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, prix_quantite: prix_quantite || 1, etat: etat || 1 },
      type: sequelize.QueryTypes.SELECT,
    }
  );
  const rows = Array.isArray(queryResult) && Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
  const articleId = Array.isArray(rows) ? rows?.[0]?.article_id : rows?.article_id;
  return articleId;
};

// Modifier un article
const updatArticle = async (article_id, { article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, prix_quantite, etat }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    `UPDATE article 
     SET article_cod = :article_cod, article_nom = :article_nom, famille = :famille, 
     unite_id = :unite_id, prix_achat = :prix_achat, prix_vente = :prix_vente, prix_quantite = :prix_quantite, etat = :etat
     WHERE article_id = :article_id`,
    {
      replacements: { article_id, article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, prix_quantite: prix_quantite || 1, etat: etat || 1 },
      type: connectionToUse.QueryTypes.UPDATE,
    }
  );
  return { article_id, article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, prix_quantite, etat };
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
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const pageSizeRaw = parseInt(options.pageSize, 10) || 25;
  const pageSize = Math.min(Math.max(pageSizeRaw, 1), 200);
  const search = typeof options.search === 'string' ? options.search.trim() : '';

  const orderByMap = {
    article_id: 'a.article_id',
    article_cod: 'a.article_cod',
    article_nom: 'a.article_nom',
    prix_quantite: 'a.prix_quantite'
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
       a.prix_quantite,
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
