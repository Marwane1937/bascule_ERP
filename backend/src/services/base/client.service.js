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

// Obtenir les clients avec pagination (pour l'interface Clients)
const getClientsPaged = async (options = {}, sequelizeConnection = null) => {
  const connection = sequelizeConnection || getConnection();
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const pageSizeRaw = parseInt(options.pageSize, 10) || 25;
  const pageSize = Math.min(Math.max(pageSizeRaw, 1), 200);
  const search = typeof options.search === 'string' ? options.search.trim() : '';

  const orderByMap = {
    part_id: 'p.part_id',
    code: 'p.code',
    nom: 'p.nom'
  };
  const orderBy = orderByMap[(options.orderBy || '').toString()] || orderByMap.nom;
  const orderDirection = (options.orderDirection || 'ASC').toString().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const offset = (page - 1) * pageSize;

  const whereSearch = search
    ? `AND (
        p.nom LIKE '%' + :search + '%'
        OR p.code LIKE '%' + :search + '%'
        OR CAST(p.part_id AS NVARCHAR(50)) LIKE '%' + :search + '%'
      )`
    : '';

  const totalResult = await connection.query(
    `SELECT COUNT(1) AS total
     FROM partenaire p
     WHERE p.type = 1
     ${whereSearch}`,
    {
      replacements: { search },
      type: connection.QueryTypes.SELECT
    }
  );

  const total = parseInt(totalResult?.[0]?.total, 10) || 0;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  const data = await connection.query(
    `SELECT p.part_id, p.code, p.nom
     FROM partenaire p
     WHERE p.type = 1
     ${whereSearch}
     ORDER BY ${orderBy} ${orderDirection}
     OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
    {
      replacements: { search, offset, pageSize },
      type: connection.QueryTypes.SELECT
    }
  );

  return {
    data: data || [],
    pagination: {
      total,
      page,
      pageSize,
      totalPages
    }
  };
};

// Obtenir les fournisseurs avec pagination (pour l'interface Fournisseurs)
const getFournisseursPaged = async (options = {}, sequelizeConnection = null) => {
  const connection = sequelizeConnection || getConnection();
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const pageSizeRaw = parseInt(options.pageSize, 10) || 25;
  const pageSize = Math.min(Math.max(pageSizeRaw, 1), 200);
  const search = typeof options.search === 'string' ? options.search.trim() : '';

  const orderByMap = {
    part_id: 'p.part_id',
    code: 'p.code',
    nom: 'p.nom'
  };
  const orderBy = orderByMap[(options.orderBy || '').toString()] || orderByMap.nom;
  const orderDirection = (options.orderDirection || 'ASC').toString().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const offset = (page - 1) * pageSize;

  const whereSearch = search
    ? `AND (
        p.nom LIKE '%' + :search + '%'
        OR p.code LIKE '%' + :search + '%'
        OR CAST(p.part_id AS NVARCHAR(50)) LIKE '%' + :search + '%'
      )`
    : '';

  const totalResult = await connection.query(
    `SELECT COUNT(1) AS total
     FROM partenaire p
     WHERE p.type = 2
     ${whereSearch}`,
    {
      replacements: { search },
      type: connection.QueryTypes.SELECT
    }
  );

  const total = parseInt(totalResult?.[0]?.total, 10) || 0;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  const data = await connection.query(
    `SELECT p.part_id, p.code, p.nom
     FROM partenaire p
     WHERE p.type = 2
     ${whereSearch}
     ORDER BY ${orderBy} ${orderDirection}
     OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
    {
      replacements: { search, offset, pageSize },
      type: connection.QueryTypes.SELECT
    }
  );

  return {
    data: data || [],
    pagination: {
      total,
      page,
      pageSize,
      totalPages
    }
  };
};

// Obtenir tous les clients
const getFournisseurs = async (sequelizeConnection = null) => {
  return await clientModel.getAllFournisseurs(sequelizeConnection);
};

// Obtenir tous les clients
const getContacts = async (sequelizeConnection = null) => {
  return await clientModel.getAllContacts(sequelizeConnection);
};

// Récupérer les contacts paginés
const getContactsPaged = async (options = {}, sequelizeConnection = null) => {
  return await clientModel.getContactsPaged(options, sequelizeConnection);
};

// Obtenir un contact par ID
const getContact = async (contact_id, sequelizeConnection = null) => {
  const contact = await clientModel.getContactById(contact_id, sequelizeConnection);
  if (!contact) {
    throw new Error('contact non trouvé');
  }
  return contact;
};

// Créer un nouveau contact
const createContact = async (contactData, sequelizeConnection = null) => {
  const contact_id = await clientModel.addContactCommercial(contactData, sequelizeConnection);
  return { id: contact_id, ...contactData };
};

