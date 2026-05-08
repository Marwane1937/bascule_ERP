const receptionService = require('../../services/achats/reception.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getCommandesNonReceptionnees = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const commandes = await receptionService.getCommandesNonReceptionnees(sequelize);
    res.json({
      success: true,
      data: commandes,
      count: Array.isArray(commandes) ? commandes.length : 0
    });
  } catch (err) {
    console.error('[getCommandesNonReceptionnees] ❌ Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors du chargement des commandes non réceptionnées',
      data: [],
      count: 0
    });
  }
};

const getReceptions = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'date',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || ''
    };
    const result = await receptionService.getReceptions(options, sequelize);
    res.json({
      success: true,
      data: result.data || [],
      pagination: result.pagination || {}
    });
  } catch (err) {
    console.error('[getReceptions] ❌ Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors du chargement des réceptions',
      data: [],
      pagination: { total: 0, page: 1, pageSize: 25, totalPages: 0 }
    });
  }
};

const createReceptionFromCommande = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { commandeId, details } = req.body;

    if (!commandeId) {
      return res.status(400).json({
        success: false,
        message: 'commandeId est requis'
      });
    }

    const result = await receptionService.createReceptionFromCommande(
      commandeId,
      details || null,
      req.user?.id || null,
      sequelize
    );
    res.status(201).json({
      success: true,
      message: 'Réception créée avec succès',
      data: result
    });
  } catch (err) {
    console.error('[createReceptionFromCommande] ❌ Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la création de la réception'
    });
  }
};

const createReceptionFromStockEntree = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { entreeStockId } = req.body;

    if (!entreeStockId) {
      return res.status(400).json({
        success: false,
        message: 'entreeStockId est requis'
      });
    }

    const result = await receptionService.createReceptionFromStockEntree(entreeStockId, sequelize);
    res.status(201).json({
      success: true,
      message: 'Réception créée avec succès depuis entrée de stock',
      data: result
    });
  } catch (err) {
    console.error('[createReceptionFromStockEntree] ❌ Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la création de la réception depuis entrée de stock'
    });
  }
};

const getReceptionById = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const id = parseInt(req.params.id, 10);

    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de réception invalide'
      });
    }

    const reception = await receptionService.getReceptionById(id, sequelize);

    if (!reception) {
      return res.status(404).json({
        success: false,
        message: 'Réception non trouvée'
      });
    }

    res.json({
      success: true,
      data: reception
    });
  } catch (err) {
    console.error('[getReceptionById] ❌ Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération de la réception'
    });
  }
};

const updateReception = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const id = parseInt(req.params.id, 10);

    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de réception invalide'
      });
    }

    const updatedReception = await receptionService.updateReception(id, req.body, sequelize);
    res.json({
      success: true,
      data: updatedReception,
      message: 'Réception mise à jour avec succès'
    });
  } catch (err) {
    console.error('[updateReception] ❌ Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la mise à jour de la réception'
    });
  }
};

const deleteReception = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { id } = req.body;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({
        success: false,
        message: 'ID de réception invalide'
      });
    }

    const result = await receptionService.deleteReception(parseInt(id, 10), sequelize);
    res.json({
      success: true,
      message: result.message || 'Réception supprimée avec succès'
    });
  } catch (err) {
    console.error('[deleteReception] ❌ Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la suppression de la réception'
    });
  }
};

const saveDetail = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { lignes } = req.body;

    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ message: 'Tableau de lignes requis' });
    }

    const results = await receptionService.saveDetail({ lignes, userId: req.user?.id || null }, sequelize);

    res.json({
      message: `${results.filter(r => r?.success).length} ligne(s) traitées avec succès`,
      results
    });
  } catch (err) {
    console.error('[saveDetail Reception] ❌ Erreur:', err);
    res.status(500).json({ message: err.message || 'Erreur interne' });
  }
};

const deleteLignesParIds = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'IDs de lignes invalides' });
    }
    await receptionService.deleteLignesParIds(ids, sequelize);
    res.json({ message: 'Lignes supprimées avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getReceptions,
  getCommandesNonReceptionnees,
  createReceptionFromCommande,
  createReceptionFromStockEntree,
  getReceptionById,
  updateReception,
  deleteReception,
  saveDetail,
  deleteLignesParIds
};
