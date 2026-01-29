const { getConnection } = require('../../config/database');

/**
 * Récupérer tous les départements avec pagination
 */
const getAllDepartements = async (options = {}) => {
  const sequelize = getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'nom',
      orderDirection = 'ASC',
      search = '',
      etat = null,
      typ = null
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['id', 'code', 'nom', 'manager', 'parent', 'compte', 'typ', 'etat'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'nom';
    const safeOrderDirection = orderDirection.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let whereConditions = [];
    const replacements = {};

    if (search && search.trim()) {
      whereConditions.push(`(
        code LIKE :search
        OR nom LIKE :search
        OR manager LIKE :search
        OR compte LIKE :search
        OR CAST(id AS NVARCHAR(50)) LIKE :search
      )`);
      replacements.search = `%${search.trim()}%`;
    }

    if (etat !== null && etat !== undefined) {
      whereConditions.push('etat = :etat');
      replacements.etat = etat;
    }

    if (typ !== null && typ !== undefined) {
      whereConditions.push('typ = :typ');
      replacements.typ = typ;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT
        d.id, d.code, d.nom, d.manager, d.parent, d.compte, d.typ, d.etat, d.cr_date, d.user_id,
        dp.nom AS parent_nom,
        COUNT(b.id) AS beneficiaires_count,
        COUNT(*) OVER() AS total_count
      FROM departement d
      LEFT JOIN departement dp ON dp.id = d.parent
      LEFT JOIN beneficiaire b ON b.departement_id = d.id
      ${whereClause}
      GROUP BY d.id, d.code, d.nom, d.manager, d.parent, d.compte, d.typ, d.etat, d.cr_date, d.user_id, dp.nom
      ORDER BY d.${safeOrderBy} ${safeOrderDirection}
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
    console.error('[getAllDepartements] Erreur:', error);
    throw error;
  }
};

/**
 * Récupérer un département par ID
 */
const getDepartementById = async (id) => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT
        d.id, d.code, d.nom, d.manager, d.parent, d.compte, d.typ, d.etat, d.cr_date, d.user_id,
        dp.nom AS parent_nom,
        COUNT(b.id) AS beneficiaires_count
      FROM departement d
      LEFT JOIN departement dp ON dp.id = d.parent
      LEFT JOIN beneficiaire b ON b.departement_id = d.id
      WHERE d.id = :id
      GROUP BY d.id, d.code, d.nom, d.manager, d.parent, d.compte, d.typ, d.etat, d.cr_date, d.user_id, dp.nom
    `;

    const results = await sequelize.query(query, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    });

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('[getDepartementById] Erreur:', error);
    throw error;
  }
};

/**
 * Créer un nouveau département
 */
const createDepartement = async (data) => {
  const sequelize = getConnection();
  try {
    const query = `
      INSERT INTO departement (code, nom, manager, parent, compte, typ, etat, cr_date, user_id)
      OUTPUT INSERTED.id
      VALUES (:code, :nom, :manager, :parent, :compte, :typ, :etat, GETDATE(), :user_id)
    `;

    const [result] = await sequelize.query(query, {
      replacements: {
        code: data.code,
        nom: data.nom,
        manager: data.manager || null,
        parent: data.parent || null,
        compte: data.compte || null,
        typ: data.typ || null,
        etat: data.etat !== undefined ? data.etat : 1,
        user_id: data.user_id || null
      },
      type: sequelize.QueryTypes.SELECT
    });

    return {
      id: result.id,
      message: 'Département créé avec succès'
    };
  } catch (error) {
    console.error('[createDepartement] Erreur:', error);
    throw error;
  }
};

/**
 * Mettre à jour un département
 */
const updateDepartement = async (id, data) => {
  const sequelize = getConnection();
  try {
    const query = `
      UPDATE departement
      SET code = :code, nom = :nom, manager = :manager, parent = :parent,
          compte = :compte, typ = :typ, etat = :etat
      WHERE id = :id
    `;

    await sequelize.query(query, {
      replacements: {
        id,
        code: data.code,
        nom: data.nom,
        manager: data.manager || null,
        parent: data.parent || null,
        compte: data.compte || null,
        typ: data.typ || null,
        etat: data.etat
      },
      type: sequelize.QueryTypes.UPDATE
    });

    return { success: true, message: 'Département mis à jour avec succès' };
  } catch (error) {
    console.error('[updateDepartement] Erreur:', error);
    throw error;
  }
};

/**
 * Supprimer un département
 */
const deleteDepartement = async (id) => {
  const sequelize = getConnection();
  try {
    await sequelize.query('DELETE FROM departement WHERE id = :id', {
      replacements: { id },
      type: sequelize.QueryTypes.DELETE
    });

    return { success: true, message: 'Département supprimé avec succès' };
  } catch (error) {
    console.error('[deleteDepartement] Erreur:', error);
    throw error;
  }
};

/**
 * Récupérer la hiérarchie des départements
 */
const getDepartementHierarchy = async () => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT
        id, code, nom, manager, parent, compte, typ, etat,
        (
          SELECT COUNT(*)
          FROM departement d2
          WHERE d2.parent = d1.id
        ) AS children_count
      FROM departement d1
      WHERE etat = 1
      ORDER BY parent, nom
    `;

    const results = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT
    });

    return results;
  } catch (error) {
    console.error('[getDepartementHierarchy] Erreur:', error);
    throw error;
  }
};

module.exports = {
  getAllDepartements,
  getDepartementById,
  createDepartement,
  updateDepartement,
  deleteDepartement,
  getDepartementHierarchy
};















