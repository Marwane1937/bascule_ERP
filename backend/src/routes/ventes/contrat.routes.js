const express = require('express');
const router = express.Router();
const contratController = require('../../controllers/ventes/contrat.controller');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes CRUD
router.get('/conditions-paiement', contratController.getConditionsPaiement);
router.get('/', contratController.getContrats);
router.get('/:id', contratController.getContrat);
router.post('/', contratController.createContrat);
router.post('/:id/facturer', contratController.transfererContratVersFacturation);
router.post('/save-detail', contratController.saveDetail);
router.post('/delete-lignes', contratController.deleteLignes);
router.put('/:id', contratController.updateContrat);
router.delete('/:id', contratController.deleteContrat);

module.exports = router;

