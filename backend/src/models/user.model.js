const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
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
  societe_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'societes',
      key: 'id'
    }
  },
  role: {
    type: DataTypes.ENUM('admin', 'user', 'manager'),
    defaultValue: 'user'
  },
  actif: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'users',
  tableName: 'users',
  timestamps: false
});

module.exports = User;
