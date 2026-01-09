const express = require('express');
const router = express.Router();
const compteurController = require('../../controllers/base/compteur.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');

/**
 * Routes pour la gestion des compteurs
 * Toutes les routes nécessitent une authentification
 */

// Récupérer tous les compteurs avec pagination
router.get('/', authenticateToken, compteurController.getCompteurs);

// Récupérer un compteur par code
router.get('/:code', authenticateToken, compteurController.getCompteur);

// Mettre à jour un compteur
router.put('/:code', authenticateToken, compteurController.updateCompteur);

// Récupérer les statistiques des compteurs
router.get('/stats', authenticateToken, compteurController.getCompteurStats);

module.exports = router;





