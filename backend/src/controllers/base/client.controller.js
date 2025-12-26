const clientService = require('../../services/base/client.service');
const listesService = require('../../services/listes.service');
const databaseSwitchService = require('../../services/database-switch.service');
const exonerationService = require('../../services/base/partenaire-exoneration.service');

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

const getClientsPaged = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'nom',
      orderDirection: req.query.orderDirection || 'ASC',
      search: req.query.search || ''
    };

    const result = await clientService.getClientsPaged(options, sequelize);

    res.json({
      success: true,
      data: result.data || [],
      pagination: result.pagination || {}
    });
  } catch (err) {
    console.error('❌ [ClientController] Erreur récupération clients paginés:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération des clients',
      data: [],
      pagination: {
        total: 0,
        page: parseInt(req.query.page, 10) || 1,
        pageSize: parseInt(req.query.pageSize, 10) || 25,
        totalPages: 0
      }
    });
  }
};

const getFournisseursPaged = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'nom',
      orderDirection: req.query.orderDirection || 'ASC',
      search: req.query.search || ''
    };

    const result = await clientService.getFournisseursPaged(options, sequelize);

    res.json({
      success: true,
      data: result.data || [],
      pagination: result.pagination || {}
    });
  } catch (err) {
    console.error('❌ [ClientController] Erreur récupération fournisseurs paginés:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération des fournisseurs',
      data: [],
      pagination: {
        total: 0,
        page: parseInt(req.query.page, 10) || 1,
        pageSize: parseInt(req.query.pageSize, 10) || 25,
        totalPages: 0
      }
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

const getContactsPaged = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'nom',
      orderDirection: req.query.orderDirection || 'ASC',
      search: req.query.search || ''
    };
    const result = await clientService.getContactsPaged(options, sequelize);
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (err) {
    console.error('❌ [ClientController] Erreur récupération contacts paginés:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const getContact = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const contact = await clientService.getContact(req.params.id, sequelize);
    if (!contact) return res.status(404).json({ message: 'Contact non trouvé' });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createContact = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const newContact = await clientService.createContact(req.body, sequelize);
    res.status(201).json(newContact);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const editContact = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const updated = await clientService.editContact(req.params.id, req.body, sequelize);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const archiveContact = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await clientService.archiveContact(req.params.id, sequelize);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteContact = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await clientService.deleteContact(req.params.id, sequelize);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const newClient = await clientService.createClient(req.body, sequelize);
    res.status(201).json(newClient);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createFournisseur = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const newFournisseur = await clientService.createFournisseur(req.body, sequelize);
    res.status(201).json(newFournisseur);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createClientDetails = async (req, res) => {
  const part_id = parseInt(req.params.id); // id du client
  const details = req.body;

  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await clientService.createClientDetails(part_id, details, sequelize);
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

const deleteClientDetails = async (req, res) => {
  // ⚠️ Cette route est montée sur /clients/details/delete (sans :id)
  // => récupérer part_id depuis le body (ou depuis :id si présent)
  const part_id = parseInt(req.params.id || req.body.part_id);
  const details = req.body;

  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    if (!part_id || Number.isNaN(part_id)) {
      return res.status(400).json({ message: 'part_id requis pour la suppression des détails client' });
    }
    const result = await clientService.deleteClientDetails(part_id, details, sequelize);
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
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await clientService.updateClientDetails(part_id, details, sequelize);
    res.status(200).json(result);
  } catch (err) {
    console.error('Erreur updateClientDetails:', err);
    res.status(500).json({ message: err.message });
  }
};


const editClient = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const updated = await clientService.editClient(req.params.id, req.body, sequelize);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteClient = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await clientService.deleteClient(req.params.id, sequelize);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getExoneration = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const part_id = parseInt(req.params.id);
    const exoneration = await exonerationService.getExoneration(part_id, sequelize);
    res.json({
      success: true,
      data: exoneration
    });
  } catch (err) {
    console.error('❌ [ClientController] Erreur récupération exonération:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération de l\'exonération'
    });
  }
};

const getAllExonerations = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const part_id = parseInt(req.params.id);
    const exonerations = await exonerationService.getAllExonerations(part_id, sequelize);
    res.json({
      success: true,
      data: exonerations || []
    });
  } catch (err) {
    console.error('❌ [ClientController] Erreur récupération toutes les exonérations:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération des exonérations'
    });
  }
};

const saveOrUpdateExoneration = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const part_id = parseInt(req.params.id);
    const exonerationData = req.body;
    const result = await exonerationService.saveOrUpdateExoneration(part_id, exonerationData, sequelize);
    res.json({
      success: true,
      message: 'Lettre d\'exonération ajoutée avec succès',
      data: result
    });
  } catch (err) {
    console.error('❌ [ClientController] Erreur sauvegarde exonération:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la sauvegarde de l\'exonération'
    });
  }
};

const deleteExoneration = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const part_id = parseInt(req.params.id);
    const result = await exonerationService.deleteExoneration(part_id, sequelize);
    res.json({
      success: true,
      message: result.message
    });
  } catch (err) {
    console.error('❌ [ClientController] Erreur suppression exonération:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la suppression de l\'exonération'
    });
  }
};

module.exports = {
  getClients,
  getClientsPaged,
  getFournisseursPaged,
  getFournisseurs,
  getContacts,
  getContactsPaged,
  getContact,
  createContact,
  editContact,
  archiveContact,
  deleteContact,
  getClient,
  createClient,
  createFournisseur,
  createClientDetails,
  deleteClientDetails,
  updateClientDetails,
  editClient,
  deleteClient,
  getClientDetails,
  getVilles,
  getIdentifiants,
  getListesByGroupId,
  getExoneration,
  getAllExonerations,
  saveOrUpdateExoneration,
  deleteExoneration
};
