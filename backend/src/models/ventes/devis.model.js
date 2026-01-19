const sequelize = require('../../config/database');


const formatToSqlDateTime = (value) => {
  if (!value) return null;
  return value.replace('T', ' ') + ':00';
};

// Récupérer tous les devis avec pagination (optimisé pour les performances)
// Utilise COUNT(*) OVER() pour éviter une requête séparée de comptage
const getAllDevis = async (options = {}, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'date',
      orderDirection = 'DESC',
      search = '',
      dateFrom = '',
      dateTo = ''
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const columnMapping = {
      'document_id': 'vd.document_id',
      'numero': 'vd.numero',
      'date': 'vd.date',
      'description': 'vd.description',
      'client': 'p.nom',
      'commercial': 'c.nom'
    };

    const finalColumnMapping = {
      'document_id': 'document_id',
      'numero': 'numero',
      'date': 'date',
      'description': 'description',
      'client': 'client',
      'commercial': 'commercial'
    };

    const validColumns = ['document_id', 'numero', 'date', 'client', 'commercial', 'description'];
    const mappedColumn = validColumns.includes(orderBy) ? (columnMapping[orderBy] || 'vd.date') : 'vd.date';
    const finalOrderColumn = validColumns.includes(orderBy) ? (finalColumnMapping[orderBy] || 'date') : 'date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = 'WHERE vd.type = 1';
    const replacements = {};

    if (search && search.trim()) {
      whereClause += ` AND (
        vd.numero LIKE :search 
        OR p.nom LIKE :search
        OR c.nom LIKE :search
        OR vd.description LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    if (dateFrom && dateFrom.trim()) {
      whereClause += ` AND vd.date >= :dateFrom`;
      replacements.dateFrom = dateFrom.trim();
    }

    if (dateTo && dateTo.trim()) {
      whereClause += ` AND vd.date <= :dateTo`;
      replacements.dateTo = dateTo.trim();
    }

    // Requête unique avec COUNT(*) OVER() pour obtenir le total sans requête séparée
    const query = `
      SELECT 
        document_id,
        numero,
        date,
        description,
        client,
        commercial,
        total_count
      FROM (
        SELECT 
          vd.document_id,
          vd.numero,
          vd.date,
          vd.description,
          p.nom AS client,
          c.nom AS commercial,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${mappedColumn} ${safeOrderDirection}) AS RowNum
        FROM vente_document vd
        LEFT OUTER JOIN partenaire p ON p.part_id = vd.part_id
        LEFT OUTER JOIN contact c ON c.id = vd.contact_id
        ${whereClause}
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY ${finalOrderColumn} ${safeOrderDirection}
    `;

    let results = [];
    let total = 0;

    try {
      const queryResult = await connectionToUse.query(query, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: connectionToUse.QueryTypes.SELECT
      });

      if (Array.isArray(queryResult)) {
        results = queryResult;
      } else if (queryResult && typeof queryResult === 'object') {
        results = [queryResult];
      }

      // Extraire le total depuis la première ligne (total_count est identique pour toutes les lignes)
      if (results.length > 0) {
        total = results[0].total_count || 0;
        // Supprimer total_count des résultats pour ne pas polluer les données
        results = results.map(({ total_count, ...rest }) => rest);
      }
    } catch (queryError) {
      console.error('[getAllDevis] Erreur:', queryError.message);
      throw new Error(`Erreur lors de la récupération des devis: ${queryError.message || 'Erreur inconnue'}`);
    }

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
    console.error('[getAllDevis] Erreur:', error.message);
    throw error;
  }
};

// Récupérer toutes les commandes avec pagination (optimisé pour les performances)
// Utilise COUNT(*) OVER() pour éviter une requête séparée de comptage
const getAllCommande = async (options = {}, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'date',
      orderDirection = 'DESC',
      search = ''
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['document_id', 'numero', 'date', 'client', 'commercial', 'description'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = 'WHERE vd.type = 2 AND vd.etat IS NULL';
    const replacements = {};

    if (search && search.trim()) {
      whereClause += ` AND (
        vd.numero LIKE :search 
        OR p.nom LIKE :search
        OR c.nom LIKE :search
        OR vd.description LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    // Requête unique avec COUNT(*) OVER() pour obtenir le total sans requête séparée
    const query = `
      SELECT 
        document_id,
        numero,
        date,
        description,
        client,
        commercial,
        total_count
      FROM (
        SELECT 
          vd.document_id,
          vd.numero,
          vd.date,
          vd.description,
          p.nom AS client,
          c.nom AS commercial,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${safeOrderBy} ${safeOrderDirection}) AS RowNum
        FROM vente_document vd
        LEFT OUTER JOIN partenaire p ON p.part_id = vd.part_id
        LEFT OUTER JOIN contact c ON c.id = vd.contact_id
        ${whereClause}
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY RowNum
    `;

    let results = [];
    let total = 0;

    try {
      const queryResult = await connectionToUse.query(query, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: connectionToUse.QueryTypes.SELECT
      });

      if (Array.isArray(queryResult)) {
        results = queryResult;
      } else {
        results = queryResult ? [queryResult] : [];
      }

      // Extraire le total depuis la première ligne
      if (results.length > 0) {
        total = results[0].total_count || 0;
        results = results.map(({ total_count, ...rest }) => rest);
      }
    } catch (queryError) {
      console.error('[getAllCommande] Erreur:', queryError.message);
      throw new Error(`Erreur lors de la récupération des commandes: ${queryError.message || 'Erreur inconnue'}`);
    }

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
    console.error('[getAllCommande] Erreur:', error.message);
    throw error;
  }
};

