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
    if (!facture) return res.status(404).json({ message: 'Facture fournisseur non trouvée' });
    res.json(facture);
  } catch (err) {
    res.status(500).json({ message: err.message });
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

module.exports = {
  getFacturesFournisseur,
  getFactureFournisseur,
  getCommandesNonFacturees,
  createFactureFournisseurFromCommande,
  deleteFactureFournisseur
};













