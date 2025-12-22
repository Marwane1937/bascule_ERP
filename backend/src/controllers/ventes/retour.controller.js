const retourService = require('../../services/ventes/retour.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getRetours = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'numero',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || ''
    };
    const result = await retourService.getRetours(options, sequelize);
    res.json({
      success: true,
      data: result.data || [],
      pagination: result.pagination || {}
    });
  } catch (err) {
    console.error('[getRetours] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const getRetour = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const retour = await retourService.getRetour(req.params.id, sequelize);
    if (!retour) return res.status(404).json({ message: 'Retour non trouvé' });
    res.json(retour);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getNextRetourNumero = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const numero = await retourService.getNextRetourNumero(sequelize);
    res.json(numero);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createRetour = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const newRetour = await retourService.createRetour(req.body, sequelize);
    res.status(201).json(newRetour);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateRetour = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const updatedRetour = await retourService.updateRetour(req.params.id, req.body, sequelize);
    res.json(updatedRetour);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const saveDetail = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { lignes } = req.body;

    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ message: 'Tableau de lignes requis' });
    }

    const results = await retourService.saveDetail({ lignes }, sequelize);

    res.json({
      message: `${results.filter(r => r?.success).length} ligne(s) traitées avec succès`,
      results
    });
  } catch (err) {
    console.error('Erreur dans saveDetail:', err);
    res.status(500).json({ message: err.message || 'Erreur interne' });
  }
};

const saveInfo = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    await retourService.saveInfo(req.body, sequelize);
    res.json({ message: 'Informations sauvegardées avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteRetour = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'IDs invalides' });
    }
    await retourService.deleteRetour(ids, sequelize);
    res.json({ message: 'Retour(s) supprimé(s) avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteLignesParIds = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { ligneIds } = req.body;
    if (!ligneIds || !Array.isArray(ligneIds) || ligneIds.length === 0) {
      return res.status(400).json({ message: 'IDs de lignes invalides' });
    }
    await retourService.deleteLignesParIds(ligneIds, sequelize);
    res.json({ message: 'Lignes supprimées avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getRetours,
  getRetour,
  getNextRetourNumero,
  createRetour,
  updateRetour,
  saveDetail,
  saveInfo,
  deleteRetour,
  deleteLignesParIds
};



