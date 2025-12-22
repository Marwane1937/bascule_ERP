const employeService = require('../../services/base/employe.service');
const databaseSwitchService = require('../../services/database-switch.service');


const getEmployes = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const employes = await employeService.getEmployes(sequelize);
    res.json({
      success: true,
      data: employes
    });
  } catch (err) {
    console.error('[employe.controller.js] ❌ Erreur:', err);
    res.status(500).json({ 
      success: false,
      message: err.message 
    });
  }
};

const getEmploye = async (req, res) => {
  try {
    const employe = await employeService.getEmploye(req.params.id);
    if (!employe) return res.status(404).json({ message: 'Employé non trouvé' });
    res.json(employe);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createEmploye = async (req, res) => {
  try {
    const newEmploye = await employeService.createEmploye(req.body);
    res.status(201).json(newEmploye);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const editEmploye = async (req, res) => {
  try {
    const updated = await employeService.editEmploye(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteEmploye = async (req, res) => {
  try {
    const result = await employeService.deleteEmploye(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getEmployesActifs = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const employes = await employeService.getEmployesActifs(sequelize);
    res.json({
      success: true,
      data: employes
    });
  } catch (err) {
    console.error('[employe.controller.js] ❌ Erreur:', err);
    res.status(500).json({ 
      success: false,
      message: err.message 
    });
  }
};

module.exports = {
  getEmployes,
  getEmploye,
  createEmploye,
  editEmploye,
  deleteEmploye,
  getEmployesActifs
};

