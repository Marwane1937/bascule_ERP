const { getConnection } = require('../../config/database');

// Récupérer tous les règlements avec pagination
const getAllReglements = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'date', // Trier par date par défaut pour afficher les plus récents en premier
      orderDirection = 'DESC',
      search = ''
    } = options;

    // Calculer OFFSET pour la pagination
    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    // Vérifier que orderBy est une colonne valide et mapper aux colonnes réelles
    const validColumns = ['numero', 'date', 'client', 'mode', 'reference', 'montant'];
    const columnMapping = {
      'numero': 'r.numero',
      'date': 'r.date',
      'client': 'p.nom',
      'mode': 'mr.nom',
      'reference': 'r.reference',
      'montant': 'r.montant'
    };
    const safeOrderBy = validColumns.includes(orderBy) ? columnMapping[orderBy] : 'r.date'; // Par défaut trier par date
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Construire la clause WHERE pour la recherche
    let whereClause = '';
    const replacements = {};

    if (search && search.trim()) {
      whereClause = `WHERE (
        r.numero LIKE :search 
        OR p.nom LIKE :search
        OR r.reference LIKE :search
        OR mr.nom LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    // Requête avec pagination - inclure l'ID pour les opérations CRUD
    const query = `
      SELECT 
        regle_id,
        numero,
        date,
        client,
        mode,
        reference,
        montant,
        part_id,
        mode_id
      FROM (
        SELECT 
          r.regle_id,
          r.numero,
          r.date,
          p.nom AS client,
          mr.nom AS mode,
          r.reference,
          r.montant,
          r.part_id,
          r.mode AS mode_id,
          ROW_NUMBER() OVER (ORDER BY ${safeOrderBy} ${safeOrderDirection}) AS RowNum
        FROM reglement r
        INNER JOIN partenaire p ON p.part_id = r.part_id 
        INNER JOIN mode_regle mr ON mr.id = r.mode
        ${whereClause}
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY RowNum
    `;
    
    // Requête pour compter le total
    const countReplacements = search && search.trim() ? { search: `%${search.trim()}%` } : {};
    const countQuery = `
      SELECT COUNT(*) as total
      FROM reglement r
      INNER JOIN partenaire p ON p.part_id = r.part_id 
      INNER JOIN mode_regle mr ON mr.id = r.mode
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
      console.error('[getAllReglements] Erreur lors du comptage:', countError);
      throw new Error(`Erreur lors du comptage des règlements: ${countError.message || 'Erreur inconnue'}`);
    }
    
    try {
      const queryResult = await sequelize.query(query, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });
      // Pour SQL Server avec Sequelize QueryTypes.SELECT, les résultats sont directement dans le tableau
      if (Array.isArray(queryResult)) {
        results = queryResult;
      } else {
        results = queryResult ? [queryResult] : [];
      }
    } catch (queryError) {
      console.error('[getAllReglements] Erreur lors de la requête:', queryError);
      throw new Error(`Erreur lors de la récupération des règlements: ${queryError.message || 'Erreur inconnue'}`);
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
    console.error('[getAllReglements] Erreur:', error);
    throw error;
  }
};

