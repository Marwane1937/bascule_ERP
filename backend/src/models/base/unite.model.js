const { getConnection } = require('../../config/database');

/**
 * Récupérer toutes les unités avec pagination
 */
const getAllUnites = async (options = {}) => {
  const sequelize = getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'nom',
      orderDirection = 'ASC',
      search = '',
      etat = null,
      type = null,
      base = null,
      fact = null
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['id', 'code', 'nom', 'base', 'fact', 'type', 'etat'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'nom';
    const safeOrderDirection = orderDirection.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let whereConditions = [];
    const replacements = {};

    if (search && search.trim()) {
      whereConditions.push(`(
        code LIKE :search
        OR nom LIKE :search
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

    if (base !== null && base !== undefined) {
      whereConditions.push('base = :base');
      replacements.base = base;
    }

    if (fact !== null && fact !== undefined) {
      whereConditions.push('fact = :fact');
      replacements.fact = fact;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT
        id, code, nom, base, fact, type, etat, cr_date, user_id,
        COUNT(*) OVER() AS total_count
      FROM unite
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
    console.error('[getAllUnites] Erreur:', error);
    throw error;
  }
};

/**
 * Récupérer une unité par ID
 */
const getUniteById = async (id) => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT id, code, nom, base, fact, type, etat, cr_date, user_id
      FROM unite
      WHERE id = :id
    `;

    const results = await sequelize.query(query, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    });

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('[getUniteById] Erreur:', error);
    throw error;
  }
};

/**
 * Créer une nouvelle unité
 */
const createUnite = async (data) => {
  const sequelize = getConnection();
  try {
    const query = `
      INSERT INTO unite (code, nom, base, fact, type, etat, cr_date, user_id)
      OUTPUT INSERTED.id
      VALUES (:code, :nom, :base, :fact, :type, :etat, GETDATE(), :user_id)
    `;

    const [result] = await sequelize.query(query, {
      replacements: {
        code: data.code,
        nom: data.nom,
        base: data.base || null,
        fact: data.fact || null,
        type: data.type || null,
        etat: data.etat !== undefined ? data.etat : 1,
        user_id: data.user_id || null
      },
      type: sequelize.QueryTypes.SELECT
    });

    return {
      id: result.id,
      message: 'Unité créée avec succès'
    };
  } catch (error) {
    console.error('[createUnite] Erreur:', error);
    throw error;
  }
};

/**
 * Mettre à jour une unité
 */
const updateUnite = async (id, data) => {
  const sequelize = getConnection();
  try {
    const query = `
      UPDATE unite
      SET code = :code, nom = :nom, base = :base, fact = :fact,
          type = :type, etat = :etat
      WHERE id = :id
    `;

    await sequelize.query(query, {
      replacements: {
        id,
        code: data.code,
        nom: data.nom,
        base: data.base || null,
        fact: data.fact || null,
        type: data.type || null,
        etat: data.etat
      },
      type: sequelize.QueryTypes.UPDATE
    });

    return { success: true, message: 'Unité mise à jour avec succès' };
  } catch (error) {
    console.error('[updateUnite] Erreur:', error);
    throw error;
  }
};

/**
 * Supprimer une unité
 */
const deleteUnite = async (id) => {
  const sequelize = getConnection();
  try {
    await sequelize.query('DELETE FROM unite WHERE id = :id', {
      replacements: { id },
      type: sequelize.QueryTypes.DELETE
    });

    return { success: true, message: 'Unité supprimée avec succès' };
  } catch (error) {
    console.error('[deleteUnite] Erreur:', error);
    throw error;
  }
};

/**
 * Récupérer les unités par type
 */
const getUnitesByType = async (type) => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT id, code, nom, base, fact, type, etat
      FROM unite
      WHERE type = :type AND etat = 1
      ORDER BY nom
    `;

    const results = await sequelize.query(query, {
      replacements: { type },
      type: sequelize.QueryTypes.SELECT
    });

    return results;
  } catch (error) {
    console.error('[getUnitesByType] Erreur:', error);
    throw error;
  }
};

/**
 * Récupérer les unités de base
 */
const getUnitesBase = async () => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT id, code, nom, base, fact, type, etat
      FROM unite
      WHERE base = 1 AND etat = 1
      ORDER BY nom
    `;

    const results = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT
    });

    return results;
  } catch (error) {
    console.error('[getUnitesBase] Erreur:', error);
    throw error;
  }
};

module.exports = {
  getAllUnites,
  getUniteById,
  createUnite,
  updateUnite,
  deleteUnite,
  getUnitesByType,
  getUnitesBase
};





