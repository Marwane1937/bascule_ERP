const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

async function checkAdminUsers() {
    // 1. Connect to default DB to get list of databases
    const sequelize = new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASSWORD,
        {
            host: process.env.DB_HOST,
            dialect: 'mssql',
            dialectOptions: {
                options: {
                    encrypt: false,
                    trustServerCertificate: true,
                    instanceName: process.env.DB_INSTANCE,
                }
            },
            logging: false
        }
    );

    try {
        const [results] = await sequelize.query(
            "SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb') AND state = 0"
        );
        const databases = results.map(row => row.name);

        await sequelize.close();

        // 2. Check each database
        for (const dbName of databases) {
            const dbConnection = new Sequelize(
                dbName,
                process.env.DB_USER,
                process.env.DB_PASSWORD,
                {
                    host: process.env.DB_HOST,
                    dialect: 'mssql',
                    dialectOptions: {
                        options: {
                            encrypt: false,
                            trustServerCertificate: true,
                            instanceName: process.env.DB_INSTANCE,
                        }
                    },
                    logging: false
                }
            );

            try {
                await dbConnection.authenticate();
                const [users] = await dbConnection.query("SELECT id, nom, login, password FROM users WHERE login = 'admin'");

                if (users.length > 0) {
                    // Note: We can't easily check if password is 'admin123' because it's hashed, 
                    // but we can confirm the user exists.
                } else {
                }
            } catch (error) {
                console.error(`❌ Error connecting/querying ${dbName}: ${error.message}`);
            } finally {
                await dbConnection.close();
            }
        }

    } catch (error) {
        console.error('Fatal error:', error);
    }
}

checkAdminUsers();
