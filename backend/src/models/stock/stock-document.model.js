const { getConnection } = require('../../config/database');

const getStockDocumentDetailColumns = async (sequelize) => {
  const rows = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'stock_document_detail'`,
    { type: sequelize.QueryTypes.SELECT }
  );
  return new Set((Array.isArray(rows) ? rows : []).map((r) => String(r.COLUMN_NAME || '').toLowerCase()));
};

/**
 * Récupérer tous les documents de stock avec pagination
 */
const getAllStockDocuments = async (options = {}) => {
  const sequelize = getConnection();
  try {
    const {
      page = 1,
      pageSize = 10,
      orderBy = 'date',
      orderDirection = 'DESC',
      search = '',
      type = null // 20: Inventaire, 21: Entrée, 22: Sortie
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['id', 'numero', 'date', 'type', 'description'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = '';
    const replacements = {};

    if (search && search.trim()) {
      whereClause = `WHERE (
        sd.numero LIKE :search
        OR sd.description LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    if (type && [10, 20, 21, 22].includes(parseInt(type))) {
      whereClause += whereClause ? ' AND ' : 'WHERE ';
      whereClause += 'sd.type = :type';
      replacements.type = parseInt(type);
    }

    // Requête avec pagination
    const query = `
      SELECT
        id,
        numero,
        date,
        type,
        description,
        cr_date,
        etat,
        total_count
      FROM (
        SELECT
          sd.id,
          sd.numero,
          sd.date,
          sd.type,
          sd.description,
          sd.cr_date,
          sd.etat,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY sd.${safeOrderBy} ${safeOrderDirection}) AS RowNum
        FROM stock_document sd
        ${whereClause}
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY RowNum
    `;

    let results = [];
    let total = 0;

    try {
      const dataQueryResult = await sequelize.query(query, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });

      if (Array.isArray(dataQueryResult)) {
        results = dataQueryResult;
      } else {
        results = dataQueryResult ? [dataQueryResult] : [];
      }

      // Extraire le total depuis la première ligne
      if (results.length > 0) {
        total = parseInt(results[0].total_count) || 0;
        results = results.map(({ total_count, ...rest }) => rest);
      }
    } catch (dataError) {
      console.error('[getAllStockDocuments] Erreur:', dataError.message);
      throw new Error(`Erreur lors de la récupération des documents de stock: ${dataError.message || 'Erreur inconnue'}`);
    }

    const totalPages = Math.ceil(total / safePageSize) || 1;

    return {
      data: results,
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total: total,
        totalPages: totalPages
      }
    };
  } catch (error) {
    console.error('[getAllStockDocuments] Erreur:', error.message);
    throw error;
  }
};

/**
 * Récupérer un document de stock par ID
 */
const getStockDocumentById = async (id) => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT
        sd.id,
        sd.numero,
        sd.date,
        sd.type,
        sd.description,
        sd.cr_date,
        sd.etat,
        u.nom AS utilisateur_nom
      FROM stock_document sd
      LEFT JOIN utilisateur u ON u.id = sd.utilisateur_id
      WHERE sd.id = :id
    `;

    const results = await sequelize.query(query, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    });

    if (Array.isArray(results) && results.length > 0) {
      return results[0];
    }

    return null;
  } catch (error) {
    console.error('[getStockDocumentById] Erreur:', error);
    throw error;
  }
};

/**
 * Récupérer les détails d'un document de stock
 */
const getStockDocumentDetails = async (stockDocumentId) => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT
        sdd.id,
        sdd.article_id,
        a.article_nom,
        a.article_cod,
        sdd.quantite,
        sdd.prix,
        sdd.taux_tva,
        sdd.sens,
        sdd.cr_date
      FROM stock_document_detail sdd
      INNER JOIN article a ON a.article_id = sdd.article_id
      WHERE sdd.stock_id = :stockDocumentId
      ORDER BY sdd.id
    `;

    const results = await sequelize.query(query, {
      replacements: { stockDocumentId },
      type: sequelize.QueryTypes.SELECT
    });

    return Array.isArray(results) ? results : [];
  } catch (error) {
    console.error('[getStockDocumentDetails] Erreur:', error);
    throw error;
  }
};

/**
 * Créer un nouveau document de stock
 */
const createStockDocument = async (data, sequelizeConnection = null, transaction = null) => {
  const sequelize = sequelizeConnection || getConnection();

  // Si une transaction est déjà fournie, l'utiliser directement sans créer de nouvelle transaction
  if (transaction) {
    return await createStockDocumentInternal(data, sequelize, transaction);
  }

  // Sinon, créer une nouvelle transaction
  return await sequelize.transaction(async (t) => {
    return await createStockDocumentInternal(data, sequelize, t);
  });
};

  const createStockDocumentInternal = async (data, sequelize, transaction) => {
    try {
    const { type, description, reference_source, id_source, utilisateur_id } = data;

    // Générer le numéro de document
    const numero = await generateStockDocumentNumero(type, sequelize);

    // Insérer d'abord le document
    const insertQuery = `
      INSERT INTO stock_document (numero, date, type, description, part_ref, part_id, user_id, etat, cr_date, imprime)
      VALUES (:numero, GETDATE(), :type, :description, :reference_source, 0, :user_id, 0, GETDATE(), 0)
    `;

    await sequelize.query(insertQuery, {
      replacements: {
        numero,
        type,
        description: description || '',
        reference_source: reference_source || '',
        id_source: id_source || null,
        user_id: utilisateur_id || 1
      },
      type: sequelize.QueryTypes.INSERT,
      transaction: transaction
    });

    // Récupérer l'ID du document inséré
    const selectQuery = `
      SELECT TOP 1 id FROM stock_document
      WHERE numero = :numero
      ORDER BY id DESC
    `;

    const selectResult = await sequelize.query(selectQuery, {
      replacements: { numero },
      type: sequelize.QueryTypes.SELECT,
      transaction: transaction
    });

    const stockDocumentId = selectResult[0]?.id;
    console.log('[createStockDocument] Document inséré avec ID:', stockDocumentId);

    if (!stockDocumentId) {
      throw new Error('Erreur lors de la création du document de stock : ID non récupéré');
    }

    return {
      id: stockDocumentId,
      numero: numero,
      message: 'Document de stock créé avec succès'
    };
  } catch (error) {
    console.error('[createStockDocument] Erreur:', error);
    throw error;
  }
};

