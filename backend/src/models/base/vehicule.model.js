const sequelize = require('../../config/database');

// Récupérer tous les véhicules
const getAllVehicules = async (sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const [results] = await connectionToUse.query('SELECT * FROM vehicule ORDER BY id DESC');
  return results;
};

// Récupérer un véhicule par ID
const getVehiculeById = async (id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const results = await connectionToUse.query(
    'SELECT * FROM vehicule WHERE id = :id',
    {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT,
    }
  );
  return results[0];
};

// Récupérer les charges d'un véhicule par ID
const getVehiculeChargesById = async (vehicule_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  try {
    const results = await connectionToUse.query(
      `SELECT * FROM vehicule_detail WHERE vehicule_id = :vehicule_id ORDER BY id DESC`,
      {
        replacements: { vehicule_id },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    return Array.isArray(results) ? results : [];
  } catch (error) {
    console.error('[getVehiculeChargesById] ❌ Erreur:', error);
    throw error;
  }
};

// Récupérer les charges urgentes (reste <= thresholdDays) pour tous les véhicules
const getUrgentVehiculeCharges = async (thresholdDays = 10, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const threshold = Number(thresholdDays) || 10;

  const results = await connectionToUse.query(
    `SELECT d.*, l.nom AS type_nom
     FROM vehicule_detail d
     LEFT JOIN listes l ON l.id = d.type and l.group_id = 4000
     WHERE d.date_fin IS NOT NULL
       AND DATEDIFF(day, CONVERT(date, GETDATE()), CONVERT(date, d.date_fin)) <= :threshold
     ORDER BY d.vehicule_id ASC, d.id DESC`,
    {
      replacements: { threshold },
      type: sequelize.QueryTypes.SELECT
    }
  );

  return Array.isArray(results) ? results : [];
};

// Ajouter un véhicule
const addVehicule = async (vehiculeData, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const {
    numero,
    matricule,
    chassis,
    marque,
    modele,
    puissance,
    carburant,
    tonnage,
    tare,
    volume,
    circulation_date,
    acquisition_type,
    description,
    part_id,
    type,
    etat,
    user_id,
    cr_date
  } = vehiculeData;

  const [result] = await connectionToUse.query(
    `INSERT INTO vehicule (numero, matricule, chassis, marque, modele, puissance, carburant, tonnage, tare, volume, circulation_date, acquisition_type, description, part_id, type, etat, cr_date, user_id) 
     OUTPUT INSERTED.id 
     VALUES (:numero, :matricule, :chassis, :marque, :modele, :puissance, :carburant, :tonnage, :tare, :volume, :circulation_date, :acquisition_type, :description, :part_id, :type, :etat, COALESCE(:cr_date, GETDATE()), :user_id)`,
    {
      replacements: {
        numero,
        matricule,
        chassis,
        marque,
        modele,
        puissance,
        carburant,
        tonnage,
        tare,
        volume,
        circulation_date,
        acquisition_type,
        description,
        part_id,
        type,
        etat,
        user_id,
        cr_date: cr_date || null
      },
      type: sequelize.QueryTypes.INSERT,
    }
  );
  return result.id || result[0]?.id || result;
};

// Modifier un véhicule
const updateVehicule = async (id, vehiculeData, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const {
    numero,
    matricule,
    chassis,
    marque,
    modele,
    puissance,
    carburant,
    tonnage,
    tare,
    volume,
    circulation_date,
    acquisition_type,
    description,
    part_id,
    type,
    etat
  } = vehiculeData;

  await connectionToUse.query(
    `UPDATE vehicule 
     SET numero = :numero, matricule = :matricule, chassis = :chassis, marque = :marque, 
         modele = :modele, puissance = :puissance, carburant = :carburant, tonnage = :tonnage, 
         tare = :tare, volume = :volume, circulation_date = :circulation_date, 
         acquisition_type = :acquisition_type, description = :description, part_id = :part_id, 
         type = :type, etat = :etat
     WHERE id = :id`,
    {
      replacements: {
        id,
        numero,
        matricule,
        chassis,
        marque,
        modele,
        puissance,
        carburant,
        tonnage,
        tare,
        volume,
        circulation_date,
        acquisition_type,
        description,
        part_id,
        type,
        etat
      },
      type: sequelize.QueryTypes.UPDATE,
    }
  );
  return { id, ...vehiculeData };
};

// Supprimer un véhicule par ID
const deleteVehicule = async (id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    'DELETE FROM vehicule WHERE id = :id',
    {
      replacements: { id },
      type: sequelize.QueryTypes.DELETE,
    }
  );
};

// Ajouter une charge à un véhicule
const addVehiculeCharge = async ({ vehicule_id, libelle, date_debut, date_fin, quantite, prix, montant, sens, description, etat, type }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const [result] = await connectionToUse.query(
    `INSERT INTO vehicule_detail (vehicule_id, libelle, date_debut, date_fin, quantite, prix, montant, sens, description, etat, type)
     OUTPUT INSERTED.id
     VALUES (:vehicule_id, :libelle, :date_debut, :date_fin, :quantite, :prix, :montant, :sens, :description, :etat, :type)`,
    {
      replacements: { vehicule_id, libelle, date_debut, date_fin, quantite, prix, montant, sens, description, etat, type },
      type: sequelize.QueryTypes.INSERT,
    }
  );
  return result.id || result[0]?.id || result;
};

// Modifier une charge de véhicule
const updateVehiculeCharge = async ({ id, libelle, date_debut, date_fin, quantite, prix, montant, sens, description, etat, type }, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    `UPDATE vehicule_detail
     SET libelle = :libelle, date_debut = :date_debut, date_fin = :date_fin, quantite = :quantite, 
         prix = :prix, montant = :montant, sens = :sens, description = :description, etat = :etat, type = :type
     WHERE id = :id`,
    {
      replacements: { id, libelle, date_debut, date_fin, quantite, prix, montant, sens, description, etat, type },
      type: sequelize.QueryTypes.UPDATE,
    }
  );
};

// Supprimer une charge de véhicule
const deleteVehiculeCharge = async (id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    'DELETE FROM vehicule_detail WHERE id = :id',
    {
      replacements: { id },
      type: sequelize.QueryTypes.DELETE,
    }
  );
};

// Supprimer plusieurs charges de véhicule
const deleteVehiculeCharges = async (ids, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  if (ids.length === 0) return;
  await connectionToUse.query(
    `DELETE FROM vehicule_detail WHERE id IN (:ids)`,
    {
      replacements: { ids },
      type: sequelize.QueryTypes.DELETE,
    }
  );
};

module.exports = {
  getAllVehicules,
  getVehiculeById,
  getVehiculeChargesById,
  getUrgentVehiculeCharges,
  addVehicule,
  updateVehicule,
  deleteVehicule,
  addVehiculeCharge,
  updateVehiculeCharge,
  deleteVehiculeCharge,
  deleteVehiculeCharges
};

