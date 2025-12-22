const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// Routes publiques
router.post('/login', authController.login.bind(authController));
router.post('/logout', authController.logout.bind(authController));

// Routes protégées
router.get('/me', authenticateToken, authController.getMe.bind(authController));
router.post('/switch-database', authenticateToken, authController.switchDatabase.bind(authController));

module.exports = router;
