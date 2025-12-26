const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const RegleSettings = sequelize.define('RegleSettings', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    regle_num: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    regle_dat: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    part_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    sens: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    montant: {
        type: DataTypes.DECIMAL(16, 2),
        allowNull: false
    },
    mode: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    regle_ref: {
        type: DataTypes.STRING(16),
        allowNull: true
    },
    emetteur: {
        type: DataTypes.STRING(128),
        allowNull: true
    },
    regle_bnq: {
        type: DataTypes.CHAR(8),
        allowNull: true
    },
    echeance: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    remise_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    compte_bnq: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    bordereau_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    description: {
        type: DataTypes.STRING(250),
        allowNull: true
    },
    adresse: {
        type: DataTypes.STRING(250),
        allowNull: true
    },
    type: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    etat: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    imprime: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'regle_settings',
    timestamps: false
});

module.exports = RegleSettings;
