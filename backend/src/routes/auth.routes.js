const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

// Rate limiting uniquement en production
const isProduction = process.env.NODE_ENV === 'production';

let loginLimiter = null;
if (isProduction) {
  loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 tentatives max
    message: {
      success: false,
      message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false, // Compter toutes les tentatives
  });
}

// Routes publiques
// Appliquer le rate limiting si en production
const loginRoute = loginLimiter 
  ? [loginLimiter, authController.login.bind(authController)]
  : authController.login.bind(authController);

router.post('/login', loginRoute);
router.post('/logout', authController.logout.bind(authController));

// Routes protégées
router.get('/me', authenticateToken, authController.getMe.bind(authController));
router.post('/switch-database', authenticateToken, authController.switchDatabase.bind(authController));

module.exports = router;
