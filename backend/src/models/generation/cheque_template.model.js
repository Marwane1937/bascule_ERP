const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ChequeTemplate = sequelize.define('ChequeTemplate', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    banque_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    nom_template: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    largeur_mm: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    hauteur_mm: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'cheque_template',
    timestamps: false
});

module.exports = ChequeTemplate;
