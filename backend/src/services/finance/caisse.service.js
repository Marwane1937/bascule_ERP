const caisseModel = require('../../models/finance/caisse.model');
const { getCompteurFormatePreview } = require('../compteur.service');

// Obtenir tous les documents de caisse
const getCaisseDocuments = async (options = {}, sequelizeConnection = null) => {
  try {
    const result = await caisseModel.getAllCaisseDocuments(options, sequelizeConnection);
    return result;
  } catch (error) {
    throw error;
  }
};

// Obtenir un document de caisse par ID
const getCaisseDocumentById = async (id, sequelizeConnection = null) => {
  try {
    const result = await caisseModel.getCaisseDocumentById(id, sequelizeConnection);
    return result;
  } catch (error) {
    throw error;
  }
};

// Créer un document de caisse
const createCaisseDocument = async (documentData, detailsData) => {
  try {
    // Validation
    if (!documentData.date || !documentData.sens) {
      throw new Error('Données incomplètes : date et sens requis');
    }

    // Validation du champ affectation (obligatoire)
    if (!documentData.affectation || (typeof documentData.affectation === 'string' && documentData.affectation.trim() === '')) {
      throw new Error('Le champ affectation est obligatoire');
    }
    // Permettre la création d'une caisse vide (detailsData peut être vide)
    if (!detailsData) {
      detailsData = [];
    }

    if (documentData.sens !== 1 && documentData.sens !== -1) {
      throw new Error('sens doit être 1 (entrée) ou -1 (sortie)');
    }

    const result = await caisseModel.createCaisseDocument(documentData, detailsData);
    return result;
  } catch (error) {
    throw error;
  }
};

// Mettre à jour un document de caisse
const updateCaisseDocument = async (id, documentData, detailsData) => {
  try {
    if (!detailsData || detailsData.length === 0) {
      throw new Error('Au moins un détail est requis');
    }

    const result = await caisseModel.updateCaisseDocument(id, documentData, detailsData);
    return result;
  } catch (error) {
    throw error;
  }
};

// Clôturer un document
const cloturerCaisseDocument = async (id) => {
  try {
    const result = await caisseModel.cloturerCaisseDocument(id);
    return result;
  } catch (error) {
    throw error;
  }
};

// Supprimer un document
const deleteCaisseDocument = async (id) => {
  try {
    const result = await caisseModel.deleteCaisseDocument(id);
    return result;
  } catch (error) {
    throw error;
  }
};

// Obtenir le solde de caisse
// caisseType: null/'declared' = caisse déclarée, 'black' = caisse black
// onlyNonCloturees: true = uniquement les caisses non clôturées, false = toutes les caisses
const getSoldeCaisse = async (date, sequelizeConnection = null, caisseType = null, onlyNonCloturees = false) => {
  try {
    console.log('[getSoldeCaisse Service] 📥 Calcul solde pour date:', date, 'Type:', caisseType, 'Non clôturées seulement:', onlyNonCloturees);
    const result = await caisseModel.getSoldeCaisse(date, sequelizeConnection, caisseType, onlyNonCloturees);
    console.log('[getSoldeCaisse Service] ✅ Solde calculé:', result);
    return result;
  } catch (error) {
    console.error('[getSoldeCaisse Service] ❌ Erreur:', error);
    console.error('[getSoldeCaisse Service] ❌ Stack:', error.stack);
    throw error;
  }
};

// Vérifier si un règlement existe déjà
const checkReglementExists = async (reglementId) => {
  try {
    const result = await caisseModel.checkReglementExists(reglementId);
    return result;
  } catch (error) {
    throw error;
  }
};

