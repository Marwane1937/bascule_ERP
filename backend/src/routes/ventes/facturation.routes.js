const express = require('express');
const router = express.Router();
const facturationController = require('../../controllers/ventes/facturation.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Toutes les routes nécessitent une authentification
// router.use(authenticateToken); // Déjà géré dans app.js

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour CRUD facturation
// IMPORTANT: Les routes spécifiques doivent être AVANT les routes paramétrées
router.get('/report', facturationController.getFacturationReport);
router.get('/:id/montant', facturationController.getFactureMontant);
router.get('/:id/parcours', facturationController.getFactureParcours);
router.get('/:id/livraisons-details', facturationController.getFactureLivraisonDetails);
router.get('/', facturationController.getFactures);
router.get('/:id', facturationController.getFacture);

module.exports = router;
