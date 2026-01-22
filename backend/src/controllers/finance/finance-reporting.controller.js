const financeReportingService = require('../../services/finance/finance-reporting.service');
const databaseSwitchService = require('../../services/database-switch.service');

/**
 * Récupérer les comptes clients
 */
const getCompteClient = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.pageSize) || 25,
      orderBy: req.query.orderBy || 'client_nom',
      orderDirection: req.query.orderDirection || 'ASC',
      search: req.query.search || ''
    };

    const result = await financeReportingService.getCompteClient(options, sequelize);
    res.json(result);
  } catch (err) {
    console.error('[getCompteClient] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Récupérer la balance client
 */
const getBalanceClient = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.pageSize) || 25,
      orderBy: req.query.orderBy || 'date',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || '',
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null
    };

    const result = await financeReportingService.getBalanceClient(options, sequelize);
    res.json(result);
  } catch (err) {
    console.error('[getBalanceClient] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Récupérer les soldes clients
 */
const getSoldeClient = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.pageSize) || 25,
      orderBy: req.query.orderBy || 'solde',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || ''
    };

    const result = await financeReportingService.getSoldeClient(options, sequelize);
    res.json(result);
  } catch (err) {
    console.error('[getSoldeClient] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Récupérer la vue globale
 */
const getVueGlobale = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null
    };

    const result = await financeReportingService.getVueGlobale(options, sequelize);
    res.json(result);
  } catch (err) {
    console.error('[getVueGlobale] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getCompteClient,
  getBalanceClient,
  getSoldeClient,
  getVueGlobale
};