// Récupérer un règlement par ID
const getReglementById = async (regle_id) => {
  const sequelize = getConnection();
  try {
    const [result] = await sequelize.query(
      `SELECT 
        r.regle_id,
        r.numero,
        r.date,
        r.reference,
        r.montant,
        r.part_id,
        r.mode AS mode_id,
        p.nom AS client,
        mr.nom AS mode
      FROM reglement r
      INNER JOIN partenaire p ON p.part_id = r.part_id 
      INNER JOIN mode_regle mr ON mr.id = r.mode
      WHERE r.regle_id = :regle_id`,
      {
        replacements: { regle_id },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    return result || null;
  } catch (error) {
    console.error('[getReglementById] Erreur:', error);
    throw error;
  }
};

// Ajouter un règlement avec transaction pour garantir l'atomicité
const addReglement = async (data, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getCompteurCurrent } = require('../../services/compteur.service');
  
  // Utiliser une transaction pour garantir que l'insertion et l'incrémentation du compteur sont atomiques
  return await sequelize.transaction(async (t) => {
    try {
      const { numero, date, part_id, mode, reference, montant } = data;
      
      console.log('[addReglement Model] 📥 Ajout règlement avec données:', { numero, date, part_id, mode, reference, montant });
      
      // Si le numéro n'est pas fourni, le générer depuis le compteur REG
      let numeroFinal = numero;
      if (!numeroFinal || numeroFinal.trim() === '') {
        console.log('[addReglement Model] Génération automatique du numéro avec compteur REG...');
        // Récupérer le compteur actuel (sans l'incrémenter) avec la bonne connexion
        const compteurActuel = await getCompteurCurrent('REG', sequelize);
        if (compteurActuel === null || compteurActuel === undefined) {
          throw new Error('Impossible de récupérer le compteur REG');
        }
        
        console.log('[addReglement Model] ✅ Compteur REG actuel:', compteurActuel);
        
        // Formater le numéro avec le code REG
        const anneeCourte = new Date().getFullYear().toString().slice(2);
        // Le numéro sera incrémenté dans la requête SQL, donc on utilise compteurActuel + 1
        numeroFinal = `REG${anneeCourte}-${(compteurActuel + 1).toString().padStart(4, '0')}`;
        console.log('[addReglement Model] ✅ Numéro généré:', numeroFinal);
      }
      
      // Exécuter l'insertion et l'incrémentation du compteur dans la même transaction
      const completeQuery = `
        INSERT INTO reglement (numero, date, part_id, sens, mode, reference, montant) 
        OUTPUT INSERTED.regle_id 
        VALUES (:numero, :date, :part_id, 1, :mode, :reference, :montant);
        UPDATE compteur SET compteur = compteur + 1 WHERE code = 'REG';
      `;
      
      console.log('[addReglement Model] Exécution de la requête SQL avec numéro:', numeroFinal);
      
      const [result] = await sequelize.query(completeQuery, {
        replacements: { 
          numero: numeroFinal, 
          date, 
          part_id, 
          mode, 
          reference: reference || '', 
          montant 
        },
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      });
      
      const regleId = result && (Array.isArray(result) ? (result[0]?.regle_id || result[0]?.id || result[0]) : (result.regle_id || result.id || result));
      
      console.log('[addReglement Model] ✅ Règlement créé avec ID:', regleId, 'et numéro:', numeroFinal);
      
      return {
        regle_id: regleId,
        id: regleId,
        numero: numeroFinal
      };
      
    } catch (error) {
      console.error('[addReglement Model] ❌ Erreur lors de l\'ajout du règlement:', error);
      console.error('[addReglement Model] ❌ Stack:', error.stack);
      // Le rollback sera automatique grâce à la transaction
      throw new Error(`Erreur lors de l'ajout du règlement: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Modifier un règlement
const updateReglement = async (regle_id, data) => {
  const sequelize = getConnection();
  try {
    const { numero, date, part_id, mode, reference, montant } = data;
    await sequelize.query(
      `UPDATE reglement 
       SET numero = :numero, 
           date = :date, 
           part_id = :part_id, 
           mode = :mode, 
           reference = :reference, 
           montant = :montant
       WHERE regle_id = :regle_id`,
      {
        replacements: { regle_id, numero, date, part_id, mode, reference, montant },
        type: sequelize.QueryTypes.UPDATE,
      }
    );
    return { regle_id, ...data };
  } catch (error) {
    console.error('[updateReglement] Erreur:', error);
    throw error;
  }
};

// Supprimer un règlement
const deleteReglement = async (regle_id) => {
  const sequelize = getConnection();
  try {
    await sequelize.query(
      'DELETE FROM reglement WHERE regle_id = :regle_id',
      {
        replacements: { regle_id },
        type: sequelize.QueryTypes.DELETE,
      }
    );
    return { success: true };
  } catch (error) {
    console.error('[deleteReglement] Erreur:', error);
    throw error;
  }
};

// Récupérer tous les modes de règlement
const getAllModeReglements = async () => {
  const sequelize = getConnection();
  try {
    const results = await sequelize.query(
      'SELECT id, nom FROM mode_regle ORDER BY nom',
      {
        type: sequelize.QueryTypes.SELECT,
      }
    );
    return results || [];
  } catch (error) {
    console.error('[getAllModeReglements] Erreur:', error);
    throw error;
  }
};

// Récupérer les factures d'un client pour le lettrage
const getFacturesForLettrage = async (part_id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    console.log('[getFacturesForLettrage Model] 📥 Récupération factures pour part_id:', part_id);
    const query = `
      SELECT 
        document_id,
        numero,
        date,
        facture,
        avoir,
        reglement,
        solde
      FROM v_pre_regle_facture
      WHERE part_id = :part_id
      ORDER BY date DESC, numero DESC
    `;
    
    const results = await sequelize.query(query, {
      replacements: { part_id },
      type: sequelize.QueryTypes.SELECT,
    });
    
    console.log(`[getFacturesForLettrage Model] ✅ ${results?.length || 0} factures récupérées`);
    if (results && results.length > 0) {
      console.log('[getFacturesForLettrage Model] Exemple facture:', results[0]);
    }
    
    return results || [];
  } catch (error) {
    console.error('[getFacturesForLettrage Model] ❌ Erreur:', error);
    console.error('[getFacturesForLettrage Model] ❌ Stack:', error.stack);
    throw error;
  }
};

// Enregistrer le lettrage des factures dans regle_facture
const saveLettrageFactures = async (regle_id, lettrages) => {
  const sequelize = getConnection();
  
  return await sequelize.transaction(async (t) => {
    try {
    
      // Insérer les nouveaux lettrages
      if (lettrages && lettrages.length > 0) {
        for (const lettrage of lettrages) {
          const { document_id, facture_ind, montant } = lettrage;
          
          await sequelize.query(
            `INSERT INTO regle_facture (regle_id, facture_id, facture_ind, montant)
             VALUES (:regle_id, :document_id, :facture_ind, :montant)`,
            {
              replacements: {
                regle_id,
                document_id,
                facture_ind: facture_ind || 1,
                montant
              },
              type: sequelize.QueryTypes.INSERT,
              transaction: t
            }
          );
        }
      }
      
      return { success: true, count: lettrages.length };
    } catch (error) {
      console.error('[saveLettrageFactures] Erreur:', error);
      throw error;
    }
  });
};

module.exports = {
  getAllReglements,
  getReglementById,
  addReglement,
  updateReglement,
  deleteReglement,
  getAllModeReglements,
  getFacturesForLettrage,
  saveLettrageFactures
};

