const receptionModel = require('../../models/achats/reception.model');

const getCommandesNonReceptionnees = async (sequelizeConnection = null) => {
  return await receptionModel.getCommandesNonReceptionnees(sequelizeConnection);
};

const getReceptions = async (options = {}, sequelizeConnection = null) => {
  return await receptionModel.getAllReceptions(options, sequelizeConnection);
};

const createReceptionFromCommande = async (commandeId, details = null, userId = null, sequelizeConnection = null) => {
  return await receptionModel.createReceptionFromCommande(commandeId, details, userId, sequelizeConnection);
};

const createReceptionFromStockEntree = async (entreeStockId, sequelizeConnection = null) => {
  return await receptionModel.createReceptionFromStockEntree(entreeStockId, sequelizeConnection);
};

const getReceptionById = async (id, sequelizeConnection = null) => {
  return await receptionModel.getReceptionById(id, sequelizeConnection);
};

const updateReception = async (id, receptionData, sequelizeConnection = null) => {
  return await receptionModel.updateReception(id, receptionData, sequelizeConnection);
};

const deleteReception = async (id, sequelizeConnection = null) => {
  return await receptionModel.deleteReception(id, sequelizeConnection);
};

const saveDetail = async ({ lignes, userId = null }, sequelizeConnection = null) => {
  return await receptionModel.saveDetailLines(lignes, userId, sequelizeConnection);
};

const deleteLignesParIds = async (ligneIds, sequelizeConnection = null) => {
  return await receptionModel.deleteLignesParIds(ligneIds, sequelizeConnection);
};

module.exports = {
  getCommandesNonReceptionnees,
  getReceptions,
  createReceptionFromCommande,
  createReceptionFromStockEntree,
  getReceptionById,
  updateReception,
  deleteReception,
  saveDetail,
  deleteLignesParIds
};
