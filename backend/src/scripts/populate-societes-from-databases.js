const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Sequelize } = require('sequelize');

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
    logging: console.log,
  }
);

async function populateSocietesFromDatabases() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion à SQL Server réussie');

    // Récupérer toutes les bases de données de l'instance
    const [databases] = await sequelize.query(`
      SELECT name 
      FROM sys.databases 
      WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
      AND state = 0
      ORDER BY name
    `);

    console.log(`📊 ${databases.length} bases de données trouvées:`);
    databases.forEach(db => console.log(`  - ${db.name}`));

    // Récupérer les sociétés existantes
    const Societe = require('../models/societe.model');
    const existingSocietes = await Societe.findAll();
    const existingNames = existingSocietes.map(s => s.nom_base);

    let addedCount = 0;
    let updatedCount = 0;

    for (const db of databases) {
      const dbName = db.name;
      const societeName = dbName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      // Vérifier si la société existe déjà
      let societe = await Societe.findOne({ where: { nom_base: dbName } });

      if (societe) {
        // Mettre à jour la société existante
        await societe.update({ 
          host: dbName,
          actif: true 
        });
        console.log(`🔄 Société mise à jour: ${societeName} (${dbName})`);
        updatedCount++;
      } else {
        // Créer une nouvelle société
        societe = await Societe.create({
          nom: societeName,
          nom_base: dbName,
          host: dbName,
          actif: true
        });
        console.log(`➕ Nouvelle société créée: ${societeName} (${dbName})`);
        addedCount++;
      }
    }

    console.log(`\n✅ Synchronisation terminée:`);
    console.log(`  - ${addedCount} nouvelles sociétés créées`);
    console.log(`  - ${updatedCount} sociétés mises à jour`);
    console.log(`  - ${databases.length} bases de données au total`);

  } catch (error) {
    console.error('❌ Erreur lors de la synchronisation:', error);
  } finally {
    await sequelize.close();
  }
}

populateSocietesFromDatabases();




