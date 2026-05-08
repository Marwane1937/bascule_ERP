const { getConnection } = require('../../config/database');
const stockDocumentModel = require('./stock-document.model');
const livraisonModel = require('../ventes/livraison.model');
const {
  buildFlatComponentLines,
  toFiniteNumber,
  enrichRowsWithNomenclature,
  removeNomenclatureComponentRows
} = require('../../utils/nomenclature.helper');

const formatToSqlDateTimeMs = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(trimmed)) {
      if (!trimmed.includes('.')) return `${trimmed}.000`;
      const [base, ms] = trimmed.split('.');
      return `${base}.${String(ms).slice(0, 3).padEnd(3, '0')}`;
    }
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const p2 = (n) => String(n).padStart(2, '0');
  const p3 = (n) => String(n).padStart(3, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${p3(d.getMilliseconds())}`;
};

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
      orderBy = 'date',
      orderDirection = 'DESC',
      search = '',
      article = '',
      articleId = null,
      articleCode = '',
      dateFrom = null,
      dateTo = null,
      depotId = null
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const whereConditions = [
      'ISNULL(sd.etat, 1) <> 0',
      'ISNULL(sdd.quantite, 0) <> 0'
    ];
    const snapshotWhereConditions = [...whereConditions];
    const replacements = {};

    if (search && search.trim()) {
      whereConditions.push('(a.article_cod LIKE :search OR a.article_nom LIKE :search)');
      snapshotWhereConditions.push('(a.article_cod LIKE :search OR a.article_nom LIKE :search)');
      replacements.search = `%${search.trim()}%`;
    }

    const articleIdNum = parseInt(articleId, 10);
    if (!Number.isNaN(articleIdNum) && articleIdNum > 0) {
      whereConditions.push('sdd.article_id = :articleId');
      snapshotWhereConditions.push('sdd.article_id = :articleId');
      replacements.articleId = articleIdNum;
    } else if (articleCode && articleCode.trim()) {
      whereConditions.push('LTRIM(RTRIM(ISNULL(a.article_cod, \'\'))) = :articleCode');
      snapshotWhereConditions.push('LTRIM(RTRIM(ISNULL(a.article_cod, \'\'))) = :articleCode');
      replacements.articleCode = articleCode.trim();
    } else if (article && article.trim()) {
      whereConditions.push('(a.article_cod LIKE :article OR a.article_nom LIKE :article)');
      snapshotWhereConditions.push('(a.article_cod LIKE :article OR a.article_nom LIKE :article)');
      replacements.article = `%${article.trim()}%`;
    }

    if (dateFrom) {
      whereConditions.push('CONVERT(DATE, sd.date) >= CONVERT(DATE, :dateFrom)');
      replacements.dateFrom = dateFrom;
    }

    if (dateTo) {
      whereConditions.push('CONVERT(DATE, sd.date) <= CONVERT(DATE, :dateTo)');
      snapshotWhereConditions.push('CONVERT(DATE, sd.date) <= CONVERT(DATE, :dateTo)');
      replacements.dateTo = dateTo;
    }

    const whereClause = whereConditions.join(' AND ');
    const snapshotWhereClause = snapshotWhereConditions.join(' AND ');
    const articleStockWhereConditions = ['ISNULL(ast.etat, 1) <> 0'];
    const articleStockReplacements = { ...replacements };

    if (replacements.search) {
      articleStockWhereConditions.push('(a.article_cod LIKE :search OR a.article_nom LIKE :search)');
    }
    if (replacements.articleId) {
      articleStockWhereConditions.push('ast.article_id = :articleId');
    } else if (replacements.articleCode) {
      articleStockWhereConditions.push('LTRIM(RTRIM(ISNULL(a.article_cod, \'\'))) = :articleCode');
    } else if (replacements.article) {
      articleStockWhereConditions.push('(a.article_cod LIKE :article OR a.article_nom LIKE :article)');
    }

    const depotIdNum = parseInt(depotId, 10);
    if (!Number.isNaN(depotIdNum) && depotIdNum > 0) {
      articleStockWhereConditions.push('ISNULL(ast.depot_id, 1) = :articleStockDepotId');
      articleStockReplacements.articleStockDepotId = depotIdNum;
    }

    const articleStockWhereClause = articleStockWhereConditions.join(' AND ');

    const buildSourceCte = (clause) => `
      WITH source AS (
        SELECT
          sd.date,
          sdd.article_id,
          LTRIM(RTRIM(ISNULL(a.article_cod, ''))) AS article_cod,
          COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(a.article_nom, ''))), ''), 'Article inconnu') AS article_nom,
          CAST(
            CASE
              WHEN ISNULL(sdd.sens, 0) < 0 THEN -ABS(ISNULL(sdd.quantite, 0))
              WHEN ISNULL(sdd.sens, 0) = 0 THEN ISNULL(sdd.quantite, 0)
              ELSE ABS(ISNULL(sdd.quantite, 0))
            END
            AS decimal(18, 2)
          ) AS quantite,
          CAST(COALESCE(sdd.prix, a.prix_achat, 0) AS decimal(18, 2)) AS prix_achat,
          CAST(COALESCE(a.prix_vente, sdd.prix, 0) AS decimal(18, 2)) AS prix_vente,
          CASE
            WHEN ISNULL(sdd.sens, 0) > 0 THEN N'Entrée'
            WHEN ISNULL(sdd.sens, 0) < 0 THEN N'Sortie'
            ELSE N'Inventaire'
          END AS mouvement
        FROM stock_document_detail sdd
        INNER JOIN stock_document sd ON sd.id = sdd.stock_id
        LEFT JOIN article a ON a.article_id = sdd.article_id
        WHERE ${clause}
      )
    `;

    // Requête pour compter le total
    const countQuery = `
      ${buildSourceCte(whereClause)}
      SELECT COUNT(*) as total_count
      FROM source
    `;

    // Validation des colonnes pour le tri
    const validColumns = ['date', 'article_cod', 'article_nom', 'quantite', 'prix_achat', 'prix_vente', 'mouvement'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Pour le tri sur quantite calculée, on doit l'ajouter dans l'ORDER BY
    let orderByClause = '';
    if (safeOrderBy === 'quantite') {
      orderByClause = `ORDER BY quantite ${safeOrderDirection}`;
    } else {
      orderByClause = `ORDER BY ${safeOrderBy} ${safeOrderDirection}`;
    }

    // Requête principale pour l'état de stock depuis les documents de stock
    const query = `
      ${buildSourceCte(whereClause)}
      SELECT 
        date,
        article_cod,
        article_nom,
        quantite,
        prix_achat,
        prix_vente,
        mouvement,
        total_count
      FROM (
        SELECT 
          date,
          article_cod,
          article_nom,
          quantite,
          prix_achat,
          prix_vente,
          mouvement,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (${orderByClause}) AS RowNum
        FROM source
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ${orderByClause}
    `;

    const summaryQuery = `
      ${buildSourceCte(whereClause)}
      SELECT
        COUNT(DISTINCT article_id) AS article_count,
        CAST(ISNULL(SUM(CASE WHEN quantite > 0 THEN quantite ELSE 0 END), 0) AS decimal(18, 2)) AS total_entree,
        CAST(ISNULL(SUM(CASE WHEN quantite < 0 THEN ABS(quantite) ELSE 0 END), 0) AS decimal(18, 2)) AS total_sortie,
        CAST(ISNULL(SUM(quantite), 0) AS decimal(18, 2)) AS solde_quantite,
        CAST(ISNULL(SUM(CASE WHEN quantite > 0 THEN quantite * prix_achat ELSE 0 END), 0) AS decimal(18, 2)) AS valeur_entree,
        CAST(ISNULL(SUM(CASE WHEN quantite < 0 THEN ABS(quantite) * prix_achat ELSE 0 END), 0) AS decimal(18, 2)) AS valeur_sortie
      FROM source
    `;

    const snapshotSummaryQuery = `
      ${buildSourceCte(snapshotWhereClause)}
      SELECT
        COUNT(*) AS article_count,
        CAST(ISNULL(SUM(stock_quantite), 0) AS decimal(18, 2)) AS stock_quantite,
        CAST(ISNULL(SUM(stock_quantite * prix_achat), 0) AS decimal(18, 2)) AS valeur_stock,
        SUM(CASE WHEN stock_quantite < 0 THEN 1 ELSE 0 END) AS negative_count,
        SUM(CASE WHEN stock_quantite = 0 THEN 1 ELSE 0 END) AS zero_count,
        SUM(CASE WHEN stock_quantite > 0 THEN 1 ELSE 0 END) AS positive_count
      FROM (
        SELECT
          article_id,
          article_cod,
          article_nom,
          CAST(SUM(quantite) AS decimal(18, 2)) AS stock_quantite,
          MAX(prix_achat) AS prix_achat
        FROM source
        GROUP BY article_id, article_cod, article_nom
      ) stock_state
    `;

    const snapshotRowsQuery = `
      ${buildSourceCte(snapshotWhereClause)}
      SELECT TOP (${safePageSize})
        ${dateTo ? 'CONVERT(date, :dateTo)' : 'MAX(date)'} AS date,
        article_cod,
        article_nom,
        CAST(SUM(quantite) AS decimal(18, 2)) AS quantite,
        MAX(prix_achat) AS prix_achat,
        MAX(prix_vente) AS prix_vente,
        N'Stock à date' AS mouvement
      FROM source
      GROUP BY article_id, article_cod, article_nom
      HAVING SUM(quantite) <> 0
      ORDER BY article_nom ASC
    `;

    const articleStockFallbackRowsQuery = `
      SELECT TOP (${safePageSize})
        ${dateTo ? 'CONVERT(date, :dateTo)' : 'CONVERT(date, GETDATE())'} AS date,
        LTRIM(RTRIM(ISNULL(a.article_cod, ''))) AS article_cod,
        COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(a.article_nom, ''))), ''), 'Article inconnu') AS article_nom,
        CAST(SUM(ISNULL(ast.stock_max, 0)) AS decimal(18, 2)) AS quantite,
        CAST(MAX(ISNULL(a.prix_achat, 0)) AS decimal(18, 2)) AS prix_achat,
        CAST(MAX(ISNULL(a.prix_vente, 0)) AS decimal(18, 2)) AS prix_vente,
        N'Stock actuel' AS mouvement
      FROM article_stock ast
      INNER JOIN article a ON a.article_id = ast.article_id
      WHERE ${articleStockWhereClause}
      GROUP BY ast.article_id, a.article_cod, a.article_nom
      HAVING SUM(ISNULL(ast.stock_max, 0)) <> 0
      ORDER BY article_nom ASC
    `;

    const currentStockSummaryQuery = `
      SELECT
        COUNT(*) AS article_count,
        CAST(ISNULL(SUM(stock_quantite), 0) AS decimal(18, 2)) AS stock_quantite,
        CAST(ISNULL(SUM(stock_quantite * prix_achat), 0) AS decimal(18, 2)) AS valeur_stock,
        CAST(ISNULL(SUM(stock_quantite * (prix_vente - prix_achat)), 0) AS decimal(18, 2)) AS marge_potentielle,
        SUM(CASE WHEN stock_quantite > 0 THEN 1 ELSE 0 END) AS stock_positive_count,
        SUM(CASE WHEN stock_quantite < 0 THEN 1 ELSE 0 END) AS stock_negative_count,
        SUM(CASE WHEN stock_quantite = 0 THEN 1 ELSE 0 END) AS stock_zero_count
      FROM (
        SELECT
          ast.article_id,
          CAST(SUM(ISNULL(ast.stock_max, 0)) AS decimal(18, 2)) AS stock_quantite,
          MAX(ISNULL(a.prix_achat, 0)) AS prix_achat,
          MAX(ISNULL(a.prix_vente, 0)) AS prix_vente
        FROM article_stock ast
        INNER JOIN article a ON a.article_id = ast.article_id
        WHERE ${articleStockWhereClause}
        GROUP BY ast.article_id
      ) current_state
    `;

    const topEntreesQuery = `
      ${buildSourceCte(whereClause)}
      SELECT TOP (5)
        article_cod,
        article_nom,
        CAST(SUM(quantite) AS decimal(18, 2)) AS quantite
      FROM source
      WHERE quantite > 0
      GROUP BY article_id, article_cod, article_nom
      ORDER BY SUM(quantite) DESC
    `;

    const topSortiesQuery = `
      ${buildSourceCte(whereClause)}
      SELECT TOP (5)
        article_cod,
        article_nom,
        CAST(SUM(ABS(quantite)) AS decimal(18, 2)) AS quantite
      FROM source
      WHERE quantite < 0
      GROUP BY article_id, article_cod, article_nom
      ORDER BY SUM(ABS(quantite)) DESC
    `;

    const stockNegatifQuery = `
      SELECT TOP (5)
        LTRIM(RTRIM(ISNULL(a.article_cod, ''))) AS article_cod,
        COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(a.article_nom, ''))), ''), 'Article inconnu') AS article_nom,
        CAST(SUM(ISNULL(ast.stock_max, 0)) AS decimal(18, 2)) AS stock_quantite,
        CAST(MAX(ISNULL(a.prix_achat, 0)) AS decimal(18, 2)) AS prix_achat
      FROM article_stock ast
      INNER JOIN article a ON a.article_id = ast.article_id
      WHERE ${articleStockWhereClause}
      GROUP BY ast.article_id, a.article_cod, a.article_nom
      HAVING SUM(ISNULL(ast.stock_max, 0)) < 0
      ORDER BY SUM(ISNULL(ast.stock_max, 0)) ASC
    `;

    const sansMouvementRowsQuery = `
      ${buildSourceCte(whereClause)}
      SELECT TOP (5)
        LTRIM(RTRIM(ISNULL(a.article_cod, ''))) AS article_cod,
        COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(a.article_nom, ''))), ''), 'Article inconnu') AS article_nom,
        CAST(SUM(ISNULL(ast.stock_max, 0)) AS decimal(18, 2)) AS stock_quantite,
        CAST(SUM(ISNULL(ast.stock_max, 0) * ISNULL(a.prix_achat, 0)) AS decimal(18, 2)) AS valeur_stock
      FROM article_stock ast
      INNER JOIN article a ON a.article_id = ast.article_id
      WHERE ${articleStockWhereClause}
        AND NOT EXISTS (SELECT 1 FROM source src WHERE src.article_id = ast.article_id)
      GROUP BY ast.article_id, a.article_cod, a.article_nom
      HAVING SUM(ISNULL(ast.stock_max, 0)) <> 0
      ORDER BY SUM(ISNULL(ast.stock_max, 0) * ISNULL(a.prix_achat, 0)) DESC
    `;

    const sansMouvementCountQuery = `
      ${buildSourceCte(whereClause)}
      SELECT COUNT(*) AS total_count
      FROM (
        SELECT ast.article_id
        FROM article_stock ast
        INNER JOIN article a ON a.article_id = ast.article_id
        WHERE ${articleStockWhereClause}
          AND NOT EXISTS (SELECT 1 FROM source src WHERE src.article_id = ast.article_id)
        GROUP BY ast.article_id
        HAVING SUM(ISNULL(ast.stock_max, 0)) <> 0
      ) dormant
    `;

    let results = [];
    let total = 0;
    let summary = {
      article_count: 0,
      total_entree: 0,
      total_sortie: 0,
      solde_quantite: 0,
      valeur_entree: 0,
      valeur_sortie: 0
    };
    let snapshot = {
      article_count: 0,
      stock_quantite: 0,
      valeur_stock: 0,
      negative_count: 0,
      zero_count: 0,
      positive_count: 0
    };
    let analysis = {
      current: {
        article_count: 0,
        stock_quantite: 0,
        valeur_stock: 0,
        stock_positive_count: 0,
        stock_negative_count: 0,
        stock_zero_count: 0,
        marge_potentielle: 0
      },
      rotation: {
        taux_rotation: 0,
        cout_moyen_stock: 0,
        mouvements_count: 0
      },
      topEntrees: [],
      topSorties: [],
      stockNegatif: [],
      sansMouvement: [],
      sansMouvementCount: 0
    };
    let fallbackApplied = false;

    try {
      // Compter le total
      const countResult = await sequelize.query(countQuery, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });
      total = parseInt(countResult[0]?.total_count) || 0;

      // Récupérer les données
      const dataQueryResult = await sequelize.query(query, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });

      if (Array.isArray(dataQueryResult)) {
        results = dataQueryResult.map(({ total_count, ...rest }) => rest);
      } else {
        results = dataQueryResult ? [{ total_count: undefined, ...dataQueryResult }] : [];
        if (results.length > 0 && results[0].total_count !== undefined) {
          delete results[0].total_count;
        }
      }

      const [summaryRow] = await sequelize.query(summaryQuery, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });
      if (summaryRow) {
        summary = {
          article_count: Number(summaryRow.article_count || 0),
          total_entree: Number(summaryRow.total_entree || 0),
          total_sortie: Number(summaryRow.total_sortie || 0),
          solde_quantite: Number(summaryRow.solde_quantite || 0),
          valeur_entree: Number(summaryRow.valeur_entree || 0),
          valeur_sortie: Number(summaryRow.valeur_sortie || 0)
        };
      }

      const [snapshotRow] = await sequelize.query(snapshotSummaryQuery, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });
      if (snapshotRow) {
        snapshot = {
          article_count: Number(snapshotRow.article_count || 0),
          stock_quantite: Number(snapshotRow.stock_quantite || 0),
          valeur_stock: Number(snapshotRow.valeur_stock || 0),
          negative_count: Number(snapshotRow.negative_count || 0),
          zero_count: Number(snapshotRow.zero_count || 0),
          positive_count: Number(snapshotRow.positive_count || 0)
        };
      }

      const [currentStockRow] = await sequelize.query(currentStockSummaryQuery, {
        replacements: Object.keys(articleStockReplacements).length > 0 ? articleStockReplacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });

      if (currentStockRow) {
        analysis.current = {
          article_count: Number(currentStockRow.article_count || 0),
          stock_quantite: Number(currentStockRow.stock_quantite || 0),
          valeur_stock: Number(currentStockRow.valeur_stock || 0),
          stock_positive_count: Number(currentStockRow.stock_positive_count || 0),
          stock_negative_count: Number(currentStockRow.stock_negative_count || 0),
          stock_zero_count: Number(currentStockRow.stock_zero_count || 0),
          marge_potentielle: Number(currentStockRow.marge_potentielle || 0)
        };
      }

      const [topEntrees, topSorties, stockNegatif, sansMouvement, sansMouvementCountRows] = await Promise.all([
        sequelize.query(topEntreesQuery, {
          replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
          type: sequelize.QueryTypes.SELECT
        }),
        sequelize.query(topSortiesQuery, {
          replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
          type: sequelize.QueryTypes.SELECT
        }),
        sequelize.query(stockNegatifQuery, {
          replacements: Object.keys(articleStockReplacements).length > 0 ? articleStockReplacements : undefined,
          type: sequelize.QueryTypes.SELECT
        }),
        sequelize.query(sansMouvementRowsQuery, {
          replacements: Object.keys(articleStockReplacements).length > 0 ? articleStockReplacements : undefined,
          type: sequelize.QueryTypes.SELECT
        }),
        sequelize.query(sansMouvementCountQuery, {
          replacements: Object.keys(articleStockReplacements).length > 0 ? articleStockReplacements : undefined,
          type: sequelize.QueryTypes.SELECT
        })
      ]);

      const currentStockQuantityAbs = Math.abs(Number(analysis.current.stock_quantite || 0));
      analysis = {
        ...analysis,
        rotation: {
          taux_rotation: currentStockQuantityAbs > 0
            ? Number(summary.total_sortie || 0) / currentStockQuantityAbs
            : 0,
          cout_moyen_stock: currentStockQuantityAbs > 0
            ? Number(analysis.current.valeur_stock || 0) / currentStockQuantityAbs
            : 0,
          mouvements_count: total
        },
        topEntrees: Array.isArray(topEntrees) ? topEntrees : [],
        topSorties: Array.isArray(topSorties) ? topSorties : [],
        stockNegatif: Array.isArray(stockNegatif) ? stockNegatif : [],
        sansMouvement: Array.isArray(sansMouvement) ? sansMouvement : [],
        sansMouvementCount: Number(sansMouvementCountRows?.[0]?.total_count || 0)
      };

      if (results.length === 0 && (replacements.articleId || replacements.articleCode || replacements.article)) {
        const snapshotRows = await sequelize.query(snapshotRowsQuery, {
          replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
          type: sequelize.QueryTypes.SELECT
        });
        if (Array.isArray(snapshotRows) && snapshotRows.length > 0) {
          results = snapshotRows;
          total = snapshotRows.length;
          fallbackApplied = true;
        } else {
          const articleStockRows = await sequelize.query(articleStockFallbackRowsQuery, {
            replacements: Object.keys(articleStockReplacements).length > 0 ? articleStockReplacements : undefined,
            type: sequelize.QueryTypes.SELECT
          });
          if (Array.isArray(articleStockRows) && articleStockRows.length > 0) {
            results = articleStockRows;
            total = articleStockRows.length;
            fallbackApplied = true;
            const stockQuantite = articleStockRows.reduce((sum, row) => sum + Number(row.quantite || 0), 0);
            const valeurStock = articleStockRows.reduce((sum, row) => {
              return sum + Number(row.quantite || 0) * Number(row.prix_achat || 0);
            }, 0);
            snapshot = {
              article_count: articleStockRows.length,
              stock_quantite: stockQuantite,
              valeur_stock: valeurStock,
              negative_count: articleStockRows.filter((row) => Number(row.quantite || 0) < 0).length,
              zero_count: articleStockRows.filter((row) => Number(row.quantite || 0) === 0).length,
              positive_count: articleStockRows.filter((row) => Number(row.quantite || 0) > 0).length
            };
          }
        }
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
      },
      summary,
      snapshot,
      analysis,
      fallbackApplied
    };
  } catch (error) {
    console.error('[getEtatStock] Erreur:', error.message);
    throw error;
  }
};

/**
 * Récupérer la fiche de stock (historique des mouvements) depuis v_fiche_stock
 */
const getFicheStock = async (articleId, options = {}) => {
  const sequelize = getConnection();
  try {
    const {
      page = 1,
      pageSize = 50,
      dateFrom = null,
      dateTo = null,
      article_nom = null,
      article = null,
      article_id = null
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 50;
    const offset = (safePage - 1) * safePageSize;

    let whereConditions = [];
    const replacements = {};

    // Filtre par date (between)
    if (dateFrom && dateTo) {
      whereConditions.push('CONVERT(DATE, date) BETWEEN CONVERT(DATE, :dateFrom) AND CONVERT(DATE, :dateTo)');
      replacements.dateFrom = dateFrom;
      replacements.dateTo = dateTo;
    } else if (dateFrom) {
      whereConditions.push('CONVERT(DATE, date) >= CONVERT(DATE, :dateFrom)');
      replacements.dateFrom = dateFrom;
    } else if (dateTo) {
      whereConditions.push('CONVERT(DATE, date) <= CONVERT(DATE, :dateTo)');
      replacements.dateTo = dateTo;
    }

    // Filtre par article_id (priorité ABSOLUE - si article_id est fourni, ignorer les autres filtres article)
    if (article_id) {
      // Convertir en nombre pour s'assurer que c'est un entier
      const articleIdNum = parseInt(article_id, 10);
      console.log('[getFicheStock] article_id reçu (string):', article_id, 'converti en:', articleIdNum);
      if (!isNaN(articleIdNum) && articleIdNum > 0) {
        // La vue v_fiche_stock doit avoir une colonne article_id
        // Si la vue n'a pas cette colonne, il faudra la modifier
        whereConditions.push('article_id = :article_id');
        replacements.article_id = articleIdNum;
        console.log('[getFicheStock] Filtre article_id ajouté:', articleIdNum);
        // Ne PAS ajouter les autres filtres article si article_id est fourni
      } else {
        console.log('[getFicheStock] article_id invalide:', article_id);
      }
    } else {
      // Appliquer les filtres texte SEULEMENT si article_id n'est pas fourni
      // Filtre par article_nom
      if (article_nom && article_nom.trim()) {
        whereConditions.push('article_nom LIKE :article_nom');
        replacements.article_nom = `%${article_nom.trim()}%`;
      }

      // Filtre par article (code ou nom)
      if (article && article.trim()) {
        whereConditions.push('(article_cod LIKE :article OR article_nom LIKE :article)');
        replacements.article = `%${article.trim()}%`;
      }
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Requête pour compter le total
    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM v_fiche_stock
      ${whereClause}
    `;

    // Requête principale pour la fiche de stock depuis v_fiche_stock
    const query = `
      SELECT 
        depot,
        date,
        type,
        numero,
        tiers,
        entree,
        sortie,
        solde,
        total_count
      FROM (
        SELECT 
          depot,
          date,
          type,
          numero,
          tiers,
          entree,
          sortie,
          solde,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY date asc) AS RowNum
        FROM v_fiche_stock
        ${whereClause}
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY date asc
    `;

    let results = [];
    let total = 0;

    try {
      // Debug: afficher la requête et les paramètres
     // if (article_id) {
       // console.log('[getFicheStock] Filtre article_id reçu:', article_id);
       // console.log('[getFicheStock] WHERE clause:', whereClause);
       //  console.log('[getFicheStock] Replacements:', replacements);
    //  }

      // Compter le total
      const countResult = await sequelize.query(countQuery, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });
      total = parseInt(countResult[0]?.total_count) || 0;

      console.log('[getFicheStock] Total trouvé avec filtre article_id:', total);

      // Récupérer les données
      const dataQueryResult = await sequelize.query(query, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });

      console.log('[getFicheStock] Résultats trouvés:', dataQueryResult?.length || 0, 'lignes');

      if (Array.isArray(dataQueryResult)) {
        results = dataQueryResult.map(({ total_count, ...rest }) => rest);
      } else {
        results = dataQueryResult ? [{ total_count: undefined, ...dataQueryResult }] : [];
        if (results.length > 0 && results[0].total_count !== undefined) {
          delete results[0].total_count;
        }
      }
    } catch (dataError) {
      console.error('[getFicheStock] Erreur SQL:', dataError.message);
      console.error('[getFicheStock] Stack:', dataError.stack);
      throw new Error(`Erreur lors de la récupération de la fiche de stock: ${dataError.message || 'Erreur inconnue'}`);
    }

    const totalPages = Math.ceil(total / safePageSize) || 1;

    return {
      article: null, // Plus besoin d'articleInfo si on utilise v_fiche_stock
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
      orderBy = 'ca',
      orderDirection = 'DESC',
      search = ''
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    // Mapping des colonnes pour le tri (nom frontend -> nom SQL)
    const columnMapping = {
      'ca': 'chiffre_affaire',
      'article_cod': 'article_cod',
      'article_nom': 'article_nom',
      'quantite_vendue': 'quantite_vendue'
    };
    
    const validColumns = ['article_cod', 'article_nom', 'quantite_vendue', 'ca'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'ca';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // Utiliser le nom SQL réel pour l'ORDER BY - validation stricte
    let sqlOrderBy = columnMapping[safeOrderBy];
    if (!sqlOrderBy) {
      sqlOrderBy = 'chiffre_affaire'; // Valeur par défaut
    }
    
    // Validation supplémentaire : s'assurer que la colonne existe dans la vue
    const validSqlColumns = ['chiffre_affaire', 'article_cod', 'article_nom', 'quantite_vendue'];
    if (!validSqlColumns.includes(sqlOrderBy)) {
      sqlOrderBy = 'chiffre_affaire';
    }

    let whereClause = '';
    const replacements = {};

    // Recherche uniquement par article (code ou nom)
    if (search && search.trim()) {
      whereClause = 'WHERE (article_cod LIKE :search OR article_nom LIKE :search)';
      replacements.search = `%${search.trim()}%`;
    }

    // Requête pour compter le total
    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM v_ca_article
      ${whereClause}
    `;

    // Requête principale pour le chiffre d'affaires depuis v_ca_article
    const query = `
      SELECT 
        article_cod,
        article_nom,
        quantite_vendue,
        chiffre_affaire as ca,
        total_count
      FROM (
        SELECT 
          article_cod,
          article_nom,
          quantite_vendue,
          chiffre_affaire,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${sqlOrderBy} ${safeOrderDirection}) AS RowNum
        FROM v_ca_article
        ${whereClause}
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY ${sqlOrderBy} ${safeOrderDirection}
    `;

    let results = [];
    let total = 0;

    try {
      // Compter le total
      const countResult = await sequelize.query(countQuery, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });
      total = parseInt(countResult[0]?.total_count) || 0;

      // Récupérer les données
      const dataQueryResult = await sequelize.query(query, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });

      if (Array.isArray(dataQueryResult)) {
        results = dataQueryResult.map(({ total_count, ...rest }) => rest);
      } else {
        results = dataQueryResult ? [{ total_count: undefined, ...dataQueryResult }] : [];
        if (results.length > 0 && results[0].total_count !== undefined) {
          delete results[0].total_count;
        }
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

/**
 * Récupérer le résumé des mouvements par entrepôt
 */
const getEntrepotResume = async () => {
  const sequelize = getConnection();
  const query = `
    SELECT
      w.id AS depot_id,
      w.code,
      w.nom AS depot,
      w.status,
      SUM(CASE WHEN sd.sens = 1 THEN sd.quantite * sd.sens ELSE 0 END) AS qte_entree,
      SUM(CASE WHEN sd.sens = -1 THEN sd.quantite * sd.sens ELSE 0 END) AS qte_sortie
    FROM v_warehouse w
    INNER JOIN stock_detail sd ON w.id = sd.depot_id
    INNER JOIN stock s ON s.id = sd.stock_id
    GROUP BY w.id, w.code, w.nom, w.status
    ORDER BY w.nom
  `;

  const rows = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
  return Array.isArray(rows) ? rows : [];
};

/**
 * Récupérer le détail des mouvements d'un entrepôt par article
 */
const getEntrepotDetails = async (depotId) => {
  const sequelize = getConnection();
  const safeDepotId = parseInt(depotId, 10);
  if (!Number.isInteger(safeDepotId) || safeDepotId <= 0) {
    throw new Error('depotId invalide');
  }

  const query = `
    SELECT
      w.nom AS depot,
      a.Code_Article,
      a.Designation,
      a.Famille,
      a.unite,
      SUM(CASE WHEN sd.sens = 1 THEN sd.quantite ELSE 0 END) AS qte_entree,
      SUM(CASE WHEN sd.sens = -1 THEN sd.quantite ELSE 0 END) AS qte_sortie,
      SUM(CASE WHEN sd.sens = 1 THEN sd.quantite ELSE 0 END)
      - SUM(CASE WHEN sd.sens = -1 THEN sd.quantite ELSE 0 END) AS stock_disponible
    FROM v_warehouse w
    INNER JOIN stock_detail sd ON w.id = sd.depot_id
    INNER JOIN stock s ON s.id = sd.stock_id
    INNER JOIN v_article a ON a.article_id = sd.article_id
    WHERE w.id = :depotId
    GROUP BY w.nom, a.Code_Article, a.Designation, a.unite, a.Famille
    ORDER BY a.Designation
  `;

  const rows = await sequelize.query(query, {
    replacements: { depotId: safeDepotId },
    type: sequelize.QueryTypes.SELECT
  });
  return Array.isArray(rows) ? rows : [];
};

const getStockDocumentColumns = async (sequelize) => {
  const rows = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'stock_document'`,
    { type: sequelize.QueryTypes.SELECT }
  );
  return new Set((Array.isArray(rows) ? rows : []).map((r) => String(r.COLUMN_NAME || '').toLowerCase()));
};

