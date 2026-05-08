const livraisonModel = require('../../models/ventes/livraison.model');
const { getCompteurFormate } = require('../compteur.service');
const {
  getVenteDocumentQuillCandidates,
  loadQuillRowsByDocument,
  mergeDetailsWithQuill
} = require('../../models/ventes/quill-table.helper');

// Obtenir toutes les livraisons avec pagination
const getLivraisons = async (options = {}, sequelizeConnection = null) => {
  try {
    const result = await livraisonModel.getAllLivraisons(options, sequelizeConnection);
    // Si le r?sultat contient d?j? data et pagination, le retourner tel quel
    if (result && result.data && result.pagination) {
      return result;
    }
    // Sinon, retourner dans le format attendu
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
    console.error('Erreur dans getLivraisons service:', error);
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

const getLivraisonLocationByNumero = async (numero, options = {}, sequelizeConnection = null) => {
  const location = await livraisonModel.getLivraisonLocationByNumero(numero, options, sequelizeConnection);
  if (!location) {
    throw new Error('Livraison non trouvée');
  }
  return location;
};

// Obtenir toutes les commandes non livr?es (pour la pop-up de transfert)
const getCommandesNonLivrees = async (sequelizeConnection = null) => {
  return await livraisonModel.getAllCommandesNonLivrees(sequelizeConnection);
};

const getCommandeProgress = async (commandeId, sequelizeConnection = null) => {
  return await livraisonModel.getCommandeProgress(commandeId, sequelizeConnection);
};

// Obtenir une livraison par ID
const getLivraison = async (id, sequelizeConnection = null) => {
  const livraison = await livraisonModel.getLivraisonById(id, sequelizeConnection);
  if (!livraison) {
    throw new Error('Livraison non trouv?e');
  }
  return livraison;
};

// G?n?rer le prochain num?ro de livraison avec le compteur (sans incr?menter pour l'affichage)
const getNextLivraisonNumero = async (sequelizeConnection = null) => {
  const { getCompteurFormatePreview } = require('../compteur.service');
  // Utiliser Preview pour ne pas incr?menter avant la cr?ation r?elle
  const numeroFormate = await getCompteurFormatePreview('BLC', 'BL', sequelizeConnection);
  return { numero: numeroFormate };
};

// Cr?er une nouvelle livraison dans stock (avec etat=1 et type=2) - le compteur est g?r? dans addLivraisonFromCommande maintenant
const createLivraison = async (livraisonData, sequelizeConnection = null) => {

  // Passer numero vide pour que addLivraisonFromCommande g?n?re automatiquement depuis le compteur
  const stockId = await livraisonModel.addLivraisonFromCommande({
    numero: '', // Vide pour g?n?ration automatique
    date: livraisonData.date || null,
    description: livraisonData.description || null,
    part_id: livraisonData.part_id || null,
    contact_id: livraisonData.contact_id || null,
    depot_id: livraisonData.depot_id || null,
    type: 2, // Type = 2 pour livraison
    etat: 1, // Etat = 1
    parent: null // Pas de parent pour une livraison cr?e manuellement
  }, sequelizeConnection);


  // R?cup?rer le num?ro depuis la base de donn?es
  const sequelize = sequelizeConnection || require('../../config/database').getConnection();
  const [livraison] = await sequelize.query(
    'SELECT numero FROM stock WHERE id = :id',
    {
      replacements: { id: stockId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const numeroFormate = (Array.isArray(livraison) ? livraison[0]?.numero : livraison?.numero) || '';

  return {
    id: stockId,
    stockId: stockId,
    numero: numeroFormate,
    ...livraisonData
  };
};

// Transf?rer une commande vers une livraison
const transfererCommandeVersLivraison = async (commandeId, sequelizeConnection = null) => {

  // R?cup?rer la commande originale depuis vente_document
  const sequelize = sequelizeConnection || require('../../config/database').getConnection();

  const [commande] = await sequelize.query(
    'SELECT * FROM vente_document WHERE document_id = :id',
    {
      replacements: { id: commandeId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  if (!commande || commande.length === 0) {
    throw new Error('Commande non trouv?e');
  }

  const commandeData = Array.isArray(commande) ? commande[0] : commande;

  // Cr?er la nouvelle livraison dans stock avec type = 2, etat = 1, et parent = document_id de la commande
  // Le compteur est g?r? dans addLivraisonFromCommande maintenant
  const stockId = await livraisonModel.addLivraisonFromCommande({
    numero: '', // Vide pour g?n?ration automatique
    date: commandeData.date,
    description: commandeData.description,
    part_id: commandeData.part_id,
    contact_id: commandeData.contact_id,
    depot_id: commandeData.depot_id || commandeData.adresse_id || null,
    type: 2, // Type = 2 pour livraison depuis commande
    etat: 1, // Etat = 1
    parent: commandeId // Stocker le document_id de la commande dans parent
  }, sequelizeConnection);

  // R?cup?rer le num?ro depuis la base de donn?es
  const [livraisonResult] = await sequelize.query(
    'SELECT numero FROM stock WHERE id = :id',
    {
      replacements: { id: stockId },
      type: sequelize.QueryTypes.SELECT
    }
  );
  const livraisonData = Array.isArray(livraisonResult) ? livraisonResult[0] : livraisonResult;
  const numeroFormate = livraisonData?.numero || '';

  // Copier les d?tails de la commande dans stock_detail
  // Sequelize avec QueryTypes.SELECT retourne directement le tableau de r?sultats (comme dans devis.model.js)
  const details = await sequelize.query(
    'SELECT * FROM vente_document_detail WHERE document_id = :id',
    {
      replacements: { id: commandeId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  if (!Array.isArray(details)) {
    console.error('Erreur Erreur: details n\'est pas un tableau. Type:', typeof details, 'Valeur:', JSON.stringify(details));
    throw new Error('Erreur lors de la r?cup?ration des d?tails de la commande: details is not iterable');
  }

  if (details.length === 0) {
    console.warn('Attention Aucun d?tail trouv? pour la commande:', commandeId);
  } else {
  }

  const detailsWithDesignation = mergeDetailsWithQuill(
    details,
    await loadQuillRowsByDocument(sequelize, commandeId, getVenteDocumentQuillCandidates(2)),
    {
      detailIdField: 'id',
      designationField: 'designation',
      fallbackFields: ['description']
    }
  );

  for (const detail of detailsWithDesignation) {
    await livraisonModel.saveDetailStock({
      stock_id: stockId,
      article_id: detail.article_id,
      quantite: detail.quantite || detail.qte || 0,
      prix: detail.prix || detail.pu || 0,
      taux_tva: detail.taux_tva || detail.tva || 0,
      description: detail.designation || detail.description || '',
      remise: detail.remise != null ? detail.remise : 0,
      remise_montant: detail.remise_montant != null ? detail.remise_montant : 0
    }, sequelizeConnection);
  }


  return {
    stockId,
    numero: numeroFormate
  };
};

// Mettre ? jour une livraison
const updateLivraison = async (id, livraisonData, sequelizeConnection = null) => {
  await livraisonModel.updateLivraison(id, livraisonData, sequelizeConnection);
  return await livraisonModel.getLivraisonById(id, sequelizeConnection);
};

// Sauvegarder les d?tails d'une livraison (traitement en lot)
const saveDetail = async ({ lignes }, sequelizeConnection = null) => {
  return await livraisonModel.saveDetailLines(lignes, sequelizeConnection);
};

const saveComposition = async ({ documentId, lignes }, sequelizeConnection = null) => {
  return await livraisonModel.saveCompositionLines(documentId, lignes, sequelizeConnection);
};

const saveLots = async ({ documentId, lignes }, sequelizeConnection = null) => {
  return await livraisonModel.saveLotDetailLines(documentId, lignes, sequelizeConnection);
};

// Sauvegarder les informations d'une livraison
const saveInfo = async (info, sequelizeConnection = null) => {
  return await livraisonModel.saveInfo(info, sequelizeConnection);
};

// Supprimer une livraison
const deleteLivraison = async (ids, sequelizeConnection = null) => {
  await livraisonModel.deleteLivraison(ids, sequelizeConnection);
};

// Supprimer des lignes de d?tail
const deleteLignesParIds = async (ligneIds, sequelizeConnection = null) => {
  await livraisonModel.deleteLignesParIds(ligneIds, sequelizeConnection);
};

// R?cup?rer les donn?es de la livraison pour la popup
const getLivraisonDataForTransfer = async (stockId, sequelizeConnection = null) => {
  return await livraisonModel.getLivraisonDataForTransfer(stockId, sequelizeConnection);
};

// Transf?rer une livraison vers la facturation
const transfererLivraisonVersFacturation = async (stockId, factureDate, partId, sequelizeConnection = null) => {
  return await livraisonModel.transfererLivraisonVersFacturation(stockId, factureDate, partId, sequelizeConnection);
};

const transfererLivraisonsVersFacturation = async (stockIds, factureDate, partId, sequelizeConnection = null) => {
  return await livraisonModel.transfererLivraisonsVersFacturation(stockIds, factureDate, partId, sequelizeConnection);
};
// Transf?rer une commande vers la facturation (cr?e deux fois dans stock/stock_detail ET dans facture/facture_souche)
const transfererCommandeVersFacturation = async (commandeId, factureDate, partId, sequelizeConnection = null) => {
  return await livraisonModel.transfererCommandeVersFacturation(commandeId, factureDate, partId, sequelizeConnection);
};

module.exports = {
  getLivraisons,
  getLivraisonLocationByNumero,
  getCommandesNonLivrees,
  getCommandeProgress,
  getLivraison,
  getNextLivraisonNumero,
  getLivraisonDataForTransfer,
  createLivraison,
  transfererCommandeVersLivraison,
  transfererLivraisonVersFacturation,
  transfererLivraisonsVersFacturation,
  updateLivraison,
  saveDetail,
  saveComposition,
  saveLots,
  saveInfo,
  deleteLivraison,
  deleteLignesParIds,
  transfererCommandeVersFacturation
};

