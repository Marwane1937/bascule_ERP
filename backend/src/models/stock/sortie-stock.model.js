const { getConnection } = require('../../config/database');

// Récupérer toutes les entrées de stock avec pagination
// Optimisé avec COUNT(*) OVER() pour éviter une requête séparée de comptage
const getAllSortiesStock = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
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

    const validColumns = ['document_id', 'numero', 'date', 'client', 'commercial', 'total_ht', 'total_tva', 'total_ttc'];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = 'WHERE s.type = 22';
    const replacements = {};

    if (search && search.trim()) {
      whereClause += ` AND (
        s.numero LIKE :search 
        OR p.nom LIKE :search
        OR c.nom LIKE :search
        OR s.description LIKE :search
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
        part_ref,
        client,
        commercial,
        facture,
        total_ht,
        total_tva,
        total_ttc,
        total_count
      FROM (
        SELECT 
          s.id AS document_id,
          s.numero,
          s.date,
          s.description,
          s.part_ref,
          p.nom AS client,
          c.nom AS commercial,
          ISNULL(t.total_ht, 0) AS total_ht,
          ISNULL(t.total_tva, 0) AS total_tva,
          ISNULL(t.total_ttc, 0) AS total_ttc,
          CASE WHEN s.facture_id IS NULL THEN 'NON FACTURE' ELSE 'FACTURE' END AS facture,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${safeOrderBy} ${safeOrderDirection}) AS RowNum
        FROM stock s
        LEFT JOIN (
            SELECT stock_id,
                   SUM(quantite * prix) AS total_ht,
                   SUM((quantite * prix) * taux_tva) AS total_tva,
                   SUM((quantite * prix) + (quantite * prix) * taux_tva) AS total_ttc
            FROM stock_detail
            GROUP BY stock_id
        ) t ON t.stock_id = s.id
        LEFT JOIN partenaire p ON p.part_id = s.part_id
        LEFT JOIN contact c ON c.id = s.employe_id
        ${whereClause}
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY RowNum
    `;

    let results = [];
    let total = 0;

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

      // Extraire le total depuis la première ligne
      if (results.length > 0) {
        total = results[0].total_count || 0;
        results = results.map(({ total_count, ...rest }) => rest);
      }
    } catch (queryError) {
      console.error('[getAllLivraisons] Erreur:', queryError.message);
      throw new Error(`Erreur lors de la récupération des livraisons: ${queryError.message || 'Erreur inconnue'}`);
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
    console.error('[getAllLivraisons] Erreur:', error.message);
    throw error;
  }
};

// Compter le total des entrées de stock
const countAllSortiesStock = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const [result] = await sequelize.query('SELECT COUNT(*) AS total FROM stock WHERE type = 22');

    if (Array.isArray(result) && result.length > 0) {
      return result[0].total || 0;
    } else if (result && result.total !== undefined) {
      return result.total;
    }
    return 0;
  } catch (error) {
    console.error('Erreur dans countAllSortiesStock:', error);
    return 0;
  }
};