const getStockDocumentDetailColumns = async (sequelize) => {
  const rows = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'stock_document_detail'`,
    { type: sequelize.QueryTypes.SELECT }
  );
  return new Set((Array.isArray(rows) ? rows : []).map((r) => String(r.COLUMN_NAME || '').toLowerCase()));
};

const getTableColumns = async (sequelize, tableName) => {
  const rows = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = :tableName`,
    {
      replacements: { tableName },
      type: sequelize.QueryTypes.SELECT
    }
  );
  return new Set((Array.isArray(rows) ? rows : []).map((r) => String(r.COLUMN_NAME || '').toLowerCase()));
};

const normalizePositiveInt = (value) => {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const getStockDetailLotColumnSet = async (sequelize) => getTableColumns(sequelize, 'stock_detail_lot');

const insertStockDetailLot = async (sequelize, payload, transaction = null) => {
  const lotColSet = await getStockDetailLotColumnSet(sequelize);
  if (!lotColSet.size) return;
  if (!lotColSet.has('stock_id') || !lotColSet.has('detail_id')) return;

  const stockId = normalizePositiveInt(payload?.stock_id);
  const detailId = normalizePositiveInt(payload?.detail_id);
  const articleId = normalizePositiveInt(payload?.article_id);
  const ligne = normalizePositiveInt(payload?.ligne);
  const serie = String(payload?.serie || '').trim();

  if (!stockId || !detailId || !articleId || !ligne || !serie) {
    return;
  }

  const replacements = {
    stockId,
    ligne,
    articleId,
    quantite: Number(payload?.quantite) || 0,
    serie: serie.substring(0, 200),
    detailId,
    userId: normalizePositiveInt(payload?.user_id)
  };

  const columns = [];
  const values = [];

  if (lotColSet.has('stock_id')) {
    columns.push('stock_id');
    values.push(':stockId');
  }
  if (lotColSet.has('ligne')) {
    columns.push('ligne');
    values.push(':ligne');
  }
  if (lotColSet.has('article_id')) {
    columns.push('article_id');
    values.push(':articleId');
  }
  if (lotColSet.has('quantite')) {
    columns.push('quantite');
    values.push(':quantite');
  }
  if (lotColSet.has('barcode')) {
    columns.push('barcode');
    values.push('NULL');
  }
  if (lotColSet.has('code')) {
    columns.push('code');
    values.push('NULL');
  }
  if (lotColSet.has('serie')) {
    columns.push('serie');
    values.push(':serie');
  }
  if (lotColSet.has('date')) {
    columns.push('date');
    values.push('GETDATE()');
  }
  if (lotColSet.has('lot_id')) {
    columns.push('lot_id');
    values.push('NULL');
  }
  if (lotColSet.has('detail_id')) {
    columns.push('detail_id');
    values.push(':detailId');
  }
  if (lotColSet.has('emplacement')) {
    columns.push('emplacement');
    values.push('NULL');
  }
  if (lotColSet.has('type')) {
    columns.push('type');
    values.push('2');
  }
  if (lotColSet.has('etat')) {
    columns.push('etat');
    values.push('1');
  }
  if (lotColSet.has('cr_date')) {
    columns.push('cr_date');
    values.push('GETDATE()');
  }
  if (lotColSet.has('user_id')) {
    columns.push('user_id');
    values.push(':userId');
  }

  if (!columns.length) return;

  await sequelize.query(
    `INSERT INTO stock_detail_lot (${columns.join(', ')}) VALUES (${values.join(', ')})`,
    {
      replacements,
      transaction: transaction || undefined
    }
  );
};

const generatePreparationNumero = async (sequelize) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const prefix = `BP${year}-`;
  const query = `
    SELECT ISNULL(MAX(CAST(SUBSTRING(numero, LEN(:prefix) + 1, LEN(numero)) AS INT)), 0) + 1 AS nextNumber
    FROM stock_document
    WHERE type = 10 AND numero LIKE :prefixLike
  `;
  const [row] = await sequelize.query(query, {
    replacements: { prefix, prefixLike: `${prefix}%` },
    type: sequelize.QueryTypes.SELECT
  });
  const next = Number(row?.nextNumber || 1);
  return `${prefix}${String(next).padStart(4, '0')}`;
};

