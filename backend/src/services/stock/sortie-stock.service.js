const sortieStockModel = require('../../models/stock/sortie-stock.model');
const databaseSwitchService = require('../database-switch.service');

const getSortiesStock = async (options = {}, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await sortieStockModel.getAllSortiesStock(options, sequelize);
  } catch (error) {
    console.error('[getSortiesStock] Erreur:', error);
    throw error;
  }
};

const getNextSortieStockNumero = async (sequelizeConnection = null) => {
  const { getCompteurFormatePreview } = require('../compteur.service');
  const numeroFormate = await getCompteurFormatePreview('SRT', 'SRT', sequelizeConnection);
  return { numero: numeroFormate };
};

const createSortieStock = async (sortieStockData, sequelizeConnection = null) => {
  const stockId = await sortieStockModel.addSortieStock({
    numero: '',
    date: sortieStockData.date || null,
    description: sortieStockData.description || null,
    part_id: sortieStockData.part_id || null,
    contact_id: sortieStockData.contact_id || null,
    type: 22,
    etat: 1,
    parent: null
  }, sequelizeConnection);

  const sequelize = sequelizeConnection || require('../../config/database').getConnection();
  const rows = await sequelize.query(
    'SELECT numero FROM stock_document WHERE id = :id',
    {
      replacements: { id: stockId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const sortieStock = Array.isArray(rows) ? rows[0] : rows;
  return {
    id: stockId,
    stockId,
    numero: sortieStock?.numero || '',
    ...sortieStockData
  };
};

const getSortieStock = async (id, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await sortieStockModel.getSortieStockById(id, sequelize);
  } catch (error) {
    console.error('[getSortieStock] Erreur:', error);
    throw error;
  }
};

const updateSortieStock = async (id, sortieStockData, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    await sortieStockModel.updateSortieStock(id, sortieStockData, sequelize);
    return await getSortieStock(id, sequelize);
  } catch (error) {
    console.error('[updateSortieStock] Erreur:', error);
    throw error;
  }
};

const saveDetail = async ({ lignes }, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await sortieStockModel.saveDetailLines(lignes, sequelize);
  } catch (error) {
    console.error('[saveDetail] Erreur:', error);
    throw error;
  }
};

const saveInfo = async (info, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await sortieStockModel.saveInfo(info, sequelize);
  } catch (error) {
    console.error('[saveInfo] Erreur:', error);
    throw error;
  }
};

const transferSortieStockToLivraison = async (sortieStockId, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await sortieStockModel.transferSortieStockToLivraison(sortieStockId, sequelize);
  } catch (error) {
    console.error('[transferSortieStockToLivraison] Erreur:', error);
    throw error;
  }
};

module.exports = {
  getSortiesStock,
  getNextSortieStockNumero,
  createSortieStock,
  getSortieStock,
  updateSortieStock,
  saveDetail,
  saveInfo,
  transferSortieStockToLivraison
};
