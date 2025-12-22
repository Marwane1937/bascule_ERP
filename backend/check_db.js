const { getConnection } = require('./src/config/database');
const databaseSwitchService = require('./src/services/database-switch.service');

async function checkDb() {
    try {
        const sequelize = databaseSwitchService.getConnectionToUse();
        const retours = await sequelize.query("SELECT id, numero FROM stock WHERE type = 5", { type: sequelize.QueryTypes.SELECT });
        console.log('Retours:', JSON.stringify(retours, null, 2));
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkDb();
