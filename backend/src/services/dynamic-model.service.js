const databaseSwitchService = require('./database-switch.service');

class DynamicModelService {
  // Obtenir une instance de modèle avec la connexion active
  getModel(ModelClass) {
    const connection = databaseSwitchService.getConnectionToUse();
    
    // Si le modèle a déjà une connexion, la retourner
    if (ModelClass.sequelize) {
      return ModelClass;
    }
    
    // Sinon, créer une nouvelle instance avec la connexion active
    return ModelClass.init(ModelClass.rawAttributes, {
      sequelize: connection,
      modelName: ModelClass.name,
      tableName: ModelClass.tableName,
      timestamps: ModelClass.options?.timestamps || false
    });
  }

  // Obtenir tous les modèles avec la connexion active
  getAllModels() {
    const connection = databaseSwitchService.getConnectionToUse();
    
    // Supprimer le cache des modèles pour forcer leur relecture avec la nouvelle connexion
    const modelPaths = [
      '../models/user.model',
      '../models/societe.model',
      '../models/unified-user.model',
      '../models/document_societe.model',
      '../models/user_permissions.model'
    ];
    
    modelPaths.forEach(modelPath => {
      try {
        const resolvedPath = require.resolve(modelPath);
        delete require.cache[resolvedPath];
      } catch (error) {
        // Ignorer les erreurs
      }
    });
    
    return {
      // Base models
      Client: require('../models/base/client.model'),
      Article: require('../models/base/article.model'),
      Famille: require('../models/base/famille.model'),
      
      // Ventes models
      Devis: require('../models/ventes/devis.model'),
      
      // Other models
      User: require('../models/user.model'),
      Societe: require('../models/societe.model'),
      DocumentSociete: require('../models/document_societe.model'),
      UserPermission: require('../models/user_permissions.model'),
      UnifiedUser: require('../models/unified-user.model'),
      Email: require('../models/email.model')
    };
  }

  // Synchroniser tous les modèles avec la connexion active
  async syncAllModels() {
    try {
      const connection = databaseSwitchService.getConnectionToUse();
      const models = this.getAllModels();
      
      console.log(`[DynamicModelService] 🔄 Synchronisation des modèles avec la connexion: ${connection.config?.database || 'unknown'}`);
      
      // Synchroniser chaque modèle en réinitialisant avec la nouvelle connexion
      for (const [modelName, ModelClass] of Object.entries(models)) {
        try {
          // Pour les modèles Sequelize définis avec sequelize.define()
          if (ModelClass && ModelClass.sequelize) {
            // Vérifier si la connexion du modèle est différente de la connexion active
            const modelConnection = ModelClass.sequelize;
            const modelDb = modelConnection.config?.database || 'unknown';
            const activeDb = connection.config?.database || 'unknown';
            
            if (modelConnection !== connection && modelDb !== activeDb) {
              console.log(`[DynamicModelService] 🔄 Modèle ${modelName} utilise une connexion différente (${modelDb} vs ${activeDb}), réinitialisation...`);
              
              // Forcer la réinitialisation en supprimant la référence à l'ancienne connexion
              // et en réinitialisant avec la nouvelle
              if (ModelClass.rawAttributes || ModelClass.attributes) {
                const attributes = ModelClass.rawAttributes || ModelClass.attributes;
                const tableName = ModelClass.tableName || ModelClass.name.toLowerCase() + 's';
                
                // Supprimer l'ancienne connexion du modèle
                ModelClass.sequelize = null;
                
                // Réinitialiser le modèle avec la nouvelle connexion
                ModelClass.init(attributes, {
                  sequelize: connection,
                  modelName: ModelClass.name || modelName,
                  tableName: tableName,
                  timestamps: ModelClass.options?.timestamps || false
                });
                
                console.log(`✅ Modèle ${modelName} réinitialisé avec la nouvelle connexion (${activeDb})`);
              }
            }
            
            // Synchroniser le modèle avec sa connexion actuelle
            if (typeof ModelClass.sync === 'function') {
              // Vérifier que la connexion n'est pas fermée
              const currentConnection = ModelClass.sequelize || connection;
              if (currentConnection && !currentConnection.connectionManager.closed) {
                await ModelClass.sync({ alter: false });
                const syncDb = currentConnection.config?.database || 'unknown';
                console.log(`✅ Modèle ${modelName} synchronisé avec la connexion: ${syncDb}`);
              } else {
                console.warn(`⚠️ Modèle ${modelName} a une connexion fermée, synchronisation ignorée`);
              }
            }
          } else if (ModelClass && typeof ModelClass.init === 'function') {
            // Pour les modèles qui ont une méthode init mais pas encore de connexion
            if (ModelClass.rawAttributes || ModelClass.attributes) {
              const attributes = ModelClass.rawAttributes || ModelClass.attributes;
              const tableName = ModelClass.tableName || ModelClass.name.toLowerCase() + 's';
              
              // Réinitialiser le modèle avec la nouvelle connexion
              ModelClass.init(attributes, {
                sequelize: connection,
                modelName: ModelClass.name || modelName,
                tableName: tableName,
                timestamps: ModelClass.options?.timestamps || false
              });
              
              // Synchroniser le modèle
              if (typeof ModelClass.sync === 'function') {
                await ModelClass.sync({ alter: false });
                console.log(`✅ Modèle ${modelName} synchronisé avec la connexion active`);
              }
            } else {
              console.warn(`⚠️ Modèle ${modelName} n'a pas d'attributs définis, synchronisation ignorée`);
            }
          } else {
            // Modèles fonctionnels (comme client.model.js, article.model.js) - pas de synchronisation nécessaire
            console.log(`ℹ️ Modèle ${modelName} est un modèle fonctionnel, synchronisation ignorée`);
          }
        } catch (modelError) {
          console.error(`❌ Erreur synchronisation modèle ${modelName}:`, modelError.message);
          console.error(`❌ Stack:`, modelError.stack);
          // Continuer avec les autres modèles
        }
      }
      
      return true;
    } catch (error) {
      console.error('❌ Erreur synchronisation modèles:', error);
      return false;
    }
  }

  // Obtenir les données d'un modèle avec la connexion active
  async getModelData(ModelClass, options = {}) {
    try {
      const model = this.getModel(ModelClass);
      const connection = databaseSwitchService.getConnectionToUse();
      
      // Utiliser la connexion active pour la requête
      const results = await connection.query(
        `SELECT * FROM ${model.tableName}`,
        {
          type: connection.QueryTypes.SELECT,
          ...options
        }
      );
      
      return results;
    } catch (error) {
      console.error('❌ Erreur récupération données:', error);
      throw error;
    }
  }
}

module.exports = new DynamicModelService();


