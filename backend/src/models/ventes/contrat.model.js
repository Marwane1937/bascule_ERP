const { getConnection } = require('../../config/database');

/**
 * Récupérer tous les contrats avec pagination
 */
const getAllContrats = async (options = {}, sequelizeConnection = null) => {
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

    const columnMapping = {
      'numero': 's.numero',
      'date': 's.date',
      'description': 's.description',
      'client': 'p.nom',
      'date_planif': 's.date_planif',
      'date_expire': 's.date_expire'
    };

    const validColumns = ['numero', 'date', 'description', 'client', 'date_planif', 'date_expire'];
    const mappedColumn = validColumns.includes(orderBy) ? (columnMapping[orderBy] || 's.date') : 's.date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereConditions = ['s.type = 50'];
    const replacements = {};

    if (search && search.trim()) {
      whereConditions.push(`(
        s.numero LIKE :search
        OR p.nom LIKE :search
        OR s.description LIKE :search
      )`);
      replacements.search = `%${search.trim()}%`;
    }

    if (dateFrom) {
      whereConditions.push('s.date >= :dateFrom');
      replacements.dateFrom = dateFrom;
    }

    if (dateTo) {
      whereConditions.push('s.date <= :dateTo');
      replacements.dateTo = dateTo;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT
        id,
        numero,
        date,
        description,
        client,
        date_planif,
        date_expire,
        condition_id,
        facture_id,
        total_count
      FROM (
        SELECT
          s.id,
          s.numero,
          s.date,
          s.description,
          p.nom AS client,
          s.date_planif,
          s.date_expire,
          s.condition_id,
          s.facture_id,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${mappedColumn} ${safeOrderDirection}) AS RowNum
        FROM stock s
        INNER JOIN partenaire p ON p.part_id = s.part_id
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

      if (results.length > 0) {
        total = parseInt(results[0].total_count) || 0;
        results = results.map(({ total_count, ...rest }) => rest);
      }
    } catch (dataError) {
      console.error('[getAllContrats] Erreur:', dataError.message);
      throw new Error(`Erreur lors de la récupération des contrats: ${dataError.message || 'Erreur inconnue'}`);
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
    console.error('[getAllContrats] Erreur:', error.message);
    throw error;
  }
};

/**
 * Récupérer un contrat par ID avec ses détails
 */
const getContratById = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    // Récupérer les informations de base du contrat
    const query = `
      SELECT
        s.id,
        s.numero,
        s.date,
        s.description,
        s.part_id,
        p.nom AS client,
        s.date_planif,
        s.date_expire,
        s.condition_id
      FROM stock s
      INNER JOIN partenaire p ON p.part_id = s.part_id
      WHERE s.id = :id AND s.type = 50
    `;

    const results = await sequelize.query(query, {
      replacements: { id: parseInt(id) },
      type: sequelize.QueryTypes.SELECT
    });

    if (!results || results.length === 0) {
      return null;
    }

    const contrat = results[0];

    // Récupérer les détails depuis stock_detail
    const detailsQuery = `
      SELECT
        sd.id,
        sd.stock_id AS document_id,
        sd.article_id,
        a.article_nom,
        sd.quantite,
        sd.prix,
        sd.taux_tva AS tva,
        sd.description AS designation,
        sd.remise,
        sd.remise_montant,
        sd.sens
      FROM stock_detail sd
      LEFT JOIN article a ON a.article_id = sd.article_id
      WHERE sd.stock_id = :id
      ORDER BY sd.id
    `;

    const detailsResults = await sequelize.query(detailsQuery, {
      replacements: { id: parseInt(id) },
      type: sequelize.QueryTypes.SELECT
    });

    contrat.details = Array.isArray(detailsResults) ? detailsResults : [];

    return contrat;
  } catch (error) {
    console.error('[getContratById] Erreur:', error.message);
    throw error;
  }
};

/**
 * Créer un nouveau contrat
 */
