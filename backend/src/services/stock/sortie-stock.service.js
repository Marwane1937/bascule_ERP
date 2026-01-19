const sortieStockModel = require('../../models/stock/sortie-stock.model');
const databaseSwitchService = require('../database-switch.service');

// Récupérer toutes les sorties de stock avec pagination
const getSortiesStock = async (options = {}, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await sortieStockModel.getAllSortiesStock(options, sequelize);
  } catch (error) {
    console.error('[getSortiesStock] Erreur:', error);
    throw error;
  }
};

// Générer le prochain numéro de sortie de stock avec le compteur (sans incrémenter pour l'affichage)
const getNextSortieStockNumero = async (sequelizeConnection = null) => {
  const { getCompteurFormatePreview } = require('../compteur.service');
  // Utiliser Preview pour ne pas incrémenter avant la création réelle
  const numeroFormate = await getCompteurFormatePreview('SRT', 'SRT', sequelizeConnection);
  return { numero: numeroFormate };
};

// Créer une nouvelle sortie de stock dans stock (avec etat=1 et type=22)
const createSortieStock = async (sortieStockData, sequelizeConnection = null) => {
  // Passer numero vide pour que addSortieStock génère automatiquement depuis le compteur
  const stockId = await sortieStockModel.addSortieStock({
    numero: '', // Vide pour génération automatique
    date: sortieStockData.date || null,
    description: sortieStockData.description || null,
    part_id: sortieStockData.part_id || null,
    contact_id: sortieStockData.contact_id || null,
    type: 22, // Type = 22 pour sortie de stock
    etat: 1, // État = 1
    parent: null // Pas de parent pour une sortie créée manuellement
  }, sequelizeConnection);

  // Récupérer le numéro depuis la base de données
  const sequelize = sequelizeConnection || require('../../config/database').getConnection();
  const [sortieStock] = await sequelize.query(
    'SELECT numero FROM stock WHERE id = :id',
    {
      replacements: { id: stockId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const numeroFormate = (Array.isArray(sortieStock) ? sortieStock[0]?.numero : sortieStock?.numero) || '';

  return {
    id: stockId,
    stockId: stockId,
    numero: numeroFormate,
    ...sortieStockData
  };
};

// Récupérer une sortie de stock par ID
const getSortieStock = async (id, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await sortieStockModel.getSortieStockById(id, sequelize);
  } catch (error) {
    console.error('[getSortieStock] Erreur:', error);
    throw error;
  }
};

// Mettre à jour une sortie de stock
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

// Sauvegarder les lignes de détail d'une sortie de stock
const saveDetail = async ({ lignes }, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await sortieStockModel.saveDetailLines(lignes, sequelize);
  } catch (error) {
    console.error('[saveDetail] Erreur:', error);
    throw error;
  }
};

// Sauvegarder les informations d'une sortie de stock
const saveInfo = async (info, sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
    return await sortieStockModel.saveInfo(info, sequelize);
  } catch (error) {
    console.error('[saveInfo] Erreur:', error);
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
  saveInfo
};



