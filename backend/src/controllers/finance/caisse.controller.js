const caisseService = require('../../services/finance/caisse.service');
const databaseSwitchService = require('../../services/database-switch.service');

// Obtenir tous les documents de caisse
const getCaisseDocuments = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 25;
    const orderBy = req.query.orderBy || 'date';
    const orderDirection = req.query.orderDirection || 'DESC';
    const search = req.query.search || '';
    const sens = req.query.sens ? parseInt(req.query.sens) : null; // 1 = recettes, -1 = dépenses
    // Gérer le type : si 'null' est envoyé comme string, le convertir en null
    let type = null;
    if (req.query.type !== undefined) {
      if (req.query.type === 'null' || req.query.type === null || req.query.type === '') {
        type = null; // Caisse déclarée
      } else {
        type = parseInt(req.query.type); // 1 = CDB, 2 = CRB
      }
    }


    const options = {
      page,
      pageSize,
      orderBy,
      orderDirection,
      search,
      sens,
      type
    };

    const result = await caisseService.getCaisseDocuments(options, sequelize);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors du chargement des documents de caisse',
      data: [],
      pagination: {
        page: parseInt(req.query.page) || 1,
        pageSize: parseInt(req.query.pageSize) || 25,
        total: 0,
        totalPages: 0
      }
    });
  }
};

// Obtenir un document de caisse par ID
const getCaisseDocumentById = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const id = parseInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    const result = await caisseService.getCaisseDocumentById(id, sequelize);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Document non trouvé' });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Erreur lors de la récupération du document' });
  }
};

// Créer un document de caisse
const createCaisseDocument = async (req, res) => {
  try {
    const { document, details } = req.body;

    if (!document) {
      return res.status(400).json({
        success: false,
        message: 'Document requis'
      });
    }

    // Permettre un tableau de détails vide (caisse créée sans détails initialement)
    // Si details n'est pas fourni ou est null/undefined, le convertir en tableau vide
    let detailsArray = [];
    if (details !== undefined && details !== null) {
      if (!Array.isArray(details)) {
        return res.status(400).json({
          success: false,
          message: 'Details doit être un tableau (peut être vide)'
        });
      }
      detailsArray = details;
    }

    if (document.sens !== 1 && document.sens !== -1) {
      return res.status(400).json({
        success: false,
        message: 'sens doit être 1 (entrée) ou -1 (sortie)'
      });
    }

    // Validation des champs requis
    if (!document.date) {
      return res.status(400).json({
        success: false,
        message: 'La date est requise'
      });
    }

    // Validation du champ affectation (obligatoire)
    if (!document.affectation || document.affectation.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Le champ affectation est obligatoire'
      });
    }

    // Ajouter user_id depuis la requête si disponible
    if (req.user && req.user.id) {
      document.user_id = req.user.id;
    }

    const result = await caisseService.createCaisseDocument(document, detailsArray);
    res.status(201).json({
      success: true,
      data: result,
      message: 'Document de caisse créé avec succès'
    });
  } catch (err) {
    // Si c'est une erreur de validation, retourner 400 au lieu de 500
    const statusCode = err.message && (err.message.includes('requis') || err.message.includes('invalide')) ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: err.message || 'Erreur lors de la création du document'
    });
  }
};

// Mettre à jour un document de caisse
const updateCaisseDocument = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    const { document, details } = req.body;

    if (!details || !Array.isArray(details) || details.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Au moins un détail est requis'
      });
    }

    // Log pour déboguer employe_id
    details.forEach((d, idx) => {
    });

    // Ajouter user_id depuis la requête si disponible
    if (req.user && req.user.id && document) {
      document.user_id = req.user.id;
    }

    const result = await caisseService.updateCaisseDocument(id, document || {}, details);
    res.json({
      success: true,
      data: result,
      message: 'Document modifié avec succès'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la modification du document'
    });
  }
};

// Clôturer un document
const cloturerCaisseDocument = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    await caisseService.cloturerCaisseDocument(id);
    res.json({
      success: true,
      message: 'Document clôturé avec succès'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la clôture du document'
    });
  }
};

// Supprimer un document
const deleteCaisseDocument = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    await caisseService.deleteCaisseDocument(id);
    res.json({
      success: true,
      message: 'Document supprimé avec succès'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la suppression du document'
    });
  }
};

