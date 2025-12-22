const livraisonService = require('../../services/ventes/livraison.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getLivraisons = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'numero',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || ''
    };
    const result = await livraisonService.getLivraisons(options, sequelize);
    res.json({
      success: true,
      data: result.data || [],
      pagination: result.pagination || {}
    });
  } catch (err) {
    console.error('[getLivraisons] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const getCommandesNonLivrees = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const commandes = await livraisonService.getCommandesNonLivrees(sequelize);

    // S'assurer que commandes est un tableau
    const commandesArray = Array.isArray(commandes) ? commandes : [];

    res.json({
      success: true,
      data: commandesArray
    });
  } catch (err) {
    console.error('[getCommandesNonLivrees] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération des commandes non livrées'
    });
  }
};

const getLivraison = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const id = parseInt(req.params.id, 10);

    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de livraison invalide'
      });
    }

    console.log(`[getLivraison] Récupération de la livraison avec id=${id}`);
    const livraison = await livraisonService.getLivraison(id, sequelize);

    if (!livraison) {
      console.log(`[getLivraison] Livraison non trouvée pour id=${id}`);
      return res.status(404).json({
        success: false,
        message: 'Livraison non trouvée'
      });
    }

    console.log(`[getLivraison] Livraison trouvée:`, {
      id: livraison.id || livraison.document_id,
      numero: livraison.numero,
      detailsCount: Array.isArray(livraison.details) ? livraison.details.length : 0
    });

    res.json({
      success: true,
      data: livraison
    });
  } catch (err) {
    console.error('[getLivraison] Erreur:', err);
    console.error('[getLivraison] Stack:', err.stack);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération de la livraison'
    });
  }
};

const getNextLivraisonNumero = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const numero = await livraisonService.getNextLivraisonNumero(sequelize);
    res.json({
      success: true,
      data: numero
    });
  } catch (err) {
    console.error('[getNextLivraisonNumero] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const createLivraison = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const newLivraison = await livraisonService.createLivraison(req.body, sequelize);
    res.status(201).json(newLivraison);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Récupérer les données de la livraison pour la popup
const getLivraisonDataForTransfer = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { stockId } = req.params;

    if (!stockId) {
      return res.status(400).json({ message: 'stockId est requis' });
    }

    const result = await livraisonService.getLivraisonDataForTransfer(stockId, sequelize);
    res.json(result);
  } catch (err) {
    console.error('[getLivraisonDataForTransfer] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

const transfererLivraisonVersFacturation = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { stockId, factureDate, partId } = req.body;

    if (!stockId) {
      return res.status(400).json({ message: 'stockId est requis' });
    }

    if (!factureDate) {
      return res.status(400).json({ message: 'factureDate est requis' });
    }

    if (!partId) {
      return res.status(400).json({ message: 'partId est requis' });
    }

    const result = await livraisonService.transfererLivraisonVersFacturation(stockId, factureDate, partId, sequelize);
    res.json(result);
  } catch (err) {
    console.error('[transfererLivraisonVersFacturation] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

const transfererCommandeVersFacturation = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { commandeId, factureDate, partId } = req.body;

    if (!commandeId) {
      return res.status(400).json({ message: 'commandeId est requis' });
    }

    if (!factureDate) {
      return res.status(400).json({ message: 'factureDate est requis' });
    }

    if (!partId) {
      return res.status(400).json({ message: 'partId est requis' });
    }

    const result = await livraisonService.transfererCommandeVersFacturation(commandeId, factureDate, partId, sequelize);
    res.json(result);
  } catch (err) {
    console.error('[transfererCommandeVersFacturation] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

const transfererCommandeVersLivraison = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { commandeId } = req.body;
    if (!commandeId) {
      return res.status(400).json({ message: 'ID de commande requis' });
    }

    const result = await livraisonService.transfererCommandeVersLivraison(commandeId, sequelize);

    res.status(201).json({
      success: true,
      stockId: result.stockId,
      numero: result.numero,
      message: 'Livraison créée avec succès'
    });
  } catch (err) {
    console.error('[transfererCommandeVersLivraison Controller] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const updateLivraison = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const updatedLivraison = await livraisonService.updateLivraison(req.params.id, req.body, sequelize);
    res.json(updatedLivraison);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const saveDetail = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { lignes } = req.body;

    console.log('[saveDetail Controller] Données reçues:', JSON.stringify(lignes, null, 2));

    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ message: 'Tableau de lignes requis' });
    }

    // Log chaque ligne pour déboguer
    lignes.forEach((ligne, index) => {
      console.log(`[saveDetail Controller] Ligne ${index + 1}:`, {
        id: ligne.id,
        update_mode: ligne.update_mode,
        remise: ligne.remise,
        remise_montant: ligne.remise_montant,
        remiseType: typeof ligne.remise,
        remiseMontantType: typeof ligne.remise_montant
      });
    });

    const results = await livraisonService.saveDetail({ lignes }, sequelize);

    console.log('[saveDetail Controller] Résultats:', JSON.stringify(results, null, 2));

    res.json({
      message: `${results.filter(r => r?.success).length} ligne(s) traitées avec succès`,
      results
    });
  } catch (err) {
    console.error('Erreur dans saveDetail:', err);
    console.error('Stack:', err.stack);
    res.status(500).json({ message: err.message || 'Erreur interne' });
  }
};

const saveInfo = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    await livraisonService.saveInfo(req.body, sequelize);
    res.json({ message: 'Informations sauvegardées avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteLivraison = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'IDs invalides' });
    }
    await livraisonService.deleteLivraison(ids, sequelize);
    res.json({ message: 'Livraison(s) supprimée(s) avec succès' });
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
    await livraisonService.deleteLignesParIds(ligneIds, sequelize);
    res.json({ message: 'Lignes supprimées avec succès' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getLivraisons,
  getCommandesNonLivrees,
  getLivraison,
  getNextLivraisonNumero,
  getLivraisonDataForTransfer,
  createLivraison,
  transfererCommandeVersLivraison,
  transfererLivraisonVersFacturation,
  transfererCommandeVersFacturation,
  updateLivraison,
  saveDetail,
  saveInfo,
  deleteLivraison,
  deleteLignesParIds
};

