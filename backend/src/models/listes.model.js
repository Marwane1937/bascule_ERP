const { getConnection } = require('../config/database');


// Récupérer tous les group_id distincts avec group_nom
const getAllGroupIds = async (sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || getConnection();
    const results = await sequelize.query(
      `SELECT 
        l.group_id,
        CASE 
          WHEN l.group_id = 2000 THEN 'Recette'
          WHEN l.group_id = 3000 THEN 'Dépense'
          WHEN l.group_id = 4000 THEN 'Charge Véhicule'
          WHEN l.group_id = 5000 THEN 'Intérvention'
          WHEN l.group_id = 6000 THEN 'Entrée Stock'
          WHEN l.group_id = 7000 THEN 'Sortie Stock'

        END AS group_nom
      FROM listes l
      WHERE l.etat = 1
      GROUP BY l.group_id
      ORDER BY l.group_id ASC`,
      {
        type: sequelize.QueryTypes.SELECT
      }
    );

    // Pour SQL Server, results peut être un tableau de tableaux, prendre le premier élément
    const groupIds = Array.isArray(results) && results.length > 0 && Array.isArray(results[0]) ? results[0] : results;

    return Array.isArray(groupIds) ? groupIds : [];
  } catch (error) {
    console.error('[listes.model.js] ❌ Erreur lors de la requête:', error);
    console.error('[listes.model.js] ❌ Stack:', error.stack);
    throw error;
  }
};

// Récupérer les listes par group_id
const getListesByGroupId = async (group_id, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || getConnection();
    // Convertir group_id en nombre si nécessaire
    const groupIdNum = parseInt(group_id, 10);

    const results = await sequelize.query(
      `SELECT id, code, nom, group_id FROM listes WHERE group_id = :group_id ORDER BY id ASC`,
      {
        replacements: { group_id: groupIdNum },
        type: sequelize.QueryTypes.SELECT
      }
    );

    // Pour SQL Server, results peut être un tableau de tableaux, prendre le premier élément
    let listes = results;
    if (Array.isArray(results) && results.length > 0 && Array.isArray(results[0])) {
      listes = results[0];
    } else if (!Array.isArray(results)) {
      listes = [];
    }

    if (Array.isArray(listes) && listes.length > 0) {
    } else {
      // Vérifier si des données existent dans la table
      const [countResult] = await sequelize.query(
        `SELECT COUNT(*) as total FROM listes`,
        { type: sequelize.QueryTypes.SELECT }
      );
    }
    return Array.isArray(listes) ? listes : [];
  } catch (error) {
    console.error('[listes.model.js] ❌ Erreur lors de la requête:', error);
    console.error('[listes.model.js] ❌ Stack:', error.stack);
    throw error;
  }
};

// Récupérer une liste par ID
const getListeById = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const [results] = await sequelize.query(
    `SELECT id, code, nom, group_id FROM listes WHERE id = :id`,
    {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    }
  );
  return results && results.length > 0 ? results : (Array.isArray(results) ? results[0] : results);
};

// Ajouter une nouvelle liste
const addListe = async (listeData, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  return await sequelize.transaction(async (t) => {
    try {
      const { id, code, nom, group_id } = listeData;

      // Si un ID est fourni, l'utiliser, sinon laisser la base de données l'auto-générer
      let query, replacements;
      if (id) {
        query = `INSERT INTO listes (id, code, nom, group_id) 
                 OUTPUT INSERTED.id 
                 VALUES (:id, :code, :nom, :group_id)`;
        replacements = { id, code, nom, group_id };
      } else {
        query = `INSERT INTO listes (code, nom, group_id) 
                 OUTPUT INSERTED.id 
                 VALUES (:code, :nom, :group_id)`;
        replacements = { code, nom, group_id };
      }

      const [result] = await sequelize.query(
        query,
        {
          replacements: replacements,
          type: sequelize.QueryTypes.INSERT,
          transaction: t
        }
      );

      const listeId = result && (Array.isArray(result) ? (result[0]?.id || result[0]) : (result.id || result));

      return listeId;
    } catch (error) {
      console.error('❌ Erreur lors de l\'ajout de la liste:', error);
      throw new Error(`Erreur lors de l'ajout de la liste: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Modifier une liste
const updateListe = async (id, listeData, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { code, nom, group_id } = listeData;

  await sequelize.query(
    `UPDATE listes 
     SET code = :code, nom = :nom, group_id = :group_id
     WHERE id = :id`,
    {
      replacements: { id, code, nom, group_id },
      type: sequelize.QueryTypes.UPDATE
    }
  );
  return { id, ...listeData };
};

// Supprimer une liste par ID
const deleteListe = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  await sequelize.query(
    'DELETE FROM listes WHERE id = :id',
    {
      replacements: { id },
      type: sequelize.QueryTypes.DELETE
    }
  );
};

module.exports = {
  getAllGroupIds,
  getListesByGroupId,
  getListeById,
  addListe,
  updateListe,
  deleteListe
};

