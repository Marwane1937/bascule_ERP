const bordereauRemiseService = require('../../services/finance/bordereau-remise.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getBordereaux = async (req, res) => {
  try {
    console.log('[getBordereaux Controller] 📥 Requête reçue:', {
      url: req.url,
      query: req.query,
      method: req.method
    });
    
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    // Extraire les paramètres de pagination depuis la requête
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || parseInt(req.query.length) || 25;
    const orderBy = req.query.orderBy || req.query.orderColumn || 'date';
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
    
    console.log('[getBordereaux Controller] 📋 Options de pagination:', options);

    const result = await bordereauRemiseService.getBordereaux(options, sequelize);
    
    // Log pour déboguer
    console.log('[getBordereaux Controller] ✅ Résultat:', {
      dataLength: result?.data?.length || 0,
      total: result?.pagination?.total || 0,
      page: result?.pagination?.page || 1,
      totalPages: result?.pagination?.totalPages || 0
    });
    
    res.json(result);
  } catch (err) {
    console.error('[getBordereaux] Erreur:', err);
    
    // Message d'erreur plus clair pour l'utilisateur
    let errorMessage = err.message || 'Erreur inconnue lors du chargement des bordereaux';
    
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

const getBordereauById = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }
    const result = await bordereauRemiseService.getBordereauById(id);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Bordereau non trouvé' });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[getBordereauById] Erreur:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la récupération du bordereau' });
  }
};

const addBordereau = async (req, res) => {
  try {
    console.log('[addBordereau Controller] 📥 Requête reçue:', req.body);
    const { numero, date, compte_cible, type, etat } = req.body;
    
    // Validation
    if (!date) {
      return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
    }

    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const bordereauData = { numero, date, compte_cible, type, etat };
    const result = await bordereauRemiseService.addBordereau(bordereauData, sequelize);
    console.log('[addBordereau Controller] ✅ Bordereau créé:', result);
    res.status(201).json({ success: true, data: result, message: 'Bordereau créé avec succès', numero: result.numero });
  } catch (err) {
    console.error('[addBordereau Controller] ❌ Erreur:', err);
    console.error('[addBordereau Controller] ❌ Stack:', err.stack);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la création du bordereau' });
  }
};

const updateBordereau = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    const { numero, date, compte_cible, type, etat } = req.body;
    
    // Validation
    if (!numero || !date) {
      return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
    }

    const bordereauData = { numero, date, compte_cible, type, etat };
    const result = await bordereauRemiseService.updateBordereau(id, bordereauData);
    res.json({ success: true, data: result, message: 'Bordereau modifié avec succès' });
  } catch (err) {
    console.error('[updateBordereau] Erreur:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la modification du bordereau' });
  }
};

const deleteBordereau = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    await bordereauRemiseService.deleteBordereau(id);
    res.json({ success: true, message: 'Bordereau supprimé avec succès' });
  } catch (err) {
    console.error('[deleteBordereau] Erreur:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la suppression du bordereau' });
  }
};

const getEtats = async (req, res) => {
  try {
    const result = await bordereauRemiseService.getEtats();
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[getEtats] Erreur:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la récupération des états' });
  }
};

const getTypes = async (req, res) => {
  try {
    const result = await bordereauRemiseService.getTypes();
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[getTypes] Erreur:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la récupération des types' });
  }
};

const getNextBordereauNumero = async (req, res) => {
  try {
    console.log('[getNextBordereauNumero Controller] 📥 Requête reçue');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await bordereauRemiseService.getNextBordereauNumero(sequelize);
    console.log('[getNextBordereauNumero Controller] ✅ Numéro généré:', result);
    res.json(result);
  } catch (err) {
    console.error('[getNextBordereauNumero Controller] ❌ Erreur:', err);
    console.error('[getNextBordereauNumero Controller] ❌ Stack:', err.stack);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la génération du numéro de bordereau' });
  }
};

const getChequesForBordereau = async (req, res) => {
  try {
    console.log('[getChequesForBordereau Controller] 📥 Requête reçue');
    const bordereau_id = req.query.bordereau_id ? parseInt(req.query.bordereau_id) : null;
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await bordereauRemiseService.getChequesForBordereau(bordereau_id, sequelize);
    console.log(`[getChequesForBordereau Controller] ✅ ${result?.length || 0} chèques retournés`);
    res.json({ success: true, data: result || [] });
  } catch (err) {
    console.error('[getChequesForBordereau Controller] ❌ Erreur:', err);
    console.error('[getChequesForBordereau Controller] ❌ Stack:', err.stack);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la récupération des chèques', data: [] });
  }
};

const saveChequesBordereau = async (req, res) => {
  try {
    const bordereau_id = parseInt(req.params.bordereau_id);
    const { cheques } = req.body;
    
    if (!bordereau_id) {
      return res.status(400).json({ success: false, message: 'bordereau_id est requis' });
    }
    
    if (!cheques || !Array.isArray(cheques)) {
      return res.status(400).json({ success: false, message: 'cheques doit être un tableau' });
    }
    
    const result = await bordereauRemiseService.saveChequesBordereau(bordereau_id, cheques);
    res.json({ success: true, data: result, message: 'Chèques enregistrés avec succès' });
  } catch (err) {
    console.error('[saveChequesBordereau] Erreur:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de l\'enregistrement des chèques' });
  }
};

const getChequesByBordereau = async (req, res) => {
  try {
    const bordereau_id = parseInt(req.params.bordereau_id);
    if (!bordereau_id) {
      return res.status(400).json({ success: false, message: 'bordereau_id est requis' });
    }
    const result = await bordereauRemiseService.getChequesByBordereau(bordereau_id);
    res.json({ success: true, data: result || [] });
  } catch (err) {
    console.error('[getChequesByBordereau] Erreur:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la récupération des chèques' });
  }
};

module.exports = {
  getBordereaux,
  getBordereauById,
  getNextBordereauNumero,
  addBordereau,
  updateBordereau,
  deleteBordereau,
  getEtats,
  getTypes,
  getChequesForBordereau,
  saveChequesBordereau,
  getChequesByBordereau
};

