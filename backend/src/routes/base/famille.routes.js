const express = require('express');
const router = express.Router();
const familleController = require('../../controllers/base/famille.controller');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// router pour CRUD article
router.get('/famille', familleController.getFamilles);
router.get('/unite', familleController.getUnites);
router.get('/:id', familleController.getFamille);
router.post('/', familleController.createFamille);
router.put('/:id', familleController.editFamille);
router.delete('/:id', familleController.deleteFamille);

module.exports = router;