const createContrat = async (contratData, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getCompteurFormate } = require('../../services/compteur.service');
  
  try {
    const { date, description, part_id, date_planif, date_expire, condition_id } = contratData;

    if (!date || !part_id) {
      throw new Error('La date et le client sont requis');
    }

    // Générer le numéro avec le compteur CT
    let numero;
    try {
      numero = await getCompteurFormate('CT', 'CT', sequelize);
    } catch (compteurError) {
      console.error('[createContrat] Erreur compteur:', compteurError.message);
      throw new Error('Impossible de générer le numéro de contrat. Vérifiez que le compteur "CT" existe.');
    }

    const query = `
      INSERT INTO stock (numero, date, description, part_id, type, date_planif, date_expire, condition_id, etat, cr_date)
      OUTPUT INSERTED.id, INSERTED.numero, INSERTED.date, INSERTED.description, INSERTED.date_planif, INSERTED.date_expire, INSERTED.condition_id
      VALUES (:numero, :date, :description, :part_id, 50, :date_planif, :date_expire, :condition_id, 1, GETDATE())
    `;

    const result = await sequelize.query(query, {
      replacements: {
        numero,
        date,
        description: description || null,
        part_id: parseInt(part_id),
        date_planif: date_planif || null,
        date_expire: date_expire || null,
        condition_id: condition_id ? parseInt(condition_id) : null
      },
      type: sequelize.QueryTypes.INSERT
    });

    const insertedId = Array.isArray(result) ? (result[0]?.[0]?.id || result[0]?.id) : result?.id;
    
    if (!insertedId) {
      throw new Error('Erreur lors de la création du contrat : ID non récupéré');
    }

    return await getContratById(insertedId, sequelize);
  } catch (error) {
    console.error('[createContrat] Erreur:', error.message);
    throw error;
  }
};

/**
 * Mettre à jour un contrat
 */
const updateContrat = async (id, contratData, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const { numero, date, description, part_id, date_planif, date_expire, condition_id } = contratData;

    const updates = [];
    const replacements = { id: parseInt(id) };

    if (numero !== undefined) {
      updates.push('numero = :numero');
      replacements.numero = numero;
    }
    if (date !== undefined) {
      updates.push('date = :date');
      replacements.date = date;
    }
    if (description !== undefined) {
      updates.push('description = :description');
      replacements.description = description;
    }
    if (part_id !== undefined) {
      updates.push('part_id = :part_id');
      replacements.part_id = parseInt(part_id);
    }
    if (date_planif !== undefined) {
      updates.push('date_planif = :date_planif');
      replacements.date_planif = date_planif || null;
    }
    if (date_expire !== undefined) {
      updates.push('date_expire = :date_expire');
      replacements.date_expire = date_expire || null;
    }
    if (condition_id !== undefined) {
      updates.push('condition_id = :condition_id');
      replacements.condition_id = condition_id ? parseInt(condition_id) : null;
    }

    if (updates.length === 0) {
      return await getContratById(id, sequelize);
    }

    const query = `
      UPDATE stock
      SET ${updates.join(', ')}, cr_date = GETDATE()
      WHERE id = :id AND type = 50
    `;

    await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.UPDATE
    });

    return await getContratById(id, sequelize);
  } catch (error) {
    console.error('[updateContrat] Erreur:', error.message);
    throw error;
  }
};

/**
 * Supprimer un contrat
 */
const deleteContrat = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `
      DELETE FROM stock
      WHERE id = :id AND type = 50
    `;

    await sequelize.query(query, {
      replacements: { id: parseInt(id) },
      type: sequelize.QueryTypes.DELETE
    });

    return { success: true, message: 'Contrat supprimé avec succès' };
  } catch (error) {
    console.error('[deleteContrat] Erreur:', error.message);
    throw error;
  }
};

/**
 * Récupérer toutes les conditions de paiement
 */
const getConditionsPaiement = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `
      SELECT id, nom
      FROM condition_paiement
      ORDER BY nom ASC
    `;

    const results = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT
    });

    return Array.isArray(results) ? results : [];
  } catch (error) {
    console.error('[getConditionsPaiement] Erreur:', error.message);
    throw error;
  }
};

