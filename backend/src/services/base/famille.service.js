const familleModel = require('../../models/base/famille.model');

// Obtenir tous les Familles
const getFamilles = async (sequelizeConnection = null) => {
  return await familleModel.getAllFamille(sequelizeConnection);
};

// Obtenir tous les Familles
const getUnites = async (sequelizeConnection = null) => {
  return await familleModel.getAllUnite(sequelizeConnection);
};


// Obtenir une Famille par ID
const getFamille = async (id) => {
  const famille = await familleModel.getFamilleById(id);
  if (!famille) {
    throw new Error('Famille non trouvé');
  }
  return famille;
};

// Créer une nouveau famille
const createFamille = async (familleData, sequelizeConnection = null) => {
  const code = await familleModel.addFamille(familleData, sequelizeConnection);
  return { code, ...familleData };
};

// Modifier une famille existant
const editFamille = async (id, familleData, sequelizeConnection = null) => {
  const famille = await familleModel.getFamilleById(id, sequelizeConnection);
  if (!famille) {
    throw new Error('famille à modifier non trouvé');
  }
  return await familleModel.updatFamille(id, familleData, sequelizeConnection);
};

// supprimé une famille existant
const deleteFamille = async (id, sequelizeConnection = null) => {
  const famille = await familleModel.getFamilleById(id, sequelizeConnection);
  if (!famille) {
    throw new Error('Famille non trouvé');
  }
  await familleModel.deleteFamille(id, sequelizeConnection);
  return { message: 'Famille supprimé avec succès' };
};


module.exports = {
  createFamille,
  deleteFamille,
  editFamille,
  getFamille,
  getFamilles,
  getUnites

};
