const notificationService = require('../services/notification.service');
const userPermissionsService = require('../services/user-permissions.service');

class NotificationController {
  /**
   * Vérifier les permissions d'un utilisateur
   */
  async checkPermission(userId, permission, sequelizeConnection = null) {
    try {
      const permissions = await userPermissionsService.getUserPermissions(userId, sequelizeConnection);
      
      const hasPermission = permissions.some(p => 
        p.menu_item === permission && (p.access === 1 || p.access === true || p.access === '1' || p.access === 'true')
      );
      
      // Les admins ont tous les droits
      const getConnection = require('../config/database').getConnection;
      const finalSequelize = sequelizeConnection || (getConnection ? getConnection() : require('../config/database'));
      
      const userQuery = await finalSequelize.query(
        `SELECT type FROM users WHERE id = :userId`,
        {
          replacements: { userId },
          type: finalSequelize.QueryTypes.SELECT
        }
      );
      
      const isAdmin = userQuery && userQuery.length > 0 && 
                     (userQuery[0].type === 'admin' || userQuery[0].type === 1);
      
      return hasPermission || isAdmin;
    } catch (error) {
      console.error('[NotificationController] Erreur vérification permission:', error);
      return false;
    }
  }

  /**
   * Récupérer les notifications de l'utilisateur connecté
   */
  async getNotifications(req, res) {
    try {
      const userId = req.user.id;
      const sequelize = req.sequelize || null;
      
      // Toujours permettre de voir ses propres notifications
      // La vérification de permission est faite dans le service qui filtre par user_id

      const { type, etat, lire, dateFrom, dateTo } = req.query;
      
      const filters = {
        type: type || 'ALL',
        etat: etat || 'ALL',
        lire: lire || 'ALL',
        dateFrom: dateFrom || null,
        dateTo: dateTo || null
      };

      const notifications = await notificationService.getUserNotifications(
        userId,
        filters,
        false,
        sequelize
      );

      res.json({
        success: true,
        data: notifications
      });
    } catch (error) {
      console.error('[NotificationController] Erreur récupération notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des notifications'
      });
    }
  }

  /**
   * Récupérer le nombre de notifications non lues
   */
  async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;
      const sequelize = req.sequelize || null;
      
      // Toujours permettre de voir le nombre de notifications non lues
      const count = await notificationService.getUnreadCount(userId, sequelize);

      res.json({
        success: true,
        data: { count }
      });
    } catch (error) {
      console.error('[NotificationController] Erreur comptage notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du comptage des notifications'
      });
    }
  }

  /**
   * Récupérer les dernières notifications (pour le header)
   */
  async getRecentNotifications(req, res) {
    try {
      const userId = req.user.id;
      const sequelize = req.sequelize || null;
      
      const count = await notificationService.getUnreadCount(userId, sequelize);

      res.json({
        success: true,
        data: { count }
      });
    } catch (error) {
      console.error('[NotificationController] Erreur comptage notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du comptage des notifications'
      });
    }
  }

  /**
   * Récupérer les dernières notifications (pour le header)
   */
  async getRecentNotifications(req, res) {
    try {
      const userId = req.user.id;
      const sequelize = req.sequelize || null;
      const limit = parseInt(req.query.limit) || 5;
      
      const notifications = await notificationService.getRecentNotifications(
        userId,
        limit,
        sequelize
      );

      res.json({
        success: true,
        data: notifications
      });
    } catch (error) {
      console.error('[NotificationController] Erreur récupération notifications récentes:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des notifications récentes'
      });
    }
  }

  /**
   * Récupérer une notification par ID
   */
  async getNotificationById(req, res) {
    try {
      const userId = req.user.id;
      const sequelize = req.sequelize || null;
      const { id } = req.params;
      
      const notification = await notificationService.getNotificationById(
        id,
        userId,
        sequelize
      );

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification non trouvée'
        });
      }

      res.json({
        success: true,
        data: notification
      });
    } catch (error) {
      console.error('[NotificationController] Erreur récupération notification:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la notification'
      });
    }
  }

  /**
   * Marquer une notification comme lue
   */
  async markAsRead(req, res) {
    try {
      const userId = req.user.id;
      const sequelize = req.sequelize || null;
      const { id } = req.params;
      
      // Vérifier la permission
      const hasPermission = await this.checkPermission(userId, 'notification_mark_read', sequelize);
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Permission insuffisante pour marquer comme lue'
        });
      }

      await notificationService.markAsRead(id, userId, sequelize);

      res.json({
        success: true,
        message: 'Notification marquée comme lue'
      });
    } catch (error) {
      console.error('[NotificationController] Erreur marquage comme lue:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors du marquage de la notification'
      });
    }
  }

  /**
   * Marquer plusieurs notifications comme lues
   */
  async markMultipleAsRead(req, res) {
    try {
      const userId = req.user.id;
      const sequelize = req.sequelize || null;
      const { ids } = req.body;
      
      if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({
          success: false,
          message: 'Les IDs doivent être un tableau'
        });
      }

      // Vérifier la permission
      const hasPermission = await this.checkPermission(userId, 'notification_mark_read', sequelize);
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Permission insuffisante pour marquer comme lues'
        });
      }

      const result = await notificationService.markMultipleAsRead(ids, userId, sequelize);

      res.json({
        success: true,
        message: `${result.count} notification(s) marquée(s) comme lue(s)`,
        data: result
      });
    } catch (error) {
      console.error('[NotificationController] Erreur marquage multiple:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors du marquage des notifications'
      });
    }
  }

  /**
   * Archiver une notification
   */
  async archive(req, res) {
    try {
      const userId = req.user.id;
      const sequelize = req.sequelize || null;
      const { id } = req.params;
      
      // Vérifier la permission
      const hasPermission = await this.checkPermission(userId, 'notification_archive', sequelize);
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Permission insuffisante pour archiver'
        });
      }

      await notificationService.archive(id, userId, sequelize);

      res.json({
        success: true,
        message: 'Notification archivée'
      });
    } catch (error) {
      console.error('[NotificationController] Erreur archivage:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de l\'archivage de la notification'
      });
    }
  }

  /**
   * Restaurer une notification archivée
   */
  async restore(req, res) {
    try {
      const userId = req.user.id;
      const sequelize = req.sequelize || null;
      const { id } = req.params;
      
      // Vérifier la permission
      const hasPermission = await this.checkPermission(userId, 'notification_restore', sequelize);
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Permission insuffisante pour restaurer'
        });
      }

      await notificationService.restore(id, userId, sequelize);

      res.json({
        success: true,
        message: 'Notification restaurée'
      });
    } catch (error) {
      console.error('[NotificationController] Erreur restauration:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la restauration de la notification'
      });
    }
  }

  /**
   * Créer une nouvelle notification
   */
  async create(req, res) {
    try {
      const userId = req.user.id;
      const sequelize = req.sequelize || null;
      const { description, date, part_ref, part_id, employe_id, date_alarme, emetteur, type, user_id } = req.body;
      
      // Toujours permettre de créer des notifications (chaque utilisateur crée pour lui-même)
      if (!description || !description.trim()) {
        return res.status(400).json({
          success: false,
          message: 'La description est requise'
        });
      }

      // Convertir type string en entier si nécessaire
      let typeInt = type || 1; // 1=INFO par défaut
      if (typeof type === 'string') {
        const typeMap = { 'INFO': 1, 'WARNING': 2, 'ERROR': 3, 'SUCCESS': 4 };
        typeInt = typeMap[type] || 1;
      } else if (type) {
        typeInt = parseInt(type);
      }

      const notification = await notificationService.createNotification({
        description: description.trim(),
        date: null, // Sera remplacé par GETDATE() dans le service
        part_ref: part_ref || null,
        part_id: part_id || null,
        employe_id: employe_id || userId,
        date_alarme: date_alarme || new Date(),
        emetteur: emetteur || 'SYSTEM',
        type: typeInt,
        etat: 0, // 0=non archivé
        user_id: user_id || userId
      }, sequelize);

      res.json({
        success: true,
        message: 'Notification créée avec succès',
        data: notification
      });
    } catch (error) {
      console.error('[NotificationController] Erreur création:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la création de la notification'
      });
    }
  }

  /**
   * Mettre à jour le type/priorité d'une notification
   */
  async updateType(req, res) {
    try {
      const userId = req.user.id;
      const sequelize = req.sequelize || null;
      const { id } = req.params;
      const { type } = req.body;

      if (!type || (type < 1 || type > 4)) {
        return res.status(400).json({
          success: false,
          message: 'Type invalide (doit être entre 1 et 4)'
        });
      }

      const notification = await notificationService.getNotificationById(id, userId, sequelize);
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification non trouvée'
        });
      }

      await notificationService.updateType(id, parseInt(type), sequelize);

      res.json({
        success: true,
        message: 'Priorité mise à jour avec succès'
      });
    } catch (error) {
      console.error('[NotificationController] Erreur mise à jour type:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la mise à jour de la priorité'
      });
    }
  }

  /**
   * Supprimer une notification
   */
  async delete(req, res) {
    try {
      const userId = req.user.id;
      const sequelize = req.sequelize || null;
      const { id } = req.params;
      
      // Vérifier la permission
      const hasPermission = await this.checkPermission(userId, 'notification_delete', sequelize);
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Permission insuffisante pour supprimer'
        });
      }

      await notificationService.delete(id, userId, sequelize);

      res.json({
        success: true,
        message: 'Notification supprimée'
      });
    } catch (error) {
      console.error('[NotificationController] Erreur suppression:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la suppression de la notification'
      });
    }
  }
}

module.exports = new NotificationController();

