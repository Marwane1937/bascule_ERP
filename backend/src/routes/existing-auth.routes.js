const express = require('express');
const router = express.Router();
const existingAuthController = require('../controllers/existing-auth.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// Routes publiques
router.post('/login', existingAuthController.login);

// Routes protégées
router.get('/me', authenticateToken, existingAuthController.getMe);
router.get('/databases', authenticateToken, existingAuthController.getAvailableDatabases);
router.post('/switch-database', authenticateToken, existingAuthController.switchDatabase);
router.post('/logout', authenticateToken, existingAuthController.logout);

module.exports = router;


