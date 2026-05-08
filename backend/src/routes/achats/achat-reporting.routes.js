const express = require('express');
const router = express.Router();
const achatReportingController = require('../../controllers/achats/achat-reporting.controller');
const databaseInjector = require('../../middleware/database-injector.middleware');

router.use(databaseInjector.injectConnection.bind(databaseInjector));

router.get('/fournisseur-suggestions', achatReportingController.getFournisseurSuggestions);
router.get('/article-suggestions', achatReportingController.getArticleSuggestions);
router.get('/factures-fournisseur', achatReportingController.getFacturesFournisseur);
router.get('/achats-fournisseurs', achatReportingController.getAchatsFournisseurs);
router.get('/achats-articles', achatReportingController.getAchatsArticles);

module.exports = router;
