const devisService = require('../../services/ventes/devis.service');

const getDevis= async (req, res) => {
  try {
    console.log('[DevisController] 🔍 Début getDevis');
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    
    // Extraire les options de pagination et filtres depuis les query params
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'document_id',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || '',
      dateFrom: req.query.dateFrom || '',
      dateTo: req.query.dateTo || ''
    };
    
    console.log('[DevisController] 🔍 Options extraites:', JSON.stringify(options, null, 2));
    console.log('[DevisController] 🔍 Query params:', JSON.stringify(req.query, null, 2));
    
    const result = await devisService.getDevis(options, sequelize);
    
    console.log('[DevisController] ✅ Résultat du service:', JSON.stringify({
      dataLength: result.data?.length || 0,
      total: result.pagination?.total || 0,
      page: result.pagination?.page || 0,
      totalPages: result.pagination?.totalPages || 0
    }, null, 2));
    
    // Log pour vérifier que la pagination est appliquée
    console.log(`[DevisController] 📊 Page: ${options.page}, PageSize: ${options.pageSize}, Résultats: ${result.data?.length || 0}, Total: ${result.pagination?.total || 0}`);
    
    const response = {
      success: true,
      data: result.data || [],
      pagination: result.pagination || {}
    };
    
    console.log('[DevisController] ✅ Envoi réponse:', JSON.stringify({
      success: response.success,
      dataLength: response.data.length,
      total: response.pagination.total,
      totalPages: response.pagination.totalPages
    }, null, 2));
    
    res.json(response);
  } catch (err) {
    console.error('❌ [DevisController] Erreur récupération devis:', err);
    console.error('❌ [DevisController] Stack:', err.stack);
    console.error('❌ [DevisController] Message:', err.message);
    res.status(500).json({ 
      success: false,
      message: err.message || 'Erreur lors de la récupération des devis',
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

const getCommande= async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    
    // Extraire les options de pagination et filtres depuis les query params
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'date',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || ''
    };
    
    const result = await devisService.getCommandes(options, sequelize);
    res.json({
      success: true,
      data: result.data || [],
      pagination: result.pagination || {}
    });
  } catch (err) {
    console.error('❌ [DevisController] Erreur récupération commandes:', err);
    res.status(500).json({ 
      success: false,
      message: err.message 
    });
  }
};

const getDevi = async (req, res) => {
  try {
    console.log('[getDevi Controller] Récupération devis ID:', req.params.id);
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    
    const devis = await devisService.getDevi(req.params.id, sequelize);
    if (!devis) {
      console.warn('[getDevi Controller] ⚠️ Devis non trouvé pour ID:', req.params.id);
      return res.status(404).json({ message: 'devis non trouvé' });
    }
    
    console.log('[getDevi Controller] ✅ Devis trouvé, envoi réponse');
    res.json(devis);
  } catch (err) {
    console.error('❌ [getDevi Controller] Erreur:', err);
    console.error('❌ [getDevi Controller] Stack:', err.stack);
    res.status(500).json({ message: err.message || 'Erreur lors de la récupération du devis' });
  }
};

const createDevis = async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const newDevis = await devisService.createDevis(req.body, sequelize);
    res.status(201).json(newDevis);
  } catch (err) {
    console.error('❌ [DevisController] Erreur création devis:', err);
    res.status(500).json({ 
      success: false,
      message: err.message 
    });
  }
};

const createCommande = async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const newCommande = await devisService.createCommande(req.body, sequelize);
    res.status(201).json(newCommande);
  } catch (err) {
    console.error('❌ [DevisController] Erreur création commande:', err);
    res.status(500).json({ 
      success: false,
      message: err.message 
    });
  }
};

const saveDetail = async (req, res) => {
  try {
    console.log('[saveDetail Controller] Début traitement');
    console.log('[saveDetail Controller] Body reçu:', JSON.stringify(req.body, null, 2));
    
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    
    const data = req.body; // Peut être { lignes: [...] } ou tableau ou objet
    
    // Si c'est un objet avec une propriété 'lignes', le traiter directement
    if (data && data.lignes && Array.isArray(data.lignes)) {
      console.log('[saveDetail Controller] Format détecté: { lignes: [...] }');
      await devisService.saveDetail(data, sequelize);
      res.status(200).json({ message: 'Toutes les lignes ont été enregistrées avec succès', status: 'success' });
      return;
    }
    
    // Si c'est un tableau, traiter chaque élément
    if (Array.isArray(data)) {
      console.log('[saveDetail Controller] Format détecté: tableau');
      const results = [];
      for (const detail of data) {
        await devisService.saveDetail({ lignes: [detail] }, sequelize);
        results.push({ status: 'success' });
      }
      res.status(200).json(results);
      return;
    }
    
    // Si c'est un objet simple, l'envelopper dans { lignes: [...] }
    if (data && typeof data === 'object') {
      console.log('[saveDetail Controller] Format détecté: objet simple, enveloppement dans { lignes: [...] }');
      await devisService.saveDetail({ lignes: [data] }, sequelize);
      res.status(200).json({ message: 'Ligne enregistrée avec succès', status: 'success' });
      return;
    }
    
    res.status(400).json({ message: 'Format de données invalide' });
  } catch (err) {
    console.error('[saveDetail Controller] ❌ Erreur:', err);
    console.error('[saveDetail Controller] ❌ Stack:', err.stack);
    res.status(500).json({ message: err.message });
  }
};


