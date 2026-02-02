const { getConnection } = require('../../config/database');

// Récupérer tous les bordereaux avec pagination
const getAllBordereaux = async (options = {}, sequelizeConnection = null) => {
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
    const validColumns = ['numero', 'date', 'compte_cible', 'type', 'etat'];
    const columnMapping = {
      'numero': 'br.numero',
      'date': 'br.date',
      'compte_cible': 'br.compte_cible',
      'type': 'br.type',
      'etat': 'br.etat'
    };
    const safeOrderBy = validColumns.includes(orderBy) ? columnMapping[orderBy] : 'br.date';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Construire la clause WHERE pour la recherche
    let whereClause = '';
    const replacements = {};

    if (search && search.trim()) {
      whereClause = `WHERE (
        br.numero LIKE :search 
        OR CAST(br.compte_cible AS VARCHAR) LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    // Requête avec pagination
    const query = `
      SELECT 
        br.id,
        br.numero,
        br.date,
        br.compte_cible,
        br.type,
        br.etat,
        etat_liste.nom AS etat_nom,
        type_liste.nom AS type_nom,
        COUNT(rb.regle_id) AS nombre_cheques,
        ISNULL(SUM(r.montant), 0) AS montant_total
      FROM bordereau_remise br
      LEFT JOIN listes etat_liste ON etat_liste.id = br.etat AND etat_liste.group_id = 8000
      LEFT JOIN listes type_liste ON type_liste.id = br.type AND type_liste.group_id = 9000
      LEFT JOIN regle_bordereau rb ON rb.bordereau_id = br.id
      LEFT JOIN reglement r ON r.regle_id = rb.regle_id
      ${whereClause}
      GROUP BY br.id, br.numero, br.date, br.compte_cible, br.type, br.etat, etat_liste.nom, type_liste.nom
      ORDER BY ${safeOrderBy} ${safeOrderDirection}
      OFFSET ${offset} ROWS
      FETCH NEXT ${safePageSize} ROWS ONLY
    `;
    
    // Requête pour compter le total
    const countReplacements = search && search.trim() ? { search: `%${search.trim()}%` } : {};
    const countQuery = `
      SELECT COUNT(DISTINCT br.id) as total
      FROM bordereau_remise br
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
      console.error('[getAllBordereaux] Erreur lors du comptage:', countError);
      throw new Error(`Erreur lors du comptage des bordereaux: ${countError.message || 'Erreur inconnue'}`);
    }
    
    try {
      console.log('[getAllBordereaux] Exécution requête:', query);
      console.log('[getAllBordereaux] Replacements:', replacements);
      const queryResult = await sequelize.query(query, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });
      
      if (Array.isArray(queryResult)) {
        results = queryResult;
      } else {
        results = queryResult ? [queryResult] : [];
      }
      console.log('[getAllBordereaux] Résultats finaux:', results.length, 'éléments');
    } catch (queryError) {
      console.error('[getAllBordereaux] Erreur lors de la requête:', queryError);
      console.error('[getAllBordereaux] Stack:', queryError.stack);
      throw new Error(`Erreur lors de la récupération des bordereaux: ${queryError.message || 'Erreur inconnue'}`);
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
    console.error('[getAllBordereaux] Erreur:', error);
    throw error;
  }
};

