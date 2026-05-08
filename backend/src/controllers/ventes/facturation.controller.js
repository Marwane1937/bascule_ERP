const facturationService = require('../../services/ventes/facturation.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getFactures = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    // Extraire les paramètres de pagination depuis la requête
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || parseInt(req.query.length) || 25;
    const orderBy = req.query.orderBy || req.query.orderColumn || 'facture_dat';
    const orderDirection = req.query.orderDirection || req.query.orderDir || 'DESC';
    const search = req.query.search || req.query.searchValue || '';

    // Options de pagination
    const options = {
      page: page,
      pageSize: pageSize,
      orderBy: orderBy,
      orderDirection: orderDirection,
      search: search
    };

    console.log('[getFactures Controller] 🔍 Options:', JSON.stringify(options, null, 2));
    const result = await facturationService.getFactures(options, sequelize);
    console.log('[getFactures Controller] 📊 Résultat du service:', JSON.stringify(result, null, 2));
    console.log('[getFactures Controller] 📊 Nombre de factures:', result?.data?.length || 0);
    console.log('[getFactures Controller] ✅ Envoi de la réponse au client');
    res.json({
      success: true,
      data: result.data || [],
      pagination: result.pagination || {}
    });
  } catch (err) {
    console.error('[getFactures] Erreur:', err);

    // Message d'erreur plus clair pour l'utilisateur
    let errorMessage = err.message || 'Erreur inconnue lors du chargement des factures';

    // Si l'erreur mentionne la vue, donner un message plus explicite
    if (errorMessage.includes('v_facture') || errorMessage.includes('Invalid object name')) {
      errorMessage = 'La vue v_facture n\'existe pas dans la base de données. Veuillez contacter l\'administrateur pour créer cette vue.';
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      data: [],
      pagination: {
        page: parseInt(req.query.page) || 1,
        pageSize: parseInt(req.query.pageSize) || 25,
        total: 0,
        totalPages: 0
      }
    });
  }
};

const getFacture = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const facture = await facturationService.getFacture(req.params.id, sequelize);
    if (!facture) return res.status(404).json({ message: 'Facture non trouvée' });
    res.json(facture);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getFactureParcours = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const factureId = parseInt(req.params.id, 10);

    if (!Number.isInteger(factureId) || factureId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'facture_id invalide'
      });
    }

    const parcours = await facturationService.getFactureParcours(factureId, sequelize);
    res.json({
      success: true,
      data: parcours
    });
  } catch (err) {
    console.error('[getFactureParcours Controller] Erreur:', err);
    if (err?.message && err.message.toLowerCase().includes('non trouv')) {
      return res.status(404).json({
        success: false,
        message: err.message
      });
    }
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération du parcours de facture'
    });
  }
};

const getFactureLivraisonDetails = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const factureId = parseInt(req.params.id, 10);

    if (!Number.isInteger(factureId) || factureId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'facture_id invalide'
      });
    }

    const details = await facturationService.getFactureLivraisonDetails(factureId, sequelize);
    res.json({
      success: true,
      data: details
    });
  } catch (err) {
    console.error('[getFactureLivraisonDetails Controller] Erreur:', err);
    if (err?.message && err.message.toLowerCase().includes('non trouv')) {
      return res.status(404).json({
        success: false,
        message: err.message
      });
    }
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération du détail des bons de livraison'
    });
  }
};

const getFacturationReport = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const factureId = req.query.factureId || req.params.factureId || null;

    const options = {};
    if (factureId) {
      options.factureId = parseInt(factureId, 10);
    }

    console.log('[getFacturationReport Controller] 🔍 Options:', options);
    const report = await facturationService.getFacturationReport(options, sequelize);
    console.log('[getFacturationReport Controller] 📊 Nombre de lignes:', report?.length || 0);

    res.json({
      success: true,
      data: report,
      count: Array.isArray(report) ? report.length : 0
    });
  } catch (err) {
    console.error('[getFacturationReport Controller] ❌ Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération du rapport de facturation',
      data: [],
      count: 0
    });
  }
};

const getFactureMontant = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const factureId = req.params.id;
    if (!factureId) {
      return res.status(400).json({ message: 'facture_id est requis' });
    }

    const montant = await facturationService.getFactureMontant(factureId, sequelize);
    res.json(montant);
  } catch (err) {
    console.error('[getFactureMontant Controller] ❌ Erreur:', err);
    res.status(500).json({
      message: err.message || 'Erreur lors de la récupération des montants de la facture',
      total_ht: 0,
      total_tva: 0
    });
  }
};

module.exports = {
  getFactures,
  getFacture,
  getFactureParcours,
  getFactureLivraisonDetails,
  getFacturationReport,
  getFactureMontant
};