// Obtenir le prochain numéro de caisse
const getNextCaisseNumero = async (prefix, sequelizeConnection = null) => {
  try {
    // Accepter CD, CR, CDB, CRB
    if (prefix !== 'CD' && prefix !== 'CR' && prefix !== 'CDB' && prefix !== 'CRB' && prefix !== 'JC' && prefix !== 'JCB') {
      throw new Error('Prefix doit être CD (caisse dépense), CR (caisse recette), CDB (caisse dépense black) ou CRB (caisse recette black)');
    }

    const codeCompteur = prefix; // Utiliser CD, CR, CDB ou CRB comme code de compteur

    // Récupérer directement depuis la table compteur (sans incrémenter)
    // Le numéro affiché sera la valeur actuelle du compteur + 1
    const numero = await getCompteurFormatePreview(codeCompteur, prefix, sequelizeConnection);

    return { numero };
  } catch (error) {
    console.error('[getNextCaisseNumero] Erreur:', error);
    throw error;
  }
};

// Créer automatiquement un document de caisse depuis un règlement
const createCaisseFromReglement = async (reglementData, lettrages = []) => {
  try {
    // Vérifier si le règlement existe déjà
    const existingId = await caisseModel.checkReglementExists(reglementData.regle_id);
    if (existingId) {
      throw new Error(`Ce règlement a déjà été enregistré en caisse (document ID: ${existingId})`);
    }

    // Préparer les données du document
    const documentData = {
      date: reglementData.date,
      part_id: reglementData.part_id,
      employe_id: reglementData.employe_id || null,
      beneficiaire: reglementData.client_nom || null,
      affectation: String(reglementData.regle_id),
      sens: 1, // Entrée (recette)
      description: `Règlement client - ${reglementData.numero || ''}`,
      user_id: reglementData.user_id || null
    };

    // Préparer les détails depuis les lettrages
    const detailsData = lettrages.map((lettrage, index) => ({
      rubrique_id: null, // À définir selon votre structure
      quantite: 1,
      montant: lettrage.montant,
      description: `Lettrage facture ${lettrage.document_id}`,
      type: 'LETTRAGE',
      etat: 1
    }));

    // Si pas de lettrages, créer un détail avec le montant total
    if (detailsData.length === 0) {
      detailsData.push({
        rubrique_id: null,
        quantite: 1,
        montant: reglementData.montant,
        description: `Règlement ${reglementData.numero || ''}`,
        type: 'REGLEMENT',
        etat: 1
      });
    }

    const result = await caisseModel.createCaisseDocument(documentData, detailsData);
    return result;
  } catch (error) {
    throw error;
  }
};

// Obtenir les données de caisse pour un rapport (avec plage de dates)
const getCaisseDataForReport = async (dateFrom, dateTo, sequelizeConnection = null, caisseType = null) => {
  try {
    console.log('[getCaisseDataForReport Service] 📥 Récupération données pour période:', dateFrom, 'à', dateTo);
    console.log('[getCaisseDataForReport Service] 📊 Type de caisse:', caisseType || 'declared');

    // Utiliser la nouvelle méthode qui filtre directement dans la requête SQL
    const filteredDocuments = await caisseModel.getCaisseDocumentsForReport(dateFrom, dateTo, sequelizeConnection, caisseType);
    console.log(`[getCaisseDataForReport Service] 📋 ${filteredDocuments?.length || 0} documents récupérés`);

    // Calculer les totaux
    let totalEntrees = 0;
    let totalSorties = 0;

    if (filteredDocuments && filteredDocuments.length > 0) {
      filteredDocuments.forEach((doc, index) => {
        const montant = parseFloat(doc.montant || 0);
        if (doc.sens === 1) {
          totalEntrees += montant;
        } else if (doc.sens === -1) {
          totalSorties += montant;
        }
        // logs de debug supprimés
      });
    } else {
    }


    const result = {
      documents: filteredDocuments || [],
      totalEntrees,
      totalSorties,
      dateFrom,
      dateTo
    };


    return result;
  } catch (error) {
    console.error('[getCaisseDataForReport] ❌ ERREUR lors de la récupération des données');
    console.error('[getCaisseDataForReport] Message:', error.message);
    console.error('[getCaisseDataForReport] Stack:', error.stack);
    if (error.original) {
      console.error('[getCaisseDataForReport] Erreur originale:', error.original);
    }
    console.error('[getCaisseDataForReport] ========================================');
    throw error;
  }
};

