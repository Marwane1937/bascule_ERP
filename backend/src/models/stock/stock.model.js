const { getConnection } = require('../../config/database');

/**
 * Récupérer la liste des achats non encore entrés en stock
 */
const getAchatsNonEntresStock = async (options = {}) => {
  const sequelize = getConnection();
  try {
    const {
      page = 1,
      pageSize = 10,
      orderBy = 'date',
      orderDirection = 'DESC',
      search = '',
      dateFrom = null,
      dateTo = null,
      fournisseur = null
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['document_id', 'numero', 'date', 'fournisseur', 'total_ht'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Construction de la clause WHERE de base
    // Sélectionner les achats facturés qui n'ont pas encore de document de stock validé
    let whereConditions = ['ad.facture_id <> 0', 'ad.type = 2'];
    // Exclure les achats qui ont déjà un document de stock validé (etat = 1)
    whereConditions.push('NOT EXISTS (SELECT 1 FROM stock_document sd WHERE sd.part_id = ad.document_id AND sd.type = 21 AND sd.etat = 1)');
    const replacements = {};

    if (search && search.trim()) {
      whereConditions.push(`(
        ad.numero LIKE :search
        OR p.nom LIKE :search
        OR ad.description LIKE :search
      )`);
      replacements.search = `%${search.trim()}%`;
    }

    // Filtres avancés
    if (dateFrom) {
      whereConditions.push('ad.date >= :dateFrom');
      replacements.dateFrom = dateFrom;
    }

    if (dateTo) {
      whereConditions.push('ad.date <= :dateTo');
      replacements.dateTo = dateTo;
    }

    if (fournisseur && fournisseur.trim()) {
      whereConditions.push('p.nom LIKE :fournisseur');
      replacements.fournisseur = `%${fournisseur.trim()}%`;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Requête avec pagination
    const query = `
      SELECT
        document_id,
        numero,
        date,
        description,
        fournisseur,
        part_id,
        total_ht,
        total_count
      FROM (
        SELECT
          ad.document_id,
          ad.numero,
          ad.date,
          ad.description,
          p.nom AS fournisseur,
          ad.part_id,
          ISNULL(SUM(addd.quantite * addd.prix), 0) AS total_ht,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ad.${safeOrderBy} ${safeOrderDirection}) AS RowNum
        FROM achat_document ad
        INNER JOIN partenaire p ON p.part_id = ad.part_id
        LEFT JOIN achat_document_detail addd ON addd.document_id = ad.document_id
        ${whereClause}
        GROUP BY ad.document_id, ad.numero, ad.date, ad.description, p.nom, ad.part_id
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
      console.error('[getAchatsNonEntresStock] Erreur:', dataError.message);
      throw new Error(`Erreur lors de la récupération des achats non entrés: ${dataError.message || 'Erreur inconnue'}`);
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
    console.error('[getAchatsNonEntresStock] Erreur:', error.message);
    throw error;
  }
};

/**
 * Récupérer les détails d'un achat pour entrée en stock
 * Optimisé avec index et requête simplifiée
 */
const getAchatDetailsForStock = async (achatDocumentId) => {
  const sequelize = getConnection();
  try {
    // Vérifier d'abord que l'achat existe et n'est pas déjà traité
    const checkQuery = `
      SELECT document_id FROM achat_document
      WHERE document_id = :achatDocumentId AND facture_id <> 0
    `;

    const checkResult = await sequelize.query(checkQuery, {
      replacements: { achatDocumentId },
      type: sequelize.QueryTypes.SELECT
    });

    if (!checkResult || checkResult.length === 0) {
      return []; // Achat déjà traité ou inexistant
    }

    const query = `
      SELECT
        addd.id,
        addd.article_id,
        COALESCE(a.article_nom, addd.description, 'Article inconnu') as article_nom,
        COALESCE(a.article_cod, '') as article_cod,
        addd.quantite,
        addd.prix,
        addd.taux_tva,
        addd.description
      FROM achat_document_detail addd
      LEFT JOIN article a ON a.article_id = addd.article_id
      WHERE addd.document_id = :achatDocumentId
      ORDER BY addd.id
    `;

    const results = await sequelize.query(query, {
      replacements: { achatDocumentId },
      type: sequelize.QueryTypes.SELECT
    });

    console.log(`[getAchatDetailsForStock] ${results.length} détails chargés pour achat ${achatDocumentId}`);
    return Array.isArray(results) ? results : [];
  } catch (error) {
    console.error('[getAchatDetailsForStock] Erreur:', error);
    throw error;
  }
};

/**
 * Récupérer les articles avec leur stock actuel
 */
const getArticlesStock = async (options = {}) => {
  const sequelize = getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'article_nom',
      orderDirection = 'ASC',
      search = ''
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['article_id', 'article_cod', 'article_nom', 'stock_normal'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'article_nom';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = '';
    const replacements = {};

    if (search && search.trim()) {
      whereClause = `WHERE (
        a.article_cod LIKE :search
        OR a.article_nom LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    // Requête avec pagination et calcul du stock en temps réel
    const query = `
      SELECT
        article_id,
        article_cod,
        article_nom,
        0 AS stock_initial,
        ISNULL(stock_normal, 0) AS stock_normal,
        total_count
      FROM (
        SELECT
          a.article_id,
          a.article_cod,
          a.article_nom,
          0 AS stock_initial,
          (
            SELECT ISNULL(SUM(sdd.quantite * sdd.sens), 0)
            FROM stock_document_detail sdd
            INNER JOIN stock_document sd ON sd.id = sdd.stock_id
            WHERE sdd.article_id = a.article_id AND sd.etat = 1
          ) AS stock_normal,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY a.${safeOrderBy} ${safeOrderDirection}) AS RowNum
        FROM article a
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
      console.error('[getArticlesStock] Erreur:', dataError.message);
      throw new Error(`Erreur lors de la récupération des articles: ${dataError.message || 'Erreur inconnue'}`);
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
    console.error('[getArticlesStock] Erreur:', error.message);
    throw error;
  }
};

/**
 * Créer une entrée de stock depuis un achat
 */
const createEntreeStockFromAchat = async (achatDocumentId, details, utilisateurId, sequelizeConnection = null) => {
  console.log('[createEntreeStockFromAchat] Début avec params:', { achatDocumentId, detailsLength: details?.length, utilisateurId, sequelizeConnection });

  const sequelize = sequelizeConnection || getConnection();
  console.log('[createEntreeStockFromAchat] Sequelize obtenu');

  return await sequelize.transaction(async (t) => {
    console.log('[createEntreeStockFromAchat] Transaction démarrée');
    try {
      const stockDocumentModel = require('./stock-document.model');

      // Créer le document de stock (type 21 = Entrée)
      const achatInfo = await sequelize.query(
        'SELECT numero FROM achat_document WHERE document_id = :id',
        {
          replacements: { id: achatDocumentId },
          type: sequelize.QueryTypes.SELECT,
          transaction: t
        }
      );

      const numeroAchat = achatInfo[0]?.numero || `ACHAT-${achatDocumentId}`;

    console.log('[createEntreeStockFromAchat] Création du document de stock...');
    const stockDocResult = await stockDocumentModel.createStockDocument({
      type: 21, // Entrée de stock
      description: `Entrée de stock depuis achat ${numeroAchat}`,
      reference_source: numeroAchat,
      id_source: achatDocumentId,
      utilisateur_id: utilisateurId
    }, sequelize, t);
    console.log('[createEntreeStockFromAchat] Document créé:', stockDocResult);

    const stockDocumentId = stockDocResult.id;
    console.log('[createEntreeStockFromAchat] stockDocumentId extrait:', stockDocumentId, 'type:', typeof stockDocumentId);

      // Ajouter les détails
      const detailsWithSens = details.map(detail => ({
        ...detail,
        sens: 1 // Entrée = positif
      }));

      console.log('[createEntreeStockFromAchat] Ajout des détails du document...');
      await stockDocumentModel.addStockDocumentDetails(stockDocumentId, detailsWithSens, sequelize, t);
      console.log('[createEntreeStockFromAchat] Détails ajoutés');

    // Mettre à jour les stocks dans article_stock (stock par article et dépôt)
    console.log('[createEntreeStockFromAchat] Mise à jour des stocks...');
    for (const detail of details) {
      // Mettre à jour ou créer l'entrée dans article_stock
      const upsertArticleStockQuery = `
        IF EXISTS (SELECT 1 FROM article_stock WHERE article_id = :article_id AND depot_id = 1)
        BEGIN
          UPDATE article_stock
          SET stock_max = ISNULL(stock_max, 0) + :quantite
          WHERE article_id = :article_id AND depot_id = 1
        END
        ELSE
        BEGIN
          INSERT INTO article_stock (article_id, depot_id, stock_max, etat, cr_date, user_id)
          VALUES (:article_id, 1, :quantite, 1, GETDATE(), :user_id)
        END
      `;

      console.log('[createEntreeStockFromAchat] Mise à jour stock pour article:', detail.article_id, 'quantité:', detail.quantite);
      await sequelize.query(upsertArticleStockQuery, {
        replacements: {
          quantite: detail.quantite,
          article_id: detail.article_id,
          user_id: utilisateurId || 1
        },
        type: sequelize.QueryTypes.UPDATE,
        transaction: t
      });
    }
      console.log('[createEntreeStockFromAchat] Stocks mis à jour');

      // Marquer le document de stock comme traité (validé)
      console.log('[createEntreeStockFromAchat] Marquage du document de stock comme traité...');
      await stockDocumentModel.validateStockDocument(stockDocumentId, sequelize, t);
      console.log('[createEntreeStockFromAchat] Document de stock marqué comme traité');

      console.log('[createEntreeStockFromAchat] Transaction terminée avec succès');
      return {
        success: true,
        stockDocumentId: stockDocumentId,
        numero: stockDocResult.numero,
        message: 'Entrée de stock créée avec succès'
      };
    } catch (error) {
      console.error('[createEntreeStockFromAchat] Erreur dans la transaction:', error);
      console.error('[createEntreeStockFromAchat] Stack:', error.stack);
      throw error;
    }
  });
};

/**
 * Récupérer les ventes facturées non encore sorties du stock
 */
const getVentesNonSortiesStock = async (options = {}) => {
  const sequelize = getConnection();
  try {
    const {
      page = 1,
      pageSize = 10,
      orderBy = 'date',
      orderDirection = 'DESC',
      search = '',
      dateFrom = null,
      dateTo = null,
      client = null
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['document_id', 'numero', 'date', 'client', 'total_ht'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Construction de la clause WHERE de base
    // Sélectionner les livraisons facturées (stock.type = 2, facture_id non null)
    // qui n'ont pas encore de document de sortie de stock validé (etat = 1)
    let whereConditions = ['s.type = 2', 's.facture_id IS NOT NULL'];
    // Exclure les livraisons qui ont déjà un document de sortie de stock validé
    whereConditions.push('NOT EXISTS (SELECT 1 FROM stock_document sd WHERE sd.part_id = s.id AND sd.type = 22 AND sd.etat = 1)');
    const replacements = {};

    if (search && search.trim()) {
      whereConditions.push(`(
        s.numero LIKE :search
        OR p.nom LIKE :search
        OR s.description LIKE :search
      )`);
      replacements.search = `%${search.trim()}%`;
    }

    // Filtres avancés
    if (dateFrom) {
      whereConditions.push('s.date >= :dateFrom');
      replacements.dateFrom = dateFrom;
    }

    if (dateTo) {
      whereConditions.push('s.date <= :dateTo');
      replacements.dateTo = dateTo;
    }

    if (client && client.trim()) {
      whereConditions.push('p.nom LIKE :client');
      replacements.client = `%${client.trim()}%`;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Requête avec pagination
    const query = `
      SELECT
        document_id,
        numero,
        date,
        description,
        client,
        part_id,
        total_ht,
        total_count
      FROM (
        SELECT
          s.id AS document_id,
          s.numero,
          s.date,
          s.description,
          p.nom AS client,
          s.part_id,
          ISNULL(SUM(sd.quantite * sd.prix), 0) AS total_ht,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY s.${safeOrderBy} ${safeOrderDirection}) AS RowNum
        FROM stock s
        INNER JOIN partenaire p ON p.part_id = s.part_id
        LEFT JOIN stock_detail sd ON sd.stock_id = s.id
        ${whereClause}
        GROUP BY s.id, s.numero, s.date, s.description, p.nom, s.part_id
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
      console.error('[getVentesNonSortiesStock] Erreur:', dataError.message);
      throw new Error(`Erreur lors de la récupération des ventes non sorties: ${dataError.message || 'Erreur inconnue'}`);
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
    console.error('[getVentesNonSortiesStock] Erreur:', error.message);
    throw error;
  }
};

/**
 * Récupérer les détails d'une livraison pour sortie de stock
 */
const getVenteDetailsForStock = async (venteDocumentId) => {
  const sequelize = getConnection();
  try {
    // Vérifier d'abord que la livraison existe et est facturée
    const checkQuery = `
      SELECT id FROM stock
      WHERE id = :venteDocumentId AND type = 2 AND facture_id IS NOT NULL
    `;

    const checkResult = await sequelize.query(checkQuery, {
      replacements: { venteDocumentId },
      type: sequelize.QueryTypes.SELECT
    });

    if (!checkResult || checkResult.length === 0) {
      return []; // Livraison non trouvée ou non facturée
    }

    const query = `
      SELECT
        sd.id,
        sd.article_id,
        COALESCE(a.article_nom, sd.description, 'Article inconnu') as article_nom,
        COALESCE(a.article_cod, '') as article_cod,
        sd.quantite,
        sd.prix,
        sd.taux_tva,
        sd.description
      FROM stock_detail sd
      LEFT JOIN article a ON a.article_id = sd.article_id
      WHERE sd.stock_id = :venteDocumentId
      ORDER BY sd.id
    `;

    const results = await sequelize.query(query, {
      replacements: { venteDocumentId },
      type: sequelize.QueryTypes.SELECT
    });

    console.log(`[getVenteDetailsForStock] ${results.length} détails chargés pour vente ${venteDocumentId}`);
    return Array.isArray(results) ? results : [];
  } catch (error) {
    console.error('[getVenteDetailsForStock] Erreur:', error);
    throw error;
  }
};

/**
 * Créer une sortie de stock depuis une vente
 */
const createSortieStockFromVente = async (venteDocumentId, details, utilisateurId, sequelizeConnection = null) => {
  console.log('[createSortieStockFromVente] Début avec params:', { venteDocumentId, detailsLength: details?.length, utilisateurId, sequelizeConnection });

  const sequelize = sequelizeConnection || getConnection();
  console.log('[createSortieStockFromVente] Sequelize obtenu');

  return await sequelize.transaction(async (t) => {
    console.log('[createSortieStockFromVente] Transaction démarrée');
    try {
      const stockDocumentModel = require('./stock-document.model');

      // Créer le document de stock (type 22 = Sortie)
      const venteInfo = await sequelize.query(
        'SELECT numero FROM stock WHERE id = :id',
        {
          replacements: { id: venteDocumentId },
          type: sequelize.QueryTypes.SELECT,
          transaction: t
        }
      );

      const numeroVente = venteInfo[0]?.numero || `VENTE-${venteDocumentId}`;

    console.log('[createSortieStockFromVente] Création du document de stock...');
    const stockDocResult = await stockDocumentModel.createStockDocument({
      type: 22, // Sortie de stock
      description: `Sortie de stock depuis vente ${numeroVente}`,
      reference_source: numeroVente,
      id_source: venteDocumentId,
      utilisateur_id: utilisateurId
    }, sequelize, t);
    console.log('[createSortieStockFromVente] Document créé:', stockDocResult);

    const stockDocumentId = stockDocResult.id;
    console.log('[createSortieStockFromVente] stockDocumentId extrait:', stockDocumentId, 'type:', typeof stockDocumentId);

      // Ajouter les détails
      const detailsWithSens = details.map(detail => ({
        ...detail,
        sens: -1 // Sortie = négatif
      }));

      console.log('[createSortieStockFromVente] Ajout des détails du document...');
      await stockDocumentModel.addStockDocumentDetails(stockDocumentId, detailsWithSens, sequelize, t);
      console.log('[createSortieStockFromVente] Détails ajoutés');

    // Mettre à jour les stocks dans article_stock (stock par article et dépôt)
    console.log('[createSortieStockFromVente] Mise à jour des stocks...');
    for (const detail of details) {
      const updateStockQuery = `
        UPDATE article_stock
        SET stock_max = ISNULL(stock_max, 0) - :quantite
        WHERE article_id = :article_id AND depot_id = 1
      `;

      console.log('[createSortieStockFromVente] Mise à jour stock pour article:', detail.article_id, 'quantité:', detail.quantite);
      await sequelize.query(updateStockQuery, {
        replacements: {
          quantite: detail.quantite,
          article_id: detail.article_id
        },
        type: sequelize.QueryTypes.UPDATE,
        transaction: t
      });
    }
      console.log('[createSortieStockFromVente] Stocks mis à jour');

      // Marquer le document de stock comme traité (validé)
      console.log('[createSortieStockFromVente] Marquage du document de stock comme traité...');
      await stockDocumentModel.validateStockDocument(stockDocumentId, sequelize, t);
      console.log('[createSortieStockFromVente] Document de stock marqué comme traité');

      console.log('[createSortieStockFromVente] Transaction terminée avec succès');
      return {
        success: true,
        stockDocumentId: stockDocumentId,
        numero: stockDocResult.numero,
        message: 'Sortie de stock créée avec succès'
      };
    } catch (error) {
      console.error('[createSortieStockFromVente] Erreur dans la transaction:', error);
      console.error('[createSortieStockFromVente] Stack:', error.stack);
      throw error;
    }
  });
};

/**
 * Créer une sortie de stock
 */
const createSortieStock = async (details, description, utilisateurId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || require('../../config/database');

  return await sequelize.transaction(async (t) => {
    try {
      const stockDocumentModel = require('./stock-document.model');

      // Vérifier les stocks disponibles dans article_stock
      for (const detail of details) {
        const stockCheckQuery = `
          SELECT ISNULL(stock_max, 0) AS stock_disponible
          FROM article_stock
          WHERE article_id = :article_id AND depot_id = 1
        `;

        const [stockInfo] = await sequelize.query(stockCheckQuery, {
          replacements: { article_id: detail.article_id },
          type: sequelize.QueryTypes.SELECT,
          transaction: t
        });

        const availableStock = stockInfo?.stock_disponible || 0;

        if (availableStock < detail.quantite) {
          // Récupérer le nom de l'article pour le message d'erreur
          const [articleInfo] = await sequelize.query(
            'SELECT article_nom FROM article WHERE article_id = :article_id',
            {
              replacements: { article_id: detail.article_id },
              type: sequelize.QueryTypes.SELECT,
              transaction: t
            }
          );

          const articleName = articleInfo?.article_nom || `Article ${detail.article_id}`;
          throw new Error(`Stock insuffisant pour ${articleName}. Disponible: ${availableStock}, Demandé: ${detail.quantite}`);
        }
      }

      // Créer le document de stock (type 22 = Sortie)
      const stockDocResult = await stockDocumentModel.createStockDocument({
        type: 22, // Sortie de stock
        description: description || 'Sortie de stock manuelle',
        reference_source: null,
        id_source: null,
        utilisateur_id: utilisateurId
      }, sequelize, t);

      const stockDocumentId = stockDocResult.id;

      // Ajouter les détails
      const detailsWithSens = details.map(detail => ({
        ...detail,
        sens: -1 // Sortie = négatif
      }));

      await stockDocumentModel.addStockDocumentDetails(stockDocumentId, detailsWithSens, sequelize, t);

      // Mettre à jour les stocks dans article_stock
      for (const detail of details) {
        const updateStockQuery = `
          UPDATE article_stock
          SET stock_max = ISNULL(stock_max, 0) - :quantite
          WHERE article_id = :article_id AND depot_id = 1
        `;

        await sequelize.query(updateStockQuery, {
          replacements: {
            quantite: detail.quantite,
            article_id: detail.article_id
          },
          type: sequelize.QueryTypes.UPDATE,
          transaction: t
        });
      }

      // Valider le document
      await stockDocumentModel.validateStockDocument(stockDocumentId, sequelize, t);

      return {
        success: true,
        stockDocumentId: stockDocumentId,
        numero: stockDocResult.numero,
        message: 'Sortie de stock créée avec succès'
      };
    } catch (error) {
      console.error('[createSortieStock] Erreur:', error);
      throw error;
    }
  });
};

/**
 * Créer un inventaire
 */
const createInventaire = async (inventaireData, description, utilisateurId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || require('../../config/database');

  return await sequelize.transaction(async (t) => {
    try {
      const stockDocumentModel = require('./stock-document.model');

      // Créer le document de stock (type 20 = Inventaire)
      const stockDocResult = await stockDocumentModel.createStockDocument({
        type: 20, // Inventaire
        description: description || 'Inventaire de stock',
        reference_source: null,
        id_source: null,
        utilisateur_id: utilisateurId
      }, sequelize, t);

      const stockDocumentId = stockDocResult.id;

      // Ajouter les détails d'inventaire
      const detailsInventaire = inventaireData.map(item => ({
        article_id: item.article_id,
        quantite: item.stock_reel,
        prix: null,
        taux_tva: null,
        sens: 0 // Inventaire = neutre
      }));

      await stockDocumentModel.addStockDocumentDetails(stockDocumentId, detailsInventaire, sequelize, t);

      // Mettre à jour les stocks dans article_stock pour chaque article
      for (const item of inventaireData) {
        const updateStockQuery = `
          IF EXISTS (SELECT 1 FROM article_stock WHERE article_id = :article_id AND depot_id = 1)
          BEGIN
            UPDATE article_stock
            SET stock_max = :stock_reel
            WHERE article_id = :article_id AND depot_id = 1
          END
          ELSE
          BEGIN
            INSERT INTO article_stock (article_id, depot_id, stock_max, etat, cr_date, user_id)
            VALUES (:article_id, 1, :stock_reel, 1, GETDATE(), :user_id)
          END
        `;

        await sequelize.query(updateStockQuery, {
          replacements: {
            stock_reel: item.stock_reel,
            article_id: item.article_id,
            user_id: utilisateurId || 1
          },
          type: sequelize.QueryTypes.UPDATE,
          transaction: t
        });
      }

      // Valider le document
      await stockDocumentModel.validateStockDocument(stockDocumentId, sequelize, t);

      return {
        success: true,
        stockDocumentId: stockDocumentId,
        numero: stockDocResult.numero,
        message: 'Inventaire créé avec succès'
      };
    } catch (error) {
      console.error('[createInventaire] Erreur:', error);
      throw error;
    }
  });
};

/**
 * Récupérer l'état détaillé du stock avec informations complètes
 */
const getEtatStock = async (options = {}) => {
  const sequelize = getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'article_nom',
      orderDirection = 'ASC',
      search = '',
      depotId = 1,
      stockMinimum = null
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['article_id', 'article_cod', 'article_nom', 'stock_actuel', 'valeur_stock'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'article_nom';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = '';
    const replacements = {};

    if (search && search.trim()) {
      whereClause = `WHERE (
        a.article_cod LIKE :search
        OR a.article_nom LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    // Requête pour l'état détaillé du stock
    const query = `
      SELECT
        article_id,
        article_cod,
        article_nom,
        categorie_nom,
        unite_nom,
        stock_actuel,
        prix_moyen,
        valeur_stock,
        stock_minimum,
        stock_maximum,
        total_count
      FROM (
        SELECT
          a.article_id,
          a.article_cod,
          a.article_nom,
          cat.nom AS categorie_nom,
          u.nom AS unite_nom,
          ISNULL(stock_calc.stock_actuel, 0) AS stock_actuel,
          ISNULL(stock_calc.prix_moyen, 0) AS prix_moyen,
          ISNULL(stock_calc.valeur_stock, 0) AS valeur_stock,
          ISNULL(ast.stock_min, 0) AS stock_minimum,
          ISNULL(ast.stock_max, 0) AS stock_maximum,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY a.${safeOrderBy} ${safeOrderDirection}) AS RowNum
        FROM article a
        LEFT JOIN famille cat ON cat.id = a.famille
        LEFT JOIN unite u ON u.id = a.unite_id
        LEFT JOIN article_stock ast ON ast.article_id = a.article_id AND ast.depot_id = :depotId
        LEFT JOIN (
          SELECT
            sdd.article_id,
            SUM(sdd.quantite * sdd.sens) AS stock_actuel,
            CASE
              WHEN SUM(sdd.quantite * sdd.sens) > 0 THEN
                SUM(sdd.quantite * sdd.prix * sdd.sens) / SUM(sdd.quantite * sdd.sens)
              ELSE 0
            END AS prix_moyen,
            SUM(sdd.quantite * sdd.prix * sdd.sens) AS valeur_stock
          FROM stock_document_detail sdd
          INNER JOIN stock_document sd ON sd.id = sdd.stock_id
          WHERE sd.etat = 1
          GROUP BY sdd.article_id
        ) stock_calc ON stock_calc.article_id = a.article_id
        ${whereClause}
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY RowNum
    `;

    replacements.depotId = depotId;

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
      console.error('[getEtatStock] Erreur:', dataError.message);
      throw new Error(`Erreur lors de la récupération de l'état du stock: ${dataError.message || 'Erreur inconnue'}`);
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
    console.error('[getEtatStock] Erreur:', error.message);
    throw error;
  }
};

/**
 * Récupérer la fiche de stock (historique des mouvements) pour un article
 */
const getFicheStock = async (articleId, options = {}) => {
  const sequelize = getConnection();
  try {
    const {
      page = 1,
      pageSize = 50,
      dateFrom = null,
      dateTo = null
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 50;
    const offset = (safePage - 1) * safePageSize;

    let whereClause = 'sdd.article_id = :articleId';
    const replacements = { articleId };

    if (dateFrom) {
      whereClause += ' AND sd.date >= :dateFrom';
      replacements.dateFrom = dateFrom;
    }

    if (dateTo) {
      whereClause += ' AND sd.date <= :dateTo';
      replacements.dateTo = dateTo;
    }

    // Requête pour la fiche de stock
    const query = `
      SELECT
        mouvement_id,
        date_mouvement,
        type_mouvement,
        numero_document,
        description,
        quantite_entree,
        quantite_sortie,
        stock_apres_mouvement,
        prix_unitaire,
        valeur_mouvement,
        partenaire_nom,
        utilisateur_nom,
        total_count
      FROM (
        SELECT
          sd.id AS mouvement_id,
          sd.date AS date_mouvement,
          CASE sd.type
            WHEN 20 THEN 'Inventaire'
            WHEN 21 THEN 'Entrée'
            WHEN 22 THEN 'Sortie'
            ELSE 'Autre'
          END AS type_mouvement,
          sd.numero AS numero_document,
          sd.description,
          CASE WHEN sdd.sens = 1 THEN sdd.quantite ELSE 0 END AS quantite_entree,
          CASE WHEN sdd.sens = -1 THEN ABS(sdd.quantite) ELSE 0 END AS quantite_sortie,
          SUM(sdd.quantite * sdd.sens) OVER (
            PARTITION BY sdd.article_id
            ORDER BY sd.date, sd.id
            ROWS UNBOUNDED PRECEDING
          ) AS stock_apres_mouvement,
          sdd.prix AS prix_unitaire,
          (sdd.quantite * sdd.prix * sdd.sens) AS valeur_mouvement,
          COALESCE(p.nom, sd.part_ref) AS partenaire_nom,
          u.nom AS utilisateur_nom,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY sd.date DESC, sd.id DESC) AS RowNum
        FROM stock_document_detail sdd
        INNER JOIN stock_document sd ON sd.id = sdd.stock_id
        LEFT JOIN partenaire p ON p.part_id = sd.part_id
        LEFT JOIN utilisateur u ON u.id = sd.user_id
        WHERE ${whereClause} AND sd.etat = 1
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
      console.error('[getFicheStock] Erreur:', dataError.message);
      throw new Error(`Erreur lors de la récupération de la fiche de stock: ${dataError.message || 'Erreur inconnue'}`);
    }

    const totalPages = Math.ceil(total / safePageSize) || 1;

    // Récupérer les informations de l'article
    const articleQuery = `
      SELECT
        a.article_id,
        a.article_cod,
        a.article_nom,
        cat.nom AS categorie_nom,
        u.nom AS unite_nom,
        ISNULL(current_stock.stock_actuel, 0) AS stock_actuel
      FROM article a
      LEFT JOIN famille cat ON cat.id = a.famille
      LEFT JOIN unite u ON u.id = a.unite_id
      LEFT JOIN (
        SELECT
          sdd.article_id,
          SUM(sdd.quantite * sdd.sens) AS stock_actuel
        FROM stock_document_detail sdd
        INNER JOIN stock_document sd ON sd.id = sdd.stock_id
        WHERE sd.etat = 1
        GROUP BY sdd.article_id
      ) current_stock ON current_stock.article_id = a.article_id
      WHERE a.article_id = :articleId
    `;

    const articleInfo = await sequelize.query(articleQuery, {
      replacements: { articleId },
      type: sequelize.QueryTypes.SELECT
    });

    return {
      article: articleInfo[0] || null,
      mouvements: results,
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total: total,
        totalPages: totalPages
      }
    };
  } catch (error) {
    console.error('[getFicheStock] Erreur:', error.message);
    throw error;
  }
};

/**
 * Récupérer le chiffre d'affaires par article
 */
const getChiffreAffairesArticles = async (options = {}) => {
  const sequelize = getConnection();
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

    const validColumns = ['article_id', 'article_cod', 'article_nom', 'quantite_vendue', 'chiffre_affaires', 'marge_moyenne'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'chiffre_affaires';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = '';
    const replacements = {};

    if (search && search.trim()) {
      whereClause = `WHERE (
        a.article_cod LIKE :search
        OR a.article_nom LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    // Filtres de date
    let dateFilter = '';
    if (dateFrom) {
      dateFilter += ' AND s.date >= :dateFrom';
      replacements.dateFrom = dateFrom;
    }
    if (dateTo) {
      dateFilter += ' AND s.date <= :dateTo';
      replacements.dateTo = dateTo;
    }

    // Requête pour le chiffre d'affaires par article
    const query = `
      SELECT
        article_id,
        article_cod,
        article_nom,
        categorie_nom,
        quantite_vendue,
        chiffre_affaires,
        prix_moyen_vente,
        marge_moyenne,
        total_count
      FROM (
        SELECT
          a.article_id,
          a.article_cod,
          a.article_nom,
          cat.nom AS categorie_nom,
          ISNULL(ca_stats.quantite_vendue, 0) AS quantite_vendue,
          ISNULL(ca_stats.chiffre_affaires, 0) AS chiffre_affaires,
          ISNULL(ca_stats.prix_moyen_vente, 0) AS prix_moyen_vente,
          ISNULL(ca_stats.marge_moyenne, 0) AS marge_moyenne,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ISNULL(ca_stats.${safeOrderBy}, 0) ${safeOrderDirection}) AS RowNum
        FROM article a
        LEFT JOIN famille cat ON cat.id = a.famille
        LEFT JOIN (
          SELECT
            sd.article_id,
            SUM(ABS(sd.quantite)) AS quantite_vendue,
            SUM(sd.quantite * sd.prix) AS chiffre_affaires,
            CASE
              WHEN SUM(ABS(sd.quantite)) > 0 THEN
                SUM(sd.quantite * sd.prix) / SUM(ABS(sd.quantite))
              ELSE 0
            END AS prix_moyen_vente,
            CASE
              WHEN SUM(sd.quantite * sd.prix) > 0 THEN
                AVG(sd.taux_tva)
              ELSE 0
            END AS marge_moyenne
          FROM stock_detail sd
          INNER JOIN stock s ON s.id = sd.stock_id
          WHERE s.type = 2 AND s.facture_id IS NOT NULL ${dateFilter}
          GROUP BY sd.article_id
        ) ca_stats ON ca_stats.article_id = a.article_id
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
      console.error('[getChiffreAffairesArticles] Erreur:', dataError.message);
      throw new Error(`Erreur lors de la récupération du chiffre d'affaires: ${dataError.message || 'Erreur inconnue'}`);
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
    console.error('[getChiffreAffairesArticles] Erreur:', error.message);
    throw error;
  }
};

module.exports = {
  getAchatsNonEntresStock,
  getAchatDetailsForStock,
  getVentesNonSortiesStock,
  getVenteDetailsForStock,
  getArticlesStock,
  getEtatStock,
  getFicheStock,
  getChiffreAffairesArticles,
  createEntreeStockFromAchat,
  createSortieStockFromVente,
  createSortieStock,
  createInventaire
};
