const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Banque = sequelize.define('Banque', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    code: {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    nom: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    nom_court: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    swift: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    type: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    etat: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'banque',
    timestamps: false
});

module.exports = Banque;
