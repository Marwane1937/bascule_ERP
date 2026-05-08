const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stock.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');

router.get(
  '/preparations/:id/pdf',
  databaseInjector.injectConnection.bind(databaseInjector),
  stockController.printPreparationPdf
);

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour les achats non entrés en stock
router.get('/achats-non-entres', stockController.getAchatsNonEntresStock);
router.get('/achat-details/:achatDocumentId', stockController.getAchatDetailsForStock);

// Routes pour les ventes non sorties du stock
router.get('/ventes-non-sorties', stockController.getVentesNonSortiesStock);
router.get('/vente-details/:venteDocumentId', stockController.getVenteDetailsForStock);

// Routes pour les articles avec stock
router.get('/articles-stock', stockController.getArticlesStock);

// Routes de reporting stock
router.get('/etat-stock', stockController.getEtatStock);
router.get('/fiche-stock/:articleId', stockController.getFicheStock);
router.get('/chiffre-affaires-articles', stockController.getChiffreAffairesArticles);
router.get('/entrepots', stockController.getEntrepotResume);
router.get('/entrepots/:depotId/details', stockController.getEntrepotDetails);
router.get('/preparations', stockController.getPreparations);
router.get('/preparations/next-numero', stockController.getNextPreparationNumero);
router.get('/preparations/commandes-disponibles', stockController.getCommandesDisponiblesPourPreparation);
router.get('/preparations/article-search', stockController.searchPreparationArticles);
router.post('/preparations', stockController.createPreparation);
router.get('/preparations/:id', stockController.getPreparationById);
router.put('/preparations/:id', stockController.updatePreparationHeader);
router.post('/preparations/:id/lignes', stockController.savePreparationLines);
router.post('/preparations/:id/transfer-to-livraison', stockController.transfererPreparationVersLivraison);

// Routes d'export
router.get('/etat-stock/export/:format', stockController.exportEtatStock);
router.get('/fiche-stock/:articleId/export/:format', stockController.exportFicheStock);
router.get('/chiffre-affaires-articles/export/:format', stockController.exportChiffreAffairesArticles);

// Routes pour les documents de stock
router.get('/documents', stockController.getAllStockDocuments);
router.get('/documents/:id', stockController.getStockDocumentById);

// Routes pour créer des mouvements de stock
router.post('/entree-achat', stockController.createEntreeStockFromAchat);
router.post('/sortie-vente', stockController.createSortieStockFromVente);
// router.post('/sortie-stock', stockController.createSortieStock); // Déplacé vers sortie-stock.routes.js
router.post('/inventaire', stockController.createInventaire);

// Routes pour inventaire (type=20)
router.post('/inventaire-header', stockController.createInventaireHeader);
router.get('/inventaire/:id', stockController.getInventaireById);
router.get('/stock-calcul', stockController.getStockCalculData);
// Routes export doivent être AVANT la route générale /historique
router.get('/historique/export-pdf', stockController.exportStockHistoriquePDF);
router.get('/historique/export-excel', stockController.exportStockHistoriqueExcel);
router.get('/historique', stockController.getStockHistorique);
router.post('/inventaire/:id/lignes', stockController.saveInventaireLignes);
router.delete('/inventaire/:id/lignes', stockController.viderInventaireLignes);
router.put('/inventaire/:id/date', stockController.updateInventaireDate);
router.post('/inventaire/:id/valider', stockController.validerInventaire);
router.post('/inventaire/:id/validation-finale', stockController.validationFinaleInventaire);

module.exports = router;