// Récupérer les données de caisse pour rapport filtré par employé
const getCaisseDataForReportByEmploye = async (dateFrom, dateTo, employeId, sequelizeConnection = null, caisseType = null) => {
  try {
    console.log('[getCaisseDataForReportByEmploye Service] 📥 Récupération données pour période:', dateFrom, 'à', dateTo);
    console.log('[getCaisseDataForReportByEmploye Service] 👤 Employé ID:', employeId);
    console.log('[getCaisseDataForReportByEmploye Service] 📊 Type de caisse:', caisseType || 'declared');

    // Utiliser la nouvelle méthode qui filtre directement dans la requête SQL
    const filteredDocuments = await caisseModel.getCaisseDocumentsForReportByEmploye(dateFrom, dateTo, employeId, sequelizeConnection, caisseType);
    console.log(`[getCaisseDataForReportByEmploye Service] 📋 ${filteredDocuments?.length || 0} documents récupérés`);

    // Calculer les totaux (seulement pour les détails de cet employé)
    let totalEntrees = 0;
    let totalSorties = 0;

    if (filteredDocuments && filteredDocuments.length > 0) {
      // Pour chaque document, récupérer les détails et ne compter que ceux de l'employé
      for (const docItem of filteredDocuments) {
        try {
          const documentData = await caisseModel.getCaisseDocumentById(docItem.id, sequelizeConnection);
          if (documentData && documentData.details && documentData.details.length > 0) {
            // Filtrer les détails pour ne garder que ceux de l'employé
            const employeDetails = documentData.details.filter(detail => detail.employe_id === employeId);
            employeDetails.forEach(detail => {
              const montant = parseFloat(detail.montant || 0);
              const quantite = parseFloat(detail.quantite || 0);
              const total = quantite > 0 ? (quantite * montant) : montant;
              if (docItem.sens === 1) {
                totalEntrees += total;
              } else if (docItem.sens === -1) {
                totalSorties += total;
              }
            });
          }
        } catch (error) {
          console.error(`[getCaisseDataForReportByEmploye Service] ❌ Erreur traitement document ${docItem.id}:`, error.message);
        }
      }
    }

    const result = {
      documents: filteredDocuments || [],
      totalEntrees,
      totalSorties,
      dateFrom,
      dateTo,
      employeId
    };

    return result;
  } catch (error) {
    console.error('[getCaisseDataForReportByEmploye] ❌ ERREUR lors de la récupération des données');
    console.error('[getCaisseDataForReportByEmploye] Message:', error.message);
    console.error('[getCaisseDataForReportByEmploye] Stack:', error.stack);
    if (error.original) {
      console.error('[getCaisseDataForReportByEmploye] Erreur originale:', error.original);
    }
    console.error('[getCaisseDataForReportByEmploye] ========================================');
    throw error;
  }
};

// Récupérer les données de bon de caisse par employé
const getBonDeCaisseByEmploye = async (documentId, employeId, sequelizeConnection = null) => {
  try {
    const result = await caisseModel.getBonDeCaisseByEmploye(documentId, employeId, sequelizeConnection);
    return result;
  } catch (error) {
    throw error;
  }
};

// Récupérer les données de caisse pour rapport rubriques 2000/3000
const getCaisseDataForReportGroup2000_3000 = async (dateFrom, dateTo, sequelizeConnection = null, caisseType = null, rubriqueIds = null) => {
  try {
    console.log('[getCaisseDataForReportGroup2000_3000 Service] 📥 Récupération données pour période:', dateFrom, 'à', dateTo);

    const details = await caisseModel.getCaisseDetailsForReportGroup2000_3000(dateFrom, dateTo, sequelizeConnection, caisseType, rubriqueIds);

    // Séparer en recettes (group_id 2000) et dépenses (group_id 3000)
    const recettes = details.filter(d => d.group_id === 2000);
    const depenses = details.filter(d => d.group_id === 3000);

    // Calculer les totaux
    const totalRecettes = recettes.reduce((sum, d) => sum + ((d.quantite || 0) * (d.montant || 0)), 0);
    const totalDepenses = depenses.reduce((sum, d) => sum + ((d.quantite || 0) * (d.montant || 0)), 0);

    return {
      recettes,
      depenses,
      totalRecettes,
      totalDepenses,
      dateFrom,
      dateTo
    };
  } catch (error) {
    console.error('[getCaisseDataForReportGroup2000_3000 Service] ❌ ERREUR:', error);
    throw error;
  }
};

