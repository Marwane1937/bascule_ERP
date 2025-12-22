const { getConnection } = require('../../config/database');

// Récupérer tous les bons de commande avec pagination (type = 2)
const getAllBonCommande = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'date',
      orderDirection = 'DESC',
      search = ''
    } = options;

    // Calculer OFFSET pour la pagination
    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    // Vérifier que orderBy est une colonne valide
    const validColumns = ['numero', 'date', 'fournisseur', 'description'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // Mapper les colonnes pour l'ORDER BY dans la requête SQL
    const orderByColumn = safeOrderBy === 'fournisseur' ? 'p.nom' : `a.${safeOrderBy}`;

    // Construire la clause WHERE pour la recherche - type = 2 pour bon de commande
    let whereClause = 'WHERE a.type = 2';
    const replacements = {};

    if (search && search.trim()) {
      whereClause += ` AND (
        a.numero LIKE :search 
        OR p.nom LIKE :search
        OR a.description LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    // Requête avec pagination basée sur la requête spécifiée
    // On ajoute document_id pour les actions (modifier/supprimer)
    const query = `
      SELECT 
        document_id,
        numero,
        date,
        fournisseur,
        description
      FROM (
        SELECT 
          a.document_id,
          a.numero,
          a.date,
          p.nom AS fournisseur,
          a.description,
          ROW_NUMBER() OVER (ORDER BY ${orderByColumn} ${safeOrderDirection}) AS RowNum
        FROM achat_document a
        INNER JOIN partenaire p ON p.part_id = a.part_id AND p.type = 2
        ${whereClause}
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY RowNum
    `;
    
    // Requête pour compter le total
    const countReplacements = search && search.trim() ? { search: `%${search.trim()}%` } : {};
    const countQuery = `
      SELECT COUNT(*) as total
      FROM achat_document a
      INNER JOIN partenaire p ON p.part_id = a.part_id AND p.type = 2
      ${whereClause}
    `;

    // Exécuter les requêtes
    let results, countResult;
    
    try {
      const countQueryResult = await sequelize.query(countQuery, {
        replacements: Object.keys(countReplacements).length > 0 ? countReplacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });
      const countData = Array.isArray(countQueryResult) ? countQueryResult[0] : countQueryResult;
      countResult = Array.isArray(countData) ? countData : [countData];
    } catch (countError) {
      console.error('[getAllBonCommande] Erreur lors du comptage:', countError);
      throw new Error(`Erreur lors du comptage des bons de commande: ${countError.message || 'Erreur inconnue'}`);
    }
    
    try {
      const queryResult = await sequelize.query(query, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });
      if (Array.isArray(queryResult)) {
        results = queryResult;
      } else {
        results = queryResult ? [queryResult] : [];
      }
    } catch (queryError) {
      console.error('[getAllBonCommande] Erreur lors de la requête:', queryError);
      throw new Error(`Erreur lors de la récupération des bons de commande: ${queryError.message || 'Erreur inconnue'}`);
    }

    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / safePageSize);

    return {
      data: results || [],
      pagination: {
        total: total,
        page: safePage,
        pageSize: safePageSize,
        totalPages: totalPages
      }
    };
  } catch (error) {
    console.error('[getAllBonCommande] Erreur:', error);
    throw error;
  }
};

// Récupérer un bon de commande par ID
const getBonCommandeById = async (id) => {
  const sequelize = getConnection();
  // Récupérer les infos principales du bon de commande
  const [bonCommande] = await sequelize.query(
    'SELECT document_id, numero, date, description, part_id, contact_id, type FROM achat_document WHERE document_id = :id',
    {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  if (!bonCommande) return null;

  const partId = bonCommande.part_id;

  // Récupérer les détails du bon de commande
  const details = await sequelize.query(
    `SELECT d.id, d.article_id, d.quantite, d.prix, d.taux_tva, d.remise, d.description, d.remise_montant,
      q.designation 
     FROM achat_document_detail d
     LEFT JOIN achat_document_quill q ON d.id = q.quill_id
     WHERE d.document_id = :id
     ORDER BY d.id DESC`,
    {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  // Récupérer les infos du partenaire (fournisseur)
  const Infos = await sequelize.query(
    `SELECT nom, telephone, email, adresse, ice, cin, rc, IF_, PATENTE, cnss 
     FROM v_partenaire_infos
     WHERE part_id = :partId`,
    {
      replacements: { partId },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  // Récupérer les infos de condition
  const condition = await sequelize.query(
    `SELECT document_id, date, condition, expedition, transporteur, type, etat
     FROM achat_document_info
     WHERE document_id = :id`,
    {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  return {
    ...bonCommande,
    details,
    Infos,
    condition
  };
};

// Ajouter un bon de commande (type = 2)
const addBonCommande = async ({ numero, date, description, part_id, contact_id, etat, type, parent }) => {
  const sequelize = getConnection();
  const { getCompteurCurrent } = require('../../services/compteur.service');
  
  return await sequelize.transaction(async (t) => {
    try {
      let numeroFinal = numero;
      let compteurCode = null;
      
      if (!numeroFinal || numeroFinal.trim() === '') {
        // Bon de commande d'achat - type = 2
        compteurCode = 'BCF';
        
        if (compteurCode) {
          const compteurActuel = await getCompteurCurrent(compteurCode);
          if (compteurActuel === null || compteurActuel === undefined) {
            throw new Error(`Impossible de récupérer le compteur ${compteurCode}`);
          }
          
          const anneeCourte = new Date().getFullYear().toString().slice(2);
          const prefix = 'BCF';
          numeroFinal = `${prefix}${anneeCourte}-${compteurActuel.toString().padStart(4, '0')}`;
        }
      }
      
      // Forcer type = 2 pour bon de commande
      const typeFinal = 2;
      
      let query = `INSERT INTO achat_document (numero, date, description, part_id, contact_id, etat, type`;
      let values = `:numero, :date, :description, :part_id, :contact_id, :etat, :type`;
      let replacements = { 
        numero: numeroFinal, 
        date, 
        description, 
        part_id, 
        contact_id, 
        etat: etat || 1,
        type: typeFinal
      };
      
      if (parent !== undefined && parent !== null) {
        query += `, parent`;
        values += `, :parent`;
        replacements.parent = parent;
      }
      
      if (compteurCode) {
        query += `) OUTPUT INSERTED.document_id VALUES (${values});
        UPDATE compteur SET compteur = compteur + 1 WHERE code = :compteurCode;`;
        replacements.compteurCode = compteurCode;
      } else {
        query += `) OUTPUT INSERTED.document_id VALUES (${values})`;
      }
      
      const [result] = await sequelize.query(query, {
        replacements,
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      });
    
      let documentId = null;
      
      if (result && result.document_id) {
        documentId = result.document_id;
      } else if (Array.isArray(result) && result.length > 0) {
        if (result[0] && result[0].document_id) {
          documentId = result[0].document_id;
        } else if (typeof result[0] === 'number') {
          documentId = result[0];
        } else if (typeof result[0] === 'object' && result[0] !== null) {
          documentId = result[0].document_id || result[0];
        }
      } else if (typeof result === 'number') {
        documentId = result;
      }
      
      if (!documentId) {
        const [lastInsert] = await sequelize.query(
          `SELECT TOP 1 document_id FROM achat_document WHERE numero = :numero ORDER BY document_id DESC`,
          {
            replacements: { numero: numeroFinal },
            type: sequelize.QueryTypes.SELECT,
            transaction: t
          }
        );
        
        if (lastInsert && lastInsert.document_id) {
          documentId = lastInsert.document_id;
        }
      }
    
      if (documentId) {
        return { document_id: documentId, numero: numeroFinal };
      } else {
        throw new Error('Erreur lors de la création du bon de commande : aucun ID retourné');
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'insertion du bon de commande:', error);
      throw new Error(`Erreur lors de l'ajout du bon de commande: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Sauvegarder un détail de bon de commande
const saveDetail = async (detailData) => {
  const sequelize = getConnection();
  const { document_id, article_id, quantite, prix, taux_tva, remise, description, remise_montant } = detailData;
  
  const query = `
    INSERT INTO achat_document_detail (document_id, article_id, quantite, prix, taux_tva, remise, description, remise_montant)
    OUTPUT INSERTED.id
    VALUES (:document_id, :article_id, :quantite, :prix, :taux_tva, :remise, :description, :remise_montant)
  `;
  
  const [result] = await sequelize.query(query, {
    replacements: {
      document_id,
      article_id: article_id || null,
      quantite: quantite || 0,
      prix: prix || 0,
      taux_tva: taux_tva || 0,
      remise: remise || 0,
      description: description || '',
      remise_montant: remise_montant || 0
    },
    type: sequelize.QueryTypes.INSERT
  });
  
  return result;
};

// Sauvegarder les infos de bon de commande
const saveInfo = async (infoData) => {
  const sequelize = getConnection();
  const { document_id, date, condition, expedition, transporteur, type, etat } = infoData;
  
  const query = `
    IF EXISTS (SELECT 1 FROM achat_document_info WHERE document_id = :document_id)
      UPDATE achat_document_info 
      SET date = :date, condition = :condition, expedition = :expedition, transporteur = :transporteur, type = :type, etat = :etat
      WHERE document_id = :document_id
    ELSE
      INSERT INTO achat_document_info (document_id, date, condition, expedition, transporteur, type, etat)
      VALUES (:document_id, :date, :condition, :expedition, :transporteur, :type, :etat)
  `;
  
  await sequelize.query(query, {
    replacements: {
      document_id,
      date: date || null,
      condition: condition || '',
      expedition: expedition || '',
      transporteur: transporteur || '',
      type: type || null,
      etat: etat || 1
    },
    type: sequelize.QueryTypes.UPDATE
  });
  
  return { success: true };
};

// Mettre à jour un bon de commande
const updateBonCommande = async (id, bonCommandeData) => {
  const sequelize = getConnection();
  const { date, description, part_id, contact_id } = bonCommandeData;
  
  const query = `
    UPDATE achat_document 
    SET date = :date, description = :description, part_id = :part_id, contact_id = :contact_id
    WHERE document_id = :id
  `;
  
  await sequelize.query(query, {
    replacements: { id, date, description, part_id, contact_id },
    type: sequelize.QueryTypes.UPDATE
  });
  
  return { success: true };
};

// Supprimer un bon de commande
const deleteBonCommande = async (id) => {
  const sequelize = getConnection();
  
  return await sequelize.transaction(async (t) => {
    // Supprimer les détails
    await sequelize.query(
      'DELETE FROM achat_document_detail WHERE document_id = :id',
      { replacements: { id }, transaction: t }
    );
    
    // Supprimer les infos
    await sequelize.query(
      'DELETE FROM achat_document_info WHERE document_id = :id',
      { replacements: { id }, transaction: t }
    );
    
    // Supprimer le document
    await sequelize.query(
      'DELETE FROM achat_document WHERE document_id = :id',
      { replacements: { id }, transaction: t }
    );
  });
};

// Supprimer des lignes par IDs
const deleteLignesParIds = async (ids) => {
  const sequelize = getConnection();
  
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('Liste d\'IDs invalide');
  }
  
  const placeholders = ids.map((_, index) => `:id${index}`).join(',');
  const replacements = {};
  ids.forEach((id, index) => {
    replacements[`id${index}`] = id;
  });
  
  const query = `DELETE FROM achat_document_detail WHERE id IN (${placeholders})`;
  
  await sequelize.query(query, {
    replacements,
    type: sequelize.QueryTypes.DELETE
  });
  
  return { success: true, deletedCount: ids.length };
};

module.exports = {
  getAllBonCommande,
  getBonCommandeById,
  addBonCommande,
  saveDetail,
  saveInfo,
  updateBonCommande,
  deleteBonCommande,
  deleteLignesParIds
};