// Récupérer un devis par ID
const getDevisById = async (id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;

  try {
    // Récupérer les infos principales du devis
    const queryResult = await connectionToUse.query(
      'SELECT document_id , numero , date , description , part_id , contact_id FROM vente_document WHERE document_id = :id',
      {
        replacements: { id },
        type: connectionToUse.QueryTypes.SELECT,
      }
    );

    let devis;
    if (Array.isArray(queryResult)) {
      if (queryResult.length === 2 && Array.isArray(queryResult[0]) && !Array.isArray(queryResult[1])) {
        devis = queryResult[0][0];
      } else if (queryResult.length > 0) {
        devis = queryResult[0];
      } else {
        devis = null;
      }
    } else if (queryResult && typeof queryResult === 'object') {
      devis = queryResult;
    } else {
      devis = null;
    }

    if (!devis) {
      return null;
    }

    const partId = devis.part_id;

    // Récupérer les détails du devis
    let details = [];
    try {
      const detailsResult = await connectionToUse.query(
        `SELECT d.id, d.article_id, d.quantite, d.prix, d.taux_tva, d.remise, d.description,d.remise_montant,
      q.designation 
     FROM vente_document_detail d
     LEFT JOIN vente_document_quill q ON d.id = q.quill_id
     WHERE d.document_id = :id`,
        {
          replacements: { id },
          type: connectionToUse.QueryTypes.SELECT,
        }
      );

      if (Array.isArray(detailsResult)) {
        if (detailsResult.length === 2 && Array.isArray(detailsResult[0]) && !Array.isArray(detailsResult[1])) {
          details = detailsResult[0];
        } else {
          details = detailsResult;
        }
      } else if (detailsResult && typeof detailsResult === 'object') {
        details = [detailsResult];
      } else {
        details = [];
      }
    } catch (detailsError) {
      console.error('[getDevisById] Erreur détails:', detailsError.message);
      details = [];
    }

    // Récupérer les infos du partenaire
    let Infos = [];
    try {
      const infosResult = await connectionToUse.query(
        `SELECT nom , telephone , email , adresse , ice , cin ,rc , IF_ , PATENTE , cnss 
     FROM v_partenaire_infos
     WHERE part_id = :partId`,
        {
          replacements: { partId },
          type: connectionToUse.QueryTypes.SELECT,
        }
      );

      if (Array.isArray(infosResult)) {
        if (infosResult.length === 2 && Array.isArray(infosResult[0]) && !Array.isArray(infosResult[1])) {
          Infos = infosResult[0];
        } else {
          Infos = infosResult;
        }
      } else if (infosResult && typeof infosResult === 'object') {
        Infos = [infosResult];
      } else {
        Infos = [];
      }
    } catch (infosError) {
      Infos = [];
    }

    // Récupérer les infos du document (condition, etc.)
    let condition = [];
    try {
      const conditionResult = await connectionToUse.query(
        `SELECT  document_id	, date ,	condition ,	expedition ,	transporteur , type	 ,etat
     FROM vente_document_info
     WHERE document_id = :id`,
        {
          replacements: { id },
          type: connectionToUse.QueryTypes.SELECT,
        }
      );

      if (Array.isArray(conditionResult)) {
        if (conditionResult.length === 2 && Array.isArray(conditionResult[0]) && !Array.isArray(conditionResult[1])) {
          condition = conditionResult[0];
        } else {
          condition = conditionResult;
        }
      } else if (conditionResult && typeof conditionResult === 'object') {
        condition = [conditionResult];
      } else {
        condition = [];
      }
    } catch (conditionError) {
      condition = [];
    }

    return {
      ...devis,
      details: details || [],
      Infos: Infos || [],
      condition: condition || []
    };
  } catch (error) {
    console.error('[getDevisById] Erreur:', error.message);
    throw error;
  }
};


