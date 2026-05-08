const { getConnection } = require('../../config/database');
const { getCompteurFormate } = require('../../services/compteur.service');

const normalizeNumericValue = (value, defaultValue = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const normalizeDetailSens = (detail) => {
  const sens = Number(detail?.sens);
  return sens === -1 ? -1 : 1;
};

const normalizeCaisseDetails = (detailsData = []) => {
  if (!Array.isArray(detailsData)) {
    return [];
  }

  return detailsData.map((detail) => ({
    ...detail,
    quantite: normalizeNumericValue(detail?.quantite, 1),
    montant: normalizeNumericValue(detail?.montant, 0),
    sens: normalizeDetailSens(detail)
  }));
};

const calculateCaisseTotals = (detailsData = [], fond = 0) => {
  const safeFond = normalizeNumericValue(fond, 0);
  let totalRecettes = 0;
  let totalDepenses = 0;

  for (const detail of normalizeCaisseDetails(detailsData)) {
    const totalLigne = normalizeNumericValue(detail.quantite, 0) * normalizeNumericValue(detail.montant, 0);
    if (detail.sens === -1) {
      totalDepenses += totalLigne;
    } else {
      totalRecettes += totalLigne;
    }
  }

  return {
    fond: safeFond,
    totalRecettes,
    totalDepenses,
    soldeNet: safeFond + totalRecettes - totalDepenses
  };
};

const getTypePrefix = (type) => {
  if (type === 1 || type === 2) {
    return 'JCB';
  }

  return 'JC';
};

const applyTypeCondition = (conditions, replacements, type, hasExplicitTypeFilter, documentAlias = 'cd') => {
  if (type !== null && type !== undefined) {
    if (type === 1 || type === 2) {
      conditions.push(`(${documentAlias}.type = 1 OR ${documentAlias}.type = 2)`);
      return;
    }
    conditions.push(`${documentAlias}.type = :type`);
    replacements.type = type;
    return;
  }

  if (hasExplicitTypeFilter) {
    conditions.push(`${documentAlias}.type IS NULL`);
  }
};

const getDetailTotalSql = (detailAlias, sens) => `
  ISNULL(SUM(
    CASE
      WHEN ${detailAlias}.sens = ${sens}
      THEN ISNULL(${detailAlias}.quantite, 0) * ISNULL(${detailAlias}.montant, 0)
      ELSE 0
    END
  ), 0)
`;

// Récupérer tous les documents de caisse avec pagination
const getAllCaisseDocuments = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'date',
      orderDirection = 'DESC',
      search = '',
      sens = null, // null = tous, 1 = recettes, -1 = dépenses
      type = null // null = tous, null = déclarée, 1 = CDB, 2 = CRB
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = ['numero', 'date', 'montant', 'description', 'etat', 'partenaire_nom'];
    const columnMapping = {
      'numero': 'cd.numero',
      'date': 'cd.date',
      'montant': 'cd.montant',
      'description': 'cd.description',
      'etat': 'cd.etat',
      'partenaire_nom': 'p.nom'
    };
    const safeOrderBy = validColumns.includes(orderBy) ? columnMapping[orderBy] : 'cd.date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = '';
    const replacements = {};

    // Recherche intelligente multi-critères
    if (search && search.trim()) {
      const searchTerm = search.trim();
      const searchConditions = [];

      // Vérifier si c'est une recherche par date
      const datePattern1 = /^\d{4}-\d{2}-\d{2}$/;
      const datePattern2 = /^\d{2}\/\d{2}\/\d{4}$/;
      let isDateSearch = false;

      if (datePattern1.test(searchTerm)) {
        searchConditions.push('CAST(cd.date AS DATE) = :searchDate');
        replacements.searchDate = searchTerm;
        isDateSearch = true;
      } else if (datePattern2.test(searchTerm)) {
        const [day, month, year] = searchTerm.split('/');
        searchConditions.push('CAST(cd.date AS DATE) = :searchDate');
        replacements.searchDate = `${year}-${month}-${day}`;
        isDateSearch = true;
      }

      // Si ce n'est pas une recherche par date, chercher dans les autres champs
      if (!isDateSearch) {
        // Recherche par numéro
        searchConditions.push('cd.numero LIKE :search');

        // Recherche par description
        searchConditions.push('cd.description LIKE :search');

        // Recherche par nom de partenaire
        searchConditions.push('p.nom LIKE :search');

        // Recherche par montant (si c'est un nombre)
        if (!isNaN(parseFloat(searchTerm)) && isFinite(searchTerm)) {
          const montant = parseFloat(searchTerm);
          searchConditions.push(`ABS(cd.montant - :searchMontant) < 0.01`);
          replacements.searchMontant = montant;
        }

        replacements.search = `%${searchTerm}%`;
      }

      if (searchConditions.length > 0) {
        whereClause = `WHERE (${searchConditions.join(' OR ')})`;
      }
    }

    // Ajouter le filtre par sens si spécifié
    if (sens !== null && (sens === 1 || sens === -1)) {
      if (whereClause) {
        whereClause += ` AND cd.sens = :sens`;
      } else {
        whereClause = `WHERE cd.sens = :sens`;
      }
      replacements.sens = sens;
    }

    // Ajouter le filtre par type selon les spécifications
    // Dépenses déclarées: sens = -1 AND type IS NULL
    // Dépenses black: sens = -1 AND type = 1
    // Recettes déclarées: sens = 1 AND type IS NULL
    // Recettes black: sens = 1 AND type = 2

    if (type !== null && type !== undefined) {
      // Type = 1 (CDB) ou 2 (CRB) = caisse black
      if (whereClause) {
        whereClause += ` AND cd.type = :type`;
      } else {
        whereClause = `WHERE cd.type = :type`;
      }
      replacements.type = type;
    } else if (options.hasOwnProperty('type') && (type === null || type === undefined)) {
      // Type explicitement null = caisse déclarée (type IS NULL)
      if (whereClause) {
        whereClause += ` AND cd.type IS NULL`;
      } else {
        whereClause = `WHERE cd.type IS NULL`;
      }
    }


    // Construire la requête avec ROW_NUMBER() pour la pagination (plus compatible avec SQL Server)
    // Note: On sélectionne uniquement les colonnes qui existent dans la table
    const query = `
      SELECT 
        id,
        numero,
        date,
        site_id,
        part_id,
        employe_id,
        departement_id,
        affectation,
        montant,
        sens,
        description,
        etat,
        imprime,
        cr_date,
        user_id,
        partenaire_nom
      FROM (
      SELECT 
        cd.id,
        cd.numero,
        cd.date,
        cd.site_id,
        cd.part_id,
        cd.employe_id,
        cd.departement_id,
        cd.affectation,
        cd.montant,
        cd.sens,
        cd.description,
        cd.etat,
        cd.imprime,
        cd.cr_date,
        cd.user_id,
          p.nom as partenaire_nom,
          ROW_NUMBER() OVER (ORDER BY ${safeOrderBy} ${safeOrderDirection}) AS RowNum
      FROM caisse_document cd
      LEFT JOIN partenaire p ON p.part_id = cd.part_id
      ${whereClause}
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY RowNum
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM caisse_document cd
      ${whereClause}
    `;

    // Créer un objet replacements sans offset et pageSize pour la requête principale
    const queryReplacements = Object.keys(replacements).reduce((obj, k) => {
      obj[k] = replacements[k];
      return obj;
    }, {});

    // Exécuter les requêtes avec gestion d'erreur
    let results = [];
    let countResult = { total: 0 };

    try {
      // Pour la requête de count, on n'a pas besoin d'offset et pageSize
      const countReplacements = Object.keys(replacements).filter(k => k !== 'offset' && k !== 'pageSize').reduce((obj, k) => {
        obj[k] = replacements[k];
        return obj;
      }, {});

      const countQueryResult = await sequelize.query(countQuery, {
        replacements: Object.keys(countReplacements).length > 0 ? countReplacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });

      // Gérer le résultat du count
      const countData = Array.isArray(countQueryResult) ? countQueryResult[0] : countQueryResult;
      countResult = Array.isArray(countData) ? countData[0] : countData;

    } catch (countError) {
      throw new Error(`Erreur lors du comptage des documents de caisse: ${countError.message || 'Erreur inconnue'}`);
    }

    try {
      const queryResult = await sequelize.query(query, {
        replacements: Object.keys(queryReplacements).length > 0 ? queryReplacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });

      // Pour SQL Server avec Sequelize QueryTypes.SELECT, les résultats sont directement dans le tableau
      if (Array.isArray(queryResult)) {
        results = queryResult;
      } else {
        results = queryResult ? [queryResult] : [];
      }

    } catch (queryError) {

      // Extraire les détails de l'erreur, y compris ceux de l'AggregateError
      let errorDetails = {
        name: queryError.name,
        message: queryError.message,
        sql: queryError.sql,
        original: queryError.original?.message || '',
        code: queryError.original?.code,
        number: queryError.original?.number
      };

      // Si c'est une AggregateError, extraire les erreurs internes
      if (queryError.original && queryError.original.errors && Array.isArray(queryError.original.errors)) {
        errorDetails.errors = queryError.original.errors.map((err, idx) => ({
          index: idx,
          message: err.message,
          code: err.code,
          number: err.number
        }));
        // Utiliser le message de la première erreur si le message principal est vide
        if (!errorDetails.original && errorDetails.errors.length > 0) {
          errorDetails.original = errorDetails.errors[0].message;
        }
      }

      // Si c'est une erreur de connexion/timeout, essayer de récupérer une nouvelle connexion
      const isConnectionError = queryError.original && (
        queryError.original.code === 'EREQUEST' ||
        queryError.name === 'AggregateError' ||
        (queryError.original.errors && queryError.original.errors.length > 0)
      );

      if (isConnectionError) {
        try {
          // Obtenir une nouvelle connexion
          const newSequelize = getConnection();
          await newSequelize.authenticate();

          // Réessayer la requête avec la nouvelle connexion
          const retryResult = await newSequelize.query(query, {
            replacements: Object.keys(queryReplacements).length > 0 ? queryReplacements : undefined,
            type: sequelize.QueryTypes.SELECT
          });

          if (Array.isArray(retryResult)) {
            results = retryResult;
          } else {
            results = retryResult ? [retryResult] : [];
          }
        } catch (retryError) {
          const errorMessage = errorDetails.original || errorDetails.message || 'Erreur de connexion à la base de données';
          throw new Error(`Erreur de connexion à la base de données. Veuillez vérifier que le serveur SQL est accessible. Détails: ${errorMessage}`);
        }
      } else if (errorDetails.original) {
        const errorMsg = errorDetails.original;
        if (errorMsg.includes('Invalid column name') || errorMsg.includes('nom de colonne non valide')) {
          throw new Error(`Erreur SQL: Colonne inexistante dans la table. Vérifiez la structure de la table caisse_document. Détails: ${errorMsg}`);
        }
        throw new Error(`Erreur SQL: ${errorMsg}`);
      } else {
        const errorMessage = errorDetails.message || errorDetails.original || 'Erreur inconnue';
        throw new Error(`Erreur lors de la récupération des documents de caisse: ${errorMessage}`);
      }
    }

    const total = parseInt(countResult?.total) || 0;
    const totalPages = Math.ceil(total / safePageSize);

    return {
      data: results || [],
      pagination: {
        total,
        page: safePage,
        pageSize: safePageSize,
        totalPages
      }
    };
  } catch (error) {
    throw error;
  }
};

