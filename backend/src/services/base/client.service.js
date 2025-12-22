// services/clientService.js
const clientModel = require('../../models/base/client.model');
const { getConnection } = require('../../config/database');
const databaseSwitchService = require('../database-switch.service');

// Obtenir tous les clients
const getClients = async (sequelizeConnection = null) => {
  try {
    // Utiliser la connexion fournie ou la connexion par défaut
    const connection = sequelizeConnection || getConnection();
    const currentDb = databaseSwitchService.getCurrentDatabase();
    console.log(`🔍 Récupération clients depuis: ${currentDb}`);

    // Exécuter la requête avec la connexion active
    const results = await connection.query(
      'SELECT * FROM partenaire ORDER BY nom ASC',
      { type: connection.QueryTypes.SELECT }
    );

    console.log(`✅ ${results.length} clients récupérés depuis ${currentDb}`);
    return results;
  } catch (error) {
    console.error('❌ Erreur récupération clients:', error);
    throw error;
  }
};

// Obtenir tous les clients
const getFournisseurs = async (sequelizeConnection = null) => {
  return await clientModel.getAllFournisseurs(sequelizeConnection);
};

// Obtenir tous les clients
const getContacts = async (sequelizeConnection = null) => {
  return await clientModel.getAllContacts(sequelizeConnection);
};

// Obtenir tous les villes
const getVilles = async (sequelizeConnection = null) => {
  return await clientModel.getAllVille(sequelizeConnection);
};

// Obtenir tous les villes
const getIdentifiants = async (sequelizeConnection = null) => {
  return await clientModel.getAllIdentifiant(sequelizeConnection);
};

// Obtenir un client par ID
const getClient = async (part_id, sequelizeConnection = null) => {
  const client = await clientModel.getClientById(part_id, sequelizeConnection);
  if (!client) {
    throw new Error('Client non trouvé');
  }
  return client;
};

// pour obtenir le detail du client
const getClientDetails = async (part_id, sequelizeConnection = null) => {
  const details = await clientModel.getClientDetailsById(part_id, sequelizeConnection);
  if (!details) {
    throw new Error('Données client non trouvées');
  }
  return details;
};
// Créer un nouveau client
const createClient = async (clientData) => {
  const id = await clientModel.addClient(clientData);
  return { id, ...clientData };
};

const createClientDetails = async (part_id, { adresses = [], identifiants = [], contacts = [] }) => {
  // Insert adresses s'il y en a
  for (const adresse of adresses) {
    if (adresse.nom || adresse.adresse) {
      await clientModel.addAdresse({ part_id, ...adresse });
    }
  }


  // Insert identifiants s'il y en a
  for (const identifiant of identifiants) {
    if (identifiant.identifiant_type && identifiant.identifiant) {
      await clientModel.addIdentifiant({ part_id, ...identifiant });
    }
  }

  // Insert contacts s'il y en a
  for (const contact of contacts) {
    if (contact.ligne && contact.company_contact) {
      await clientModel.addContact({ part_id, ...contact });
    }
  }

  return { message: 'Détails client insérés avec succès' };
};

const deleteClientDetails = async (part_id, { adresses = [], identifiants = [], contacts = [] }) => {
  const adresseIds = adresses.map(a => a.id).filter(Boolean);
  const identifiantIds = identifiants.map(i => i.id).filter(Boolean);
  const contactIds = contacts.map(c => c.id).filter(Boolean);

  await Promise.all([
    clientModel.deleteAdresses(adresseIds),
    clientModel.deleteIdentifiants(identifiantIds),
    clientModel.deleteContacts(contactIds),
  ]);

  return { message: 'Suppression multiple effectuée.' };
};

const updateClientDetails = async (part_id, { adresses = [], identifiants = [], contacts = [] }) => {
  // Update adresses
  for (const adresse of adresses) {
    if (adresse.id) {
      await clientModel.updateAdresse(adresse);
    }
  }

  // Update identifiants
  for (const identifiant of identifiants) {
    if (identifiant.id) {
      await clientModel.updateIdentifiant(identifiant);
    }
  }

  // Update contacts
  for (const contact of contacts) {
    if (contact.id) {
      await clientModel.updateContact(contact);
    }
  }

  return { message: 'Détails client mis à jour avec succès' };
};


// Modifier un client existant
const editClient = async (id, clientData) => {
  const client = await clientModel.getClientById(id);
  if (!client) {
    throw new Error('Client à modifier non trouvé');
  }
  return await clientModel.updateClient(id, clientData);
};

const deleteClient = async (id) => {
  const client = await clientModel.getClientById(id);
  if (!client) {
    throw new Error('Client non trouvé');
  }
  await clientModel.deleteClient(id);
  return { message: 'Client supprimé avec succès' };
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
  getIdentifiants
};
