const avoirModel = require('../../models/ventes/avoir.model');
const { getCompteurFormatePreview } = require('../compteur.service');

// Obtenir tous les avoirs avec pagination
const getAvoirs = async (options = {}, sequelizeConnection = null) => {
  try {
    const result = await avoirModel.getAllAvoirs(options, sequelizeConnection);
    if (result && result.data && result.pagination) {
      return result;
    }
    const data = Array.isArray(result) ? result : [];
    return {
      data: data,
      pagination: {
        total: data.length,
        page: 1,
        pageSize: data.length,
        totalPages: 1
      }
    };
  } catch (error) {
    console.error('Erreur dans getAvoirs service:', error);
    return {
      data: [],
      pagination: {
        total: 0,
        page: 1,
        pageSize: 25,
        totalPages: 0
      }
    };
  }
};

// Obtenir un avoir par ID
const getAvoir = async (id, sequelizeConnection = null) => {
  const avoir = await avoirModel.getAvoirById(id, sequelizeConnection);
  if (!avoir) {
    throw new Error('Avoir non trouvé');
  }
  return avoir;
};

// Générer le prochain numéro d'avoir avec le compteur (sans incrémenter pour l'affichage)
const getNextAvoirNumero = async (sequelizeConnection = null) => {
  // Utiliser Preview pour ne pas incrémenter avant la création réelle
  const numeroFormate = await getCompteurFormatePreview('AV', 'AV', sequelizeConnection);
  return { numero: numeroFormate };
};

// Créer un avoir financier
const createAvoirFinancier = async (avoirData, sequelizeConnection = null) => {

  const avoir = await avoirModel.createAvoirFinancier({
    facture_id: avoirData.facture_id || null,
    part_id: avoirData.part_id || null,
    date: avoirData.date || new Date(),
    montant_ht: avoirData.montant_ht || 0,
    montant_tva: avoirData.montant_tva || 0,
    description: avoirData.description || null,
    adresse_id: avoirData.adresse_id || null
  }, sequelizeConnection);


  return avoir;
};

// Créer un avoir marchandise
const createAvoirMarchandise = async (avoirData, sequelizeConnection = null) => {

  const avoir = await avoirModel.createAvoirMarchandise({
    retour_id: avoirData.retour_id || null,
    part_id: avoirData.part_id || null,
    date: avoirData.date || new Date(),
    adresse_id: avoirData.adresse_id || null
  }, sequelizeConnection);


  return avoir;
};

// Mettre à jour un avoir
const updateAvoir = async (id, avoirData, sequelizeConnection = null) => {
  await avoirModel.updateAvoir(id, avoirData, sequelizeConnection);
  return await avoirModel.getAvoirById(id, sequelizeConnection);
};

// Supprimer un avoir
const deleteAvoir = async (ids, sequelizeConnection = null) => {
  await avoirModel.deleteAvoir(ids, sequelizeConnection);
};

module.exports = {
  getAvoirs,
  getAvoir,
  getNextAvoirNumero,
  createAvoirFinancier,
  createAvoirMarchandise,
  updateAvoir,
  deleteAvoir
};