/**
 * Transférer un contrat vers facturation (similaire à livraison)
 */
const transfererContratVersFacturation = async (stockId, factureDate, partId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getCompteurCurrent } = require('../../services/compteur.service');

  const stockIdNum = parseInt(stockId, 10);
  if (isNaN(stockIdNum) || stockIdNum <= 0) {
    throw new Error('stockId invalide');
  }

  const partIdNum = parseInt(partId, 10);
  if (isNaN(partIdNum) || partIdNum <= 0) {
    throw new Error('partId invalide');
  }

  if (!factureDate) {
    throw new Error('La date de facture est requise');
  }

  // Récupérer le compteur FA actuel SANS l'incrémenter
  const compteurFA = await getCompteurCurrent('FA');
  if (compteurFA === null || compteurFA === undefined) {
    throw new Error('Impossible de récupérer le compteur FA');
  }

  const anneeCourte = new Date(factureDate).getFullYear().toString().slice(2);
  const factureNum = `FA${anneeCourte}-${compteurFA.toString().padStart(4, '0')}`;

  return await sequelize.transaction(async (t) => {
    try {
      // Récupérer l'adresse_id depuis stock
      const [stockData] = await sequelize.query(
        `SELECT adresse_id FROM stock WHERE id = :stockId`,
        {
          replacements: { stockId: stockIdNum },
          type: sequelize.QueryTypes.SELECT,
          transaction: t
        }
      );

      const adresseId = stockData && (Array.isArray(stockData) ? stockData[0]?.adresse_id : stockData.adresse_id);

      // Créer d'abord l'entrée dans facture_souche (auto-incrémenté) avec sens = 1
      const adresseIdParam = adresseId || null;
      const insertFactureSoucheQuery = `
        INSERT INTO facture_souche (part_id, adresse_id, sens)
        OUTPUT INSERTED.facture_id
        VALUES (:partId, :adresseId, 1)
      `;

      const [factureSoucheResult] = await sequelize.query(insertFactureSoucheQuery, {
        replacements: {
          partId: partIdNum,
          adresseId: adresseIdParam
        },
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

      // Créer la facture avec le facture_id récupéré
      const insertFactureQuery = `
        INSERT INTO facture (facture_id, facture_ind, facture_num, facture_dat, facture_typ, facture_ht, facture_tva)
        VALUES (:factureId, 1, :factureNum, :factureDate, 'FA', 0, 0);
        UPDATE stock SET facture_id = :factureId WHERE id = :stockId;
        UPDATE compteur SET compteur = compteur + 1 WHERE LTRIM(RTRIM(code)) = 'FA';
      `;

      await sequelize.query(insertFactureQuery, {
        replacements: {
          factureId: factureId,
          factureNum: factureNum,
          factureDate: factureDate,
          stockId: stockIdNum
        },
        transaction: t
      });

      return {
        success: true,
        stockId: stockIdNum,
        factureId: factureId,
        factureNum: factureNum,
        message: 'Contrat transféré vers facturation avec succès'
      };
    } catch (error) {
      console.error('❌ Erreur lors du transfert contrat vers facturation:', error);
      throw new Error(`Erreur lors du transfert: ${error.message}`);
    }
  });
};

// Fonctions pour gérer les détails (lignes de produits) - copiées depuis livraison.model.js
const saveDetailStock = async (detail, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getConnection } = require('../../config/database');
  const connectionToUse = sequelizeConnection || getConnection();

  const stock_id = detail.stock_id || detail.document_id || null;
  const article_id = detail.article_id || null;
  const quantite = detail.qte || detail.quantite || 0;
  const prix = detail.pu || detail.prix || 0;
  const taux_tva = detail.tva || detail.taux_tva || 0;
  const description = detail.description || '';
  const remise = detail.hasOwnProperty('remise') ? (detail.remise !== undefined ? detail.remise : null) : 0;
  const remise_montant = detail.hasOwnProperty('remise_montant') ? (detail.remise_montant !== undefined ? detail.remise_montant : null) : 0;
  const sens = detail.sens != null ? detail.sens : -1;

  let remiseValue = remise;
  let remiseMontantValue = remise_montant;

  if (remiseValue === undefined || remiseValue === null) remiseValue = 0;
  if (remiseMontantValue === undefined || remiseMontantValue === null) remiseMontantValue = 0;

  const descriptionLimited = (description || '').substring(0, 200);

  const query = `
    INSERT INTO stock_detail (stock_id, article_id, quantite, prix, taux_tva, description, sens, remise, remise_montant)
    OUTPUT INSERTED.id
    VALUES (:stock_id, :article_id, :quantite, :prix, :taux_tva, :description, :sens, :remise, :remise_montant)
  `;

  const replacements = {
    stock_id: stock_id,
    article_id: article_id,
    quantite: quantite,
    prix: prix,
    taux_tva: taux_tva,
    description: descriptionLimited,
    sens: sens,
    remise: remiseValue || 0,
    remise_montant: remiseMontantValue || 0
  };

  return await connectionToUse.transaction(async (t) => {
    try {
      const [results] = await connectionToUse.query(query, {
        replacements: replacements,
        type: connectionToUse.QueryTypes.INSERT,
        transaction: t
      });

      let detail_id;
      if (Array.isArray(results)) {
        if (results.length > 0) {
          if (typeof results[0] === 'object' && results[0].id) {
            detail_id = results[0].id;
          } else if (typeof results[0] === 'number') {
            detail_id = results[0];
          } else {
            detail_id = results[0];
          }
        }
      } else if (typeof results === 'object' && results.id) {
        detail_id = results.id;
      } else if (typeof results === 'number') {
        detail_id = results;
      }

      if (!detail_id) {
        const [fallbackResults] = await connectionToUse.query(
          'SELECT TOP 1 id FROM stock_detail ORDER BY id DESC',
          { type: connectionToUse.QueryTypes.SELECT, transaction: t }
        );
        if (fallbackResults && fallbackResults.id) {
          detail_id = fallbackResults.id;
        }
      }

      return detail_id;
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde du détail dans stock_detail:', error);
      throw error;
    }
  });
};