const getNextPreparationNumero = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  return { numero: await generatePreparationNumero(sequelize) };
};

const getVisibleCommandeSourceDetails = async (sequelize, sourceCommandeId, transaction = null) => {
  const id = parseInt(sourceCommandeId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return [];
  }

  const detailColumns = await getTableColumns(sequelize, 'vente_document_detail');
  const hasLigne = detailColumns.has('ligne');
  const hasType = detailColumns.has('type');
  const idColumn = detailColumns.has('id') ? 'vdd.id' : (detailColumns.has('detail_id') ? 'vdd.detail_id' : 'NULL');
  const queryOptions = {
    replacements: { sourceCommandeId: id },
    type: sequelize.QueryTypes.SELECT
  };
  if (transaction) {
    queryOptions.transaction = transaction;
  }

  const rawRows = await sequelize.query(
    `
      SELECT
        vdd.article_id,
        a.article_cod,
        a.article_nom,
        ISNULL(vdd.quantite, 0) AS quantite,
        ISNULL(vdd.prix, 0) AS prix,
        ISNULL(vdd.taux_tva, 0) AS taux_tva,
        ${hasType ? 'vdd.type' : 'NULL'} AS ligne_type,
        ${hasLigne ? 'vdd.ligne' : 'NULL'} AS ordre_ligne,
        ${idColumn} AS ligne_id
      FROM vente_document_detail vdd
      LEFT JOIN article a ON a.article_id = vdd.article_id
      WHERE vdd.document_id = :sourceCommandeId
        ${hasType ? 'AND ISNULL(vdd.type, 0) <> 1' : ''}
      ORDER BY
        ${hasLigne ? 'CASE WHEN vdd.ligne IS NULL THEN 1 ELSE 0 END, vdd.ligne ASC,' : ''}
        ${idColumn === 'NULL' ? 'vdd.article_id' : idColumn} ASC
    `,
    queryOptions
  );

  const rows = Array.isArray(rawRows) ? rawRows : [];
  if (rows.length === 0) {
    return [];
  }

  const enriched = await enrichRowsWithNomenclature(rows, sequelize);
  const visibleRows = removeNomenclatureComponentRows(enriched);
  const grouped = new Map();

  for (const row of visibleRows) {
    const articleId = Number(row?.article_id || 0);
    if (!articleId) {
      continue;
    }

    const existing = grouped.get(articleId);
    if (existing) {
      existing.quantite_demandee += Number(row?.quantite || 0);
      continue;
    }

    grouped.set(articleId, {
      article_id: articleId,
      article_cod: row?.article_cod || '',
      article_nom: row?.article_nom || '',
      quantite_demandee: Number(row?.quantite || 0),
      ordre_ligne: row?.ordre_ligne ?? null,
      ligne_id: row?.ligne_id ?? null
    });
  }

  return Array.from(grouped.values()).sort((left, right) => {
    const leftOrder = left.ordre_ligne == null ? Number.MAX_SAFE_INTEGER : Number(left.ordre_ligne);
    const rightOrder = right.ordre_ligne == null ? Number.MAX_SAFE_INTEGER : Number(right.ordre_ligne);
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return Number(left.ligne_id || 0) - Number(right.ligne_id || 0);
  });
};

