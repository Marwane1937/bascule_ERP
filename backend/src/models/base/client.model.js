const sequelize = require('../../config/database');

// Récupérer tous les clients
const getAllClients = async (sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const [results] = await connectionToUse.query('SELECT * FROM partenaire where type = 1');
  return results;
};

// Récupérer tous les fournisseurs
const getAllFournisseurs = async (sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const [results] = await connectionToUse.query('SELECT * FROM partenaire where type = 2');
  return results;
};

// Récupérer tous les clients
const getAllContacts = async (sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const [results] = await connectionToUse.query('SELECT * FROM contact');
  return results;
};

// Récupérer tous les villes
const getAllVille = async (sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const [results] = await connectionToUse.query('SELECT id , nom FROM ville order by nom');
  return results;
};

// Récupérer tous les identifiants
const getAllIdentifiant = async (sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const [results] = await connectionToUse.query('select * from listes where group_id = 1003202 order by id');
  return results;
};

// Récupérer un client par ID
const getClientById = async (id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const results = await connectionToUse.query(
    'SELECT * FROM partenaire WHERE part_id = :id',
    {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT,
    }
  );
  return results[0];
};

// Récupérer l'adresse d'un client par ID
const getClientDetailsById = async (id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  try {
    console.log('[getClientDetailsById] 📥 Récupération des détails pour part_id:', id);

    // Requête pour les identifiants - sans utiliser p.id qui peut ne pas exister
    const getIdentifiantsQuery = async () => {
      try {
        const result = await connectionToUse.query(`
          SELECT 
            p.part_id, 
            p.identifiant_type,
            p.identifiant,
            l.nom AS type
          FROM partenaire_identifiant p 
          LEFT JOIN listes l ON p.identifiant_type = l.id AND l.group_id = 1003202
          WHERE p.part_id = :id
        `, {
          replacements: { id },
          type: sequelize.QueryTypes.SELECT,
        });

        // Ajouter un id généré basé sur l'index pour compatibilité avec le frontend
        return (result || []).map((row, index) => ({
          id: index + 1, // ID temporaire généré
          part_id: row.part_id,
          type: row.type || `Type ${row.identifiant_type}`,
          identifiant: row.identifiant
        }));
      } catch (err) {
        console.error('[getClientDetailsById] ❌ Erreur requête identifiants:', err);
        console.error('[getClientDetailsById] ❌ Détails erreur:', err.sql || err.message);
        // Retourner un tableau vide plutôt que de planter complètement
        return [];
      }
    };

    const [adresses, identifiants, contacts] = await Promise.all([
      connectionToUse.query(`
        SELECT 
          a.id AS id, 
          a.nom, 
          a.part_id, 
          a.adresse, 
          a.postal_code, 
          v.nom AS nom_Ville,
          v.id AS ville_id
        FROM adresse a
        LEFT OUTER JOIN ville v ON a.ville = v.id
        WHERE a.part_id = :id
      `, {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
      }),
      getIdentifiantsQuery(),
      connectionToUse.query(`
        SELECT 
          pr.id AS id, 
          pr.part_id, 
          pr.ligne, 
          c.nom AS commercial, 
          pr.company_contact 
        FROM partenaire_representant pr
        INNER JOIN contact c ON pr.company_contact = c.id
        WHERE pr.part_id = :id
      `, {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT,
      }),
    ]);

    console.log('[getClientDetailsById] ✅ Résultats:', {
      adressesCount: adresses?.length || 0,
      identifiantsCount: identifiants?.length || 0,
      contactsCount: contacts?.length || 0
    });

    return {
      adresses: adresses || [],
      contacts: contacts || [],
      identifiants: identifiants || [],
    };
  } catch (error) {
    console.error('[getClientDetailsById] ❌ Erreur:', error);
    console.error('[getClientDetailsById] ❌ SQL Error:', error.sql || error.message);
    throw error;
  }
};
// Ajouter un client
const addClient = async ({ code, nom }) => {
  const [result] = await sequelize.query(
    `INSERT INTO partenaire (code, nom) 
     OUTPUT INSERTED.part_id 
     VALUES (:code, :nom)`,
    {
      replacements: { code, nom },
      type: sequelize.QueryTypes.INSERT,
    }
  );
  return result.part_id;
};

