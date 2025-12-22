const sequelize = require('../config/database');

async function getCompteur(code, nb = 1, sequelizeConnection = null) {
  const trimmedCode = (code || '').trim();
  const query = `
    DECLARE @compteur NUMERIC(16);
    EXEC ps_compteur @code = :code, @nb = :nb, @compteur = @compteur OUTPUT;
    SELECT @compteur AS compteur;
  `;

  try {
    const connectionToUse = sequelizeConnection || sequelize;
    console.log(`[getCompteur] Appel avec code: "${trimmedCode}", nb: ${nb}`);

    const queryResult = await connectionToUse.query(query, {
      replacements: { code: trimmedCode, nb },
      type: connectionToUse.QueryTypes.SELECT,
    });

    console.log(`[getCompteur] Résultat brut:`, JSON.stringify(queryResult, null, 2));

    // Gérer le format de retour de Sequelize pour SQL Server
    let results;
    if (Array.isArray(queryResult)) {
      if (queryResult.length === 2 && Array.isArray(queryResult[0]) && !Array.isArray(queryResult[1])) {
        results = queryResult[0];
      } else {
        results = queryResult;
      }
    } else {
      results = queryResult;
    }

    console.log(`[getCompteur] Results après traitement:`, JSON.stringify(results, null, 2));

    // Essayer plusieurs façons d'extraire le compteur
    let compteur = null;
    if (Array.isArray(results) && results.length > 0) {
      const firstResult = results[0];
      compteur = firstResult?.compteur || firstResult?.Compteur || firstResult?.COMPTEUR ||
        firstResult?.compteur?.value || firstResult?.Compteur?.value;
    } else if (results && typeof results === 'object') {
      compteur = results.compteur || results.Compteur || results.COMPTEUR ||
        results.compteur?.value || results.Compteur?.value;
    }

    console.log(`[getCompteur] Compteur extrait:`, compteur, `(type: ${typeof compteur})`);

    // Si le compteur est toujours null, vérifier si c'est une erreur de la procédure stockée
    if (compteur === null || compteur === undefined) {
      // Vérifier si la procédure stockée a retourné une erreur
      console.error(`[getCompteur] ⚠️ Compteur null/undefined pour le code: ${code}`);
      console.error(`[getCompteur] Structure complète du résultat:`, JSON.stringify(queryResult, null, 2));

      // Si le compteur n'existe pas, la procédure stockée peut retourner NULL
      // Dans ce cas, on peut essayer de créer le compteur ou retourner une valeur par défaut
      throw new Error(`Compteur non trouvé pour le code: ${code}. Vérifiez que le compteur existe dans la table compteur avec ce code.`);
    }

    return compteur;
  } catch (error) {
    console.error(`[getCompteur] ❌ Erreur pour le code ${code}:`, error.message);
    console.error(`[getCompteur] Stack:`, error.stack);
    throw error;
  }
}

// Nouvelle fonction pour récupérer ET formater le numéro
async function getCompteurFormate(code, prefix, sequelizeConnection = null) {
  const compteur = await getCompteur(code, 1, sequelizeConnection);
  if (compteur === null || compteur === undefined) {
    throw new Error(`Impossible de récupérer le compteur pour le code: ${code}`);
  }
  const anneeCourte = new Date().getFullYear().toString().slice(2);
  const compteurNum = Number(compteur) || 0;
  const numeroFormate = `${prefix}${anneeCourte}-${compteurNum.toString().padStart(4, '0')}`;
  return numeroFormate;
}

