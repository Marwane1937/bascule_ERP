const UserPermission = require('../models/user_permissions.model');
const User = require('../models/user.model');

class UserPermissionsService {
  // Récupérer toutes les permissions d'un utilisateur
  async getUserPermissions(userId, sequelizeConnection = null) {
    try {
      //console.log('[UserPermissionsService] 🔍 Récupération permissions pour userId:', userId);
      //console.log('[UserPermissionsService] 🔍 Connexion fournie:', !!sequelizeConnection);

      if (!userId) {
        throw new Error('userId est requis pour récupérer les permissions');
      }

      const sequelize = sequelizeConnection || UserPermission.sequelize;

      if (!sequelize) {
        throw new Error('Aucune connexion Sequelize disponible');
      }

      // console.log('[UserPermissionsService] 🔍 Base de données utilisée:', sequelize.config?.database || sequelize.getDatabaseName?.() || 'Non spécifiée');
      // console.log('[UserPermissionsService] 🔍 Exécution requête SQL...');
      // console.log('[UserPermissionsService] 🔍 Requête: SELECT id, user_id, menu_item, access FROM user_permissions WHERE user_id = :userId');
      // console.log('[UserPermissionsService] 🔍 Paramètres: userId =', userId);

      // Vérifier d'abord si la table existe (pour SQL Server)
      try {
        const tableCheck = await sequelize.query(
          `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'user_permissions' AND TABLE_SCHEMA = 'dbo'`,
          {
            type: sequelize.QueryTypes.SELECT
          }
        );
        // console.log('[UserPermissionsService] 🔍 Vérification table user_permissions:', tableCheck);
        const tableExists = tableCheck && tableCheck.length > 0 && (tableCheck[0].count > 0 || tableCheck[0].count === 1);
        //  console.log('[UserPermissionsService] 🔍 Table user_permissions existe:', tableExists);

        if (!tableExists) {
          console.warn('[UserPermissionsService] ⚠️ La table user_permissions n\'existe pas dans cette base de données');
          console.warn('[UserPermissionsService] ⚠️ Base de données:', sequelize.config?.database || 'Non spécifiée');
          return [];
        }
      } catch (tableCheckError) {
        console.warn('[UserPermissionsService] ⚠️ Impossible de vérifier l\'existence de la table:', tableCheckError.message);
        // On continue quand même, peut-être que la requête fonctionnera
      }

      // Exécuter la requête pour récupérer les permissions
      const permissions = await sequelize.query(
        `SELECT id, user_id, menu_item, access FROM user_permissions WHERE user_id = :userId`,
        {
          replacements: { userId },
          type: sequelize.QueryTypes.SELECT
        }
      );

      //   console.log('[UserPermissionsService] ✅ Requête exécutée avec succès');
      //   console.log('[UserPermissionsService] ✅ Permissions trouvées:', permissions.length);

      if (permissions.length > 0) {
        console.log('[UserPermissionsService] 📋 Permissions:', JSON.stringify(permissions, null, 2));
      } else {
        console.warn('[UserPermissionsService] ⚠️ Aucune permission trouvée pour userId:', userId);
        console.warn('[UserPermissionsService] ⚠️ Vérifiez que la table user_permissions existe et contient des données pour cet utilisateur');
      }

      return permissions;
    } catch (error) {
      console.error('[UserPermissionsService] ❌ Erreur récupération permissions:', error);
      console.error('[UserPermissionsService] ❌ Message:', error.message);
      console.error('[UserPermissionsService] ❌ Code:', error.code);
      console.error('[UserPermissionsService] ❌ Nom:', error.name);
      console.error('[UserPermissionsService] ❌ Stack trace:', error.stack);

      // Si c'est une erreur de table inexistante, retourner un tableau vide au lieu de throw
      if (error.message && (
        error.message.includes('Invalid object name') ||
        error.message.includes('Table') && error.message.includes("doesn't exist") ||
        error.message.includes('relation') && error.message.includes('does not exist')
      )) {
        console.warn('[UserPermissionsService] ⚠️ La table user_permissions n\'existe pas dans cette base de données');
        console.warn('[UserPermissionsService] ⚠️ Retour d\'un tableau vide');
        return [];
      }

      throw error;
    }
  }

  // Mettre à jour les permissions d'un utilisateur
  async updateUserPermissions(userId, permissions, sequelizeConnection = null) {
    try {
      const sequelize = sequelizeConnection || UserPermission.sequelize;

      // Vérifier que l'utilisateur existe
      const User = sequelizeConnection
        ? (sequelizeConnection.models && sequelizeConnection.models.User
          ? sequelizeConnection.models.User
          : require('../models/user.model'))
        : require('../models/user.model');

      const user = await sequelize.query(
        `SELECT id FROM users WHERE id = :userId`,
        {
          replacements: { userId },
          type: sequelize.QueryTypes.SELECT
        }
      );

      if (!user || user.length === 0) {
        throw new Error('Utilisateur non trouvé');
      }

      // Supprimer toutes les permissions existantes pour cet utilisateur
      await sequelize.query(
        `DELETE FROM user_permissions WHERE user_id = :userId`,
        {
          replacements: { userId },
          type: sequelize.QueryTypes.DELETE
        }
      );

      // Insérer TOUTES les permissions (avec access = 0 ou 1) pour préserver l'état
      if (permissions && permissions.length > 0) {

        // Utiliser des paramètres pour éviter l'injection SQL
        const insertPromises = permissions.map(permission => {
          // Normaliser la valeur d'access (convertir true/false en 1/0)
          let accessValue = permission.access;
          if (accessValue === true || accessValue === 'true' || accessValue === '1') {
            accessValue = 1;
          } else if (accessValue === false || accessValue === 'false' || accessValue === '0') {
            accessValue = 0;
          }

          return sequelize.query(
            `INSERT INTO user_permissions (user_id, menu_item, access) VALUES (:userId, :menuItem, :access)`,
            {
              replacements: {
                userId: userId,
                menuItem: permission.menu_item,
                access: accessValue
              },
              type: sequelize.QueryTypes.INSERT
            }
          );
        });

        await Promise.all(insertPromises);
      } else {
      }

      // Retourner les permissions mises à jour
      return await this.getUserPermissions(userId, sequelizeConnection);
    } catch (error) {
      console.error('Erreur mise à jour permissions:', error);
      throw error;
    }
  }