// Insertion Adresse
const addAdresse = async ({ part_id, adresse, postal_code, ville_id }) => {
  await sequelize.query(
    `INSERT INTO adresse (part_id, adresse, postal_code, ville)
     VALUES (:part_id, :adresse, :postal_code, :ville_id)`,
    {
      replacements: { part_id, adresse, postal_code, ville_id },
      type: sequelize.QueryTypes.INSERT,
    }
  );
};

// Insertion Identifiant
const addIdentifiant = async ({ part_id, identifiant_type, identifiant }) => {
  await sequelize.query(
    `INSERT INTO partenaire_identifiant (part_id, identifiant_type, identifiant)
     VALUES (:part_id, :identifiant_type, :identifiant)`,
    {
      replacements: { part_id, identifiant_type, identifiant },
      type: sequelize.QueryTypes.INSERT,
    }
  );
};

// Insertion Représentant (Contact)
const addContact = async ({ part_id, ligne, company_contact }) => {
  await sequelize.query(
    `INSERT INTO partenaire_representant (part_id, ligne, company_contact)
     VALUES (:part_id, :ligne, :company_contact)`,
    {
      replacements: { part_id, ligne, company_contact },
      type: sequelize.QueryTypes.INSERT,
    }
  );
};

// Suppression multiple d'adresses
const deleteAdresses = async (ids) => {
  if (ids.length === 0) return;
  await sequelize.query(
    `DELETE FROM adresse WHERE id IN (:ids)`,
    {
      replacements: { ids },
      type: sequelize.QueryTypes.DELETE,
    }
  );
};

// Suppression multiple d'identifiants
const deleteIdentifiants = async (ids) => {
  if (ids.length === 0) return;
  await sequelize.query(
    `DELETE FROM partenaire_identifiant WHERE id IN (:ids)`,
    {
      replacements: { ids },
      type: sequelize.QueryTypes.DELETE,
    }
  );
};

// Suppression multiple de contacts
const deleteContacts = async (ids) => {
  if (ids.length === 0) return;
  await sequelize.query(
    `DELETE FROM partenaire_representant where id IN (:ids)`,
    {
      replacements: { ids },
      type: sequelize.QueryTypes.DELETE,
    }
  );
};

// Update Adresse
const updateAdresse = async ({ id, adresse, postal_code, ville_id }) => {
  await sequelize.query(
    `UPDATE adresse
     SET adresse = :adresse,
         postal_code = :postal_code,
         ville = :ville_id
     WHERE id = :id`,
    {
      replacements: { id, adresse, postal_code, ville_id },
      type: sequelize.QueryTypes.UPDATE,
    }
  );
};

// Update Identifiant
const updateIdentifiant = async ({ id, identifiant_type, identifiant }) => {
  await sequelize.query(
    `UPDATE partenaire_identifiant
     SET identifiant_type = :identifiant_type,
         identifiant = :identifiant
     WHERE id = :id`,
    {
      replacements: { id, identifiant_type, identifiant },
      type: sequelize.QueryTypes.UPDATE,
    }
  );
};

// Update Contact
const updateContact = async ({ id, ligne, company_contact }) => {
  await sequelize.query(
    `UPDATE partenaire_representant
     SET ligne = :ligne,
         company_contact = :company_contact
     WHERE id = :id`,
    {
      replacements: { id, ligne, company_contact },
      type: sequelize.QueryTypes.UPDATE,
    }
  );
};

// Modifier un client
const updateClient = async (id, { code, nom }) => {
  await sequelize.query(
    `UPDATE partenaire 
     SET code = :code, nom = :nom 
     WHERE part_id = :id`,
    {
      replacements: { id, code, nom },
      type: sequelize.QueryTypes.UPDATE,
    }
  );
  return { id, code, nom };
};

// Supprimer un client par ID
const deleteClient = async (id) => {
  await sequelize.query(
    'DELETE FROM partenaire WHERE part_id = :id',
    {
      replacements: { id },
      type: sequelize.QueryTypes.DELETE,
    }
  );
};

module.exports = {
  getAllClients,
  getAllFournisseurs,
  getAllContacts,
  getClientById,
  addClient,
  updateClient,
  deleteClient,
  getClientDetailsById,
  getAllVille,
  getAllIdentifiant,
  addAdresse,
  addIdentifiant,
  addContact,
  deleteAdresses,
  deleteIdentifiants,
  deleteContacts,
  updateAdresse,
  updateIdentifiant,
  updateContact
};
