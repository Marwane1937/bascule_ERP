const { getConnection } = require('../../config/database');

const normalizeDetailDestination = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'client' || normalized === 'stock') {
    return normalized;
  }
  return null;
};

const resolveDetailDesignation = (detail, quillDesignation = '') => {
  if (quillDesignation) {
    return quillDesignation;
  }

  const destination = normalizeDetailDestination(detail?.description);
  if (destination) {
    return detail?.article_nom || '';
  }

  return detail?.description || detail?.article_nom || '';
};

// Récupérer toutes les demandes d'achat avec pagination (type = 0)
const getAllDemandeAchat = async (options = {}, sequelizeConnection = null) => {
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
    const validColumns = ['numero', 'date', 'date_fin', 'fournisseur', 'description'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // Mapper les colonnes pour l'ORDER BY dans la requête SQL
    const orderByColumn = safeOrderBy === 'fournisseur' ? 'p.nom' : `a.${safeOrderBy}`;

    // Construire la clause WHERE pour la recherche - type = 0 pour demande d'achat
    let whereClause = 'WHERE a.type = 0';
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
        date_fin,
        fournisseur,
        description
      FROM (
        SELECT 
          a.document_id,
          a.numero,
          a.date,
          a.date_fin,
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
      console.error('[getAllDemandeAchat] Erreur lors du comptage:', countError);
      throw new Error(`Erreur lors du comptage des demandes d'achat: ${countError.message || 'Erreur inconnue'}`);
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
      console.error('[getAllDemandeAchat] Erreur lors de la requête:', queryError);
      throw new Error(`Erreur lors de la récupération des demandes d'achat: ${queryError.message || 'Erreur inconnue'}`);
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
    console.error('[getAllDemandeAchat] Erreur:', error);
    throw error;
  }
};

// Récupérer une demande d'achat par ID
const getDemandeAchatById = async (id) => {
  const sequelize = getConnection();
  
  try {
    // Récupérer les infos principales de la demande d'achat
    const demandeAchatResult = await sequelize.query(
      'SELECT document_id, numero, date, date_fin, description, part_id, contact_id, type FROM achat_document WHERE document_id = :id',
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const demandeAchat = Array.isArray(demandeAchatResult) ? demandeAchatResult[0] : demandeAchatResult;

    if (!demandeAchat) return null;

    const partId = demandeAchat.part_id;

    // Récupérer les détails de la demande d'achat (+ infos article pour afficher l'article même sans quill)
    let details = [];
    try {
      details = await sequelize.query(
        `SELECT 
           d.id, 
           d.article_id, 
           d.quantite, 
           d.prix, 
           d.taux_tva, 
           d.remise, 
           d.description, 
           d.remise_montant,
           a.article_nom,
           a.article_cod
         FROM achat_document_detail d
         LEFT JOIN article a ON a.article_id = d.article_id
         WHERE d.document_id = :id
         ORDER BY d.id DESC`,
        {
          replacements: { id },
          type: sequelize.QueryTypes.SELECT,
        }
      );
      
      // Essayer de récupérer les désignations quill séparément
      try {
        const quillData = await sequelize.query(
          `SELECT quill_id, designation FROM achat_document_quill WHERE quill_id IN (
            SELECT id FROM achat_document_detail WHERE document_id = :id
          )`,
          {
            replacements: { id },
            type: sequelize.QueryTypes.SELECT,
          }
        );
        
        const quillMap = new Map(
          (Array.isArray(quillData) ? quillData : []).map((q) => [q.quill_id, q.designation])
        );
        details = details.map(d => ({
          ...d,
          designation: resolveDetailDesignation(d, quillMap.get(d.id) || ''),
          destination: normalizeDetailDestination(d.description)
        }));
      } catch (quillError) {
        console.warn('[getDemandeAchatById] Table achat_document_quill non accessible:', quillError.message);
        // Continuer sans les données quill
        details = details.map(d => ({
          ...d,
          designation: resolveDetailDesignation(d),
          destination: normalizeDetailDestination(d.description)
        }));
      }
    } catch (detailError) {
      console.error('[getDemandeAchatById] Erreur récupération détails:', detailError.message);
      details = [];
    }

    // Récupérer les infos du partenaire (fournisseur)
    let Infos = [];
    try {
      Infos = await sequelize.query(
        `SELECT nom, telephone, email, adresse, ice, cin, rc, IF_, PATENTE, cnss 
         FROM v_partenaire_infos
         WHERE part_id = :partId`,
        {
          replacements: { partId },
          type: sequelize.QueryTypes.SELECT,
        }
      );
    } catch (infoError) {
      console.warn('[getDemandeAchatById] Vue v_partenaire_infos non accessible, utilisation de partenaire:', infoError.message);
      // Fallback: requête directe sur la table partenaire
      try {
        Infos = await sequelize.query(
          `SELECT nom, telephone, email, adresse, ice, cin, rc, IF_, PATENTE, cnss 
           FROM partenaire
           WHERE part_id = :partId`,
          {
            replacements: { partId },
            type: sequelize.QueryTypes.SELECT,
          }
        );
      } catch (partenaireError) {
        console.error('[getDemandeAchatById] Erreur récupération partenaire:', partenaireError.message);
        Infos = [];
      }
    }

    // Récupérer les infos de condition
    let condition = [];
    try {
      condition = await sequelize.query(
        `SELECT document_id, date, condition, expedition, transporteur, type, etat
         FROM achat_document_info
         WHERE document_id = :id`,
        {
          replacements: { id },
          type: sequelize.QueryTypes.SELECT,
        }
      );
    } catch (conditionError) {
      // Ne pas polluer les logs si la table n'existe pas dans cet environnement
      if (!String(conditionError?.message || '').includes("Invalid object name 'achat_document_info'")) {
        console.warn('[getDemandeAchatById] Table achat_document_info non accessible:', conditionError.message);
      }
      condition = [];
    }

    return {
      ...demandeAchat,
      details: details || [],
      Infos: Infos || [],
      condition: condition || []
    };
  } catch (error) {
    console.error('[getDemandeAchatById] Erreur générale:', error);
    throw error;
  }
};  

const formatToSqlDateTime = (value) => {
  if (!value) return null;
  return value.replace('T', ' ') + ':00';
};


// Ajouter une demande d'achat (type = 0)
const addDemandeAchat = async ({ numero, date, date_fin, description, part_id, contact_id, etat, type, parent }) => {
  const sequelize = getConnection();
  const { getCompteurCurrent } = require('../../services/compteur.service');
  
  return await sequelize.transaction(async (t) => {
    try {
      let numeroFinal = numero;
      let compteurCode = null;
      
      if (!numeroFinal || numeroFinal.trim() === '') {
        // Demande d'achat - type = 0
        compteurCode = 'DA';
        
        if (compteurCode) {
          const compteurActuel = await getCompteurCurrent(compteurCode);
          if (compteurActuel === null || compteurActuel === undefined) {
            throw new Error(`Impossible de récupérer le compteur ${compteurCode}`);
          }
          
          const anneeCourte = new Date().getFullYear().toString().slice(2);
          const prefix = 'DA';
          numeroFinal = `${prefix}${anneeCourte}-${compteurActuel.toString().padStart(4, '0')}`;
        }
      }
      
      // Forcer type = 0 pour demande d'achat
      const typeFinal = 0;
      const dateSql = formatToSqlDateTime(date);
  
      let query = `INSERT INTO achat_document (numero, date, date_fin, description, part_id, etat, type`;
      let values = `:numero, :dateSql, :date_fin, :description, :part_id, :etat, :type`;
      let replacements = { 
        numero: numeroFinal, 
        dateSql, 
        date_fin: date_fin || null,
        description, 
        part_id, 
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
        throw new Error('Erreur lors de la création de la demande d\'achat : aucun ID retourné');
      }
    } catch (error) {
      console.error('❌ Erreur lors de l\'insertion de la demande d\'achat:', error);
      throw new Error(`Erreur lors de l'ajout de la demande d'achat: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Sauvegarder un détail de demande d'achat (Insert ou Update) - SANS PRIX
const saveDetail = async (detailData) => {
  const sequelize = getConnection();
  const { 
    id, 
    document_id, 
    article_id, 
    designation,
    qte, 
    pu, 
    taxe, 
    remise, 
    remise_montant,
    update_mode 
  } = detailData;
  
  // Mode Update
  if (update_mode === 'U' && id) {
    const updateQuery = `
      UPDATE achat_document_detail 
      SET article_id = :article_id, 
          quantite = :quantite, 
          prix = 0, 
          taux_tva = :taux_tva, 
          description = :description,
          remise = :remise, 
          remise_montant = :remise_montant
      WHERE id = :id
    `;
    
    await sequelize.query(updateQuery, {
      replacements: {
        id,
        article_id: article_id || null,
        quantite: qte || 0,
        taux_tva: taxe || 0.2,
        description: normalizeDetailDestination(detailData.description),
        remise: remise || null,
        remise_montant: remise_montant || null
      },
      type: sequelize.QueryTypes.UPDATE
    });
    
    return { id, status: 'updated' };
  }
  
  // Mode Insert - Prix toujours à 0 pour demande d'achat
  const insertQuery = `
    INSERT INTO achat_document_detail (document_id, article_id, quantite, prix, taux_tva, description, remise, remise_montant ,cr_date)
    OUTPUT INSERTED.id
    VALUES (:document_id, :article_id, :quantite, 0, :taux_tva, :description, :remise, :remise_montant , GETDATE())
  `;
  
  const [result] = await sequelize.query(insertQuery, {
    replacements: {
      document_id,
      article_id: article_id || null,
      quantite: qte || 0,
      taux_tva: taxe || 0.2,
      description: normalizeDetailDestination(detailData.description),
      remise: remise || null,
      remise_montant: remise_montant || null
    },
    type: sequelize.QueryTypes.INSERT
  });
  
  let newId = null;
  if (result && result.id) {
    newId = result.id;
  } else if (Array.isArray(result) && result.length > 0 && result[0].id) {
    newId = result[0].id;
  }
  
  return { id: newId, status: 'inserted' };
};

// Sauvegarder les infos de demande d'achat
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

// Mettre à jour une demande d'achat
const updateDemandeAchat = async (id, demandeAchatData) => {
  const sequelize = getConnection();
  const { date, date_fin, description, part_id, contact_id } = demandeAchatData;
  
  const query = `
    UPDATE achat_document 
    SET date = :date, date_fin = :date_fin, description = :description, part_id = :part_id, contact_id = :contact_id
    WHERE document_id = :id
  `;
  
  await sequelize.query(query, {
    replacements: { id, date, date_fin: date_fin || null, description, part_id, contact_id: contact_id || null },
    type: sequelize.QueryTypes.UPDATE
  });
  
  return { success: true };
};

// Supprimer une demande d'achat
const deleteDemandeAchat = async (id) => {
  const sequelize = getConnection();
  
  return await sequelize.transaction(async (t) => {
    // Récupérer les IDs des détails pour supprimer les quill associés
    const details = await sequelize.query(
      'SELECT id FROM achat_document_detail WHERE document_id = :id',
      { replacements: { id }, type: sequelize.QueryTypes.SELECT, transaction: t }
    );
    
    // Supprimer les détails
    await sequelize.query(
      'DELETE FROM achat_document_detail WHERE document_id = :id',
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

// Récupérer les données de la demande d'achat pour génération PDF (ref, désignation, qte uniquement)
const getDemandeAchatForPDF = async (id) => {
  const sequelize = getConnection();
  
  // S'assurer que l'ID est un nombre
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    throw new Error(`ID invalide: ${id}`);
  }
  
  try {
    // Requête principale pour récupérer les infos de la demande d'achat
    const mainQuery = `
      SELECT  
        a.document_id, 
        a.numero, 
        a.date, 
        a.date_fin,
        a.description, 
        p.nom as fournisseur, 
        aa.nom as adresse,
        pi.identifiant as ice
      FROM achat_document a 
      INNER JOIN achat_document_detail ad ON ad.document_id = a.document_id
      INNER JOIN partenaire p ON p.part_id = a.part_id 
      LEFT OUTER JOIN adresse aa ON aa.part_id = p.part_id
      LEFT OUTER JOIN partenaire_identifiant pi ON pi.part_id = p.part_id AND pi.identifiant_type = 8
      WHERE a.document_id = :id
    `;
    
    const mainResult = await sequelize.query(mainQuery, {
      replacements: { id: numericId },
      type: sequelize.QueryTypes.SELECT
    });
    
    if (!mainResult || mainResult.length === 0) {
      console.log(`[getDemandeAchatForPDF] Aucune demande d'achat trouvée pour ID: ${numericId}`);
      return [];
    }
    
    const demandeAchat = mainResult[0];
    
    // Récupérer les détails des articles (ref, désignation, qte uniquement - pas de prix)
    const detailsQuery = `
      SELECT 
        d.id,
        ISNULL(ar.article_cod, '') as article_cod,
        COALESCE(NULLIF(CAST(q.designation AS NVARCHAR(MAX)), ''), ISNULL(ar.article_nom, '')) as article,
        ISNULL(d.quantite, 0) as quantite,
        CASE 
          WHEN LOWER(LTRIM(RTRIM(ISNULL(d.description, '')))) = 'client' THEN 'client'
          WHEN LOWER(LTRIM(RTRIM(ISNULL(d.description, '')))) = 'stock' THEN 'stock'
          ELSE ''
        END as destination
      FROM achat_document_detail d
      LEFT JOIN article ar ON ar.article_id = d.article_id
      LEFT JOIN achat_document_quill q ON q.quill_id = d.id
      WHERE d.document_id = :id
      ORDER BY d.id
    `;
    
    const details = await sequelize.query(detailsQuery, {
      replacements: { id: numericId },
      type: sequelize.QueryTypes.SELECT
    });
    
    // Combiner les données
    if (details.length === 0) {
      console.log(`[getDemandeAchatForPDF] Demande d'achat ${numericId} sans détails`);
      return [{
        ...demandeAchat,
        document_kind: 'DEMANDE_ACHAT',
        client: demandeAchat.fournisseur || '',
        article_cod: '',
        article: 'Aucun article',
        destination: '',
        quantite: 0
      }];
    }
    
    // Fusionner les infos de la demande d'achat avec chaque ligne de détail
    const results = details.map(detail => ({
      ...demandeAchat,
      document_kind: 'DEMANDE_ACHAT',
      client: demandeAchat.fournisseur || '',
      ...detail
    }));
    
    console.log(`[getDemandeAchatForPDF] ${results.length} ligne(s) trouvée(s) pour document_id: ${numericId}`);
    
    return results;
  } catch (error) {
    console.error('[getDemandeAchatForPDF] Erreur:', error.message);
    throw error;
  }
};

module.exports = {
  getAllDemandeAchat,
  getDemandeAchatById,
  getDemandeAchatForPDF,
  addDemandeAchat,
  saveDetail,
  saveInfo,
  updateDemandeAchat,
  deleteDemandeAchat,
  deleteLignesParIds
};

