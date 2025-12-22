const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UnifiedUser = sequelize.define('UnifiedUser', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  username: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('admin', 'user', 'manager'),
    defaultValue: 'user'
  },
  actif: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // Permissions pour accéder aux différentes bases
  allowed_databases: {
    type: DataTypes.TEXT, // JSON string des bases autorisées
    allowNull: true,
    comment: 'Liste des bases de données autorisées pour cet utilisateur'
  }
}, {
  tableName: 'unified_users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = UnifiedUser;