// Ajouter un devis
const addDevis = async ({ numero, date, description, part_id, contact_id, etat, type }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const dateSql = formatToSqlDateTime(date);

  const [result] = await connectionToUse.query(
    `INSERT INTO vente_document (numero, date , description , part_id , contact_id , etat, type) 
     OUTPUT INSERTED.document_id 
     VALUES (:numero, :dateSql , :description , :part_id , :contact_id , :etat, :type)`,
    { 
      replacements: { numero, dateSql, description, part_id, contact_id, etat: etat !== undefined ? etat : null, type: type || 1 },
      type: connectionToUse.QueryTypes.INSERT,
    }
  );
  return result.document_id;
};

// Ajouter une commande (type=2, etat=NULL)
const addCommande = async ({ numero, date, description, part_id, contact_id, etat, type }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const dateSql = formatToSqlDateTime(date);

  const [result] = await connectionToUse.query(
    `INSERT INTO vente_document (numero, date , description , part_id , contact_id , etat, type) 
     OUTPUT INSERTED.document_id 
     VALUES (:numero, :dateSql , :description , :part_id , :contact_id , NULL, :type)`,
    {
      replacements: { numero, dateSql, description, part_id, contact_id, type: type || 2 },
      type: connectionToUse.QueryTypes.INSERT,
    }
  );
  return result.document_id;
};

const saveDetail = async (detail, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;

  if (!detail || !Array.isArray(detail.lignes)) {
    console.log('Aucune ligne à traiter.');
    return;
  }

  for (const ligne of detail.lignes) {
    const {
      id,
      document_id,
      article_id,
      pu,
      qte,
      remise,
      remise_montant,
      taxe,
      designation,
      update_mode,
    } = ligne;

    if (update_mode === 'I') {
      // Insertion dans vente_document_detail
      const [result] = await connectionToUse.query(
        `INSERT INTO vente_document_detail 
         (document_id, article_id, prix, quantite, remise ,remise_montant, taux_tva , cr_date)
         OUTPUT INSERTED.id
         VALUES (:document_id, :article_id, :pu, :qte, :remise ,:remise_montant, :taxe , GETDATE())`,
        {
          replacements: { document_id, article_id, pu, qte, remise, remise_montant, taxe },
          type: sequelize.QueryTypes.INSERT,
        }
      );

      const insertedDetailId = result[0]?.id;
      // Insertion dans vente_document_quill
      try {
        await connectionToUse.query(
          `INSERT INTO vente_document_quill 
        (quill_id, document_id ,designation, article_id)
        VALUES (:quill_id, :document_id ,:designation, :article_id)`,
          {
            replacements: {
              quill_id: insertedDetailId,
              document_id,
              designation,
              article_id,
            },
            type: sequelize.QueryTypes.INSERT,
          }
        );
      } catch (error) {
        console.error('Erreur lors de l’insertion dans vente_document_quill:', error);
      }


    } else if (update_mode === 'U') {
      // Update dans vente_document_detail

      await connectionToUse.query(
        `UPDATE vente_document_detail
         SET article_id = :article_id,
             prix = :pu,
             quantite = :qte,
             remise = :remise,
             remise_montant = :remise_montant,
             taux_tva = :taxe,
             cr_date = GETDATE()
         WHERE id = :id`,
        {
          replacements: { article_id, pu, qte, remise, remise_montant, taxe, id },
          type: sequelize.QueryTypes.UPDATE,
        }
      );

      // Update dans vente_document_quill
      await connectionToUse.query(
        `UPDATE vente_document_quill
         SET designation = :designation,
             article_id = :article_id
         WHERE quill_id = :id`,
        {
          replacements: { designation, article_id, id },
          type: sequelize.QueryTypes.UPDATE,
        }
      );
    } else {
      console.warn(`Ligne ignorée : update_mode invalide (${update_mode})`);
    }
  }

  console.log('Tous les détails ont été traités.');
};