  // Obtenir tous les menu items disponibles
  async getAvailableMenuItems() {
    return [
      {
        category: 'Base',
        icon: 'fas fa-layer-group',
        items: [
          { name: 'Client', route: '/Client' },
          { name: 'Employé', route: '/Employe' },
          { name: 'Fournisseur', route: '/Fournisseur' },
          { name: 'Véhicule', route: '/Vehicule' },
          { name: 'Commercial', route: '/Commercial' },
          { name: 'Produit', route: '/Produit' },
          { name: 'Famille', route: '/Famille' },
          { name: 'Ville', route: '/Ville' },
          { name: 'Banque', route: '/Banque' },
          { name: 'Bénéficiaire', route: '/Beneficiaire' },
          { name: 'Département', route: '/Departement' },
          { name: 'Unité', route: '/Unite' }
        ]
      },
      {
        category: 'Ventes',
        icon: 'fas fa-pen-square',
        items: [
          { name: 'Devis', route: '/Devis' },
          { name: 'Commande Client', route: '/Commande' },
          { name: 'Livraison', route: '/Livraison' },
          { name: 'Retour Client', route: '/Retour' },
          { name: 'Avoir Client', route: '/Avoir' },
          { name: 'Facturation', route: '/Facturation' },
          { name: 'Contrat', route: '/Contrat' }
        ]
      },
      {
        category: 'Achats',
        icon: 'fas fa-shopping-cart',
        items: [
          { name: 'Bon de commande', route: '/Bon-Commande' },
          { name: 'Facture Fournisseur', route: '/Facture-Fournisseur' }
        ]
      },
      {
        category: 'Stock',
        icon: 'fas fa-boxes',
        items: [
          { name: 'Entrée de stock', route: '/Stock/Entree' },
          { name: 'Sortie de stock', route: '/Stock/Sortie' },
          { name: 'Inventaire', route: '/Stock/Inventaire' },
          { name: 'Historique mouvements', route: '/Stock/Historique' },
          { name: 'Reporting Stock', route: '/Stock/Reporting' }
        ]
      },
      {
        category: 'Interventions',
        icon: 'fas fa-first-aid',
        items: [
          { name: 'Gestion Interventions', route: '/Interventions' },
          { name: 'Nouvelle Intervention', route: '/Interventions/Nouvelle' },
          { name: 'Rapports Interventions', route: '/Interventions/Rapports' }
        ]
      },
      {
        category: 'Finance',
        icon: 'fas fa-money-bill-wave',
        items: [
          { name: 'Règlements', route: '/Reglement' },
          { name: 'Caisse', route: '/Caisse' },
          { name: 'Recettes', route: '/Caisse-Recettes' },
          { name: 'Dépenses', route: '/Caisse-Depenses' }
        ]
      },
      {
        category: 'Génération',
        icon: 'fas fa-print',
        items: [
          { name: 'Chèques', route: '/generation/cheques' },
          { name: 'Calibration', route: '/generation/calibration' },
          { name: 'Aperçu', route: '/generation/apercu' },
          { name: 'Impression', route: '/generation/impression' }
        ]
      },
      {
        category: 'Sécurité',
        icon: 'fas fa-shield-alt',
        items: [
          { name: 'Utilisateurs', route: '/Users' },
          { name: 'Permissions Utilisateurs', route: '/User-Permissions' },
          { name: 'Listes', route: '/Listes' },
          { name: 'Compteur', route: '/Compteur' },
          { name: 'Notifications', route: '/Notifications' }
        ]
      },
      {
        category: 'Permissions Notifications',
        icon: 'fas fa-bell',
        items: [
          { name: 'notification_view', route: '' },
          { name: 'notification_mark_read', route: '' },
          { name: 'notification_archive', route: '' },
          { name: 'notification_restore', route: '' },
          { name: 'notification_delete', route: '' }
        ]
      }
    ];
  }

  // Déconnecter un utilisateur (invalider ses tokens)
  async disconnectUser(userId) {
    try {
      // Cette fonction peut être étendue pour gérer les tokens JWT
      // Pour l'instant, on retourne juste un succès
      // Dans une implémentation complète, on pourrait stocker les tokens blacklistés
      return { success: true, message: 'Utilisateur déconnecté avec succès' };
    } catch (error) {
      console.error('Erreur déconnexion utilisateur:', error);
      throw error;
    }
  }
}

module.exports = new UserPermissionsService();

