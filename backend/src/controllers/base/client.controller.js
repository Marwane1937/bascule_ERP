const clientService = require('../../services/base/client.service');
const listesService = require('../../services/listes.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getClients = async (req, res) => {
  try {
    console.log('[getClients Controller] 📥 Requête reçue pour récupérer les clients');
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const clients = await clientService.getClients(sequelize);
    console.log(`[getClients Controller] ✅ ${clients?.length || 0} clients récupérés`);
    res.json({
      success: true,
      data: clients || []
    });
  } catch (err) {
    console.error('[getClients Controller] ❌ Erreur récupération clients:', err);
    console.error('[getClients Controller] ❌ Stack:', err.stack);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération des clients',
      data: []
    });
  }
};

const getFournisseurs = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const clients = await clientService.getFournisseurs(sequelize);
    res.json({
      success: true,
      data: clients
    });
  } catch (err) {
    console.error('❌ [ClientController] Erreur récupération fournisseurs:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const getContacts = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const clients = await clientService.getContacts(sequelize);
    res.json({
      success: true,
      data: clients
    });
  } catch (err) {
    console.error('❌ [ClientController] Erreur récupération contacts:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const getVilles = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const clients = await clientService.getVilles(sequelize);
    res.json({
      success: true,
      data: clients
    });
  } catch (err) {
    console.error('❌ [ClientController] Erreur récupération villes:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const getIdentifiants = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const clients = await clientService.getIdentifiants(sequelize);
    res.json({
      success: true,
      data: clients
    });
  } catch (err) {
    console.error('❌ [ClientController] Erreur récupération identifiants:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const getListesByGroupId = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { group_id } = req.params;
    const listes = await listesService.getListesByGroupId(group_id, sequelize);
    res.json({
      success: true,
      data: listes
    });
  } catch (err) {
    console.error('❌ [ClientController] Erreur récupération listes:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const getClient = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const client = await clientService.getClient(req.params.id, sequelize); // ✅ ici c’est "id"
    if (!client) return res.status(404).json({ message: 'Client non trouvé' });
    res.json(client);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getClientDetails = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    console.log('[getClientDetails Controller] 📥 Requête reçue pour part_id:', req.params.id);
    const details = await clientService.getClientDetails(req.params.id, sequelize);
    if (!details) {
      console.log('[getClientDetails Controller] ⚠️ Détails non trouvés pour part_id:', req.params.id);
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    console.log('[getClientDetails Controller] ✅ Détails retournés:', {
      adressesCount: details.adresses?.length || 0,
      identifiantsCount: details.identifiants?.length || 0,
      contactsCount: details.contacts?.length || 0
    });
    res.json(details);
  } catch (err) {
    console.error('[getClientDetails Controller] ❌ Erreur:', err);
    console.error('[getClientDetails Controller] ❌ Stack:', err.stack);
    res.status(500).json({
      message: err.message || 'Erreur lors de la récupération des détails du client',
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

const createClient = async (req, res) => {
  try {
    const newClient = await clientService.createClient(req.body); // ✅ nom corrigé
    res.status(201).json(newClient);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createClientDetails = async (req, res) => {
  const part_id = parseInt(req.params.id); // id du client
  const details = req.body;

  try {
    const result = await clientService.createClientDetails(part_id, details);
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

const deleteClientDetails = async (req, res) => {
  const part_id = parseInt(req.params.id);
  const details = req.body;

  try {
    const result = await clientService.deleteClientDetails(part_id, details);
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

const updateClientDetails = async (req, res) => {
  const part_id = parseInt(req.params.id);
  const details = req.body;

  try {
    const result = await clientService.updateClientDetails(part_id, details);
    res.status(200).json(result);
  } catch (err) {
    console.error('Erreur updateClientDetails:', err);
    res.status(500).json({ message: err.message });
  }
};


const editClient = async (req, res) => {
  try {
    const updated = await clientService.editClient(req.params.id, req.body); // ✅ nom corrigé
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteClient = async (req, res) => {
  try {
    const result = await clientService.deleteClient(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getClients,
  getFournisseurs,
  getContacts,
  getClient,
  createClient,
  createClientDetails,
  deleteClientDetails,
  updateClientDetails,
  editClient,
  deleteClient,
  getClientDetails,
  getVilles,
  getIdentifiants,
  getListesByGroupId
};
