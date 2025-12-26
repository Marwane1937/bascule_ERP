const express = require('express');
const router = express.Router();
const vehiculeController = require('../../controllers/base/vehicule.controller');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour CRUD véhicule
router.get('/with-urgent', vehiculeController.getVehiculesWithUrgentCharges);
router.get('/', vehiculeController.getVehicules);
router.post('/', vehiculeController.createVehicule);
router.post('/charges/delete', vehiculeController.deleteVehiculeCharges);
router.delete('/charges/:id', vehiculeController.deleteVehiculeCharge);
router.get('/:id/charges', vehiculeController.getVehiculeCharges);
router.post('/:id/charges', vehiculeController.createVehiculeCharge);
router.put('/:id/charges', vehiculeController.updateVehiculeCharge);
router.get('/:id', vehiculeController.getVehicule);
router.put('/:id', vehiculeController.editVehicule);
router.delete('/:id', vehiculeController.deleteVehicule);

module.exports = router;