const getVisiblePreparationDetailRows = async (sequelize, preparationId, transaction = null) => {
  const id = parseInt(preparationId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return [];
  }

  const detailColumns = await getStockDocumentDetailColumns(sequelize);
  const hasLigne = detailColumns.has('ligne');
  const hasType = detailColumns.has('type');
  const queryOptions = {
    replacements: { preparationId: id },
    type: sequelize.QueryTypes.SELECT
  };
  if (transaction) {
    queryOptions.transaction = transaction;
  }

  const rows = await sequelize.query(
    `
      SELECT
        sdd.id AS ligne_id,
        sdd.article_id,
        a.article_cod,
        a.article_nom,
        ISNULL(sdd.quantite, 0) AS quantite,
        ISNULL(sdd.prix, 0) AS prix,
        ISNULL(sdd.taux_tva, 0) AS taux_tva,
        ${hasType ? 'sdd.type' : 'NULL'} AS type,
        ${hasLigne ? 'sdd.ligne' : 'NULL'} AS ordre_ligne
      FROM stock_document_detail sdd
      LEFT JOIN article a ON a.article_id = sdd.article_id
      WHERE sdd.stock_id = :preparationId
      ORDER BY
        ${hasLigne ? 'CASE WHEN sdd.ligne IS NULL THEN 1 ELSE 0 END, sdd.ligne ASC,' : ''}
        sdd.id ASC
    `,
    queryOptions
  );

  const safeRows = Array.isArray(rows) ? rows : [];
  if (safeRows.length === 0) {
    return [];
  }

  const enriched = await enrichRowsWithNomenclature(safeRows, sequelize);
  return removeNomenclatureComponentRows(enriched);
};

