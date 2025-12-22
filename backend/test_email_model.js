const { getEmailDataByDocumentId } = require('./src/models/email.model');
const databaseSwitchService = require('./src/services/database-switch.service');

async function test() {
    try {
        const sequelize = databaseSwitchService.getConnectionToUse();
        console.log('Testing getEmailDataByDocumentId(7)...');
        const data = await getEmailDataByDocumentId(7, sequelize);
        console.log('Data length:', data.length);
        if (data.length > 0) {
            console.log('First row document_kind:', data[0].document_kind);
            console.log('First row numero:', data[0].numero);
        } else {
            console.log('No data found');
        }
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

test();
