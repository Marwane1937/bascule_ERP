const { getConnection } = require('../../config/database');

/**
 * Récupérer tous les compteurs avec pagination
 */
const getAllCompteurs = async (options = {}) => {
  const sequelize = getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'nom',
      orderDirection = 'ASC',
      search = '',
      etat = null
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['code', 'nom', 'compteur'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'nom';
    const safeOrderDirection = orderDirection.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let whereConditions = [];
    const replacements = {};

    if (search && search.trim()) {
      whereConditions.push(`(
        code LIKE :search
        OR nom LIKE :search
        OR CAST(compteur AS NVARCHAR(50)) LIKE :search
      )`);
      replacements.search = `%${search.trim()}%`;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT
        code, nom, compteur,
        COUNT(*) OVER() AS total_count
      FROM compteur
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
    console.error('[getAllCompteurs] Erreur:', error);
    throw error;
  }
};

/**
 * Récupérer un compteur par code
 */
const getCompteurByCode = async (code) => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT code, nom, compteur
      FROM compteur
      WHERE code = :code
    `;

    const results = await sequelize.query(query, {
      replacements: { code },
      type: sequelize.QueryTypes.SELECT
    });

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('[getCompteurByCode] Erreur:', error);
    throw error;
  }
};

/**
 * Mettre à jour un compteur
 */
const updateCompteur = async (code, updateData) => {
  const sequelize = getConnection();
  try {
    const { nom, compteur } = updateData;

    const query = `
      UPDATE compteur
      SET nom = :nom, compteur = :compteur
      WHERE code = :code
    `;

    const result = await sequelize.query(query, {
      replacements: { code, nom, compteur },
      type: sequelize.QueryTypes.UPDATE
    });

    if (result[1] === 0) {
      throw new Error('Compteur non trouvé');
    }

    return { code, nom, compteur };
  } catch (error) {
    console.error('[updateCompteur] Erreur:', error);
    throw error;
  }
};

/**
 * Récupérer les statistiques des compteurs
 */
const getCompteurStats = async () => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT
        COUNT(*) as total_compteurs,
        SUM(compteur) as total_compteurs_valeur
      FROM compteur
    `;

    const results = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT
    });

    return results[0] || { total_compteurs: 0, total_compteurs_valeur: 0 };
  } catch (error) {
    console.error('[getCompteurStats] Erreur:', error);
    throw error;
  }
};

module.exports = {
  getAll: getAllCompteurs,
  getByCode: getCompteurByCode,
  update: updateCompteur,
  getStats: getCompteurStats
};














