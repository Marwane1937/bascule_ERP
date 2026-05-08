const express = require('express');
const router = express.Router();
const caisseController = require('../../controllers/finance/caisse.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Note: databaseInjector est déjà appliqué globalement dans app.js
// Pas besoin de le réappliquer ici

// Routes pour CRUD caisse
// IMPORTANT: Les routes spécifiques doivent être AVANT les routes paramétrées
router.get('/', caisseController.getCaisseDocuments);
router.get('/solde', caisseController.getSoldeCaisse);
router.get('/next-numero/:prefix', caisseController.getNextCaisseNumero);
// La route /:id doit être en dernier pour éviter qu'elle intercepte les routes spécifiques
router.get('/:id', caisseController.getCaisseDocumentById);
router.post('/', caisseController.createCaisseDocument);
router.post('/from-reglement', caisseController.createCaisseFromReglement);
router.put('/:id', caisseController.updateCaisseDocument);
router.put('/:id/details/:sens', caisseController.updateCaisseDocumentBySens);
router.put('/:id/cloturer', caisseController.cloturerCaisseDocument);
router.delete('/:id', caisseController.deleteCaisseDocument);

module.exports = router;