// Récupérer un bordereau par ID
const getBordereauById = async (id) => {
  const sequelize = getConnection();
  try {
    const [result] = await sequelize.query(
      `SELECT 
        br.id,
        br.numero,
        br.date,
        br.compte_cible,
        br.type,
        br.etat,
        etat_liste.nom AS etat_nom,
        type_liste.nom AS type_nom
      FROM bordereau_remise br
      LEFT JOIN listes etat_liste ON etat_liste.id = br.etat AND etat_liste.group_id = 8000
      LEFT JOIN listes type_liste ON type_liste.id = br.type AND type_liste.group_id = 9000
      WHERE br.id = :id`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    return result || null;
  } catch (error) {
    console.error('[getBordereauById] Erreur:', error);
    throw error;
  }
};

// Ajouter un bordereau avec transaction pour garantir l'atomicité
const addBordereau = async (data, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getCompteurCurrent } = require('../../services/compteur.service');
  
  // Utiliser une transaction pour garantir que l'insertion et l'incrémentation du compteur sont atomiques
  return await sequelize.transaction(async (t) => {
    try {
      const { numero, date, compte_cible, type, etat } = data;
      
      console.log('[addBordereau Model] 📥 Ajout bordereau avec données:', { numero, date, compte_cible, type, etat });
      
      // Si le numéro n'est pas fourni, le générer depuis le compteur BORD
      let numeroFinal = numero;
      if (!numeroFinal || numeroFinal.trim() === '') {
        console.log('[addBordereau Model] Génération automatique du numéro avec compteur BORD...');
        // Récupérer le compteur actuel (sans l'incrémenter) avec la bonne connexion
        const compteurActuel = await getCompteurCurrent('BORD', sequelize);
        if (compteurActuel === null || compteurActuel === undefined) {
          throw new Error('Impossible de récupérer le compteur BORD');
        }
        
        console.log('[addBordereau Model] ✅ Compteur BORD actuel:', compteurActuel);
        
        // Formater le numéro avec le code BORD
        const anneeCourte = new Date().getFullYear().toString().slice(2);
        // Le numéro sera incrémenté dans la requête SQL, donc on utilise compteurActuel + 1
        numeroFinal = `BORD${anneeCourte}-${(compteurActuel + 1).toString().padStart(4, '0')}`;
        console.log('[addBordereau Model] ✅ Numéro généré:', numeroFinal);
      }
      
      const completeQuery = `
        INSERT INTO bordereau_remise (numero, date, compte_cible, type, etat, user_id) 
        OUTPUT INSERTED.id 
        VALUES (:numero, :date, :compte_cible, :type, :etat, :user_id);
        UPDATE compteur SET compteur = compteur + 1 WHERE code = 'BORD';
      `;
      
      const replacements = { 
        numero: numeroFinal, 
        date, 
        compte_cible: compte_cible || null, 
        type: type || null, 
        etat: etat || null,
        user_id: 1
      };
      
      console.log('[addBordereau Model] Exécution de la requête SQL avec numéro:', numeroFinal);
      
      const [result] = await sequelize.query(completeQuery, {
        replacements,
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      });
      
      const bordereauId = result && (Array.isArray(result) ? (result[0]?.id || result[0]) : (result.id || result));
      
      console.log('[addBordereau Model] ✅ Bordereau créé avec ID:', bordereauId, 'et numéro:', numeroFinal);
      
      return {
        id: bordereauId,
        numero: numeroFinal
      };
      
    } catch (error) {
      console.error('[addBordereau Model] ❌ Erreur lors de l\'ajout du bordereau:', error);
      console.error('[addBordereau Model] ❌ Stack:', error.stack);
      // Le rollback sera automatique grâce à la transaction
      throw new Error(`Erreur lors de l'ajout du bordereau: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Modifier un bordereau
const updateBordereau = async (id, data) => {
  const sequelize = getConnection();
  try {
    const { numero, date, compte_cible, type, etat } = data;
    
    const updateQuery = `UPDATE bordereau_remise 
     SET numero = :numero, 
         date = :date, 
         compte_cible = :compte_cible, 
         type = :type, 
         etat = :etat
     WHERE id = :id`;
    
    const replacements = { id, numero, date, compte_cible: compte_cible || null, type: type || null, etat: etat || null };
    
    await sequelize.query(updateQuery, {
      replacements,
      type: sequelize.QueryTypes.UPDATE,
    });
    return { id, ...data };
  } catch (error) {
    console.error('[updateBordereau] Erreur:', error);
    throw error;
  }
};

// Supprimer un bordereau
const deleteBordereau = async (id) => {
  const sequelize = getConnection();
  try {
    // Supprimer d'abord les liaisons dans regle_bordereau
    await sequelize.query(
      'DELETE FROM regle_bordereau WHERE bordereau_id = :id',
      {
        replacements: { id },
        type: sequelize.QueryTypes.DELETE,
      }
    );
    
    // Puis supprimer le bordereau
    await sequelize.query(
      'DELETE FROM bordereau_remise WHERE id = :id',
      {
        replacements: { id },
        type: sequelize.QueryTypes.DELETE,
      }
    );
    return { success: true };
  } catch (error) {
    console.error('[deleteBordereau] Erreur:', error);
    throw error;
  }
};

// Récupérer tous les états depuis listes (group_id = 8000)
const getAllEtats = async () => {
  const sequelize = getConnection();
  try {
    const results = await sequelize.query(
      'SELECT id, nom FROM listes WHERE group_id = 8000 ORDER BY nom',
      {
        type: sequelize.QueryTypes.SELECT,
      }
    );
    return results || [];
  } catch (error) {
    console.error('[getAllEtats] Erreur:', error);
    throw error;
  }
};

// Récupérer tous les types depuis listes (group_id = 9000)
const getAllTypes = async () => {
  const sequelize = getConnection();
  try {
    const results = await sequelize.query(
      'SELECT id, nom FROM listes WHERE group_id = 9000 ORDER BY nom',
      {
        type: sequelize.QueryTypes.SELECT,
      }
    );
    return results || [];
  } catch (error) {
    console.error('[getAllTypes] Erreur:', error);
    throw error;
  }
};

// Récupérer les chèques disponibles pour le bordereau (TOUS les règlements avec mode = chèque)
const getChequesForBordereau = async (bordereau_id = null, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    console.log('[getChequesForBordereau Model] 📥 Récupération chèques disponibles');
    
    // Récupérer TOUS les chèques (règlements avec mode = chèque), même ceux déjà dans un bordereau
    // Si bordereau_id est fourni, on indique si le chèque est dans ce bordereau
    const query = `
      SELECT 
        r.regle_id AS id,
        r.regle_id,
        r.numero,
        r.date,
        r.montant,
        r.echeance,
        p.nom AS client,
        mr.nom AS mode,
        r.part_id,
        CASE 
          WHEN rb.bordereau_id IS NOT NULL AND (:bordereau_id IS NULL OR rb.bordereau_id = :bordereau_id) THEN 1 
          ELSE 0 
        END AS deja_remis,
        rb.bordereau_id AS current_bordereau_id
      FROM reglement r
      INNER JOIN partenaire p ON p.part_id = r.part_id
      INNER JOIN mode_regle mr ON mr.id = r.mode
      LEFT JOIN regle_bordereau rb ON rb.regle_id = r.regle_id
      WHERE (mr.nom LIKE '%chèque%' OR mr.nom LIKE '%cheque%' OR mr.nom LIKE '%effet%')
      ORDER BY r.date DESC, r.numero DESC
    `;
    
    const results = await sequelize.query(query, {
      replacements: { bordereau_id: bordereau_id || null },
      type: sequelize.QueryTypes.SELECT,
    });
    
    console.log(`[getChequesForBordereau Model] ✅ ${results?.length || 0} chèques récupérés`);
    if (results && results.length > 0) {
      console.log('[getChequesForBordereau Model] Exemple chèque:', results[0]);
    }
    
    return results || [];
  } catch (error) {
    console.error('[getChequesForBordereau Model] ❌ Erreur:', error);
    console.error('[getChequesForBordereau Model] ❌ Stack:', error.stack);
    throw error;
  }
};

// Enregistrer les chèques dans le bordereau
const saveChequesBordereau = async (bordereau_id, cheques) => {
  const sequelize = getConnection();
  
  // Utiliser une transaction pour garantir l'atomicité
  return await sequelize.transaction(async (t) => {
    try {
      // Supprimer les anciennes liaisons pour ce bordereau
      await sequelize.query(
        'DELETE FROM regle_bordereau WHERE bordereau_id = :bordereau_id',
        {
          replacements: { bordereau_id },
          type: sequelize.QueryTypes.DELETE,
          transaction: t
        }
      );
      
      // Insérer les nouvelles liaisons
      if (cheques && cheques.length > 0) {
        for (let i = 0; i < cheques.length; i++) {
          const cheque = cheques[i];
          const regle_id = cheque.regle_id || cheque.id;
          const ref_banque = cheque.ref_banque || '';
          const ligne = i + 1;
          const etat = cheque.etat !== undefined ? cheque.etat : 1;
          
          await sequelize.query(
            `INSERT INTO regle_bordereau (bordereau_id, regle_id, ref_banque, ligne, etat)
             VALUES (:bordereau_id, :regle_id, :ref_banque, :ligne, :etat)`,
            {
              replacements: { bordereau_id, regle_id, ref_banque, ligne, etat },
              type: sequelize.QueryTypes.INSERT,
              transaction: t
            }
          );
        }
      }
      
      return { success: true, count: cheques?.length || 0 };
    } catch (error) {
      console.error('[saveChequesBordereau] Erreur:', error);
      throw error;
    }
  });
};

// Récupérer les chèques d'un bordereau
const getChequesByBordereau = async (bordereau_id) => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT 
        rb.bordereau_id,
        rb.regle_id,
        rb.ref_banque,
        rb.ligne,
        rb.etat,
        r.numero,
        r.date,
        r.montant,
        r.echeance,
        p.nom AS client,
        mr.nom AS mode
      FROM regle_bordereau rb
      INNER JOIN reglement r ON r.regle_id = rb.regle_id
      INNER JOIN partenaire p ON p.part_id = r.part_id
      INNER JOIN mode_regle mr ON mr.id = r.mode
      WHERE rb.bordereau_id = :bordereau_id
      ORDER BY rb.ligne
    `;
    
    const results = await sequelize.query(query, {
      replacements: { bordereau_id },
      type: sequelize.QueryTypes.SELECT,
    });
    
    return results || [];
  } catch (error) {
    console.error('[getChequesByBordereau] Erreur:', error);
    throw error;
  }
};

// Récupérer les données d'un bordereau pour génération PDF
const getBordereauForPDF = async (bordereau_id) => {
  const sequelize = getConnection();
  try {
    // Utiliser la vue v_bordereau_report avec jointure pour récupérer les noms
    const query = `
      SELECT 
        v.id,
        v.bordereau_num,
        v.bordereau_date,
        v.compte_cible,
        v.client,
        v.type,
        v.etat,
        v.numero,
        v.date,
        v.montant,
        v.mode,
        v.reference,
        v.total
      FROM v_bordereau_report v
      WHERE v.id = :bordereau_id
      ORDER BY v.date
    `;
    
    const results = await sequelize.query(query, {
      replacements: { bordereau_id },
      type: sequelize.QueryTypes.SELECT,
    });
    
    if (!results || results.length === 0) {
      return [];
    }
    
    // Grouper les données par bordereau
    const bordereauData = {
      id: results[0].id,
      numero: results[0].bordereau_num,
      date: results[0].bordereau_date,
      compte_cible: results[0].compte_cible,
      type: results[0].type,
      etat: results[0].etat,
      type_nom: results[0].type_nom,
      etat_nom: results[0].etat_nom,
      total: results[0].total,
      cheques: results.map(row => ({
        numero: row.numero,
        date: row.date,
        client: row.client,
        montant: row.montant,
        mode: row.mode
      }))
    };
    
    return [bordereauData];
  } catch (error) {
    console.error('[getBordereauForPDF] Erreur:', error);
    throw error;
  }
};

module.exports = {
  getAllBordereaux,
  getBordereauById,
  addBordereau,
  updateBordereau,
  deleteBordereau,
  getAllEtats,
  getAllTypes,
  getChequesForBordereau,
  saveChequesBordereau,
  getChequesByBordereau,
  getBordereauForPDF
};

