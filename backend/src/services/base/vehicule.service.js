const vehiculeModel = require('../../models/base/vehicule.model');
const { getConnection } = require('../../config/database');
const databaseSwitchService = require('../database-switch.service');

// Obtenir tous les véhicules
const getVehicules = async (sequelizeConnection = null) => {
  try {
    const connection = sequelizeConnection || getConnection();
    const results = await vehiculeModel.getAllVehicules(connection);
    return results || [];
  } catch (error) {
    console.error('❌ Erreur récupération véhicules:', error);
    throw error;
  }
};

// Obtenir tous les véhicules avec leurs charges urgentes (reste <= thresholdDays)
const getVehiculesWithUrgentCharges = async (thresholdDays = 10, sequelizeConnection = null) => {
  const connection = sequelizeConnection || getConnection();
  const vehicules = (await vehiculeModel.getAllVehicules(connection)) || [];
  const urgentCharges = await vehiculeModel.getUrgentVehiculeCharges(thresholdDays, connection);

  const byVehiculeId = new Map();
  for (const c of urgentCharges || []) {
    const key = c?.vehicule_id;
    if (!byVehiculeId.has(key)) byVehiculeId.set(key, []);
    byVehiculeId.get(key).push(c);
  }

  return (vehicules || []).map((v) => ({
    ...v,
    urgentCharges: byVehiculeId.get(v.id) || []
  }));
};

// Obtenir un véhicule par ID
const getVehicule = async (id, sequelizeConnection = null) => {
  const vehicule = await vehiculeModel.getVehiculeById(id, sequelizeConnection);
  if (!vehicule) {
    throw new Error('Véhicule non trouvé');
  }
  return vehicule;
};

// Obtenir les charges d'un véhicule
const getVehiculeCharges = async (vehicule_id, sequelizeConnection = null) => {
  try {
    const charges = await vehiculeModel.getVehiculeChargesById(vehicule_id, sequelizeConnection);
    return charges || [];
  } catch (error) {
    console.error('❌ Erreur récupération charges véhicule:', error);
    throw error;
  }
};

// Créer un nouveau véhicule
const createVehicule = async (vehiculeData, sequelizeConnection = null) => {
  const id = await vehiculeModel.addVehicule(vehiculeData, sequelizeConnection);
  return { id, ...vehiculeData };
};

// Modifier un véhicule existant
const editVehicule = async (id, vehiculeData, sequelizeConnection = null) => {
  const vehicule = await vehiculeModel.getVehiculeById(id, sequelizeConnection);
  if (!vehicule) {
    throw new Error('Véhicule à modifier non trouvé');
  }
  return await vehiculeModel.updateVehicule(id, vehiculeData, sequelizeConnection);
};

// Supprimer un véhicule
const deleteVehicule = async (id, sequelizeConnection = null) => {
  const vehicule = await vehiculeModel.getVehiculeById(id, sequelizeConnection);
  if (!vehicule) {
    throw new Error('Véhicule non trouvé');
  }
  await vehiculeModel.deleteVehicule(id, sequelizeConnection);
  return { message: 'Véhicule supprimé avec succès' };
};

// Créer une charge pour un véhicule
const createVehiculeCharge = async (vehicule_id, chargeData, sequelizeConnection = null) => {
  const id = await vehiculeModel.addVehiculeCharge({ vehicule_id, ...chargeData }, sequelizeConnection);
  return { id, vehicule_id, ...chargeData };
};

// Modifier une charge de véhicule
const updateVehiculeCharge = async (vehicule_id, chargeData, sequelizeConnection = null) => {
  await vehiculeModel.updateVehiculeCharge(chargeData, sequelizeConnection);
  return { message: 'Charge modifiée avec succès' };
};

// Supprimer une charge de véhicule
const deleteVehiculeCharge = async (id, sequelizeConnection = null) => {
  await vehiculeModel.deleteVehiculeCharge(id, sequelizeConnection);
  return { message: 'Charge supprimée avec succès' };
};

// Supprimer plusieurs charges de véhicule
const deleteVehiculeCharges = async (ids, sequelizeConnection = null) => {
  await vehiculeModel.deleteVehiculeCharges(ids, sequelizeConnection);
  return { message: 'Charges supprimées avec succès' };
};

module.exports = {
  getVehicules,
  getVehiculesWithUrgentCharges,
  getVehicule,
  getVehiculeCharges,
  createVehicule,
  editVehicule,
  deleteVehicule,
  createVehiculeCharge,
  updateVehiculeCharge,
  deleteVehiculeCharge,
  deleteVehiculeCharges
};