const getPreparations = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const {
    page = 1,
    pageSize = 25,
    search = ''
  } = options;

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safePageSize = Math.max(1, parseInt(pageSize, 10) || 25);
  const offset = (safePage - 1) * safePageSize;
  const replacements = { offset, pageSize: safePageSize };

  let where = 'WHERE sd.type = 10';
  if (search && String(search).trim()) {
    where += ` AND (
      sd.numero LIKE :search
      OR sd.description LIKE :search
      OR vd.numero LIKE :search
      OR p.nom LIKE :search
    )`;
    replacements.search = `%${String(search).trim()}%`;
  }

  const query = `
    SELECT *
    FROM (
      SELECT
        sd.id AS preparation_id,
        sd.numero,
        sd.date,
        sd.description,
        sd.etat,
        sd.part_ref,
        COALESCE(sd.parent, sd.part_id) AS source_commande_id,
        vd.numero AS commande_numero,
        p.nom AS client,
        COUNT(sdd.id) AS nb_lignes,
        ISNULL(SUM(ISNULL(sdd.quantite, 0)), 0) AS total_quantite,
        ISNULL(cmd.total_demande, 0) AS total_demande,
        ISNULL(trf.total_transfere, 0) AS total_transfere,
        CASE
          WHEN ISNULL(cmd.total_demande, 0) <= 0 THEN 0
          ELSE CAST((ISNULL(SUM(ISNULL(sdd.quantite, 0)), 0) * 100.0) / NULLIF(ISNULL(cmd.total_demande, 0), 0) AS DECIMAL(10, 2))
        END AS progression_percent,
        COUNT(*) OVER() AS total_count,
        ROW_NUMBER() OVER (ORDER BY sd.date DESC, sd.id DESC) AS RowNum
      FROM stock_document sd
      LEFT JOIN stock_document_detail sdd ON sdd.stock_id = sd.id
      LEFT JOIN vente_document vd ON vd.document_id = COALESCE(sd.parent, sd.part_id)
      LEFT JOIN partenaire p ON p.part_id = COALESCE(vd.part_id, sd.part_id)
      OUTER APPLY (
        SELECT SUM(ISNULL(vdd.quantite, 0)) AS total_demande
        FROM vente_document_detail vdd
        WHERE vdd.document_id = COALESCE(sd.parent, sd.part_id)
      ) cmd
      OUTER APPLY (
        SELECT SUM(ISNULL(std.quantite, 0)) AS total_transfere
        FROM stock st
        INNER JOIN stock_detail std ON std.stock_id = st.id
        WHERE st.type = 2
          AND st.parent = sd.id
      ) trf
      ${where}
      GROUP BY sd.id, sd.numero, sd.date, sd.description, sd.etat, sd.part_ref, sd.part_id, sd.parent, vd.numero, p.nom, cmd.total_demande, trf.total_transfere
    ) X
    WHERE RowNum > :offset AND RowNum <= (:offset + :pageSize)
    ORDER BY RowNum
  `;

  const rows = await sequelize.query(query, {
    replacements,
    type: sequelize.QueryTypes.SELECT
  });
  const data = Array.isArray(rows) ? rows.map(({ total_count, RowNum, ...r }) => r) : [];
  for (const row of data) {
    const sourceCommandeId = Number(row?.source_commande_id || 0);
    if (sourceCommandeId <= 0) {
      continue;
    }

    const visibleSourceDetails = await getVisibleCommandeSourceDetails(sequelize, sourceCommandeId);
    const totalDemande = visibleSourceDetails.reduce((sum, detail) => {
      return sum + Number(detail?.quantite_demandee || 0);
    }, 0);
    const visiblePreparationDetails = await getVisiblePreparationDetailRows(sequelize, row.preparation_id);
    const totalQuantite = visiblePreparationDetails.reduce((sum, detail) => {
      return sum + Number(detail?.quantite || 0);
    }, 0);

    row.total_demande = totalDemande;
    row.total_quantite = totalQuantite;
    row.progression_percent = totalDemande > 0
      ? Number(((totalQuantite * 100) / totalDemande).toFixed(2))
      : 0;
  }
  const total = Array.isArray(rows) && rows.length > 0 ? Number(rows[0].total_count || 0) : 0;

  return {
    data,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / safePageSize))
    }
  };
};

