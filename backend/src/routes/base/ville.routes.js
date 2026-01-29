const express = require('express');
const router = express.Router();
const villeController = require('../../controllers/base/ville.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');

// Appliquer l'authentification à toutes les routes
router.use(authenticateToken);

// Routes pour les villes
router.get('/', villeController.getVilles);
router.get('/stats', villeController.getVilleStats);
router.get('/:id', villeController.getVille);
router.post('/', villeController.createVille);
router.put('/:id', villeController.updateVille);
router.delete('/:id', villeController.deleteVille);

module.exports = router;















