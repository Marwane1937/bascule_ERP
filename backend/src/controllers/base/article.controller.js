const articleService = require('../../services/base/article.service');
const databaseSwitchService = require('../../services/database-switch.service');

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
    const article = await articleService.getArticle(req.params.id, sequelize);
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
    const updated = await articleService.editArticle(req.params.id, req.body, sequelize);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteArticle = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await articleService.deleteArticle(req.params.id, sequelize);
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
    const result = await articleService.archiveArticle(req.params.id, sequelize);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createArticle,
  deleteArticle,
  editArticle,
  getArticle,
  getArticles,
  getArticlesPaged,
  archiveArticle
};
