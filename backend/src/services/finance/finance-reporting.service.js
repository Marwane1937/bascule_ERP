const { getConnection } = require('../../config/database');

/**
 * Récupérer les comptes clients (débit, crédit, solde)
 */
const getCompteClient = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'client_nom',
      orderDirection = 'ASC',
      search = ''
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    let whereClause = '';
    const replacements = {};

    if (search && search.trim()) {
      whereClause = `WHERE p.nom LIKE :search`;
      replacements.search = `%${search.trim()}%`;
    }

    const query = `
      SELECT 
        part_id,
        client_nom,
        debit,
        credit,
        solde,
        total_count
      FROM (
        SELECT 
          p.part_id,
          p.nom AS client_nom,
          ISNULL(SUM(CASE WHEN r.sens = 1 THEN r.montant ELSE 0 END), 0) AS debit,
          ISNULL(SUM(CASE WHEN r.sens = -1 THEN r.montant ELSE 0 END), 0) AS credit,
          ISNULL(SUM(CASE WHEN r.sens = 1 THEN r.montant ELSE 0 END), 0) - 
          ISNULL(SUM(CASE WHEN r.sens = -1 THEN r.montant ELSE 0 END), 0) AS solde,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${orderBy} ${orderDirection}) AS RowNum
        FROM partenaire p
        LEFT JOIN reglement r ON r.part_id = p.part_id
        ${whereClause}
        GROUP BY p.part_id, p.nom
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY RowNum
    `;

    const results = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    const total = results.length > 0 ? results[0].total_count : 0;
    const totalPages = Math.ceil(total / safePageSize);

    return {
      success: true,
      data: results.map(r => ({
        client_id: r.part_id,
        client_nom: r.client_nom,
        debit: parseFloat(r.debit) || 0,
        credit: parseFloat(r.credit) || 0,
        solde: parseFloat(r.solde) || 0
      })),
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total: total,
        totalPages: totalPages
      }
    };
  } catch (err) {
    console.error('[getCompteClient] Erreur:', err);
    throw err;
  }
};

/**
 * Récupérer la balance client (détail des mouvements)
 */
const getBalanceClient = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'date',
      orderDirection = 'DESC',
      search = '',
      dateFrom = null,
      dateTo = null
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    let whereClause = '';
    const replacements = {};

    if (search && search.trim()) {
      whereClause = `AND p.nom LIKE :search`;
      replacements.search = `%${search.trim()}%`;
    }

    let dateFilter = '';
    if (dateFrom) {
      dateFilter += ' AND r.date >= :dateFrom';
      replacements.dateFrom = dateFrom;
    }
    if (dateTo) {
      dateFilter += ' AND r.date <= :dateTo';
      replacements.dateTo = dateTo;
    }

    const query = `
      SELECT 
        r.id,
        r.date,
        p.nom AS client_nom,
        r.numero,
        CASE WHEN r.sens = 1 THEN r.montant ELSE 0 END AS debit,
        CASE WHEN r.sens = -1 THEN r.montant ELSE 0 END AS credit,
        ISNULL(SUM(CASE WHEN r.sens = 1 THEN r.montant ELSE 0 END) OVER (PARTITION BY r.part_id ORDER BY r.date, r.id) - 
               SUM(CASE WHEN r.sens = -1 THEN r.montant ELSE 0 END) OVER (PARTITION BY r.part_id ORDER BY r.date, r.id), 0) AS solde,
        COUNT(*) OVER() AS total_count
      FROM reglement r
      INNER JOIN partenaire p ON p.part_id = r.part_id
      WHERE 1=1 ${whereClause} ${dateFilter}
      ORDER BY ${orderBy} ${orderDirection}
      OFFSET ${offset} ROWS
      FETCH NEXT ${safePageSize} ROWS ONLY
    `;

    const results = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    const total = results.length > 0 ? results[0].total_count : 0;
    const totalPages = Math.ceil(total / safePageSize);

    return {
      success: true,
      data: results.map(r => ({
        id: r.id,
        date: r.date,
        client_nom: r.client_nom,
        numero: r.numero,
        debit: parseFloat(r.debit) || 0,
        credit: parseFloat(r.credit) || 0,
        solde: parseFloat(r.solde) || 0
      })),
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total: total,
        totalPages: totalPages
      }
    };
  } catch (err) {
    console.error('[getBalanceClient] Erreur:', err);
    throw err;
  }
};

