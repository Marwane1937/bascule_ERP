const Notification = require('../models/notification.model');
const sequelize = require('../config/database');

class NotificationService {
  /**
   * Récupérer toutes les notifications
   * @param {object} filters - Filtres (type, etat, dateFrom, dateTo)
   * @param {boolean} includeArchived - Inclure les notifications archivées
   * @param {object} sequelizeConnection - Connexion Sequelize (optionnelle)
   */
  async getUserNotifications(userId, filters = {}, includeArchived = false, sequelizeConnection = null) {
    try {
      // Utiliser getConnection si disponible pour obtenir la connexion dynamique
      const getConnection = require('../config/database').getConnection;
      const finalSequelize = sequelizeConnection || (getConnection ? getConnection() : Notification.sequelize || require('../config/database'));
      
      // Construire la requête WHERE (sans filtre par user_id)
      let whereClause = '';
      const replacements = {};
      const conditions = [];

      // Filtrer par type (entier: 1=INFO, 2=WARNING, 3=ERROR, 4=SUCCESS)
      if (filters.type && filters.type !== 'ALL' && filters.type !== '0') {
        conditions.push(`type = :type`);
        replacements.type = parseInt(filters.type);
      }

      // Filtrer par état (entier: 0=non archivé, 1=archivé)
      if (filters.etat !== undefined && filters.etat !== 'ALL' && filters.etat !== '') {
        conditions.push(`etat = :etat`);
        replacements.etat = parseInt(filters.etat);
      }

      // Filtrer par lire (3 = lue)
      if (filters.lire !== undefined && filters.lire !== 'ALL' && filters.lire !== '') {
        const lireNum = parseInt(filters.lire);
        if (lireNum === 3) {
          // Lue
          conditions.push(`lire = 3`);
        } else if (lireNum === 0) {
          // Non lue
          conditions.push(`(lire IS NULL OR lire <> 3)`);
        }
      }

      // Filtrer par date
      if (filters.dateFrom) {
        conditions.push(`date_alarme >= :dateFrom`);
        replacements.dateFrom = filters.dateFrom;
      }
      if (filters.dateTo) {
        conditions.push(`date_alarme <= :dateTo`);
        replacements.dateTo = filters.dateTo;
      }

      if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }

      // Ordre : les plus récentes en premier
      const query = `
        SELECT 
          id,
          description,
          date,
          part_ref,
          part_id,
          employe_id,
          date_alarme,
          emetteur,
          type,
          etat,
          lire,
          user_id
        FROM document
        ${whereClause}
        ORDER BY date_alarme DESC, id DESC
      `;

      const notifications = await finalSequelize.query(query, {
        replacements,
        type: finalSequelize.QueryTypes.SELECT
      });

      return notifications || [];
    } catch (error) {
      console.error('[NotificationService] Erreur récupération notifications:', error);
      throw error;
    }
  }

  /**
   * Compter les notifications non lues (etat = 0 et lire <> 3)
   */
  async getUnreadCount(userId, sequelizeConnection = null) {
    try {
      // Utiliser getConnection si disponible pour obtenir la connexion dynamique
      const getConnection = require('../config/database').getConnection;
      const finalSequelize = sequelizeConnection || (getConnection ? getConnection() : Notification.sequelize || require('../config/database'));
      
      const query = `
        SELECT COUNT(*) as count
        FROM document
        WHERE etat = 0
          AND (lire IS NULL OR lire <> 3)
          AND (date_alarme IS NULL OR date_alarme <= GETDATE())
      `;

      const result = await finalSequelize.query(query, {
        replacements: {},
        type: finalSequelize.QueryTypes.SELECT
      });

      return result && result.length > 0 ? parseInt(result[0].count) : 0;
    } catch (error) {
      console.error('[NotificationService] Erreur comptage notifications non lues:', error);
      return 0;
    }
  }

  /**
   * Récupérer les dernières notifications (pour le header) - non archivées (etat = 0)
   */
  async getRecentNotifications(userId, limit = 5, sequelizeConnection = null) {
    try {
      // Utiliser getConnection si disponible pour obtenir la connexion dynamique
      const getConnection = require('../config/database').getConnection;
      const finalSequelize = sequelizeConnection || (getConnection ? getConnection() : Notification.sequelize || require('../config/database'));
      
      const query = `
        SELECT TOP ${limit}
          id,
          description,
          date,
          date_alarme,
          emetteur,
          type,
          etat,
          lire
        FROM document
        WHERE etat = 0
          AND (lire IS NULL OR lire <> 3)
          AND (date_alarme IS NULL OR date_alarme <= GETDATE())
        ORDER BY date_alarme DESC, id DESC
      `;

      const notifications = await finalSequelize.query(query, {
        replacements: {},
        type: finalSequelize.QueryTypes.SELECT
      });

      return notifications || [];
    } catch (error) {
      console.error('[NotificationService] Erreur récupération notifications récentes:', error);
      return [];
    }
  }

  /**
   * Récupérer une notification par ID
   */
  async getNotificationById(notificationId, userId, sequelizeConnection = null) {
    try {
      // Utiliser getConnection si disponible pour obtenir la connexion dynamique
      const getConnection = require('../config/database').getConnection;
      const finalSequelize = sequelizeConnection || (getConnection ? getConnection() : Notification.sequelize || require('../config/database'));
      
      const query = `
        SELECT *
        FROM document
        WHERE id = :notificationId
      `;

      const result = await finalSequelize.query(query, {
        replacements: { notificationId },
        type: finalSequelize.QueryTypes.SELECT
      });

      return result && result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error('[NotificationService] Erreur récupération notification:', error);
      throw error;
    }
  }

  /**
   * Marquer une notification comme lue (lire = 3)
   */
  async markAsRead(notificationId, userId, sequelizeConnection = null) {
    try {
      // Utiliser getConnection si disponible pour obtenir la connexion dynamique
      const getConnection = require('../config/database').getConnection;
      const finalSequelize = sequelizeConnection || (getConnection ? getConnection() : Notification.sequelize || require('../config/database'));
      
      // Vérifier que la notification existe
      const notification = await this.getNotificationById(notificationId, userId, sequelizeConnection);
      if (!notification) {
        throw new Error('Notification non trouvée');
      }

      // Marquer la notification comme lue (lire = 3) pour qu'elle ne s'affiche plus dans la liste
      const query = `
        UPDATE document
        SET lire = 3
        WHERE id = :notificationId
      `;

      await finalSequelize.query(query, {
        replacements: { notificationId },
        type: finalSequelize.QueryTypes.UPDATE
      });

      return { success: true };
    } catch (error) {
      console.error('[NotificationService] Erreur marquage comme lue:', error);
      throw error;
    }
  }

  /**
   * Marquer plusieurs notifications comme lues (lire = 3)
   */
  async markMultipleAsRead(notificationIds, userId, sequelizeConnection = null) {
    try {
      // Utiliser getConnection si disponible pour obtenir la connexion dynamique
      const getConnection = require('../config/database').getConnection;
      const finalSequelize = sequelizeConnection || (getConnection ? getConnection() : Notification.sequelize || require('../config/database'));
      
      if (!notificationIds || notificationIds.length === 0) {
        return { success: true, count: 0 };
      }

      // Marquer toutes les notifications comme lues (lire = 3)
      const placeholders = notificationIds.map((_, index) => `:id${index}`).join(',');
      const replacements = {};
      notificationIds.forEach((id, index) => {
        replacements[`id${index}`] = id;
      });

      const query = `
        UPDATE document
        SET lire = 3
        WHERE id IN (${placeholders})
      `;

      await finalSequelize.query(query, {
        replacements,
        type: finalSequelize.QueryTypes.UPDATE
      });

      return { success: true, count: notificationIds.length };
    } catch (error) {
      console.error('[NotificationService] Erreur marquage multiple comme lues:', error);
      throw error;
    }
  }

  /**
   * Archiver une notification (etat = 1)
   */
  async archive(notificationId, userId, sequelizeConnection = null) {
    try {
      // Utiliser getConnection si disponible pour obtenir la connexion dynamique
      const getConnection = require('../config/database').getConnection;
      const finalSequelize = sequelizeConnection || (getConnection ? getConnection() : Notification.sequelize || require('../config/database'));
      
      const notification = await this.getNotificationById(notificationId, userId, sequelizeConnection);
      if (!notification) {
        throw new Error('Notification non trouvée');
      }

      const query = `
        UPDATE document
        SET etat = 1
        WHERE id = :notificationId
      `;

      await finalSequelize.query(query, {
        replacements: { notificationId },
        type: finalSequelize.QueryTypes.UPDATE
      });

      return { success: true };
    } catch (error) {
      console.error('[NotificationService] Erreur archivage:', error);
      throw error;
    }
  }

  /**
   * Restaurer une notification archivée (etat = 0)
   */
  async restore(notificationId, userId, sequelizeConnection = null) {
    try {
      // Utiliser getConnection si disponible pour obtenir la connexion dynamique
      const getConnection = require('../config/database').getConnection;
      const finalSequelize = sequelizeConnection || (getConnection ? getConnection() : Notification.sequelize || require('../config/database'));
      
      const notification = await this.getNotificationById(notificationId, userId, sequelizeConnection);
      if (!notification) {
        throw new Error('Notification non trouvée');
      }

      const query = `
        UPDATE document
        SET etat = 0
        WHERE id = :notificationId
      `;

      await finalSequelize.query(query, {
        replacements: { notificationId },
        type: finalSequelize.QueryTypes.UPDATE
      });

      return { success: true };
    } catch (error) {
      console.error('[NotificationService] Erreur restauration:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour le type/priorité d'une notification
   */
  async updateType(notificationId, type, sequelizeConnection = null) {
    try {
      // Utiliser getConnection si disponible pour obtenir la connexion dynamique
      const getConnection = require('../config/database').getConnection;
      const finalSequelize = sequelizeConnection || (getConnection ? getConnection() : Notification.sequelize || require('../config/database'));
      
      const query = `
        UPDATE document
        SET type = :type
        WHERE id = :notificationId
      `;

      await finalSequelize.query(query, {
        replacements: { notificationId, type },
        type: finalSequelize.QueryTypes.UPDATE
      });

      return { success: true };
    } catch (error) {
      console.error('[NotificationService] Erreur mise à jour type:', error);
      throw error;
    }
  }

  /**
   * Supprimer une notification
   */
  async delete(notificationId, userId, sequelizeConnection = null) {
    try {
      // Utiliser getConnection si disponible pour obtenir la connexion dynamique
      const getConnection = require('../config/database').getConnection;
      const finalSequelize = sequelizeConnection || (getConnection ? getConnection() : Notification.sequelize || require('../config/database'));
      
      const notification = await this.getNotificationById(notificationId, userId, sequelizeConnection);
      if (!notification) {
        throw new Error('Notification non trouvée');
      }

      const query = `DELETE FROM document WHERE id = :notificationId`;

      await finalSequelize.query(query, {
        replacements: { notificationId },
        type: finalSequelize.QueryTypes.DELETE
      });

      return { success: true };
    } catch (error) {
      console.error('[NotificationService] Erreur suppression:', error);
      throw error;
    }
  }

  /**
   * Créer une nouvelle notification
   */
  async createNotification(data, sequelizeConnection = null) {
    try {
      // Utiliser getConnection si disponible pour obtenir la connexion dynamique
      const getConnection = require('../config/database').getConnection;
      const finalSequelize = sequelizeConnection || (getConnection ? getConnection() : Notification.sequelize || require('../config/database'));
      
      const {
        description,
        date,
        part_ref,
        part_id,
        employe_id,
        date_alarme,
        emetteur,
        type = 1, // 1=INFO par défaut
        etat = 0, // 0=non archivé par défaut
        user_id
      } = data;

      // Convertir type string en entier si nécessaire
      let typeInt = type;
      if (typeof type === 'string') {
        const typeMap = { 'INFO': 1, 'WARNING': 2, 'ERROR': 3, 'SUCCESS': 4 };
        typeInt = typeMap[type] || 1;
      }

      // Convertir etat string en entier si nécessaire
      let etatInt = etat;
      if (typeof etat === 'string') {
        const etatMap = { 'nouvelle': 0, 'lue': 0, 'archivée': 1 };
        etatInt = etatMap[etat] !== undefined ? etatMap[etat] : 0;
      }

      // Utiliser GETDATE() directement dans la requête SQL pour la date
      const query = `
        INSERT INTO document 
        (description, date, part_ref, part_id, employe_id, date_alarme, emetteur, type, etat, user_id)
        OUTPUT INSERTED.id, INSERTED.description, INSERTED.date, INSERTED.part_ref, INSERTED.part_id,
               INSERTED.employe_id, INSERTED.date_alarme, INSERTED.emetteur, INSERTED.type, INSERTED.etat, INSERTED.user_id
        VALUES (:description, GETDATE(), :part_ref, :part_id, :employe_id, :date_alarme, :emetteur, :type, :etat, :user_id)
      `;

      const result = await finalSequelize.query(query, {
        replacements: {
          description: description || null,
          part_ref: part_ref || null,
          part_id: part_id || null,
          employe_id: employe_id || null,
          date_alarme: date_alarme || new Date(),
          emetteur: emetteur || null,
          type: typeInt,
          etat: etatInt,
          user_id: user_id || null
        },
        type: finalSequelize.QueryTypes.INSERT
      });

      return result && result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error('[NotificationService] Erreur création notification:', error);
      throw error;
    }
  }
}

module.exports = new NotificationService();

