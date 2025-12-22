const listesService = require('../services/listes.service');
const databaseSwitchService = require('../services/database-switch.service');


const getAllGroupIds = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const groupIds = await listesService.getAllGroupIds(sequelize);
    res.json({
      success: true,
      data: groupIds
    });
  } catch (err) {
    console.error('[listes.controller.js] ❌ Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const getListesByGroupId = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { group_id } = req.params;
    const listes = await listesService.getListesByGroupId(group_id, sequelize);
    res.json(listes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getListe = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const liste = await listesService.getListe(req.params.id, sequelize);
    if (!liste) return res.status(404).json({ message: 'Liste non trouvée' });
    res.json(liste);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createListe = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const newListe = await listesService.createListe(req.body, sequelize);
    res.status(201).json(newListe);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const editListe = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const updated = await listesService.editListe(req.params.id, req.body, sequelize);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteListe = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await listesService.deleteListe(req.params.id, sequelize);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getAllGroupIds,
  getListesByGroupId,
  getListe,
  createListe,
  editListe,
  deleteListe
};