const getCommandesDisponiblesPourPreparation = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const query = `
    SELECT DISTINCT
      vd.document_id,
      vd.numero,
      vd.date,
      vd.description,
      p.nom AS client,
      c.nom AS commercial
    FROM vente_document vd
    LEFT JOIN v_partenaire p ON p.part_id = vd.part_id
    LEFT JOIN contact c ON c.id = vd.contact_id
    WHERE vd.type = 2
      AND (vd.etat IS NULL OR vd.etat = 2)
      AND NOT EXISTS (
        SELECT 1 FROM stock s
        WHERE s.type = 2
          AND s.parent = vd.document_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM stock_document sd
        WHERE sd.type = 10
          AND sd.parent = vd.document_id
      )
    ORDER BY vd.date DESC, vd.document_id DESC
  `;
  const rows = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
  return Array.isArray(rows) ? rows : [];
};

const createPreparation = async ({
  description = '',
  sourceCommandeId = null,
  date = null,
  part_id = null,
  contact_id = null,
  employe_id = null,
  depot_id = null,
  date_fin = null
} = {}, utilisateurId = 1, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  return await sequelize.transaction(async (t) => {
    const numero = await generatePreparationNumero(sequelize);

    let sourceCommande = null;
    if (sourceCommandeId) {
      const [cmd] = await sequelize.query(
        'SELECT document_id, numero, part_id, contact_id, depot_id, adresse_id, date, date_fin, description FROM vente_document WHERE document_id = :id',
        {
          replacements: { id: Number(sourceCommandeId) },
          type: sequelize.QueryTypes.SELECT,
          transaction: t
        }
      );
      sourceCommande = Array.isArray(cmd) ? cmd[0] : cmd;
      if (!sourceCommande) {
        throw new Error('Commande source introuvable');
      }
    }

    const stockDocColumns = await getStockDocumentColumns(sequelize);
    const resolvedPartId = Number(part_id || 0) > 0 ? Number(part_id) : (Number(sourceCommande?.part_id || 0) || null);
    const resolvedContactId = Number(contact_id || 0) > 0 ? Number(contact_id) : (Number(sourceCommande?.contact_id || 0) || null);
    const resolvedEmployeId = Number(employe_id || 0) > 0 ? Number(employe_id) : null;
    const resolvedDepotId = Number(depot_id || 0) > 0
      ? Number(depot_id)
      : (Number(sourceCommande?.depot_id || sourceCommande?.adresse_id || 0) || null);
    const resolvedDate = formatToSqlDateTimeMs(date || sourceCommande?.date || null);
    const resolvedDateFin = formatToSqlDateTimeMs(date_fin || sourceCommande?.date_fin || null);

    let insertCols = ['numero', 'date', 'type', 'description', 'part_ref', 'part_id', 'user_id', 'etat', 'cr_date', 'imprime'];
    let insertVals = [':numero', resolvedDate ? ':date' : 'GETDATE()', '10', ':description', ':part_ref', ':part_id', ':user_id', '0', 'GETDATE()', '0'];
    if (stockDocColumns.has('contact_id')) {
      insertCols.push('contact_id');
      insertVals.push(':contact_id');
    }
    if (stockDocColumns.has('employe_id')) {
      insertCols.push('employe_id');
      insertVals.push(':employe_id');
    }
    if (stockDocColumns.has('depot_id')) {
      insertCols.push('depot_id');
      insertVals.push(':depot_id');
    } else if (stockDocColumns.has('adresse_id')) {
      insertCols.push('adresse_id');
      insertVals.push(':depot_id');
    }
    if (resolvedDateFin && stockDocColumns.has('date_fin')) {
      insertCols.push('date_fin');
      insertVals.push(':date_fin');
    }
    if (stockDocColumns.has('parent')) {
      insertCols.push('parent');
      insertVals.push(':parent');
    }
    const insertHeader = `
      INSERT INTO stock_document (${insertCols.join(', ')})
      VALUES (${insertVals.join(', ')})
    `;
    await sequelize.query(insertHeader, {
      replacements: {
        numero,
        date: resolvedDate,
        date_fin: resolvedDateFin,
        description: description || (sourceCommande ? `Préparation depuis commande ${sourceCommande.numero}` : 'Bon de préparation'),
        part_ref: sourceCommande ? 'COMMANDE' : null,
        part_id: resolvedPartId,
        contact_id: resolvedContactId,
        employe_id: resolvedEmployeId,
        depot_id: resolvedDepotId,
        parent: sourceCommande ? sourceCommande.document_id : null,
        user_id: utilisateurId || 1
      },
      type: sequelize.QueryTypes.INSERT,
      transaction: t
    });

    const [headerIdRow] = await sequelize.query(
      'SELECT TOP 1 id FROM stock_document WHERE numero = :numero ORDER BY id DESC',
      {
        replacements: { numero },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      }
    );
    const inserted = Array.isArray(headerIdRow) ? headerIdRow[0] : headerIdRow;
    const preparationId = inserted?.id;
    if (!preparationId) {
      throw new Error('Création du bon de préparation échouée');
    }

    return { id: preparationId, preparationId, numero };
  });
};

