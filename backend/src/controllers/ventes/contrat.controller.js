const contratService = require('../../services/ventes/contrat.service');

/**
 * Récupérer tous les contrats
 */
const getContrats = async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'date',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || '',
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null
    };
    
    const result = await contratService.getContrats(options, sequelize);
    
    res.json({
      success: true,
      data: result.data || [],
      pagination: result.pagination || {}
    });
  } catch (err) {
    console.error('[ContratController] Erreur récupération contrats:', err);
    res.status(500).json({ 
      success: false,
      message: err.message || 'Erreur lors de la récupération des contrats',
      data: [],
      pagination: {
        total: 0,
        page: parseInt(req.query.page) || 1,
        pageSize: parseInt(req.query.pageSize) || 25,
        totalPages: 0
      }
    });
  }
};

/**
 * Récupérer un contrat par ID
 */
const getContrat = async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    
    const contrat = await contratService.getContratById(req.params.id, sequelize);
    if (!contrat) {
      return res.status(404).json({ message: 'Contrat non trouvé' });
    }
    
    res.json(contrat);
  } catch (err) {
    console.error('[ContratController] Erreur:', err);
    res.status(500).json({ message: err.message || 'Erreur lors de la récupération du contrat' });
  }
};

/**
 * Créer un nouveau contrat
 */
const createContrat = async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    
    const newContrat = await contratService.createContrat(req.body, sequelize);
    res.status(201).json({
      success: true,
      data: newContrat,
      message: 'Contrat créé avec succès'
    });
  } catch (err) {
    console.error('[ContratController] Erreur création contrat:', err);
    res.status(500).json({ 
      success: false,
      message: err.message || 'Erreur lors de la création du contrat'
    });
  }
};

/**
 * Mettre à jour un contrat
 */
const updateContrat = async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    
    const updated = await contratService.updateContrat(req.params.id, req.body, sequelize);
    res.json({
      success: true,
      data: updated,
      message: 'Contrat modifié avec succès'
    });
  } catch (err) {
    console.error('[ContratController] Erreur modification contrat:', err);
    res.status(500).json({ 
      success: false,
      message: err.message || 'Erreur lors de la modification du contrat'
    });
  }
};

/**
 * Supprimer un contrat
 */
const deleteContrat = async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    
    const result = await contratService.deleteContrat(req.params.id, sequelize);
    res.json({
      success: true,
      message: result.message || 'Contrat supprimé avec succès'
    });
  } catch (err) {
    console.error('[ContratController] Erreur suppression contrat:', err);
    res.status(500).json({ 
      success: false,
      message: err.message || 'Erreur lors de la suppression du contrat'
    });
  }
};

/**
 * Récupérer les conditions de paiement
 */
const getConditionsPaiement = async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    
    const conditions = await contratService.getConditionsPaiement(sequelize);
    res.json({
      success: true,
      data: conditions
    });
  } catch (err) {
    console.error('[ContratController] Erreur récupération conditions:', err);
    res.status(500).json({ 
      success: false,
      message: err.message || 'Erreur lors de la récupération des conditions de paiement'
    });
  }
};

/**
 * Transférer un contrat vers facturation
 */
const transfererContratVersFacturation = async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { factureDate, partId } = req.body;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: 'ID du contrat est requis' });
    }

    if (!factureDate) {
      return res.status(400).json({ message: 'factureDate est requis' });
    }

    if (!partId) {
      return res.status(400).json({ message: 'partId est requis' });
    }

    const result = await contratService.transfererContratVersFacturation(id, factureDate, partId, sequelize);
    res.json(result);
  } catch (err) {
    console.error('[ContratController] Erreur transfert vers facturation:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Sauvegarder les lignes de détails
 */
const saveDetail = async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { lignes } = req.body;

    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ message: 'Tableau de lignes requis' });
    }

    const results = await contratService.saveDetail({ lignes }, sequelize);

    res.json({
      message: `${results.filter(r => r?.success).length} ligne(s) traitées avec succès`,
      results
    });
  } catch (err) {
    console.error('[ContratController] Erreur saveDetail:', err);
    res.status(500).json({ message: err.message || 'Erreur interne' });
  }
};

/**
 * Supprimer des lignes de détails
 */
const deleteLignes = async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { ligneIds } = req.body;

    if (!Array.isArray(ligneIds) || ligneIds.length === 0) {
      return res.status(400).json({ message: 'IDs de lignes requis' });
    }

    await contratService.deleteLignes(ligneIds, sequelize);
    res.json({ message: 'Lignes supprimées avec succès' });
  } catch (err) {
    console.error('[ContratController] Erreur deleteLignes:', err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getContrats,
  getContrat,
  createContrat,
  updateContrat,
  deleteContrat,
  getConditionsPaiement,
  transfererContratVersFacturation,
  saveDetail,
  deleteLignes
};

