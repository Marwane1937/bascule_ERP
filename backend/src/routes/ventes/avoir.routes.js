const express = require('express');
const router = express.Router();
const avoirController = require('../../controllers/ventes/avoir.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Toutes les routes nécessitent une authentification
// router.use(authenticateToken); // Déjà géré dans app.js

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour CRUD avoir
router.get('/avoirs', avoirController.getAvoirs);
router.get('/next-avoir-numero', avoirController.getNextAvoirNumero);
router.get('/:id', avoirController.getAvoir);
router.post('/financier', avoirController.createAvoirFinancier);
router.post('/marchandise', avoirController.createAvoirMarchandise);
router.put('/:id', avoirController.updateAvoir);
router.post('/delete', avoirController.deleteAvoir);

module.exports = router;



