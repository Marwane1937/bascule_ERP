const express = require('express');
const router = express.Router();
const articleController = require('../../controllers/base/article.controller');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// router pour CRUD article
router.get('/article', articleController.getArticles);
router.get('/:id', articleController.getArticle);
router.post('/', articleController.createArticle);
router.put('/:id', articleController.editArticle);
router.delete('/:id', articleController.deleteArticle);

module.exports = router;
