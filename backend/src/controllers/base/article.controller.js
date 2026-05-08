const articleService = require('../../services/base/article.service');
const databaseSwitchService = require('../../services/database-switch.service');

const parseArticleId = (value) => {
  const id = parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const getArticles = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const articles = await articleService.getArticles(sequelize);
    res.json({
      success: true,
      data: articles
    });
  } catch (err) {
    console.error('❌ [ArticleController] Erreur récupération articles:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const getArticle = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const articleId = parseArticleId(req.params.id);
    if (!articleId) return res.status(400).json({ message: 'Identifiant article invalide' });
    const article = await articleService.getArticle(articleId, sequelize);
    if (!article) return res.status(404).json({ message: 'Article non trouvé' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createArticle = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const newArticle = await articleService.createArticle(req.body, sequelize);
    res.status(201).json(newArticle);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const editArticle = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const articleId = parseArticleId(req.params.id);
    if (!articleId) return res.status(400).json({ message: 'Identifiant article invalide' });
    const updated = await articleService.editArticle(articleId, req.body, sequelize);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteArticle = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const articleId = parseArticleId(req.params.id);
    if (!articleId) return res.status(400).json({ message: 'Identifiant article invalide' });
    const result = await articleService.deleteArticle(articleId, sequelize);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getArticlesPaged = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'article_nom',
      orderDirection: req.query.orderDirection || 'ASC',
      search: req.query.search || ''
    };
    const result = await articleService.getArticlesPaged(options, sequelize);
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (err) {
    console.error('❌ [ArticleController] Erreur récupération articles paginés:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const archiveArticle = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const articleId = parseArticleId(req.params.id);
    if (!articleId) return res.status(400).json({ message: 'Identifiant article invalide' });
    const result = await articleService.archiveArticle(articleId, sequelize);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getArticleStockDisponible = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const articleId = parseArticleId(req.params.id);
    if (!articleId) return res.status(400).json({ message: 'Identifiant article invalide' });

    const data = await articleService.getArticleStockDisponible(articleId, sequelize);
    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('❌ [ArticleController] Erreur récupération stock disponible:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const getArticleStatistics = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const articleId = parseArticleId(req.params.id);
    if (!articleId) return res.status(400).json({ message: 'Identifiant article invalide' });

    const data = await articleService.getArticleStatistics(articleId, sequelize);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('[ArticleController] Error loading article statistics:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

module.exports = {
  createArticle,
  deleteArticle,
  editArticle,
  getArticle,
  getArticleStatistics,
  getArticleStockDisponible,
  getArticles,
  getArticlesPaged,
  archiveArticle
};
