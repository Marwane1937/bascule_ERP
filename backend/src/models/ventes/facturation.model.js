const { getConnection } = require('../../config/database');

// Récupérer toutes les factures avec pagination depuis la vue v_facture
// Optimisé avec COUNT(*) OVER() pour éviter une requête séparée de comptage
const getAllFactures = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'facture_dat',
      orderDirection = 'DESC',
      search = ''
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['facture_id', 'facture_num', 'facture_dat', 'nom', 'facture_ht', 'facture_tva'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'facture_dat';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = '';
    const replacements = {};

    if (search && search.trim()) {
      whereClause = `WHERE (
        facture_num LIKE :search 
        OR nom LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    // Requête unique avec COUNT(*) OVER() pour obtenir le total sans requête séparée
    const query = `
      SELECT 
        facture_id,
        facture_num,
        facture_dat,
        nom,
        part_id,
        facture_ht,
        facture_tva,
        total_count
      FROM (
        SELECT 
          v.facture_id,
          v.facture_num,
          v.facture_dat,
          v.nom,
          fs.part_id,
          v.facture_ht,
          v.facture_tva,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${safeOrderBy} ${safeOrderDirection}) AS RowNum
        FROM v_facture v
        LEFT JOIN facture_souche fs ON fs.facture_id = v.facture_id
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
      console.error('[getAllFactures] Erreur:', dataError.message);
      throw new Error(`Erreur lors de la récupération des factures: ${dataError.message || 'Erreur inconnue'}`);
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
    console.error('[getAllFactures] Erreur:', error.message);

    if (error.message && (error.message.includes('v_facture') || error.message.includes('Invalid object name'))) {
      throw new Error(`La vue v_facture n'est pas accessible. Veuillez vérifier que la vue existe dans la base de données.`);
    }

    throw error;
  }
};

// Récupérer toutes les factures sans pagination (pour compatibilité et fallback)
// Utilise la vue v_facture directement
const getAllFacturesNoPagination = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `SELECT 
      v.facture_id,
      v.facture_num,
      v.facture_dat,
      v.nom,
      fs.part_id,
      v.facture_ht,
      v.facture_tva
    FROM v_facture v
    LEFT JOIN facture_souche fs ON fs.facture_id = v.facture_id
    ORDER BY v.facture_num DESC`;

    const [results] = await sequelize.query(query);

    if (!Array.isArray(results)) {
      console.error('[getAllFacturesNoPagination] Résultats n\'est pas un tableau!', results);
      return [];
    }

    return results || [];
  } catch (error) {
    console.error('[getAllFacturesNoPagination] Erreur:', error);
    throw error;
  }
};

