const retourModel = require('../../models/ventes/retour.model');
const { getCompteurFormate } = require('../compteur.service');

// Obtenir tous les retours avec pagination
const getRetours = async (options = {}, sequelizeConnection = null) => {
  try {
    const result = await retourModel.getAllRetours(options, sequelizeConnection);
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
    console.error('Erreur dans getRetours service:', error);
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

// Obtenir un retour par ID
const getRetour = async (id, sequelizeConnection = null) => {
  const retour = await retourModel.getRetourById(id, sequelizeConnection);
  if (!retour) {
    throw new Error('Retour non trouvé');
  }
  return retour;
};

// Générer le prochain numéro de retour avec le compteur (sans incrémenter pour l'affichage)
const getNextRetourNumero = async (sequelizeConnection = null) => {
  const { getCompteurFormatePreview } = require('../compteur.service');
  // Utiliser Preview pour ne pas incrémenter avant la création réelle
  const numeroFormate = await getCompteurFormatePreview('BLC', 'RT', sequelizeConnection);
  return { numero: numeroFormate };
};

// Créer un nouveau retour dans stock (avec etat=1 et type=5)
const createRetour = async (retourData, sequelizeConnection = null) => {

  // Passer numero vide pour que addRetourFromCommande génère automatiquement depuis le compteur
  const stockId = await retourModel.addRetourFromCommande({
    numero: '', // Vide pour génération automatique
    date: retourData.date || null,
    description: retourData.description || null,
    part_id: retourData.part_id || null,
    contact_id: retourData.contact_id || null,
    type: 5, // Type = 5 pour retour
    etat: 1, // État = 1
    parent: null // Pas de parent pour un retour créé manuellement
  }, sequelizeConnection);


  // Récupérer le numéro depuis la base de données
  const { getConnection } = require('../../config/database');
  const sequelize = sequelizeConnection || getConnection();
  const [retour] = await sequelize.query(
    'SELECT numero FROM stock WHERE id = :id',
    {
      replacements: { id: stockId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const numeroFormate = (Array.isArray(retour) ? retour[0]?.numero : retour?.numero) || '';

  return {
    id: stockId,
    stockId: stockId,
    numero: numeroFormate,
    ...retourData
  };
};

// Mettre à jour un retour
const updateRetour = async (id, retourData, sequelizeConnection = null) => {
  await retourModel.updateRetour(id, retourData, sequelizeConnection);
  return await retourModel.getRetourById(id, sequelizeConnection);
};

// Sauvegarder les détails d'un retour (traitement en lot)
const saveDetail = async ({ lignes }, sequelizeConnection = null) => {
  return await retourModel.saveDetailLines(lignes, sequelizeConnection);
};

// Sauvegarder les informations d'un retour
const saveInfo = async (info, sequelizeConnection = null) => {
  return await retourModel.saveInfo(info, sequelizeConnection);
};

// Supprimer un retour
const deleteRetour = async (ids, sequelizeConnection = null) => {
  await retourModel.deleteRetour(ids, sequelizeConnection);
};

// Supprimer des lignes de détail
const deleteLignesParIds = async (ligneIds, sequelizeConnection = null) => {
  await retourModel.deleteLignesParIds(ligneIds, sequelizeConnection);
};

module.exports = {
  getRetours,
  getRetour,
  getNextRetourNumero,
  createRetour,
  updateRetour,
  saveDetail,
  saveInfo,
  deleteRetour,
  deleteLignesParIds
};



