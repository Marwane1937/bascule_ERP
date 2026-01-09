const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stock.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');

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
router.post('/sortie-stock', stockController.createSortieStock);
router.post('/inventaire', stockController.createInventaire);

module.exports = router;