const updateDetailStock = async (id, detail, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getConnection } = require('../../config/database');
  const connectionToUse = sequelizeConnection || getConnection();

  let remiseValue = detail.remise;
  let remiseMontantValue = detail.remise_montant;

  if (remiseValue === undefined || remiseValue === null) remiseValue = 0;
  if (remiseMontantValue === undefined || remiseMontantValue === null) remiseMontantValue = 0;

  const descriptionLimited = (detail.description || '').substring(0, 200);

  const query = `
    UPDATE stock_detail
    SET article_id = :article_id,
        quantite = :quantite,
        prix = :prix,
        taux_tva = :taux_tva,
        description = :description,
        remise = :remise,
        remise_montant = :remise_montant
    WHERE id = :id
  `;

  const replacements = {
    id: id,
    article_id: detail.article_id || null,
    quantite: detail.quantite || 0,
    prix: detail.prix || 0,
    taux_tva: detail.taux_tva || 0,
    description: descriptionLimited,
    remise: remiseValue || 0,
    remise_montant: remiseMontantValue || 0
  };

  try {
    await connectionToUse.query(query, {
      replacements: replacements
    });
    return id;
  } catch (error) {
    console.error('[updateDetailStock] Erreur:', error.message);
    throw error;
  }
};

const deleteLignesParIds = async (ligneIds, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getConnection } = require('../../config/database');
  const connectionToUse = sequelizeConnection || getConnection();

  if (!Array.isArray(ligneIds) || ligneIds.length === 0) {
    throw new Error('IDs de lignes invalides pour la suppression');
  }

  await connectionToUse.query(
    `DELETE FROM stock_detail WHERE id IN (${ligneIds.map(() => '?').join(',')})`,
    { replacements: ligneIds }
  );
};

