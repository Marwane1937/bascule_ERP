const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour les notifications
router.get('/', notificationController.getNotifications.bind(notificationController));
router.get('/unread-count', notificationController.getUnreadCount.bind(notificationController));
router.get('/recent', notificationController.getRecentNotifications.bind(notificationController));
// Route pour les notifications calculées (DOIT être avant /:id pour éviter les conflits)
router.get('/calculated', notificationController.getCalculatedNotifications.bind(notificationController));
router.post('/', notificationController.create.bind(notificationController));
router.post('/mark-read', notificationController.markMultipleAsRead.bind(notificationController));
router.get('/:id', notificationController.getNotificationById.bind(notificationController));
router.put('/:id/read', notificationController.markAsRead.bind(notificationController));
router.put('/:id/type', notificationController.updateType.bind(notificationController));
router.put('/:id/archive', notificationController.archive.bind(notificationController));
router.put('/:id/restore', notificationController.restore.bind(notificationController));
router.delete('/:id', notificationController.delete.bind(notificationController));

module.exports = router;

