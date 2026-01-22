const express = require('express');
const router = express.Router();
const departementController = require('../../controllers/base/departement.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');

// Appliquer l'authentification à toutes les routes
router.use(authenticateToken);

// Routes pour les départements
router.get('/', departementController.getDepartements);
router.get('/stats', departementController.getDepartementStats);
router.get('/hierarchy', departementController.getDepartementHierarchy);
router.get('/:id', departementController.getDepartement);
router.post('/', departementController.createDepartement);
router.put('/:id', departementController.updateDepartement);
router.delete('/:id', departementController.deleteDepartement);

module.exports = router;













