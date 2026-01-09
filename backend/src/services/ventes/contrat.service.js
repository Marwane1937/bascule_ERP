const contratModel = require('../../models/ventes/contrat.model');

/**
 * Récupérer tous les contrats
 */
const getContrats = async (options = {}, sequelizeConnection = null) => {
  return await contratModel.getAllContrats(options, sequelizeConnection);
};

/**
 * Récupérer un contrat par ID
 */
const getContratById = async (id, sequelizeConnection = null) => {
  return await contratModel.getContratById(id, sequelizeConnection);
};

/**
 * Créer un nouveau contrat
 */
const createContrat = async (contratData, sequelizeConnection = null) => {
  return await contratModel.createContrat(contratData, sequelizeConnection);
};

/**
 * Mettre à jour un contrat
 */
const updateContrat = async (id, contratData, sequelizeConnection = null) => {
  return await contratModel.updateContrat(id, contratData, sequelizeConnection);
};

/**
 * Supprimer un contrat
 */
const deleteContrat = async (id, sequelizeConnection = null) => {
  return await contratModel.deleteContrat(id, sequelizeConnection);
};

/**
 * Récupérer les conditions de paiement
 */
const getConditionsPaiement = async (sequelizeConnection = null) => {
  return await contratModel.getConditionsPaiement(sequelizeConnection);
};

/**
 * Transférer un contrat vers facturation
 */
const transfererContratVersFacturation = async (stockId, factureDate, partId, sequelizeConnection = null) => {
  return await contratModel.transfererContratVersFacturation(stockId, factureDate, partId, sequelizeConnection);
};

/**
 * Sauvegarder les lignes de détails
 */
const saveDetail = async (data, sequelizeConnection = null) => {
  const lignes = data.lignes || [];
  return await contratModel.saveDetailLines(lignes, sequelizeConnection);
};

/**
 * Supprimer des lignes de détails
 */
const deleteLignes = async (ligneIds, sequelizeConnection = null) => {
  return await contratModel.deleteLignesParIds(ligneIds, sequelizeConnection);
};

module.exports = {
  getContrats,
  getContratById,
  createContrat,
  updateContrat,
  deleteContrat,
  getConditionsPaiement,
  transfererContratVersFacturation,
  saveDetail,
  deleteLignes
};

