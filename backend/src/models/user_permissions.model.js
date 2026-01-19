const { DataTypes } = require('sequelize');
const { getConnection } = require('../config/database');

// Fonction pour obtenir le modèle avec la connexion active
const getUserPermissionModel = () => {
  const sequelize = getConnection();
  return sequelize.define('UserPermission', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  menu_item: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  access: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0 // 0 = pas d'accès, 1 = accès activé
  }
}, {
  tableName: 'user_permissions',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'menu_item']
    }
  ]
  });
};

// Créer le modèle avec la connexion par défaut pour compatibilité
const sequelize = require('../config/database');
const UserPermission = sequelize.define('UserPermission', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  menu_item: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  access: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'user_permissions',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'menu_item']
    }
  ]
});

module.exports = UserPermission;
module.exports.getUserPermissionModel = getUserPermissionModel;

