const factureFournisseurService = require('../../services/achats/facture-fournisseur.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getFacturesFournisseur = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || parseInt(req.query.length) || 25;
    const orderBy = req.query.orderBy || req.query.orderColumn || 'facture_dat';
    const orderDirection = req.query.orderDirection || req.query.orderDir || 'DESC';
    const search = req.query.search || req.query.searchValue || '';

    const options = {
      page: page,
      pageSize: pageSize,
      orderBy: orderBy,
      orderDirection: orderDirection,
      search: search
    };

    console.log('[getFacturesFournisseur Controller] 🔍 Options:', JSON.stringify(options, null, 2));
    const result = await factureFournisseurService.getFacturesFournisseur(options, sequelize);
    
    res.json({
      success: true,
      data: result.data || [],
      pagination: result.pagination || {}
    });
  } catch (err) {
    console.error('[getFacturesFournisseur Controller] ❌ Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors du chargement des factures fournisseur',
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

const getFactureFournisseur = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const facture = await factureFournisseurService.getFactureFournisseur(req.params.id, sequelize);
    if (!facture) {
      return res.status(404).json({ success: false, message: 'Facture fournisseur non trouvee' });
    }
    res.json({ success: true, data: facture });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

const getCommandesNonFacturees = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const commandes = await factureFournisseurService.getCommandesNonFacturees(sequelize);
    
    res.json({
      success: true,
      data: commandes,
      count: commandes.length
    });
  } catch (err) {
    console.error('[getCommandesNonFacturees Controller] ❌ Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération des commandes non facturées',
      data: [],
      count: 0
    });
  }
};

const createFactureFournisseurFromCommande = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { commandeId } = req.body;
    
    if (!commandeId) {
      return res.status(400).json({ 
        success: false, 
        message: 'commandeId est requis' 
      });
    }

    const result = await factureFournisseurService.createFactureFournisseurFromCommande(commandeId, sequelize);
    
    res.status(201).json({
      success: true,
      message: 'Facture fournisseur créée avec succès',
      data: result
    });
  } catch (err) {
    console.error('[createFactureFournisseurFromCommande Controller] ❌ Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la création de la facture fournisseur'
    });
  }
};

const deleteFactureFournisseur = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'id est requis' 
      });
    }

    await factureFournisseurService.deleteFactureFournisseur(id, sequelize);
    
    res.json({
      success: true,
      message: 'Facture fournisseur supprimée avec succès'
    });
  } catch (err) {
    console.error('[deleteFactureFournisseur Controller] ❌ Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la suppression de la facture fournisseur'
    });
  }
};

const createFactureFournisseurFromScan = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const scanData = req.body || {};

    const result = await factureFournisseurService.createFactureFournisseurFromScan(scanData, sequelize);

    res.status(201).json({
      success: true,
      message: 'Facture fournisseur enregistree avec succes',
      data: result
    });
  } catch (err) {
    console.error('[createFactureFournisseurFromScan Controller] Erreur:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || "Erreur lors de l'enregistrement de la facture fournisseur"
    });
  }
};

const createFactureFournisseurManual = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await factureFournisseurService.createFactureFournisseurManual(req.body || {}, sequelize);

    res.status(201).json({
      success: true,
      message: 'Facture fournisseur creee avec succes',
      data: result
    });
  } catch (err) {
    console.error('[createFactureFournisseurManual Controller] Erreur:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Erreur lors de la creation de la facture fournisseur'
    });
  }
};

const updateFactureFournisseur = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const id = parseInt(req.params.id, 10);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de facture invalide'
      });
    }

    const updatedFacture = await factureFournisseurService.updateFactureFournisseur(id, req.body, sequelize);

    res.json({
      success: true,
      data: updatedFacture,
      message: 'Facture fournisseur mise a jour avec succes'
    });
  } catch (err) {
    console.error('[updateFactureFournisseur Controller] Erreur:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Erreur lors de la mise a jour de la facture fournisseur'
    });
  }
};

const saveDetail = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { lignes } = req.body;

    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tableau de lignes requis'
      });
    }

    const results = await factureFournisseurService.saveDetail({ lignes }, sequelize);

    res.json({
      success: true,
      message: `${results.filter((line) => line?.success).length} ligne(s) traitee(s) avec succes`,
      results
    });
  } catch (err) {
    console.error('[saveDetail FactureFournisseur Controller] Erreur:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Erreur lors de la sauvegarde des lignes'
    });
  }
};

const deleteLignesParIds = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'IDs de lignes invalides'
      });
    }

    await factureFournisseurService.deleteLignesParIds(ids, sequelize);

    res.json({
      success: true,
      message: 'Lignes supprimees avec succes'
    });
  } catch (err) {
    console.error('[deleteLignesParIds FactureFournisseur Controller] Erreur:', err);
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Erreur lors de la suppression des lignes'
    });
  }
};

const analyzeFactureFournisseurScan = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'Aucune image scannee recue.'
      });
    }

    const result = await factureFournisseurService.analyzeFactureFournisseurScan({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype
    });

    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('[analyzeFactureFournisseurScan Controller] Erreur:', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || "Erreur lors de l'analyse du scan fournisseur"
    });
  }
};

module.exports = {
  getFacturesFournisseur,
  getFactureFournisseur,
  getCommandesNonFacturees,
  createFactureFournisseurFromCommande,
  createFactureFournisseurFromScan,
  createFactureFournisseurManual,
  updateFactureFournisseur,
  saveDetail,
  deleteLignesParIds,
  deleteFactureFournisseur,
  analyzeFactureFournisseurScan
};





















