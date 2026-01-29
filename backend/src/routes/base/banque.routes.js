const express = require('express');
const router = express.Router();
const banqueController = require('../../controllers/base/banque.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');

// Appliquer l'authentification à toutes les routes
router.use(authenticateToken);

// Routes pour les banques
router.get('/', banqueController.getBanques);
router.get('/stats', banqueController.getBanqueStats);
router.get('/swift/:swift', banqueController.getBanqueBySwift);
router.get('/:id', banqueController.getBanque);
router.post('/', banqueController.createBanque);
router.put('/:id', banqueController.updateBanque);
router.delete('/:id', banqueController.deleteBanque);

module.exports = router;















