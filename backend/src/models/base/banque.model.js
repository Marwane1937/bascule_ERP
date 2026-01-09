const { getConnection } = require('../../config/database');

/**
 * Récupérer toutes les banques avec pagination
 */
const getAllBanques = async (options = {}) => {
  const sequelize = getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'nom',
      orderDirection = 'ASC',
      search = '',
      etat = null,
      type = null
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['id', 'code', 'nom', 'nom_court', 'swift', 'type', 'etat'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'nom';
    const safeOrderDirection = orderDirection.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let whereConditions = [];
    const replacements = {};

    if (search && search.trim()) {
      whereConditions.push(`(
        code LIKE :search
        OR nom LIKE :search
        OR nom_court LIKE :search
        OR swift LIKE :search
        OR CAST(id AS NVARCHAR(50)) LIKE :search
      )`);
      replacements.search = `%${search.trim()}%`;
    }

    if (etat !== null && etat !== undefined) {
      whereConditions.push('etat = :etat');
      replacements.etat = etat;
    }

    if (type !== null && type !== undefined) {
      whereConditions.push('type = :type');
      replacements.type = type;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT
        id, code, nom, nom_court, swift, type, etat, cr_date, user_id,
        COUNT(*) OVER() AS total_count
      FROM banque
      ${whereClause}
      ORDER BY ${safeOrderBy} ${safeOrderDirection}
      OFFSET ${offset} ROWS
      FETCH NEXT ${safePageSize} ROWS ONLY
    `;

    const results = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    const total = results.length > 0 ? parseInt(results[0].total_count) || 0 : 0;
    const data = results.map(({ total_count, ...rest }) => rest);

    const totalPages = Math.ceil(total / safePageSize) || 1;

    return {
      data,
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages
      }
    };
  } catch (error) {
    console.error('[getAllBanques] Erreur:', error);
    throw error;
  }
};

/**
 * Récupérer une banque par ID
 */
const getBanqueById = async (id) => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT id, code, nom, nom_court, swift, type, etat, cr_date, user_id
      FROM banque
      WHERE id = :id
    `;

    const results = await sequelize.query(query, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    });

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('[getBanqueById] Erreur:', error);
    throw error;
  }
};

/**
 * Créer une nouvelle banque
 */
const createBanque = async (data) => {
  const sequelize = getConnection();
  try {
    const query = `
      INSERT INTO banque (code, nom, nom_court, swift, type, etat, cr_date, user_id)
      OUTPUT INSERTED.id
      VALUES (:code, :nom, :nom_court, :swift, :type, :etat, GETDATE(), :user_id)
    `;

    const [result] = await sequelize.query(query, {
      replacements: {
        code: data.code,
        nom: data.nom,
        nom_court: data.nom_court || null,
        swift: data.swift || null,
        type: data.type || null,
        etat: data.etat !== undefined ? data.etat : 1,
        user_id: data.user_id || null
      },
      type: sequelize.QueryTypes.SELECT
    });

    return {
      id: result.id,
      message: 'Banque créée avec succès'
    };
  } catch (error) {
    console.error('[createBanque] Erreur:', error);
    throw error;
  }
};

/**
 * Mettre à jour une banque
 */
const updateBanque = async (id, data) => {
  const sequelize = getConnection();
  try {
    const query = `
      UPDATE banque
      SET code = :code, nom = :nom, nom_court = :nom_court, swift = :swift,
          type = :type, etat = :etat
      WHERE id = :id
    `;

    await sequelize.query(query, {
      replacements: {
        id,
        code: data.code,
        nom: data.nom,
        nom_court: data.nom_court || null,
        swift: data.swift || null,
        type: data.type || null,
        etat: data.etat
      },
      type: sequelize.QueryTypes.UPDATE
    });

    return { success: true, message: 'Banque mise à jour avec succès' };
  } catch (error) {
    console.error('[updateBanque] Erreur:', error);
    throw error;
  }
};

/**
 * Supprimer une banque
 */
const deleteBanque = async (id) => {
  const sequelize = getConnection();
  try {
    await sequelize.query('DELETE FROM banque WHERE id = :id', {
      replacements: { id },
      type: sequelize.QueryTypes.DELETE
    });

    return { success: true, message: 'Banque supprimée avec succès' };
  } catch (error) {
    console.error('[deleteBanque] Erreur:', error);
    throw error;
  }
};

module.exports = {
  getAllBanques,
  getBanqueById,
  createBanque,
  updateBanque,
  deleteBanque
};





