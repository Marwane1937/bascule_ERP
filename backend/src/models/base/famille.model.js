const sequelize = require('../../config/database');

// Récupérer tous les Familles
const getAllFamille = async (sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const [results] = await connectionToUse.query('SELECT * FROM famille');
  return results;
};

// Récupérer tous les Unites
const getAllUnite = async (sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const [results] = await connectionToUse.query('SELECT * FROM unite');
  return results;
};
// Récupérer une Famille par code
const getFamilleById = async (code, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const results = await connectionToUse.query(
    'SELECT * FROM famille WHERE code = :code',
    {
      replacements: { code },
      type: connectionToUse.QueryTypes.SELECT,
    }
  );
  return results[0];
};

// Ajouter une Famille
const addFamille = async ({ code, nom, etat = 1 }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const [result] = await connectionToUse.query(
    `INSERT INTO famille (code, nom, etat) 
     OUTPUT INSERTED.code 
     VALUES (:code, :nom, :etat)`,
    {
      replacements: { code, nom, etat },
      type: connectionToUse.QueryTypes.INSERT,
    }
  );
  return result.code;
};

// Modifier une Famille
const updatFamille = async (code, { nom, etat = 1 }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    `UPDATE famille 
     SET nom = :nom, etat = :etat
     WHERE code = :code`,
    {
      replacements: { code, nom, etat },
      type: connectionToUse.QueryTypes.UPDATE,
    }
  );
  return { code, nom, etat };
};

// Supprimer une Famille par code
const deleteFamille = async (code, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    'DELETE FROM famille WHERE code = :code',
    {
      replacements: { code },
      type: connectionToUse.QueryTypes.DELETE,
    }
  );
};

module.exports = {
  getAllFamille,
  addFamille,
  deleteFamille,
  getFamilleById,
  updatFamille,
  getAllUnite
};
