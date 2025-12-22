const { getConnection } = require('../../config/database');


// Récupérer tous les employés (triés par ID descendant pour afficher les derniers en premier)
const getAllEmployes = async (sequelizeConnection = null) => {
  try {
    const sequelize = sequelizeConnection || getConnection();
    const [results] = await sequelize.query(
      `SELECT id, code, nom, prenom, titre, naissance_dat, piece_type, piece_numero, 
       securite_num, fonction, departement_id, contrat_typ, embauche_dat, sortie_dat, etat, user_id, cr_date, telephone, telegram_id
       FROM employe 
       ORDER BY id DESC`
    );
    return results;
  } catch (error) {
    console.error('[employe.model.js] ❌ Erreur lors de la requête:', error);
    console.error('[employe.model.js] ❌ Stack:', error.stack);
    throw error;
  }
};

// Récupérer un employé par ID
const getEmployeById = async (id) => {
  const sequelize = getConnection();
  const results = await sequelize.query(
    `SELECT id, code, nom, prenom, titre, naissance_dat, piece_type, piece_numero, 
     securite_num, fonction, departement_id, contrat_typ, embauche_dat, sortie_dat, etat, user_id, cr_date, telephone, telegram_id
     FROM employe 
     WHERE id = :id`,
    {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT,
    }
  );
  return results && results.length > 0 ? results[0] : null;
};

// Ajouter un employé avec transaction pour garantir le rollback en cas d'erreur
const addEmploye = async (employeData) => {
  const sequelize = getConnection();
  
  return await sequelize.transaction(async (t) => {
    try {
      const {
        code, nom, prenom, titre, naissance_dat, piece_type, piece_numero,
        securite_num, fonction, departement_id, contrat_typ, embauche_dat, sortie_dat, etat, user_id, telephone, telegram_id
      } = employeData;

      const [result] = await sequelize.query(
        `INSERT INTO employe (code, nom, prenom, titre, naissance_dat, piece_type, piece_numero,
         securite_num, fonction, departement_id, contrat_typ, embauche_dat, sortie_dat, etat, user_id, telephone, telegram_id) 
         OUTPUT INSERTED.id 
         VALUES (:code, :nom, :prenom, :titre, :naissance_dat, :piece_type, :piece_numero,
         :securite_num, :fonction, :departement_id, :contrat_typ, :embauche_dat, :sortie_dat, :etat, :user_id, :telephone, :telegram_id)`,
        {
          replacements: {
            code, nom, prenom, titre, naissance_dat, piece_type, piece_numero,
            securite_num, fonction, departement_id, contrat_typ, embauche_dat, sortie_dat, etat, user_id, telephone: telephone || null, telegram_id: telegram_id || null
          },
          type: sequelize.QueryTypes.INSERT,
          transaction: t
        }
      );
      
      const employeId = result && (Array.isArray(result) ? (result[0]?.id || result[0]) : (result.id || result));
      
      return employeId;
    } catch (error) {
      console.error('❌ Erreur lors de l\'ajout de l\'employé:', error);
      throw new Error(`Erreur lors de l'ajout de l'employé: ${error.message || 'Erreur inconnue'}`);
    }
  });
};

// Modifier un employé
const updateEmploye = async (id, employeData) => {
  const sequelize = getConnection();
  const {
    code, nom, prenom, titre, naissance_dat, piece_type, piece_numero,
    securite_num, fonction, departement_id, contrat_typ, embauche_dat, sortie_dat, etat, user_id, telephone, telegram_id
  } = employeData;

  await sequelize.query(
    `UPDATE employe 
     SET code = :code, nom = :nom, prenom = :prenom, titre = :titre, 
         naissance_dat = :naissance_dat, piece_type = :piece_type, piece_numero = :piece_numero,
         securite_num = :securite_num, fonction = :fonction, departement_id = :departement_id,
         contrat_typ = :contrat_typ, embauche_dat = :embauche_dat, sortie_dat = :sortie_dat,
         etat = :etat, user_id = :user_id, telephone = :telephone, telegram_id = :telegram_id
     WHERE id = :id`,
    {
      replacements: {
        id, code, nom, prenom, titre, naissance_dat, piece_type, piece_numero,
        securite_num, fonction, departement_id, contrat_typ, embauche_dat, sortie_dat, etat, user_id, telephone: telephone || null, telegram_id: telegram_id || null
      },
      type: sequelize.QueryTypes.UPDATE,
    }
  );
  return { id, ...employeData };
};

// Supprimer un employé par ID
const deleteEmploye = async (id) => {
  const sequelize = getConnection();
  await sequelize.query(
    'DELETE FROM employe WHERE id = :id',
    {
      replacements: { id },
      type: sequelize.QueryTypes.DELETE,
    }
  );
};

// Récupérer tous les employés actifs (etat = 1) avec nom complet en majuscules
const getEmployesActifs = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const [results] = await sequelize.query(
    `SELECT id, UPPER(prenom + ' ' + nom) as nom_complet, telegram_id
     FROM employe 
     WHERE etat = 1 
     ORDER BY nom_complet ASC`
  );
  return results;
};

// Récupérer un employé par ID avec son téléphone
const getEmployeByIdWithPhone = async (id) => {
  const sequelize = getConnection();
  const [results] = await sequelize.query(
    `SELECT id, code, nom, prenom, telephone, mobile, gsm, tel
     FROM employe 
     WHERE id = :id`,
    {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    }
  );
  return results && results.length > 0 ? results[0] : null;
};

// Récupérer le téléphone d'un employé par ID
const getEmployeTelephone = async (id) => {
  const sequelize = getConnection();
  // Convertir l'ID en nombre pour éviter les problèmes de type
  const employeId = typeof id === 'string' ? parseInt(id, 10) : id;
  
  const [results] = await sequelize.query(
    `SELECT id, telephone, mobile, gsm, tel FROM employe WHERE id = :id`,
    {
      replacements: { id: employeId },
      type: sequelize.QueryTypes.SELECT
    }
  );
  
  const result = results && results.length > 0 ? results[0] : null;
  
  if (result) {
    // Essayer plusieurs champs de téléphone
    result.telephone = result.telephone || result.mobile || result.gsm || result.tel || null;
  } else {
  }
  
  return result;
};

module.exports = {
  getAllEmployes,
  getEmployeById,
  addEmploye,
  updateEmploye,
  deleteEmploye,
  getEmployesActifs,
  getEmployeByIdWithPhone,
  getEmployeTelephone
};

