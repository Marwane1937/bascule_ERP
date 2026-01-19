const stockService = require('../services/stock.service');

/**
 * Récupérer les achats non encore entrés en stock
 */
const getAchatsNonEntresStock = async (req, res) => {
  try {
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'date',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || ''
    };

    const result = await stockService.getAchatsNonEntresStock(options);
    res.json(result);
  } catch (err) {
    console.error('[getAchatsNonEntresStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer les détails d'un achat pour entrée en stock
 */
const getAchatDetailsForStock = async (req, res) => {
  try {
    const achatDocumentId = parseInt(req.params.achatDocumentId, 10);

    if (!achatDocumentId || isNaN(achatDocumentId)) {
      return res.status(400).json({ message: 'achatDocumentId est requis et doit être un nombre' });
    }

    const result = await stockService.getAchatDetailsForStock(achatDocumentId);
    res.json(result);
  } catch (err) {
    console.error('[getAchatDetailsForStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer les ventes facturées non encore sorties du stock
 */
const getVentesNonSortiesStock = async (req, res) => {
  try {
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'date',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || '',
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
      client: req.query.client || null
    };

    const result = await stockService.getVentesNonSortiesStock(options);
    res.json(result);
  } catch (err) {
    console.error('[getVentesNonSortiesStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer les détails d'une vente pour sortie de stock
 */
const getVenteDetailsForStock = async (req, res) => {
  try {
    const venteDocumentId = parseInt(req.params.venteDocumentId, 10);

    if (!venteDocumentId || isNaN(venteDocumentId)) {
      return res.status(400).json({ message: 'venteDocumentId est requis et doit être un nombre' });
    }

    const result = await stockService.getVenteDetailsForStock(venteDocumentId);
    res.json(result);
  } catch (err) {
    console.error('[getVenteDetailsForStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer les articles avec leur stock
 */
const getArticlesStock = async (req, res) => {
  try {
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'article_nom',
      orderDirection: req.query.orderDirection || 'ASC',
      search: req.query.search || ''
    };

    const result = await stockService.getArticlesStock(options);
    res.json(result);
  } catch (err) {
    console.error('[getArticlesStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer l'état détaillé du stock
 */
const getEtatStock = async (req, res) => {
  try {
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'article_nom',
      orderDirection: req.query.orderDirection || 'ASC',
      search: req.query.search || '',
      depotId: req.query.depotId || 1,
      stockMinimum: req.query.stockMinimum || null
    };

    const result = await stockService.getEtatStock(options);
    res.json(result);
  } catch (err) {
    console.error('[getEtatStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer la fiche de stock pour un article
 */
const getFicheStock = async (req, res) => {
  try {
    const articleIdParam = req.params.articleId;
    let articleId = null;

    // articleId est optionnel maintenant (peut être filtré par article_nom)
    if (articleIdParam && articleIdParam !== '0') {
      const parsedId = parseInt(articleIdParam, 10);
      if (!isNaN(parsedId) && parsedId > 0) {
        articleId = parsedId;
      }
    }

    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 50,
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
      article_nom: req.query.article_nom || null,
      article: req.query.article || null,
      article_id: req.query.article_id || null // Filtre par ID article
    };

    const result = await stockService.getFicheStock(articleId, options);
    
    res.json(result);
  } catch (err) {
    console.error('[getFicheStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer le chiffre d'affaires par article
 */
const getChiffreAffairesArticles = async (req, res) => {
  try {
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'chiffre_affaires',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || '',
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null
    };

    const result = await stockService.getChiffreAffairesArticles(options);
    res.json(result);
  } catch (err) {
    console.error('[getChiffreAffairesArticles] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer tous les documents de stock
 */
const getAllStockDocuments = async (req, res) => {
  try {
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'date',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || '',
      type: req.query.type || null
    };

    const result = await stockService.getAllStockDocuments(options);
    res.json(result);
  } catch (err) {
    console.error('[getAllStockDocuments] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer un document de stock par ID
 */
const getStockDocumentById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (!id || isNaN(id)) {
      return res.status(400).json({ message: 'ID est requis et doit être un nombre' });
    }

    const result = await stockService.getStockDocumentById(id);
    if (!result) {
      return res.status(404).json({ message: 'Document de stock non trouvé' });
    }

    res.json(result);
  } catch (err) {
    console.error('[getStockDocumentById] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Créer une entrée de stock depuis un achat
 */
const createEntreeStockFromAchat = async (req, res) => {
  try {
    const { achatDocumentId, details } = req.body;
    const utilisateurId = req.user?.id || 1; // Récupérer depuis le token d'authentification

    console.log('[createEntreeStockFromAchat] Reçu:', { achatDocumentId, detailsLength: details?.length, utilisateurId });

    if (!achatDocumentId || !Array.isArray(details) || details.length === 0) {
      console.log('[createEntreeStockFromAchat] Validation échouée:', { achatDocumentId, details, detailsIsArray: Array.isArray(details) });
      return res.status(400).json({
        message: 'achatDocumentId et details (tableau non vide) sont requis'
      });
    }

    console.log('[createEntreeStockFromAchat] Appel du service...');
    const result = await stockService.createEntreeStockFromAchat(achatDocumentId, details, utilisateurId);
    console.log('[createEntreeStockFromAchat] Succès:', result);
    res.status(201).json(result);
  } catch (err) {
    console.error('[createEntreeStockFromAchat] Erreur:', err);
    console.error('[createEntreeStockFromAchat] Stack:', err.stack);
    res.status(500).json({ message: err.message, stack: err.stack });
  }
};

/**
 * Créer une sortie de stock depuis une vente
 */
const createSortieStockFromVente = async (req, res) => {
  try {
    const { venteDocumentId, details } = req.body;
    const utilisateurId = req.user?.id || 1; // Récupérer depuis le token d'authentification

    console.log('[createSortieStockFromVente] Reçu:', { venteDocumentId, detailsLength: details?.length, utilisateurId });

    if (!venteDocumentId || !Array.isArray(details) || details.length === 0) {
      console.log('[createSortieStockFromVente] Validation échouée:', { venteDocumentId, details, detailsIsArray: Array.isArray(details) });
      return res.status(400).json({
        message: 'venteDocumentId et details (tableau non vide) sont requis'
      });
    }

    console.log('[createSortieStockFromVente] Appel du service...');
    const result = await stockService.createSortieStockFromVente(venteDocumentId, details, utilisateurId);
    console.log('[createSortieStockFromVente] Succès:', result);
    res.status(201).json(result);
  } catch (err) {
    console.error('[createSortieStockFromVente] Erreur:', err);
    console.error('[createSortieStockFromVente] Stack:', err.stack);
    res.status(500).json({ message: err.message, stack: err.stack });
  }
};

/**
 * Créer une sortie de stock
 */
const createSortieStock = async (req, res) => {
  try {
    const { details, description } = req.body;
    const utilisateurId = req.user?.id || 1; // Récupérer depuis le token d'authentification

    if (!Array.isArray(details) || details.length === 0) {
      return res.status(400).json({
        message: 'details (tableau non vide) est requis'
      });
    }

    const result = await stockService.createSortieStock(details, description, utilisateurId);
    res.status(201).json(result);
  } catch (err) {
    console.error('[createSortieStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Créer un inventaire
 */
const createInventaire = async (req, res) => {
  try {
    const { inventaireData, description } = req.body;
    const utilisateurId = req.user?.id || 1; // Récupérer depuis le token d'authentification

    if (!Array.isArray(inventaireData) || inventaireData.length === 0) {
      return res.status(400).json({
        message: 'inventaireData (tableau non vide) est requis'
      });
    }

    const result = await stockService.createInventaire(inventaireData, description, utilisateurId);
    res.status(201).json(result);
  } catch (err) {
    console.error('[createInventaire] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Créer un en-tête d'inventaire (type=20)
 */
const createInventaireHeader = async (req, res) => {
  try {
    const { description } = req.body;
    const utilisateurId = req.user?.id || 1;
    const sequelize = req.sequelize || require('../config/database').getConnection();

    const stockDocumentModel = require('../models/stock/stock-document.model');
    const stockDocResult = await stockDocumentModel.createStockDocument({
      type: 20, // Type 20 pour inventaire
      description: description || 'Inventaire de stock',
      reference_source: null,
      id_source: null,
      utilisateur_id: utilisateurId
    }, sequelize);

    res.status(201).json({
      success: true,
      id: stockDocResult.id,
      document_id: stockDocResult.id,
      numero: stockDocResult.numero,
      message: 'En-tête d\'inventaire créé avec succès'
    });
  } catch (err) {
    console.error('[createInventaireHeader] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer un inventaire par ID
 */
const getInventaireById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sequelize = req.sequelize || require('../config/database').getConnection();

    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID d\'inventaire invalide'
      });
    }

    // Récupérer l'en-tête
    const [header] = await sequelize.query(
      'SELECT * FROM stock_document WHERE id = :id AND type = 20',
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!header) {
      return res.status(404).json({
        success: false,
        message: 'Inventaire non trouvé'
      });
    }

    // Récupérer les lignes avec les informations des articles
    const lignes = await sequelize.query(
      `SELECT 
        sdd.*,
        a.article_cod,
        a.article_nom
      FROM stock_document_detail sdd
      INNER JOIN article a ON a.article_id = sdd.article_id
      WHERE sdd.stock_id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      data: {
        ...header,
        lignes: lignes || []
      }
    });
  } catch (err) {
    console.error('[getInventaireById] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération de l\'inventaire'
    });
  }
};

/**
 * Récupérer les données de v_stock_calcul
 */
const getStockCalculData = async (req, res) => {
  try {
    const sequelize = req.sequelize || require('../config/database').getConnection();

    const data = await sequelize.query(
      'SELECT * FROM v_stock_calcul',
      {
        type: sequelize.QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      data: data || []
    });
  } catch (err) {
    console.error('[getStockCalculData] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération des données de stock'
    });
  }
};

/**
 * Récupérer l'historique depuis v_stock_final
 */
const getStockHistorique = async (req, res) => {
  try {
    const sequelize = req.sequelize || require('../config/database').getConnection();
    const { article_nom, dateFrom, dateTo, status, page = 1, pageSize = 25 } = req.query;

    // Construction de la requête WHERE
    let whereConditions = [];
    let replacements = {};

    if (article_nom) {
      whereConditions.push('article_nom LIKE :article_nom');
      replacements.article_nom = `%${article_nom}%`;
    }

    if (dateFrom) {
      whereConditions.push('CONVERT(DATE, date) >= CONVERT(DATE, :dateFrom)');
      replacements.dateFrom = dateFrom;
    }

    if (dateTo) {
      whereConditions.push('CONVERT(DATE, date) <= CONVERT(DATE, :dateTo)');
      replacements.dateTo = dateTo;
    }

    if (status) {
      // Si status est "Entrée" ou "Sortie", filtrer par quantité au lieu de status
      if (status === 'Entrée') {
        whereConditions.push('quantite > 0');
      } else if (status === 'Sortie') {
        whereConditions.push('quantite < 0');
      } else {
        // Pour "Inventory", filtrer par status exact
        whereConditions.push('status = :status');
        replacements.status = status;
      }
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Requête pour le total
    const countQuery = `SELECT COUNT(*) as total FROM v_stock_final ${whereClause}`;
    const countResult = await sequelize.query(countQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });
    const total = countResult[0]?.total || 0;

    // Requête principale avec pagination
    const offset = (page - 1) * pageSize;
    const query = `
      SELECT * FROM v_stock_final 
      ${whereClause}
      ORDER BY date DESC
      OFFSET :offset ROWS
      FETCH NEXT :pageSize ROWS ONLY
    `;

    replacements.offset = offset;
    replacements.pageSize = parseInt(pageSize);

    const data = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (err) {
    console.error('[getStockHistorique] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération de l\'historique'
    });
  }
};

/**
 * Exporter l'historique en PDF
 */
const exportStockHistoriquePDF = async (req, res) => {
  try {
    const sequelize = req.sequelize || require('../config/database').getConnection();
    const { article_nom, dateFrom, dateTo, status } = req.query;

    // Récupérer documentSociete si disponible
    let documentSociete = null;
    if (req.user && req.user.societe_id) {
      try {
        const documentSocieteService = require('../services/document-societe.service');
        documentSociete = await documentSocieteService.getDocumentSociete(req.user.societe_id);
      } catch (error) {
        console.error('[exportStockHistoriquePDF] Erreur récupération document société (non bloquant):', error.message);
      }
    }

    // Construction de la requête WHERE (sans pagination pour le PDF)
    let whereConditions = [];
    let replacements = {};

    if (article_nom) {
      whereConditions.push('article_nom LIKE :article_nom');
      replacements.article_nom = `%${article_nom}%`;
    }

    if (dateFrom) {
      whereConditions.push('CONVERT(DATE, date) >= CONVERT(DATE, :dateFrom)');
      replacements.dateFrom = dateFrom;
    }

    if (dateTo) {
      whereConditions.push('CONVERT(DATE, date) <= CONVERT(DATE, :dateTo)');
      replacements.dateTo = dateTo;
    }

    if (status) {
      // Si status est "Entrée" ou "Sortie", filtrer par quantité au lieu de status
      if (status === 'Entrée') {
        whereConditions.push('quantite > 0');
      } else if (status === 'Sortie') {
        whereConditions.push('quantite < 0');
      } else {
        // Pour "Inventory", filtrer par status exact
        whereConditions.push('status = :status');
        replacements.status = status;
      }
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Requête pour récupérer toutes les données (sans pagination)
    const query = `
      SELECT * FROM v_stock_final 
      ${whereClause}
      ORDER BY date DESC
    `;

    const data = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aucune donnée à exporter'
      });
    }

    // Générer le PDF
    const stockHistoriquePdfService = require('../services/stock/stock-historique-pdf.service');
    const pdfPath = await stockHistoriquePdfService.genererPDF(data, {
      dateFrom,
      dateTo,
      status,
      documentSociete
    });

    // Retourner l'URL du PDF
    const path = require('path');
    const fileName = path.basename(pdfPath);
    const pdfUrl = `http://localhost:3500/stock-historique/${fileName}`;

    res.json({
      success: true,
      pdfUrl,
      fileName,
      message: 'PDF généré avec succès'
    });
  } catch (err) {
    console.error('[exportStockHistoriquePDF] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la génération du PDF'
    });
  }
};

/**
 * Exporter l'historique en Excel
 */
const exportStockHistoriqueExcel = async (req, res) => {
  try {
    const sequelize = req.sequelize || require('../config/database').getConnection();
    const { article_nom, dateFrom, dateTo, status } = req.query;

    // Construction de la requête WHERE
    let whereConditions = [];
    let replacements = {};

    if (article_nom) {
      whereConditions.push('article_nom LIKE :article_nom');
      replacements.article_nom = `%${article_nom}%`;
    }

    if (dateFrom) {
      whereConditions.push('CONVERT(DATE, date) >= CONVERT(DATE, :dateFrom)');
      replacements.dateFrom = dateFrom;
    }

    if (dateTo) {
      whereConditions.push('CONVERT(DATE, date) <= CONVERT(DATE, :dateTo)');
      replacements.dateTo = dateTo;
    }

    if (status) {
      // Si status est "Entrée" ou "Sortie", filtrer par quantité au lieu de status
      if (status === 'Entrée') {
        whereConditions.push('quantite > 0');
      } else if (status === 'Sortie') {
        whereConditions.push('quantite < 0');
      } else {
        // Pour "Inventory", filtrer par status exact
        whereConditions.push('status = :status');
        replacements.status = status;
      }
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Requête pour récupérer toutes les données
    const query = `
      SELECT * FROM v_stock_final 
      ${whereClause}
      ORDER BY date DESC
    `;

    const data = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aucune donnée à exporter'
      });
    }

    // Préparer les données CSV
    const headers = ['Code Article', 'Nom Article', 'Date', 'Quantité', 'Mouvement', 'Status'];
    const csvData = [
      headers,
      ...data.map(item => [
        item.article_cod || '',
        item.article_nom || '',
        item.date ? new Date(item.date).toLocaleDateString('fr-FR') : '',
        item.quantite || 0,
        item.mouvement || '',
        item.status || ''
      ])
    ];

    const csvContent = csvData.map(row =>
      row.map(cell => {
        if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="historique-stock-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send('\ufeff' + csvContent); // BOM pour Excel
  } catch (err) {
    console.error('[exportStockHistoriqueExcel] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de l\'export Excel'
    });
  }
};

/**
 * Vider toutes les lignes d'inventaire
 */
const viderInventaireLignes = async (req, res) => {
  try {
    const inventaireId = parseInt(req.params.id, 10);
    const sequelize = req.sequelize || require('../config/database').getConnection();

    if (isNaN(inventaireId) || inventaireId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID d\'inventaire invalide'
      });
    }

    await sequelize.query(
      'DELETE FROM stock_document_detail WHERE stock_id = :id',
      {
        replacements: { id: inventaireId },
        type: sequelize.QueryTypes.DELETE
      }
    );

    res.json({
      success: true,
      message: 'Toutes les lignes ont été supprimées'
    });
  } catch (err) {
    console.error('[viderInventaireLignes] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la suppression des lignes'
    });
  }
};

/**
 * Enregistrer les lignes d'inventaire
 */
const saveInventaireLignes = async (req, res) => {
  try {
    const { lignes } = req.body;
    const inventaireId = parseInt(req.params.id, 10);
    const sequelize = req.sequelize || require('../config/database').getConnection();

    if (isNaN(inventaireId) || inventaireId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID d\'inventaire invalide'
      });
    }

    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tableau de lignes requis'
      });
    }

    const stockDocumentModel = require('../models/stock/stock-document.model');

    // Supprimer les anciennes lignes
    await sequelize.query(
      'DELETE FROM stock_document_detail WHERE stock_id = :id',
      {
        replacements: { id: inventaireId },
        type: sequelize.QueryTypes.DELETE
      }
    );

    // Ajouter les nouvelles lignes
    const detailsWithSens = lignes.map(ligne => ({
      ...ligne,
      sens: 0 // Inventaire = neutre
    }));

    await stockDocumentModel.addStockDocumentDetails(inventaireId, detailsWithSens, sequelize);

    res.json({
      success: true,
      message: `${lignes.length} ligne(s) enregistrée(s) avec succès`
    });
  } catch (err) {
    console.error('[saveInventaireLignes] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de l\'enregistrement des lignes'
    });
  }
};

/**
 * Valider l'inventaire et comparer avec le stock réel
 */
const validerInventaire = async (req, res) => {
  try {
    const inventaireId = parseInt(req.params.id, 10);
    const sequelize = req.sequelize || require('../config/database').getConnection();

    if (isNaN(inventaireId) || inventaireId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID d\'inventaire invalide'
      });
    }

    // Récupérer le stock physique (lignes de l'inventaire)
    const stockPhysique = await sequelize.query(
      `SELECT 
        sdd.article_id,
        a.article_cod,
        a.article_nom,
        sdd.quantite AS stock_physique
      FROM stock_document_detail sdd
      INNER JOIN article a ON a.article_id = sdd.article_id
      WHERE sdd.stock_id = :id`,
      {
        replacements: { id: inventaireId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    // Récupérer le stock réel du système
    // Essayer d'abord v_stock_calcul, sinon calculer directement
    let stockReel = [];
    try {
      stockReel = await sequelize.query(
        'SELECT * FROM v_stock_calcul',
        {
          type: sequelize.QueryTypes.SELECT
        }
      );
    } catch (viewError) {
      // Si la vue n'existe pas, calculer le stock réel directement
      console.log('[validerInventaire] Vue v_stock_calcul non trouvée, calcul direct du stock');
      stockReel = await sequelize.query(
        `SELECT 
          sdd.article_id,
          a.article_cod,
          a.article_nom,
          ISNULL(SUM(sdd.quantite * sdd.sens), 0) AS stock_actuel
        FROM article a
        LEFT JOIN stock_document_detail sdd ON sdd.article_id = a.article_id
        LEFT JOIN stock_document sd ON sd.id = sdd.stock_id AND sd.etat = 1
        WHERE a.article_id IN (SELECT DISTINCT article_id FROM stock_document_detail WHERE stock_id = :inventaireId)
        GROUP BY sdd.article_id, a.article_cod, a.article_nom`,
        {
          replacements: { inventaireId },
          type: sequelize.QueryTypes.SELECT
        }
      );
    }

    // Créer un map pour faciliter la comparaison
    const stockReelMap = new Map();
    stockReel.forEach(item => {
      const articleId = item.article_id;
      const stockActuel = parseFloat(item.stock_actuel || item.stock_disponible || 0) || 0;
      stockReelMap.set(articleId, stockActuel);
    });

    // Comparer et créer le résultat
    // Inclure TOUS les articles de l'inventaire physique
    const comparaison = stockPhysique.map(item => {
      const stockReelValue = stockReelMap.get(item.article_id) || 0;
      const stockPhysiqueValue = parseFloat(item.stock_physique) || 0;
      const ecart = stockPhysiqueValue - stockReelValue;

      return {
        article_id: item.article_id,
        article_cod: item.article_cod,
        article_nom: item.article_nom,
        stock_physique: stockPhysiqueValue,
        stock_reel: stockReelValue,
        ecart: ecart
      };
    });

    // Ajouter aussi les articles qui sont dans le stock réel mais pas dans l'inventaire physique
    stockReel.forEach(item => {
      const articleId = item.article_id;
      const existsInPhysique = stockPhysique.some(p => p.article_id === articleId);
      if (!existsInPhysique) {
        const stockReelValue = parseFloat(item.stock_actuel || item.stock_disponible || 0) || 0;
        comparaison.push({
          article_id: articleId,
          article_cod: item.article_cod || '',
          article_nom: item.article_nom || '',
          stock_physique: 0,
          stock_reel: stockReelValue,
          ecart: -stockReelValue
        });
      }
    });

    res.json({
      success: true,
      data: comparaison
    });
  } catch (err) {
    console.error('[validerInventaire] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la validation de l\'inventaire'
    });
  }
};

/**
 * Mettre à jour la date d'un inventaire
 */
const updateInventaireDate = async (req, res) => {
  try {
    const inventaireId = parseInt(req.params.id, 10);
    const { date } = req.body;
    const sequelize = req.sequelize || require('../config/database').getConnection();

    if (isNaN(inventaireId) || inventaireId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID d\'inventaire invalide'
      });
    }

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date requise'
      });
    }

    // Vérifier que l'inventaire existe
    const [header] = await sequelize.query(
      'SELECT * FROM stock_document WHERE id = :id AND type = 20',
      {
        replacements: { id: inventaireId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!header) {
      return res.status(404).json({
        success: false,
        message: 'Inventaire non trouvé'
      });
    }

    const formattedDate = date.replace('T', ' ') + ':00';
    // Mettre à jour la date
    await sequelize.query(
      'UPDATE stock_document SET date = :formattedDate WHERE id = :id',
      {
        replacements: { id: inventaireId, formattedDate },
        type: sequelize.QueryTypes.UPDATE
      }
    );

    res.json({
      success: true,
      message: 'Date mise à jour avec succès'
    });
  } catch (err) {
    console.error('[updateInventaireDate] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la mise à jour de la date'
    });
  }
};

/**
 * Validation finale de l'inventaire - Mettre etat = 1
 */
const validationFinaleInventaire = async (req, res) => {
  try {
    const inventaireId = parseInt(req.params.id, 10);
    const sequelize = req.sequelize || require('../config/database').getConnection();

    if (isNaN(inventaireId) || inventaireId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID d\'inventaire invalide'
      });
    }

    // Vérifier que l'inventaire existe
    const [header] = await sequelize.query(
      'SELECT * FROM stock_document WHERE id = :id AND type = 20',
      {
        replacements: { id: inventaireId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!header) {
      return res.status(404).json({
        success: false,
        message: 'Inventaire non trouvé'
      });
    }

    // Mettre à jour l'état
    await sequelize.query(
      'UPDATE stock_document SET etat = 1 WHERE id = :id',
      {
        replacements: { id: inventaireId },
        type: sequelize.QueryTypes.UPDATE
      }
    );

    res.json({
      success: true,
      message: 'Inventaire validé avec succès (Inventaire définitif)'
    });
  } catch (err) {
    console.error('[validationFinaleInventaire] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la validation finale de l\'inventaire'
    });
  }
};

/**
 * Exporter l'état de stock
 */
const exportEtatStock = async (req, res) => {
  try {
    const format = req.params.format?.toLowerCase();
    if (!['pdf', 'excel'].includes(format)) {
      return res.status(400).json({ message: 'Format non supporté. Utilisez pdf ou excel.' });
    }

    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 10000, // Grande page pour export complet
      orderBy: req.query.orderBy || 'date',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || ''
    };

    const result = await stockService.getEtatStock(options);

    if (format === 'excel') {
      return exportEtatStockExcel(result.data, res);
    } else {
      return exportEtatStockPDF(result.data, res);
    }
  } catch (err) {
    console.error('[exportEtatStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Exporter la fiche de stock
 */
const exportFicheStock = async (req, res) => {
  try {
    const format = req.params.format?.toLowerCase();
    if (!['pdf', 'excel'].includes(format)) {
      return res.status(400).json({ message: 'Format non supporté. Utilisez pdf ou excel.' });
    }

    const articleIdParam = req.params.articleId;
    let articleId = null;
    if (articleIdParam && articleIdParam !== '0') {
      const parsedId = parseInt(articleIdParam, 10);
      if (!isNaN(parsedId) && parsedId > 0) {
        articleId = parsedId;
      }
    }

    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 10000, // Grande page pour export complet
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
      article_nom: req.query.article_nom || null
    };

    const result = await stockService.getFicheStock(articleId, options);

    if (format === 'excel') {
      return exportFicheStockExcel(result.article, result.mouvements, res);
    } else {
      return exportFicheStockPDF(result.article, result.mouvements, res);
    }
  } catch (err) {
    console.error('[exportFicheStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Exporter le chiffre d'affaires par article
 */
const exportChiffreAffairesArticles = async (req, res) => {
  try {
    const format = req.params.format?.toLowerCase();
    if (!['pdf', 'excel'].includes(format)) {
      return res.status(400).json({ message: 'Format non supporté. Utilisez pdf ou excel.' });
    }

    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 10000, // Grande page pour export complet
      orderBy: req.query.orderBy || 'ca',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || ''
    };

    const result = await stockService.getChiffreAffairesArticles(options);

    if (format === 'excel') {
      return exportChiffreAffairesExcel(result.data, res);
    } else {
      return exportChiffreAffairesPDF(result.data, res);
    }
  } catch (err) {
    console.error('[exportChiffreAffairesArticles] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

// Fonctions d'export Excel (utilisent un format CSV simple)
function exportEtatStockExcel(data, res) {
  const headers = ['Date', 'Code Article', 'Nom Article', 'Quantité', 'Prix Achat', 'Prix Vente', 'Mouvement'];

  const csvData = [
    headers,
    ...data.map(item => [
      item.date ? new Date(item.date).toLocaleDateString('fr-FR') : '',
      item.article_cod || '',
      item.article_nom || '',
      item.quantite || 0,
      item.prix_achat || 0,
      item.prix_vente || 0,
      item.mouvement || ''
    ])
  ];

  const csvContent = csvData.map(row =>
    row.map(cell => {
      if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="etat-stock-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send('\ufeff' + csvContent); // BOM pour Excel
}

function exportFicheStockExcel(articleInfo, mouvements, res) {
  const headers = ['Dépôt', 'Date', 'Code Article', 'Nom Article', 'Type', 'Numéro', 'Tiers', 'Entrée', 'Sortie', 'Solde'];

  const csvData = [
    headers,
    ...mouvements.map(item => [
      item.depot || '',
      item.date ? new Date(item.date).toLocaleDateString('fr-FR') : '',
      item.article_cod || '',
      item.article_nom || '',
      item.type || '',
      item.numero || '',
      item.tiers || '',
      item.entree || 0,
      item.sortie || 0,
      item.solde || 0
    ])
  ];

  const csvContent = csvData.map(row =>
    row.map(cell => {
      if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  const filename = articleInfo && articleInfo.article_cod ? `fiche-stock-${articleInfo.article_cod}-${new Date().toISOString().split('T')[0]}.csv` : `fiche-stock-${new Date().toISOString().split('T')[0]}.csv`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\ufeff' + csvContent);
}

function exportChiffreAffairesExcel(data, res) {
  const headers = ['Code Article', 'Nom Article', 'Qté Vendue', 'Chiffre d\'Affaires'];

  const csvData = [
    headers,
    ...data.map(item => [
      item.article_cod || '',
      item.article_nom || '',
      item.quantite_vendue || 0,
      item.ca || 0
    ])
  ];

  const csvContent = csvData.map(row =>
    row.map(cell => {
      if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="chiffre-affaires-articles-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send('\ufeff' + csvContent);
}

// Fonctions d'export PDF (génèrent du HTML imprimable)
function exportEtatStockPDF(data, res) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>État de Stock</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #007bff; text-align: center; margin-bottom: 30px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .text-end { text-align: right; }
        .badge { padding: 2px 6px; border-radius: 3px; font-size: 0.8em; }
        .bg-success { background-color: #d1edff; color: #0d6efd; }
        .bg-warning { background-color: #fff3cd; color: #856404; }
        .bg-danger { background-color: #f8d7da; color: #721c24; }
        @page { margin: 1cm; }
      </style>
    </head>
    <body>
      <h1>État de Stock - ${new Date().toLocaleDateString('fr-FR')}</h1>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Code Article</th>
            <th>Nom Article</th>
            <th class="text-end">Quantité</th>
            <th class="text-end">Prix Achat</th>
            <th class="text-end">Prix Vente</th>
            <th>Mouvement</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(item => `
            <tr>
              <td>${item.date ? new Date(item.date).toLocaleDateString('fr-FR') : ''}</td>
              <td>${item.article_cod || ''}</td>
              <td>${item.article_nom || ''}</td>
              <td class="text-end"><strong>${Number(item.quantite || 0).toFixed(2)}</strong></td>
              <td class="text-end">${Number(item.prix_achat || 0).toFixed(2)} dh</td>
              <td class="text-end">${Number(item.prix_vente || 0).toFixed(2)} dh</td>
              <td>${item.mouvement || ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="etat-stock-${new Date().toISOString().split('T')[0]}.html"`);
  res.send(htmlContent);
}

function exportFicheStockPDF(articleInfo, mouvements, res) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Fiche de Stock</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #007bff; text-align: center; margin-bottom: 30px; }
        .article-info { background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 11px; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .text-end { text-align: right; }
        .text-success { color: #198754; font-weight: bold; }
        .text-danger { color: #dc3545; font-weight: bold; }
        @page { margin: 1cm; }
      </style>
    </head>
    <body>
      <h1>Fiche de Stock - ${new Date().toLocaleDateString('fr-FR')}</h1>
      ${articleInfo ? `
      <div class="article-info">
        <h3>${articleInfo.article_cod || ''} - ${articleInfo.article_nom || ''}</h3>
        <p><strong>Stock actuel:</strong> ${Number(articleInfo.stock_actuel || 0).toFixed(2)}</p>
        <p><strong>Catégorie:</strong> ${articleInfo.categorie_nom || '-'}</p>
        <p><strong>Unité:</strong> ${articleInfo.unite_nom || '-'}</p>
        <p><strong>Total mouvements:</strong> ${mouvements.length}</p>
      </div>
      ` : ''}
      <table>
        <thead>
          <tr>
            <th>Dépôt</th>
            <th>Date</th>
            <th>Code Article</th>
            <th>Nom Article</th>
            <th>Type</th>
            <th>Numéro</th>
            <th>Tiers</th>
            <th class="text-end">Entrée</th>
            <th class="text-end">Sortie</th>
            <th class="text-end">Solde</th>
          </tr>
        </thead>
        <tbody>
          ${mouvements.map(item => `
            <tr>
              <td>${item.depot || '-'}</td>
              <td>${item.date ? new Date(item.date).toLocaleDateString('fr-FR') : ''}</td>
              <td>${item.article_cod || ''}</td>
              <td>${item.article_nom || ''}</td>
              <td>${item.type || '-'}</td>
              <td>${item.numero || '-'}</td>
              <td>${item.tiers || '-'}</td>
              <td class="text-end text-success">${item.entree > 0 ? Number(item.entree).toFixed(2) : '-'}</td>
              <td class="text-end text-danger">${item.sortie > 0 ? Number(item.sortie).toFixed(2) : '-'}</td>
              <td class="text-end"><strong>${Number(item.solde || 0).toFixed(2)}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const filename = articleInfo && articleInfo.article_cod ? `fiche-stock-${articleInfo.article_cod}-${new Date().toISOString().split('T')[0]}.html` : `fiche-stock-${new Date().toISOString().split('T')[0]}.html`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(htmlContent);
}

function exportChiffreAffairesPDF(data, res) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Chiffre d'Affaires par Article</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #007bff; text-align: center; margin-bottom: 30px; }
        .periode { text-align: center; color: #6c757d; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .text-end { text-align: right; }
        .badge { padding: 2px 6px; border-radius: 3px; font-size: 0.8em; }
        .bg-success { background-color: #d1edff; color: #0d6efd; }
        .bg-warning { background-color: #fff3cd; color: #856404; }
        .bg-danger { background-color: #f8d7da; color: #721c24; }
        @page { margin: 1cm; }
      </style>
    </head>
    <body>
      <h1>Chiffre d'Affaires par Article</h1>
      <div class="periode">Généré le ${new Date().toLocaleDateString('fr-FR')}</div>
      <table>
        <thead>
          <tr>
            <th>Code Article</th>
            <th>Nom Article</th>
            <th class="text-end">Qté Vendue</th>
            <th class="text-end">Chiffre d'Affaires</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(article => `
            <tr>
              <td>${article.article_cod || ''}</td>
              <td>${article.article_nom || ''}</td>
              <td class="text-end">${Number(article.quantite_vendue || 0).toFixed(2)}</td>
              <td class="text-end"><strong>${Number(article.ca || 0).toFixed(2)} dh</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="chiffre-affaires-articles-${new Date().toISOString().split('T')[0]}.html"`);
  res.send(htmlContent);
}

module.exports = {
  getAchatsNonEntresStock,
  getAchatDetailsForStock,
  getVentesNonSortiesStock,
  getVenteDetailsForStock,
  getArticlesStock,
  getEtatStock,
  getFicheStock,
  getChiffreAffairesArticles,
  exportEtatStock,
  exportFicheStock,
  exportChiffreAffairesArticles,
  getAllStockDocuments,
  getStockDocumentById,
  createEntreeStockFromAchat,
  createSortieStockFromVente,
  createSortieStock,
  createInventaire,
  createInventaireHeader,
  getInventaireById,
  getStockCalculData,
  getStockHistorique,
  exportStockHistoriquePDF,
  exportStockHistoriqueExcel,
  saveInventaireLignes,
  viderInventaireLignes,
  updateInventaireDate,
  validerInventaire,
  validationFinaleInventaire
};