const saveInfo = async (info) => {
  console.log('info', info);

  if (!info || !info.document_id) {
    console.log('Aucune info valide à traiter.');
    return;
  }

  const { document_id, date, condition, expedition, transporteur } = info;

  try {
    // 1️⃣ Vérifier si une ligne existe déjà
    const [countResult] = await sequelize.query(
      `SELECT COUNT(document_id) AS count
       FROM vente_document_info
       WHERE document_id = :document_id`,
      {
        replacements: { document_id },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const count = countResult?.count || 0;

    if (count === 0) {
      // 2️⃣ Aucun enregistrement → INSERT
      await sequelize.query(
        `INSERT INTO vente_document_info
         (document_id, date, condition, expedition, transporteur)
         VALUES (:document_id, :date, :condition, :expedition, :transporteur)`,
        {
          replacements: { document_id, date, condition, expedition, transporteur },
          type: sequelize.QueryTypes.INSERT,
        }
      );
      console.log('Insertion effectuée dans vente_document_info.');
    } else {
      // 3️⃣ Déjà existant → UPDATE
      await sequelize.query(
        `UPDATE vente_document_info
         SET date = :date,
             condition = :condition,
             expedition = :expedition,
             transporteur = :transporteur
         WHERE document_id = :document_id`,
        {
          replacements: { document_id, date, condition, expedition, transporteur },
          type: sequelize.QueryTypes.UPDATE,
        }
      );
      console.log('Mise à jour effectuée dans vente_document_info.');
    }

  } catch (error) {
    console.error('Erreur lors de saveInfo :', error);
  }
};


// Modifier un client
const updateDevis = async (id, { date, description, part_id, contact_id }) => {
  const dateSql = formatToSqlDateTime(date);
  await sequelize.query(
    `UPDATE vente_document 
     SET  date = :dateSql , description = :description , part_id = :part_id ,
     contact_id = :contact_id 
     WHERE document_id = :id`,
    {
      replacements: { id, dateSql, description, part_id, contact_id },
      type: sequelize.QueryTypes.UPDATE,
    }
  );

  // 2. Récupérer les infos du client mis à jour
  const [infosClient] = await sequelize.query(
    `SELECT nom , telephone , email , adresse , ice , cin ,rc , IF_ , PATENTE , cnss 
     FROM v_partenaire_infos 
     WHERE part_id = :part_id`,
    {
      replacements: { part_id },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  return { id, date, description, part_id, contact_id, client_infos: infosClient || null };
};

// Supprimer les DEVIS
const deleteDevis = async (ids) => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) return;

  const placeholders = ids.map(() => '?').join(',');


  await sequelize.query(
    `DELETE FROM vente_document WHERE document_id IN (${placeholders})`,
    {
      replacements: ids,
      type: sequelize.QueryTypes.DELETE,
    }
  );
};

// Supprimer les lignes de détails et quill
const deleteDetailsAndQuill = async (ids) => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) return;

  const placeholders = ids.map(() => '?').join(',');


  await sequelize.query(
    `DELETE FROM vente_document_quill WHERE quill_id IN (${placeholders})`,
    {
      replacements: ids,
      type: sequelize.QueryTypes.DELETE,
    }
  );

  await sequelize.query(
    `DELETE FROM vente_document_detail WHERE id IN (${placeholders})`,
    {
      replacements: ids,
      type: sequelize.QueryTypes.DELETE,
    }
  );
};

