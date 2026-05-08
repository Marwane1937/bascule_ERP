const articleConfigService = require('../../services/base/article-config.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getArticleUnites = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const articleId = parseInt(req.params.id, 10);
    const data = await articleConfigService.getArticleUnites(articleId, sequelize);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const saveArticleUnites = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const articleId = parseInt(req.params.id, 10);
    const unites = req.body?.unites || [];
    const data = await articleConfigService.saveArticleUnites(articleId, unites, sequelize);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getDepots = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const data = await articleConfigService.getDepots(sequelize);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getArticleStocks = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const articleId = parseInt(req.params.id, 10);
    const data = await articleConfigService.getArticleStocks(articleId, sequelize);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const saveArticleStocks = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const articleId = parseInt(req.params.id, 10);
    const stocks = req.body?.stocks || [];
    const data = await articleConfigService.saveArticleStocks(articleId, stocks, sequelize);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getArticleCodes = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const articleId = parseInt(req.params.id, 10);
    const data = await articleConfigService.getArticleCodes(articleId, sequelize);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const saveArticleCodes = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const articleId = parseInt(req.params.id, 10);
    const codes = req.body?.codes || [];
    const data = await articleConfigService.saveArticleCodes(articleId, codes, sequelize);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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