const getPreparationById = async (preparationId, sequelizeConnection = null, transaction = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const id = parseInt(preparationId, 10);
  if (!Number.isInteger(id) || id <= 0) throw new Error('ID préparation invalide');

  const stockDocColumns = await getStockDocumentColumns(sequelize);
  const stockDocDetailColumns = await getStockDocumentDetailColumns(sequelize);
  const employeColumns = await getTableColumns(sequelize, 'employe');
  const hasContactId = stockDocColumns.has('contact_id');
  const hasEmployeId = stockDocColumns.has('employe_id');
  const hasEmployeTable = employeColumns.size > 0;
  const hasEmployeNom = employeColumns.has('nom');
  const hasDepotId = stockDocColumns.has('depot_id');
  const hasAdresseId = stockDocColumns.has('adresse_id');
  const hasDateFin = stockDocColumns.has('date_fin');
  const hasParent = stockDocColumns.has('parent');
  const hasDetailEtat = stockDocDetailColumns.has('etat');
  const hasDetailType = stockDocDetailColumns.has('type');
  const hasDetailLigne = stockDocDetailColumns.has('ligne');
  const sourceExpr = hasParent ? 'COALESCE(sd.parent, sd.part_id)' : 'sd.part_id';
  const contactExpr = hasContactId ? 'sd.contact_id' : 'NULL';
  const employeExpr = hasEmployeId ? 'sd.employe_id' : 'NULL';
  const depotExpr = hasDepotId ? 'sd.depot_id' : (hasAdresseId ? 'sd.adresse_id' : 'NULL');
  const dateFinExpr = hasDateFin ? 'sd.date_fin' : 'NULL';
  const detailDepotExpr = stockDocDetailColumns.has('depot_id')
    ? 'sdd.depot_id'
    : (stockDocDetailColumns.has('adresse_id') ? 'sdd.adresse_id' : 'NULL');
  const detailDescExpr = stockDocDetailColumns.has('description') ? 'sdd.description' : 'NULL';
  const detailLotExpr = stockDocDetailColumns.has('lot') ? 'sdd.lot' : 'NULL';
  const detailEtatExpr = hasDetailEtat ? 'sdd.etat' : '0';
  const employeNameExpr = (hasEmployeTable && hasEmployeNom) ? 'e.nom' : 'NULL';
  const employeJoin = hasEmployeTable ? `LEFT JOIN employe e ON e.id = ${employeExpr}` : '';

  const queryOptions = {
    replacements: { id },
    type: sequelize.QueryTypes.SELECT
  };
  if (transaction) {
    queryOptions.transaction = transaction;
  }

  const [headerRows] = await sequelize.query(
    `
      SELECT
        sd.id AS preparation_id,
        sd.numero,
        sd.date,
        ${dateFinExpr} AS date_fin,
        sd.description,
        sd.etat,
        sd.part_ref,
        ${sourceExpr} AS source_commande_id,
        sd.part_id,
        ${contactExpr} AS contact_id,
        ${employeExpr} AS employe_id,
        ${depotExpr} AS depot_id,
        vd.numero AS commande_numero,
        COALESCE(vd.part_id, sd.part_id) AS client_id,
        p.nom AS client,
        c.nom AS commercial,
        ${employeNameExpr} AS employe,
        w.nom AS depot_nom
      FROM stock_document sd
      LEFT JOIN vente_document vd ON vd.document_id = ${sourceExpr}
      LEFT JOIN partenaire p ON p.part_id = COALESCE(vd.part_id, sd.part_id)
      LEFT JOIN contact c ON c.id = COALESCE(vd.contact_id, ${contactExpr})
      ${employeJoin}
      LEFT JOIN v_warehouse w ON w.id = COALESCE(vd.depot_id, vd.adresse_id, ${depotExpr})
      WHERE sd.id = :id AND sd.type = 10
    `,
    queryOptions
  );
  const header = Array.isArray(headerRows) ? headerRows[0] : headerRows;
  if (!header) return null;

  const details = await sequelize.query(
    `
      SELECT
        sdd.id,
        sdd.stock_id,
        sdd.article_id,
        a.article_cod,
        a.article_nom,
        sdd.quantite,
        sdd.prix,
        sdd.taux_tva,
        sdd.sens,
        CAST(0 AS FLOAT) AS remise,
        CAST(0 AS FLOAT) AS remise_montant,
        ${detailDepotExpr} AS depot_id,
        ${detailDescExpr} AS designation,
        ${detailLotExpr} AS lot,
        ${detailEtatExpr} AS etat,
        ${hasDetailType ? 'sdd.type' : 'NULL'} AS type,
        au.unite_id,
        au.fact,
        au.unite_nom
      FROM stock_document_detail sdd
      LEFT JOIN article a ON a.article_id = sdd.article_id
      OUTER APPLY (
        SELECT TOP 1 au.unite_id, au.fact, u.nom AS unite_nom
        FROM article_unite au
        LEFT JOIN unite u ON u.id = au.unite_id
        WHERE au.article_id = sdd.article_id
        ORDER BY CASE WHEN ISNULL(au.fact, 0) > 1 THEN 0 ELSE 1 END, au.unite_id
      ) au
      WHERE sdd.stock_id = :id
      ORDER BY ${hasDetailLigne ? 'CASE WHEN sdd.ligne IS NULL THEN 1 ELSE 0 END, sdd.ligne ASC,' : ''} sdd.id
    `,
    queryOptions
  );

  const sourceCommandeId = Number(header.source_commande_id || 0);
  let sourceDetails = [];
  if (sourceCommandeId > 0) {
    sourceDetails = await getVisibleCommandeSourceDetails(sequelize, sourceCommandeId, transaction);
  }

  const demandedMap = new Map((Array.isArray(sourceDetails) ? sourceDetails : []).map((row) => [
    Number(row.article_id || 0),
    Number(row.quantite_demandee || 0)
  ]));

  const normalizedDetails = (Array.isArray(details) ? details : []).map((detail) => {
    const articleId = Number(detail.article_id || 0);
    const quantite = Number(detail.quantite || 0);
    const quantiteDemandee = demandedMap.get(articleId) || 0;
    const lineEtat = Number(detail.etat || 0) === 1 ? 1 : 0;
    const quantiteTransferee = lineEtat === 1 ? quantite : 0;
    const quantiteRestanteTransfert = lineEtat === 1 ? 0 : Math.max(0, quantite);

    return {
      ...detail,
      quantite_demandee: quantiteDemandee,
      quantite_transferee: quantiteTransferee,
      quantite_restante_transfert: quantiteRestanteTransfert,
      etat: lineEtat
    };
  });

  const enrichedDetails = await enrichRowsWithNomenclature(normalizedDetails, sequelize);
  const visibleDetails = removeNomenclatureComponentRows(enrichedDetails);
  const visibleDetailsForTotals = (Array.isArray(visibleDetails) ? visibleDetails : []).filter((row) => Number(row?.type || 0) !== 1);
  const totalDemande = (Array.isArray(sourceDetails) ? sourceDetails : []).reduce((sum, row) => sum + Number(row.quantite_demandee || 0), 0);
  const totalPrepare = visibleDetailsForTotals.reduce((sum, row) => sum + Number(row.quantite || 0), 0);
  const totalTransfere = visibleDetailsForTotals.reduce((sum, row) => sum + Number(row.quantite_transferee || 0), 0);

  return {
    ...header,
    details: Array.isArray(visibleDetails) ? visibleDetails : [],
    all_details: normalizedDetails,
    source_details: Array.isArray(sourceDetails) ? sourceDetails : [],
    total_demande: totalDemande,
    total_prepare: totalPrepare,
    total_transfere: totalTransfere,
    total_restant_preparer: Math.max(0, totalDemande - totalPrepare),
    total_restant_transferer: Math.max(0, totalPrepare - totalTransfere),
    progression_percent: totalDemande > 0 ? Number(((totalPrepare * 100) / totalDemande).toFixed(2)) : 0
  };
};

const searchPreparationArticles = async (term = '', sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const search = String(term || '').trim();
  if (!search) return [];

  const rows = await sequelize.query(
    `
      WITH lot_matches AS (
        SELECT DISTINCT TOP 20
          a.article_id,
          a.article_cod,
          a.article_nom,
          sdl.serie AS matched_serie,
          0 AS sort_rank
        FROM stock_detail_lot sdl
        INNER JOIN article a ON a.article_id = sdl.article_id
        WHERE ISNULL(sdl.etat, 1) = 1
          AND sdl.serie IS NOT NULL
          AND LTRIM(RTRIM(sdl.serie)) <> ''
          AND (
            sdl.serie LIKE :search
            OR a.article_nom LIKE :search
            OR a.article_cod LIKE :search
          )
      ),
      article_matches AS (
        SELECT DISTINCT TOP 20
          a.article_id,
          a.article_cod,
          a.article_nom,
          CAST(NULL AS NVARCHAR(255)) AS matched_serie,
          1 AS sort_rank
        FROM article a
        WHERE a.article_nom LIKE :search
           OR a.article_cod LIKE :search
      )
      SELECT TOP 20 article_id, article_cod, article_nom, matched_serie
      FROM (
        SELECT * FROM lot_matches
        UNION
        SELECT * FROM article_matches
      ) results
      ORDER BY sort_rank, article_nom, matched_serie
    `,
    {
      replacements: { search: `%${search}%` },
      type: sequelize.QueryTypes.SELECT
    }
  );

  return Array.isArray(rows) ? rows : [];
};

