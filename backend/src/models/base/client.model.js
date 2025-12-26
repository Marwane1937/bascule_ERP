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
  // Afficher tous les contacts (pas de filtre sur etat car etat = 0 semble être la valeur par défaut)
  const [results] = await connectionToUse.query('SELECT * FROM contact');
  return results;
};

// Récupérer les contacts paginés
const getContactsPaged = async (options = {}, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const pageSizeRaw = parseInt(options.pageSize, 10) || 25;
  const pageSize = Math.min(Math.max(pageSizeRaw, 1), 200);
  const search = typeof options.search === 'string' ? options.search.trim() : '';

  const orderByMap = {
    id: 'c.id',
    code: 'c.code',
    nom: 'c.nom',
    prenom: 'c.prenom'
  };
  const orderBy = orderByMap[(options.orderBy || '').toString()] || orderByMap.nom;
  const orderDirection = (options.orderDirection || 'ASC').toString().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const offset = (page - 1) * pageSize;

  const whereSearch = search
    ? `AND (
        c.nom LIKE '%' + :search + '%'
        OR c.prenom LIKE '%' + :search + '%'
        OR c.code LIKE '%' + :search + '%'
        OR CAST(c.id AS NVARCHAR(50)) LIKE '%' + :search + '%'
      )`
    : '';

  // Compter le total (afficher tous les contacts, pas de filtre sur etat)
  const totalResult = await connectionToUse.query(
    `SELECT COUNT(1) AS total
     FROM contact c
     ${whereSearch ? 'WHERE ' + whereSearch.replace('AND ', '') : ''}`,
    {
      replacements: { search },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const total = parseInt(totalResult?.[0]?.total, 10) || 0;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  // Récupérer les données (tous les contacts, pas de filtre sur etat)
  const data = await connectionToUse.query(
    `SELECT 
       c.id,
       c.code,
       c.nom,
       c.prenom,
       c.mobile,
       c.phone,
       c.email,
       c.etat
     FROM contact c
     ${whereSearch ? 'WHERE ' + whereSearch.replace('AND ', '') : ''}
     ORDER BY ${orderBy} ${orderDirection}
     OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
    {
      replacements: { search, offset, pageSize },
      type: sequelize.QueryTypes.SELECT
    }
  );

  return { data, pagination: { total, page, pageSize, totalPages } };
};

// Ajouter un contact (commercial)
const addContactCommercial = async ({ code, nom, prenom, mobile, phone, email, etat }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const queryResult = await connectionToUse.query(
    `INSERT INTO contact (code, nom, prenom, mobile, phone, email, etat) 
     OUTPUT INSERTED.id AS id
     VALUES (:code, :nom, :prenom, :mobile, :phone, :email, :etat)`,
    {
      replacements: { 
        code: code || null, 
        nom, 
        prenom: prenom || null, 
        mobile: mobile || null, 
        phone: phone || null, 
        email: email || null, 
        etat: etat || 1 
      },
      type: sequelize.QueryTypes.SELECT,
    }
  );
  const rows = Array.isArray(queryResult) && Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
  const contactId = Array.isArray(rows) ? rows?.[0]?.id : rows?.id;
  return contactId;
};

// Modifier un contact (commercial)
const updateContactCommercial = async (id, { code, nom, prenom, mobile, phone, email, etat }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    `UPDATE contact 
     SET code = :code, nom = :nom, prenom = :prenom, mobile = :mobile, phone = :phone, email = :email, etat = :etat
     WHERE id = :id`,
    {
      replacements: { id, code: code || null, nom, prenom: prenom || null, mobile: mobile || null, phone: phone || null, email: email || null, etat: etat || 1 },
      type: connectionToUse.QueryTypes.UPDATE,
    }
  );
  return { id, code, nom, prenom, mobile, phone, email, etat };
};

// Archiver un contact (etat = 0)
const archiveContactCommercial = async (id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    'UPDATE contact SET etat = 0 WHERE id = :id',
    {
      replacements: { id },
      type: connectionToUse.QueryTypes.UPDATE,
    }
  );
};

// Supprimer un contact par ID (suppression physique)
const deleteContactCommercial = async (id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    'DELETE FROM contact WHERE id = :id',
    {
      replacements: { id },
      type: connectionToUse.QueryTypes.DELETE,
    }
  );
};

// Récupérer un contact par ID
const getContactById = async (id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const results = await connectionToUse.query(
    'SELECT * FROM contact WHERE id = :id',
    {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT,
    }
  );
  return results[0];
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
          identifiant_type: row.identifiant_type,
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
          pr.part_id, 
          pr.ligne AS id,
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
const addClient = async ({ code, nom }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const queryResult = await connectionToUse.query(
    `INSERT INTO partenaire (code, nom, type) 
     OUTPUT INSERTED.part_id AS part_id
     VALUES (:code, :nom, 1)`,
    {
      replacements: { code, nom },
      // MSSQL: on veut récupérer la ligne retournée par OUTPUT
      type: sequelize.QueryTypes.SELECT,
    }
  );

  // Sequelize MSSQL peut retourner un tableau (ou un tableau de tableaux selon versions/config)
  const rows = Array.isArray(queryResult) && Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
  const partId = Array.isArray(rows) ? rows?.[0]?.part_id : rows?.part_id;
  return partId;
};

// Ajouter un fournisseur (type=2)
const addFournisseur = async ({ code, nom }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const queryResult = await connectionToUse.query(
    `INSERT INTO partenaire (code, nom, type) 
     OUTPUT INSERTED.part_id AS part_id
     VALUES (:code, :nom, 2)`,
    {
      replacements: { code, nom },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const rows = Array.isArray(queryResult) && Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
  const partId = Array.isArray(rows) ? rows?.[0]?.part_id : rows?.part_id;
  return partId;
};

// Insertion Adresse
const addAdresse = async ({ part_id, adresse, postal_code, ville_id }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    `INSERT INTO adresse (part_id, adresse, postal_code, ville)
     VALUES (:part_id, :adresse, :postal_code, :ville_id)`,
    {
      replacements: { part_id, adresse, postal_code, ville_id },
      type: sequelize.QueryTypes.INSERT,
    }
  );
};

// Insertion Identifiant
const addIdentifiant = async ({ part_id, identifiant_type, identifiant }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  // pk_partenaire_identifiant = (part_id, identifiant_type) dans cette base
  // => UPSERT : update si existe, sinon insert
  await connectionToUse.query(
    `IF EXISTS (SELECT 1 FROM partenaire_identifiant WHERE part_id = :part_id AND identifiant_type = :identifiant_type)
     BEGIN
       UPDATE partenaire_identifiant
       SET identifiant = :identifiant
       WHERE part_id = :part_id AND identifiant_type = :identifiant_type
     END
     ELSE
     BEGIN
       INSERT INTO partenaire_identifiant (part_id, identifiant_type, identifiant)
       VALUES (:part_id, :identifiant_type, :identifiant)
     END`,
    {
      replacements: { part_id, identifiant_type, identifiant },
      type: sequelize.QueryTypes.RAW,
    }
  );
};

// Insertion Représentant (Contact)
const addContact = async ({ part_id, ligne, company_contact }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    `INSERT INTO partenaire_representant (part_id, ligne, company_contact)
     VALUES (:part_id, :ligne, :company_contact)`,
    {
      replacements: { part_id, ligne, company_contact },
      type: sequelize.QueryTypes.INSERT,
    }
  );
};

// Suppression multiple d'adresses
const deleteAdresses = async (ids, sequelizeConnection = null) => {
  if (ids.length === 0) return;
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    `DELETE FROM adresse WHERE id IN (:ids)`,
    {
      replacements: { ids },
      type: sequelize.QueryTypes.DELETE,
    }
  );
};

// Suppression multiple d'identifiants
const deleteIdentifiants = async (part_id, identifiants = [], sequelizeConnection = null) => {
  if (!Array.isArray(identifiants) || identifiants.length === 0) return;
  const connectionToUse = sequelizeConnection || sequelize;

  // pk_partenaire_identifiant = (part_id, identifiant_type)
  const types = identifiants
    .map(it => it?.identifiant_type)
    .filter(t => t !== undefined && t !== null);

  if (types.length === 0) return;

  await connectionToUse.query(
    `DELETE FROM partenaire_identifiant
     WHERE part_id = :part_id
       AND identifiant_type IN (:types)`,
    {
      replacements: { part_id, types },
      type: sequelize.QueryTypes.DELETE
    }
  );
};

// Suppression multiple de contacts
const deleteContacts = async (part_id, lignes, sequelizeConnection = null) => {
  if (!Array.isArray(lignes) || lignes.length === 0) return;
  const connectionToUse = sequelizeConnection || sequelize;

  // La table partenaire_representant ne possède pas forcément de colonne "id"
  // On supprime donc par (part_id, ligne)
  await connectionToUse.query(
    `DELETE FROM partenaire_representant
     WHERE part_id = :part_id AND ligne IN (:lignes)`,
    {
      replacements: { part_id, lignes },
      type: sequelize.QueryTypes.DELETE,
    }
  );
};

// Update Adresse
const updateAdresse = async ({ id, adresse, postal_code, ville_id }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
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
const updateIdentifiant = async (part_id, { identifiant_type, identifiant, original_identifiant_type, original_identifiant }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const oldType = original_identifiant_type ?? identifiant_type;

  // Si le type change, on supprime l'ancien et on UPSERT le nouveau (PK = part_id + identifiant_type)
  if (oldType !== identifiant_type) {
    await connectionToUse.query(
      `DELETE FROM partenaire_identifiant WHERE part_id = :part_id AND identifiant_type = :oldType`,
      { replacements: { part_id, oldType }, type: sequelize.QueryTypes.DELETE }
    );
  }

  // UPSERT sur (part_id, identifiant_type)
  await addIdentifiant({ part_id, identifiant_type, identifiant }, sequelizeConnection);
};

// Update Contact
const updateContact = async ({ part_id, ligne, company_contact }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    `UPDATE partenaire_representant
     SET company_contact = :company_contact
     WHERE part_id = :part_id AND ligne = :ligne`,
    {
      replacements: { part_id, ligne, company_contact },
      type: sequelize.QueryTypes.UPDATE,
    }
  );
};

// Modifier un client
const updateClient = async (id, { code, nom }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
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
const deleteClient = async (id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
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
  getContactsPaged,
  getContactById,
  addContactCommercial,
  updateContactCommercial,
  archiveContactCommercial,
  deleteContactCommercial,
  getClientById,
  addClient,
  addFournisseur,
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
