const { getConnection } = require('../../config/database');

// Récupérer toutes les factures fournisseur avec pagination
// La table facture_souche avec sens = 2 pour les achats
const getAllFacturesFournisseur = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const {
      page = 1,
      pageSize = 10,
      orderBy = 'facture_num',
      orderDirection = 'DESC',
      search = ''
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['facture_id', 'facture_num', 'facture_dat', 'fournisseur', 'facture_ht', 'facture_tva'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'facture_num';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = '';
    const replacements = {};

    if (search && search.trim()) {
      whereClause = `WHERE (
        f.facture_num LIKE :search 
        OR p.nom LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    // Requête avec pagination
    const query = `
      SELECT 
        facture_id,
        facture_num,
        facture_dat,
        fournisseur,
        part_id,
        facture_ht,
        facture_tva,
        total_count
      FROM (
        SELECT 
          f.facture_id,
          f.facture_num,
          f.facture_dat,
          p.nom AS fournisseur,
          fs.part_id,
          ISNULL(f.facture_ht, 0) AS facture_ht,
          ISNULL(f.facture_tva, 0) AS facture_tva,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY f.${safeOrderBy} ${safeOrderDirection}) AS RowNum
        FROM facture f
        INNER JOIN facture_souche fs ON fs.facture_id = f.facture_id AND fs.sens = 2
        INNER JOIN partenaire p ON p.part_id = fs.part_id
        LEFT JOIN achat_document_detail sd ON sd.document_id = f.facture_id
        ${whereClause}
        GROUP BY f.facture_id, f.facture_num, f.facture_dat, p.nom, fs.part_id, f.facture_ht, f.facture_tva
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
      console.error('[getAllFacturesFournisseur] Erreur:', dataError.message);
      throw new Error(`Erreur lors de la récupération des factures fournisseur: ${dataError.message || 'Erreur inconnue'}`);
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
    console.error('[getAllFacturesFournisseur] Erreur:', error.message);
    throw error;
  }
};

// Récupérer une facture fournisseur par ID
const getFactureFournisseurById = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `
      SELECT 
        f.facture_id,
        f.facture_num,
        f.facture_dat,
        fs.part_id,
        p.nom AS fournisseur,
        a.nom AS adresse,
        pi.identifiant AS ice
      FROM facture f
      INNER JOIN facture_souche fs ON fs.facture_id = f.facture_id AND fs.sens = 2
      INNER JOIN partenaire p ON p.part_id = fs.part_id
      LEFT JOIN adresse a ON a.part_id = p.part_id
      LEFT JOIN partenaire_identifiant pi ON pi.part_id = p.part_id AND pi.identifiant_type = 8
      WHERE f.facture_id = :id
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
    console.error('[getFactureFournisseurById] Erreur:', error);
    throw error;
  }
};

// Récupérer les commandes non facturées (pour le transfert commande → facture)
const getCommandesNonFacturees = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `
      SELECT  
        a.document_id, 
        a.numero, 
        a.date, 
        a.description, 
        p.nom AS fournisseur, 
        p.part_id, 
        ISNULL(SUM(ad.quantite * ad.prix), 0) AS total_ht 
      FROM achat_document a 
      INNER JOIN partenaire p ON p.part_id = a.part_id 
      LEFT JOIN achat_document_detail ad ON ad.document_id = a.document_id 
      WHERE a.type = 2 
        AND NOT EXISTS ( 
          SELECT 1 FROM facture_souche fs  
          WHERE fs.facture_id = a.facture_id  
          AND fs.sens = 2 
        ) 
      GROUP BY a.document_id, a.numero, a.date, a.description, p.nom, p.part_id 
      ORDER BY a.date DESC
    `;

    const results = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT
    });

    return results || [];
  } catch (error) {
    console.error('[getCommandesNonFacturees] Erreur:', error);
    throw error;
  }
};

// Créer une facture fournisseur depuis une commande
const createFactureFournisseurFromCommande = async (commandeId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  return await sequelize.transaction(async (t) => {
    try {
      // Récupérer la commande
      const commandeQuery = `
        SELECT
          a.document_id, a.numero, a.date, a.part_id, a.description
        FROM achat_document a
        WHERE a.document_id = :commandeId AND a.type = 2
      `;

      const [commande] = await sequelize.query(commandeQuery, {
        replacements: { commandeId },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      });

      if (!commande) {
        throw new Error('Commande non trouvée');
      }

      // Générer le numéro de facture en utilisant le service compteur
      const { getCompteurFormate } = require('../../services/compteur.service');
      const numeroFacture = await getCompteurFormate('FAF', 'FAF', sequelize);

      // Calculer les totaux HT et TVA depuis les détails de la commande
      const totalsQuery = `
        SELECT
          ISNULL(SUM((ad.quantite * ad.prix) - ISNULL(ad.remise_montant, 0)), 0) AS total_ht,
          ISNULL(SUM(((ad.quantite * ad.prix) - ISNULL(ad.remise_montant, 0)) * ISNULL(ad.taux_tva, 0)), 0) AS total_tva
        FROM achat_document_detail ad
        WHERE ad.document_id = :commandeId
      `;

      const [totals] = await sequelize.query(totalsQuery, {
        replacements: { commandeId },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      });

      const totalHt = totals?.total_ht || 0;
      const totalTva = totals?.total_tva || 0;

      // 1. Créer d'abord l'entrée dans facture_souche (auto-incrémenté) avec sens = 2
      const insertFactureSoucheQuery = `
        INSERT INTO facture_souche (part_id, sens)
        OUTPUT INSERTED.facture_id
        VALUES (:partId, 2)
      `;

      const [factureSoucheResult] = await sequelize.query(insertFactureSoucheQuery, {
        replacements: { partId: commande.part_id },
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      });

      // Récupérer le facture_id auto-généré
      let factureId = null;
      if (Array.isArray(factureSoucheResult) && factureSoucheResult.length > 0) {
        factureId = factureSoucheResult[0].facture_id;
      } else if (factureSoucheResult && factureSoucheResult.facture_id) {
        factureId = factureSoucheResult.facture_id;
      }

      if (!factureId) {
        throw new Error('Erreur lors de la création de facture_souche : facture_id non récupéré');
      }

      // 2. Créer la facture avec le facture_id récupéré
      const insertFactureQuery = `
        INSERT INTO facture (facture_id, facture_num, facture_dat, facture_ind, facture_typ, facture_ht, facture_tva)
        VALUES (:factureId, :numeroFacture, GETDATE(), 1, 'FA', :totalHt, :totalTva)
      `;

      await sequelize.query(insertFactureQuery, {
        replacements: { factureId, numeroFacture, totalHt, totalTva },
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      });

      // 3. Mettre à jour le facture_id dans achat_document
      await sequelize.query(
        `UPDATE achat_document SET facture_id = :factureId WHERE document_id = :commandeId`,
        { replacements: { factureId, commandeId }, transaction: t }
      );

      return {
        facture_id: factureId,
        numero: numeroFacture,
        commande_id: commandeId
      };
    } catch (error) {
      console.error('[createFactureFournisseurFromCommande] Erreur:', error);
      throw error;
    }
  });
};

// Supprimer une facture fournisseur
const deleteFactureFournisseur = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  
  return await sequelize.transaction(async (t) => {
    // Vérifier que c'est bien une facture fournisseur (sens = 2)
    const checkQuery = `
      SELECT fs.facture_id FROM facture_souche fs 
      WHERE fs.facture_id = :id AND fs.sens = 2
    `;
    const [check] = await sequelize.query(checkQuery, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT,
      transaction: t
    });

    if (!check) {
      throw new Error('Facture fournisseur non trouvée');
    }

    // Supprimer les détails
    await sequelize.query(
      'DELETE FROM stock_detail WHERE stock_id = :id',
      { replacements: { id }, transaction: t }
    );

    // Supprimer la souche
    await sequelize.query(
      'DELETE FROM facture_souche WHERE facture_id = :id',
      { replacements: { id }, transaction: t }
    );

    // Supprimer la facture
    await sequelize.query(
      'DELETE FROM facture WHERE facture_id = :id',
      { replacements: { id }, transaction: t }
    );

    return { success: true };
  });
};

// Récupérer le rapport de facture fournisseur par ID pour la génération PDF
// Retourne les données au format attendu par le générateur PDF
const getFactureFournisseurReportById = async (factureId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    // REQUÊTE UNIQUE : Récupération complète des données de facture fournisseur
    const query = `
      SELECT
        f.facture_num AS numero,
        f.facture_dat AS date,
        p.nom AS fournisseur,
        pi.identifiant AS ice,
        adr.nom AS adresse,
        aa.article_nom AS designation,
        ad.quantite,
        ad.prix,
        ad.remise,
        f.facture_ht,
        f.facture_tva,
        f.facture_ht + f.facture_tva AS facture_ttc,
        :factureId AS document_id,
        :factureId AS etat,
        4 AS type,
        'FACTURE_FOURNISSEUR' AS document_kind,
        fs.part_id AS part_id,
        '' AS commercial,
        ISNULL(aa.article_cod, '') AS article_cod,
        ISNULL(aa.article_nom, '') AS article_nom,
        ISNULL(aa.article_nom, '') AS article,
        ISNULL(ad.taux_tva, 0) AS taux_tva,
        ISNULL(ad.remise_montant, 0) AS remise_montant,
        '' AS condition,
        '' AS expedition,
        '' AS transporteur,
        '' AS client_ref,
        ISNULL(v.nom, '') AS ville,
        ad.id AS ligne_id,
        (ad.quantite * ad.prix) AS total_ht,
        (ad.quantite * ad.prix * ISNULL(ad.taux_tva, 0)) AS total_tva,
        (ad.quantite * ad.prix * (1 + ISNULL(ad.taux_tva, 0))) AS total_ttc,
        a.numero AS numero_commande
      FROM facture f
      INNER JOIN facture_souche fs ON f.facture_id = fs.facture_id AND fs.sens = 2
      INNER JOIN achat_document a ON a.facture_id = fs.facture_id
      INNER JOIN achat_document_detail ad ON a.document_id = ad.document_id
      INNER JOIN article aa ON aa.article_id = ad.article_id
      INNER JOIN partenaire p ON p.part_id = fs.part_id
      LEFT OUTER JOIN partenaire_identifiant pi ON pi.part_id = p.part_id AND pi.identifiant_type = 8
      LEFT OUTER JOIN adresse adr ON adr.part_id = fs.part_id
      LEFT OUTER JOIN ville v ON v.id = adr.ville
      WHERE fs.facture_id = :factureId
      ORDER BY ad.id
    `;

    console.log('[getFactureFournisseurReportById] 📋 REQUÊTE UNIQUE - Récupération facture fournisseur:', query);
    console.log('[getFactureFournisseurReportById] 🔢 Paramètres:', { factureId });

    const results = await sequelize.query(query, {
      replacements: { factureId },
      type: sequelize.QueryTypes.SELECT
    });

    console.log('[getFactureFournisseurReportById] 📊 Résultats bruts:', results);

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

    console.log('[getFactureFournisseurReportById] 📊 dataArray final:', dataArray);

    if (dataArray.length === 0) {
      console.warn('[getFactureFournisseurReportById] ⚠️ Aucune donnée trouvée pour facture_id:', factureId);
    }

    return dataArray.length > 0 ? dataArray : null;
  } catch (error) {
    console.error('[getFactureFournisseurReportById] ❌ Erreur:', error);
    console.error('[getFactureFournisseurReportById] ❌ Stack:', error.stack);
    throw error;
  }
};

module.exports = {
  getAllFacturesFournisseur,
  getFactureFournisseurById,
  getCommandesNonFacturees,
  createFactureFournisseurFromCommande,
  deleteFactureFournisseur,
  getFactureFournisseurReportById
};

