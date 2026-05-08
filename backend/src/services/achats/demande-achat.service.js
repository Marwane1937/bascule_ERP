const demandeAchatModel = require('../../models/achats/demande-achat.model');
const demandeAchatPdfService = require('./demande-achat-pdf.service');
const documentSocieteService = require('../document_societe.service');
const devisHtmlPdfService = require('../devis-html-pdf.service');
const fs = require('fs');
const path = require('path');

// Obtenir toutes les demandes d'achat avec pagination
const getDemandeAchat = async (options = {}, sequelizeConnection = null) => {
  return await demandeAchatModel.getAllDemandeAchat(options, sequelizeConnection);
};

// Obtenir une demande d'achat par ID
const getDemandeAchatById = async (id) => {
  const demandeAchat = await demandeAchatModel.getDemandeAchatById(id);
  if (!demandeAchat) {
    throw new Error('Demande d\'achat non trouvée');
  }
  return demandeAchat;
};

// Créer une nouvelle demande d'achat (type = 0)
const createDemandeAchat = async (demandeAchatData) => {
  const result = await demandeAchatModel.addDemandeAchat({ 
    ...demandeAchatData, 
    numero: '', 
    etat: 1,
    type: 0  // Forcer type = 0 pour demande d'achat
  });
  return {
    id: result.document_id,
    numero: result.numero,
    ...demandeAchatData
  };
};

// Générer le prochain numéro de demande d'achat
const getNextDemandeAchatNumero = async () => {
  const { getCompteurFormatePreview } = require('../compteur.service');
  const numeroFormate = await getCompteurFormatePreview('DA', 'DA');
  return { numero: numeroFormate };
};

// Créer un nouveau détail de demande d'achat
const saveDetail = async (detailData) => {
  return await demandeAchatModel.saveDetail(detailData);
};

// Créer/sauvegarder les infos de demande d'achat
const saveInfo = async (infoData) => {
  return await demandeAchatModel.saveInfo(infoData);
};

// Modifier une demande d'achat
const updateDemandeAchat = async (id, demandeAchatData) => {
  const demandeAchat = await demandeAchatModel.getDemandeAchatById(id);
  if (!demandeAchat) {
    throw new Error('Demande d\'achat à modifier non trouvée');
  }
  return await demandeAchatModel.updateDemandeAchat(id, demandeAchatData);
};

// Supprimer une demande d'achat
const deleteDemandeAchat = async (id) => {
  const demandeAchat = await demandeAchatModel.getDemandeAchatById(id);
  if (!demandeAchat) {
    throw new Error('Demande d\'achat à supprimer non trouvée');
  }
  await demandeAchatModel.deleteDemandeAchat(id);
  return { success: true, message: 'Demande d\'achat supprimée avec succès' };
};

// Supprimer des lignes par IDs
const deleteLignesParIds = async (ids) => {
  return await demandeAchatModel.deleteLignesParIds(ids);
};

// Générer le PDF de la demande d'achat
const genererPDF = async (id, options = {}) => {
  // Récupérer les données de la demande d'achat
  const demandeAchatData = await demandeAchatModel.getDemandeAchatForPDF(id);
  
  if (!demandeAchatData || demandeAchatData.length === 0) {
    throw new Error('Demande d\'achat non trouvée ou sans lignes');
  }
  
  // Récupérer les informations depuis le fichier JSON de configuration
  const pdfConfigService = require('../pdf-config.service');
  const documentSociete = pdfConfigService.getDocumentSociete();
  
  // Générer le PDF
  const demandeDir = path.join(__dirname, '..', '..', 'public', 'demandes-achat');
  if (!fs.existsSync(demandeDir)) {
    fs.mkdirSync(demandeDir, { recursive: true });
  }

  try {
    const pdfBuffer = await devisHtmlPdfService.generatePdfBuffer(demandeAchatData, {
      ...options,
      documentSociete,
      forceDocumentType: 'DEMANDE_ACHAT'
    });

    const numeroDoc = (demandeAchatData[0]?.numero || `DA-${id}`).toString().replace(/[^\w\-]+/g, '_');
    const fileName = `demande-achat-${numeroDoc}-${Date.now()}.pdf`;
    const pdfPath = path.join(demandeDir, fileName);
    fs.writeFileSync(pdfPath, pdfBuffer);
    return pdfPath;
  } catch (error) {
    return await demandeAchatPdfService.genererPDF(demandeAchatData, {
      ...options,
      documentSociete
    });
  }
};

// Récupérer les demandes d'achat non transformées en bon de commande
const getDemandesAchatNonTransformees = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || require('../../config/database').getConnection();
  try {
    const query = `
      WITH da AS (
        SELECT document_id
        FROM achat_document
        WHERE type = 0
      )
      SELECT DISTINCT 
        a.document_id, 
        a.numero, 
        a.date, 
        a.description, 
        p.nom AS fournisseur,
        p.part_id
      FROM da
      INNER JOIN achat_document a ON a.document_id = da.document_id
      INNER JOIN partenaire p ON p.part_id = a.part_id AND p.type = 2
      LEFT JOIN achat_document bc
        ON bc.parent = da.document_id
        AND bc.type = 2  
      WHERE bc.document_id IS NULL
      ORDER BY a.date DESC
    `;

    const results = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT
    });

    // Gérer le format de retour de Sequelize pour SQL Server
    let demandeAchats;
    if (Array.isArray(results)) {
      if (results.length > 0 && Array.isArray(results[0])) {
        demandeAchats = results[0];
      } else {
        demandeAchats = results;
      }
    } else if (results && typeof results === 'object') {
      demandeAchats = [results];
    } else {
      demandeAchats = [];
    }
    
    return demandeAchats;
  } catch (error) {
    console.error('[getDemandesAchatNonTransformees] Erreur:', error);
    throw error;
  }
};

module.exports = {
  getDemandeAchat,
  getDemandeAchatById,
  createDemandeAchat,
  getNextDemandeAchatNumero,
  saveDetail,
  saveInfo,
  updateDemandeAchat,
  deleteDemandeAchat,
  deleteLignesParIds,
  genererPDF,
  getDemandesAchatNonTransformees
};
