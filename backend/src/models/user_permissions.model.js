const { DataTypes } = require('sequelize');
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

module.exports = UserPermission;

