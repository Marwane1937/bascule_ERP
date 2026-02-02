const express = require('express');
const router = express.Router();
const demandeAchatController = require('../../controllers/achats/demande-achat.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');
const databaseInjector = require('../../middleware/database-injector.middleware');
const { checkPdfPermission } = require('../../middleware/pdf-permissions.middleware');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour CRUD demande d'achat
// IMPORTANT: Les routes spécifiques doivent être définies AVANT les routes paramétrées
router.get('/demande-achat', demandeAchatController.getDemandeAchat);
router.get('/next-demande-achat-numero', demandeAchatController.getNextDemandeAchatNumero);
router.get('/non-transformees', demandeAchatController.getDemandesAchatNonTransformees);
router.get('/pdf/:id', authenticateToken, checkPdfPermission('demande_achat'), demandeAchatController.genererPDF);
router.get('/:id', demandeAchatController.getDemandeAchatById);
router.post('/save', demandeAchatController.saveDetail);
router.post('/info', demandeAchatController.saveInfo);
router.post('/', demandeAchatController.createDemandeAchat);
router.put('/:id', demandeAchatController.updateDemandeAchat);
router.post('/delete', demandeAchatController.deleteDemandeAchat);
router.post('/delete-lignes', demandeAchatController.deleteLignesParIds);

module.exports = router;

