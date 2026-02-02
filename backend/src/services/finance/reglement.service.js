const reglementModel = require('../../models/finance/reglement.model');
const { getCompteurFormate, getCompteurFormatePreview } = require('../compteur.service');
const reglementPdfService = require('./reglement-pdf.service');
const pdfConfigService = require('../pdf-config.service');

// Obtenir tous les règlements avec pagination
const getReglements = async (options = {}, sequelizeConnection = null) => {
  try {
    const result = await reglementModel.getAllReglements(options, sequelizeConnection);
    return result;
  } catch (error) {
    console.error('[getReglements Service] ❌ Erreur dans getReglements service:', error);
    throw error;
  }
};

// Obtenir un règlement par ID
const getReglementById = async (id) => {
  try {
    const result = await reglementModel.getReglementById(id);
    return result;
  } catch (error) {
    console.error('[getReglementById Service] ❌ Erreur:', error);
    throw error;
  }
};

// Générer le prochain numéro de règlement avec le compteur (sans incrémenter pour l'affichage)
const getNextReglementNumero = async (sequelizeConnection = null) => {
  try {
    console.log('[getNextReglementNumero Service] Génération du numéro...');
    const numeroFormate = await getCompteurFormatePreview('REG', 'REG', sequelizeConnection);
    console.log('[getNextReglementNumero Service] ✅ Numéro formaté:', numeroFormate);
    return { numero: numeroFormate };
  } catch (error) {
    console.error('[getNextReglementNumero Service] ❌ Erreur:', error);
    console.error('[getNextReglementNumero Service] ❌ Stack:', error.stack);
    throw error;
  }
};

// Ajouter un règlement
const addReglement = async (data, sequelizeConnection = null) => {
  try {
    console.log('[addReglement Service] 📥 Ajout règlement avec données:', data);
    // Générer automatiquement le numéro depuis le compteur REG si non fourni
    // Le numéro sera formaté dans la transaction pour garantir l'atomicité
    let numero = data.numero;
    
    const reglementData = { ...data, numero };
    const result = await reglementModel.addReglement(reglementData, sequelizeConnection);
    console.log('[addReglement Service] ✅ Règlement créé:', result);
    return { ...result, numero: result.numero || numero };
  } catch (error) {
    console.error('[addReglement Service] ❌ Erreur:', error);
    console.error('[addReglement Service] ❌ Stack:', error.stack);
    throw error;
  }
};

// Modifier un règlement
const updateReglement = async (id, data) => {
  try {
    const result = await reglementModel.updateReglement(id, data);
    return result;
  } catch (error) {
    console.error('[updateReglement Service] ❌ Erreur:', error);
    throw error;
  }
};

// Supprimer un règlement
const deleteReglement = async (id) => {
  try {
    const result = await reglementModel.deleteReglement(id);
    return result;
  } catch (error) {
    console.error('[deleteReglement Service] ❌ Erreur:', error);
    throw error;
  }
};

// Récupérer tous les modes de règlement
const getModeReglements = async () => {
  try {
    const result = await reglementModel.getAllModeReglements();
    return result;
  } catch (error) {
    console.error('[getModeReglements Service] ❌ Erreur:', error);
    throw error;
  }
};

// Récupérer les factures d'un client pour le lettrage
const getFacturesForLettrage = async (part_id, sequelizeConnection = null) => {
  try {
    console.log('[getFacturesForLettrage Service] 📥 Récupération factures pour part_id:', part_id);
    const result = await reglementModel.getFacturesForLettrage(part_id, sequelizeConnection);
    console.log(`[getFacturesForLettrage Service] ✅ ${result?.length || 0} factures retournées`);
    return result;
  } catch (error) {
    console.error('[getFacturesForLettrage Service] ❌ Erreur:', error);
    console.error('[getFacturesForLettrage Service] ❌ Stack:', error.stack);
    throw error;
  }
};

// Enregistrer le lettrage des factures
const saveLettrageFactures = async (regle_id, lettrages) => {
  try {
    const result = await reglementModel.saveLettrageFactures(regle_id, lettrages);
    return result;
  } catch (error) {
    console.error('[saveLettrageFactures Service] ❌ Erreur:', error);
    throw error;
  }
};

// Générer le PDF d'un règlement
const genererPDF = async (regle_id, options = {}) => {
  try {
    // Récupérer les données du règlement
    const reglementData = await reglementModel.getReglementForPDF(regle_id);
    
    if (!reglementData || reglementData.length === 0) {
      throw new Error('Règlement non trouvé ou sans données');
    }
    
    // Récupérer les informations depuis le fichier JSON de configuration
    const documentSociete = pdfConfigService.getDocumentSociete();
    
    // Générer le PDF
    const pdfPath = await reglementPdfService.genererPDF(reglementData, {
      ...options,
      documentSociete
    });
    
    return pdfPath;
  } catch (error) {
    console.error('[genererPDF Service] ❌ Erreur:', error);
    throw error;
  }
};

// Statistiques générales
const getReglementStats = async (options = {}, sequelizeConnection = null) => {
  try {
    const result = await reglementModel.getReglementStats(options, sequelizeConnection);
    return result;
  } catch (error) {
    console.error('[getReglementStats Service] ❌ Erreur:', error);
    throw error;
  }
};

// Répartition par mode
const getReglementByMode = async (options = {}, sequelizeConnection = null) => {
  try {
    const result = await reglementModel.getReglementByMode(options, sequelizeConnection);
    return result;
  } catch (error) {
    console.error('[getReglementByMode Service] ❌ Erreur:', error);
    throw error;
  }
};

// Évolution temporelle
const getReglementEvolution = async (options = {}, sequelizeConnection = null) => {
  try {
    const result = await reglementModel.getReglementEvolution(options, sequelizeConnection);
    return result;
  } catch (error) {
    console.error('[getReglementEvolution Service] ❌ Erreur:', error);
    throw error;
  }
};

// Top clients
const getTopClients = async (options = {}, sequelizeConnection = null) => {
  try {
    const result = await reglementModel.getTopClients(options, sequelizeConnection);
    return result;
  } catch (error) {
    console.error('[getTopClients Service] ❌ Erreur:', error);
    throw error;
  }
};

// Alertes
const getReglementAlerts = async (options = {}, sequelizeConnection = null) => {
  try {
    const result = await reglementModel.getReglementAlerts(options, sequelizeConnection);
    return result;
  } catch (error) {
    console.error('[getReglementAlerts Service] ❌ Erreur:', error);
    throw error;
  }
};

// Règlements récents
const getRecentReglements = async (options = {}, sequelizeConnection = null) => {
  try {
    const result = await reglementModel.getRecentReglements(options, sequelizeConnection);
    return result;
  } catch (error) {
    console.error('[getRecentReglements Service] ❌ Erreur:', error);
    throw error;
  }
};

module.exports = {
  getReglements,
  getReglementById,
  getNextReglementNumero,
  addReglement,
  updateReglement,
  deleteReglement,
  getModeReglements,
  getFacturesForLettrage,
  saveLettrageFactures,
  genererPDF,
  getReglementStats,
  getReglementByMode,
  getReglementEvolution,
  getTopClients,
  getReglementAlerts,
  getRecentReglements
};

