const bordereauRemiseModel = require('../../models/finance/bordereau-remise.model');
const { getCompteurFormate, getCompteurFormatePreview } = require('../compteur.service');
const bordereauRemisePdfService = require('./bordereau-remise-pdf.service');
const pdfConfigService = require('../pdf-config.service');

// Obtenir tous les bordereaux avec pagination
const getBordereaux = async (options = {}, sequelizeConnection = null) => {
  try {
    const result = await bordereauRemiseModel.getAllBordereaux(options, sequelizeConnection);
    return result;
  } catch (error) {
    console.error('[getBordereaux Service] ❌ Erreur dans getBordereaux service:', error);
    throw error;
  }
};

// Obtenir un bordereau par ID
const getBordereauById = async (id) => {
  try {
    const result = await bordereauRemiseModel.getBordereauById(id);
    return result;
  } catch (error) {
    console.error('[getBordereauById Service] ❌ Erreur:', error);
    throw error;
  }
};

// Générer le prochain numéro de bordereau avec le compteur (sans incrémenter pour l'affichage)
const getNextBordereauNumero = async (sequelizeConnection = null) => {
  try {
    console.log('[getNextBordereauNumero Service] Génération du numéro...');
    const numeroFormate = await getCompteurFormatePreview('BORD', 'BORD', sequelizeConnection);
    console.log('[getNextBordereauNumero Service] ✅ Numéro formaté:', numeroFormate);
    return { numero: numeroFormate };
  } catch (error) {
    console.error('[getNextBordereauNumero Service] ❌ Erreur:', error);
    console.error('[getNextBordereauNumero Service] ❌ Stack:', error.stack);
    throw error;
  }
};

// Ajouter un bordereau
const addBordereau = async (data, sequelizeConnection = null) => {
  try {
    console.log('[addBordereau Service] 📥 Ajout bordereau avec données:', data);
    // Générer automatiquement le numéro depuis le compteur BORD si non fourni
    let numero = data.numero;
    
    const bordereauData = { ...data, numero };
    const result = await bordereauRemiseModel.addBordereau(bordereauData, sequelizeConnection);
    console.log('[addBordereau Service] ✅ Bordereau créé:', result);
    return { ...result, numero: result.numero || numero };
  } catch (error) {
    console.error('[addBordereau Service] ❌ Erreur:', error);
    console.error('[addBordereau Service] ❌ Stack:', error.stack);
    throw error;
  }
};

// Modifier un bordereau
const updateBordereau = async (id, data) => {
  try {
    const result = await bordereauRemiseModel.updateBordereau(id, data);
    return result;
  } catch (error) {
    console.error('[updateBordereau Service] ❌ Erreur:', error);
    throw error;
  }
};

// Supprimer un bordereau
const deleteBordereau = async (id) => {
  try {
    const result = await bordereauRemiseModel.deleteBordereau(id);
    return result;
  } catch (error) {
    console.error('[deleteBordereau Service] ❌ Erreur:', error);
    throw error;
  }
};

// Récupérer tous les états
const getEtats = async () => {
  try {
    const result = await bordereauRemiseModel.getAllEtats();
    return result;
  } catch (error) {
    console.error('[getEtats Service] ❌ Erreur:', error);
    throw error;
  }
};

// Récupérer tous les types
const getTypes = async () => {
  try {
    const result = await bordereauRemiseModel.getAllTypes();
    return result;
  } catch (error) {
    console.error('[getTypes Service] ❌ Erreur:', error);
    throw error;
  }
};

// Récupérer les chèques disponibles pour le bordereau
const getChequesForBordereau = async (bordereau_id = null, sequelizeConnection = null) => {
  try {
    console.log('[getChequesForBordereau Service] 📥 Récupération chèques disponibles, bordereau_id:', bordereau_id);
    const result = await bordereauRemiseModel.getChequesForBordereau(bordereau_id, sequelizeConnection);
    console.log(`[getChequesForBordereau Service] ✅ ${result?.length || 0} chèques retournés`);
    return result;
  } catch (error) {
    console.error('[getChequesForBordereau Service] ❌ Erreur:', error);
    console.error('[getChequesForBordereau Service] ❌ Stack:', error.stack);
    throw error;
  }
};

// Enregistrer les chèques dans le bordereau
const saveChequesBordereau = async (bordereau_id, cheques) => {
  try {
    const result = await bordereauRemiseModel.saveChequesBordereau(bordereau_id, cheques);
    return result;
  } catch (error) {
    console.error('[saveChequesBordereau Service] ❌ Erreur:', error);
    throw error;
  }
};

// Récupérer les chèques d'un bordereau
const getChequesByBordereau = async (bordereau_id) => {
  try {
    const result = await bordereauRemiseModel.getChequesByBordereau(bordereau_id);
    return result;
  } catch (error) {
    console.error('[getChequesByBordereau Service] ❌ Erreur:', error);
    throw error;
  }
};

// Générer le PDF d'un bordereau
const genererPDF = async (bordereau_id, options = {}) => {
  try {
    // Récupérer les données du bordereau
    const bordereauData = await bordereauRemiseModel.getBordereauForPDF(bordereau_id);
    
    if (!bordereauData || bordereauData.length === 0) {
      throw new Error('Bordereau non trouvé ou sans données');
    }
    
    // Récupérer les informations depuis le fichier JSON de configuration
    const documentSociete = pdfConfigService.getDocumentSociete();
    
    // Générer le PDF
    const pdfPath = await bordereauRemisePdfService.genererPDF(bordereauData, {
      ...options,
      documentSociete
    });
    
    return pdfPath;
  } catch (error) {
    console.error('[genererPDF Service] ❌ Erreur:', error);
    throw error;
  }
};

module.exports = {
  getBordereaux,
  getBordereauById,
  getNextBordereauNumero,
  addBordereau,
  updateBordereau,
  deleteBordereau,
  getEtats,
  getTypes,
  getChequesForBordereau,
  saveChequesBordereau,
  getChequesByBordereau,
  genererPDF
};

