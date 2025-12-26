const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ChequePrintLog = sequelize.define('ChequePrintLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    regle_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    date_impression: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    imprimante: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    calibration_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
}, {
    tableName: 'cheque_print_log',
    timestamps: false
});

module.exports = ChequePrintLog;
