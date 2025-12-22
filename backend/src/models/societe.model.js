const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Societe = sequelize.define('Societe', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nom: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  nom_base: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  actif: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  host: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Nom de la base de données pour cette société'
  }
}, {
  tableName: 'societes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// Relations seront définies dans setup-relations.js
module.exports = Societe;
