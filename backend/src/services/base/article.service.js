// services/clientService.js
const articleModel = require('../../models/base/article.model');

// Obtenir tous les article
const getArticles = async (sequelizeConnection = null) => {
  return await articleModel.getAllArticle(sequelizeConnection);
};

// Obtenir un article par ID
const getArticle = async (article_id, sequelizeConnection = null) => {
  const article = await articleModel.getArticleById(article_id, sequelizeConnection);
  if (!article) {
    throw new Error('article non trouvé');
  }
  return article;
};

// Créer un nouveau article
const createArticle = async (articleData, sequelizeConnection = null) => {
  const article_id = await articleModel.addArticle(articleData, sequelizeConnection);
  return { article_id, ...articleData };
};

// Modifier un article existant
const editArticle = async (article_id, articleData, sequelizeConnection = null) => {
  const article = await articleModel.getArticleById(article_id, sequelizeConnection);
  if (!article) {
    throw new Error('article à modifier non trouvé');
  }
  return await articleModel.updatArticle(article_id, articleData, sequelizeConnection);
};

// supprimé un article existant
const deleteArticle = async (article_id, sequelizeConnection = null) => {
  const article = await articleModel.getArticleById(article_id, sequelizeConnection);
  if (!article) {
    throw new Error('article non trouvé');
  }
  await articleModel.deleteArticle(article_id, sequelizeConnection);
  return { message: 'article supprimé avec succès' };
};

// Archiver un article
const archiveArticle = async (article_id, sequelizeConnection = null) => {
  const article = await articleModel.getArticleById(article_id, sequelizeConnection);
  if (!article) {
    throw new Error('article non trouvé');
  }
  await articleModel.archiveArticle(article_id, sequelizeConnection);
  return { message: 'article archivé avec succès' };
};

// Récupérer les articles paginés
const getArticlesPaged = async (options = {}, sequelizeConnection = null) => {
  return await articleModel.getArticlesPaged(options, sequelizeConnection);
};

module.exports = {
  getArticles,
  getArticlesPaged,
  deleteArticle,
  createArticle,
  editArticle,
  getArticle,
  archiveArticle
};