// Obtenir le solde de caisse
const getSoldeCaisse = async (req, res) => {
  try {
    console.log('[getSoldeCaisse Controller] 📥 Requête reçue, query params:', req.query);
    let date = req.query.date || new Date().toISOString().split('T')[0];
    const caisseType = req.query.type || null; // 'black' ou 'declared' ou null
    // Paramètre pour filtrer uniquement les caisses non clôturées
    const onlyNonCloturees = req.query.onlyNonCloturees === 'true' || req.query.onlyNonCloturees === true;
    
    // S'assurer que la date est au bon format (YYYY-MM-DD)
    if (date && typeof date === 'string') {
      // Si la date est au format DD/MM/YYYY, la convertir
      if (date.includes('/')) {
        const [day, month, year] = date.split('/');
        date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
    
    console.log('[getSoldeCaisse Controller] 📅 Date utilisée:', date, 'Type caisse:', caisseType, 'Non clôturées seulement:', onlyNonCloturees);
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const result = await caisseService.getSoldeCaisse(date, sequelize, caisseType, onlyNonCloturees);
    console.log('[getSoldeCaisse Controller] ✅ Résultat:', result);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[getSoldeCaisse Controller] ❌ Erreur:', err);
    console.error('[getSoldeCaisse Controller] ❌ Stack:', err.stack);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors du calcul du solde',
      data: {
        total_fond: 0,
        total_entrees: 0,
        total_sorties: 0,
        solde: 0
      },
      error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// Obtenir le prochain numéro de caisse
const getNextCaisseNumero = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const prefix = req.params.prefix?.toUpperCase();
    
    if (!prefix || (prefix !== 'CD' && prefix !== 'CR' && prefix !== 'CDB' && prefix !== 'CRB' && prefix !== 'JC' && prefix !== 'JCB')) {
      return res.status(400).json({
        success: false,
        message: 'Prefix doit être CD (caisse dépense), CR (caisse recette), CDB (caisse dépense black) ou CRB (caisse recette black)'
      });
    }

    const result = await caisseService.getNextCaisseNumero(prefix, sequelize);
    const numero = result?.numero || result;
    
    res.json({
      success: true,
      numero: numero
    });
  } catch (err) {
    console.error('[getNextCaisseNumero] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération du prochain numéro'
    });
  }
};

// Créer un document de caisse depuis un règlement
const createCaisseFromReglement = async (req, res) => {
  try {
    const { reglement, lettrages } = req.body;

    if (!reglement) {
      return res.status(400).json({
        success: false,
        message: 'Données du règlement requises'
      });
    }

    // Ajouter user_id depuis la requête si disponible
    if (req.user && req.user.id) {
      reglement.user_id = req.user.id;
    }

    const result = await caisseService.createCaisseFromReglement(reglement, lettrages || []);
    res.status(201).json({
      success: true,
      data: result,
      message: 'Document de caisse créé depuis le règlement avec succès'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la création du document depuis le règlement'
    });
  }
};

const createCaisseDocumentV2 = async (req, res) => {
  try {
    const { document, details } = req.body;

    if (!document) {
      return res.status(400).json({
        success: false,
        message: 'Document requis'
      });
    }

    const detailsArray = details === undefined || details === null
      ? []
      : details;

    if (!Array.isArray(detailsArray)) {
      return res.status(400).json({
        success: false,
        message: 'Details doit être un tableau (peut être vide)'
      });
    }

    if (!document.date) {
      return res.status(400).json({
        success: false,
        message: 'La date est requise'
      });
    }

    if (!document.affectation || String(document.affectation).trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Le champ affectation est obligatoire'
      });
    }

    const invalidDetail = detailsArray.find((detail) => detail?.sens !== undefined && detail?.sens !== null && detail.sens !== 1 && detail.sens !== -1);
    if (invalidDetail) {
      return res.status(400).json({
        success: false,
        message: 'Chaque ligne doit préciser sens = 1 (recette) ou -1 (dépense)'
      });
    }

    if (req.user && req.user.id) {
      document.user_id = req.user.id;
    }

    const result = await caisseService.createCaisseDocument(document, detailsArray);
    return res.status(201).json({
      success: true,
      data: result,
      message: 'Document de caisse créé avec succès'
    });
  } catch (err) {
    const statusCode = err.message && (err.message.includes('requis') || err.message.includes('invalide')) ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || 'Erreur lors de la création du document'
    });
  }
};

const updateCaisseDocumentV2 = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const id = parseInt(req.params.id, 10);
    if (!id) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    const { document, details } = req.body;
    if (!Array.isArray(details)) {
      return res.status(400).json({
        success: false,
        message: 'Details doit être un tableau'
      });
    }

    const invalidDetail = details.find((detail) => {
      if (detail?.sens === undefined || detail?.sens === null) {
        return false;
      }
      const detailSens = Number(detail.sens);
      return detailSens !== 1 && detailSens !== -1;
    });
    if (invalidDetail) {
      return res.status(400).json({
        success: false,
        message: 'Chaque ligne doit préciser sens = 1 (recette) ou -1 (dépense)'
      });
    }

    if (req.user && req.user.id && document) {
      document.user_id = req.user.id;
    }

    const result = await caisseService.updateCaisseDocument(id, document || {}, details, sequelize);
    return res.json({
      success: true,
      data: result,
      message: 'Document modifié avec succès'
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la modification du document'
    });
  }
};

const updateCaisseDocumentBySensV2 = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const id = parseInt(req.params.id, 10);
    const sens = parseInt(req.params.sens, 10);

    if (!id) {
      return res.status(400).json({ success: false, message: 'ID invalide' });
    }

    if (sens !== 1 && sens !== -1) {
      return res.status(400).json({ success: false, message: 'Sens invalide' });
    }

    const { document, details } = req.body;
    if (!Array.isArray(details)) {
      return res.status(400).json({
        success: false,
        message: 'Details doit être un tableau'
      });
    }

    const invalidDetail = details.find((detail) => {
      if (detail?.sens === undefined || detail?.sens === null) {
        return false;
      }
      const detailSens = Number(detail.sens);
      return detailSens !== 1 && detailSens !== -1;
    });
    if (invalidDetail) {
      return res.status(400).json({
        success: false,
        message: 'Chaque ligne doit préciser sens = 1 (recette) ou -1 (dépense)'
      });
    }

    if (req.user && req.user.id && document) {
      document.user_id = req.user.id;
    }

    const result = await caisseService.updateCaisseDocumentBySens(id, sens, document || {}, details, sequelize);
    return res.json({
      success: true,
      data: result,
      message: 'Lignes du document modifiées avec succès'
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la modification des lignes du document'
    });
  }
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
  createCaisseFromReglement,
  getNextCaisseNumero
};