const saveDetailLines = async (lignes, sequelizeConnection = null) => {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return [];
  }

  const results = [];

  for (const ligne of lignes) {
    try {
      const stockId = ligne?.stock_id ?? ligne?.document_id ?? null;
      if (!stockId) {
        results.push({
          id: ligne?.id ?? null,
          update_mode: ligne?.update_mode ?? null,
          success: false,
          error: 'stock_id manquant'
        });
        continue;
      }

      const articleId = ligne?.article_id ?? null;
      const quantite = Number(ligne?.qte ?? ligne?.quantite) || 0;
      const prix = Number(ligne?.pu ?? ligne?.prix) || 0;
      const tauxTva = ligne?.tva != null
        ? Number(ligne.tva)
        : (ligne?.taux_tva != null ? Number(ligne.taux_tva) : 0);
      const description = ligne?.designation ?? ligne?.description ?? '';
      const sens = ligne?.sens != null ? Number(ligne.sens) : -1;

      const remiseValue = ligne?.remise;
      const remiseMontantValue = ligne?.remise_montant;

      let remiseFraction = 0;
      let remiseMontant = 0;
      let detectedMode = null;

      if (remiseMontantValue !== null && remiseMontantValue !== undefined && (remiseValue === null || remiseValue === undefined)) {
        detectedMode = 'montant';
        remiseMontant = remiseMontantValue === null || remiseMontantValue === undefined ? 0 : Number(remiseMontantValue);
        if (isNaN(remiseMontant)) remiseMontant = 0;
        remiseFraction = 0;
      }
      else if (remiseValue !== null && remiseValue !== undefined && (remiseMontantValue === null || remiseMontantValue === undefined)) {
        detectedMode = 'pourcentage';
        remiseFraction = remiseValue === null || remiseValue === undefined ? 0 : Number(remiseValue);
        if (!isNaN(remiseFraction) && remiseFraction > 1) {
          remiseFraction = remiseFraction / 100;
        }
        if (isNaN(remiseFraction)) remiseFraction = 0;
        remiseMontant = 0;
      }
      else if (remiseMontantValue !== null && remiseMontantValue !== undefined) {
        detectedMode = 'montant';
        remiseMontant = Number(remiseMontantValue);
        if (isNaN(remiseMontant)) remiseMontant = 0;
        remiseFraction = 0;
      }
      else {
        remiseFraction = 0;
        remiseMontant = 0;
      }

      if (Number.isNaN(remiseFraction) || remiseFraction < 0) {
        remiseFraction = 0;
      }
      if (Number.isNaN(remiseMontant) || remiseMontant < 0) {
        remiseMontant = 0;
      }

      const payload = {
        stock_id: stockId,
        document_id: stockId,
        article_id: articleId,
        qte: quantite,
        quantite,
        pu: prix,
        prix,
        tva: tauxTva,
        taux_tva: tauxTva,
        description,
        sens,
        remise: remiseFraction !== undefined ? remiseFraction : null,
        remise_montant: remiseMontant !== undefined ? remiseMontant : null
      };

      if (ligne?.update_mode === 'U' && ligne?.id) {
        await updateDetailStock(ligne.id, payload, sequelizeConnection);
        results.push({ id: ligne.id, update_mode: 'U', success: true, remise_mode: detectedMode });
      } else if (ligne?.update_mode === 'D' && ligne?.id) {
        await deleteLignesParIds([ligne.id], sequelizeConnection);
        results.push({ id: ligne.id, update_mode: 'D', success: true, remise_mode: detectedMode });
      } else {
        const insertedId = await saveDetailStock(payload, sequelizeConnection);
        results.push({ id: insertedId, update_mode: 'I', success: true, remise_mode: detectedMode });
      }
    } catch (error) {
      console.error('Erreur lors du traitement d\'une ligne stock_detail :', error);
      results.push({
        id: ligne?.id ?? null,
        update_mode: ligne?.update_mode ?? null,
        success: false,
        error: error.message || 'Erreur inconnue'
      });
    }
  }

  return results;
};

module.exports = {
  getAllContrats,
  getContratById,
  createContrat,
  updateContrat,
  deleteContrat,
  getConditionsPaiement,
  transfererContratVersFacturation,
  saveDetailLines,
  deleteLignesParIds
};