// Récupérer un document de caisse par ID avec ses détails
const getCaisseDocumentById = async (id) => {
  const sequelize = getConnection();
  try {

    const documentQuery = `
      SELECT 
        cd.*,
        p.nom as partenaire_nom
      FROM caisse_document cd
      LEFT JOIN partenaire p ON p.part_id = cd.part_id
      WHERE cd.id = :id
    `;

    const documentResults = await sequelize.query(documentQuery, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    });


    // Sequelize retourne un tableau, prendre le premier élément
    const document = Array.isArray(documentResults) && documentResults.length > 0 ? documentResults[0] : (documentResults || null);

    if (!document) {
      return null;
    }


    // Déterminer le group_id selon le sens du document
    // sens = 1 (recette) → group_id = 2000
    // sens = -1 (dépense) → group_id = 3000
    const groupId = document.sens === 1 ? 2000 : 3000;

    // Requête des détails exactement comme spécifié
    // Pour recette: group_id = 2000, pour dépense: group_id = 3000
    // On ajoute cd.id, cd.rubrique_id et cd.unite_id pour le frontend
    const detailsQuery = `
      SELECT 
        l.id,
        l.nom as rubrique,
        cd.rubrique_id,
        cd.unite_id,
        cd.description,
        cd.quantite,
        cd.montant,
        cd.ligne,
        cd.etat,
        cd.employe_id,
        UPPER(e.prenom + ' ' + e.nom) as employe_nom_complet
      FROM caisse_document_detail cd
      INNER JOIN listes l ON l.id = cd.rubrique_id AND l.group_id = :group_id
      LEFT JOIN employe e ON e.id = cd.employe_id
      WHERE cd.document_id = :id
      ORDER BY cd.ligne ASC
    `;


    const detailsResults = await sequelize.query(detailsQuery, {
      replacements: { id, group_id: groupId },
      type: sequelize.QueryTypes.SELECT
    });


    // Sequelize retourne un tableau de détails
    const details = Array.isArray(detailsResults) ? detailsResults : (detailsResults ? [detailsResults] : []);


    // Formater les détails pour inclure les champs nécessaires au frontend
    const formattedDetails = details.map((detail) => ({
      id: detail.detail_id || null,
      detail_id: detail.detail_id || null,
      rubrique_id: detail.rubrique_id || detail.id || null, // detail.id est l.id de listes
      rubrique: detail.rubrique || null,
      description: detail.description || '',
      quantite: detail.quantite || 0,
      montant: detail.montant || 0,
      ligne: detail.ligne || 0,
      etat: detail.etat !== undefined ? detail.etat : 1,
      unite_id: detail.unite_id || null,
      employe_id: detail.employe_id || null,
      employe_nom_complet: detail.employe_nom_complet || null
    }));


    const result = {
      ...document,
      details: formattedDetails
    };


    return result;
  } catch (error) {
    console.error('[getCaisseDocumentById] Erreur:', error);
    console.error('[getCaisseDocumentById] Stack:', error.stack);
    if (error.original) {
      console.error('[getCaisseDocumentById] Erreur originale:', error.original);
    }
    throw error;
  }
};

// Créer un document de caisse avec ses détails (transaction)
const createCaisseDocument = async (documentData, detailsData) => {
  const sequelize = getConnection();
  let transaction = null;

  try {
    // S'assurer que detailsData est un tableau
    if (!Array.isArray(detailsData)) {
      detailsData = [];
    }

    // Créer la transaction
    transaction = await sequelize.transaction();

    // Calculer le montant total depuis les détails (quantite * montant pour chaque ligne)
    const totalMontant = detailsData.reduce((sum, detail) => {
      const quantite = parseFloat(detail.quantite) || 0;
      const montant = parseFloat(detail.montant) || 0;
      return sum + (quantite * montant);
    }, 0);

    // Générer le numéro si non fourni en utilisant le compteur
    let numero = documentData.numero;
    if (!numero) {
      // Déterminer le préfixe selon le sens et le type
      // type = null : caisse déclarée (CD/CR)
      // type = 1 : caisse black dépense (CDB)
      // type = 2 : caisse black recette (CRB)
      let prefix;
      if (documentData.type === 1) {
        prefix = 'CDB'; // Caisse black dépense
      } else if (documentData.type === 2) {
        prefix = 'CRB'; // Caisse black recette
      } else {
        // Caisse déclarée (type = null)
        prefix = documentData.sens === 1 ? 'CR' : 'CD';
      }
      const codeCompteur = prefix;
      numero = await getCompteurFormate(codeCompteur, prefix);
    }

    // Insérer le document
    const insertDocumentQuery = `
      INSERT INTO caisse_document (
        numero, date, site_id, part_id, employe_id, departement_id,
        affectation, montant, sens, description,
        etat, imprime, cr_date, user_id, type
      )
      OUTPUT INSERTED.id
      VALUES (
        :numero, :date, :site_id, :part_id, :employe_id, :departement_id,
        :affectation, :montant, :sens, :description,
        :etat, :imprime, GETDATE(), :user_id, :type
      )
    `;

    const insertResults = await sequelize.query(insertDocumentQuery, {
      replacements: {
        numero,
        date: documentData.date,
        site_id: documentData.site_id || null,
        part_id: documentData.part_id || null,
        employe_id: documentData.employe_id || null,
        departement_id: documentData.departement_id || null,
        affectation: documentData.affectation || null,
        montant: totalMontant,
        sens: documentData.sens,
        description: documentData.description || null,
        // Gérer l'état : null = ouvert, '1' = clôturé (colonne nvarchar)
        // Si etat est null ou undefined, laisser null (caisse ouverte)
        // Sinon convertir en string pour compatibilité avec colonne nvarchar
        etat: documentData.etat !== null && documentData.etat !== undefined ? String(documentData.etat) : null,
        imprime: documentData.imprime || 0,
        user_id: documentData.user_id || null,
        type: documentData.type !== null && documentData.type !== undefined ? documentData.type : null
      },
      type: sequelize.QueryTypes.INSERT,
      transaction
    });

    // Gérer le résultat de l'insertion (MSSQL avec OUTPUT INSERTED.id)
    let documentId = null;
    if (Array.isArray(insertResults)) {
      if (insertResults.length > 0) {
        const firstResult = insertResults[0];
        if (Array.isArray(firstResult) && firstResult.length > 0) {
          documentId = firstResult[0].id;
        } else if (firstResult && firstResult.id) {
          documentId = firstResult.id;
        } else if (typeof firstResult === 'object' && firstResult.id) {
          documentId = firstResult.id;
        }
      }
    } else if (insertResults && insertResults.id) {
      documentId = insertResults.id;
    }

    if (!documentId) {
      // Rollback avant de lancer l'erreur
      if (transaction && !transaction.finished) {
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          // Ignorer l'erreur de rollback
        }
      }
      throw new Error('Impossible de récupérer l\'ID du document créé');
    }

    // Insérer les détails
    for (let i = 0; i < detailsData.length; i++) {
      const detail = detailsData[i];
      const insertDetailQuery = `
        INSERT INTO caisse_document_detail (
          document_id, ligne, rubrique_id, unite_id, quantite, montant,
          description, parent, type, etat, cr_date, user_id, employe_id
        )
        VALUES (
          :document_id, :ligne, :rubrique_id, :unite_id, :quantite, :montant,
          :description, :parent, :type, :etat, GETDATE(), :user_id, :employe_id
        )
      `;

      await sequelize.query(insertDetailQuery, {
        replacements: {
          document_id: documentId,
          ligne: i + 1,
          rubrique_id: detail.rubrique_id || null,
          unite_id: detail.unite_id || null,
          quantite: detail.quantite || 1,
          montant: parseFloat(detail.montant) || 0,
          description: detail.description || null,
          parent: detail.parent || null,
          type: detail.type || null,
          etat: detail.etat || 1,
          user_id: documentData.user_id || null,
          employe_id: detail.employe_id || null
        },
        type: sequelize.QueryTypes.INSERT,
        transaction
      });
    }

    // Calculer la somme réelle des détails insérés (seulement si des détails existent)
    // Utiliser quantite * montant pour le calcul
    let sumDetails = 0;
    if (detailsData.length > 0) {
      const sumResults = await sequelize.query(
        `SELECT SUM(quantite * montant) as total FROM caisse_document_detail WHERE document_id = :document_id`,
        {
          replacements: { document_id: documentId },
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );

      // Sequelize retourne un tableau, prendre le premier élément
      const sumResult = Array.isArray(sumResults) && sumResults.length > 0 ? sumResults[0] : (sumResults || {});
      sumDetails = parseFloat(sumResult?.total || 0);

      if (isNaN(sumDetails)) {
        sumDetails = 0;
      }

      // Vérifier que la somme des détails correspond au montant calculé
      if (Math.abs(sumDetails - totalMontant) > 0.01) {
        await transaction.rollback();
        throw new Error(`Montant des détails (${sumDetails}) != montant calculé (${totalMontant})`);
      }

      // Mettre à jour le montant du document avec la somme réelle des détails
      await sequelize.query(
        `UPDATE caisse_document SET montant = :montant WHERE id = :id`,
        {
          replacements: { montant: sumDetails, id: documentId },
          type: sequelize.QueryTypes.UPDATE,
          transaction
        }
      );
    } else {
      // Si pas de détails, le montant reste à 0 (sera mis à jour lors de l'ajout des détails)
      sumDetails = 0;
    }

    await transaction.commit();

    return {
      id: documentId,
      numero,
      montant: sumDetails
    };
  } catch (error) {
    // Rollback seulement si la transaction existe et est active
    if (transaction && !transaction.finished) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        // Ignorer l'erreur de rollback
      }
    }
    throw error;
  }
};

