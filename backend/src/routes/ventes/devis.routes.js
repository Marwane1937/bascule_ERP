const express = require('express');
const router = express.Router();
const devisController = require('../../controllers/ventes/devis.controller');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes spécifiques AVANT les routes paramétrées
router.get('/devis', devisController.getDevis);
router.get('/commande', devisController.getCommande);
router.get('/devis-non-transferes', devisController.getDevisNonTransferes);
router.get('/next-commande-numero', devisController.getNextCommandeNumero);
router.get('/next-devis-numero', devisController.getNextDevisNumero);

// Routes CRUD
router.get('/:id', devisController.getDevi);
router.post('/save', devisController.saveDetail);
router.post('/info', devisController.saveInfo);
router.post('/', devisController.createDevis);
router.post('/commande', devisController.createCommande);
router.put('/:id', devisController.editDevis);
router.post('/delete', devisController.deleteDevis);
router.post('/delete-lignes', devisController.deleteLignesParIds);
router.post('/transfer', devisController.transfererDevisVersCommande);
module.exports = router;