const transfererPreparationVersLivraison = async (preparationId, utilisateurId = 1, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const preparation = await getPreparationById(preparationId, sequelize);
  if (!preparation) {
    throw new Error('Bon de pr?paration introuvable');
  }
  const stockDocDetailColumns = await getStockDocumentDetailColumns(sequelize);

  const sourceCommandeId = Number(preparation.source_commande_id || 0);
  let sourceCommande = null;
  if (sourceCommandeId > 0) {
    const [cmdRows] = await sequelize.query(
      'SELECT * FROM vente_document WHERE document_id = :id',
      { replacements: { id: sourceCommandeId }, type: sequelize.QueryTypes.SELECT }
    );
    sourceCommande = Array.isArray(cmdRows) ? cmdRows[0] : cmdRows;
  }

  return await sequelize.transaction(async (t) => {
    const transferSourceDetails = Array.isArray(preparation.all_details) && preparation.all_details.length > 0
      ? preparation.all_details
      : (preparation.details || []);
    const transferableDetails = transferSourceDetails
      .map((d) => {
        return {
          ...d,
          quantite_a_transferer: Number(d.etat || 0) === 0 ? Math.max(0, Number(d.quantite || 0)) : 0
        };
      })
      .filter((d) => Number(d.etat || 0) === 0 && d.quantite_a_transferer > 0);

    if (transferableDetails.length === 0) {
      throw new Error('Aucune quantite restante a transferer vers le bon de livraison');
    }

    const stockId = await livraisonModel.addLivraisonFromCommande({
      numero: '',
      date: sourceCommande?.date || preparation.date,
      description: sourceCommande?.description || `Depuis pr?paration ${preparation.numero}`,
      part_id: sourceCommande?.part_id || preparation.part_id || null,
      contact_id: sourceCommande?.contact_id || preparation.contact_id || null,
      depot_id: sourceCommande?.depot_id || sourceCommande?.adresse_id || preparation.depot_id || null,
      type: 2,
      etat: 1,
      parent: preparation.preparation_id
    }, sequelize);

    for (let index = 0; index < transferableDetails.length; index++) {
      const d = transferableDetails[index];
      const insertedDetailId = await livraisonModel.saveDetailStock({
        stock_id: stockId,
        article_id: d.article_id,
        quantite: d.quantite_a_transferer,
        prix: d.prix || 0,
        taux_tva: d.taux_tva || 0,
        depot_id: d.depot_id || preparation.depot_id || null,
        description: d.designation || d.article_nom || '',
        sens: -1,
        ligne: index + 1,
        type: Number(d.type || 0) === 1 ? 1 : 0
      }, sequelize, t);

      await insertStockDetailLot(sequelize, {
        stock_id: stockId,
        detail_id: insertedDetailId,
        article_id: d.article_id,
        ligne: index + 1,
        quantite: d.quantite_a_transferer,
        serie: d.lot || d.serie || '',
        user_id: utilisateurId
      }, t);
    }

    if (stockDocDetailColumns.has('etat')) {
      await sequelize.query(
        'UPDATE stock_document_detail SET etat = 1 WHERE stock_id = :stockId',
        {
          replacements: { stockId: Number(preparation.preparation_id) },
          type: sequelize.QueryTypes.UPDATE,
          transaction: t
        }
      );
    }

    const updatedPreparation = await getPreparationById(preparation.preparation_id, sequelize, t);
    const isFullyTransferred = Number(updatedPreparation.total_restant_transferer || 0) <= 0;
    await sequelize.query(
      'UPDATE stock_document SET etat = :etat WHERE id = :id',
      {
        replacements: { id: preparation.preparation_id, etat: isFullyTransferred ? 1 : 0 },
        type: sequelize.QueryTypes.UPDATE,
        transaction: t
      }
    );

    const [livRows] = await sequelize.query(
      'SELECT numero FROM stock WHERE id = :id',
      { replacements: { id: stockId }, type: sequelize.QueryTypes.SELECT, transaction: t }
    );
    const liv = Array.isArray(livRows) ? livRows[0] : livRows;

    return {
      stockId,
      numeroLivraison: liv?.numero || '',
      message: 'Transfert vers bon de livraison effectue avec succes'
    };
  });
};

const updatePreparationHeader = async (preparationId, payload = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const id = parseInt(preparationId, 10);
  if (!Number.isInteger(id) || id <= 0) throw new Error('ID préparation invalide');

  const stockDocColumns = await getStockDocumentColumns(sequelize);
  const sets = [];
  const replacements = { id };

  if (payload.description !== undefined) {
    sets.push('description = :description');
    replacements.description = String(payload.description || '');
  }
  if (payload.date) {
    sets.push('date = :date');
    replacements.date = payload.date;
  }
  if (payload.part_id !== undefined) {
    sets.push('part_id = :part_id');
    replacements.part_id = Number(payload.part_id || 0) || null;
  }
  if (payload.contact_id !== undefined && stockDocColumns.has('contact_id')) {
    sets.push('contact_id = :contact_id');
    replacements.contact_id = Number(payload.contact_id || 0) || null;
  }
  if (payload.employe_id !== undefined && stockDocColumns.has('employe_id')) {
    sets.push('employe_id = :employe_id');
    replacements.employe_id = Number(payload.employe_id || 0) || null;
  }
  if (payload.depot_id !== undefined) {
    if (stockDocColumns.has('depot_id')) {
      sets.push('depot_id = :depot_id');
      replacements.depot_id = Number(payload.depot_id || 0) || null;
    } else if (stockDocColumns.has('adresse_id')) {
      sets.push('adresse_id = :depot_id');
      replacements.depot_id = Number(payload.depot_id || 0) || null;
    }
  }
  if (payload.date_fin !== undefined && stockDocColumns.has('date_fin')) {
    sets.push('date_fin = :date_fin');
    replacements.date_fin = payload.date_fin || null;
  }
  if (sets.length === 0) {
    return await getPreparationById(id, sequelize);
  }

  await sequelize.query(
    `UPDATE stock_document SET ${sets.join(', ')} WHERE id = :id AND type = 10`,
    { replacements, type: sequelize.QueryTypes.UPDATE }
  );
  return await getPreparationById(id, sequelize);
};

const flattenPreparationNomenclatureOverrides = (components = []) => {
  const result = [];
  for (const component of Array.isArray(components) ? components : []) {
    if (!component || Number(component?.article_id || 0) <= 0) {
      continue;
    }

    result.push(component);

    const children = component.children || component.nomenclature_components || component.components;
    if (Array.isArray(children) && children.length > 0) {
      result.push(...flattenPreparationNomenclatureOverrides(children));
    }
  }

  return result;
};

const mapPreparationComponentOverride = (component, parentLine, utilisateurId = 1) => ({
  article_id: Number(component.article_id || 0),
  quantite: toFiniteNumber(component.quantite ?? component.qte ?? component.quantiteTotale, 0),
  prix: toFiniteNumber(component.prix ?? component.pu, 0),
  taux_tva: toFiniteNumber(component.taux_tva ?? component.tva ?? parentLine.taux_tva, 0),
  depot_id: Number(component.depot_id || parentLine.depot_id || 0) || null,
  description: component.designation || component.description || null,
  lot: component.lot ? String(component.lot) : null,
  sens: -1,
  etat: Number(component.etat ?? parentLine.etat ?? 0),
  unite_id: Number(component.unite_id || parentLine.unite_id || 1),
  user_id: utilisateurId || 1,
  type: 1
});

const savePreparationLines = async (preparationId, lines = [], utilisateurId = 1, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const id = parseInt(preparationId, 10);
  if (!Number.isInteger(id) || id <= 0) throw new Error('ID préparation invalide');
  if (!Array.isArray(lines)) throw new Error('lines doit être un tableau');

  return await sequelize.transaction(async (t) => {
    await sequelize.query(
      'DELETE FROM stock_document_detail WHERE stock_id = :id',
      { replacements: { id }, type: sequelize.QueryTypes.DELETE, transaction: t }
    );

    const mapped = lines
      .filter((l) => Number(l?.article_id || 0) > 0 && Number(l?.quantite || 0) > 0)
      .map((l) => ({
        article_id: Number(l.article_id),
        quantite: Number(l.quantite || 0),
        prix: Number(l.prix || 0),
        taux_tva: Number(l.taux_tva || 0),
        depot_id: Number(l.depot_id || 0) || null,
        description: l.designation ? String(l.designation) : null,
        lot: l.lot ? String(l.lot) : null,
        sens: -1,
        etat: Number(l.etat || 0),
        unite_id: Number(l.unite_id || 1),
        user_id: utilisateurId || 1,
        nomenclature_components: flattenPreparationNomenclatureOverrides(l.nomenclature_components || l.components || [])
      }));

    const expanded = [];
    for (const line of mapped) {
      expanded.push(line);
      const componentLines = Array.isArray(line.nomenclature_components) && line.nomenclature_components.length > 0
        ? line.nomenclature_components.map((component) => mapPreparationComponentOverride(component, line, utilisateurId))
        : await buildFlatComponentLines(sequelize, line);
      for (const component of componentLines) {
        expanded.push({
          article_id: Number(component.article_id || 0),
          quantite: toFiniteNumber(component.quantite ?? component.qte, 0),
          prix: toFiniteNumber(component.prix ?? component.pu, 0),
          taux_tva: toFiniteNumber(component.taux_tva ?? component.tva ?? line.taux_tva, 0),
          depot_id: line.depot_id || null,
          description: component.designation || component.description || null,
          lot: null,
          sens: -1,
          etat: Number(line.etat || 0),
          unite_id: Number(component.unite_id || line.unite_id || 1),
          user_id: utilisateurId || 1,
          type: 1
        });
      }
    }

    if (expanded.length > 0) {
      await stockDocumentModel.addStockDocumentDetails(id, expanded, sequelize, t);
    }

    return await getPreparationById(id, sequelize, t);
  });
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
  getNextPreparationNumero,
  getPreparations,
  getPreparationById,
  searchPreparationArticles,
  updatePreparationHeader,
  savePreparationLines,
  getCommandesDisponiblesPourPreparation,
  createPreparation,
  transfererPreparationVersLivraison,
  getEntrepotResume,
  getEntrepotDetails,
  createEntreeStockFromAchat,
  createSortieStockFromVente,
  createSortieStock,
  createInventaire
};