const saveInfo = async (req, res) => {
  try {
    console.log('je suis dans le controller');
    
    const data = req.body; // objet ou tableau

    if (Array.isArray(data)) {
      for (const detail of data) {
        await devisService.saveInfo(detail);
      }
    } else {
      await devisService.saveInfo(data);
    }

    res.status(200).json({ status: 'success' });

  } catch (err) {
    console.error('Erreur saveInfo :', err);
    res.status(500).json({ message: err.message });
  }
};



const editDevis = async (req, res) => {
  try {
    const updated = await devisService.editDevis(req.params.id, req.body); // ✅ nom corrigé
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateDevis = async (req, res) => {
  try {
    const updated = await devisService.updateDevis(req.params.id, req.body);
    console.log(updated);
    
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteDevis = async (req, res) => {
  try {
    const { ids } = req.body; // Reçoit un tableau d'IDs
    const result = await devisService.deleteDevis(ids);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteLignesParIds = async (req, res) => {
  try {
    const { ids } = req.body; // Reçoit un tableau d'IDs
    const result = await devisService.deleteDetailsAndQuillByIds(ids);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDevisNonTransferes = async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const devis = await devisService.getDevisNonTransferes(sequelize);
    res.json({
      success: true,
      data: devis
    });
  } catch (err) {
    console.error('❌ [DevisController] Erreur récupération devis non transférés:', err);
    res.status(500).json({ 
      success: false,
      message: err.message 
    });
  }
};

const getNextCommandeNumero = async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await devisService.getNextCommandeNumero(sequelize);
    
    // Vérifier que result n'est pas null
    if (!result || !result.numero) {
      throw new Error('Impossible de récupérer le numéro de commande');
    }
    
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('❌ [DevisController] Erreur récupération numéro commande:', err);
    res.status(500).json({ 
      success: false,
      message: err.message || 'Erreur lors de la récupération du numéro de commande'
    });
  }
};

const getNextDevisNumero = async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    
    console.log('[getNextDevisNumero] Début de la récupération du numéro de devis');
    
    const result = await devisService.getNextDevisNumero(sequelize);
    
    console.log('[getNextDevisNumero] Résultat du service:', result);
    
    // Vérifier que result n'est pas null
    if (!result || !result.numero) {
      console.error('[getNextDevisNumero] ❌ Résultat invalide:', result);
      throw new Error('Impossible de récupérer le numéro de devis. Le compteur "DV" n\'existe peut-être pas dans la table compteur.');
    }
    
    console.log('[getNextDevisNumero] ✅ Numéro récupéré avec succès:', result.numero);
    
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('❌ [DevisController] Erreur récupération numéro devis:', err);
    console.error('❌ [DevisController] Stack:', err.stack);
    
    // Message d'erreur plus détaillé
    let errorMessage = err.message || 'Erreur lors de la récupération du numéro de devis';
    
    if (errorMessage.includes('Compteur non trouvé')) {
      errorMessage = 'Le compteur avec le code "DV" n\'existe pas dans la table compteur. Veuillez créer ce compteur dans la base de données.';
    }
    
    res.status(500).json({ 
      success: false,
      message: errorMessage
    });
  }
};

const transfererDevisVersCommande = async (req, res) => {
  try {
    const databaseSwitchService = require('../../services/database-switch.service');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    
    const { devisId } = req.body;
    
    if (!devisId) {
      return res.status(400).json({
        success: false,
        message: 'ID du devis requis'
      });
    }
    
    console.log('[transfererDevisVersCommande] Transfert du devis ID:', devisId);
    
    const result = await devisService.transfererDevisVersCommande(devisId, sequelize);
    
    console.log('[transfererDevisVersCommande] ✅ Transfert réussi:', result);
    
    res.json({
      success: true,
      data: result,
      message: `Devis transféré en commande ${result.numero} avec succès`
    });
  } catch (err) {
    console.error('❌ [DevisController] Erreur transfert devis vers commande:', err);
    console.error('❌ [DevisController] Stack:', err.stack);
    
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors du transfert du devis vers commande'
    });
  }
};

module.exports = {
  getDevis,
  getCommande,
  getDevi,
  createDevis,
  createCommande,
  saveDetail,
  saveInfo,
  deleteDevis,
  deleteLignesParIds,
  editDevis,
  updateDevis,
  getDevisNonTransferes,
  getNextCommandeNumero,
  getNextDevisNumero,
  transfererDevisVersCommande
};
