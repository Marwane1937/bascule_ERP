const UserPermission = require('../models/user_permissions.model');
const User = require('../models/user.model');
const { getConnection } = require('../config/database');
const databaseSwitchService = require('./database-switch.service');

class UserPermissionsService {
  // RÃ©cupÃ©rer toutes les permissions d'un utilisateur
  async getUserPermissions(userId, sequelizeConnection = null) {
    try {
      //console.log('[UserPermissionsService] ðŸ” RÃ©cupÃ©ration permissions pour userId:', userId);
      //console.log('[UserPermissionsService] ðŸ” Connexion fournie:', !!sequelizeConnection);

      if (!userId) {
        throw new Error('userId est requis pour rÃ©cupÃ©rer les permissions');
      }

      // Utiliser la connexion fournie, sinon getConnection() pour avoir la connexion active
      const sequelize = sequelizeConnection || getConnection();

      if (!sequelize) {
        throw new Error('Aucune connexion Sequelize disponible');
      }

      // console.log('[UserPermissionsService] ðŸ” Base de donnÃ©es utilisÃ©e:', sequelize.config?.database || sequelize.getDatabaseName?.() || 'Non spÃ©cifiÃ©e');
      // console.log('[UserPermissionsService] ðŸ” ExÃ©cution requÃªte SQL...');
      // console.log('[UserPermissionsService] ðŸ” RequÃªte: SELECT id, user_id, menu_item, access FROM user_permissions WHERE user_id = :userId');
      // console.log('[UserPermissionsService] ðŸ” ParamÃ¨tres: userId =', userId);

      // VÃ©rifier d'abord si la table existe (pour SQL Server)
      try {
        const tableCheck = await sequelize.query(
          `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'user_permissions' AND TABLE_SCHEMA = 'dbo'`,
          {
            type: sequelize.QueryTypes.SELECT
          }
        );
        // console.log('[UserPermissionsService] ðŸ” VÃ©rification table user_permissions:', tableCheck);
        const tableExists = tableCheck && tableCheck.length > 0 && (tableCheck[0].count > 0 || tableCheck[0].count === 1);
        //  console.log('[UserPermissionsService] ðŸ” Table user_permissions existe:', tableExists);

        if (!tableExists) {
          console.warn('[UserPermissionsService] âš ï¸ La table user_permissions n\'existe pas dans cette base de donnÃ©es');
          console.warn('[UserPermissionsService] âš ï¸ Base de donnÃ©es:', sequelize.config?.database || 'Non spÃ©cifiÃ©e');
          return [];
        }
      } catch (tableCheckError) {
        console.warn('[UserPermissionsService] âš ï¸ Impossible de vÃ©rifier l\'existence de la table:', tableCheckError.message);
        // On continue quand mÃªme, peut-Ãªtre que la requÃªte fonctionnera
      }

      // ExÃ©cuter la requÃªte pour rÃ©cupÃ©rer les permissions
      const permissions = await sequelize.query(
        `SELECT id, user_id, menu_item, access FROM user_permissions WHERE user_id = :userId`,
        {
          replacements: { userId },
          type: sequelize.QueryTypes.SELECT
        }
      );

      //   console.log('[UserPermissionsService] âœ… RequÃªte exÃ©cutÃ©e avec succÃ¨s');
      //   console.log('[UserPermissionsService] âœ… Permissions trouvÃ©es:', permissions.length);

      if (permissions.length > 0) {
        console.log('[UserPermissionsService] ðŸ“‹ Permissions:', JSON.stringify(permissions, null, 2));
      } else {
        console.warn('[UserPermissionsService] âš ï¸ Aucune permission trouvÃ©e pour userId:', userId);
        console.warn('[UserPermissionsService] âš ï¸ VÃ©rifiez que la table user_permissions existe et contient des donnÃ©es pour cet utilisateur');
      }

      return permissions;
    } catch (error) {
      console.error('[UserPermissionsService] âŒ Erreur rÃ©cupÃ©ration permissions:', error);
      console.error('[UserPermissionsService] âŒ Message:', error.message);
      console.error('[UserPermissionsService] âŒ Code:', error.code);
      console.error('[UserPermissionsService] âŒ Nom:', error.name);
      console.error('[UserPermissionsService] âŒ Stack trace:', error.stack);

      // Si c'est une erreur de table inexistante, retourner un tableau vide au lieu de throw
      if (error.message && (
        error.message.includes('Invalid object name') ||
        error.message.includes('Table') && error.message.includes("doesn't exist") ||
        error.message.includes('relation') && error.message.includes('does not exist')
      )) {
        console.warn('[UserPermissionsService] âš ï¸ La table user_permissions n\'existe pas dans cette base de donnÃ©es');
        console.warn('[UserPermissionsService] âš ï¸ Retour d\'un tableau vide');
        return [];
      }

      throw error;
    }
  }