// Mettre à jour un document de caisse (si non clôturé)
const updateCaisseDocument = async (id, documentData, detailsData) => {
  const sequelize = getConnection();
  const transaction = await sequelize.transaction();

  try {
    // Vérifier que le document n'est pas clôturé
    const docResults = await sequelize.query(
      `SELECT etat FROM caisse_document WHERE id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    // Sequelize retourne un tableau, prendre le premier élément
    const doc = Array.isArray(docResults) && docResults.length > 0 ? docResults[0] : (docResults || null);

    if (!doc) {
      throw new Error('Document non trouvé');
    }

    // Vérifier que le document n'est pas clôturé
    // Gérer les deux formats : ancien ('CLOTURE') et nouveau ('1' ou 1)
    const etatValue = doc.etat !== null && doc.etat !== undefined ? String(doc.etat).toUpperCase() : null;
    const isCloture = etatValue === '1' || etatValue === 'CLOTURE' || doc.etat === 1;
    if (isCloture) {
      throw new Error('Impossible de modifier un document clôturé');
    }

    // Supprimer les anciens détails
    await sequelize.query(
      `DELETE FROM caisse_document_detail WHERE document_id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.DELETE,
        transaction
      }
    );

    // Calculer le nouveau montant total (quantite * montant pour chaque ligne)
    const totalMontant = detailsData.reduce((sum, detail) => {
      const quantite = parseFloat(detail.quantite) || 0;
      const montant = parseFloat(detail.montant) || 0;
      return sum + (quantite * montant);
    }, 0);

    // Insérer les nouveaux détails
    for (let i = 0; i < detailsData.length; i++) {
      const detail = detailsData[i];
      await sequelize.query(
        `INSERT INTO caisse_document_detail (
          document_id, ligne, rubrique_id, unite_id, quantite, montant,
          description, parent, type, etat, cr_date, user_id, employe_id
        )
        VALUES (
          :document_id, :ligne, :rubrique_id, :unite_id, :quantite, :montant,
          :description, :parent, :type, :etat, GETDATE(), :user_id, :employe_id
        )`,
        {
          replacements: {
            document_id: id,
            ligne: i + 1,
            rubrique_id: detail.rubrique_id || null,
            unite_id: detail.unite_id || null,
            quantite: detail.quantite || 1,
            montant: parseFloat(detail.montant) || 0,
            description: detail.description || null,
            parent: detail.parent || null,
            type: detail.type || null,
            etat: detail.etat || 1,
            user_id: documentData.user_id || null,
            employe_id: detail.employe_id || null
          },
          type: sequelize.QueryTypes.INSERT,
          transaction
        }
      );
    }

    // Mettre à jour le document
    const updateFields = [];
    const updateReplacements = { id };

    if (documentData.date !== undefined) {
      updateFields.push('date = :date');
      updateReplacements.date = documentData.date;
    }
    if (documentData.description !== undefined) {
      updateFields.push('description = :description');
      updateReplacements.description = documentData.description;
    }

    // Calculer le montant total réel depuis la base de données (quantite * montant)
    const sumResults = await sequelize.query(
      `SELECT SUM(quantite * montant) as total FROM caisse_document_detail WHERE document_id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    const sumResult = Array.isArray(sumResults) && sumResults.length > 0 ? sumResults[0] : (sumResults || {});
    const realTotal = parseFloat(sumResult?.total || 0);

    updateFields.push('montant = :montant');
    updateReplacements.montant = realTotal;

    if (updateFields.length > 1) {
      await sequelize.query(
        `UPDATE caisse_document SET ${updateFields.join(', ')} WHERE id = :id`,
        {
          replacements: updateReplacements,
          type: sequelize.QueryTypes.UPDATE,
          transaction
        }
      );
    }

    await transaction.commit();

    return { id, montant: realTotal };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// Clôturer un document
const cloturerCaisseDocument = async (id) => {
  const sequelize = getConnection();
  const transaction = await sequelize.transaction();
  try {
    // Recalculer le montant total depuis les détails avant de clôturer
    const sumResults = await sequelize.query(
      `SELECT SUM(quantite * montant) as total FROM caisse_document_detail WHERE document_id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    const sumResult = Array.isArray(sumResults) && sumResults.length > 0 ? sumResults[0] : (sumResults || {});
    const totalMontant = parseFloat(sumResult?.total || 0);

    // Clôturer la caisse : etat = '1' et mettre à jour le montant
    // Utiliser string pour compatibilité avec colonne nvarchar
    await sequelize.query(
      `UPDATE caisse_document SET etat = '1', montant = :montant WHERE id = :id`,
      {
        replacements: { id, montant: totalMontant },
        type: sequelize.QueryTypes.UPDATE,
        transaction
      }
    );

    await transaction.commit();
    return { success: true, montant: totalMontant };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// Supprimer un document (si non clôturé)
const deleteCaisseDocument = async (id) => {
  const sequelize = getConnection();
  const transaction = await sequelize.transaction();

  try {
    // Vérifier que le document n'est pas clôturé
    const docResults = await sequelize.query(
      `SELECT etat FROM caisse_document WHERE id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    // Sequelize retourne un tableau, prendre le premier élément
    const doc = Array.isArray(docResults) && docResults.length > 0 ? docResults[0] : (docResults || null);

    if (!doc) {
      throw new Error('Document non trouvé');
    }

    // Vérifier que le document n'est pas clôturé
    // Gérer les deux formats : ancien ('CLOTURE') et nouveau ('1' ou 1)
    const etatValue = doc.etat !== null && doc.etat !== undefined ? String(doc.etat).toUpperCase() : null;
    const isCloture = etatValue === '1' || etatValue === 'CLOTURE' || doc.etat === 1;
    if (isCloture) {
      throw new Error('Impossible de supprimer un document clôturé');
    }

    // Supprimer les détails
    await sequelize.query(
      `DELETE FROM caisse_document_detail WHERE document_id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.DELETE,
        transaction
      }
    );

    // Supprimer le document
    await sequelize.query(
      `DELETE FROM caisse_document WHERE id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.DELETE,
        transaction
      }
    );

    await transaction.commit();
    return { success: true };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// Obtenir le solde de caisse pour une date
// caisseType: null = caisse déclarée, 'black' = caisse black (type 1 ou 2)
// onlyNonCloturees: true = uniquement les caisses non clôturées (etat IS NULL), false = toutes les caisses
const getSoldeCaisse = async (date, sequelizeConnection = null, caisseType = null, onlyNonCloturees = false) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    console.log('[getSoldeCaisse Model] 📥 Calcul solde pour la date:', date, 'Type caisse:', caisseType, 'Non clôturées seulement:', onlyNonCloturees);

    // S'assurer que la date est au bon format
    let dateValue = date;
    if (typeof date === 'string') {
      // Convertir la date en format SQL Server (YYYY-MM-DD)
      if (date.includes('/')) {
        const [day, month, year] = date.split('/');
        dateValue = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }

    // Si pas de date fournie, utiliser la date du jour
    if (!dateValue) {
      const today = new Date();
      dateValue = today.toISOString().split('T')[0];
    }

    console.log('[getSoldeCaisse Model] 📅 Date formatée:', dateValue);

    // Construire la condition de filtre selon le type de caisse
    let typeCondition = '';
    if (caisseType === 'black') {
      // Caisse black: type = 1 (CDB) OU type = 2 (CRB)
      typeCondition = ' AND (cd.type = 1 OR cd.type = 2)';
    } else if (caisseType === 'declared' || caisseType === null || caisseType === undefined) {
      // Caisse déclarée: type IS NULL
      typeCondition = ' AND cd.type IS NULL';
    }

    // Condition pour filtrer par état (clôturé ou non)
    let etatCondition = '';
    if (onlyNonCloturees) {
      // Uniquement les caisses non clôturées (etat IS NULL)
      etatCondition = ' AND cd.etat IS NULL';
    }

    // Calculer le solde pour la date donnée
    // Si onlyNonCloturees = true: filtre par date exacte (du jour) et etat IS NULL
    // Si onlyNonCloturees = false: solde cumulé jusqu'à la date (inclus)
    const dateOperator = onlyNonCloturees ? '=' : '<=';
    const query = `
      SELECT 
        ISNULL(SUM(CASE WHEN sens = 1 THEN ISNULL(montant, 0) ELSE 0 END), 0) as total_entrees,
        ISNULL(SUM(CASE WHEN sens = -1 THEN ISNULL(montant, 0) ELSE 0 END), 0) as total_sorties
      FROM caisse_document cd
      WHERE CONVERT(DATE, cd.[date]) ${dateOperator} CONVERT(DATE, :date)${typeCondition}${etatCondition}
    `;

    console.log('[getSoldeCaisse Model] 🔍 Exécution requête SQL...');
    const resultData = await sequelize.query(query, {
      replacements: { date: dateValue },
      type: sequelize.QueryTypes.SELECT
    });

    console.log('[getSoldeCaisse Model] 📊 Résultat brut:', resultData);

    // Sequelize retourne un tableau, prendre le premier élément
    const result = Array.isArray(resultData) && resultData.length > 0 ? resultData[0] : (resultData || {});

    const totalEntrees = parseFloat(result?.total_entrees || 0);
    const totalSorties = parseFloat(result?.total_sorties || 0);
    const solde = totalEntrees - totalSorties;

    console.log('[getSoldeCaisse Model] ✅ Résultats:', {
      total_entrees: totalEntrees,
      total_sorties: totalSorties,
      solde: solde
    });

    return {
      total_entrees: totalEntrees,
      total_sorties: totalSorties,
      solde: solde
    };
  } catch (error) {
    console.error('[getSoldeCaisse Model] ❌ Erreur SQL:', error);
    console.error('[getSoldeCaisse Model] ❌ Message:', error.message);
    console.error('[getSoldeCaisse Model] ❌ Stack:', error.stack);
    console.error('[getSoldeCaisse Model] ❌ Date utilisée:', date);
    if (error.original) {
      console.error('[getSoldeCaisse Model] ❌ Erreur originale:', error.original);
    }
    throw error;
  }
};

// Vérifier si un règlement a déjà été enregistré en caisse
const checkReglementExists = async (reglementId) => {
  const sequelize = getConnection();
  try {
    const [result] = await sequelize.query(
      `SELECT id FROM caisse_document WHERE affectation = :reglementId AND type = 'REGLEMENT_CLIENT'`,
      {
        replacements: { reglementId: String(reglementId) },
        type: sequelize.QueryTypes.SELECT
      }
    );
    return result ? result.id : null;
  } catch (error) {
    throw error;
  }
};

// Récupérer tous les documents de caisse pour un rapport (sans pagination, avec filtre par date)
const getCaisseDocumentsForReport = async (dateFrom, dateTo, sequelizeConnection = null, caisseType = null) => {
  const sequelize = sequelizeConnection || getConnection();
  console.log('[getCaisseDocumentsForReport Model] 📥 Récupération documents pour période:', dateFrom, 'à', dateTo);
  console.log('[getCaisseDocumentsForReport Model] 📊 Type de caisse:', caisseType || 'declared');
  try {

    let whereClause = '';
    const replacements = {};
    const conditions = [];

    // Ajouter le filtre par date si fourni
    if (dateFrom || dateTo) {
      if (dateFrom) {
        conditions.push('CONVERT(DATE, cd.[date]) >= CONVERT(DATE, :dateFrom)');
        replacements.dateFrom = dateFrom;
      }

      if (dateTo) {
        conditions.push('CONVERT(DATE, cd.[date]) <= CONVERT(DATE, :dateTo)');
        replacements.dateTo = dateTo;
      }
    }

    // Ajouter le filtre par type de caisse
    if (caisseType === 'black') {
      // Caisse black : type = 1 (black depense) OU type = 2 (black recette)
      conditions.push('(cd.type = 1 OR cd.type = 2)');
    } else {
      // Caisse déclarée : type IS NULL
      conditions.push('cd.type IS NULL');
    }

    if (conditions.length > 0) {
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }

    // Requête pour récupérer tous les documents (sans pagination)
    const query = `
      SELECT 
        cd.id,
        cd.numero,
        cd.date,
        cd.site_id,
        cd.part_id,
        cd.employe_id,
        cd.departement_id,
        cd.affectation,
        cd.montant,
        cd.sens,
        cd.type,
        cd.description,
        cd.etat,
        cd.imprime,
        cd.cr_date,
        cd.user_id,
        p.nom as partenaire_nom
      FROM caisse_document cd
      LEFT JOIN partenaire p ON p.part_id = cd.part_id
      ${whereClause}
      ORDER BY cd.date ASC, cd.numero ASC
    `;


    const results = await sequelize.query(query, {
      replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
      type: sequelize.QueryTypes.SELECT
    });


    if (results && results.length > 0) {
    }

    // Sequelize retourne un tableau
    const finalResults = Array.isArray(results) ? results : (results ? [results] : []);

    return finalResults;
  } catch (error) {
    console.error('[getCaisseDocumentsForReport] ❌ ERREUR lors de la récupération des documents');
    console.error('[getCaisseDocumentsForReport] Message:', error.message);
    console.error('[getCaisseDocumentsForReport] Stack:', error.stack);
    if (error.original) {
      console.error('[getCaisseDocumentsForReport] Erreur originale:', error.original);
      console.error('[getCaisseDocumentsForReport] Code erreur:', error.original.code);
      console.error('[getCaisseDocumentsForReport] Number erreur:', error.original.number);
    }
    if (error.sql) {
      console.error('[getCaisseDocumentsForReport] SQL:', error.sql);
    }
    console.error('[getCaisseDocumentsForReport] ========================================');
    throw error;
  }
};

// Récupérer les documents de caisse filtrés par employé pour le rapport
const getCaisseDocumentsForReportByEmploye = async (dateFrom, dateTo, employeId, sequelizeConnection = null, caisseType = null) => {
  const sequelize = sequelizeConnection || getConnection();
  console.log('[getCaisseDocumentsForReportByEmploye Model] 📥 Récupération documents pour période:', dateFrom, 'à', dateTo);
  console.log('[getCaisseDocumentsForReportByEmploye Model] 👤 Employé ID:', employeId);
  console.log('[getCaisseDocumentsForReportByEmploye Model] 📊 Type de caisse:', caisseType || 'declared');
  try {

    let whereClause = '';
    const replacements = {};
    const conditions = [];

    // Ajouter le filtre par date si fourni
    if (dateFrom || dateTo) {
      if (dateFrom) {
        conditions.push('CONVERT(DATE, cd.[date]) >= CONVERT(DATE, :dateFrom)');
        replacements.dateFrom = dateFrom;
      }

      if (dateTo) {
        conditions.push('CONVERT(DATE, cd.[date]) <= CONVERT(DATE, :dateTo)');
        replacements.dateTo = dateTo;
      }
    }

    // Ajouter le filtre par type de caisse
    if (caisseType === 'black') {
      // Caisse black : type = 1 (black depense) OU type = 2 (black recette)
      conditions.push('(cd.type = 1 OR cd.type = 2)');
    } else {
      // Caisse déclarée : type IS NULL
      conditions.push('cd.type IS NULL');
    }

    // Construire la clause WHERE
    if (conditions.length > 0) {
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }

    // Ajouter le filtre par employé via JOIN avec caisse_document_detail
    replacements.employeId = employeId;

    // Requête pour récupérer tous les documents qui ont des détails avec cet employé
    const finalQuery = `
      SELECT DISTINCT
        cd.id,
        cd.numero,
        cd.date,
        cd.site_id,
        cd.part_id,
        cd.employe_id,
        cd.departement_id,
        cd.affectation,
        cd.montant,
        cd.sens,
        cd.type,
        cd.description,
        cd.etat,
        cd.imprime,
        cd.cr_date,
        cd.user_id,
        p.nom as partenaire_nom
      FROM caisse_document cd
      LEFT JOIN partenaire p ON p.part_id = cd.part_id
      INNER JOIN caisse_document_detail cdd ON cdd.document_id = cd.id AND cdd.employe_id = :employeId
      ${whereClause}
      ORDER BY cd.date ASC, cd.numero ASC
    `;


    const results = await sequelize.query(finalQuery, {
      replacements: replacements,
      type: sequelize.QueryTypes.SELECT
    });


    if (results && results.length > 0) {
    }

    // Sequelize retourne un tableau
    const finalResults = Array.isArray(results) ? results : (results ? [results] : []);

    return finalResults;
  } catch (error) {
    console.error('[getCaisseDocumentsForReportByEmploye] ❌ ERREUR lors de la récupération des documents');
    console.error('[getCaisseDocumentsForReportByEmploye] Message:', error.message);
    console.error('[getCaisseDocumentsForReportByEmploye] Stack:', error.stack);
    if (error.original) {
      console.error('[getCaisseDocumentsForReportByEmploye] Erreur originale:', error.original);
      console.error('[getCaisseDocumentsForReportByEmploye] Code erreur:', error.original.code);
      console.error('[getCaisseDocumentsForReportByEmploye] Number erreur:', error.original.number);
    }
    if (error.sql) {
      console.error('[getCaisseDocumentsForReportByEmploye] SQL:', error.sql);
    }
    console.error('[getCaisseDocumentsForReportByEmploye] ========================================');
    throw error;
  }
};

// Récupérer les données de bon de caisse par employé selon le type (recette/dépense)
const getBonDeCaisseByEmploye = async (documentId, employeId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {

    // D'abord, récupérer les informations du document pour déterminer le type
    const documentResults = await sequelize.query(
      `SELECT id, numero, date, sens, type, affectation, description, etat
       FROM caisse_document
       WHERE id = :documentId`,
      {
        replacements: { documentId },
        type: sequelize.QueryTypes.SELECT
      }
    );


    // Sequelize retourne un tableau, prendre le premier élément
    const document = Array.isArray(documentResults) && documentResults.length > 0 ? documentResults[0] : (documentResults || null);

    if (!document) {
      throw new Error('Document de caisse introuvable');
    }

    const isRecette = document.sens === 1;
    const groupId = isRecette ? 2000 : 3000; // 2000 pour recette, 3000 pour dépense

    // Vérifier d'abord si des détails existent pour cet employé dans ce document
    const checkDetails = await sequelize.query(
      `SELECT COUNT(*) as count FROM caisse_document_detail 
       WHERE document_id = :documentId AND employe_id = :employeId`,
      {
        replacements: { documentId, employeId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const detailCount = Array.isArray(checkDetails) && checkDetails.length > 0
      ? checkDetails[0].count
      : (checkDetails?.count || 0);

    console.log(`[getBonDeCaisseByEmploye] Détails trouvés pour employé ${employeId} dans document ${documentId}: ${detailCount}`);

    if (detailCount === 0) {
      // Vérifier si l'employé existe
      const employeCheck = await sequelize.query(
        `SELECT id, nom, prenom FROM employe WHERE id = :employeId`,
        {
          replacements: { employeId },
          type: sequelize.QueryTypes.SELECT
        }
      );

      const employeExists = Array.isArray(employeCheck) && employeCheck.length > 0;

      if (!employeExists) {
        throw new Error(`Employé avec ID ${employeId} introuvable`);
      }

      throw new Error(`Aucun détail trouvé pour l'employé ${employeCheck[0]?.nom || employeId} dans ce document. Veuillez vérifier que l'employé est bien associé aux lignes de ce document.`);
    }

    // Construire la requête selon le type - Utiliser LEFT JOIN pour rubrique car elle peut être NULL
    let query;
    if (isRecette) {
      query = `
        SELECT 
          c.numero,
          c.date,
          e.nom + ' ' + e.prenom as employé,
          e.telephone,
          c.affectation as operateur,
          ISNULL(l.nom, cd.description) as rubrique,
          cd.quantite,
          cd.montant,
          cd.description,
          CASE WHEN c.sens = 1 THEN 'recette' END as type_caisse,
          CASE WHEN c.type = 2 THEN 'recette black' ELSE 'recette déclarée' END as type
        FROM caisse_document_detail cd
        INNER JOIN caisse_document c ON c.id = cd.document_id
        LEFT JOIN listes l ON l.id = cd.rubrique_id AND l.group_id = :groupId
        INNER JOIN employe e ON e.id = cd.employe_id
        WHERE cd.document_id = :documentId AND cd.employe_id = :employeId
        ORDER BY cd.ligne ASC
      `;
    } else {
      query = `
        SELECT 
          c.numero,
          c.date,
          e.nom + ' ' + e.prenom as employé,
          e.telephone,
          c.affectation as operateur,
          ISNULL(l.nom, cd.description) as rubrique,
          cd.quantite,
          cd.montant,
          cd.description,
          CASE WHEN c.sens = -1 THEN 'depense' END as type_caisse,
          CASE WHEN c.type = 1 THEN 'depense black' ELSE 'depense déclarée' END as type
        FROM caisse_document_detail cd
        INNER JOIN caisse_document c ON c.id = cd.document_id
        LEFT JOIN listes l ON l.id = cd.rubrique_id AND l.group_id = :groupId
        INNER JOIN employe e ON e.id = cd.employe_id
        WHERE cd.document_id = :documentId AND cd.employe_id = :employeId
        ORDER BY cd.ligne ASC
      `;
    }

    const detailsResults = await sequelize.query(query, {
      replacements: { documentId, employeId, groupId },
      type: sequelize.QueryTypes.SELECT
    });


    // Sequelize retourne un tableau, prendre le premier élément ou le tableau complet
    const details = Array.isArray(detailsResults) ? detailsResults : (detailsResults ? [detailsResults] : []);

    if (!details || details.length === 0) {
      console.error(`[getBonDeCaisseByEmploye] Aucun résultat après jointures pour document ${documentId}, employé ${employeId}`);
      throw new Error('Aucun détail trouvé pour cet employé dans ce document après les jointures. Vérifiez que les données sont correctement liées.');
    }


    // Calculer le total
    const total = details.reduce((sum, detail) => {
      return sum + ((detail.quantite || 0) * (detail.montant || 0));
    }, 0);

    return {
      document: {
        numero: document.numero,
        date: document.date,
        affectation: document.affectation,
        description: document.description,
        type_caisse: details[0].type_caisse,
        type: details[0].type,
        etat: document.etat
      },
      employe: {
        nom_complet: details[0].employé,
        telephone: details[0].telephone
      },
      details: details,
      total: total
    };
  } catch (error) {
    console.error('[getBonDeCaisseByEmploye] Erreur:', error);
    throw error;
  }
};

// Récupérer les détails de caisse pour les rubriques avec group_id 2000 et 3000
const getCaisseDetailsForReportGroup2000_3000 = async (dateFrom, dateTo, sequelizeConnection = null, caisseType = null, rubriqueIds = null) => {
  const sequelize = sequelizeConnection || getConnection();
  console.log('[getCaisseDetailsForReportGroup2000_3000 Model] 📥 Récupération détails pour période:', dateFrom, 'à', dateTo);
  console.log('[getCaisseDetailsForReportGroup2000_3000 Model] 📊 Type de caisse:', caisseType || 'declared');

  try {
    let whereClause = '';
    const replacements = {};
    const conditions = [];

    // Filtre par date
    if (dateFrom || dateTo) {
      if (dateFrom) {
        conditions.push('CONVERT(DATE, cd.[date]) >= CONVERT(DATE, :dateFrom)');
        replacements.dateFrom = dateFrom;
      }
      if (dateTo) {
        conditions.push('CONVERT(DATE, cd.[date]) <= CONVERT(DATE, :dateTo)');
        replacements.dateTo = dateTo;
      }
    }

    // Filtre par type de caisse
    if (caisseType === 'black') {
      conditions.push('(cd.type = 1 OR cd.type = 2)');
    } else {
      conditions.push('cd.type IS NULL');
    }

    // Filtre par group_id (2000 ou 3000)
    conditions.push('l.group_id IN (2000, 3000)');

    // Filtre par rubriques spécifiques
    if (rubriqueIds && Array.isArray(rubriqueIds) && rubriqueIds.length > 0) {
      conditions.push('cdd.rubrique_id IN (:rubriqueIds)');
      replacements.rubriqueIds = rubriqueIds;
    }

    if (conditions.length > 0) {
      whereClause = `WHERE ${conditions.join(' AND ')}`;
    }

    const query = `
      SELECT 
        cd.numero,
        cd.date,
        cd.sens,
        l.nom as rubrique,
        l.group_id,
        cdd.quantite,
        cdd.montant,
        cdd.description,
        UPPER(e.prenom + ' ' + e.nom) as employe_nom_complet
      FROM caisse_document_detail cdd
      INNER JOIN caisse_document cd ON cd.id = cdd.document_id
      INNER JOIN listes l ON l.id = cdd.rubrique_id
      LEFT JOIN employe e ON e.id = cdd.employe_id
      ${whereClause}
      ORDER BY cd.date ASC, cd.numero ASC
    `;

    const results = await sequelize.query(query, {
      replacements: replacements,
      type: sequelize.QueryTypes.SELECT
    });

    const finalResults = Array.isArray(results) ? results : (results ? [results] : []);
    return finalResults;
  } catch (error) {
    console.error('[getCaisseDetailsForReportGroup2000_3000] ❌ ERREUR:', error);
    throw error;
  }
};

const readStoredDetailTotals = async (sequelize, documentId, transaction = null) => {
  const totalsQuery = `
    SELECT
      ${getDetailTotalSql('cdd', 1)} AS total_recettes,
      ${getDetailTotalSql('cdd', -1)} AS total_depenses
    FROM caisse_document_detail cdd
    WHERE cdd.document_id = :documentId
  `;

  const totalsResult = await sequelize.query(totalsQuery, {
    replacements: { documentId },
    type: sequelize.QueryTypes.SELECT,
    transaction
  });

  const totalsRow = Array.isArray(totalsResult) && totalsResult.length > 0
    ? totalsResult[0]
    : (totalsResult || {});

  return {
    totalRecettes: normalizeNumericValue(totalsRow?.total_recettes, 0),
    totalDepenses: normalizeNumericValue(totalsRow?.total_depenses, 0)
  };
};

const insertNormalizedCaisseDetails = async (sequelize, documentId, detailsData, userId, transaction) => {
  const normalizedDetails = normalizeCaisseDetails(detailsData);

  for (let index = 0; index < normalizedDetails.length; index++) {
    const detail = normalizedDetails[index];

    await sequelize.query(
      `INSERT INTO caisse_document_detail (
        document_id, ligne, rubrique_id, unite_id, quantite, montant,
        description, parent, type, etat, cr_date, user_id, employe_id, sens
      )
      VALUES (
        :document_id, :ligne, :rubrique_id, :unite_id, :quantite, :montant,
        :description, :parent, :type, :etat, GETDATE(), :user_id, :employe_id, :sens
      )`,
      {
        replacements: {
          document_id: documentId,
          ligne: index + 1,
          rubrique_id: detail.rubrique_id || null,
          unite_id: detail.unite_id || null,
          quantite: normalizeNumericValue(detail.quantite, 1),
          montant: normalizeNumericValue(detail.montant, 0),
          description: detail.description || null,
          parent: detail.parent || null,
          type: detail.type || null,
          etat: detail.etat || 1,
          user_id: userId || null,
          employe_id: detail.employe_id || null,
          sens: normalizeDetailSens(detail)
        },
        type: sequelize.QueryTypes.INSERT,
        transaction
      }
    );
  }

  return normalizedDetails;
};

const getAllCaisseDocumentsV2 = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const {
    page = 1,
    pageSize = 25,
    orderBy = 'date',
    orderDirection = 'DESC',
    search = '',
    sens = null,
    type = null
  } = options;

  const safePage = parseInt(page, 10) || 1;
  const safePageSize = parseInt(pageSize, 10) || 25;
  const offset = (safePage - 1) * safePageSize;
  const hasExplicitTypeFilter = Object.prototype.hasOwnProperty.call(options, 'type');

  const validColumns = ['numero', 'date', 'montant', 'description', 'etat', 'partenaire_nom', 'fond', 'total_recettes', 'total_depenses', 'solde_net'];
  const columnMapping = {
    numero: 'numero',
    date: '[date]',
    montant: 'montant',
    description: 'description',
    etat: 'etat',
    partenaire_nom: 'partenaire_nom',
    fond: 'fond',
    total_recettes: 'total_recettes',
    total_depenses: 'total_depenses',
    solde_net: 'solde_net'
  };
  const safeOrderBy = validColumns.includes(orderBy) ? columnMapping[orderBy] : '[date]';
  const safeOrderDirection = orderDirection?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const documentConditions = [];
  const aggregatedConditions = [];
  const replacements = {};

  applyTypeCondition(documentConditions, replacements, type, hasExplicitTypeFilter, 'cd');

  if (search && search.trim()) {
    const searchTerm = search.trim();
    const searchConditions = [];
    const datePattern1 = /^\d{4}-\d{2}-\d{2}$/;
    const datePattern2 = /^\d{2}\/\d{2}\/\d{4}$/;

    if (datePattern1.test(searchTerm)) {
      searchConditions.push('CAST([date] AS DATE) = :searchDate');
      replacements.searchDate = searchTerm;
    } else if (datePattern2.test(searchTerm)) {
      const [day, month, year] = searchTerm.split('/');
      searchConditions.push('CAST([date] AS DATE) = :searchDate');
      replacements.searchDate = `${year}-${month}-${day}`;
    } else {
      searchConditions.push('numero LIKE :search');
      searchConditions.push('description LIKE :search');
      searchConditions.push('ISNULL(partenaire_nom, \'\') LIKE :search');

      if (!isNaN(parseFloat(searchTerm)) && isFinite(searchTerm)) {
        const searchMontant = parseFloat(searchTerm);
        searchConditions.push('ABS(montant - :searchMontant) < 0.01');
        searchConditions.push('ABS(fond - :searchMontant) < 0.01');
        searchConditions.push('ABS(total_recettes - :searchMontant) < 0.01');
        searchConditions.push('ABS(total_depenses - :searchMontant) < 0.01');
        searchConditions.push('ABS(solde_net - :searchMontant) < 0.01');
        replacements.searchMontant = searchMontant;
      }

      replacements.search = `%${searchTerm}%`;
    }

    if (searchConditions.length > 0) {
      aggregatedConditions.push(`(${searchConditions.join(' OR ')})`);
    }
  }

  if (sens === 1) {
    aggregatedConditions.push('total_recettes > 0');
  } else if (sens === -1) {
    aggregatedConditions.push('total_depenses > 0');
  }

  const documentWhereClause = documentConditions.length > 0
    ? `WHERE ${documentConditions.join(' AND ')}`
    : '';
  const aggregatedWhereClause = aggregatedConditions.length > 0
    ? `WHERE ${aggregatedConditions.join(' AND ')}`
    : '';

  const totalRecettesSql = getDetailTotalSql('cdd', 1);
  const totalDepensesSql = getDetailTotalSql('cdd', -1);
  const soldeNetSql = `ISNULL(cd.fond, 0) + ${totalRecettesSql} - ${totalDepensesSql}`;
  const aggregatedCte = `
    WITH aggregated AS (
      SELECT
        cd.id,
        cd.numero,
        cd.date,
        cd.site_id,
        cd.part_id,
        cd.employe_id,
        cd.departement_id,
        cd.affectation,
        ISNULL(cd.fond, 0) AS fond,
        ${soldeNetSql} AS montant,
        ${totalRecettesSql} AS total_recettes,
        ${totalDepensesSql} AS total_depenses,
        ${soldeNetSql} AS solde_net,
        cd.description,
        cd.etat,
        cd.imprime,
        cd.cr_date,
        cd.user_id,
        cd.type,
        p.nom AS partenaire_nom
      FROM caisse_document cd
      LEFT JOIN partenaire p ON p.part_id = cd.part_id
      LEFT JOIN caisse_document_detail cdd ON cdd.document_id = cd.id
      ${documentWhereClause}
      GROUP BY
        cd.id,
        cd.numero,
        cd.date,
        cd.site_id,
        cd.part_id,
        cd.employe_id,
        cd.departement_id,
        cd.affectation,
        cd.fond,
        cd.description,
        cd.etat,
        cd.imprime,
        cd.cr_date,
        cd.user_id,
        cd.type,
        p.nom
    )
  `;

  const query = `
    ${aggregatedCte}
    SELECT
      id,
      numero,
      date,
      site_id,
      part_id,
      employe_id,
      departement_id,
      affectation,
      fond,
      montant,
      total_recettes,
      total_depenses,
      solde_net,
      description,
      etat,
      imprime,
      cr_date,
      user_id,
      type,
      partenaire_nom
    FROM (
      SELECT
        aggregated.*,
        ROW_NUMBER() OVER (ORDER BY ${safeOrderBy} ${safeOrderDirection}) AS RowNum
      FROM aggregated
      ${aggregatedWhereClause}
    ) AS paginated
    WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
    ORDER BY RowNum
  `;

  const countQuery = `
    ${aggregatedCte}
    SELECT COUNT(*) AS total
    FROM aggregated
    ${aggregatedWhereClause}
  `;

  const [countResult, queryResult] = await Promise.all([
    sequelize.query(countQuery, {
      replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
      type: sequelize.QueryTypes.SELECT
    }),
    sequelize.query(query, {
      replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
      type: sequelize.QueryTypes.SELECT
    })
  ]);

  const total = parseInt((Array.isArray(countResult) ? countResult[0] : countResult)?.total, 10) || 0;
  const totalPages = Math.ceil(total / safePageSize);
  const data = Array.isArray(queryResult) ? queryResult : (queryResult ? [queryResult] : []);

  return {
    data,
    pagination: {
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages
    }
  };
};

const getCaisseDocumentByIdV2 = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  const documentQuery = `
    SELECT
      cd.id,
      cd.numero,
      cd.date,
      cd.site_id,
      cd.part_id,
      cd.employe_id,
      cd.departement_id,
      cd.affectation,
      cd.montant,
      ISNULL(cd.fond, 0) AS fond,
      cd.description,
      cd.etat,
      cd.imprime,
      cd.cr_date,
      cd.user_id,
      cd.type,
      p.nom AS partenaire_nom
    FROM caisse_document cd
    LEFT JOIN partenaire p ON p.part_id = cd.part_id
    WHERE cd.id = :id
  `;

  const detailQuery = `
    SELECT
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN cdd.sens = 1 THEN 0 ELSE 1 END,
          cdd.ligne ASC,
          ISNULL(cdd.rubrique_id, 0) ASC,
          ISNULL(cdd.employe_id, 0) ASC,
          ISNULL(cdd.description, '') ASC
      ) AS detail_id,
      l.nom AS rubrique,
      l.group_id,
      cdd.rubrique_id,
      cdd.unite_id,
      cdd.description,
      cdd.quantite,
      cdd.montant,
      cdd.ligne,
      cdd.etat,
      cdd.employe_id,
      CASE
        WHEN cdd.sens IN (1, -1) THEN cdd.sens
        WHEN l.group_id = 3000 THEN -1
        ELSE 1
      END AS sens,
      UPPER(e.prenom + ' ' + e.nom) AS employe_nom_complet
    FROM caisse_document_detail cdd
    LEFT JOIN listes l ON l.id = cdd.rubrique_id
      AND l.group_id = CASE
        WHEN cdd.sens = -1 THEN 3000
        WHEN cdd.sens = 1 THEN 2000
        WHEN EXISTS (
          SELECT 1
          FROM listes l_desc
          WHERE l_desc.id = cdd.rubrique_id
            AND l_desc.nom = cdd.description
            AND l_desc.group_id = 3000
        ) THEN 3000
        ELSE 2000
      END
    LEFT JOIN employe e ON e.id = cdd.employe_id
    WHERE cdd.document_id = :id
    ORDER BY
      CASE WHEN cdd.sens = 1 THEN 0 ELSE 1 END,
      cdd.ligne ASC,
      ISNULL(cdd.rubrique_id, 0) ASC,
      ISNULL(cdd.employe_id, 0) ASC,
      ISNULL(cdd.description, '') ASC
  `;

  const [documentResults, detailResults] = await Promise.all([
    sequelize.query(documentQuery, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    }),
    sequelize.query(detailQuery, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    })
  ]);

  const document = Array.isArray(documentResults) && documentResults.length > 0
    ? documentResults[0]
    : null;

  if (!document) {
    return null;
  }

  const details = (Array.isArray(detailResults) ? detailResults : []).map((detail) => ({
    id: detail.detail_id || null,
    detail_id: detail.detail_id || null,
    rubrique_id: detail.rubrique_id || null,
    rubrique: detail.rubrique || null,
    group_id: detail.group_id || null,
    description: detail.description || '',
    quantite: normalizeNumericValue(detail.quantite, 1),
    montant: normalizeNumericValue(detail.montant, 0),
    ligne: detail.ligne || 0,
    etat: detail.etat !== undefined ? detail.etat : 1,
    unite_id: detail.unite_id || null,
    employe_id: detail.employe_id || null,
    employe_nom_complet: detail.employe_nom_complet || null,
    sens: normalizeDetailSens(detail)
  }));

  const totals = calculateCaisseTotals(details, document.fond);

  return {
    ...document,
    fond: totals.fond,
    montant: totals.soldeNet,
    total_recettes: totals.totalRecettes,
    total_depenses: totals.totalDepenses,
    solde_net: totals.soldeNet,
    details
  };
};

const createCaisseDocumentV2 = async (documentData, detailsData) => {
  const sequelize = getConnection();
  let transaction = null;

  try {
    transaction = await sequelize.transaction();

    const normalizedDetails = normalizeCaisseDetails(detailsData);
    const totals = calculateCaisseTotals(normalizedDetails, documentData?.fond);

    let numero = documentData?.numero;
    if (!numero) {
      const prefix = getTypePrefix(documentData?.type);
      numero = await getCompteurFormate(prefix, prefix);
    }

    const insertQuery = `
      INSERT INTO caisse_document (
        numero, date, site_id, part_id, employe_id, departement_id,
        affectation, montant, fond, description,
        etat, imprime, cr_date, user_id, type
      )
      OUTPUT INSERTED.id
      VALUES (
        :numero, :date, :site_id, :part_id, :employe_id, :departement_id,
        :affectation, :montant, :fond, :description,
        :etat, :imprime, GETDATE(), :user_id, :type
      )
    `;

    const insertResults = await sequelize.query(insertQuery, {
      replacements: {
        numero,
        date: documentData.date,
        site_id: documentData.site_id || null,
        part_id: documentData.part_id || null,
        employe_id: documentData.employe_id || null,
        departement_id: documentData.departement_id || null,
        affectation: documentData.affectation || null,
        montant: totals.soldeNet,
        fond: totals.fond,
        description: documentData.description || null,
        etat: documentData.etat !== null && documentData.etat !== undefined ? String(documentData.etat) : null,
        imprime: documentData.imprime || 0,
        user_id: documentData.user_id || null,
        type: documentData.type !== null && documentData.type !== undefined ? documentData.type : null
      },
      type: sequelize.QueryTypes.INSERT,
      transaction
    });

    let documentId = null;
    if (Array.isArray(insertResults) && insertResults.length > 0) {
      const firstResult = insertResults[0];
      if (Array.isArray(firstResult) && firstResult.length > 0) {
        documentId = firstResult[0].id;
      } else if (firstResult?.id) {
        documentId = firstResult.id;
      }
    } else if (insertResults?.id) {
      documentId = insertResults.id;
    }

    if (!documentId) {
      throw new Error('Impossible de récupérer l\'ID du document créé');
    }

    await insertNormalizedCaisseDetails(sequelize, documentId, normalizedDetails, documentData.user_id, transaction);

    const storedTotals = await readStoredDetailTotals(sequelize, documentId, transaction);
    const soldeNet = totals.fond + storedTotals.totalRecettes - storedTotals.totalDepenses;

    await sequelize.query(
      `UPDATE caisse_document SET montant = :montant WHERE id = :id`,
      {
        replacements: { id: documentId, montant: soldeNet },
        type: sequelize.QueryTypes.UPDATE,
        transaction
      }
    );

    await transaction.commit();

    return {
      id: documentId,
      numero,
      fond: totals.fond,
      total_recettes: storedTotals.totalRecettes,
      total_depenses: storedTotals.totalDepenses,
      montant: soldeNet,
      solde_net: soldeNet
    };
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
};

const updateCaisseDocumentV2 = async (id, documentData = {}, detailsData = [], sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const transaction = await sequelize.transaction();

  try {
    const docResults = await sequelize.query(
      `SELECT etat, fond FROM caisse_document WHERE id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    const doc = Array.isArray(docResults) && docResults.length > 0 ? docResults[0] : null;
    if (!doc) {
      throw new Error('Document non trouvé');
    }

    const etatValue = doc.etat !== null && doc.etat !== undefined ? String(doc.etat).toUpperCase() : null;
    const isCloture = etatValue === '1' || etatValue === 'CLOTURE' || doc.etat === 1;
    if (isCloture) {
      throw new Error('Impossible de modifier un document clôturé');
    }

    const normalizedDetails = normalizeCaisseDetails(detailsData);
    const fond = documentData.fond !== undefined
      ? normalizeNumericValue(documentData.fond, 0)
      : normalizeNumericValue(doc.fond, 0);

    await sequelize.query(
      `DELETE FROM caisse_document_detail WHERE document_id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.DELETE,
        transaction
      }
    );

    await insertNormalizedCaisseDetails(sequelize, id, normalizedDetails, documentData.user_id, transaction);

    const storedTotals = await readStoredDetailTotals(sequelize, id, transaction);
    const soldeNet = fond + storedTotals.totalRecettes - storedTotals.totalDepenses;

    const updateFields = [
      'montant = :montant',
      'fond = :fond'
    ];
    const replacements = {
      id,
      montant: soldeNet,
      fond
    };

    if (documentData.date !== undefined) {
      updateFields.push('date = :date');
      replacements.date = documentData.date;
    }

    if (documentData.description !== undefined) {
      updateFields.push('description = :description');
      replacements.description = documentData.description;
    }

    if (documentData.affectation !== undefined) {
      updateFields.push('affectation = :affectation');
      replacements.affectation = documentData.affectation;
    }

    await sequelize.query(
      `UPDATE caisse_document SET ${updateFields.join(', ')} WHERE id = :id`,
      {
        replacements,
        type: sequelize.QueryTypes.UPDATE,
        transaction
      }
    );

    await transaction.commit();

    return {
      id,
      fond,
      total_recettes: storedTotals.totalRecettes,
      total_depenses: storedTotals.totalDepenses,
      montant: soldeNet,
      solde_net: soldeNet
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const updateCaisseDocumentBySensV2 = async (id, sens, documentData = {}, detailsData = [], sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const transaction = await sequelize.transaction();

  try {
    const finalSens = Number(sens) === -1 ? -1 : 1;
    const docResults = await sequelize.query(
      `SELECT etat, fond FROM caisse_document WHERE id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    const doc = Array.isArray(docResults) && docResults.length > 0 ? docResults[0] : null;
    if (!doc) {
      throw new Error('Document non trouvé');
    }

    const etatValue = doc.etat !== null && doc.etat !== undefined ? String(doc.etat).toUpperCase() : null;
    const isCloture = etatValue === '1' || etatValue === 'CLOTURE' || doc.etat === 1;
    if (isCloture) {
      throw new Error('Impossible de modifier un document clôturé');
    }

    const normalizedDetails = normalizeCaisseDetails(detailsData)
      .filter((detail) => normalizeDetailSens(detail) === finalSens)
      .map((detail) => ({
        ...detail,
        sens: finalSens
      }));

    const fond = documentData.fond !== undefined
      ? normalizeNumericValue(documentData.fond, 0)
      : normalizeNumericValue(doc.fond, 0);

    await sequelize.query(
      `UPDATE cdd
       SET cdd.sens = CASE
         WHEN cdd.sens IN (1, -1) THEN cdd.sens
         WHEN l.group_id = 3000 THEN -1
         ELSE 1
       END
       FROM caisse_document_detail cdd
       LEFT JOIN listes l ON l.id = cdd.rubrique_id
       WHERE cdd.document_id = :id
         AND (cdd.sens IS NULL OR cdd.sens NOT IN (1, -1))`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.UPDATE,
        transaction
      }
    );

    await sequelize.query(
      `DELETE FROM caisse_document_detail WHERE document_id = :id AND sens = :sens`,
      {
        replacements: { id, sens: finalSens },
        type: sequelize.QueryTypes.DELETE,
        transaction
      }
    );

    await insertNormalizedCaisseDetails(sequelize, id, normalizedDetails, documentData.user_id, transaction);

    const storedTotals = await readStoredDetailTotals(sequelize, id, transaction);
    const soldeNet = fond + storedTotals.totalRecettes - storedTotals.totalDepenses;

    const updateFields = [
      'montant = :montant',
      'fond = :fond'
    ];
    const replacements = {
      id,
      montant: soldeNet,
      fond
    };

    if (documentData.date !== undefined) {
      updateFields.push('date = :date');
      replacements.date = documentData.date;
    }

    if (documentData.description !== undefined) {
      updateFields.push('description = :description');
      replacements.description = documentData.description;
    }

    if (documentData.affectation !== undefined) {
      updateFields.push('affectation = :affectation');
      replacements.affectation = documentData.affectation;
    }

    await sequelize.query(
      `UPDATE caisse_document SET ${updateFields.join(', ')} WHERE id = :id`,
      {
        replacements,
        type: sequelize.QueryTypes.UPDATE,
        transaction
      }
    );

    await transaction.commit();

    return {
      id,
      sens: finalSens,
      fond,
      total_recettes: storedTotals.totalRecettes,
      total_depenses: storedTotals.totalDepenses,
      montant: soldeNet,
      solde_net: soldeNet
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const cloturerCaisseDocumentV2 = async (id) => {
  const sequelize = getConnection();
  const transaction = await sequelize.transaction();

  try {
    const docResults = await sequelize.query(
      `SELECT ISNULL(fond, 0) AS fond FROM caisse_document WHERE id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    const doc = Array.isArray(docResults) && docResults.length > 0 ? docResults[0] : null;
    if (!doc) {
      throw new Error('Document non trouvé');
    }

    const storedTotals = await readStoredDetailTotals(sequelize, id, transaction);
    const soldeNet = normalizeNumericValue(doc.fond, 0) + storedTotals.totalRecettes - storedTotals.totalDepenses;

    await sequelize.query(
      `UPDATE caisse_document SET etat = '1', montant = :montant WHERE id = :id`,
      {
        replacements: { id, montant: soldeNet },
        type: sequelize.QueryTypes.UPDATE,
        transaction
      }
    );

    await transaction.commit();

    return {
      success: true,
      montant: soldeNet,
      total_recettes: storedTotals.totalRecettes,
      total_depenses: storedTotals.totalDepenses
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const getSoldeCaisseV2 = async (date, sequelizeConnection = null, caisseType = null, onlyNonCloturees = false) => {
  const sequelize = sequelizeConnection || getConnection();
  let dateValue = date;

  if (typeof dateValue === 'string' && dateValue.includes('/')) {
    const [day, month, year] = dateValue.split('/');
    dateValue = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  if (!dateValue) {
    dateValue = new Date().toISOString().split('T')[0];
  }

  const docConditions = [`CONVERT(DATE, cd.[date]) ${onlyNonCloturees ? '=' : '<='} CONVERT(DATE, :date)`];
  const replacements = { date: dateValue };

  if (caisseType === 'black') {
    docConditions.push('(cd.type = 1 OR cd.type = 2)');
  } else {
    docConditions.push('cd.type IS NULL');
  }

  if (onlyNonCloturees) {
    docConditions.push('cd.etat IS NULL');
  }

  const query = `
    WITH filtered_docs AS (
      SELECT
        cd.id,
        ISNULL(cd.fond, 0) AS fond
      FROM caisse_document cd
      WHERE ${docConditions.join(' AND ')}
    )
    SELECT
      (SELECT ISNULL(SUM(fond), 0) FROM filtered_docs) AS total_fond,
      ISNULL(SUM(CASE WHEN cdd.sens = 1 THEN ISNULL(cdd.quantite, 0) * ISNULL(cdd.montant, 0) ELSE 0 END), 0) AS total_entrees,
      ISNULL(SUM(CASE WHEN cdd.sens = -1 THEN ISNULL(cdd.quantite, 0) * ISNULL(cdd.montant, 0) ELSE 0 END), 0) AS total_sorties
    FROM filtered_docs fd
    LEFT JOIN caisse_document_detail cdd ON cdd.document_id = fd.id
  `;

  const resultData = await sequelize.query(query, {
    replacements,
    type: sequelize.QueryTypes.SELECT
  });

  const result = Array.isArray(resultData) && resultData.length > 0 ? resultData[0] : {};
  const totalFond = normalizeNumericValue(result?.total_fond, 0);
  const totalEntrees = normalizeNumericValue(result?.total_entrees, 0);
  const totalSorties = normalizeNumericValue(result?.total_sorties, 0);

  return {
    total_fond: totalFond,
    total_entrees: totalEntrees,
    total_sorties: totalSorties,
    solde: totalFond + totalEntrees - totalSorties
  };
};

const checkReglementExistsV2 = async (reglementId) => {
  const sequelize = getConnection();
  const query = `
    SELECT TOP 1 cd.id
    FROM caisse_document cd
    INNER JOIN caisse_document_detail cdd ON cdd.document_id = cd.id
    WHERE CAST(cdd.parent AS NVARCHAR(50)) = :reglementId
    ORDER BY cd.id DESC
  `;

  const results = await sequelize.query(query, {
    replacements: { reglementId: String(reglementId) },
    type: sequelize.QueryTypes.SELECT
  });

  const result = Array.isArray(results) && results.length > 0 ? results[0] : null;
  return result ? result.id : null;
};

const findOpenCaisseDocumentByDate = async (date, type = null, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const conditions = [
    'CONVERT(DATE, [date]) = CONVERT(DATE, :date)',
    'etat IS NULL'
  ];
  const replacements = { date };

  if (type === 1 || type === 2) {
    conditions.push('(type = 1 OR type = 2)');
  } else if (type !== null && type !== undefined) {
    conditions.push('type = :type');
    replacements.type = type;
  } else {
    conditions.push('type IS NULL');
  }

  const results = await sequelize.query(
    `SELECT TOP 1 id
     FROM caisse_document
     WHERE ${conditions.join(' AND ')}
     ORDER BY id DESC`,
    {
      replacements,
      type: sequelize.QueryTypes.SELECT
    }
  );

  const result = Array.isArray(results) && results.length > 0 ? results[0] : null;
  return result ? result.id : null;
};

const getCaisseDocumentsForReportV2 = async (dateFrom, dateTo, sequelizeConnection = null, caisseType = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const conditions = [];
  const replacements = {};

  if (dateFrom) {
    conditions.push('CONVERT(DATE, cd.[date]) >= CONVERT(DATE, :dateFrom)');
    replacements.dateFrom = dateFrom;
  }

  if (dateTo) {
    conditions.push('CONVERT(DATE, cd.[date]) <= CONVERT(DATE, :dateTo)');
    replacements.dateTo = dateTo;
  }

  if (caisseType === 'black') {
    conditions.push('(cd.type = 1 OR cd.type = 2)');
  } else {
    conditions.push('cd.type IS NULL');
  }

  const totalRecettesSql = getDetailTotalSql('cdd', 1);
  const totalDepensesSql = getDetailTotalSql('cdd', -1);
  const soldeNetSql = `ISNULL(cd.fond, 0) + ${totalRecettesSql} - ${totalDepensesSql}`;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT
      cd.id,
      cd.numero,
      cd.date,
      cd.site_id,
      cd.part_id,
      cd.employe_id,
      cd.departement_id,
      cd.affectation,
      ISNULL(cd.fond, 0) AS fond,
      ${soldeNetSql} AS montant,
      ${totalRecettesSql} AS total_recettes,
      ${totalDepensesSql} AS total_depenses,
      ${soldeNetSql} AS solde_net,
      cd.description,
      cd.etat,
      cd.imprime,
      cd.cr_date,
      cd.user_id,
      cd.type,
      p.nom AS partenaire_nom
    FROM caisse_document cd
    LEFT JOIN partenaire p ON p.part_id = cd.part_id
    LEFT JOIN caisse_document_detail cdd ON cdd.document_id = cd.id
    ${whereClause}
    GROUP BY
      cd.id,
      cd.numero,
      cd.date,
      cd.site_id,
      cd.part_id,
      cd.employe_id,
      cd.departement_id,
      cd.affectation,
      cd.fond,
      cd.description,
      cd.etat,
      cd.imprime,
      cd.cr_date,
      cd.user_id,
      cd.type,
      p.nom
    ORDER BY cd.date ASC, cd.numero ASC
  `;

  const results = await sequelize.query(query, {
    replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
    type: sequelize.QueryTypes.SELECT
  });

  return Array.isArray(results) ? results : (results ? [results] : []);
};

const getCaisseDocumentsForReportByEmployeV2 = async (dateFrom, dateTo, employeId, sequelizeConnection = null, caisseType = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const conditions = ['EXISTS (SELECT 1 FROM caisse_document_detail cdd_filter WHERE cdd_filter.document_id = cd.id AND cdd_filter.employe_id = :employeId)'];
  const replacements = { employeId };

  if (dateFrom) {
    conditions.push('CONVERT(DATE, cd.[date]) >= CONVERT(DATE, :dateFrom)');
    replacements.dateFrom = dateFrom;
  }

  if (dateTo) {
    conditions.push('CONVERT(DATE, cd.[date]) <= CONVERT(DATE, :dateTo)');
    replacements.dateTo = dateTo;
  }

  if (caisseType === 'black') {
    conditions.push('(cd.type = 1 OR cd.type = 2)');
  } else {
    conditions.push('cd.type IS NULL');
  }

  const totalRecettesSql = getDetailTotalSql('cdd', 1);
  const totalDepensesSql = getDetailTotalSql('cdd', -1);
  const soldeNetSql = `ISNULL(cd.fond, 0) + ${totalRecettesSql} - ${totalDepensesSql}`;
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const query = `
    SELECT
      cd.id,
      cd.numero,
      cd.date,
      cd.site_id,
      cd.part_id,
      cd.employe_id,
      cd.departement_id,
      cd.affectation,
      ISNULL(cd.fond, 0) AS fond,
      ${soldeNetSql} AS montant,
      ${totalRecettesSql} AS total_recettes,
      ${totalDepensesSql} AS total_depenses,
      ${soldeNetSql} AS solde_net,
      cd.description,
      cd.etat,
      cd.imprime,
      cd.cr_date,
      cd.user_id,
      cd.type,
      p.nom AS partenaire_nom
    FROM caisse_document cd
    LEFT JOIN partenaire p ON p.part_id = cd.part_id
    LEFT JOIN caisse_document_detail cdd ON cdd.document_id = cd.id
    ${whereClause}
    GROUP BY
      cd.id,
      cd.numero,
      cd.date,
      cd.site_id,
      cd.part_id,
      cd.employe_id,
      cd.departement_id,
      cd.affectation,
      cd.fond,
      cd.description,
      cd.etat,
      cd.imprime,
      cd.cr_date,
      cd.user_id,
      cd.type,
      p.nom
    ORDER BY cd.date ASC, cd.numero ASC
  `;

  const results = await sequelize.query(query, {
    replacements,
    type: sequelize.QueryTypes.SELECT
  });

  return Array.isArray(results) ? results : (results ? [results] : []);
};

const getBonDeCaisseByEmployeV2 = async (documentId, employeId, sequelizeConnection = null, detailSens = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const document = await getCaisseDocumentByIdV2(documentId, sequelize);

  if (!document) {
    throw new Error('Document de caisse introuvable');
  }

  const availableDetails = Array.isArray(document.details)
    ? document.details.filter((detail) => Number(detail.employe_id) === Number(employeId))
    : [];

  if (availableDetails.length === 0) {
    const employeCheck = await sequelize.query(
      `SELECT id, nom, prenom FROM employe WHERE id = :employeId`,
      {
        replacements: { employeId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const employe = Array.isArray(employeCheck) && employeCheck.length > 0 ? employeCheck[0] : null;
    if (!employe) {
      throw new Error(`Employé avec ID ${employeId} introuvable`);
    }

    throw new Error(`Aucun détail trouvé pour l'employé ${employe.nom || employeId} dans ce document.`);
  }

  const distinctSens = [...new Set(availableDetails.map((detail) => normalizeDetailSens(detail)))];
  let finalSens = detailSens === 1 || detailSens === -1 ? detailSens : null;

  if (finalSens === null) {
    if (distinctSens.length > 1) {
      throw new Error('Ce document contient à la fois des recettes et des dépenses pour cet employé. Le sens doit être précisé.');
    }
    finalSens = distinctSens[0];
  }

  const query = `
    SELECT
      c.numero,
      c.date,
      e.nom + ' ' + e.prenom AS employe,
      e.telephone,
      c.affectation AS operateur,
      ISNULL(l.nom, cdd.description) AS rubrique,
      cdd.quantite,
      cdd.montant,
      cdd.description,
      cdd.sens,
      CASE WHEN cdd.sens = 1 THEN 'recette' ELSE 'depense' END AS type_caisse,
      CASE
        WHEN c.type IN (1, 2) AND cdd.sens = 1 THEN 'recette black'
        WHEN c.type IN (1, 2) AND cdd.sens = -1 THEN 'depense black'
        WHEN cdd.sens = 1 THEN 'recette déclarée'
        ELSE 'depense déclarée'
      END AS type,
      c.type AS document_type
    FROM caisse_document_detail cdd
    INNER JOIN caisse_document c ON c.id = cdd.document_id
    LEFT JOIN listes l ON l.id = cdd.rubrique_id
      AND l.group_id = CASE
        WHEN cdd.sens = -1 THEN 3000
        WHEN cdd.sens = 1 THEN 2000
        WHEN EXISTS (
          SELECT 1
          FROM listes l_desc
          WHERE l_desc.id = cdd.rubrique_id
            AND l_desc.nom = cdd.description
            AND l_desc.group_id = 3000
        ) THEN 3000
        ELSE 2000
      END
    INNER JOIN employe e ON e.id = cdd.employe_id
    WHERE cdd.document_id = :documentId
      AND cdd.employe_id = :employeId
      AND cdd.sens = :sens
    ORDER BY
      cdd.ligne ASC,
      ISNULL(cdd.rubrique_id, 0) ASC,
      ISNULL(cdd.description, '') ASC
  `;

  const detailRows = await sequelize.query(query, {
    replacements: { documentId, employeId, sens: finalSens },
    type: sequelize.QueryTypes.SELECT
  });

  const details = Array.isArray(detailRows) ? detailRows : (detailRows ? [detailRows] : []);
  if (details.length === 0) {
    throw new Error('Aucun détail trouvé pour ce filtre.');
  }

  const total = details.reduce((sum, detail) => {
    return sum + (normalizeNumericValue(detail.quantite, 0) * normalizeNumericValue(detail.montant, 0));
  }, 0);

  return {
    document: {
      numero: document.numero,
      date: document.date,
      affectation: document.affectation,
      description: document.description,
      type_caisse: details[0].type_caisse,
      type: details[0].type,
      etat: document.etat,
      type_document: document.type
    },
    employe: {
      nom_complet: details[0].employe,
      telephone: details[0].telephone
    },
    details,
    total
  };
};

const getCaisseDetailsForReportGroup2000_3000V2 = async (dateFrom, dateTo, sequelizeConnection = null, caisseType = null, rubriqueIds = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const replacements = {};
  const conditions = ['l.group_id IN (2000, 3000)'];

  if (dateFrom) {
    conditions.push('CONVERT(DATE, cd.[date]) >= CONVERT(DATE, :dateFrom)');
    replacements.dateFrom = dateFrom;
  }

  if (dateTo) {
    conditions.push('CONVERT(DATE, cd.[date]) <= CONVERT(DATE, :dateTo)');
    replacements.dateTo = dateTo;
  }

  if (caisseType === 'black') {
    conditions.push('(cd.type = 1 OR cd.type = 2)');
  } else {
    conditions.push('cd.type IS NULL');
  }

  if (rubriqueIds && Array.isArray(rubriqueIds) && rubriqueIds.length > 0) {
    conditions.push('cdd.rubrique_id IN (:rubriqueIds)');
    replacements.rubriqueIds = rubriqueIds;
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const query = `
    SELECT
      cd.numero,
      cd.date,
      cdd.sens,
      l.nom AS rubrique,
      l.group_id,
      cdd.quantite,
      cdd.montant,
      cdd.description,
      UPPER(e.prenom + ' ' + e.nom) AS employe_nom_complet
    FROM caisse_document_detail cdd
    INNER JOIN caisse_document cd ON cd.id = cdd.document_id
    INNER JOIN listes l ON l.id = cdd.rubrique_id
    LEFT JOIN employe e ON e.id = cdd.employe_id
    ${whereClause}
    ORDER BY cd.date ASC, cd.numero ASC
  `;

  const results = await sequelize.query(query, {
    replacements,
    type: sequelize.QueryTypes.SELECT
  });

  return Array.isArray(results) ? results : (results ? [results] : []);
};

module.exports = {
  getAllCaisseDocuments: getAllCaisseDocumentsV2,
  getCaisseDocumentById: getCaisseDocumentByIdV2,
  createCaisseDocument: createCaisseDocumentV2,
  updateCaisseDocument: updateCaisseDocumentV2,
  updateCaisseDocumentBySens: updateCaisseDocumentBySensV2,
  cloturerCaisseDocument: cloturerCaisseDocumentV2,
  deleteCaisseDocument,
  getSoldeCaisse: getSoldeCaisseV2,
  checkReglementExists: checkReglementExistsV2,
  getCaisseDocumentsForReport: getCaisseDocumentsForReportV2,
  getCaisseDocumentsForReportByEmploye: getCaisseDocumentsForReportByEmployeV2,
  getBonDeCaisseByEmploye: getBonDeCaisseByEmployeV2,
  getCaisseDetailsForReportGroup2000_3000: getCaisseDetailsForReportGroup2000_3000V2,
  findOpenCaisseDocumentByDate
};
