const bonCommandeModel = require('../../models/achats/bon-commande.model');
const { getCompteurFormate } = require('../compteur.service');

// Obtenir tous les bons de commande avec pagination
const getBonCommande = async (options = {}, sequelizeConnection = null) => {
  return await bonCommandeModel.getAllBonCommande(options, sequelizeConnection);
};

// Obtenir un bon de commande par ID
const getBonCommandeById = async (id) => {
  const bonCommande = await bonCommandeModel.getBonCommandeById(id);
  if (!bonCommande) {
    throw new Error('Bon de commande non trouvé');
  }
  return bonCommande;
};

// Créer un nouveau bon de commande (type = 2)
const createBonCommande = async (bonCommandeData) => {
  const result = await bonCommandeModel.addBonCommande({ 
    ...bonCommandeData, 
    numero: '', 
    etat: 1,
    type: 2  // Forcer type = 2 pour bon de commande
  });
  return {
    id: result.document_id,
    numero: result.numero,
    ...bonCommandeData
  };
};

// Générer le prochain numéro de bon de commande
const getNextBonCommandeNumero = async () => {
  const { getCompteurFormatePreview } = require('../compteur.service');
  const numeroFormate = await getCompteurFormatePreview('BCF', 'BCF');
  return { numero: numeroFormate };
};

// Créer un nouveau détail de bon de commande
const saveDetail = async (detailData) => {
  return await bonCommandeModel.saveDetail(detailData);
};

// Créer/sauvegarder les infos de bon de commande
const saveInfo = async (infoData) => {
  return await bonCommandeModel.saveInfo(infoData);
};

// Modifier un bon de commande
const updateBonCommande = async (id, bonCommandeData) => {
  const bonCommande = await bonCommandeModel.getBonCommandeById(id);
  if (!bonCommande) {
    throw new Error('Bon de commande à modifier non trouvé');
  }
  return await bonCommandeModel.updateBonCommande(id, bonCommandeData);
};

// Supprimer un bon de commande
const deleteBonCommande = async (id) => {
  const bonCommande = await bonCommandeModel.getBonCommandeById(id);
  if (!bonCommande) {
    throw new Error('Bon de commande à supprimer non trouvé');
  }
  await bonCommandeModel.deleteBonCommande(id);
  return { success: true, message: 'Bon de commande supprimé avec succès' };
};

// Supprimer des lignes par IDs
const deleteLignesParIds = async (ids) => {
  return await bonCommandeModel.deleteLignesParIds(ids);
};

module.exports = {
  getBonCommande,
  getBonCommandeById,
  createBonCommande,
  getNextBonCommandeNumero,
  saveDetail,
  saveInfo,
  updateBonCommande,
  deleteBonCommande,
  deleteLignesParIds
};

