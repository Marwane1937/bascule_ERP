require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
  dialect: 'mssql',
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10),
  dialectOptions: {
    server: process.env.DB_HOST,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      instanceName: process.env.DB_INSTANCE,
    }
  },
  logging: false,
});

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion SQL Server réussie !');
  } catch (error) {
    console.error('❌ Erreur de connexion :', error);
  } finally {
    await sequelize.close();
  }
})();
