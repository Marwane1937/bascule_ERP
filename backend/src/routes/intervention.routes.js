const express = require('express');
const router = express.Router();
const interventionController = require('../controllers/intervention.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');

// Appliquer l'authentification à toutes les routes
// Routes pour les interventions qui n'ont pas besoin d'authentification (e.g., PDF)
router.get('/:id/print', interventionController.printInterventionPDF);
router.get('/test/pdf', interventionController.testPDF); // Route de test

// Appliquer l'authentification à toutes les routes suivantes
router.use(authenticateToken);
// Injecter la connexion à la base de données appropriée
router.use(databaseInjector.injectConnection);

// Routes pour les interventions (avec authentification)
router.get('/', interventionController.getInterventions);
router.get('/stats', interventionController.getInterventionStats);
router.post('/', interventionController.createIntervention);
router.get('/:id', interventionController.getIntervention);
router.put('/:id', interventionController.updateIntervention);
router.delete('/:id', interventionController.deleteIntervention);

// Routes pour le formulaire de saisie d'intervention
router.get('/form-data/clients', interventionController.getClients);
router.get('/form-data/employes', interventionController.getEmployes);
router.get('/form-data/rubriques', interventionController.getRubriques);
router.post('/with-details', interventionController.createInterventionWithDetails);

// Routes pour les détails d'intervention
router.post('/:id/details', interventionController.addInterventionDetail);
router.put('/details/:detailId', interventionController.updateInterventionDetail);
router.delete('/details/:detailId', interventionController.deleteInterventionDetail);

// Webhook Telegram (pas d'authentification requise pour les webhooks)
router.post('/telegram-webhook', interventionController.handleTelegramWebhook);

module.exports = router;
