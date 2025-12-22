const express = require('express');
const router = express.Router();


const listesController = require('../controllers/listes.controller');

const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour CRUD listes
router.get('/group-ids', (req, res, next) => {
  listesController.getAllGroupIds(req, res).catch(next);
});
router.get('/group/:group_id', (req, res, next) => {
  listesController.getListesByGroupId(req, res).catch(next);
});
router.get('/:id', (req, res, next) => {
  listesController.getListe(req, res).catch(next);
});
router.post('/', listesController.createListe);
router.put('/:id', listesController.editListe);
router.delete('/:id', listesController.deleteListe);


module.exports = router;

