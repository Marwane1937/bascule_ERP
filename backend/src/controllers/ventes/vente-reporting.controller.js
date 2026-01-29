const venteReportingService = require('../../services/ventes/vente-reporting.service');
const databaseSwitchService = require('../../services/database-switch.service');

/**
 * Récupérer le grand livre
 */
const getGrandLivre = async (req, res) => {
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

    const result = await venteReportingService.getGrandLivre(options, sequelize);
    res.json(result);
  } catch (err) {
    console.error('[getGrandLivre] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Récupérer les factures par client
 */
const getFacturesByClient = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.pageSize) || 25,
      orderBy: req.query.orderBy || 'facture_dat',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || '',
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null
    };

    const result = await venteReportingService.getFacturesByClient(options, sequelize);
    res.json(result);
  } catch (err) {
    console.error('[getFacturesByClient] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Récupérer le chiffre d'affaires par article
 */
const getChiffreAffairesArticles = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.pageSize) || 25,
      orderBy: req.query.orderBy || 'chiffre_affaires',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || '',
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null
    };

    const result = await venteReportingService.getChiffreAffairesArticles(options, sequelize);
    res.json(result);
  } catch (err) {
    console.error('[getChiffreAffairesArticles] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Récupérer le chiffre d'affaires par client
 */
const getChiffreAffairesClients = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.pageSize) || 25,
      orderBy: req.query.orderBy || 'chiffre_affaires',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || '',
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null
    };

    const result = await venteReportingService.getChiffreAffairesClients(options, sequelize);
    res.json(result);
  } catch (err) {
    console.error('[getChiffreAffairesClients] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getGrandLivre,
  getFacturesByClient,
  getChiffreAffairesArticles,
  getChiffreAffairesClients
};










