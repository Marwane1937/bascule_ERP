const sequelize = require('../../config/database');

// Récupérer l'exonération d'un client par part_id (première trouvée)
const getExonerationByPartId = async (part_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const results = await connectionToUse.query(
    'SELECT * FROM partenaire_exoneration WHERE part_id = :part_id ORDER BY part_id DESC',
    {
      replacements: { part_id },
      type: sequelize.QueryTypes.SELECT,
    }
  );
  return results[0] || null;
};

// Récupérer toutes les exonérations d'un client par part_id
const getAllExonerationsByPartId = async (part_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const results = await connectionToUse.query(
    'SELECT * FROM partenaire_exoneration WHERE part_id = :part_id ORDER BY part_id DESC, date_debut DESC',
    {
      replacements: { part_id },
      type: sequelize.QueryTypes.SELECT,
    }
  );
  return results || [];
};

// Créer une nouvelle exonération (toujours INSERT pour garder toutes les lettres)
const addExoneration = async (part_id, exonerationData, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const {
    identifiant,
    motif,
    reference,
    date_debut,
    date_fin,
    type,
    etat,
    user_id
  } = exonerationData;

  // Toujours INSERT pour créer une nouvelle lettre (ne pas écraser les existantes)
  await connectionToUse.query(
    `INSERT INTO partenaire_exoneration (part_id, identifiant, motif, reference, date_debut, date_fin, type, etat, user_id)
     VALUES (:part_id, :identifiant, :motif, :reference, :date_debut, :date_fin, :type, :etat, :user_id)`,
    {
      replacements: {
        part_id,
        identifiant: identifiant || null,
        motif: motif || null,
        reference: reference || null,
        date_debut: date_debut || null,
        date_fin: date_fin || null,
        type: type || null,
        etat: etat || null,
        user_id: user_id || null
      },
      type: sequelize.QueryTypes.INSERT,
    }
  );
  return { part_id, ...exonerationData, created: true };
};

// Créer ou mettre à jour une exonération (UPSERT) - conservé pour compatibilité
const upsertExoneration = async (part_id, exonerationData, sequelizeConnection = null) => {
  // Désormais, on fait toujours un INSERT pour garder toutes les lettres
  return await addExoneration(part_id, exonerationData, sequelizeConnection);
};

// Supprimer une exonération par part_id
const deleteExoneration = async (part_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    'DELETE FROM partenaire_exoneration WHERE part_id = :part_id',
    {
      replacements: { part_id },
      type: sequelize.QueryTypes.DELETE,
    }
  );
};

module.exports = {
  getExonerationByPartId,
  getAllExonerationsByPartId,
  addExoneration,
  upsertExoneration,
  deleteExoneration
};

