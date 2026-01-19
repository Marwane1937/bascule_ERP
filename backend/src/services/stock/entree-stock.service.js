const entreeStockModel = require('../../models/stock/entree-stock.model');
const databaseSwitchService = require('../database-switch.service');

// Récupérer toutes les entrées de stock avec pagination
const getEntreesStock = async (options = {}, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await entreeStockModel.getAllEntreesStock(options, sequelize);
  } catch (error) {
    console.error('[getEntreesStock] Erreur:', error);
    throw error;
  }
};

// Générer le prochain numéro d'entrée de stock avec le compteur (sans incrémenter pour l'affichage)
const getNextEntreeStockNumero = async (sequelizeConnection = null) => {
  const { getCompteurFormatePreview } = require('../compteur.service');
  // Utiliser Preview pour ne pas incrémenter avant la création réelle
  const numeroFormate = await getCompteurFormatePreview('ENT', 'ENT', sequelizeConnection);
  return { numero: numeroFormate };
};

// Créer une nouvelle entrée de stock dans stock (avec etat=1 et type=21)
const createEntreeStock = async (entreeStockData, sequelizeConnection = null) => {
  // Passer numero vide pour que addEntreeStock génère automatiquement depuis le compteur
  const stockId = await entreeStockModel.addEntreeStock({
    numero: '', // Vide pour génération automatique
    date: entreeStockData.date || null,
    description: entreeStockData.description || null,
    part_id: entreeStockData.part_id || null,
    contact_id: entreeStockData.contact_id || null,
    type: 21, // Type = 21 pour entrée de stock
    etat: 1, // État = 1
    parent: null // Pas de parent pour une entrée créée manuellement
  }, sequelizeConnection);

  // Récupérer le numéro depuis la base de données
  const sequelize = sequelizeConnection || require('../../config/database').getConnection();
  const [entreeStock] = await sequelize.query(
    'SELECT numero FROM stock WHERE id = :id',
    {
      replacements: { id: stockId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const numeroFormate = (Array.isArray(entreeStock) ? entreeStock[0]?.numero : entreeStock?.numero) || '';

  return {
    id: stockId,
    stockId: stockId,
    numero: numeroFormate,
    ...entreeStockData
  };
};

// Récupérer une entrée de stock par ID
const getEntreeStock = async (id, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await entreeStockModel.getEntreeStockById(id, sequelize);
  } catch (error) {
    console.error('[getEntreeStock] Erreur:', error);
    throw error;
  }
};

// Mettre à jour une entrée de stock
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

// Sauvegarder les lignes de détail d'une entrée de stock
const saveDetail = async ({ lignes }, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await entreeStockModel.saveDetailLines(lignes, sequelize);
  } catch (error) {
    console.error('[saveDetail] Erreur:', error);
    throw error;
  }
};

// Sauvegarder les informations d'une entrée de stock
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

