const userPermissionsService = require('../services/user-permissions.service');

/**
 * Middleware pour vérifier les permissions PDF avec support du printMode
 * @param {string} pdfType - Type de PDF ('devis', 'livraison', 'facturation', etc.)
 */
const checkPdfPermission = (pdfType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          message: 'Utilisateur non authentifié' 
        });
      }

      // Les admins ont tous les droits
      if (req.user?.type === 1) {
        return next();
      }

      // Récupérer le printMode depuis le body
      const printMode = (req.body?.printMode || 'normal').toLowerCase();
      
      // Récupérer les permissions de l'utilisateur
      const sequelize = req.sequelize || require('../config/database');
      const permissions = await userPermissionsService.getUserPermissions(userId, sequelize);
      
      // Construire le nom de la permission selon le type et le mode
      let permissionName;
      
      if (pdfType === 'devis') {
        if (printMode === 'nomenclature') {
          permissionName = 'pdf_devis_nomenclature';
        } else {
          permissionName = 'pdf_devis_normal';
        }
      } else if (pdfType === 'livraison') {
        if (printMode === 'non_valorise') {
          permissionName = 'pdf_livraison_non_valorise';
        } else {
          permissionName = 'pdf_livraison_normal';
        }
      } else {
        // Pour tous les autres types, utiliser le format pdf_[type]_normal
        // Gérer les types avec underscore (ex: entree_stock, facture_fournisseur)
        permissionName = `pdf_${pdfType}_normal`;
      }
      
      // Vérifier la permission
      const hasPermission = permissions.some(p => {
        const hasAccess = p.menu_item === permissionName && 
          (p.access === 1 || p.access === true || p.access === '1' || p.access === 'true');
        return hasAccess;
      });

      if (!hasPermission) {
        return res.status(403).json({ 
          success: false, 
          message: `Permission refusée pour le PDF ${pdfType} (mode: ${printMode})` 
        });
      }

      next();
    } catch (error) {
      console.error('[PDF Permissions] Erreur vérification permissions:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Erreur lors de la vérification des permissions' 
      });
    }
  };
};

module.exports = { checkPdfPermission };

