const { getConnection } = require('../../config/database');

const buildReceivedByArticleMap = (rows) => new Map(
  (Array.isArray(rows) ? rows : []).map((row) => [
    Number(row?.article_id || 0),
    Number(row?.quantite_receptionnee || 0)
  ])
);

const allocateReceptionStateByArticle = (details, receivedByArticleMap) => {
  const remainingByArticle = new Map(receivedByArticleMap || []);

  return (Array.isArray(details) ? details : []).map((detail) => {
    const articleKey = Number(detail?.article_id || 0);
    const orderedQty = Number(detail?.quantite || 0);
    const articleReceived = Number(remainingByArticle.get(articleKey) || 0);
    const receivedOnLine = Math.max(0, Math.min(orderedQty, articleReceived));
    const remainingQty = Math.max(0, orderedQty - receivedOnLine);

    if (articleKey > 0) {
      remainingByArticle.set(articleKey, Math.max(0, articleReceived - receivedOnLine));
    }

    return {
      ...detail,
      quantite_commandee: orderedQty,
      quantite_receptionnee: receivedOnLine,
      quantite_restante: remainingQty,
      etat: remainingQty <= 0 ? 1 : 0
    };
  });
};

// RÃ©cupÃ©rer tous les bons de commande avec pagination (type = 2)
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

    // VÃ©rifier que orderBy est une colonne valide
    const validColumns = ['numero', 'date', 'fournisseur', 'description', 'progression'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    // Mapper les colonnes pour l'ORDER BY dans la requÃªte SQL
    const orderByColumn = safeOrderBy === 'fournisseur'
      ? 'p.nom'
      : safeOrderBy === 'progression'
        ? `CASE
             WHEN ISNULL(cmd.total_commande, 0) <= 0 THEN 0
             ELSE (ISNULL(rec.total_receptionnee, 0) * 100.0) / NULLIF(cmd.total_commande, 0)
           END`
        : `a.${safeOrderBy}`;

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

    // RequÃªte avec pagination basÃ©e sur la requÃªte spÃ©cifiÃ©e
    // On ajoute document_id pour les actions (modifier/supprimer)
    const query = `
      SELECT 
        document_id,
        numero,
        date,
        fournisseur,
        description,
        total_commande,
        total_receptionnee,
        progression_percent
      FROM (
        SELECT 
          a.document_id,
          a.numero,
          a.date,
          p.nom AS fournisseur,
          a.description,
          ISNULL(cmd.total_commande, 0) AS total_commande,
          ISNULL(rec.total_receptionnee, 0) AS total_receptionnee,
          CAST(ROUND(
            CASE
              WHEN ISNULL(cmd.total_commande, 0) <= 0 THEN 0
              ELSE (ISNULL(rec.total_receptionnee, 0) * 100.0) / NULLIF(cmd.total_commande, 0)
            END,
            2
          ) AS DECIMAL(10,2)) AS progression_percent,
          ROW_NUMBER() OVER (ORDER BY ${orderByColumn} ${safeOrderDirection}) AS RowNum
        FROM achat_document a
        INNER JOIN partenaire p ON p.part_id = a.part_id AND p.type = 2
        LEFT JOIN (
          SELECT document_id, SUM(ISNULL(quantite, 0)) AS total_commande
          FROM achat_document_detail
          GROUP BY document_id
        ) cmd ON cmd.document_id = a.document_id
        LEFT JOIN (
          SELECT s.parent AS commande_id, SUM(ISNULL(sd.quantite, 0)) AS total_receptionnee
          FROM stock s
          INNER JOIN stock_detail sd ON sd.stock_id = s.id
          WHERE s.type = 1 AND (s.etat = 1 OR s.etat IS NULL)
          GROUP BY s.parent
        ) rec ON rec.commande_id = a.document_id
        ${whereClause}
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY RowNum
    `;
    
    // RequÃªte pour compter le total
    const countReplacements = search && search.trim() ? { search: `%${search.trim()}%` } : {};
    const countQuery = `
      SELECT COUNT(*) as total
      FROM achat_document a
      INNER JOIN partenaire p ON p.part_id = a.part_id AND p.type = 2
      ${whereClause}
    `;

    // ExÃ©cuter les requÃªtes
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
      console.error('[getAllBonCommande] Erreur lors de la requÃªte:', queryError);
      throw new Error(`Erreur lors de la rÃ©cupÃ©ration des bons de commande: ${queryError.message || 'Erreur inconnue'}`);
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

// RÃ©cupÃ©rer un bon de commande par ID
const getBonCommandeById = async (id) => {
  const sequelize = getConnection();
  
  try {
    // RÃ©cupÃ©rer les infos principales du bon de commande
    const bonCommandeResult = await sequelize.query(
      'SELECT document_id, numero, date, description, part_id, contact_id, type FROM achat_document WHERE document_id = :id',
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const bonCommande = Array.isArray(bonCommandeResult) ? bonCommandeResult[0] : bonCommandeResult;

    if (!bonCommande) return null;

    const partId = bonCommande.part_id;

    // RÃ©cupÃ©rer les dÃ©tails du bon de commande (+ infos article pour afficher l'article mÃªme sans quill)
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
         ORDER BY d.id ASC`,
        {
          replacements: { id },
          type: sequelize.QueryTypes.SELECT,
        }
      );
      
      // Essayer de rÃ©cupÃ©rer les dÃ©signations quill sÃ©parÃ©ment
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
        
        // Fusionner les dÃ©signations quill avec les dÃ©tails
        if (Array.isArray(quillData) && quillData.length > 0) {
          const quillMap = new Map(quillData.map(q => [q.quill_id, q.designation]));
          details = details.map(d => ({
            ...d,
            designation: quillMap.get(d.id) || d.description || d.article_nom || ''
          }));
        }
      } catch (quillError) {
        console.warn('[getBonCommandeById] Table achat_document_quill non accessible:', quillError.message);
        // Continuer sans les donnÃ©es quill
        details = details.map(d => ({
          ...d,
          designation: d.description || d.article_nom || ''
        }));
      }

      const receivedRows = await sequelize.query(
        `
          SELECT
            sd.article_id,
            SUM(ISNULL(sd.quantite, 0)) AS quantite_receptionnee
          FROM stock s
          INNER JOIN stock_detail sd ON sd.stock_id = s.id
          WHERE s.type = 1
            AND s.parent = :id
            AND (s.etat = 1 OR s.etat IS NULL)
          GROUP BY sd.article_id
        `,
        {
          replacements: { id },
          type: sequelize.QueryTypes.SELECT,
        }
      );

      details = allocateReceptionStateByArticle(details, buildReceivedByArticleMap(receivedRows));
    } catch (detailError) {
      console.error('[getBonCommandeById] Erreur rÃ©cupÃ©ration dÃ©tails:', detailError.message);
      details = [];
    }

    // RÃ©cupÃ©rer les infos du partenaire (fournisseur)
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
      console.warn('[getBonCommandeById] Vue v_partenaire_infos non accessible, utilisation de partenaire:', infoError.message);
      // Fallback: requÃªte directe sur la table partenaire
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
        console.error('[getBonCommandeById] Erreur rÃ©cupÃ©ration partenaire:', partenaireError.message);
        Infos = [];
      }
    }

    // RÃ©cupÃ©rer les infos de condition
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
        console.warn('[getBonCommandeById] Table achat_document_info non accessible:', conditionError.message);
      }
      condition = [];
    }

    return {
      ...bonCommande,
      details: details || [],
      Infos: Infos || [],
      condition: condition || []
    };
  } catch (error) {
    console.error('[getBonCommandeById] Erreur gÃ©nÃ©rale:', error);
    throw error;
  }
};  

const formatToSqlDateTime = (value) => {
  if (!value) return null;
  
  let dateStr;
  
  // Si c'est un objet Date, le convertir en ISO string
  if (value instanceof Date) {
    dateStr = value.toISOString();
  } else if (typeof value !== 'string') {
    dateStr = String(value);
  } else {
    dateStr = value;
  }
  
  // Si la valeur contient 'T' (format ISO), la convertir
  if (dateStr.includes('T')) {
    // Enlever le 'Z' Ã  la fin si prÃ©sent (UTC)
    dateStr = dateStr.replace('Z', '');
    // Remplacer 'T' par un espace
    dateStr = dateStr.replace('T', ' ');
    // Si la date se termine par des millisecondes (.xxx), les garder
    // Sinon, ajouter ':00' pour les secondes
    if (!dateStr.match(/:\d{2}(\.\d+)?$/)) {
      dateStr += ':00';
    }
    return dateStr;
  }
  
  // Si la valeur est dÃ©jÃ  au format SQL (YYYY-MM-DD HH:mm:ss), la retourner telle quelle
  // VÃ©rifier si c'est un format de date valide
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
    return dateStr;
  }
  
  // Sinon, essayer de parser et reformater
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
  } catch (e) {
    // Ignorer l'erreur
  }
  
  return dateStr;
};


// Ajouter un bon de commande (type = 2)
const addBonCommande = async ({ numero, date, description, part_id, contact_id, etat, type, parent }, sequelizeConnection = null) => {
  // Toujours obtenir l'instance Sequelize pour QueryTypes, mÃªme si une transaction est passÃ©e
  const sequelize = getConnection();
  const { getCompteurCurrent } = require('../../services/compteur.service');
  
  // Si une transaction est fournie, l'utiliser, sinon en crÃ©er une nouvelle
  const executeInTransaction = async (callback) => {
    if (sequelizeConnection) {
      // Si une connexion/transaction est fournie, l'utiliser directement
      return await callback(sequelizeConnection);
    } else {
      // Sinon, crÃ©er une nouvelle transaction
      return await sequelize.transaction(async (t) => {
        return await callback(t);
      });
    }
  };
  
  return await executeInTransaction(async (t) => {
    try {
      let numeroFinal = numero;
      let compteurCode = null;
      
      if (!numeroFinal || numeroFinal.trim() === '') {
        // Bon de commande d'achat - type = 2
        compteurCode = 'BCF';
        
        if (compteurCode) {
          const compteurActuel = await getCompteurCurrent(compteurCode);
          if (compteurActuel === null || compteurActuel === undefined) {
            throw new Error(`Impossible de rÃ©cupÃ©rer le compteur ${compteurCode}`);
          }
          
          const anneeCourte = new Date().getFullYear().toString().slice(2);
          const prefix = 'BCF';
          numeroFinal = `${prefix}${anneeCourte}-${compteurActuel.toString().padStart(4, '0')}`;
        }
      }
      
      // Forcer type = 2 pour bon de commande
      const typeFinal = 2;
      const dateSql = formatToSqlDateTime(date);
  
      let query = `INSERT INTO achat_document (numero, date, description, part_id, etat, type`;
      let values = `:numero, :dateSql, :description, :part_id, :etat, :type`;
      let replacements = { 
        numero: numeroFinal, 
        dateSql, 
        description, 
        part_id, 
       // contact_id: contact_id || null, 
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
        throw new Error('Erreur lors de la crÃ©ation du bon de commande : aucun ID retournÃ©');
      }
    } catch (error) {
      console.error('âŒ Erreur lors de l\'insertion du bon de commande:', error);
      throw new Error(`Erreur lors de l'ajout du bon de commande: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Sauvegarder un dÃ©tail de bon de commande (Insert ou Update)
const saveDetail = async (detailData, sequelizeConnection = null) => {
  // Toujours obtenir l'instance Sequelize pour QueryTypes, mÃªme si une transaction est passÃ©e
  const sequelize = getConnection();
  const { 
    id, 
    document_id, 
    article_id, 
    designation,
    qte, 
    pu, 
    prix,
    taxe, 
    remise, 
    remise_montant,
    update_mode 
  } = detailData;
  
  // Accepter soit 'pu' soit 'prix' pour le prix unitaire
  const prixUnitaire = pu !== undefined && pu !== null ? Number(pu) : (prix !== undefined && prix !== null ? Number(prix) : 0);
  
  // Mode Update
  if (update_mode === 'U' && id) {
    const updateQuery = `
      UPDATE achat_document_detail 
      SET article_id = :article_id, 
          quantite = :quantite, 
          prix = :prix, 
          taux_tva = :taux_tva, 
          remise = :remise, 
          remise_montant = :remise_montant
      WHERE id = :id
    `;
    
    await sequelize.query(updateQuery, {
      replacements: {
        id,
        article_id: article_id || null,
        quantite: qte || 0,
        prix: prixUnitaire,
        taux_tva: taxe || 0.2,
        remise: remise || null,
        remise_montant: remise_montant || null
      },
      type: sequelize.QueryTypes.UPDATE,
      transaction: sequelizeConnection || undefined
    });
    
    return { id, status: 'updated' };
  }
  
  // Mode Insert
  const insertQuery = `
    INSERT INTO achat_document_detail (document_id, article_id, quantite, prix, taux_tva, remise, remise_montant ,cr_date)
    OUTPUT INSERTED.id
    VALUES (:document_id, :article_id, :quantite, :prix, :taux_tva, :remise, :remise_montant , GETDATE())
  `;
  
  const [result] = await sequelize.query(insertQuery, {
    replacements: {
      document_id,
      article_id: article_id || null,
      quantite: qte || 0,
      prix: prixUnitaire,
      taux_tva: taxe || 0.2,
      remise: remise || null,
      remise_montant: remise_montant || null
    },
    type: sequelize.QueryTypes.INSERT,
    transaction: sequelizeConnection || undefined
  });
  
  let newId = null;
  if (result && result.id) {
    newId = result.id;
  } else if (Array.isArray(result) && result.length > 0 && result[0].id) {
    newId = result[0].id;
  }
  
  return { id: newId, status: 'inserted' };
};

// Sauvegarder les infos de bon de commande
const saveInfo = async (infoData, sequelizeConnection = null) => {
  // Toujours obtenir l'instance Sequelize pour QueryTypes, mÃªme si une transaction est passÃ©e
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
    type: sequelize.QueryTypes.UPDATE,
    transaction: sequelizeConnection || undefined
  });
  
  return { success: true };
};

// Mettre Ã  jour un bon de commande
const updateBonCommande = async (id, bonCommandeData) => {
  const sequelize = getConnection();
  const { date, description, part_id, contact_id } = bonCommandeData;
  
  const query = `
    UPDATE achat_document 
    SET date = :date, description = :description, part_id = :part_id, contact_id = :contact_id
    WHERE document_id = :id
  `;
  
  await sequelize.query(query, {
    replacements: { id, date, description, part_id, contact_id: contact_id || null },
    type: sequelize.QueryTypes.UPDATE
  });
  
  return { success: true };
};

// Supprimer un bon de commande
const deleteBonCommande = async (id) => {
  const sequelize = getConnection();
  
  return await sequelize.transaction(async (t) => {
    // RÃ©cupÃ©rer les IDs des dÃ©tails pour supprimer les quill associÃ©s
    const details = await sequelize.query(
      'SELECT id FROM achat_document_detail WHERE document_id = :id',
      { replacements: { id }, type: sequelize.QueryTypes.SELECT, transaction: t }
    );
    
    // Supprimer les quill associÃ©s aux dÃ©tails
    if (details && details.length > 0) {
      const detailIds = details.map(d => d.id);
      const placeholders = detailIds.map((_, index) => `:id${index}`).join(',');
      const quillReplacements = {};
      detailIds.forEach((detailId, index) => {
        quillReplacements[`id${index}`] = detailId;
      });
      
    }
    
    // Supprimer les dÃ©tails
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

// RÃ©cupÃ©rer les donnÃ©es du bon de commande pour gÃ©nÃ©ration PDF
const getBonCommandeForPDF = async (id) => {
  const sequelize = getConnection();
  
  // S'assurer que l'ID est un nombre
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    throw new Error(`ID invalide: ${id}`);
  }
  
  try {
    // RequÃªte principale pour rÃ©cupÃ©rer les infos du bon de commande
    const mainQuery = `
      SELECT  
        a.document_id, 
        a.numero, 
        a.date, 
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
      console.log(`[getBonCommandeForPDF] Aucun bon de commande trouvÃ© pour ID: ${numericId}`);
      return [];
    }
    
    const bonCommande = mainResult[0];
    
    // RÃ©cupÃ©rer les dÃ©tails des articles
    const detailsQuery = `
      SELECT 
        d.id,
        ISNULL(ar.article_cod, '') as article_cod,
        ISNULL(ar.article_nom, '') as article,
        ISNULL(d.quantite, 0) as quantite,
        ISNULL(d.prix, 0) as prix,
        ISNULL(d.taux_tva, 0.2) as taux_tva,
        ISNULL(d.remise, 0) as remise,
        ISNULL(d.remise_montant, 0) as remise_montant
      FROM achat_document_detail d
      LEFT JOIN article ar ON ar.article_id = d.article_id
      WHERE d.document_id = :id
      ORDER BY d.id
    `;
    
    const details = await sequelize.query(detailsQuery, {
      replacements: { id: numericId },
      type: sequelize.QueryTypes.SELECT
    });
    
    // Combiner les donnÃ©es
    if (details.length === 0) {
      console.log(`[getBonCommandeForPDF] Bon de commande ${numericId} sans dÃ©tails`);
      return [{
        ...bonCommande,
        article_cod: '',
        article: 'Aucun article',
        quantite: 0,
        prix: 0,
        taux_tva: 0.2,
        remise: 0,
        remise_montant: 0
      }];
    }
    
    // Fusionner les infos du bon de commande avec chaque ligne de dÃ©tail
    const results = details.map(detail => ({
      ...bonCommande,
      ...detail
    }));
    
    console.log(`[getBonCommandeForPDF] ${results.length} ligne(s) trouvÃ©e(s) pour document_id: ${numericId}`);
    
    return results;
  } catch (error) {
    console.error('[getBonCommandeForPDF] Erreur:', error.message);
    throw error;
  }
};

module.exports = {
  getAllBonCommande,
  getBonCommandeById,
  getBonCommandeForPDF,
  addBonCommande,
  saveDetail,
  saveInfo,
  updateBonCommande,
  deleteBonCommande,
  deleteLignesParIds
};