// Transférer un devis vers une commande (créer un nouveau document avec parent)
const transfererDevisVersCommande = async (devisId, numeroCommande, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;

  try {
    // 1. Récupérer le devis d'origine avec tous ses détails
    const devis = await getDevisById(devisId, connectionToUse);

    if (!devis) {
      throw new Error(`Devis avec ID ${devisId} non trouvé`);
    }

    // 2. Date du jour (heure locale, SANS toISOString)
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');

    const dateSql =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    // 3. Créer un nouveau document commande avec parent = document_id du devis
    const [insertResult] = await connectionToUse.query(
      `INSERT INTO vente_document 
       (numero, date, description, part_id, contact_id, etat, type, parent) 
       OUTPUT INSERTED.document_id 
       VALUES (:numero, :dateSql, :description, :part_id, :contact_id, NULL, :type, :parent)`,
      {
        replacements: {
          numero: numeroCommande,
          dateSql,
          description: devis.description || '',
          part_id: devis.part_id,
          contact_id: devis.contact_id,
          type: 2, // Type commande
          parent: devisId // Référence au devis d'origine
        },
        type: connectionToUse.QueryTypes.INSERT,
      }
    );

    const nouveauDocumentId = insertResult[0]?.document_id || insertResult?.document_id;

    if (!nouveauDocumentId) {
      throw new Error('Erreur lors de la création du document commande');
    }

    // 4. Copier tous les détails du devis vers la commande
    if (devis.details && devis.details.length > 0) {
      for (const detail of devis.details) {
        // Insérer dans vente_document_detail
        const [detailResult] = await connectionToUse.query(
          `INSERT INTO vente_document_detail 
           (document_id, article_id, prix, quantite, remise, remise_montant, taux_tva, cr_date)
           OUTPUT INSERTED.id
           VALUES (:document_id, :article_id, :prix, :quantite, :remise, :remise_montant, :taux_tva, GETDATE())`,
          {
            replacements: {
              document_id: nouveauDocumentId,
              article_id: detail.article_id,
              prix: detail.prix,
              quantite: detail.quantite,
              remise: detail.remise || 0,
              remise_montant: detail.remise_montant || 0,
              taux_tva: detail.taux_tva || 0,
            },
            type: connectionToUse.QueryTypes.INSERT,
          }
        );

        const nouveauDetailId = detailResult[0]?.id || detailResult?.id;

        // Insérer dans vente_document_quill si designation existe
        if (detail.designation) {
          try {
            await connectionToUse.query(
              `INSERT INTO vente_document_quill 
               (quill_id, document_id, designation, article_id)
               VALUES (:quill_id, :document_id, :designation, :article_id)`,
              {
                replacements: {
                  quill_id: nouveauDetailId,
                  document_id: nouveauDocumentId,
                  designation: detail.designation,
                  article_id: detail.article_id
                },
                type: connectionToUse.QueryTypes.INSERT,
              }
            );
          } catch (error) {
            console.error('Erreur lors de l\'insertion dans vente_document_quill:', error);
            // Continuer même en cas d'erreur sur quill
          }
        }
      }
    }

    // 5. Copier les infos du document (condition, expedition, etc.) si elles existent
    if (devis.condition && devis.condition.length > 0) {
      const condition = devis.condition[0];
      try {
        await connectionToUse.query(
          `INSERT INTO vente_document_info 
           (document_id, date, condition, expedition, transporteur)
           VALUES (:document_id, :date, :condition, :expedition, :transporteur)`,
          {
            replacements: {
              document_id: nouveauDocumentId,
              date: condition.date || today,
              condition: condition.condition || '',
              expedition: condition.expedition || '',
              transporteur: condition.transporteur || ''
            },
            type: connectionToUse.QueryTypes.INSERT,
          }
        );
      } catch (error) {
        console.error('Erreur lors de l\'insertion dans vente_document_info:', error);
        // Continuer même en cas d'erreur sur info
      }
    }

    return {
      document_id: nouveauDocumentId,
      numero: numeroCommande,
      date: dateSql,
      parent: devisId
    };

  } catch (error) {
    console.error('[transfererDevisVersCommande] ❌ Erreur:', error);
    throw error;
  }
};


module.exports = {
  getAllDevis,
  getAllCommande,
  getDevisById,
  addDevis,
  addCommande,
  saveDetail,
  saveInfo,
  updateDevis,
  deleteDevis,
  deleteDetailsAndQuill,
  transfererDevisVersCommande
};
