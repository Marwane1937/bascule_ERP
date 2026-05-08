// services/clientService.js
const devisModel = require('../../models/ventes/devis.model');
const { getCompteurFormate } = require('../compteur.service');

// Obtenir tous les devis avec pagination et filtres
const getDevis = async (options = {}, sequelizeConnection = null) => {
  return await devisModel.getAllDevis(options, sequelizeConnection);
};

// Obtenir toutes les commandes avec pagination et filtres
const getCommandes = async (options = {}, sequelizeConnection = null) => {
  return await devisModel.getAllCommande(options, sequelizeConnection);
};

// Obtenir un devis par ID
const getDevi = async (id, sequelizeConnection = null) => {
  try {
    console.log('[getDevi Service] Récupération devis ID:', id);
    const client = await devisModel.getDevisById(id, sequelizeConnection);
    if (!client) {
      console.warn('[getDevi Service] ⚠️ Devis non trouvé pour ID:', id);
      throw new Error('devis non trouvé');
    }
    console.log('[getDevi Service] ✅ Devis trouvé:', client);
    return client;
  } catch (error) {
    console.error('[getDevi Service] ❌ Erreur:', error.message);
    throw error;
  }
};

// Créer un nouveau devis
const createDevis = async (devisData, sequelizeConnection = null) => {
  const { getCompteurFormate } = require('../compteur.service');
  
  // Essayer d'abord avec 'DV', puis fallback sur 'DVC' si ça échoue
  let numeroFormate;
  try {
    numeroFormate = await getCompteurFormate('DV', 'DV', sequelizeConnection);
    console.log('[createDevis] ✅ Numéro formaté avec DV:', numeroFormate);
  } catch (dvError) {
    console.warn('[createDevis] ⚠️ Compteur "DV" non trouvé, tentative avec "DVC"...');
    console.warn('[createDevis] Erreur DV:', dvError.message);
    
    // Fallback sur DVC si DV n'existe pas
    try {
      numeroFormate = await getCompteurFormate('DVC', 'DV', sequelizeConnection);
      console.log('[createDevis] ✅ Numéro formaté avec DVC (fallback):', numeroFormate);
    } catch (dvcError) {
      console.error('[createDevis] ❌ Les deux codes (DV et DVC) ont échoué');
      throw new Error('Aucun compteur trouvé pour les devis. Veuillez créer un compteur avec le code "DV" ou "DVC" dans la table compteur.');
    }
  }
  
  const id = await devisModel.addDevis({ ...devisData, numero: numeroFormate, type: 1 }, sequelizeConnection);
  return {
    id,
    numero: numeroFormate,
    ...devisData
  };
};

// Créer une nouvelle commande
const createCommande = async (commandeData, sequelizeConnection = null) => {
  const { getCompteurFormate } = require('../compteur.service');
  
  // Utiliser le compteur BC pour les commandes
  let numeroFormate;
  try {
    numeroFormate = await getCompteurFormate('BC', 'BC', sequelizeConnection);
    console.log('[createCommande] ✅ Numéro formaté avec BC:', numeroFormate);
  } catch (bcError) {
    console.error('[createCommande] ❌ Compteur "BC" non trouvé');
    throw new Error('Aucun compteur trouvé pour les commandes. Veuillez créer un compteur avec le code "BC" dans la table compteur.');
  }
  
  // Date/heure courante si non fournie
  const dateCommande = commandeData.date || new Date().toISOString();
  const depotId = (() => {
    const n = parseInt(commandeData?.depot_id ?? commandeData?.adresse_id, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  })();
  
  // Utiliser addCommande qui met etat=NULL automatiquement
  const id = await devisModel.addCommande({ 
    ...commandeData, 
    depot_id: depotId,
    numero: numeroFormate, 
    date: dateCommande,
    type: 2 // Type commande (etat sera NULL)
  }, sequelizeConnection);
  
  return {
    id,
    numero: numeroFormate,
    date: dateCommande,
    ...commandeData
  };
};


// creerr un nouveau devis detail
const saveDetail = async (detailData, sequelizeConnection = null) => {
  console.log('DETAIL RECU:', detailData);

  return await devisModel.saveDetail(detailData, sequelizeConnection);
  
};

// creerr un nouveau devis Info
const saveInfo = async (detailData) => {
  console.log('DETAIL RECU:', detailData);

  return await devisModel.saveInfo(detailData);
  
};

// modifier un devis 
const updateDevis = async (id, devisData) => {
  return await devisModel.updateDevis(id, devisData);
};


// Modifier un client existant
const editDevis = async (id, devisData) => {
  const devis = await devisModel.getDevisById(id);
  if (!devis) {
    throw new Error('Devis à modifier non trouvé');
  }
  return await devisModel.updateDevis(id, devisData);
};

const deleteDevis = async (ids) => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new Error("Liste d'IDs invalide");
  }

  await devisModel.deleteDevis(ids);
  return { message: 'Suppression effectuée avec succès.' };
};


