const { getConnection } = require('../../config/database');

/**
 * Récupérer toutes les conditions de paiement d'un partenaire
 */
const getPartenaireConditions = async (part_id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `
      SELECT pc.id, cp.code, cp.nom as condition, cp.jours, mr.nom as mode
      FROM partenaire_condition pc
      LEFT JOIN condition_paiement cp ON pc.condition_id = cp.id
      LEFT JOIN mode_regle mr ON mr.id = cp.mode_regle
      WHERE pc.part_id = :part_id
      ORDER BY pc.id DESC
    `;

    const results = await sequelize.query(query, {
      replacements: { part_id: parseInt(part_id) },
      type: sequelize.QueryTypes.SELECT
    });

    return results || [];
  } catch (error) {
    console.error('[getPartenaireConditions] Erreur:', error.message);
    throw error;
  }
};

/**
 * Récupérer toutes les conditions de paiement disponibles
 */
const getConditionsPaiement = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `
      SELECT id, nom
      FROM condition_paiement
      ORDER BY nom ASC
    `;

    const results = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT
    });

    return results || [];
  } catch (error) {
    console.error('[getConditionsPaiement] Erreur:', error.message);
    throw error;
  }
};

/**
 * Créer une nouvelle condition de paiement pour un partenaire
 */
const createPartenaireCondition = async (part_id, condition_id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    // Vérifier si la condition existe déjà pour ce partenaire
    const checkQuery = `
      SELECT id FROM partenaire_condition
      WHERE part_id = :part_id AND condition_id = :condition_id
    `;

    const existing = await sequelize.query(checkQuery, {
      replacements: {
        part_id: parseInt(part_id),
        condition_id: parseInt(condition_id)
      },
      type: sequelize.QueryTypes.SELECT
    });

    if (existing && existing.length > 0) {
      throw new Error('Cette condition de paiement existe déjà pour ce client');
    }

    const insertQuery = `
      INSERT INTO partenaire_condition (part_id, condition_id)
      OUTPUT INSERTED.id
      VALUES (:part_id, :condition_id)
    `;

    const result = await sequelize.query(insertQuery, {
      replacements: {
        part_id: parseInt(part_id),
        condition_id: parseInt(condition_id)
      },
      type: sequelize.QueryTypes.INSERT
    });

    const insertedId = result[0]?.[0]?.id || result[0]?.id;

    // Retourner les données complètes
    return await getPartenaireConditionById(insertedId, sequelize);
  } catch (error) {
    console.error('[createPartenaireCondition] Erreur:', error.message);
    throw error;
  }
};

/**
 * Récupérer une condition de paiement par ID
 */
const getPartenaireConditionById = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `
      SELECT pc.id, cp.code, cp.nom as condition, cp.jours, mr.nom as mode
      FROM partenaire_condition pc
      LEFT JOIN condition_paiement cp ON pc.condition_id = cp.id
      LEFT JOIN mode_regle mr ON mr.id = cp.mode_regle
      WHERE pc.id = :id
    `;

    const results = await sequelize.query(query, {
      replacements: { id: parseInt(id) },
      type: sequelize.QueryTypes.SELECT
    });

    return results && results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('[getPartenaireConditionById] Erreur:', error.message);
    throw error;
  }
};

/**
 * Mettre à jour une condition de paiement d'un partenaire
 */
const updatePartenaireCondition = async (id, condition_id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `
      UPDATE partenaire_condition
      SET condition_id = :condition_id
      WHERE id = :id
    `;

    await sequelize.query(query, {
      replacements: {
        id: parseInt(id),
        condition_id: parseInt(condition_id)
      },
      type: sequelize.QueryTypes.UPDATE
    });

    return await getPartenaireConditionById(id, sequelize);
  } catch (error) {
    console.error('[updatePartenaireCondition] Erreur:', error.message);
    throw error;
  }
};

/**
 * Supprimer une ou plusieurs conditions de paiement d'un partenaire
 */
const deletePartenaireConditions = async (ids, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('Aucun ID fourni pour la suppression');
    }

    const placeholders = ids.map((_, index) => `:id${index}`).join(',');
    const replacements = {};
    ids.forEach((id, index) => {
      replacements[`id${index}`] = parseInt(id);
    });

    const query = `
      DELETE FROM partenaire_condition
      WHERE id IN (${placeholders})
    `;

    await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.DELETE
    });

    return {
      success: true,
      message: `${ids.length} condition(s) de paiement supprimée(s) avec succès`
    };
  } catch (error) {
    console.error('[deletePartenaireConditions] Erreur:', error.message);
    throw error;
  }
};

module.exports = {
  getPartenaireConditions,
  getConditionsPaiement,
  createPartenaireCondition,
  updatePartenaireCondition,
  deletePartenaireConditions,
  getPartenaireConditionById
};