const createCaisseDocumentV2 = async (documentData, detailsData) => {
  if (!documentData?.date) {
    throw new Error('Données incomplètes : date requise');
  }

  if (!documentData.affectation || (typeof documentData.affectation === 'string' && documentData.affectation.trim() === '')) {
    throw new Error('Le champ affectation est obligatoire');
  }

  const safeDetails = Array.isArray(detailsData) ? detailsData : [];
  const invalidDetail = safeDetails.find((detail) => detail?.sens !== undefined && detail?.sens !== null && detail.sens !== 1 && detail.sens !== -1);
  if (invalidDetail) {
    throw new Error('Chaque ligne de détail doit porter un sens à 1 (recette) ou -1 (dépense)');
  }

  return caisseModel.createCaisseDocument(documentData, safeDetails);
};

const updateCaisseDocumentV2 = async (id, documentData = {}, detailsData = [], sequelizeConnection = null) => {
  if (!Array.isArray(detailsData)) {
    throw new Error('Les détails doivent être fournis sous forme de tableau');
  }

  return caisseModel.updateCaisseDocument(id, documentData, detailsData, sequelizeConnection);
};

const updateCaisseDocumentBySensV2 = async (id, sens, documentData = {}, detailsData = [], sequelizeConnection = null) => {
  if (!Array.isArray(detailsData)) {
    throw new Error('Les détails doivent être fournis sous forme de tableau');
  }

  if (sens !== 1 && sens !== -1) {
    throw new Error('Le sens doit être 1 (recette) ou -1 (dépense)');
  }

  return caisseModel.updateCaisseDocumentBySens(id, sens, documentData, detailsData, sequelizeConnection);
};

const createCaisseFromReglementV2 = async (reglementData, lettrages = []) => {
  const existingId = await caisseModel.checkReglementExists(reglementData.regle_id);
  if (existingId) {
    throw new Error(`Ce règlement a déjà été enregistré en caisse (document ID: ${existingId})`);
  }

  const detailsData = (Array.isArray(lettrages) ? lettrages : []).map((lettrage) => ({
    rubrique_id: null,
    quantite: 1,
    montant: lettrage.montant,
    description: `Lettrage facture ${lettrage.document_id}`,
    type: 'LETTRAGE',
    etat: 1,
    parent: reglementData.regle_id,
    sens: 1
  }));

  if (detailsData.length === 0) {
    detailsData.push({
      rubrique_id: null,
      quantite: 1,
      montant: reglementData.montant,
      description: `Règlement ${reglementData.numero || ''}`,
      type: 'REGLEMENT',
      etat: 1,
      parent: reglementData.regle_id,
      sens: 1
    });
  }

  const documentType = null;
  const existingDayId = await caisseModel.findOpenCaisseDocumentByDate(reglementData.date, documentType, null);

  if (existingDayId) {
    const existingDocument = await caisseModel.getCaisseDocumentById(existingDayId);
    const mergedDetails = [
      ...(existingDocument?.details || []),
      ...detailsData
    ];

    return caisseModel.updateCaisseDocument(existingDayId, {
      description: existingDocument?.description || `Journée caisse ${reglementData.date}`,
      affectation: existingDocument?.affectation || (reglementData.user_name || 'SYSTEME'),
      fond: existingDocument?.fond || 0,
      user_id: reglementData.user_id || null
    }, mergedDetails);
  }

  return caisseModel.createCaisseDocument({
    date: reglementData.date,
    part_id: reglementData.part_id,
    employe_id: reglementData.employe_id || null,
    affectation: reglementData.user_name || 'SYSTEME',
    description: `Journée caisse ${reglementData.date}`,
    fond: 0,
    user_id: reglementData.user_id || null,
    type: documentType
  }, detailsData);
};

