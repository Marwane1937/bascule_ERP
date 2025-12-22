const Societe = require('../models/societe.model');
const DocumentSociete = require('../models/document_societe.model');
const User = require('../models/user.model');

// Définir les relations entre les modèles
function setupRelations() {
  try {
    // Relation Société -> DocumentSociete (1:1)
    Societe.hasOne(DocumentSociete, {
      foreignKey: 'societe_id',
      as: 'documentSociete'
    });
    DocumentSociete.belongsTo(Societe, {
      foreignKey: 'societe_id',
      as: 'societe'
    });

    // Relation Société -> User (1:N)
    Societe.hasMany(User, {
      foreignKey: 'societe_id',
      as: 'users'
    });
    User.belongsTo(Societe, {
      foreignKey: 'societe_id',
      as: 'societe'
    });

    console.log('✅ Relations entre modèles configurées');
  } catch (error) {
    console.error('❌ Erreur configuration relations:', error);
  }
}

module.exports = setupRelations;
