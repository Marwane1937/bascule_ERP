const { DataTypes } = require('sequelize');
const { getConnection } = require('../config/database');

// Fonction pour obtenir le modèle avec la connexion active
const getDocumentSocieteModel = () => {
  const sequelize = getConnection();
  return sequelize.define('DocumentSociete', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  societe_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'societes',
      key: 'id'
    }
  },
  logo: {
    type: DataTypes.BLOB('long'),
    allowNull: true
  },
  entete: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  pied_page: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'document_societe',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
  });
};

// Créer le modèle avec la connexion par défaut pour compatibilité
const sequelize = require('../config/database');
const DocumentSociete = sequelize.define('DocumentSociete', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  societe_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'societes',
      key: 'id'
    }
  },
  logo: {
    type: DataTypes.BLOB('long'),
    allowNull: true
  },
  entete: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  pied_page: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'document_societe',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = DocumentSociete;
module.exports.getDocumentSocieteModel = getDocumentSocieteModel;