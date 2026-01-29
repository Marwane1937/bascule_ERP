const express = require('express');
const router = express.Router();
const factureFournisseurController = require('../../controllers/achats/facture-fournisseur.controller');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour les factures fournisseur
// IMPORTANT: Les routes spécifiques doivent être AVANT les routes paramétrées

// Récupérer les commandes non facturées (pour le transfert commande → facture)
router.get('/commandes-non-facturees', factureFournisseurController.getCommandesNonFacturees);

// Créer une facture depuis une commande
router.post('/from-commande', factureFournisseurController.createFactureFournisseurFromCommande);

// Supprimer une facture fournisseur
router.post('/delete', factureFournisseurController.deleteFactureFournisseur);

// Liste des factures fournisseur avec pagination
router.get('/', factureFournisseurController.getFacturesFournisseur);

// Récupérer une facture fournisseur par ID
router.get('/:id', factureFournisseurController.getFactureFournisseur);

module.exports = router;



















