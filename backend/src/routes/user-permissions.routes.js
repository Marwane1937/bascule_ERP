const express = require('express');
const router = express.Router();
const userPermissionsController = require('../controllers/user-permissions.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Route pour les menu items (ne nécessite pas de connexion DB)
router.get('/menu-items', userPermissionsController.getAvailableMenuItems.bind(userPermissionsController));

// Middleware pour injecter la connexion appropriée (pour les autres routes)
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour les permissions utilisateurs (nécessitent une connexion DB)
router.get('/:id', userPermissionsController.getUserPermissions.bind(userPermissionsController));
router.put('/:id', userPermissionsController.updateUserPermissions.bind(userPermissionsController));
router.post('/:id/disconnect', userPermissionsController.disconnectUser.bind(userPermissionsController));

module.exports = router;