/**
 * Ajouter des détails à un document de stock
 */
const addStockDocumentDetails = async (stockDocumentId, details, sequelizeConnection = null, transaction = null) => {

  const sequelize = sequelizeConnection || getConnection();

  try {
    const detailColumns = await getStockDocumentDetailColumns(sequelize);
    const insertCols = ['stock_id', 'article_id', 'quantite', 'prix', 'taux_tva', 'sens', 'unite_id', 'cr_date', 'user_id'];
    const insertVals = [':stockDocumentId', ':article_id', ':quantite', ':prix', ':taux_tva', ':sens', ':unite_id', 'GETDATE()', ':user_id'];

    if (detailColumns.has('depot_id')) {
      insertCols.push('depot_id');
      insertVals.push(':depot_id');
    } else if (detailColumns.has('adresse_id')) {
      insertCols.push('adresse_id');
      insertVals.push(':depot_id');
    }
    if (detailColumns.has('description')) {
      insertCols.push('description');
      insertVals.push(':description');
    }
    if (detailColumns.has('lot')) {
      insertCols.push('lot');
      insertVals.push(':lot');
    }
    if (detailColumns.has('etat')) {
      insertCols.push('etat');
      insertVals.push(':etat');
    }
    if (detailColumns.has('type')) {
      insertCols.push('type');
      insertVals.push(':type');
    }

    const insertQuery = `
      INSERT INTO stock_document_detail (${insertCols.join(', ')})
      VALUES (${insertVals.join(', ')})
    `;

    for (const detail of details) {
      await sequelize.query(insertQuery, {
        replacements: {
          stockDocumentId,
          article_id: detail.article_id,
          quantite: detail.quantite,
          prix: detail.prix ?? 0,
          taux_tva: detail.taux_tva ?? 0,
          sens: detail.sens ?? 1,
          unite_id: detail.unite_id || 1,
          depot_id: detail.depot_id || null,
          description: detail.description || null,
          lot: detail.lot || null,
          etat: Number(detail.etat || 0),
          type: Number(detail.type || 0),
          user_id: detail.user_id || 1
        },
        type: sequelize.QueryTypes.INSERT,
        transaction: transaction
      });
    }

    return { success: true, message: `${details.length} détail(s) ajouté(s) avec succès` };
  } catch (error) {
    console.error('[addStockDocumentDetails] Erreur:', error);
    throw error;
  }
};

/**
 * Valider un document de stock (mettre etat = 1)
 */
const validateStockDocument = async (id, sequelizeConnection = null, transaction = null) => {
  const sequelize = sequelizeConnection || getConnection();

  // Si une transaction est déjà fournie, l'utiliser directement sans créer de nouvelle transaction
  if (transaction) {
    return await validateStockDocumentInternal(id, sequelize, transaction);
  }

  // Sinon, créer une nouvelle transaction
  return await sequelize.transaction(async (t) => {
    return await validateStockDocumentInternal(id, sequelize, t);
  });
};

const validateStockDocumentInternal = async (id, sequelize, transaction) => {
  try {
    const updateQuery = `
      UPDATE stock_document
      SET etat = 1
      WHERE id = :id
    `;

    await sequelize.query(updateQuery, {
      replacements: { id },
      type: sequelize.QueryTypes.UPDATE,
      transaction: transaction
    });

    return { success: true, message: 'Document de stock validé avec succès' };
  } catch (error) {
    console.error('[validateStockDocument] Erreur:', error);
    throw error;
  }
};

/**
 * Générer un numéro de document de stock
 */
const generateStockDocumentNumero = async (type, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  const typeMap = {
    10: 'INV', // Inventaire (nouveau type)
    20: 'INV', // Inventaire (ancien type)
    21: 'ENT', // Entrée
    22: 'SOR'  // Sortie
  };

  const prefix = typeMap[type] || 'STK';
  const year = new Date().getFullYear().toString().slice(-2);

  // Récupérer le prochain numéro
  const counterQuery = `
    SELECT ISNULL(MAX(CAST(SUBSTRING(numero, LEN('${prefix}${year}-') + 1, LEN(numero)) AS INT)), 0) + 1 AS nextNumber
    FROM stock_document
    WHERE numero LIKE '${prefix}${year}-%'
  `;

  const [result] = await sequelize.query(counterQuery, {
    type: sequelize.QueryTypes.SELECT
  });

  const nextNumber = result?.nextNumber || 1;
  return `${prefix}${year}-${nextNumber.toString().padStart(4, '0')}`;
};

module.exports = {
  getAllStockDocuments,
  getStockDocumentById,
  getStockDocumentDetails,
  createStockDocument,
  addStockDocumentDetails,
  validateStockDocument,
  generateStockDocumentNumero
};
