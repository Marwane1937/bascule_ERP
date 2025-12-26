const exonerationModel = require('../../models/base/partenaire-exoneration.model');
const { getConnection } = require('../../config/database');
const databaseSwitchService = require('../database-switch.service');

// Obtenir l'exonération d'un client par part_id (première trouvée)
const getExoneration = async (part_id, sequelizeConnection = null) => {
  try {
    const connection = sequelizeConnection || getConnection();
    const exoneration = await exonerationModel.getExonerationByPartId(part_id, connection);
    return exoneration;
  } catch (error) {
    console.error('❌ Erreur récupération exonération:', error);
    throw error;
  }
};

// Obtenir toutes les exonérations d'un client par part_id
const getAllExonerations = async (part_id, sequelizeConnection = null) => {
  try {
    const connection = sequelizeConnection || getConnection();
    const exonerations = await exonerationModel.getAllExonerationsByPartId(part_id, connection);
    return exonerations;
  } catch (error) {
    console.error('❌ Erreur récupération toutes les exonérations:', error);
    throw error;
  }
};

// Créer ou mettre à jour une exonération
const saveOrUpdateExoneration = async (part_id, exonerationData, sequelizeConnection = null) => {
  try {
    const connection = sequelizeConnection || getConnection();
    const result = await exonerationModel.upsertExoneration(part_id, exonerationData, connection);
    return result;
  } catch (error) {
    console.error('❌ Erreur sauvegarde exonération:', error);
    throw error;
  }
};

// Supprimer une exonération
const deleteExoneration = async (part_id, sequelizeConnection = null) => {
  try {
    const connection = sequelizeConnection || getConnection();
    await exonerationModel.deleteExoneration(part_id, connection);
    return { message: 'Exonération supprimée avec succès' };
  } catch (error) {
    console.error('❌ Erreur suppression exonération:', error);
    throw error;
  }
};

module.exports = {
  getExoneration,
  getAllExonerations,
  saveOrUpdateExoneration,
  deleteExoneration
};

