const FamilleService = require('../../services/base/famille.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getFamilles = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const familles = await FamilleService.getFamilles(sequelize);
    res.json({
      success: true,
      data: familles
    });
  } catch (err) {
    console.error('❌ [FamilleController] Erreur récupération familles:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const getUnites = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const familles = await FamilleService.getUnites(sequelize);
    res.json({
      success: true,
      data: familles
    });
  } catch (err) {
    console.error('❌ [FamilleController] Erreur récupération unités:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const getFamille = async (req, res) => {
  try {
    const famille = await FamilleService.getFamille(req.params.id); // ✅ ici c’est "id"
    if (!famille) return res.status(404).json({ message: 'Famille non trouvé' });
    res.json(famille);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createFamille = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const newFamille = await FamilleService.createFamille(req.body, sequelize);
    res.status(201).json(newFamille);
  } catch (err) {
    console.error('❌ [FamilleController] Erreur création famille:', err);
    res.status(500).json({ message: err.message });
  }
};

const editFamille = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const updated = await FamilleService.editFamille(req.params.id, req.body, sequelize);
    res.json(updated);
  } catch (err) {
    console.error('❌ [FamilleController] Erreur modification famille:', err);
    res.status(500).json({ message: err.message });
  }
};

const deleteFamille = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await FamilleService.deleteFamille(req.params.id, sequelize);
    res.json(result);
  } catch (err) {
    console.error('❌ [FamilleController] Erreur suppression famille:', err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {

  createFamille,
  deleteFamille,
  editFamille,
  getFamille,
  getFamilles,
  getUnites
};