const deleteDetailsAndQuillByIds = async (ids) => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new Error("Liste d'IDs invalide");
  }

  await devisModel.deleteDetailsAndQuill(ids);
  return { message: 'Suppression effectuée avec succès.' };
};

// Obtenir les devis non transférés (type = 1, etat IS NULL ou etat != 3)
const getDevisNonTransferes = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || require('../../config/database');
  const queryResult = await sequelize.query(`
    SELECT DISTINCT vd.document_id, vd.numero, vd.date, vd.description, p.nom as client, c.nom as commercial
    FROM vente_document vd
    LEFT OUTER JOIN partenaire p ON p.part_id = vd.part_id
    LEFT OUTER JOIN contact c ON c.id = vd.contact_id
    WHERE vd.type = 1 
      AND (vd.etat IS NULL OR vd.etat != 3)
      AND NOT EXISTS (
        SELECT 1 
        FROM vente_document vd2 
        WHERE vd2.parent = vd.document_id 
          AND vd2.type = 2
      )
    ORDER BY vd.date DESC
  `, {
    type: sequelize.QueryTypes.SELECT
  });
  
  // Gérer le format de retour de Sequelize pour SQL Server
  let results;
  if (Array.isArray(queryResult)) {
    // Si c'est un tableau de tableaux (format SQL Server)
    if (queryResult.length > 0 && Array.isArray(queryResult[0])) {
      results = queryResult[0];
    } else {
      results = queryResult;
    }
  } else if (queryResult && typeof queryResult === 'object') {
    results = [queryResult];
  } else {
    results = [];
  }
  
  console.log(`[getDevisNonTransferes] ${results.length} devis non transférés trouvés`);
  return results;
};

// Obtenir le prochain numéro de commande
const getNextCommandeNumero = async (sequelizeConnection = null) => {
  const { getCompteurFormatePreview } = require('../compteur.service');
  // Utiliser le code 'BC' pour les commandes (selon demande utilisateur)
  const numeroFormate = await getCompteurFormatePreview('BC', 'BC', sequelizeConnection);
  return { numero: numeroFormate };
};

// Transférer un devis vers une commande
const transfererDevisVersCommande = async (devisId, sequelizeConnection = null) => {
  const { getCompteurFormate } = require('../compteur.service');
  
  // Obtenir le numéro de commande avec le compteur BC
  const numeroCommande = await getCompteurFormate('BC', 'BC', sequelizeConnection);
  
  // Transférer le devis vers commande
  const result = await devisModel.transfererDevisVersCommande(devisId, numeroCommande, sequelizeConnection);
  
  return result;
};

// Obtenir le prochain numéro de devis (sans incrémenter)
const getNextDevisNumero = async (sequelizeConnection = null) => {
  try {
    const { getCompteurFormatePreview } = require('../compteur.service');
    console.log('[getNextDevisNumero Service] Appel avec code: DV');
    
    // Essayer d'abord avec 'DV', puis fallback sur 'DVC' si ça échoue
    let numeroFormate;
    try {
      numeroFormate = await getCompteurFormatePreview('DV', 'DV', sequelizeConnection);
      console.log('[getNextDevisNumero Service] ✅ Numéro formaté avec DV:', numeroFormate);
    } catch (dvError) {
      console.warn('[getNextDevisNumero Service] ⚠️ Compteur "DV" non trouvé, tentative avec "DVC"...');
      console.warn('[getNextDevisNumero Service] Erreur DV:', dvError.message);
      
      // Fallback sur DVC si DV n'existe pas
      try {
        numeroFormate = await getCompteurFormatePreview('DVC', 'DV', sequelizeConnection);
        console.log('[getNextDevisNumero Service] ✅ Numéro formaté avec DVC (fallback):', numeroFormate);
      } catch (dvcError) {
        console.error('[getNextDevisNumero Service] ❌ Les deux codes (DV et DVC) ont échoué');
        throw new Error('Aucun compteur trouvé pour les devis. Veuillez créer un compteur avec le code "DV" ou "DVC" dans la table compteur.');
      }
    }
    
    return { numero: numeroFormate };
  } catch (error) {
    console.error('[getNextDevisNumero Service] ❌ Erreur finale:', error.message);
    console.error('[getNextDevisNumero Service] ❌ Stack:', error.stack);
    throw error;
  }
};

module.exports = {
  getDevis,
  getCommandes,
  getDevi,
  createDevis,
  createCommande,
  saveDetail,
  saveInfo,
  editDevis,
  deleteDevis,
  deleteDetailsAndQuillByIds,
  updateDevis,
  getDevisNonTransferes,
  getNextCommandeNumero,
  getNextDevisNumero,
  transfererDevisVersCommande
};
