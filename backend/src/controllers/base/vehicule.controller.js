const vehiculeService = require('../../services/base/vehicule.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getVehicules = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const vehicules = await vehiculeService.getVehicules(sequelize);
    res.json({
      success: true,
      data: vehicules || []
    });
  } catch (err) {
    console.error('[getVehicules Controller] ❌ Erreur récupération véhicules:', err);
    console.error('[getVehicules Controller] ❌ Stack:', err.stack);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération des véhicules',
      data: []
    });
  }
};

const getVehiculesWithUrgentCharges = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const threshold = Number(req.query?.threshold || 10);
    const vehicules = await vehiculeService.getVehiculesWithUrgentCharges(threshold, sequelize);
    res.json({
      success: true,
      data: vehicules || []
    });
  } catch (err) {
    console.error('[getVehiculesWithUrgentCharges Controller] ❌ Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération des véhicules',
      data: []
    });
  }
};

const getVehicule = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const vehicule = await vehiculeService.getVehicule(req.params.id, sequelize);
    if (!vehicule) return res.status(404).json({ message: 'Véhicule non trouvé' });
    res.json(vehicule);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getVehiculeCharges = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const charges = await vehiculeService.getVehiculeCharges(req.params.id, sequelize);
    res.json({
      success: true,
      data: charges || []
    });
  } catch (err) {
    console.error('[getVehiculeCharges Controller] ❌ Erreur:', err);
    console.error('[getVehiculeCharges Controller] ❌ Stack:', err.stack);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération des charges',
      data: []
    });
  }
};

const createVehicule = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const newVehicule = await vehiculeService.createVehicule(req.body, sequelize);
    res.status(201).json(newVehicule);
  } catch (err) {
    console.error('[createVehicule Controller] ❌ Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

const createVehiculeCharge = async (req, res) => {
  const vehicule_id = parseInt(req.params.id);
  const charge = req.body;

  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await vehiculeService.createVehiculeCharge(vehicule_id, charge, sequelize);
    res.status(201).json(result);
  } catch (err) {
    console.error('[createVehiculeCharge Controller] ❌ Erreur:', err);
    console.error('[createVehiculeCharge Controller] ❌ Stack:', err.stack);
    res.status(500).json({ message: err.message || 'Erreur lors de la création de la charge' });
  }
};

const updateVehiculeCharge = async (req, res) => {
  const vehicule_id = parseInt(req.params.id);
  const charge = req.body;

  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await vehiculeService.updateVehiculeCharge(vehicule_id, charge, sequelize);
    res.status(200).json(result);
  } catch (err) {
    console.error('Erreur updateVehiculeCharge:', err);
    res.status(500).json({ message: err.message });
  }
};

const deleteVehiculeCharge = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await vehiculeService.deleteVehiculeCharge(req.params.id, sequelize);
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

const deleteVehiculeCharges = async (req, res) => {
  const { ids } = req.body;

  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await vehiculeService.deleteVehiculeCharges(ids, sequelize);
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

const editVehicule = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const updated = await vehiculeService.editVehicule(req.params.id, req.body, sequelize);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteVehicule = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await vehiculeService.deleteVehicule(req.params.id, sequelize);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getVehicules,
  getVehiculesWithUrgentCharges,
  getVehicule,
  getVehiculeCharges,
  createVehicule,
  createVehiculeCharge,
  updateVehiculeCharge,
  deleteVehiculeCharge,
  deleteVehiculeCharges,
  editVehicule,
  deleteVehicule
};

