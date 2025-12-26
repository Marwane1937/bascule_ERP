const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ChequeCalibration = sequelize.define('ChequeCalibration', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    banque_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    imprimante: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    offset_x_mm: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    offset_y_mm: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'cheque_calibration',
    timestamps: false
});

module.exports = ChequeCalibration;