// Fonction pour obtenir le compteur actuel SANS l'incrémenter
async function getCompteurCurrent(code, sequelizeConnection = null) {
  const trimmedCode = (code || '').trim();
  const connectionToUse = sequelizeConnection || sequelize;
  const query = `
    DECLARE @compteur NUMERIC(16);
    EXEC ps_compteur @code = :code, @nb = 0, @compteur = @compteur OUTPUT;
    SELECT @compteur AS compteur;
  `;

  try {
    console.log(`[getCompteurCurrent] Appel avec code: "${trimmedCode}", nb: 0`);

    const queryResult = await connectionToUse.query(query, {
      replacements: { code: trimmedCode },
      type: connectionToUse.QueryTypes.SELECT,
    });

    console.log(`[getCompteurCurrent] Résultat brut:`, JSON.stringify(queryResult, null, 2));

    // Gérer le format de retour de Sequelize pour SQL Server
    let results;
    if (Array.isArray(queryResult)) {
      if (queryResult.length === 2 && Array.isArray(queryResult[0]) && !Array.isArray(queryResult[1])) {
        results = queryResult[0];
      } else {
        results = queryResult;
      }
    } else {
      results = queryResult;
    }

    console.log(`[getCompteurCurrent] Results après traitement:`, JSON.stringify(results, null, 2));

    // Essayer plusieurs façons d'extraire le compteur
    let compteur = null;
    if (Array.isArray(results) && results.length > 0) {
      const firstResult = results[0];
      compteur = firstResult?.compteur || firstResult?.Compteur || firstResult?.COMPTEUR ||
        firstResult?.compteur?.value || firstResult?.Compteur?.value;
    } else if (results && typeof results === 'object') {
      compteur = results.compteur || results.Compteur || results.COMPTEUR ||
        results.compteur?.value || results.Compteur?.value;
    }

    console.log(`[getCompteurCurrent] Compteur extrait:`, compteur, `(type: ${typeof compteur})`);

    if (compteur === null || compteur === undefined) {
      console.error(`[getCompteurCurrent] ⚠️ Compteur null/undefined pour le code: ${code}`);
      console.error(`[getCompteurCurrent] Structure complète du résultat:`, JSON.stringify(queryResult, null, 2));
      throw new Error(`Compteur non trouvé pour le code: ${code}. Vérifiez que le compteur existe dans la table compteur avec ce code.`);
    }

    return Number(compteur) || 0;
  } catch (error) {
    console.error(`[getCompteurCurrent] ❌ Erreur pour le code ${code}:`, error.message);
    console.error(`[getCompteurCurrent] Stack:`, error.stack);
    throw error;
  }
}

// Fonction pour obtenir un aperçu du numéro formaté SANS incrémenter le compteur
async function getCompteurFormatePreview(code, prefix, sequelizeConnection = null) {
  const trimmedCode = (code || '').trim();
  const connectionToUse = sequelizeConnection || sequelize;
  const query = `
    DECLARE @compteur NUMERIC(16);
    EXEC ps_compteur @code = :code, @nb = 0, @compteur = @compteur OUTPUT;
    SELECT @compteur AS compteur;
  `;

  try {
    console.log(`[getCompteurFormatePreview] Appel avec code: "${trimmedCode}", nb: 0`);

    const queryResult = await connectionToUse.query(query, {
      replacements: { code: trimmedCode },
      type: connectionToUse.QueryTypes.SELECT,
    });

    console.log(`[getCompteurFormatePreview] Résultat brut:`, JSON.stringify(queryResult, null, 2));

    // Gérer le format de retour de Sequelize pour SQL Server
    let results;
    if (Array.isArray(queryResult)) {
      if (queryResult.length === 2 && Array.isArray(queryResult[0]) && !Array.isArray(queryResult[1])) {
        results = queryResult[0];
      } else {
        results = queryResult;
      }
    } else {
      results = queryResult;
    }

    console.log(`[getCompteurFormatePreview] Results après traitement:`, JSON.stringify(results, null, 2));

    // Essayer plusieurs façons d'extraire le compteur
    let compteur = null;
    if (Array.isArray(results) && results.length > 0) {
      const firstResult = results[0];
      compteur = firstResult?.compteur || firstResult?.Compteur || firstResult?.COMPTEUR ||
        firstResult?.compteur?.value || firstResult?.Compteur?.value;
    } else if (results && typeof results === 'object') {
      compteur = results.compteur || results.Compteur || results.COMPTEUR ||
        results.compteur?.value || results.Compteur?.value;
    }

    console.log(`[getCompteurFormatePreview] Compteur extrait:`, compteur, `(type: ${typeof compteur})`);

    if (compteur === null || compteur === undefined) {
      console.error(`[getCompteurFormatePreview] ⚠️ Compteur null/undefined pour le code: ${code}`);
      console.error(`[getCompteurFormatePreview] Structure complète du résultat:`, JSON.stringify(queryResult, null, 2));
      throw new Error(`Compteur non trouvé pour le code: ${code}. Vérifiez que le compteur existe dans la table compteur avec ce code.`);
    }

    const anneeCourte = new Date().getFullYear().toString().slice(2);
    const compteurNum = Number(compteur) || 0;
    const numeroFormate = `${prefix}${anneeCourte}-${(compteurNum + 1).toString().padStart(4, '0')}`;
    console.log(`[getCompteurFormatePreview] Numéro formaté: ${numeroFormate}`);
    return numeroFormate;
  } catch (error) {
    console.error(`[getCompteurFormatePreview] ❌ Erreur pour le code ${code}:`, error.message);
    console.error(`[getCompteurFormatePreview] Stack:`, error.stack);
    throw error;
  }
}

module.exports = { getCompteur, getCompteurFormate, getCompteurFormatePreview, getCompteurCurrent };