// Modifier un contact existant
const editContact = async (contact_id, contactData, sequelizeConnection = null) => {
  const contact = await clientModel.getContactById(contact_id, sequelizeConnection);
  if (!contact) {
    throw new Error('contact à modifier non trouvé');
  }
  return await clientModel.updateContactCommercial(contact_id, contactData, sequelizeConnection);
};

// Archiver un contact
const archiveContact = async (contact_id, sequelizeConnection = null) => {
  const contact = await clientModel.getContactById(contact_id, sequelizeConnection);
  if (!contact) {
    throw new Error('contact non trouvé');
  }
  await clientModel.archiveContactCommercial(contact_id, sequelizeConnection);
  return { message: 'contact archivé avec succès' };
};

// Supprimer un contact existant
const deleteContact = async (contact_id, sequelizeConnection = null) => {
  const contact = await clientModel.getContactById(contact_id, sequelizeConnection);
  if (!contact) {
    throw new Error('contact non trouvé');
  }
  await clientModel.deleteContactCommercial(contact_id, sequelizeConnection);
  return { message: 'contact supprimé avec succès' };
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
const createClient = async (clientData, sequelizeConnection = null) => {
  const id = await clientModel.addClient(clientData, sequelizeConnection);
  return { id, ...clientData };
};

const createFournisseur = async (fournisseurData, sequelizeConnection = null) => {
  const id = await clientModel.addFournisseur(fournisseurData, sequelizeConnection);
  return { id, ...fournisseurData };
};

const createClientDetails = async (part_id, { adresses = [], identifiants = [], contacts = [] }, sequelizeConnection = null) => {
  // Insert adresses s'il y en a
  for (const adresse of adresses) {
    if (adresse.nom || adresse.adresse) {
      await clientModel.addAdresse({ part_id, ...adresse }, sequelizeConnection);
    }
  }


  // Insert identifiants s'il y en a
  for (const identifiant of identifiants) {
    if (identifiant.identifiant_type && identifiant.identifiant) {
      await clientModel.addIdentifiant({ part_id, ...identifiant }, sequelizeConnection);
    }
  }

  // Insert contacts s'il y en a
  for (const contact of contacts) {
    if (contact.ligne && contact.company_contact) {
      await clientModel.addContact({ part_id, ...contact }, sequelizeConnection);
    }
  }

  return { message: 'Détails client insérés avec succès' };
};

const deleteClientDetails = async (part_id, { adresses = [], identifiants = [], contacts = [] }, sequelizeConnection = null) => {
  const adresseIds = adresses.map(a => a.id).filter(Boolean);

  // partenaire_identifiant: pas de colonne id, on supprime par clés
  const identifiantsToDelete = (identifiants || [])
    .filter(i => i && i.identifiant_type != null && i.identifiant != null)
    .map(i => ({ identifiant_type: i.identifiant_type, identifiant: i.identifiant }));

  // partenaire_representant: suppression par ligne (id = ligne côté frontend)
  const contactLignes = (contacts || [])
    .map(c => c?.ligne ?? c?.id)
    .filter(Boolean);

  await Promise.all([
    clientModel.deleteAdresses(adresseIds, sequelizeConnection),
    clientModel.deleteIdentifiants(part_id, identifiantsToDelete, sequelizeConnection),
    clientModel.deleteContacts(part_id, contactLignes, sequelizeConnection),
  ]);

  return { message: 'Suppression multiple effectuée.' };
};

const updateClientDetails = async (part_id, { adresses = [], identifiants = [], contacts = [] }, sequelizeConnection = null) => {
  // Update adresses
  for (const adresse of adresses) {
    if (adresse.id) {
      await clientModel.updateAdresse(adresse, sequelizeConnection);
    }
  }

  // Update identifiants
  for (const identifiant of identifiants) {
    if (identifiant && identifiant.identifiant_type && identifiant.identifiant) {
      await clientModel.updateIdentifiant(part_id, identifiant, sequelizeConnection);
    }
  }

  // Update contacts
  for (const contact of contacts) {
    if (contact && contact.ligne && contact.company_contact) {
      await clientModel.updateContact({ part_id, ...contact }, sequelizeConnection);
    }
  }

  return { message: 'Détails client mis à jour avec succès' };
};


// Modifier un client existant
const editClient = async (id, clientData, sequelizeConnection = null) => {
  const client = await clientModel.getClientById(id, sequelizeConnection);
  if (!client) {
    throw new Error('Client à modifier non trouvé');
  }
  return await clientModel.updateClient(id, clientData, sequelizeConnection);
};

const deleteClient = async (id, sequelizeConnection = null) => {
  const client = await clientModel.getClientById(id, sequelizeConnection);
  if (!client) {
    throw new Error('Client non trouvé');
  }
  await clientModel.deleteClient(id, sequelizeConnection);
  return { message: 'Client supprimé avec succès' };
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
  getIdentifiants
};