const getCaisseDataForReportV2 = async (dateFrom, dateTo, sequelizeConnection = null, caisseType = null) => {
  console.log('[getCaisseDataForReport Service] ðŸ“¥ Récupération données pour période:', dateFrom, 'à', dateTo);
  console.log('[getCaisseDataForReport Service] ðŸ“Š Type de caisse:', caisseType || 'declared');

  const filteredDocuments = await caisseModel.getCaisseDocumentsForReport(dateFrom, dateTo, sequelizeConnection, caisseType);
  let totalEntrees = 0;
  let totalSorties = 0;
  let totalFond = 0;

  for (const doc of filteredDocuments || []) {
    totalFond += parseFloat(doc.fond || 0);
    totalEntrees += parseFloat(doc.total_recettes || 0);
    totalSorties += parseFloat(doc.total_depenses || 0);
  }

  return {
    documents: filteredDocuments || [],
    totalFond,
    totalEntrees,
    totalSorties,
    dateFrom,
    dateTo
  };
};

const getCaisseDataForReportByEmployeV2 = async (dateFrom, dateTo, employeId, sequelizeConnection = null, caisseType = null) => {
  console.log('[getCaisseDataForReportByEmploye Service] ðŸ“¥ Récupération données pour période:', dateFrom, 'à', dateTo);
  console.log('[getCaisseDataForReportByEmploye Service] ðŸ‘¤ Employé ID:', employeId);
  console.log('[getCaisseDataForReportByEmploye Service] ðŸ“Š Type de caisse:', caisseType || 'declared');

  const filteredDocuments = await caisseModel.getCaisseDocumentsForReportByEmploye(dateFrom, dateTo, employeId, sequelizeConnection, caisseType);
  let totalEntrees = 0;
  let totalSorties = 0;

  for (const docItem of filteredDocuments || []) {
    try {
      const documentData = await caisseModel.getCaisseDocumentById(docItem.id, sequelizeConnection);
      const employeDetails = (documentData?.details || []).filter((detail) => detail.employe_id === employeId);
      employeDetails.forEach((detail) => {
        const montant = parseFloat(detail.montant || 0);
        const quantite = parseFloat(detail.quantite || 0);
        const total = quantite > 0 ? (quantite * montant) : montant;

        if (detail.sens === 1) {
          totalEntrees += total;
        } else if (detail.sens === -1) {
          totalSorties += total;
        }
      });
    } catch (error) {
      console.error(`[getCaisseDataForReportByEmploye Service] âŒ Erreur traitement document ${docItem.id}:`, error.message);
    }
  }

  return {
    documents: filteredDocuments || [],
    totalEntrees,
    totalSorties,
    dateFrom,
    dateTo,
    employeId
  };
};

const getBonDeCaisseByEmployeV2 = async (documentId, employeId, sequelizeConnection = null, detailSens = null) => {
  return caisseModel.getBonDeCaisseByEmploye(documentId, employeId, sequelizeConnection, detailSens);
};

module.exports = {
  getCaisseDocuments,
  getCaisseDocumentById,
  createCaisseDocument: createCaisseDocumentV2,
  updateCaisseDocument: updateCaisseDocumentV2,
  updateCaisseDocumentBySens: updateCaisseDocumentBySensV2,
  cloturerCaisseDocument,
  deleteCaisseDocument,
  getSoldeCaisse,
  checkReglementExists,
  createCaisseFromReglement: createCaisseFromReglementV2,
  getNextCaisseNumero,
  getCaisseDataForReport: getCaisseDataForReportV2,
  getCaisseDataForReportByEmploye: getCaisseDataForReportByEmployeV2,
  getBonDeCaisseByEmploye: getBonDeCaisseByEmployeV2,
  getCaisseDataForReportGroup2000_3000
};
