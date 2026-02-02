const express = require('express');
const router = express.Router();
const bordereauRemiseController = require('../../controllers/finance/bordereau-remise.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour CRUD bordereaux
router.get('/', bordereauRemiseController.getBordereaux);
router.get('/etats', bordereauRemiseController.getEtats);
router.get('/types', bordereauRemiseController.getTypes);
router.get('/next-numero', bordereauRemiseController.getNextBordereauNumero);
router.get('/cheques', bordereauRemiseController.getChequesForBordereau);
router.get('/:bordereau_id/cheques', bordereauRemiseController.getChequesByBordereau);
router.post('/:bordereau_id/cheques', bordereauRemiseController.saveChequesBordereau);
router.get('/:id', bordereauRemiseController.getBordereauById);
router.post('/', bordereauRemiseController.addBordereau);
router.put('/:id', bordereauRemiseController.updateBordereau);
router.delete('/:id', bordereauRemiseController.deleteBordereau);

module.exports = router;

