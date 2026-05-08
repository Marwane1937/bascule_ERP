const { getConnection } = require('../../config/database');
const sequelize = require('../../config/database'); // Garder pour compatibilité QueryTypes

// Récupérer tous les clients
const getAllClients = async (sequelizeConnection = null) => {
  // Utiliser la connexion passée, sinon getConnection() pour avoir la connexion active
  const connectionToUse = sequelizeConnection || getConnection();
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

const getContactsAutocomplete = async (sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const [results] = await connectionToUse.query(`
    SELECT id, nom
    FROM contact
    WHERE nom IS NOT NULL AND LTRIM(RTRIM(nom)) <> ''
    ORDER BY nom ASC
  `);
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

// Verifier si un code/nom client existe deja (type = 1)
const checkClientUniqueness = async ({ code, nom, excludeId = null }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const normalizedCode = typeof code === 'string' ? code.trim() : '';
  const normalizedNom = typeof nom === 'string' ? nom.trim() : '';
  const numericExcludeId = Number.isFinite(Number(excludeId)) ? Number(excludeId) : null;

  const results = await connectionToUse.query(
    `SELECT
      MAX(CASE
            WHEN :code <> ''
             AND LTRIM(RTRIM(ISNULL(p.code, ''))) = :code
            THEN 1 ELSE 0
          END) AS code_exists,
      MAX(CASE
            WHEN :nom <> ''
             AND LTRIM(RTRIM(ISNULL(p.nom, ''))) = :nom
            THEN 1 ELSE 0
          END) AS nom_exists
     FROM partenaire p
     WHERE p.type = 1
       AND (:excludeId IS NULL OR p.part_id <> :excludeId)`,
    {
      replacements: {
        code: normalizedCode,
        nom: normalizedNom,
        excludeId: numericExcludeId
      },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const row = Array.isArray(results) ? results[0] : results;
  return {
    codeExists: Number(row?.code_exists || 0) > 0,
    nomExists: Number(row?.nom_exists || 0) > 0
  };
};

// Verifier si un code/nom fournisseur existe deja (type = 2)
const checkFournisseurUniqueness = async ({ code, nom, excludeId = null }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const normalizedCode = typeof code === 'string' ? code.trim() : '';
  const normalizedNom = typeof nom === 'string' ? nom.trim() : '';
  const numericExcludeId = Number.isFinite(Number(excludeId)) ? Number(excludeId) : null;

  const results = await connectionToUse.query(
    `SELECT
      MAX(CASE
            WHEN :code <> ''
             AND LTRIM(RTRIM(ISNULL(p.code, ''))) = :code
            THEN 1 ELSE 0
          END) AS code_exists,
      MAX(CASE
            WHEN :nom <> ''
             AND LTRIM(RTRIM(ISNULL(p.nom, ''))) = :nom
            THEN 1 ELSE 0
          END) AS nom_exists
     FROM partenaire p
     WHERE p.type = 2
       AND (:excludeId IS NULL OR p.part_id <> :excludeId)`,
    {
      replacements: {
        code: normalizedCode,
        nom: normalizedNom,
        excludeId: numericExcludeId
      },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const row = Array.isArray(results) ? results[0] : results;
  return {
    codeExists: Number(row?.code_exists || 0) > 0,
    nomExists: Number(row?.nom_exists || 0) > 0
  };
};

// Verifier si un code/nom commercial existe deja (table contact)
const checkCommercialUniqueness = async ({ code, nom, excludeId = null }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const normalizedCode = typeof code === 'string' ? code.trim() : '';
  const normalizedNom = typeof nom === 'string' ? nom.trim() : '';
  const numericExcludeId = Number.isFinite(Number(excludeId)) ? Number(excludeId) : null;

  const results = await connectionToUse.query(
    `SELECT
      MAX(CASE
            WHEN :code <> ''
             AND LTRIM(RTRIM(ISNULL(c.code, ''))) = :code
            THEN 1 ELSE 0
          END) AS code_exists,
      MAX(CASE
            WHEN :nom <> ''
             AND LTRIM(RTRIM(ISNULL(c.nom, ''))) = :nom
            THEN 1 ELSE 0
          END) AS nom_exists
     FROM contact c
     WHERE (:excludeId IS NULL OR c.id <> :excludeId)`,
    {
      replacements: {
        code: normalizedCode,
        nom: normalizedNom,
        excludeId: numericExcludeId
      },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const row = Array.isArray(results) ? results[0] : results;
  return {
    codeExists: Number(row?.code_exists || 0) > 0,
    nomExists: Number(row?.nom_exists || 0) > 0
  };
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

const toNumericValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildMonthlySeries = (...series) => {
  const monthMap = new Map();

  series.flat().forEach((row) => {
    const key = String(row?.month_key || '').trim();
    if (!key) return;

    if (!monthMap.has(key)) {
      monthMap.set(key, {
        month_key: key,
        year_num: Number(row?.year_num || 0),
        month_num: Number(row?.month_num || 0)
      });
    }

    Object.entries(row || {}).forEach(([field, value]) => {
      if (field === 'month_key' || field === 'year_num' || field === 'month_num') return;
      monthMap.get(key)[field] = toNumericValue(value, 0);
    });
  });

  return Array.from(monthMap.values())
    .sort((a, b) => {
      if (a.year_num !== b.year_num) return a.year_num - b.year_num;
      return a.month_num - b.month_num;
    })
    .map(({ year_num, month_num, ...rest }) => rest);
};

const getClientStatistics = async (part_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const partnerId = parseInt(part_id, 10);

  const [
    partner,
    summaryRows,
    statementRows,
    monthlyRows
  ] = await Promise.all([
    getClientById(partnerId, connectionToUse),
    connectionToUse.query(
      `
        SELECT
          COUNT(*) AS mouvements_count,
          SUM(CASE WHEN r.sens = 1 THEN ISNULL(r.montant, 0) ELSE 0 END) AS debit_total,
          SUM(CASE WHEN r.sens = -1 THEN ISNULL(r.montant, 0) ELSE 0 END) AS credit_total,
          MAX(CAST(r.date AS date)) AS last_movement_date
        FROM reglement r
        WHERE r.part_id = :part_id
      `,
      {
        replacements: { part_id: partnerId },
        type: sequelize.QueryTypes.SELECT
      }
    ),
    connectionToUse.query(
      `
        SELECT TOP 12
          r.regle_id AS id,
          CAST(r.date AS date) AS date,
          r.numero,
          CASE WHEN r.sens = 1 THEN 'Debit' ELSE 'Credit' END AS movement_type,
          CASE WHEN r.sens = 1 THEN ISNULL(r.montant, 0) ELSE 0 END AS debit,
          CASE WHEN r.sens = -1 THEN ISNULL(r.montant, 0) ELSE 0 END AS credit,
          ISNULL(
            SUM(CASE WHEN r.sens = 1 THEN ISNULL(r.montant, 0) ELSE -ISNULL(r.montant, 0) END)
              OVER (PARTITION BY r.part_id ORDER BY CAST(r.date AS datetime), r.regle_id ROWS UNBOUNDED PRECEDING),
            0
          ) AS solde,
          CASE
            WHEN r.sens = 1 THEN 'Creance client'
            ELSE 'Reglement client'
          END AS libelle
        FROM reglement r
        WHERE r.part_id = :part_id
        ORDER BY CAST(r.date AS datetime) DESC, r.regle_id DESC
      `,
      {
        replacements: { part_id: partnerId },
        type: sequelize.QueryTypes.SELECT
      }
    ),
    connectionToUse.query(
      `
        SELECT TOP 12
          CONVERT(char(7), CAST(r.date AS date), 120) AS month_key,
          YEAR(CAST(r.date AS date)) AS year_num,
          MONTH(CAST(r.date AS date)) AS month_num,
          SUM(CASE WHEN r.sens = 1 THEN ISNULL(r.montant, 0) ELSE 0 END) AS debit_total,
          SUM(CASE WHEN r.sens = -1 THEN ISNULL(r.montant, 0) ELSE 0 END) AS credit_total
        FROM reglement r
        WHERE r.part_id = :part_id
        GROUP BY CONVERT(char(7), CAST(r.date AS date), 120), YEAR(CAST(r.date AS date)), MONTH(CAST(r.date AS date))
        ORDER BY year_num DESC, month_num DESC
      `,
      {
        replacements: { part_id: partnerId },
        type: sequelize.QueryTypes.SELECT
      }
    )
  ]);

  if (!partner || Number(partner.type) !== 1) {
    return null;
  }

  const summaryRow = Array.isArray(summaryRows) ? (summaryRows[0] || {}) : {};
  const debitTotal = toNumericValue(summaryRow.debit_total, 0);
  const creditTotal = toNumericValue(summaryRow.credit_total, 0);
  const solde = debitTotal - creditTotal;
  const outstanding = Math.max(solde, 0);
  const settlementRate = debitTotal > 0 ? Math.min((creditTotal / debitTotal) * 100, 100) : 0;

  return {
    partner: {
      part_id: partner.part_id,
      code: partner.code || '',
      nom: partner.nom || '',
      type: Number(partner.type || 0)
    },
    situation: {
      mouvements_count: toNumericValue(summaryRow.mouvements_count, 0),
      debit_total: debitTotal,
      credit_total: creditTotal,
      solde,
      outstanding_total: outstanding,
      settlement_rate: settlementRate,
      last_movement_date: summaryRow.last_movement_date || null
    },
    statement: (Array.isArray(statementRows) ? statementRows : []).map((row) => ({
      id: row.id,
      date: row.date || null,
      numero: row.numero || '',
      libelle: row.libelle || '',
      movement_type: row.movement_type || '',
      debit: toNumericValue(row.debit, 0),
      credit: toNumericValue(row.credit, 0),
      solde: toNumericValue(row.solde, 0)
    })),
    charts: {
      monthly_activity: (Array.isArray(monthlyRows) ? monthlyRows : [])
        .slice()
        .reverse()
        .map((row) => ({
          month_key: row.month_key,
          debit_total: toNumericValue(row.debit_total, 0),
          credit_total: toNumericValue(row.credit_total, 0),
          solde: toNumericValue(row.debit_total, 0) - toNumericValue(row.credit_total, 0)
        })),
      breakdown: [
        { label: 'Encaisse', value: Math.max(Math.min(creditTotal, debitTotal), 0) },
        { label: 'Reste', value: outstanding }
      ]
    }
  };
};

const getFournisseurStatistics = async (part_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const partnerId = parseInt(part_id, 10);

  const [
    partner,
    orderSummaryRows,
    receptionSummaryRows,
    invoiceSummaryRows,
    openOrderRows,
    statementRows,
    monthlyOrdersRows,
    monthlyReceptionsRows,
    monthlyInvoicesRows
  ] = await Promise.all([
    getClientById(partnerId, connectionToUse),
    connectionToUse.query(
      `
        SELECT
          COUNT(DISTINCT a.document_id) AS commandes_count,
          SUM(ISNULL(ad.quantite, 0)) AS quantity_ordered,
          SUM(ISNULL(ad.quantite, 0) * ISNULL(ad.prix, 0)) AS ordered_ht,
          MAX(CAST(a.date AS date)) AS last_order_date
        FROM achat_document a
        LEFT JOIN achat_document_detail ad ON ad.document_id = a.document_id
        WHERE a.part_id = :part_id
          AND a.type = 2
      `,
      {
        replacements: { part_id: partnerId },
        type: sequelize.QueryTypes.SELECT
      }
    ),
    connectionToUse.query(
      `
        SELECT
          COUNT(DISTINCT s.id) AS receptions_count,
          SUM(ISNULL(sd.quantite, 0)) AS quantity_received,
          SUM(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0)) AS received_ht,
          MAX(CAST(s.date AS date)) AS last_reception_date
        FROM stock s
        LEFT JOIN stock_detail sd ON sd.stock_id = s.id
        WHERE s.part_id = :part_id
          AND s.type = 1
      `,
      {
        replacements: { part_id: partnerId },
        type: sequelize.QueryTypes.SELECT
      }
    ),
    connectionToUse.query(
      `
        SELECT
          COUNT(DISTINCT f.facture_id) AS invoices_count,
          SUM(ISNULL(f.facture_ht, 0)) AS invoiced_ht,
          SUM(ISNULL(f.facture_tva, 0)) AS invoiced_tva,
          MAX(CAST(f.facture_dat AS date)) AS last_invoice_date
        FROM facture_souche fs
        INNER JOIN facture f ON f.facture_id = fs.facture_id
        WHERE fs.part_id = :part_id
          AND fs.sens = 2
      `,
      {
        replacements: { part_id: partnerId },
        type: sequelize.QueryTypes.SELECT
      }
    ),
    connectionToUse.query(
      `
        SELECT
          COUNT(*) AS open_orders_count,
          SUM(CASE WHEN command_qty > received_qty THEN command_qty - received_qty ELSE 0 END) AS quantity_pending
        FROM (
          SELECT
            a.document_id,
            SUM(ISNULL(ad.quantite, 0)) AS command_qty,
            ISNULL(rec.received_qty, 0) AS received_qty
          FROM achat_document a
          LEFT JOIN achat_document_detail ad ON ad.document_id = a.document_id
          OUTER APPLY (
            SELECT SUM(ISNULL(sd.quantite, 0)) AS received_qty
            FROM stock s
            INNER JOIN stock_detail sd ON sd.stock_id = s.id
            WHERE s.parent = a.document_id
              AND s.type = 1
              AND (s.etat = 1 OR s.etat IS NULL)
          ) rec
          WHERE a.part_id = :part_id
            AND a.type = 2
          GROUP BY a.document_id, rec.received_qty
        ) q
        WHERE command_qty > received_qty
      `,
      {
        replacements: { part_id: partnerId },
        type: sequelize.QueryTypes.SELECT
      }
    ),
    connectionToUse.query(
      `
        SELECT TOP 12 *
        FROM (
          SELECT
            CAST(a.date AS date) AS date,
            a.numero,
            'Commande' AS doc_type,
            SUM(ISNULL(ad.quantite, 0)) AS quantity,
            SUM(ISNULL(ad.quantite, 0) * ISNULL(ad.prix, 0)) AS amount_ht,
            CASE
              WHEN ISNULL(rec.received_qty, 0) >= SUM(ISNULL(ad.quantite, 0)) THEN 'Cloturee'
              WHEN ISNULL(rec.received_qty, 0) > 0 THEN 'Partielle'
              ELSE 'Ouverte'
            END AS statut,
            1 AS sort_rank
          FROM achat_document a
          LEFT JOIN achat_document_detail ad ON ad.document_id = a.document_id
          OUTER APPLY (
            SELECT SUM(ISNULL(sd.quantite, 0)) AS received_qty
            FROM stock s
            INNER JOIN stock_detail sd ON sd.stock_id = s.id
            WHERE s.parent = a.document_id
              AND s.type = 1
              AND (s.etat = 1 OR s.etat IS NULL)
          ) rec
          WHERE a.part_id = :part_id
            AND a.type = 2
          GROUP BY a.date, a.numero, rec.received_qty

          UNION ALL

          SELECT
            CAST(s.date AS date) AS date,
            s.numero,
            'Reception' AS doc_type,
            SUM(ISNULL(sd.quantite, 0)) AS quantity,
            SUM(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0)) AS amount_ht,
            'Receptionnee' AS statut,
            2 AS sort_rank
          FROM stock s
          LEFT JOIN stock_detail sd ON sd.stock_id = s.id
          WHERE s.part_id = :part_id
            AND s.type = 1
          GROUP BY s.date, s.numero

          UNION ALL

          SELECT
            CAST(f.facture_dat AS date) AS date,
            f.facture_num AS numero,
            'Facture' AS doc_type,
            0 AS quantity,
            ISNULL(f.facture_ht, 0) AS amount_ht,
            'Facturee' AS statut,
            3 AS sort_rank
          FROM facture_souche fs
          INNER JOIN facture f ON f.facture_id = fs.facture_id
          WHERE fs.part_id = :part_id
            AND fs.sens = 2
        ) movements
        ORDER BY date DESC, sort_rank DESC, numero DESC
      `,
      {
        replacements: { part_id: partnerId },
        type: sequelize.QueryTypes.SELECT
      }
    ),
    connectionToUse.query(
      `
        SELECT TOP 12
          CONVERT(char(7), CAST(a.date AS date), 120) AS month_key,
          YEAR(CAST(a.date AS date)) AS year_num,
          MONTH(CAST(a.date AS date)) AS month_num,
          SUM(ISNULL(ad.quantite, 0) * ISNULL(ad.prix, 0)) AS ordered_ht
        FROM achat_document a
        LEFT JOIN achat_document_detail ad ON ad.document_id = a.document_id
        WHERE a.part_id = :part_id
          AND a.type = 2
        GROUP BY CONVERT(char(7), CAST(a.date AS date), 120), YEAR(CAST(a.date AS date)), MONTH(CAST(a.date AS date))
        ORDER BY year_num DESC, month_num DESC
      `,
      {
        replacements: { part_id: partnerId },
        type: sequelize.QueryTypes.SELECT
      }
    ),
    connectionToUse.query(
      `
        SELECT TOP 12
          CONVERT(char(7), CAST(s.date AS date), 120) AS month_key,
          YEAR(CAST(s.date AS date)) AS year_num,
          MONTH(CAST(s.date AS date)) AS month_num,
          SUM(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0)) AS received_ht
        FROM stock s
        LEFT JOIN stock_detail sd ON sd.stock_id = s.id
        WHERE s.part_id = :part_id
          AND s.type = 1
        GROUP BY CONVERT(char(7), CAST(s.date AS date), 120), YEAR(CAST(s.date AS date)), MONTH(CAST(s.date AS date))
        ORDER BY year_num DESC, month_num DESC
      `,
      {
        replacements: { part_id: partnerId },
        type: sequelize.QueryTypes.SELECT
      }
    ),
    connectionToUse.query(
      `
        SELECT TOP 12
          CONVERT(char(7), CAST(f.facture_dat AS date), 120) AS month_key,
          YEAR(CAST(f.facture_dat AS date)) AS year_num,
          MONTH(CAST(f.facture_dat AS date)) AS month_num,
          SUM(ISNULL(f.facture_ht, 0)) AS invoiced_ht
        FROM facture_souche fs
        INNER JOIN facture f ON f.facture_id = fs.facture_id
        WHERE fs.part_id = :part_id
          AND fs.sens = 2
        GROUP BY CONVERT(char(7), CAST(f.facture_dat AS date), 120), YEAR(CAST(f.facture_dat AS date)), MONTH(CAST(f.facture_dat AS date))
        ORDER BY year_num DESC, month_num DESC
      `,
      {
        replacements: { part_id: partnerId },
        type: sequelize.QueryTypes.SELECT
      }
    )
  ]);

  if (!partner || Number(partner.type) !== 2) {
    return null;
  }

  const orderRow = Array.isArray(orderSummaryRows) ? (orderSummaryRows[0] || {}) : {};
  const receptionRow = Array.isArray(receptionSummaryRows) ? (receptionSummaryRows[0] || {}) : {};
  const invoiceRow = Array.isArray(invoiceSummaryRows) ? (invoiceSummaryRows[0] || {}) : {};
  const openOrderRow = Array.isArray(openOrderRows) ? (openOrderRows[0] || {}) : {};

  const orderedHt = toNumericValue(orderRow.ordered_ht, 0);
  const receivedHt = toNumericValue(receptionRow.received_ht, 0);
  const invoicedHt = toNumericValue(invoiceRow.invoiced_ht, 0);
  const quantityOrdered = toNumericValue(orderRow.quantity_ordered, 0);
  const quantityReceived = toNumericValue(receptionRow.quantity_received, 0);
  const receptionRate = quantityOrdered > 0 ? Math.min((quantityReceived / quantityOrdered) * 100, 100) : 0;

  return {
    partner: {
      part_id: partner.part_id,
      code: partner.code || '',
      nom: partner.nom || '',
      type: Number(partner.type || 0)
    },
    situation: {
      commandes_count: toNumericValue(orderRow.commandes_count, 0),
      receptions_count: toNumericValue(receptionRow.receptions_count, 0),
      invoices_count: toNumericValue(invoiceRow.invoices_count, 0),
      ordered_ht: orderedHt,
      received_ht: receivedHt,
      invoiced_ht: invoicedHt,
      invoiced_tva: toNumericValue(invoiceRow.invoiced_tva, 0),
      quantity_ordered: quantityOrdered,
      quantity_received: quantityReceived,
      quantity_pending: toNumericValue(openOrderRow.quantity_pending, 0),
      open_orders_count: toNumericValue(openOrderRow.open_orders_count, 0),
      reception_rate: receptionRate,
      last_activity_date: invoiceRow.last_invoice_date || receptionRow.last_reception_date || orderRow.last_order_date || null
    },
    statement: (Array.isArray(statementRows) ? statementRows : []).map((row) => ({
      date: row.date || null,
      numero: row.numero || '',
      doc_type: row.doc_type || '',
      quantity: toNumericValue(row.quantity, 0),
      amount_ht: toNumericValue(row.amount_ht, 0),
      statut: row.statut || ''
    })),
    charts: {
      monthly_activity: buildMonthlySeries(
        (Array.isArray(monthlyOrdersRows) ? monthlyOrdersRows : []).map((row) => ({
          ...row,
          ordered_ht: toNumericValue(row.ordered_ht, 0)
        })),
        (Array.isArray(monthlyReceptionsRows) ? monthlyReceptionsRows : []).map((row) => ({
          ...row,
          received_ht: toNumericValue(row.received_ht, 0)
        })),
        (Array.isArray(monthlyInvoicesRows) ? monthlyInvoicesRows : []).map((row) => ({
          ...row,
          invoiced_ht: toNumericValue(row.invoiced_ht, 0)
        }))
      ),
      breakdown: [
        { label: 'Commandes', value: orderedHt },
        { label: 'Receptions', value: receivedHt },
        { label: 'Factures', value: invoicedHt }
      ]
    }
  };
};

module.exports = {
  getAllClients,
  getAllFournisseurs,
  getAllContacts,
  getContactsAutocomplete,
  getContactsPaged,
  getContactById,
  addContactCommercial,
  updateContactCommercial,
  archiveContactCommercial,
  deleteContactCommercial,
  getClientById,
  addClient,
  addFournisseur,
  checkClientUniqueness,
  checkFournisseurUniqueness,
  checkCommercialUniqueness,
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
  updateContact,
  getClientStatistics,
  getFournisseurStatistics
};
