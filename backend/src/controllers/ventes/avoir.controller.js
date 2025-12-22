const avoirService = require('../../services/ventes/avoir.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getAvoirs = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'facture_num',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || ''
    };
    const result = await avoirService.getAvoirs(options, sequelize);
    res.json({
      success: true,
      data: result.data || [],
      pagination: result.pagination || {}
    });
  } catch (err) {
    console.error('[getAvoirs] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const getAvoir = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const avoir = await avoirService.getAvoir(req.params.id, sequelize);
    if (!avoir) return res.status(404).json({ message: 'Avoir non trouvé' });
    res.json(avoir);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getNextAvoirNumero = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const numero = await avoirService.getNextAvoirNumero(sequelize);
    res.json(numero);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createAvoirFinancier = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const newAvoir = await avoirService.createAvoirFinancier(req.body, sequelize);
    res.status(201).json(newAvoir);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createAvoirMarchandise = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const newAvoir = await avoirService.createAvoirMarchandise(req.body, sequelize);
    res.status(201).json(newAvoir);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateAvoir = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const updatedAvoir = await avoirService.updateAvoir(req.params.id, req.body, sequelize);
    res.json(updatedAvoir);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteAvoir = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'IDs invalides' });
    }
    await avoirService.deleteAvoir(ids, sequelize);
    res.json({ message: 'Avoir(s) supprimé(s) avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getAvoirs,
  getAvoir,
  getNextAvoirNumero,
  createAvoirFinancier,
  createAvoirMarchandise,
  updateAvoir,
  deleteAvoir
};



