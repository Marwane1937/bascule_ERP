const bonCommandeModel = require('../../models/achats/bon-commande.model');
const demandeAchatModel = require('../../models/achats/demande-achat.model');
const { getCompteurFormate } = require('../compteur.service');
const bonCommandePdfService = require('./bon-commande-pdf.service');
const documentSocieteService = require('../document_societe.service');

// Obtenir tous les bons de commande avec pagination
const getBonCommande = async (options = {}, sequelizeConnection = null) => {
  return await bonCommandeModel.getAllBonCommande(options, sequelizeConnection);
};

// Obtenir un bon de commande par ID
const getBonCommandeById = async (id) => {
  const bonCommande = await bonCommandeModel.getBonCommandeById(id);
  if (!bonCommande) {
    throw new Error('Bon de commande non trouvé');
  }
  return bonCommande;
};

// Créer un nouveau bon de commande (type = 2)
const createBonCommande = async (bonCommandeData) => {
  const result = await bonCommandeModel.addBonCommande({ 
    ...bonCommandeData, 
    numero: '', 
    etat: 1,
    type: 2  // Forcer type = 2 pour bon de commande
  });
  return {
    id: result.document_id,
    numero: result.numero,
    ...bonCommandeData
  };
};

// Générer le prochain numéro de bon de commande
const getNextBonCommandeNumero = async () => {
  const { getCompteurFormatePreview } = require('../compteur.service');
  const numeroFormate = await getCompteurFormatePreview('BCF', 'BCF');
  return { numero: numeroFormate };
};

// Créer un nouveau détail de bon de commande
const saveDetail = async (detailData) => {
  return await bonCommandeModel.saveDetail(detailData);
};

// Créer/sauvegarder les infos de bon de commande
const saveInfo = async (infoData) => {
  return await bonCommandeModel.saveInfo(infoData);
};

// Modifier un bon de commande
const updateBonCommande = async (id, bonCommandeData) => {
  const bonCommande = await bonCommandeModel.getBonCommandeById(id);
  if (!bonCommande) {
    throw new Error('Bon de commande à modifier non trouvé');
  }
  return await bonCommandeModel.updateBonCommande(id, bonCommandeData);
};

// Supprimer un bon de commande
const deleteBonCommande = async (id) => {
  const bonCommande = await bonCommandeModel.getBonCommandeById(id);
  if (!bonCommande) {
    throw new Error('Bon de commande à supprimer non trouvé');
  }
  await bonCommandeModel.deleteBonCommande(id);
  return { success: true, message: 'Bon de commande supprimé avec succès' };
};

// Supprimer des lignes par IDs
const deleteLignesParIds = async (ids) => {
  return await bonCommandeModel.deleteLignesParIds(ids);
};

// Générer le PDF du bon de commande
const genererPDF = async (id, options = {}) => {
  // Récupérer les données du bon de commande
  const commandeData = await bonCommandeModel.getBonCommandeForPDF(id);
  
  if (!commandeData || commandeData.length === 0) {
    throw new Error('Bon de commande non trouvé ou sans lignes');
  }
  
  // Récupérer les informations depuis le fichier JSON de configuration
  const pdfConfigService = require('../pdf-config.service');
  const documentSociete = pdfConfigService.getDocumentSociete();
  
  // Générer le PDF
  const pdfPath = await bonCommandePdfService.genererPDF(commandeData, {
    ...options,
    documentSociete
  });
  
  return pdfPath;
};

