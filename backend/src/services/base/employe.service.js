const employeModel = require('../../models/base/employe.model');

// Obtenir tous les employés
const getEmployes = async (sequelizeConnection = null) => {
  try {
    const employes = await employeModel.getAllEmployes(sequelizeConnection);
    return employes;
  } catch (error) {
    console.error('[employe.service.js] ❌ Erreur récupération employés:', error);
    console.error('[employe.service.js] ❌ Stack:', error.stack);
    throw error;
  }
};

const getEmployesAutocomplete = async (sequelizeConnection = null) => {
  try {
    return await employeModel.getEmployesAutocomplete(sequelizeConnection);
  } catch (error) {
    console.error('[employe.service.js] Erreur autocomplete employes:', error);
    throw error;
  }
};

// Obtenir un employé par ID
const getEmploye = async (id) => {
  const employe = await employeModel.getEmployeById(id);
  if (!employe) {
    throw new Error('Employé non trouvé');
  }
  return employe;
};

// Créer un nouveau employé
const createEmploye = async (employeData) => {
  const id = await employeModel.addEmploye(employeData);
  return { id, ...employeData };
};

// Modifier un employé existant
const editEmploye = async (id, employeData) => {
  const employe = await employeModel.getEmployeById(id);
  if (!employe) {
    throw new Error('Employé à modifier non trouvé');
  }
  return await employeModel.updateEmploye(id, employeData);
};

// Supprimer un employé
const deleteEmploye = async (id) => {
  const employe = await employeModel.getEmployeById(id);
  if (!employe) {
    throw new Error('Employé non trouvé');
  }
  await employeModel.deleteEmploye(id);
  return { message: 'Employé supprimé avec succès' };
};

// Obtenir tous les employés actifs (etat = 1)
const getEmployesActifs = async (sequelizeConnection = null) => {
  try {
    const employes = await employeModel.getEmployesActifs(sequelizeConnection);
    return employes;
  } catch (error) {
    console.error('❌ Erreur récupération employés actifs:', error);
    throw error;
  }
};

// Obtenir un employé par ID avec son téléphone
const getEmployeByIdWithPhone = async (id) => {
  try {
    const employe = await employeModel.getEmployeByIdWithPhone(id);
    return employe;
  } catch (error) {
    console.error('❌ Erreur récupération employé avec téléphone:', error);
    throw error;
  }
};

// Obtenir le téléphone d'un employé par ID
const getEmployeTelephone = async (id) => {
  try {
    const result = await employeModel.getEmployeTelephone(id);
    return result;
  } catch (error) {
    console.error('❌ Erreur récupération téléphone employé:', error);
    throw error;
  }
};

module.exports = {
  getEmployes,
  getEmployesAutocomplete,
  getEmploye,
  createEmploye,
  editEmploye,
  deleteEmploye,
  getEmployesActifs,
  getEmployeByIdWithPhone,
  getEmployeTelephone
};

