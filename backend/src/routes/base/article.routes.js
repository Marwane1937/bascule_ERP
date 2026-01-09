const express = require('express');
const router = express.Router();
const articleController = require('../../controllers/base/article.controller');
const articleNomenclatureController = require('../../controllers/base/article-nomenclature.controller');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// router pour CRUD article
// Routes spécifiques AVANT les routes paramétrées
router.get('/article/paged', articleController.getArticlesPaged);
router.get('/article', articleController.getArticles);
// Liste des articles qui possèdent une nomenclature (Compose_id distinct)
router.get('/article/nomenclature', articleNomenclatureController.listComposedArticles);
// Nomenclature (doit être avant /:id)
router.get('/:id/nomenclature', articleNomenclatureController.listByComposeId);
router.post('/:id/nomenclature', articleNomenclatureController.createLine);
router.put('/:id/nomenclature/:composant_id', articleNomenclatureController.updateLine);
router.delete('/:id/nomenclature/:composant_id', articleNomenclatureController.deleteLine);
router.get('/:id', articleController.getArticle);
router.post('/', articleController.createArticle);
router.put('/:id', articleController.editArticle);
router.put('/:id/archive', articleController.archiveArticle);
router.delete('/:id', articleController.deleteArticle);

module.exports = router;
