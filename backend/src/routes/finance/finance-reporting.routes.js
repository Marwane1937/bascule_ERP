const express = require('express');
const router = express.Router();
const financeReportingController = require('../../controllers/finance/finance-reporting.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes de reporting finance
router.get('/compte-client', financeReportingController.getCompteClient);
router.get('/balance-client', financeReportingController.getBalanceClient);
router.get('/solde-client', financeReportingController.getSoldeClient);
router.get('/vue-globale', financeReportingController.getVueGlobale);

module.exports = router;









