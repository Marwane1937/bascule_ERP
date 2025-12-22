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
const addArticle = async ({ article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, etat }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const [result] = await connectionToUse.query(
    `INSERT INTO article (article_cod, article_nom, famille , unite_id , prix_achat , prix_vente ,etat) 
     OUTPUT INSERTED.article_id 
     VALUES (:article_cod, :article_nom, :famille , :unite_id , :prix_achat , :prix_vente , :etat)`,
    {
      replacements: { article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, etat },
      type: connectionToUse.QueryTypes.INSERT,
    }
  );
  return result.article_id;
};

// Modifier un article
const updatArticle = async (article_id, { article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, etat }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    `UPDATE article 
     SET article_cod = :article_cod, article_nom = :article_nom , famille = :famille, 
     unite_id = :unite_id , prix_achat = :prix_achat , prix_vente = :prix_vente , etat = :etat
     WHERE article_id = :article_id`,
    {
      replacements: { article_id, article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, etat },
      type: connectionToUse.QueryTypes.UPDATE,
    }
  );
  return { article_id, article_cod, article_nom, famille, unite_id, prix_achat, prix_vente, etat };
};

// Supprimer un article par ID
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

module.exports = {
  getAllArticle,
  addArticle,
  deleteArticle,
  getArticleById,
  updatArticle
};
