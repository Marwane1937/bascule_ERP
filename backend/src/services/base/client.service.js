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

const getContactsAutocomplete = async (sequelizeConnection = null) => {
  return await clientModel.getContactsAutocomplete(sequelizeConnection);
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
  const uniqueness = await checkCommercialUniqueness(contactData, sequelizeConnection);
  if (uniqueness.codeExists || uniqueness.nomExists) {
    const duplicateError = new Error('Code ou nom commercial existe deja');
    duplicateError.status = 409;
    duplicateError.details = uniqueness;
    throw duplicateError;
  }

  const contact_id = await clientModel.addContactCommercial(contactData, sequelizeConnection);
  return { id: contact_id, ...contactData };
};

// Modifier un contact existant
const editContact = async (contact_id, contactData, sequelizeConnection = null) => {
  const contact = await clientModel.getContactById(contact_id, sequelizeConnection);
  if (!contact) {
    throw new Error('contact à modifier non trouvé');
  }

  const uniqueness = await checkCommercialUniqueness({ ...contactData, excludeId: contact_id }, sequelizeConnection);
  if (uniqueness.codeExists || uniqueness.nomExists) {
    const duplicateError = new Error('Code ou nom commercial existe deja');
    duplicateError.status = 409;
    duplicateError.details = uniqueness;
    throw duplicateError;
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

const checkClientUniqueness = async ({ code, nom, excludeId = null }, sequelizeConnection = null) => {
  return await clientModel.checkClientUniqueness({ code, nom, excludeId }, sequelizeConnection);
};

const checkFournisseurUniqueness = async ({ code, nom, excludeId = null }, sequelizeConnection = null) => {
  return await clientModel.checkFournisseurUniqueness({ code, nom, excludeId }, sequelizeConnection);
};

const checkCommercialUniqueness = async ({ code, nom, excludeId = null }, sequelizeConnection = null) => {
  return await clientModel.checkCommercialUniqueness({ code, nom, excludeId }, sequelizeConnection);
};
// Créer un nouveau client
const createClient = async (clientData, sequelizeConnection = null) => {
  const uniqueness = await checkClientUniqueness(clientData, sequelizeConnection);
  if (uniqueness.codeExists || uniqueness.nomExists) {
    const duplicateError = new Error('Code ou nom client existe deja');
    duplicateError.status = 409;
    duplicateError.details = uniqueness;
    throw duplicateError;
  }

  const id = await clientModel.addClient(clientData, sequelizeConnection);
  return { id, ...clientData };
};

const createFournisseur = async (fournisseurData, sequelizeConnection = null) => {
  const uniqueness = await checkFournisseurUniqueness(fournisseurData, sequelizeConnection);
  if (uniqueness.codeExists || uniqueness.nomExists) {
    const duplicateError = new Error('Code ou nom fournisseur existe deja');
    duplicateError.status = 409;
    duplicateError.details = uniqueness;
    throw duplicateError;
  }

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


const buildClientRecommendations = (stats = {}) => {
  const recommendations = [];
  const debitTotal = Number(stats?.situation?.debit_total || 0);
  const creditTotal = Number(stats?.situation?.credit_total || 0);
  const solde = Number(stats?.situation?.solde || 0);
  const mouvementsCount = Number(stats?.situation?.mouvements_count || 0);
  const monthlyActivity = Array.isArray(stats?.charts?.monthly_activity) ? stats.charts.monthly_activity : [];
  const latestMonth = monthlyActivity.length > 0 ? monthlyActivity[monthlyActivity.length - 1] : null;
  const previousMonth = monthlyActivity.length > 1 ? monthlyActivity[monthlyActivity.length - 2] : null;

  if (solde > 0) {
    recommendations.push({
      tone: 'warning',
      title: 'Relancer encaissement',
      message: `Le client conserve un solde ouvert de ${solde.toFixed(2)} dh. Planifiez une relance ou un echeancier.`
    });
  }

  if (debitTotal > 0 && creditTotal >= debitTotal) {
    recommendations.push({
      tone: 'positive',
      title: 'Compte a jour',
      message: 'Les credits couvrent le debit cumule. Ce client reste sain sur le plan de l encaissement.'
    });
  }

  if (mouvementsCount === 0) {
    recommendations.push({
      tone: 'info',
      title: 'Aucune activite',
      message: 'Aucun mouvement comptable recent n est remonte pour ce client. Verifiez si la relation commerciale doit etre relancee.'
    });
  }

  if (latestMonth && previousMonth && Number(latestMonth.debit_total || 0) < Number(previousMonth.debit_total || 0) * 0.7) {
    recommendations.push({
      tone: 'alert',
      title: 'Activite en retrait',
      message: 'Le debit du dernier mois baisse sensiblement. Controlez les livraisons, la concurrence et les relances commerciales.'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      tone: 'positive',
      title: 'Situation stable',
      message: 'Le compte client est globalement equilibre. Continuez le suivi regulier des echeances et du volume d activite.'
    });
  }

  return recommendations.slice(0, 4);
};

const buildFournisseurRecommendations = (stats = {}) => {
  const recommendations = [];
  const orderedHt = Number(stats?.situation?.ordered_ht || 0);
  const receivedHt = Number(stats?.situation?.received_ht || 0);
  const invoicedHt = Number(stats?.situation?.invoiced_ht || 0);
  const openOrdersCount = Number(stats?.situation?.open_orders_count || 0);
  const receptionRate = Number(stats?.situation?.reception_rate || 0);
  const monthlyActivity = Array.isArray(stats?.charts?.monthly_activity) ? stats.charts.monthly_activity : [];
  const latestMonth = monthlyActivity.length > 0 ? monthlyActivity[monthlyActivity.length - 1] : null;

  if (openOrdersCount > 0 && receptionRate < 80) {
    recommendations.push({
      tone: 'warning',
      title: 'Suivre les livraisons',
      message: `${openOrdersCount} commande(s) restent ouvertes avec un taux de reception de ${receptionRate.toFixed(1)}%. Relancez le fournisseur sur les delais.`
    });
  }

  if (orderedHt > 0 && invoicedHt < orderedHt * 0.5) {
    recommendations.push({
      tone: 'info',
      title: 'Facturation a verifier',
      message: 'Le volume facture reste faible face aux commandes. Verifiez les factures fournisseur en attente ou les receptions non regularisees.'
    });
  }

  if (orderedHt > 0 && receivedHt > orderedHt * 1.1) {
    recommendations.push({
      tone: 'alert',
      title: 'Reception atypique',
      message: 'Le montant receptionne depasse sensiblement le volume commande. Controlez les prix, quantites ou receptions hors commande.'
    });
  }

  if (!latestMonth || Number(latestMonth.ordered_ht || 0) <= 0) {
    recommendations.push({
      tone: 'warning',
      title: 'Activite fournisseur faible',
      message: 'Aucune commande recente detectee. Confirmez si ce fournisseur doit rester actif dans le panel d achat.'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      tone: 'positive',
      title: 'Relation fournisseur stable',
      message: 'Les commandes, receptions et factures restent coherentes. Gardez le suivi des delais et de la qualite de service.'
    });
  }

  return recommendations.slice(0, 4);
};

const getClientStatistics = async (part_id, sequelizeConnection = null) => {
  const stats = await clientModel.getClientStatistics(part_id, sequelizeConnection);
  if (!stats) {
    throw new Error('Client non trouve');
  }

  return {
    ...stats,
    recommendations: buildClientRecommendations(stats)
  };
};

const getFournisseurStatistics = async (part_id, sequelizeConnection = null) => {
  const stats = await clientModel.getFournisseurStatistics(part_id, sequelizeConnection);
  if (!stats) {
    throw new Error('Fournisseur non trouve');
  }

  return {
    ...stats,
    recommendations: buildFournisseurRecommendations(stats)
  };
};

module.exports = {
  getClients,
  getClientsPaged,
  getFournisseursPaged,
  getFournisseurs,
  getContacts,
  getContactsAutocomplete,
  getContactsPaged,
  getContact,
  createContact,
  editContact,
  archiveContact,
  deleteContact,
  getClient,
  checkClientUniqueness,
  checkFournisseurUniqueness,
  checkCommercialUniqueness,
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
  getClientStatistics,
  getFournisseurStatistics
};




