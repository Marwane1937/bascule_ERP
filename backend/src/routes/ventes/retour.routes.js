const express = require('express');
const router = express.Router();
const retourController = require('../../controllers/ventes/retour.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Toutes les routes nécessitent une authentification
// Les routes sont déjà protégées par authenticateToken dans app.js

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour CRUD retour
router.get('/retours', retourController.getRetours);
router.get('/next-retour-numero', retourController.getNextRetourNumero);
router.get('/:id', retourController.getRetour);
router.post('/save', retourController.saveDetail);
router.post('/info', retourController.saveInfo);
router.post('/', retourController.createRetour);
router.post('/retour', retourController.createRetour);
router.put('/:id', retourController.updateRetour);
router.post('/delete', retourController.deleteRetour);
router.post('/delete-lignes', retourController.deleteLignesParIds);

module.exports = router;



