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
      Email: require('../models/email.model')
    };
  }

  // Synchroniser tous les modèles avec la connexion active
  async syncAllModels() {
    try {
      const connection = databaseSwitchService.getConnectionToUse();
      const models = this.getAllModels();
      
      // Synchroniser chaque modèle
      for (const [modelName, ModelClass] of Object.entries(models)) {
        if (ModelClass && typeof ModelClass.sync === 'function') {
          await ModelClass.sync({ alter: false });
          console.log(`✅ Modèle ${modelName} synchronisé avec la connexion active`);
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


