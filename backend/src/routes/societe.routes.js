const express = require('express');
const router = express.Router();
const societeController = require('../controllers/societe.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour les sociétés
router.get('/', societeController.getAllSocietes.bind(societeController));
router.get('/available-databases', societeController.getAvailableDatabases.bind(societeController));
router.get('/:id', societeController.getSocieteById.bind(societeController));
router.post('/', societeController.createSociete.bind(societeController));
router.put('/:id', societeController.updateSociete.bind(societeController));
router.delete('/:id', societeController.deleteSociete.bind(societeController));

// Route pour changer de base de données
router.post('/switch-database', societeController.switchDatabase.bind(societeController));

module.exports = router;


