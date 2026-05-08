const express = require('express');
const router = express.Router();
const articleController = require('../../controllers/base/article.controller');
const articleNomenclatureController = require('../../controllers/base/article-nomenclature.controller');
const articleConfigController = require('../../controllers/base/article-config.controller');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

const requireNumericId = (paramName) => (req, res, next) => {
  const n = parseInt(req.params[paramName], 10);
  if (!Number.isInteger(n) || n <= 0) {
    return res.status(400).json({ message: `Paramètre ${paramName} invalide` });
  }
  req.params[paramName] = String(n);
  next();
};

// router pour CRUD article
// Routes spécifiques AVANT les routes paramétrées
router.get('/article/paged', articleController.getArticlesPaged);
router.get('/article', articleController.getArticles);
router.get('/nomenclature', articleNomenclatureController.listComposedArticles);
// Liste des articles qui possèdent une nomenclature (Compose_id distinct)
router.get('/article/nomenclature', articleNomenclatureController.listComposedArticles);
router.get('/depots', articleConfigController.getDepots);
// Nomenclature (doit être avant /:id)
router.get('/:id/nomenclature', requireNumericId('id'), articleNomenclatureController.listByComposeId);
router.post('/:id/nomenclature', requireNumericId('id'), articleNomenclatureController.createLine);
router.put('/:id/nomenclature/:composant_id', requireNumericId('id'), requireNumericId('composant_id'), articleNomenclatureController.updateLine);
router.delete('/:id/nomenclature/:composant_id', requireNumericId('id'), requireNumericId('composant_id'), articleNomenclatureController.deleteLine);
router.get('/:id/unites', requireNumericId('id'), articleConfigController.getArticleUnites);
router.put('/:id/unites', requireNumericId('id'), articleConfigController.saveArticleUnites);
router.get('/:id/stock-config', requireNumericId('id'), articleConfigController.getArticleStocks);
router.put('/:id/stock-config', requireNumericId('id'), articleConfigController.saveArticleStocks);
router.get('/:id/stock-disponible', requireNumericId('id'), articleController.getArticleStockDisponible);
router.get('/:id/stats', requireNumericId('id'), articleController.getArticleStatistics);
router.get('/:id/codes', requireNumericId('id'), articleConfigController.getArticleCodes);
router.put('/:id/codes', requireNumericId('id'), articleConfigController.saveArticleCodes);
router.get('/:id', requireNumericId('id'), articleController.getArticle);
router.post('/', articleController.createArticle);
router.put('/:id', requireNumericId('id'), articleController.editArticle);
router.put('/:id/archive', requireNumericId('id'), articleController.archiveArticle);
router.delete('/:id', requireNumericId('id'), articleController.deleteArticle);

module.exports = router;

