const express = require('express');
const router = express.Router();
const unifiedAuthController = require('../controllers/unified-auth.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// Routes publiques
router.post('/login', unifiedAuthController.login);

// Routes protégées
router.get('/me', authenticateToken, unifiedAuthController.getMe);
router.get('/databases', authenticateToken, unifiedAuthController.getAvailableDatabases);
router.post('/switch-database', authenticateToken, unifiedAuthController.switchDatabase);
router.post('/logout', authenticateToken, unifiedAuthController.logout);

module.exports = router;


