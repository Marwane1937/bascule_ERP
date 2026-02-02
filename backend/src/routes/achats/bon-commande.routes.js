const express = require('express');
const router = express.Router();
const bonCommandeController = require('../../controllers/achats/bon-commande.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');
const databaseInjector = require('../../middleware/database-injector.middleware');
const { checkPdfPermission } = require('../../middleware/pdf-permissions.middleware');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour CRUD bon de commande
router.get('/bon-commande', bonCommandeController.getBonCommande);
router.get('/next-bon-commande-numero', bonCommandeController.getNextBonCommandeNumero);
router.get('/:id', bonCommandeController.getBonCommandeById);
router.post('/save', bonCommandeController.saveDetail);
router.post('/info', bonCommandeController.saveInfo);
router.post('/', bonCommandeController.createBonCommande);
router.put('/:id', bonCommandeController.updateBonCommande);
router.post('/delete', bonCommandeController.deleteBonCommande);
router.post('/delete-lignes', bonCommandeController.deleteLignesParIds);

// Route pour générer le PDF du bon de commande
router.get('/pdf/:id', checkPdfPermission('bon_commande'), bonCommandeController.genererPDF);

// Route pour transformer une demande d'achat en bon de commande
router.post('/transformer-demande-achat', bonCommandeController.transformerDemandeAchatEnBonCommande);

module.exports = router;