  // Mettre Ã  jour les permissions d'un utilisateur
  async updateUserPermissions(userId, permissions, sequelizeConnection = null) {
    try {
      // Utiliser la connexion fournie, sinon getConnection() pour avoir la connexion active
      const sequelize = sequelizeConnection || getConnection();

      // VÃ©rifier que l'utilisateur existe
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
        throw new Error('Utilisateur non trouvÃ©');
      }

      // Supprimer toutes les permissions existantes pour cet utilisateur
      await sequelize.query(
        `DELETE FROM user_permissions WHERE user_id = :userId`,
        {
          replacements: { userId },
          type: sequelize.QueryTypes.DELETE
        }
      );

      // InsÃ©rer TOUTES les permissions (avec access = 0 ou 1) pour prÃ©server l'Ã©tat
      if (permissions && permissions.length > 0) {

        // Utiliser des paramÃ¨tres pour Ã©viter l'injection SQL
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

      // Retourner les permissions mises Ã  jour
      return await this.getUserPermissions(userId, sequelizeConnection);
    } catch (error) {
      console.error('Erreur mise Ã  jour permissions:', error);
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
          { name: 'Warehouse', route: '/Warehouse' },
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
          { name: 'pdf_devis_normal', route: '' },
          { name: 'pdf_devis_nomenclature', route: '' },
          { name: 'Commande Client', route: '/Commande' },
          { name: 'pdf_commande_normal', route: '' },
          { name: 'Livraison', route: '/Livraison' },
          { name: 'pdf_livraison_normal', route: '' },
          { name: 'pdf_livraison_non_valorise', route: '' },
          { name: 'Retour Client', route: '/Retour' },
          { name: 'pdf_retour_normal', route: '' },
          { name: 'Avoir Client', route: '/Avoir' },
          { name: 'pdf_avoir_normal', route: '' },
          { name: 'Facturation', route: '/Facturation' },
          { name: 'pdf_facturation_normal', route: '' },
          { name: 'Contrat', route: '/Contrat' },
          { name: 'Reporting Vente', route: '/Vente/Reporting' }
        ]
      },
      {
        category: 'Achats',
        icon: 'fas fa-shopping-cart',
        items: [
          { name: 'Demande d\'achat', route: '/Demande-Achat' },
          { name: 'pdf_demande_achat_normal', route: '' },
          { name: 'Bon de commande', route: '/Bon-Commande' },
          { name: 'pdf_bon_commande_normal', route: '' },
          { name: 'Facture Fournisseur', route: '/Facture-Fournisseur' },
          { name: 'pdf_facture_fournisseur_normal', route: '' },
          { name: 'Réception', route: '/Reception' },
          { name: 'pdf_reception_normal', route: '' },
          { name: 'Reporting Achats', route: '/Achat/Reporting' }
        ]
      },
      {
        category: 'Stock',
        icon: 'fas fa-boxes',
        items: [
          { name: 'Préparation', route: '/Stock/Preparation' },
          { name: 'Entrepôt', route: '/Stock/Entrepot' },
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
          { name: 'Bordereau de Remise', route: '/Finance/Bordereau-Remise' },
          { name: 'pdf_bordereau_remise_normal', route: '' },
          { name: 'Caisse', route: '/Caisse' },
          { name: 'Recette/Dépense', route: '/Caisse-Recette-Depense' },
          { name: 'Reporting Finance', route: '/Finance/Reporting' }
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
      },
    ];
  }

  // DÃ©connecter un utilisateur (invalider ses tokens)
  async disconnectUser(userId) {
    try {
      // Cette fonction peut Ãªtre Ã©tendue pour gÃ©rer les tokens JWT
      // Pour l'instant, on retourne juste un succÃ¨s
      // Dans une implÃ©mentation complÃ¨te, on pourrait stocker les tokens blacklistÃ©s
      return { success: true, message: 'Utilisateur déconnecté avec succès' };
    } catch (error) {
      console.error('Erreur dÃ©connexion utilisateur:', error);
      throw error;
    }
  }
}

module.exports = new UserPermissionsService();

