const { getConnection } = require('../../config/database');
const stockModel = require('../../models/stock/stock.model');
const facturationModel = require('../../models/ventes/facturation.model');

/**
 * Récupérer le grand livre (toutes les factures et livraisons)
 */
const getGrandLivre = async (options = {}, sequelizeConnection = null) => {
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
      whereClause = `WHERE (
        s.numero LIKE :search
        OR p.nom LIKE :search
        OR s.description LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    let dateFilter = '';
    if (dateFrom) {
      dateFilter += ' AND s.date >= :dateFrom';
      replacements.dateFrom = dateFrom;
    }
    if (dateTo) {
      dateFilter += ' AND s.date <= :dateTo';
      replacements.dateTo = dateTo;
    }

    const query = `
      SELECT 
        s.id,
        s.numero,
        s.date,
        s.description,
        p.nom AS client,
        ISNULL(t.total_ht, 0) AS total_ht,
        ISNULL(t.total_tva, 0) AS total_tva,
        ISNULL(t.total_ttc, 0) AS total_ttc,
        COUNT(*) OVER() AS total_count
      FROM stock s
      LEFT JOIN (
        SELECT stock_id,
          SUM(quantite * prix) AS total_ht,
          SUM((quantite * prix) * taux_tva) AS total_tva,
          SUM((quantite * prix) + (quantite * prix) * taux_tva) AS total_ttc
        FROM stock_detail
        GROUP BY stock_id
      ) t ON t.stock_id = s.id
      LEFT JOIN partenaire p ON p.part_id = s.part_id
      WHERE s.type = 2 ${whereClause} ${dateFilter}
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
        numero: r.numero,
        date: r.date,
        description: r.description,
        client: r.client,
        total_ht: parseFloat(r.total_ht) || 0,
        total_tva: parseFloat(r.total_tva) || 0,
        total_ttc: parseFloat(r.total_ttc) || 0
      })),
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total: total,
        totalPages: totalPages
      }
    };
  } catch (err) {
    console.error('[getGrandLivre] Erreur:', err);
    throw err;
  }
};

/**
 * Récupérer les factures par client
 */
const getFacturesByClient = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const result = await facturationModel.getAllFactures(options, sequelize);
    return result;
  } catch (err) {
    console.error('[getFacturesByClient] Erreur:', err);
    throw err;
  }
};

/**
 * Récupérer le chiffre d'affaires par article
 */
const getChiffreAffairesArticles = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const result = await stockModel.getChiffreAffairesArticles(options, sequelize);
    return result;
  } catch (err) {
    console.error('[getChiffreAffairesArticles] Erreur:', err);
    throw err;
  }
};

/**
 * Récupérer le chiffre d'affaires par client
 */
const getChiffreAffairesClients = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'chiffre_affaires',
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
      whereClause = `WHERE p.nom LIKE :search`;
      replacements.search = `%${search.trim()}%`;
    }

    let dateFilter = '';
    if (dateFrom) {
      dateFilter += ' AND s.date >= :dateFrom';
      replacements.dateFrom = dateFrom;
    }
    if (dateTo) {
      dateFilter += ' AND s.date <= :dateTo';
      replacements.dateTo = dateTo;
    }

    const query = `
      SELECT 
        part_id,
        client_nom,
        nombre_factures,
        chiffre_affaires,
        montant_moyen,
        total_count
      FROM (
        SELECT 
          p.part_id,
          p.nom AS client_nom,
          COUNT(DISTINCT s.id) AS nombre_factures,
          ISNULL(SUM(t.total_ttc), 0) AS chiffre_affaires,
          CASE 
            WHEN COUNT(DISTINCT s.id) > 0 THEN ISNULL(SUM(t.total_ttc), 0) / COUNT(DISTINCT s.id)
            ELSE 0
          END AS montant_moyen,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${orderBy} ${orderDirection}) AS RowNum
        FROM stock s
        INNER JOIN partenaire p ON p.part_id = s.part_id
        LEFT JOIN (
          SELECT stock_id,
            SUM((quantite * prix) + (quantite * prix) * taux_tva) AS total_ttc
          FROM stock_detail
          GROUP BY stock_id
        ) t ON t.stock_id = s.id
        WHERE s.type = 2 AND s.facture_id IS NOT NULL ${whereClause} ${dateFilter}
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
        nombre_factures: parseInt(r.nombre_factures) || 0,
        chiffre_affaires: parseFloat(r.chiffre_affaires) || 0,
        montant_moyen: parseFloat(r.montant_moyen) || 0
      })),
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total: total,
        totalPages: totalPages
      }
    };
  } catch (err) {
    console.error('[getChiffreAffairesClients] Erreur:', err);
    throw err;
  }
};

module.exports = {
  getGrandLivre,
  getFacturesByClient,
  getChiffreAffairesArticles,
  getChiffreAffairesClients
};

