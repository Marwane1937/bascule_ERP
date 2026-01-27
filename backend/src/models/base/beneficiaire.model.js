const { getConnection } = require('../../config/database');

/**
 * Récupérer tous les bénéficiaires avec pagination
 */
const getAllBeneficiaires = async (options = {}) => {
  const sequelize = getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'nom',
      orderDirection = 'ASC',
      search = '',
      departement_id = null
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['id', 'code', 'nom', 'departement_id'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'nom';
    const safeOrderDirection = orderDirection.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let whereConditions = [];
    const replacements = {};

    if (search && search.trim()) {
      whereConditions.push(`(
        b.code LIKE :search
        OR b.nom LIKE :search
        OR CAST(b.id AS NVARCHAR(50)) LIKE :search
        OR d.nom LIKE :search
      )`);
      replacements.search = `%${search.trim()}%`;
    }

    if (departement_id !== null && departement_id !== undefined) {
      whereConditions.push('b.departement_id = :departement_id');
      replacements.departement_id = departement_id;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT
        b.id, b.code, b.nom, b.departement_id,
        d.nom AS departement_nom,
        COUNT(*) OVER() AS total_count
      FROM beneficiaire b
      LEFT JOIN departement d ON d.id = b.departement_id
      ${whereClause}
      ORDER BY ${safeOrderBy === 'departement_id' ? 'd.nom' : `b.${safeOrderBy}`} ${safeOrderDirection}
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
    console.error('[getAllBeneficiaires] Erreur:', error);
    throw error;
  }
};

/**
 * Récupérer un bénéficiaire par ID
 */
const getBeneficiaireById = async (id) => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT
        b.id, b.code, b.nom, b.departement_id,
        d.nom AS departement_nom
      FROM beneficiaire b
      LEFT JOIN departement d ON d.id = b.departement_id
      WHERE b.id = :id
    `;

    const results = await sequelize.query(query, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    });

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('[getBeneficiaireById] Erreur:', error);
    throw error;
  }
};

/**
 * Créer un nouveau bénéficiaire
 */
const createBeneficiaire = async (data) => {
  const sequelize = getConnection();
  try {
    const query = `
      INSERT INTO beneficiaire (code, nom, departement_id)
      OUTPUT INSERTED.id
      VALUES (:code, :nom, :departement_id)
    `;

    const [result] = await sequelize.query(query, {
      replacements: {
        code: data.code,
        nom: data.nom,
        departement_id: data.departement_id || null
      },
      type: sequelize.QueryTypes.SELECT
    });

    return {
      id: result.id,
      message: 'Bénéficiaire créé avec succès'
    };
  } catch (error) {
    console.error('[createBeneficiaire] Erreur:', error);
    throw error;
  }
};

/**
 * Mettre à jour un bénéficiaire
 */
const updateBeneficiaire = async (id, data) => {
  const sequelize = getConnection();
  try {
    const query = `
      UPDATE beneficiaire
      SET code = :code, nom = :nom, departement_id = :departement_id
      WHERE id = :id
    `;

    await sequelize.query(query, {
      replacements: {
        id,
        code: data.code,
        nom: data.nom,
        departement_id: data.departement_id || null
      },
      type: sequelize.QueryTypes.UPDATE
    });

    return { success: true, message: 'Bénéficiaire mis à jour avec succès' };
  } catch (error) {
    console.error('[updateBeneficiaire] Erreur:', error);
    throw error;
  }
};

/**
 * Supprimer un bénéficiaire
 */
const deleteBeneficiaire = async (id) => {
  const sequelize = getConnection();
  try {
    await sequelize.query('DELETE FROM beneficiaire WHERE id = :id', {
      replacements: { id },
      type: sequelize.QueryTypes.DELETE
    });

    return { success: true, message: 'Bénéficiaire supprimé avec succès' };
  } catch (error) {
    console.error('[deleteBeneficiaire] Erreur:', error);
    throw error;
  }
};

/**
 * Récupérer les bénéficiaires par département
 */
const getBeneficiairesByDepartement = async (departementId) => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT id, code, nom, departement_id
      FROM beneficiaire
      WHERE departement_id = :departementId
      ORDER BY nom
    `;

    const results = await sequelize.query(query, {
      replacements: { departementId },
      type: sequelize.QueryTypes.SELECT
    });

    return results;
  } catch (error) {
    console.error('[getBeneficiairesByDepartement] Erreur:', error);
    throw error;
  }
};

module.exports = {
  getAllBeneficiaires,
  getBeneficiaireById,
  createBeneficiaire,
  updateBeneficiaire,
  deleteBeneficiaire,
  getBeneficiairesByDepartement
};














