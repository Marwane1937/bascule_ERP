const express = require('express');
const router = express.Router();
const uniteController = require('../../controllers/base/unite.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');

// Appliquer l'authentification à toutes les routes
router.use(authenticateToken);

// Routes pour les unités
router.get('/', uniteController.getUnites);
router.get('/stats', uniteController.getUniteStats);
router.get('/base', uniteController.getUnitesBase);
router.get('/type/:type', uniteController.getUnitesByType);
router.post('/convert', uniteController.convertUnite);
router.get('/:id', uniteController.getUnite);
router.post('/', uniteController.createUnite);
router.put('/:id', uniteController.updateUnite);
router.delete('/:id', uniteController.deleteUnite);

module.exports = router;














