const express = require('express');
const router = express.Router();
const clientController = require('../../controllers/base/client.controller');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// router pour CRUD client
router.get('/contact', clientController.getContacts);
router.get('/contact/paged', clientController.getContactsPaged);
router.get('/fournisseur', clientController.getFournisseurs);
// Liste paginée (pour l'interface Fournisseurs, sans DataTables)
router.get('/fournisseur/paged', clientController.getFournisseursPaged);
router.get('/client', clientController.getClients);
// Liste paginée (pour l'interface Clients, sans DataTables)
router.get('/client/paged', clientController.getClientsPaged);
router.get('/ville', clientController.getVilles);
router.get('/identifiant', clientController.getIdentifiants);
router.get('/listes/:group_id', clientController.getListesByGroupId);
router.get('/complement/:id', clientController.getClientDetails);

// Routes pour les exonérations (AVANT /:id pour éviter les conflits)
router.get('/:id/exoneration', clientController.getExoneration);
router.get('/:id/exonerations', clientController.getAllExonerations);
router.post('/:id/exoneration', clientController.saveOrUpdateExoneration);
router.put('/:id/exoneration', clientController.saveOrUpdateExoneration);
router.delete('/:id/exoneration', clientController.deleteExoneration);

// Routes pour les conditions de paiement (AVANT /:id pour éviter les conflits)
router.get('/conditions-paiement', clientController.getConditionsPaiement);
router.get('/:id/conditions', clientController.getPartenaireConditions);
router.post('/:id/conditions', clientController.createPartenaireCondition);
router.put('/:id/conditions/:condition_id', clientController.updatePartenaireCondition);
router.post('/conditions/delete', clientController.deletePartenaireConditions);

router.get('/:id', clientController.getClient);
router.post('/', clientController.createClient);
// Création fournisseur (type=2) sans impacter l'ajout Client (type=1)
router.post('/fournisseur', clientController.createFournisseur);
router.post('/contact', clientController.createContact);
router.post('/:id/details', clientController.createClientDetails);
router.post('/details/delete', clientController.deleteClientDetails);
router.put('/:id/details', clientController.updateClientDetails);
router.put('/contact/:id', clientController.editContact);
router.put('/contact/:id/archive', clientController.archiveContact);
router.delete('/contact/:id', clientController.deleteContact);
router.put('/:id', clientController.editClient);
router.delete('/:id', clientController.deleteClient);

module.exports = router;