// Récupérer une entrée de stock par ID
const getSortieStockById = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  // Récupérer les infos principales depuis stock
  let entreeStockRows;
  try {
    entreeStockRows = await sequelize.query(
      `SELECT 
        s.id,
        s.numero,
        s.date,
        s.description,
        s.part_id,
        s.employe_id AS contact_id,
        s.part_ref,
        p.nom AS client_nom,
        c.nom AS commercial_nom
      FROM stock s
      LEFT JOIN partenaire p ON p.part_id = s.part_id
      LEFT JOIN contact c ON c.id = s.employe_id
      WHERE s.id = :id AND s.type = 22`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );
  } catch (error) {
    console.error(`[getSortieStockById] Erreur stock:`, error.message);
    entreeStockRows = [];
  }

  let entreeStock = Array.isArray(entreeStockRows) && entreeStockRows.length > 0
    ? entreeStockRows[0]
    : null;

  let source = 'stock';

  // Si aucune entrée de stock trouvée, retourner null
  if (!entreeStock) {
    return null;
  }

  const documentId = entreeStock.id;

  // Récupérer les détails de l'entrée de stock depuis stock_detail
  let details = [];
  try {
    const detailRows = await sequelize.query(
      `SELECT 
        sd.id, 
        sd.id AS detail_id, 
        sd.stock_id AS document_id, 
        sd.article_id, 
        sd.quantite AS qte, 
        sd.prix AS pu, 
        sd.taux_tva AS tva,
        sd.remise,
        sd.remise_montant,
        sd.rubrique_id,
        sd.quantite * sd.prix AS ht,
        (sd.quantite * sd.prix) * sd.taux_tva AS tva_montant,
        (sd.quantite * sd.prix) + ((sd.quantite * sd.prix) * sd.taux_tva) AS ttc,
        sd.description,
        a.article_nom,
        l.nom AS rubrique_nom
      FROM stock_detail sd
      LEFT JOIN article a ON a.article_id = sd.article_id
      LEFT JOIN listes l ON l.id = sd.rubrique_id AND l.group_id = 7000
      WHERE sd.stock_id = :id
      ORDER BY sd.id DESC`,
      {
        replacements: { id: documentId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    details = Array.isArray(detailRows) ? detailRows : [];
  } catch (error) {
    console.error(`[getSortieStockById] Erreur lors de la récupération des détails depuis stock_detail:`, error);
    details = [];
  }

  // Pas de fallback nécessaire pour les entrées de stock - elles sont uniquement dans stock_detail
  // Si aucun détail trouvé, retourner un tableau vide
  if (!Array.isArray(details) || details.length === 0) {
    details = [];
  }

  const clientId = entreeStock.part_id;

  // Harmoniser la structure des détails pour le frontend
  const normalizedDetails = (Array.isArray(details) ? details : []).map((detail, index) => {
    const articleId = detail.article_id ?? null;
    const prix = detail.pu ?? detail.prix ?? 0;
    const quantite = detail.qte ?? detail.quantite ?? 0;
    const taux_tva = detail.tva ?? detail.taux_tva ?? 0;
    const designation = detail.description ?? detail.designation ?? detail.article_nom ?? '';

    // Pour les entrées de stock, toujours utiliser stock_detail (pas de fallback)
    let remiseMode = null;
    let remiseFraction = null;
    let remiseMontant = null;

    const remiseMontantStock = detail.remise_montant != null && detail.remise_montant !== undefined ? Number(detail.remise_montant) : null;
    const remiseFractionStock = detail.remise != null && detail.remise !== undefined ? Number(detail.remise) : null;

    if (detail.remise_montant != null && detail.remise_montant !== undefined && (detail.remise === null || detail.remise === undefined)) {
      remiseMode = 'montant';
      remiseMontant = remiseMontantStock !== null && !isNaN(remiseMontantStock) ? remiseMontantStock : 0;
      remiseFraction = null;
    } else if (detail.remise != null && detail.remise !== undefined && (detail.remise_montant === null || detail.remise_montant === undefined)) {
      remiseMode = 'pourcentage';
      remiseFraction = remiseFractionStock !== null && !isNaN(remiseFractionStock) ? remiseFractionStock : 0;
      remiseMontant = null;
    } else {
      remiseFraction = remiseFractionStock !== null && !isNaN(remiseFractionStock) ? remiseFractionStock : 0;
      remiseMontant = remiseMontantStock !== null && !isNaN(remiseMontantStock) ? remiseMontantStock : 0;
      remiseMode = null;
    }

    const rawRemiseMontant = remiseMontant;
    const rawRemisePercent = remiseFraction;
    return {
      id: detail.id ?? detail.detail_id ?? null,
      detail_id: detail.detail_id ?? detail.id ?? null,
      document_id: detail.document_id ?? documentId,
      article_id: articleId,
      designation,
      description: detail.description ?? detail.article_nom ?? '',
      article_nom: detail.article_nom ?? designation,
      pu: prix,
      prix,
      qte: quantite,
      quantite,
      tva: taux_tva,
      taux_tva,
      remise: rawRemisePercent,
      remise_montant: rawRemiseMontant,
      remise_mode: remiseMode,
      ht: detail.ht ?? prix * quantite,
      ttc: detail.ttc ?? (prix * quantite) * (1 + (taux_tva || 0))
    };
  });

  // Récupérer les informations du client (partenaire)
  let clientInfo = null;
  if (clientId != null) {
    const columnRows = await sequelize.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = 'partenaire'`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const availableColumns = new Set(
      Array.isArray(columnRows)
        ? columnRows
          .map((row) => {
            if (!row) return null;
            const entries = Object.values(row);
            return entries.length > 0 ? String(entries[0]).toLowerCase() : null;
          })
          .filter(Boolean)
        : []
    );

    const selectFields = ['p.part_id', 'p.nom'];

    const optionalColumns = [
      { column: 'telephone', alias: 'telephone' },
      { column: 'email', alias: 'email' },
      { column: 'adresse', alias: 'adresse' },
      { column: 'ice', alias: 'ice' },
      { column: 'cin', alias: 'cin' },
      { column: 'rc', alias: 'rc' },
      { column: 'IF_', alias: 'IF_' },
      { column: 'PATENTE', alias: 'PATENTE' },
      { column: 'cnss', alias: 'cnss' }
    ];

    optionalColumns.forEach(({ column, alias }) => {
      const key = column.toLowerCase();
      if (availableColumns.has(key)) {
        selectFields.push(`p.${column} AS [${alias}]`);
      } else {
        selectFields.push(`NULL AS [${alias}]`);
      }
    });

    const clientRows = await sequelize.query(
      `SELECT ${selectFields.join(', ')} 
       FROM partenaire p
       WHERE p.part_id = :part_id`,
      {
        replacements: { part_id: clientId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (Array.isArray(clientRows) && clientRows.length > 0) {
      clientInfo = clientRows[0];
    } else if (clientRows && typeof clientRows === 'object') {
      clientInfo = clientRows;
    }
  }

  const result = {
    ...entreeStock,
    document_id: documentId,
    part_id: entreeStock.part_id,
    contact_id: entreeStock.contact_id ?? entreeStock.employe_id ?? null,
    client: entreeStock.client_nom || null,
    commercial: entreeStock.commercial_nom || null,
    client_nom: entreeStock.client_nom || null,
    commercial_nom: entreeStock.commercial_nom || null,
    source,
    details: Array.isArray(normalizedDetails) ? normalizedDetails : [],
    clientInfo: clientInfo || null
  };

  return result;
};

// Ajouter une nouvelle entrée de stock dans stock
const addSortieStock = async ({ numero, date, description, part_id, contact_id, type = 22, etat = 1, parent = null }, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getCompteurCurrent } = require('../../services/compteur.service');

  // Utiliser une transaction pour garantir l'atomicité
  return await sequelize.transaction(async (t) => {
    try {
      // Si le numéro n'est pas fourni, le générer depuis le compteur SRT
      let numeroFinal = numero;
      if (!numeroFinal || numeroFinal.trim() === '') {
        // Récupérer le compteur actuel (sans l'incrémenter)
        const compteurActuel = await getCompteurCurrent('SRT', sequelize);
        if (compteurActuel === null || compteurActuel === undefined) {
          throw new Error('Impossible de récupérer le compteur SRT');
        }

        // Formater le numéro
        const anneeCourte = new Date().getFullYear().toString().slice(2);
        numeroFinal = `SRT${anneeCourte}-${compteurActuel.toString().padStart(4, '0')}`;
      }

      // Construire la requête dynamiquement selon les champs fournis
      let columns = 'numero, date, description, part_id, employe_id, type, etat';
      let values = ':numero, :date, :description, :part_id, :employe_id, :type, :etat';
      let replacements = {
        numero: numeroFinal,
        date: date || null,
        description: description || null,
        part_id: part_id || null,
        employe_id: contact_id || null,
        type: type || 22,
        etat: etat || 1
      };

      // Ajouter parent si fourni
      if (parent !== undefined && parent !== null) {
        columns += ', parent';
        values += ', :parent';
        replacements.parent = parent;
      }

      // Ajouter l'incrémentation du compteur dans la même transaction si le numéro a été généré
      let query;
      if (!numero || numero.trim() === '') {
        query = `
          INSERT INTO stock (${columns})
          OUTPUT INSERTED.id
          VALUES (${values});
          UPDATE compteur SET compteur = compteur + 1 WHERE LTRIM(RTRIM(code)) = 'SRT';
        `;
      } else {
        query = `
          INSERT INTO stock (${columns})
          OUTPUT INSERTED.id
          VALUES (${values})
        `;
      }

      const [results] = await sequelize.query(query, {
        replacements,
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      });

      let stock_id;

      if (Array.isArray(results)) {
        if (results.length > 0) {
          if (typeof results[0] === 'object' && results[0].id) {
            stock_id = results[0].id;
          } else if (typeof results[0] === 'number') {
            stock_id = results[0];
          } else {
            stock_id = results[0];
          }
        }
      } else if (typeof results === 'object' && results.id) {
        stock_id = results.id;
      } else if (typeof results === 'number') {
        stock_id = results;
      }

      if (!stock_id) {
        const [fallbackResults] = await sequelize.query(
          'SELECT TOP 1 id FROM stock ORDER BY id DESC',
          { type: sequelize.QueryTypes.SELECT, transaction: t }
        );
        if (fallbackResults && fallbackResults.id) {
          stock_id = fallbackResults.id;
        }
      }

      return stock_id;
    } catch (error) {
      console.error('❌ Erreur lors de la création de l\'entrée de stock dans stock:', error);
      // Le rollback sera automatique grâce à la transaction
      throw new Error(`Erreur lors de l'ajout de l'entrée de stock: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Sauvegarder les détails dans stock_detail (pour transfert depuis commande) avec transaction
const saveDetailStock = async (detail, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  const stock_id = detail.stock_id || detail.document_id || null;
  const article_id = detail.article_id || null;
  const quantite = detail.qte || detail.quantite || 0;
  const prix = detail.pu || detail.prix || 0;
  const taux_tva = detail.tva || detail.taux_tva || 0;
  const description = detail.description || '';
  // Préserver null pour indiquer le mode de réduction
  // Si la propriété existe (même si null), l'utiliser. Sinon, utiliser 0 par défaut pour compatibilité
  const remise = detail.hasOwnProperty('remise') ? (detail.remise !== undefined ? detail.remise : null) : 0;
  const remise_montant = detail.hasOwnProperty('remise_montant') ? (detail.remise_montant !== undefined ? detail.remise_montant : null) : 0;
  const sens = detail.sens != null ? detail.sens : -1;

  // Préparer les valeurs - convertir null en 0 pour éviter les problèmes avec SQL Server
  let remiseValue = remise;
  let remiseMontantValue = remise_montant;

  // Si undefined ou null, convertir en 0
  if (remiseValue === undefined || remiseValue === null) remiseValue = 0;
  if (remiseMontantValue === undefined || remiseMontantValue === null) remiseMontantValue = 0;

  // Limiter la description à 200 caractères pour éviter la troncature SQL
  const descriptionLimited = (description || '').substring(0, 200);

  // Pour les entrées de stock (type=21), utiliser sens=1 et inclure rubrique_id
  const rubrique_id = detail.rubrique_id || null;
  const sensFinal = sens !== null && sens !== undefined ? sens : 1; // sens = -1 pour entrée de stock

  // Pour les entrées de stock, ne pas enregistrer la description pour éviter les erreurs de troncature
  // Utiliser une requête simple avec paramètres
  const query = `
    INSERT INTO stock_detail (stock_id, article_id, quantite, prix, taux_tva, sens, remise, remise_montant, rubrique_id)
    OUTPUT INSERTED.id
    VALUES (:stock_id, :article_id, :quantite, :prix, :taux_tva, :sens, 0, :remise_montant, :rubrique_id)
  `;

  const replacements = {
    stock_id: stock_id,
    article_id: article_id,
    quantite: quantite,
    prix: prix || 1, // Prix fixé à 1 pour entrée de stock
    taux_tva: taux_tva,
    sens: sensFinal,
    remise: 1, // Remise fixée à 1 pour entrée de stock
    remise_montant: 1, // Remise montant fixée à 1 pour entrée de stock
    rubrique_id: rubrique_id
  };

  // Utiliser une transaction pour garantir le rollback en cas d'erreur
  return await sequelize.transaction(async (t) => {
    try {
      const [results] = await sequelize.query(query, {
        replacements: replacements,
        type: sequelize.QueryTypes.INSERT,
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
        const [fallbackResults] = await sequelize.query(
          'SELECT TOP 1 id FROM stock_detail ORDER BY id DESC',
          { type: sequelize.QueryTypes.SELECT, transaction: t }
        );
        if (fallbackResults && fallbackResults.id) {
          detail_id = fallbackResults.id;
        }
      }

      return detail_id;
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde du détail dans stock_detail:', error);
      console.error('❌ Détails de l\'erreur:', {
        message: error.message,
        stack: error.stack,
        detail: { stock_id, remise, remise_montant }
      });
      // Le rollback sera automatique grâce à la transaction
      throw new Error(`Erreur lors de la sauvegarde du détail: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Mettre à jour un détail de stock_detail
const updateDetailStock = async (id, detail, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  // Préparer les valeurs - convertir null en 0 pour éviter les problèmes avec SQL Server
  let remiseValue = detail.remise;
  let remiseMontantValue = detail.remise_montant;

  // Si undefined ou null, convertir en 0
  if (remiseValue === undefined || remiseValue === null) remiseValue = 0;
  if (remiseMontantValue === undefined || remiseMontantValue === null) remiseMontantValue = 0;

  // Pour les entrées de stock, inclure rubrique_id
  // Ne pas mettre à jour la description pour éviter les erreurs de troncature
  const rubrique_id = detail.rubrique_id || null;

  // Utiliser une requête simple avec paramètres (sans description)
  const query = `
    UPDATE stock_detail
    SET article_id = :article_id,
        quantite = :quantite,
        prix = :prix,
        taux_tva = :taux_tva,
        remise = :remise,
        remise_montant = :remise_montant,
        rubrique_id = :rubrique_id
    WHERE id = :id
  `;

  // Préparer les replacements - utiliser 1 pour prix, remise et remise_montant pour entrée de stock
  const replacements = {
    id: id,
    article_id: detail.article_id || null,
    quantite: detail.quantite || 0,
    prix: 1, // Prix fixé à 1 pour entrée de stock
    taux_tva: detail.taux_tva || 0,
    remise: 1, // Remise fixée à 1 pour entrée de stock
    remise_montant: 1, // Remise montant fixée à 1 pour entrée de stock
    rubrique_id: rubrique_id
  };

  try {
    await sequelize.query(query, {
      replacements: replacements
    });
    return id;
  } catch (error) {
    console.error('[updateDetailStock] Erreur:', error.message);
    throw error;
  }
};



// Sauvegarder les informations Quill d'une entrée de stock
const saveInfo = async (info, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  const document_id = info.document_id || null;
  const conditions = info.conditions || '';
  const note = info.note || '';

  // Pour les entrées de stock, on peut utiliser une table générique ou stocker dans description
  // Pour l'instant, on stocke dans description si nécessaire
  if (conditions || note) {
    await sequelize.query(
      `UPDATE stock 
       SET description = :description
       WHERE id = :id AND type = 22`,
      {
        replacements: {
          id: document_id,
          description: `${conditions || ''}\n${note || ''}`.trim()
        }
      }
    );
  }
};

// Mettre à jour une entrée de stock (dans la table stock)
const updateSortieStock = async (id, { date, description, part_id, contact_id }, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  await sequelize.query(
    `UPDATE stock 
     SET date = :date, description = :description, part_id = :part_id, 
         employe_id = :contact_id
     WHERE id = :id AND type = 22`,
    {
      replacements: { id, date, description, part_id, contact_id }
    }
  );
};

// Supprimer une entrée de stock
const deleteEntreeStock = async (ids, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('IDs invalides pour la suppression');
  }

  // Supprimer les détails dans stock_detail
  await sequelize.query(
    `DELETE FROM stock_detail WHERE stock_id IN (${ids.map(() => '?').join(',')})`,
    { replacements: ids }
  );

  // Supprimer l'entrée de stock (soft delete: etat = 0)
  await sequelize.query(
    `UPDATE stock SET etat = 0 WHERE id IN (${ids.map(() => '?').join(',')}) AND type = 22`,
    { replacements: ids }
  );
};

// Supprimer des lignes de détail par IDs (dans stock_detail)
const deleteLignesParIds = async (ligneIds, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  if (!Array.isArray(ligneIds) || ligneIds.length === 0) {
    throw new Error('IDs de lignes invalides pour la suppression');
  }

  await sequelize.query(
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
      const prix = 1; // Prix fixé à 1 pour entrée de stock
      const tauxTva = ligne?.tva != null
        ? Number(ligne.tva)
        : (ligne?.taux_tva != null ? Number(ligne.taux_tva) : 0);
      // Ne pas utiliser la description pour éviter les erreurs de troncature
      const sens = -1; // sens = -1 pour entrée de stock
      const rubrique_id = ligne?.rubrique_id ?? null;

      // Détecter le mode basé sur les valeurs envoyées par le frontend
      // Le frontend envoie soit remise (pourcentage décimal) avec remise_montant = null
      // Soit remise_montant (montant) avec remise = null
      const remiseValue = ligne?.remise;
      const remiseMontantValue = ligne?.remise_montant;

      let remiseFraction = 0;
      let remiseMontant = 0;
      let detectedMode = null;

      // Déterminer le mode de remise
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

      // Validation finale
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
        // Ne pas inclure description pour éviter les erreurs de troncature
        sens,
        rubrique_id: rubrique_id,
        // Pour entrée de stock, remise et remise_montant sont fixés à 1
        remise: 1,
        remise_montant: 1
      };

      if (ligne?.update_mode === 'U' && ligne?.id) {
        await updateDetailStock(ligne.id, payload, sequelizeConnection);
        results.push({ id: ligne.id, update_mode: 'U', success: true, remise_mode: detectedMode });
      } else if (ligne?.update_mode === 'D' && ligne?.id) {
        await deleteLignesParIds([ligne.id], sequelizeConnection);
        results.push({ id: ligne.id, update_mode: 'D', success: true, remise_mode: detectedMode });
      } else {
        const insertedId = await saveDetailStock(payload, sequelizeConnection);
        console.log(`[saveDetailLines] ✅ Nouvelle ligne ${insertedId} insérée avec succès`);
        results.push({ id: insertedId, update_mode: 'I', success: true, remise_mode: detectedMode });
      }
    } catch (error) {
      console.error('Erreur lors du traitement d’une ligne stock_detail :', error);
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

// Récupérer les données de la livraison pour la popup de confirmation
const getLivraisonDataForTransfer = async (stockId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const [results] = await sequelize.query(
      `SELECT 
        s.id,
        s.date,
        s.part_id,
        p.nom AS client_nom,
        p.part_id AS client_id
      FROM stock s
      LEFT JOIN partenaire p ON p.part_id = s.part_id
      WHERE s.id = :stockId`,
      {
        replacements: { stockId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!results || (Array.isArray(results) && results.length === 0)) {
      throw new Error('Livraison non trouvée');
    }

    const livraison = Array.isArray(results) ? results[0] : results;

    return {
      id: livraison.id,
      date: livraison.date,
      part_id: livraison.part_id,
      client_nom: livraison.client_nom || '',
      client_id: livraison.client_id
    };
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des données de livraison:', error);
    throw error;
  }
};

// Transférer une livraison vers la facturation
const transfererLivraisonVersFacturation = async (stockId, factureDate, partId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getCompteurCurrent } = require('../../services/compteur.service');

  // Valider que stockId est un nombre
  const stockIdNum = parseInt(stockId, 10);
  if (isNaN(stockIdNum) || stockIdNum <= 0) {
    throw new Error('stockId invalide');
  }

  // Valider que partId est un nombre
  const partIdNum = parseInt(partId, 10);
  if (isNaN(partIdNum) || partIdNum <= 0) {
    throw new Error('partId invalide');
  }

  // Valider la date
  if (!factureDate) {
    throw new Error('La date de facture est requise');
  }

  // 1. Récupérer le compteur FA actuel SANS l'incrémenter (en dehors de la transaction)
  const compteurFA = await getCompteurCurrent('FA');
  if (compteurFA === null || compteurFA === undefined) {
    throw new Error('Impossible de récupérer le compteur FA');
  }

  // 2. Formater le numéro de facture avec le compteur
  const anneeCourte = new Date(factureDate).getFullYear().toString().slice(2);
  const factureNum = `FA${anneeCourte}-${compteurFA.toString().padStart(4, '0')}`;


  // Utiliser sequelize.transaction() pour gérer la transaction correctement
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

      // 1. Créer d'abord l'entrée dans facture_souche (auto-incrémenté) avec sens = -1
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

      // 2. Créer la facture avec le facture_id récupéré
      const insertFactureQuery = `
        INSERT INTO facture (facture_id, facture_ind, facture_num, facture_dat, facture_typ, facture_ht, facture_tva)
        VALUES (:factureId, 1, :factureNum, :factureDate, 'FA', 0, 0);
        UPDATE stock SET facture_id = :factureId WHERE id = :stockId;
        UPDATE compteur SET compteur = compteur + 1 WHERE LTRIM(RTRIM(code)) = 'FA';
      `;

      // Exécuter la requête avec le facture_id récupéré
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
        message: 'Livraison transférée vers facturation avec succès'
      };

    } catch (error) {
      console.error('❌ Erreur lors du transfert livraison vers facturation:', error);
      throw new Error(`Erreur lors du transfert: ${error.message}`);
    }
  });
};


module.exports = {
  getAllSortiesStock,
  countAllSortiesStock,
  getSortieStockById,
  addSortieStock,
  saveDetailStock,
  saveDetailLines,
  updateDetailStock,
  updateSortieStock,
  deleteEntreeStock,
  deleteLignesParIds,
  saveInfo
};