/**
 * Récupérer les soldes clients
 */
const getSoldeClient = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'solde',
      orderDirection = 'DESC',
      search = ''
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    let whereClause = '';
    const replacements = {};

    if (search && search.trim()) {
      whereClause = `WHERE p.nom LIKE :search`;
      replacements.search = `%${search.trim()}%`;
    }

    const query = `
      SELECT 
        part_id,
        client_nom,
        solde,
        total_count
      FROM (
        SELECT 
          p.part_id,
          p.nom AS client_nom,
          ISNULL(SUM(CASE WHEN r.sens = 1 THEN r.montant ELSE 0 END), 0) - 
          ISNULL(SUM(CASE WHEN r.sens = -1 THEN r.montant ELSE 0 END), 0) AS solde,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${orderBy} ${orderDirection}) AS RowNum
        FROM partenaire p
        LEFT JOIN reglement r ON r.part_id = p.part_id
        ${whereClause}
        GROUP BY p.part_id, p.nom
        HAVING ISNULL(SUM(CASE WHEN r.sens = 1 THEN r.montant ELSE 0 END), 0) - 
               ISNULL(SUM(CASE WHEN r.sens = -1 THEN r.montant ELSE 0 END), 0) != 0
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY RowNum
    `;

    const results = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    const total = results.length > 0 ? results[0].total_count : 0;
    const totalPages = Math.ceil(total / safePageSize);

    return {
      success: true,
      data: results.map(r => ({
        client_id: r.part_id,
        client_nom: r.client_nom,
        solde: parseFloat(r.solde) || 0
      })),
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total: total,
        totalPages: totalPages
      }
    };
  } catch (err) {
    console.error('[getSoldeClient] Erreur:', err);
    throw err;
  }
};

/**
 * Récupérer la vue globale
 */
const getVueGlobale = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const {
      dateFrom = null,
      dateTo = null
    } = options;

    let dateFilter = '';
    const replacements = {};

    if (dateFrom) {
      dateFilter += ' AND r.date >= :dateFrom';
      replacements.dateFrom = dateFrom;
    }
    if (dateTo) {
      dateFilter += ' AND r.date <= :dateTo';
      replacements.dateTo = dateTo;
    }

    const query = `
      SELECT 
        ISNULL(SUM(CASE WHEN r.sens = 1 THEN r.montant ELSE 0 END), 0) AS total_debit,
        ISNULL(SUM(CASE WHEN r.sens = -1 THEN r.montant ELSE 0 END), 0) AS total_credit,
        ISNULL(SUM(CASE WHEN r.sens = 1 THEN r.montant ELSE 0 END), 0) - 
        ISNULL(SUM(CASE WHEN r.sens = -1 THEN r.montant ELSE 0 END), 0) AS solde_global,
        COUNT(DISTINCT r.part_id) AS nombre_clients
      FROM reglement r
      WHERE 1=1 ${dateFilter}
    `;

    const results = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    const result = results.length > 0 ? results[0] : {
      total_debit: 0,
      total_credit: 0,
      solde_global: 0,
      nombre_clients: 0
    };

    return {
      success: true,
      data: {
        total_debit: parseFloat(result.total_debit) || 0,
        total_credit: parseFloat(result.total_credit) || 0,
        solde_global: parseFloat(result.solde_global) || 0,
        nombre_clients: parseInt(result.nombre_clients) || 0
      }
    };
  } catch (err) {
    console.error('[getVueGlobale] Erreur:', err);
    throw err;
  }
};

module.exports = {
  getCompteClient,
  getBalanceClient,
  getSoldeClient,
  getVueGlobale
};

