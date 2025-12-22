const express = require('express');
const router = express.Router();
const databaseSwitchController = require('../controllers/database-switch.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// Routes protégées par authentification
router.post('/switch-database', authenticateToken, databaseSwitchController.switchDatabase);
router.post('/test-connection', authenticateToken, databaseSwitchController.testConnection);
router.get('/list-databases', authenticateToken, databaseSwitchController.listDatabases);
router.get('/current-database', authenticateToken, databaseSwitchController.getCurrentDatabase);
router.get('/connection-status', authenticateToken, databaseSwitchController.getConnectionStatus);

module.exports = router;
