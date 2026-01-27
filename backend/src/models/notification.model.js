const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Modèle pour la table document utilisée comme table de notifications
const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  part_ref: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  part_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  employe_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  date_alarme: {
    type: DataTypes.DATE,
    allowNull: true
  },
  emetteur: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'INFO'
  },
  etat: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'nouvelle'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'document',
  timestamps: false
});

module.exports = Notification;





















