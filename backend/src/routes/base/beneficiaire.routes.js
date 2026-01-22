const express = require('express');
const router = express.Router();
const beneficiaireController = require('../../controllers/base/beneficiaire.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');

// Appliquer l'authentification à toutes les routes
router.use(authenticateToken);

// Routes pour les bénéficiaires
router.get('/', beneficiaireController.getBeneficiaires);
router.get('/stats', beneficiaireController.getBeneficiaireStats);
router.get('/departement/:departementId', beneficiaireController.getBeneficiairesByDepartement);
router.get('/:id', beneficiaireController.getBeneficiaire);
router.post('/', beneficiaireController.createBeneficiaire);
router.put('/:id', beneficiaireController.updateBeneficiaire);
router.delete('/:id', beneficiaireController.deleteBeneficiaire);

module.exports = router;













