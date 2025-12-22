const express = require('express');
const router = express.Router();
const clientController = require('../../controllers/base/client.controller');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// router pour CRUD client
router.get('/contact', clientController.getContacts);
router.get('/fournisseur', clientController.getFournisseurs);
router.get('/client', clientController.getClients);
router.get('/ville', clientController.getVilles);
router.get('/identifiant', clientController.getIdentifiants);
router.get('/listes/:group_id', clientController.getListesByGroupId);
router.get('/:id', clientController.getClient);
router.get('/complement/:id', clientController.getClientDetails);
router.post('/', clientController.createClient);
router.post('/:id/details', clientController.createClientDetails);
router.post('/details/delete', clientController.deleteClientDetails);
router.put('/:id/details', clientController.updateClientDetails);
router.put('/:id', clientController.editClient);
router.delete('/:id', clientController.deleteClient);

module.exports = router;
