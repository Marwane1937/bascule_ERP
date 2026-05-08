const factureFournisseurModel = require('../../models/achats/facture-fournisseur.model');
const factureFournisseurScanService = require('./facture-fournisseur-scan.service');

// Obtenir toutes les factures fournisseur avec pagination
const getFacturesFournisseur = async (options = {}, sequelizeConnection = null) => {
  try {
    console.log('[getFacturesFournisseur Service] 🔍 Options reçues:', JSON.stringify(options, null, 2));
    const result = await factureFournisseurModel.getAllFacturesFournisseur(options, sequelizeConnection);
    console.log('[getFacturesFournisseur Service] 📊 Nombre de factures:', result?.data?.length || 0);
    return result;
  } catch (error) {
    console.error('[getFacturesFournisseur Service] ❌ Erreur:', error);
    return {
      data: [],
      pagination: {
        page: options.page || 1,
        pageSize: options.pageSize || 25,
        total: 0,
        totalPages: 0
      }
    };
  }
};

// Obtenir une facture fournisseur par ID
const getFactureFournisseur = async (id, sequelizeConnection = null) => {
  const facture = await factureFournisseurModel.getFactureFournisseurById(id, sequelizeConnection);
  if (!facture) {
    throw new Error('Facture fournisseur non trouvée');
  }
  return facture;
};

// Obtenir les commandes non facturées
const getCommandesNonFacturees = async (sequelizeConnection = null) => {
  try {
    const commandes = await factureFournisseurModel.getCommandesNonFacturees(sequelizeConnection);
    return commandes;
  } catch (error) {
    console.error('[getCommandesNonFacturees Service] ❌ Erreur:', error);
    throw error;
  }
};

// Créer une facture fournisseur depuis une commande
const createFactureFournisseurFromCommande = async (commandeId, sequelizeConnection = null) => {
  try {
    const result = await factureFournisseurModel.createFactureFournisseurFromCommande(commandeId, sequelizeConnection);
    console.log('[createFactureFournisseurFromCommande Service] ✅ Facture créée:', result);
    return result;
  } catch (error) {
    console.error('[createFactureFournisseurFromCommande Service] ❌ Erreur:', error);
    throw error;
  }
};

const createFactureFournisseurFromScan = async (scanData, sequelizeConnection = null) => {
  try {
    const result = await factureFournisseurModel.createFactureFournisseurFromScan(scanData, sequelizeConnection);
    return result;
  } catch (error) {
    console.error('[createFactureFournisseurFromScan Service] Erreur:', error);
    throw error;
  }
};

const createFactureFournisseurManual = async (factureData, sequelizeConnection = null) => {
  try {
    return await factureFournisseurModel.createFactureFournisseurManual(factureData, sequelizeConnection);
  } catch (error) {
    console.error('[createFactureFournisseurManual Service] Erreur:', error);
    throw error;
  }
};

const updateFactureFournisseur = async (id, factureData, sequelizeConnection = null) => {
  try {
    return await factureFournisseurModel.updateFactureFournisseur(id, factureData, sequelizeConnection);
  } catch (error) {
    console.error('[updateFactureFournisseur Service] Erreur:', error);
    throw error;
  }
};

const saveDetail = async ({ lignes }, sequelizeConnection = null) => {
  try {
    return await factureFournisseurModel.saveDetailLines(lignes, sequelizeConnection);
  } catch (error) {
    console.error('[saveDetail FactureFournisseur Service] Erreur:', error);
    throw error;
  }
};

const deleteLignesParIds = async (ligneIds, sequelizeConnection = null) => {
  try {
    return await factureFournisseurModel.deleteLignesParIds(ligneIds, sequelizeConnection);
  } catch (error) {
    console.error('[deleteLignesParIds FactureFournisseur Service] Erreur:', error);
    throw error;
  }
};

// Supprimer une facture fournisseur
const deleteFactureFournisseur = async (id, sequelizeConnection = null) => {
  try {
    const result = await factureFournisseurModel.deleteFactureFournisseur(id, sequelizeConnection);
    return result;
  } catch (error) {
    console.error('[deleteFactureFournisseur Service] ❌ Erreur:', error);
    throw error;
  }
};

const analyzeFactureFournisseurScan = async (file) => {
  return factureFournisseurScanService.analyzeFactureFournisseurScan(file);
};

module.exports = {
  getFacturesFournisseur,
  getFactureFournisseur,
  getCommandesNonFacturees,
  createFactureFournisseurFromCommande,
  createFactureFournisseurFromScan,
  createFactureFournisseurManual,
  updateFactureFournisseur,
  saveDetail,
  deleteLignesParIds,
  deleteFactureFournisseur,
  analyzeFactureFournisseurScan
};

