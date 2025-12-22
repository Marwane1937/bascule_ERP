const express = require('express');
const router = express.Router();
const livraisonController = require('../../controllers/ventes/livraison.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour CRUD livraison
router.get('/livraisons', livraisonController.getLivraisons);
router.get('/commandes-non-livrees', livraisonController.getCommandesNonLivrees);
router.get('/next-livraison-numero', livraisonController.getNextLivraisonNumero);
router.get('/:id', livraisonController.getLivraison);
router.post('/save', livraisonController.saveDetail);
router.post('/info', livraisonController.saveInfo);
router.post('/', livraisonController.createLivraison);
router.post('/livraison', livraisonController.createLivraison);
router.put('/:id', livraisonController.updateLivraison);
router.post('/delete', livraisonController.deleteLivraison);
router.post('/delete-lignes', livraisonController.deleteLignesParIds);
router.post('/transfer', livraisonController.transfererCommandeVersLivraison);
router.get('/transfer-data/:stockId', livraisonController.getLivraisonDataForTransfer);
router.post('/transfer-to-facturation', livraisonController.transfererLivraisonVersFacturation);
router.post('/commande-to-facturation', livraisonController.transfererCommandeVersFacturation);

module.exports = router;

