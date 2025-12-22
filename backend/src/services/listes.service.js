const listesModel = require('../models/listes.model');


// Obtenir tous les group_id distincts
const getAllGroupIds = async (sequelizeConnection = null) => {
  try {
    const groupIds = await listesModel.getAllGroupIds(sequelizeConnection);
    return groupIds;
  } catch (error) {
    console.error('[listes.service.js] ❌ Erreur récupération group IDs:', error);
    throw error;
  }
};

// Obtenir les listes par group_id
const getListesByGroupId = async (group_id, sequelizeConnection = null) => {
  try {
    const listes = await listesModel.getListesByGroupId(group_id, sequelizeConnection);
    return listes;
  } catch (error) {
    console.error('[listes.service.js] ❌ Erreur récupération listes:', error);
    throw error;
  }
};

// Obtenir une liste par ID
const getListe = async (id, sequelizeConnection = null) => {
  const liste = await listesModel.getListeById(id, sequelizeConnection);
  if (!liste) {
    throw new Error('Liste non trouvée');
  }
  return liste;
};

// Créer une nouvelle liste
const createListe = async (listeData, sequelizeConnection = null) => {
  const id = await listesModel.addListe(listeData, sequelizeConnection);
  return { id, ...listeData };
};

// Modifier une liste existante
const editListe = async (id, listeData, sequelizeConnection = null) => {
  const liste = await listesModel.getListeById(id, sequelizeConnection);
  if (!liste) {
    throw new Error('Liste à modifier non trouvée');
  }
  return await listesModel.updateListe(id, listeData, sequelizeConnection);
};

// Supprimer une liste
const deleteListe = async (id, sequelizeConnection = null) => {
  const liste = await listesModel.getListeById(id, sequelizeConnection);
  if (!liste) {
    throw new Error('Liste non trouvée');
  }
  await listesModel.deleteListe(id, sequelizeConnection);
  return { message: 'Liste supprimée avec succès' };
};

module.exports = {
  getAllGroupIds,
  getListesByGroupId,
  getListe,
  createListe,
  editListe,
  deleteListe
};

