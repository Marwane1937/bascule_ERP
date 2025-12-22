const authService = require('../services/auth.service');

// Middleware pour vérifier l'authentification
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token d\'accès requis'
      });
    }

    // Vérifier le token
    const decoded = authService.verifyToken(token);
    
    // Ajouter les informations utilisateur à la requête
    req.user = decoded;
    
    next();
  } catch (error) {
    console.error('Erreur vérification token:', error);
    return res.status(403).json({
      success: false,
      message: 'Token invalide ou expiré'
    });
  }
};

// Middleware pour vérifier les rôles
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Permissions insuffisantes'
      });
    }

    next();
  };
};

// Middleware pour vérifier que l'utilisateur appartient à la société
const requireSociete = (req, res, next) => {
  if (!req.user || !req.user.societe_id) {
    return res.status(401).json({
      success: false,
      message: 'Informations de société manquantes'
    });
  }

  // Ajouter l'ID de la société à la requête pour faciliter les requêtes
  req.societe_id = req.user.societe_id;
  
  next();
};

module.exports = {
  authenticateToken,
  requireRole,
  requireSociete
};
