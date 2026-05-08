const achatReportingService = require('../../services/achats/achat-reporting.service');
const databaseSwitchService = require('../../services/database-switch.service');

const withOptions = (req, defaults = {}) => ({
  page: parseInt(req.query.page) || 1,
  pageSize: parseInt(req.query.pageSize) || 25,
  orderBy: req.query.orderBy || defaults.orderBy,
  orderDirection: req.query.orderDirection || defaults.orderDirection || 'DESC',
  search: req.query.search || '',
  dateFrom: req.query.dateFrom || null,
  dateTo: req.query.dateTo || null
});

const getFacturesFournisseur = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await achatReportingService.getFacturesFournisseur(withOptions(req, { orderBy: 'facture_dat' }), sequelize);
    res.json(result);
  } catch (err) {
    console.error('[AchatReporting.getFacturesFournisseur] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getAchatsFournisseurs = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await achatReportingService.getAchatsFournisseurs(withOptions(req, { orderBy: 'total_ttc' }), sequelize);
    res.json(result);
  } catch (err) {
    console.error('[AchatReporting.getAchatsFournisseurs] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getAchatsArticles = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await achatReportingService.getAchatsArticles(withOptions(req, { orderBy: 'total_ttc' }), sequelize);
    res.json(result);
  } catch (err) {
    console.error('[AchatReporting.getAchatsArticles] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getFournisseurSuggestions = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await achatReportingService.getFournisseurSuggestions({
      search: req.query.search || '',
      limit: parseInt(req.query.limit) || 20
    }, sequelize);
    res.json(result);
  } catch (err) {
    console.error('[AchatReporting.getFournisseurSuggestions] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getArticleSuggestions = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await achatReportingService.getArticleSuggestions({
      search: req.query.search || '',
      limit: parseInt(req.query.limit) || 20
    }, sequelize);
    res.json(result);
  } catch (err) {
    console.error('[AchatReporting.getArticleSuggestions] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getFacturesFournisseur,
  getAchatsFournisseurs,
  getAchatsArticles,
  getFournisseurSuggestions,
  getArticleSuggestions
};
