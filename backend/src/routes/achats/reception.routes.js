const express = require('express');
const router = express.Router();
const receptionController = require('../../controllers/achats/reception.controller');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Middleware pour injecter la connexion appropriée (sans switch automatique)
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes spécifiques AVANT les routes paramétrées (/:id)
// Commandes non réceptionnées (pour transfert commande → réception)
router.get('/commandes-non-receptionnees', receptionController.getCommandesNonReceptionnees);

// Créer une réception depuis une commande
router.post('/from-commande', receptionController.createReceptionFromCommande);
router.post('/from-stock-entree', receptionController.createReceptionFromStockEntree);

// Supprimer une réception
router.post('/delete', receptionController.deleteReception);

// Sauvegarder les détails d'une réception
router.post('/save-details', receptionController.saveDetail);

// Supprimer des lignes de réception
router.post('/delete-lignes', receptionController.deleteLignesParIds);

// Liste des réceptions (stock.type = 1) - doit être avant /:id
router.get('/', receptionController.getReceptions);

// Routes paramétrées EN DERNIER
// Récupérer une réception par ID
router.get('/:id', receptionController.getReceptionById);

// Mettre à jour une réception
router.put('/:id', receptionController.updateReception);

module.exports = router;

