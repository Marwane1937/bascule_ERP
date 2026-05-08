const entreeStockModel = require('../../models/stock/entree-stock.model');
const databaseSwitchService = require('../database-switch.service');

const getEntreesStock = async (options = {}, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await entreeStockModel.getAllEntreesStock(options, sequelize);
  } catch (error) {
    console.error('[getEntreesStock] Erreur:', error);
    throw error;
  }
};

const getNextEntreeStockNumero = async (sequelizeConnection = null) => {
  const { getCompteurFormatePreview } = require('../compteur.service');
  const numeroFormate = await getCompteurFormatePreview('ENT', 'ENT', sequelizeConnection);
  return { numero: numeroFormate };
};

const createEntreeStock = async (entreeStockData, sequelizeConnection = null) => {
  const stockId = await entreeStockModel.addEntreeStock({
    numero: '',
    date: entreeStockData.date || null,
    description: entreeStockData.description || null,
    part_id: entreeStockData.part_id || null,
    contact_id: entreeStockData.contact_id || null,
    type: 21,
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

  const entreeStock = Array.isArray(rows) ? rows[0] : rows;
  return {
    id: stockId,
    stockId,
    numero: entreeStock?.numero || '',
    ...entreeStockData
  };
};

const getEntreeStock = async (id, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await entreeStockModel.getEntreeStockById(id, sequelize);
  } catch (error) {
    console.error('[getEntreeStock] Erreur:', error);
    throw error;
  }
};

const updateEntreeStock = async (id, entreeStockData, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    await entreeStockModel.updateEntreeStock(id, entreeStockData, sequelize);
    return await getEntreeStock(id, sequelize);
  } catch (error) {
    console.error('[updateEntreeStock] Erreur:', error);
    throw error;
  }
};

const saveDetail = async ({ lignes }, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await entreeStockModel.saveDetailLines(lignes, sequelize);
  } catch (error) {
    console.error('[saveDetail] Erreur:', error);
    throw error;
  }
};

const saveInfo = async (info, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await entreeStockModel.saveInfo(info, sequelize);
  } catch (error) {
    console.error('[saveInfo] Erreur:', error);
    throw error;
  }
};

module.exports = {
  getEntreesStock,
  getNextEntreeStockNumero,
  createEntreeStock,
  getEntreeStock,
  updateEntreeStock,
  saveDetail,
  saveInfo
};