// Récupérer une facture par ID depuis la vue v_facture (plus fiable)
const getFactureById = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `
      SELECT v.*, fs.part_id 
      FROM v_facture v
      LEFT JOIN facture_souche fs ON fs.facture_id = v.facture_id
      WHERE v.facture_id = :id
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
    console.error('[getFactureById] Erreur:', error);
    throw error;
  }
};

// Récupérer le rapport de facturation avec les détails des articles
const getFacturationReport = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const { factureId } = options;

    // Construire la requête de base
    let query = `
      SELECT 
        fr.facture_id,
        fr.numero,
        fr.date,
        fr.numero_livraison,
        a.article_cod,
        a.article_nom,
        fr.quantite,
        fr.prix,
        fr.total_ht,
        fr.total_tva,
        fr.total_ttc,
        fr.nom_client
      FROM v_facture_report fr
      INNER JOIN article a ON a.article_id = fr.article_id
    `;

    const replacements = {};

    // Ajouter un filtre par facture_id si fourni
    if (factureId) {
      query += ` WHERE fr.facture_id = :factureId`;
      replacements.factureId = factureId;
    }

    // Ajouter un ORDER BY pour un ordre cohérent
    query += ` ORDER BY fr.facture_id, fr.numero, a.article_cod`;


    const [results] = await sequelize.query(query, {
      replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
      type: sequelize.QueryTypes.SELECT
    });

    // Gérer le format de retour de Sequelize
    let dataArray = [];
    if (Array.isArray(results)) {
      dataArray = results;
    } else if (results) {
      dataArray = [results];
    }


    return dataArray;
  } catch (error) {
    console.error('[getFacturationReport] ❌ Erreur:', error);
    throw error;
  }
};

// Récupérer le rapport de facturation par ID pour la génération PDF
// Retourne les données au format attendu par le générateur PDF (comme getEmailDataByDocumentId)
// Les factures sont créées depuis les livraisons (stock), donc les détails sont dans stock_detail
const getFactureReportById = async (factureId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    // D'abord, récupérer les informations de base de la facture
    const factureInfoQuery = `
      SELECT  
        f.facture_id, 
        f.facture_num AS numero, 
        f.facture_dat AS date, 
        fs.part_id, 
        p.nom AS nom_client, 
        pi.identifiant AS ice, 
        a.nom AS adresse, 
        v.nom AS ville, 
        s.numero AS numero_livraison 
      FROM facture f 
      INNER JOIN facture_souche fs ON fs.facture_id = f.facture_id 
      LEFT JOIN partenaire p ON p.part_id = fs.part_id 
      LEFT JOIN partenaire_identifiant pi ON pi.part_id = p.part_id AND pi.identifiant_type = 8
      LEFT JOIN adresse a ON a.part_id = p.part_id
      LEFT JOIN ville v ON v.id = a.ville
      LEFT JOIN stock s ON s.id = f.facture_id 
      WHERE f.facture_id = :factureId
    `;

    const [factureInfo] = await sequelize.query(factureInfoQuery, {
      replacements: { factureId },
      type: sequelize.QueryTypes.SELECT
    });

    if (!factureInfo || (Array.isArray(factureInfo) && factureInfo.length === 0)) {
      console.warn('[getFactureReportById] ⚠️ Facture non trouvée:', factureId);
      return null;
    }

    const facture = Array.isArray(factureInfo) ? factureInfo[0] : factureInfo;

    // Récupérer les détails depuis stock_detail (car facture_id = stock_id)
    // Les factures sont créées depuis les livraisons, donc stock_id = facture_id
    const detailsQuery = `
      SELECT 
        :factureId AS document_id,
        :numero AS numero,
        :date AS date,
        '' AS client_ref,
        :factureId AS etat,
        4 AS type,
        'FACTURE' AS document_kind,
        :part_id AS part_id,
        :nom_client AS client,
        '' AS commercial,
        ISNULL(a.article_cod, '') AS article_cod,
        ISNULL(sd.description, '') AS designation,
        ISNULL(a.article_nom, '') AS article_nom,
        sd.quantite,
        sd.prix,
        ISNULL(a.article_nom, '') AS article,
        ISNULL(sd.taux_tva, 0) AS taux_tva,
        ISNULL(sd.remise, 0) AS remise,
        ISNULL(sd.remise_montant, 0) AS remise_montant,
        '' AS condition,
        '' AS expedition,
        '' AS transporteur,
        :adresse AS adresse,
        :ville AS ville,
        :ice AS ice,
        sd.id AS ligne_id,
        (sd.quantite * sd.prix) AS total_ht,
        (sd.quantite * sd.prix * ISNULL(sd.taux_tva, 0)) AS total_tva,
        (sd.quantite * sd.prix * (1 + ISNULL(sd.taux_tva, 0))) AS total_ttc,
        :numero_livraison AS numero_livraison
      FROM stock_detail sd
      LEFT JOIN article a ON a.article_id = sd.article_id
      WHERE sd.stock_id = :factureId
      ORDER BY sd.id
    `;

    // Préparer les replacements avec gestion des valeurs null/undefined
    const replacements = {
      factureId: factureId,
      numero: facture.numero || '',
      date: facture.date || null,
      part_id: facture.part_id || null,
      nom_client: facture.nom_client || facture.nom || '',
      numero_livraison: facture.numero_livraison || '',
      adresse: (facture.adresse || '').substring(0, 200), // Limiter la longueur
      ville: facture.ville || '',
      ice: facture.ice || ''
    };

    console.log('[getFactureReportById] 📋 Informations facture récupérées:', {
      facture_id: facture.facture_id,
      numero: replacements.numero,
      nom_client: replacements.nom_client,
      ice: replacements.ice,
      adresse: replacements.adresse,
      ville: replacements.ville
    });

    // Afficher la requête SQL complète pour déboguer
    console.log('[getFactureReportById] 📋 Requête SQL pour récupérer les détails de facture:');
    console.log(detailsQuery);
    console.log('[getFactureReportById] 📋 Paramètres:', JSON.stringify(replacements, null, 2));

    const results = await sequelize.query(detailsQuery, {
      replacements: replacements,
      type: sequelize.QueryTypes.SELECT
    });

    // Afficher les premières lignes pour vérifier remise_montant
    if (results && results.length > 0) {
      console.log('[getFactureReportById] ✅ Résultats récupérés:', results.length, 'ligne(s)');
      console.log('[getFactureReportById] 📊 Première ligne (exemple):', {
        article_cod: results[0].article_cod,
        quantite: results[0].quantite,
        prix: results[0].prix,
        remise: results[0].remise,
        remise_montant: results[0].remise_montant,
        total_ht: results[0].total_ht
      });
    }


    // Gérer le format de retour de Sequelize pour SQL Server
    // Sequelize avec SQL Server peut retourner [results, metadata] ou directement results
    let dataArray = [];

    if (Array.isArray(results)) {
      // Si c'est un tableau, vérifier si c'est [results, metadata] ou directement les résultats
      if (results.length === 2 && Array.isArray(results[0]) && !Array.isArray(results[1])) {
        // Format [results, metadata]
        dataArray = results[0];
      } else if (results.length > 0 && typeof results[0] === 'object' && results[0] !== null) {
        // Format direct tableau de résultats
        dataArray = results;
      } else {
        // Format inattendu, essayer de récupérer les résultats
        dataArray = results;
      }
    } else if (results && typeof results === 'object') {
      // Un seul objet
      dataArray = [results];
    }

    if (dataArray.length > 0) {
      if (dataArray.length > 1) {
      }
    } else {
      console.warn('[getFactureReportById] ⚠️ Aucun détail trouvé dans stock_detail pour stock_id:', factureId);
    }

    return dataArray.length > 0 ? dataArray : null;
  } catch (error) {
    console.error('[getFactureReportById] ❌ Erreur:', error);
    console.error('[getFactureReportById] ❌ Stack:', error.stack);
    throw error;
  }
};

// Récupérer les montants HT et TVA d'une facture depuis v_facture_montant
const getFactureMontant = async (factureId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `
      SELECT 
        total_ht,
        total_tva
      FROM v_facture_montant
      WHERE facture_id = :factureId
    `;

    const [results] = await sequelize.query(query, {
      replacements: { factureId },
      type: sequelize.QueryTypes.SELECT
    });

    if (Array.isArray(results) && results.length > 0) {
      return results[0];
    } else if (results && typeof results === 'object') {
      return results;
    }

    return { total_ht: 0, total_tva: 0 };
  } catch (error) {
    console.error('[getFactureMontant] Erreur:', error);
    throw error;
  }
};

// Récupérer les données d'une facture contrat depuis v_facture_contrat
const getFactureContratById = async (factureId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `
      SELECT * 
      FROM v_facture_contrat 
      WHERE facture_id = :factureId
      ORDER BY facture_id
    `;

    const results = await sequelize.query(query, {
      replacements: { factureId },
      type: sequelize.QueryTypes.SELECT
    });

    // Gérer le format de retour de Sequelize pour SQL Server
    let dataArray = [];
    if (Array.isArray(results)) {
      if (results.length === 2 && Array.isArray(results[0]) && !Array.isArray(results[1])) {
        dataArray = results[0];
      } else if (results.length > 0 && typeof results[0] === 'object' && results[0] !== null) {
        dataArray = results;
      } else {
        dataArray = results;
      }
    } else if (results && typeof results === 'object') {
      dataArray = [results];
    }

    if (dataArray.length === 0) {
      console.warn('[getFactureContratById] ⚠️ Aucune donnée trouvée pour facture_id:', factureId);
      return null;
    }

    return dataArray;
  } catch (error) {
    console.error('[getFactureContratById] ❌ Erreur:', error);
    throw error;
  }
};

module.exports = {
  getAllFactures,
  getAllFacturesNoPagination,
  getFactureById,
  getFacturationReport,
  getFactureReportById,
  getFactureMontant,
  getFactureContratById
};
