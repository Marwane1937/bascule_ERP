const articleConfigModel = require('../../models/base/article-config.model');

const getArticleUnites = async (articleId, sequelizeConnection = null) => {
  return await articleConfigModel.getArticleUnites(articleId, sequelizeConnection);
};

const saveArticleUnites = async (articleId, unites, sequelizeConnection = null) => {
  return await articleConfigModel.saveArticleUnites(articleId, unites, sequelizeConnection);
};

const getDepots = async (sequelizeConnection = null) => {
  return await articleConfigModel.getDepots(sequelizeConnection);
};

const getArticleStocks = async (articleId, sequelizeConnection = null) => {
  return await articleConfigModel.getArticleStocks(articleId, sequelizeConnection);
};

const saveArticleStocks = async (articleId, stocks, sequelizeConnection = null) => {
  return await articleConfigModel.saveArticleStocks(articleId, stocks, sequelizeConnection);
};

const getArticleCodes = async (articleId, sequelizeConnection = null) => {
  return await articleConfigModel.getArticleCodes(articleId, sequelizeConnection);
};

const saveArticleCodes = async (articleId, codes, sequelizeConnection = null) => {
  return await articleConfigModel.saveArticleCodes(articleId, codes, sequelizeConnection);
};

module.exports = {
  getArticleUnites,
  saveArticleUnites,
  getDepots,
  getArticleStocks,
  saveArticleStocks,
  getArticleCodes,
  saveArticleCodes
};
