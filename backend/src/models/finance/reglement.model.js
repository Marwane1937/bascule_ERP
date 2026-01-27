const { getConnection } = require('../../config/database');

// Récupérer tous les règlements avec pagination depuis v_reglement
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

    // Vérifier que orderBy est une colonne valide et mapper aux colonnes réelles de v_reglement
    const validColumns = ['numero', 'date', 'client', 'mode', 'montant', 'solde'];
    const columnMapping = {
      'numero': 'numero',
      'date': 'date',
      'client': 'client',
      'mode': 'mode',
      'montant': 'montant',
      'solde': 'solde'
    };
    const safeOrderBy = validColumns.includes(orderBy) ? columnMapping[orderBy] : 'date'; // Par défaut trier par date
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Construire la clause WHERE pour la recherche
    let whereClause = '';
    const replacements = {};

    if (search && search.trim()) {
      whereClause = `WHERE (
        numero LIKE :search 
        OR client LIKE :search
        OR mode LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    // Requête avec pagination depuis v_reglement
    // Note: Si v_reglement n'a pas regle_id, on doit le joindre avec reglement
    const query = `
      SELECT 
        r.regle_id,
        r.regle_id AS id,
        v.numero,
        v.date,
        v.client,
        v.mode,
        v.montant,
        v.solde
      FROM (
        SELECT 
          numero,
          date,
          client,
          mode,
          montant,
          solde,
          ROW_NUMBER() OVER (ORDER BY ${safeOrderBy} ${safeOrderDirection}) AS RowNum
        FROM v_reglement
        ${whereClause}
      ) v
      LEFT JOIN reglement r ON r.numero = v.numero
      WHERE v.RowNum > ${offset} AND v.RowNum <= ${offset + safePageSize}
      ORDER BY v.RowNum
    `;
    
    // Requête pour compter le total
    const countReplacements = search && search.trim() ? { search: `%${search.trim()}%` } : {};
    const countQuery = `
      SELECT COUNT(*) as total
      FROM v_reglement
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
      console.log('[getAllReglements] Exécution requête:', query);
      console.log('[getAllReglements] Replacements:', replacements);
      const queryResult = await sequelize.query(query, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });
      console.log('[getAllReglements] Résultat brut:', queryResult);
      // Pour SQL Server avec Sequelize QueryTypes.SELECT, les résultats sont directement dans le tableau
      if (Array.isArray(queryResult)) {
        results = queryResult;
      } else {
        results = queryResult ? [queryResult] : [];
      }
      console.log('[getAllReglements] Résultats finaux:', results.length, 'éléments');
    } catch (queryError) {
      console.error('[getAllReglements] Erreur lors de la requête:', queryError);
      console.error('[getAllReglements] Stack:', queryError.stack);
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
        r.echeance,
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
      const { numero, date, part_id, mode, reference, montant, echeance } = data;
      
      console.log('[addReglement Model] 📥 Ajout règlement avec données:', { numero, date, part_id, mode, reference, montant, echeance });
      
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
      
      // Construire la requête avec ou sans échéance selon le mode
      let completeQuery;
      let replacements;
      
      if (echeance) {
        completeQuery = `
          INSERT INTO reglement (numero, date, part_id, sens, mode, reference, montant, echeance) 
          OUTPUT INSERTED.regle_id 
          VALUES (:numero, :date, :part_id, 1, :mode, :reference, :montant, :echeance);
          UPDATE compteur SET compteur = compteur + 1 WHERE code = 'REG';
        `;
        replacements = { 
          numero: numeroFinal, 
          date, 
          part_id, 
          mode, 
          reference: reference || '', 
          montant,
          echeance
        };
      } else {
        completeQuery = `
          INSERT INTO reglement (numero, date, part_id, sens, mode, reference, montant) 
          OUTPUT INSERTED.regle_id 
          VALUES (:numero, :date, :part_id, 1, :mode, :reference, :montant);
          UPDATE compteur SET compteur = compteur + 1 WHERE code = 'REG';
        `;
        replacements = { 
          numero: numeroFinal, 
          date, 
          part_id, 
          mode, 
          reference: reference || '', 
          montant
        };
      }
      
      console.log('[addReglement Model] Exécution de la requête SQL avec numéro:', numeroFinal);
      
      const [result] = await sequelize.query(completeQuery, {
        replacements,
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
    const { numero, date, part_id, mode, reference, montant, echeance } = data;
    
    let updateQuery;
    let replacements;
    
    if (echeance !== undefined && echeance !== null) {
      updateQuery = `UPDATE reglement 
       SET numero = :numero, 
           date = :date, 
           part_id = :part_id, 
           mode = :mode, 
           reference = :reference, 
           montant = :montant,
           echeance = :echeance
       WHERE regle_id = :regle_id`;
      replacements = { regle_id, numero, date, part_id, mode, reference, montant, echeance };
    } else {
      updateQuery = `UPDATE reglement 
       SET numero = :numero, 
           date = :date, 
           part_id = :part_id, 
           mode = :mode, 
           reference = :reference, 
           montant = :montant
       WHERE regle_id = :regle_id`;
      replacements = { regle_id, numero, date, part_id, mode, reference, montant };
    }
    
    await sequelize.query(updateQuery, {
      replacements,
      type: sequelize.QueryTypes.UPDATE,
    });
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
      group by document_id,numero,date,facture,avoir,reglement,solde
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

// Récupérer les données d'un règlement pour génération PDF
const getReglementForPDF = async (regle_id) => {
  const sequelize = getConnection();
  try {
    const query = `
      Select r.regle_id ,
      r.numero , 
      r.date , 
      p.nom as client , 
      r.reference , 
      r.echeance , 
      mr.nom as mode ,
      coalesce(r.montant , 0) as montant_reglement ,
      fm.total_ttc as montant_facture ,
      fm.facture_num,
      coalesce(rf.montant , 0) AS montant_regle 
      from reglement r
      left join regle_facture rf on r.regle_id = rf.regle_id
      left join partenaire p on p.part_id = r.part_id
      left join mode_regle mr on r.mode = mr.id
      left join v_facture_montant fm on rf.facture_id = fm.facture_id
      where r.regle_id = :regle_id
      order by r.date
    `;
    
    const results = await sequelize.query(query, {
      replacements: { regle_id },
      type: sequelize.QueryTypes.SELECT,
    });
    
    return results || [];
  } catch (error) {
    console.error('[getReglementForPDF] Erreur:', error);
    throw error;
  }
};

module.exports = {
  getAllReglements,
  getReglementById,
  addReglement,
  updateReglement,
  deleteReglement,
  getAllModeReglements,
  getFacturesForLettrage,
  saveLettrageFactures,
  getReglementForPDF
};