// Transformer une demande d'achat en bon de commande avec les prix
const transformerDemandeAchatEnBonCommande = async (demandeAchatId, lignesAvecPrix) => {
  const sequelize = require('../../config/database').getConnection();
  
  return await sequelize.transaction(async (t) => {
    try {
      // 1. Récupérer la demande d'achat
      const demandeAchat = await demandeAchatModel.getDemandeAchatById(demandeAchatId);
      if (!demandeAchat) {
        throw new Error('Demande d\'achat non trouvée');
      }

      // 2. Vérifier qu'elle n'a pas déjà été transformée
      const checkQuery = `
        SELECT COUNT(*) as count 
        FROM achat_document 
        WHERE parent = :demandeAchatId AND type = 2
      `;
      const [checkResult] = await sequelize.query(checkQuery, {
        replacements: { demandeAchatId },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      });
      
      if (checkResult && checkResult.count > 0) {
        throw new Error('Cette demande d\'achat a déjà été transformée en bon de commande');
      }

      // 3. Créer le bon de commande avec parent = demandeAchatId
      // S'assurer que la date est au bon format
      let dateValue = demandeAchat.date;
      if (!dateValue) {
        dateValue = new Date().toISOString();
      } else if (dateValue instanceof Date) {
        dateValue = dateValue.toISOString();
      } else if (typeof dateValue !== 'string') {
        dateValue = String(dateValue);
      }
      
      const bonCommandeData = {
        date: dateValue,
        description: demandeAchat.description || '',
        part_id: demandeAchat.part_id,
        type: 2,
        parent: demandeAchatId
      };

      // Passer la transaction à addBonCommande pour qu'elle utilise la même transaction
      const bonCommande = await bonCommandeModel.addBonCommande(bonCommandeData, t);
      
      // S'assurer que le document_id est correctement récupéré
      // addBonCommande retourne { document_id: ..., numero: ... }
      const bonCommandeId = bonCommande?.document_id;
      
      if (!bonCommandeId) {
        console.error('[transformerDemandeAchatEnBonCommande] Résultat addBonCommande:', bonCommande);
        throw new Error('Impossible de récupérer le document_id du bon de commande créé');
      }
      
      console.log('[transformerDemandeAchatEnBonCommande] Bon de commande créé avec document_id:', bonCommandeId);

      // 4. Créer les détails du bon de commande avec les prix
      // Utiliser directement les lignesAvecPrix envoyées (déjà filtrées pour exclure les lignes supprimées)
      for (const ligneAvecPrix of lignesAvecPrix) {
        if (!ligneAvecPrix.prix || ligneAvecPrix.prix <= 0) {
          throw new Error(`Prix manquant ou invalide pour l'article ${ligneAvecPrix.article_cod || ligneAvecPrix.article_id}`);
        }

        const prixValue = parseFloat(ligneAvecPrix.prix);
        const detailData = {
          document_id: bonCommandeId, // Utiliser le nouveau document_id créé
          article_id: ligneAvecPrix.article_id,
          designation: ligneAvecPrix.designation || '',
          qte: ligneAvecPrix.quantite || ligneAvecPrix.qte || 0,
          prix: prixValue,
          remise: parseFloat(ligneAvecPrix.remise) || 0,
          taux_tva: parseFloat(ligneAvecPrix.taux_tva) || 0.2
        };

        console.log('[transformerDemandeAchatEnBonCommande] Insertion détail avec document_id:', bonCommandeId, 'prix:', prixValue, 'detailData:', detailData);
        await bonCommandeModel.saveDetail(detailData, t);
      }

      // 5. Les infos ne sont plus copiées automatiquement dans achat_document_info

      return {
        success: true,
        bonCommandeId: bonCommandeId,
        numero: bonCommande.numero,
        message: 'Demande d\'achat transformée en bon de commande avec succès'
      };
    } catch (error) {
      console.error('[transformerDemandeAchatEnBonCommande] Erreur:', error);
      throw error;
    }
  });
};

module.exports = {
  getBonCommande,
  getBonCommandeById,
  createBonCommande,
  getNextBonCommandeNumero,
  saveDetail,
  saveInfo,
  updateBonCommande,
  deleteBonCommande,
  deleteLignesParIds,
  genererPDF,
  transformerDemandeAchatEnBonCommande
};

