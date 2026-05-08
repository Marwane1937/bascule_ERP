const express = require('express');
const router = express.Router();


const employeController = require('../../controllers/base/employe.controller');

const { authenticateToken } = require('../../middleware/auth.middleware');
const databaseInjector = require('../../middleware/database-injector.middleware');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour CRUD employé
router.get('/actifs', (req, res, next) => {
  employeController.getEmployesActifs(req, res).catch(next);
});
router.get('/autocomplete', (req, res, next) => {
  employeController.getEmployesAutocomplete(req, res).catch(next);
});
router.get('/', (req, res, next) => {
  employeController.getEmployes(req, res).catch(next);
});
router.get('/:id', (req, res, next) => {
  employeController.getEmploye(req, res).catch(next);
});
router.post('/', employeController.createEmploye);
router.put('/:id', employeController.editEmploye);
router.delete('/:id', employeController.deleteEmploye);


module.exports = router;

