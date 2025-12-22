const userPermissionsService = require('../services/user-permissions.service');

class UserPermissionsController {
  // Récupérer les permissions d'un utilisateur
  async getUserPermissions(req, res) {
    try {
      const { id } = req.params;
      const sequelize = req.sequelize || null;
      
      const permissions = await userPermissionsService.getUserPermissions(id, sequelize);
      
      res.json({
        success: true,
        data: permissions
      });
    } catch (error) {
      console.error('Erreur récupération permissions:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des permissions'
      });
    }
  }

  // Mettre à jour les permissions d'un utilisateur
  async updateUserPermissions(req, res) {
    try {
      const { id } = req.params;
      const { permissions } = req.body;
      const sequelize = req.sequelize || null;

      if (!permissions || !Array.isArray(permissions)) {
        return res.status(400).json({
          success: false,
          message: 'Les permissions doivent être un tableau'
        });
      }

      const updatedPermissions = await userPermissionsService.updateUserPermissions(
        id,
        permissions,
        sequelize
      );

      res.json({
        success: true,
        message: 'Permissions mises à jour avec succès',
        data: updatedPermissions
      });
    } catch (error) {
      console.error('Erreur mise à jour permissions:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la mise à jour des permissions'
      });
    }
  }

  // Obtenir les menu items disponibles
  async getAvailableMenuItems(req, res) {
    try {
      const menuItems = await userPermissionsService.getAvailableMenuItems();
      
      res.json({
        success: true,
        data: menuItems
      });
    } catch (error) {
      console.error('Erreur récupération menu items:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des menu items'
      });
    }
  }

  // Déconnecter un utilisateur
  async disconnectUser(req, res) {
    try {
      const { id } = req.params;
      
      const result = await userPermissionsService.disconnectUser(id);
      
      res.json({
        success: true,
        message: result.message || 'Utilisateur déconnecté avec succès'
      });
    } catch (error) {
      console.error('Erreur déconnexion utilisateur:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la déconnexion de l\'utilisateur'
      });
    }
  }
}

module.exports = new UserPermissionsController();

