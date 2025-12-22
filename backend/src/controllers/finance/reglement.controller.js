const reglementService = require('../../services/finance/reglement.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getReglements = async (req, res) => {
  try {
    console.log('[getReglements Controller] 📥 Requête reçue:', {
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
    
    console.log('[getReglements Controller] 📋 Options de pagination:', options);

    const result = await reglementService.getReglements(options, sequelize);
    
    // Log pour déboguer
    console.log('[getReglements Controller] ✅ Résultat:', {
      dataLength: result?.data?.length || 0,
      total: result?.pagination?.total || 0,
      page: result?.pagination?.page || 1,
      totalPages: result?.pagination?.totalPages || 0
    });
    
    res.json(result);
  } catch (err) {
    console.error('[getReglements] Erreur:', err);
    
    // Message d'erreur plus clair pour l'utilisateur
    let errorMessage = err.message || 'Erreur inconnue lors du chargement des règlements';
    
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

const getReglementById = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }
    const result = await reglementService.getReglementById(id);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Règlement non trouvé' });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[getReglementById] Erreur:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la récupération du règlement' });
  }
};

const addReglement = async (req, res) => {
  try {
    console.log('[addReglement Controller] 📥 Requête reçue:', req.body);
    const { numero, date, part_id, mode, reference, montant } = req.body;
    
    // Validation (numero peut être vide, il sera généré automatiquement avec le compteur REG)
    if (!date || !part_id || !mode || !montant) {
      return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
    }

    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await reglementService.addReglement({ numero, date, part_id, mode, reference, montant }, sequelize);
    console.log('[addReglement Controller] ✅ Règlement créé:', result);
    res.status(201).json({ success: true, data: result, message: 'Règlement créé avec succès', numero: result.numero });
  } catch (err) {
    console.error('[addReglement Controller] ❌ Erreur:', err);
    console.error('[addReglement Controller] ❌ Stack:', err.stack);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la création du règlement' });
  }
};

const updateReglement = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    const { numero, date, part_id, mode, reference, montant } = req.body;
    
    // Validation
    if (!numero || !date || !part_id || !mode || !montant) {
      return res.status(400).json({ success: false, message: 'Champs obligatoires manquants' });
    }

    const result = await reglementService.updateReglement(id, { numero, date, part_id, mode, reference, montant });
    res.json({ success: true, data: result, message: 'Règlement modifié avec succès' });
  } catch (err) {
    console.error('[updateReglement] Erreur:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la modification du règlement' });
  }
};

const deleteReglement = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    await reglementService.deleteReglement(id);
    res.json({ success: true, message: 'Règlement supprimé avec succès' });
  } catch (err) {
    console.error('[deleteReglement] Erreur:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la suppression du règlement' });
  }
};

const getModeReglements = async (req, res) => {
  try {
    const result = await reglementService.getModeReglements();
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[getModeReglements] Erreur:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la récupération des modes de règlement' });
  }
};

const getNextReglementNumero = async (req, res) => {
  try {
    console.log('[getNextReglementNumero Controller] 📥 Requête reçue');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await reglementService.getNextReglementNumero(sequelize);
    console.log('[getNextReglementNumero Controller] ✅ Numéro généré:', result);
    res.json(result);
  } catch (err) {
    console.error('[getNextReglementNumero Controller] ❌ Erreur:', err);
    console.error('[getNextReglementNumero Controller] ❌ Stack:', err.stack);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la génération du numéro de règlement' });
  }
};

const getFacturesForLettrage = async (req, res) => {
  try {
    console.log('[getFacturesForLettrage Controller] 📥 Requête reçue pour part_id:', req.params.part_id);
    const part_id = parseInt(req.params.part_id);
    if (!part_id) {
      return res.status(400).json({ success: false, message: 'part_id est requis' });
    }
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await reglementService.getFacturesForLettrage(part_id, sequelize);
    console.log(`[getFacturesForLettrage Controller] ✅ ${result?.length || 0} factures retournées`);
    res.json({ success: true, data: result || [] });
  } catch (err) {
    console.error('[getFacturesForLettrage Controller] ❌ Erreur:', err);
    console.error('[getFacturesForLettrage Controller] ❌ Stack:', err.stack);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la récupération des factures', data: [] });
  }
};

const saveLettrageFactures = async (req, res) => {
  try {
    const regle_id = parseInt(req.params.regle_id);
    const { lettrages } = req.body;
    
    if (!regle_id) {
      return res.status(400).json({ success: false, message: 'regle_id est requis' });
    }
    
    if (!lettrages || !Array.isArray(lettrages)) {
      return res.status(400).json({ success: false, message: 'lettrages doit être un tableau' });
    }
    
    const result = await reglementService.saveLettrageFactures(regle_id, lettrages);
    res.json({ success: true, data: result, message: 'Lettrage enregistré avec succès' });
  } catch (err) {
    console.error('[saveLettrageFactures] Erreur:', err);
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de l\'enregistrement du lettrage' });
  }
};

module.exports = {
  getReglements,
  getReglementById,
  getNextReglementNumero,
  addReglement,
  updateReglement,
  deleteReglement,
  getModeReglements,
  getFacturesForLettrage,
  saveLettrageFactures
};

