const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ChequeField = sequelize.define('ChequeField', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    template_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    nom_champ: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    x_mm: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    y_mm: {
        type: DataTypes.FLOAT,
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
    font: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    font_size: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    font_style: {
        type: DataTypes.STRING(20),
        allowNull: true
    },
    obligatoire: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'cheque_field',
    timestamps: false
});

module.exports = ChequeField;
