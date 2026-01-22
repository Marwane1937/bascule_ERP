const express = require('express');
const router = express.Router();
const caissePdfService = require('../services/caisse-pdf.service');
const caisseService = require('../services/finance/caisse.service');
const pdfConfigService = require('../services/pdf-config.service');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');
const databaseSwitchService = require('../services/database-switch.service');
const path = require('path');
const fs = require('fs');
const https = require('https');
const axios = require('axios');
const FormData = require('form-data');


// Middleware de débogage pour toutes les requêtes
router.use((req, res, next) => {
  next();
});

// Appliquer le middleware d'injection de base de données
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Route de test pour vérifier que le router fonctionne
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Route caisse-pdf fonctionne correctement' });
});

// Route GET pour servir les PDFs depuis le cache mémoire
router.get('/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!filename || !filename.endsWith('.pdf') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Nom de fichier invalide' });
    }
    
    const cacheKey = `caisses/${filename}`;
    
    if (global.pdfCache && global.pdfCache.has(cacheKey)) {
      const cached = global.pdfCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', cached.buffer.length);
        return res.send(cached.buffer);
      } else {
        global.pdfCache.delete(cacheKey);
      }
    }
    
    // Si pas dans le cache, vérifier sur disque (pour compatibilité)
    const publicPath = path.join(__dirname, '..', 'public', 'caisses', filename);
    if (fs.existsSync(publicPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      return res.sendFile(publicPath);
    }
    
    return res.status(404).json({ success: false, message: 'PDF introuvable' });
  } catch (error) {
    console.error('Erreur service PDF caisse :', error);
    return res.status(500).json({ success: false, message: 'Erreur service PDF', error: error.message });
  }
});

router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { caisse_id } = req.body;

    const caisseId = parseInt(caisse_id, 10);

    if (isNaN(caisseId)) {
      console.error('[caisse-pdf] caisse_id invalide:', caisse_id);
      return res.status(400).json({ success: false, message: 'caisse_id invalide' });
    }

    // Récupérer les données de la caisse
    const caisseData = await caisseService.getCaisseDocumentById(caisseId);

    if (!caisseData) {
      console.error('[caisse-pdf] Caisse introuvable:', caisseId);
      return res.status(404).json({ success: false, message: 'Caisse introuvable' });
    }


    // Récupérer les informations depuis le fichier JSON de configuration
    const documentSociete = pdfConfigService.getDocumentSociete();

    // Générer le PDF (sera supprimé immédiatement après lecture)
    const pdfPath = await caissePdfService.genererCaissePDF(caisseData, {
      documentSociete: documentSociete
    });

    // Lire le PDF en mémoire et le supprimer immédiatement
    const pdfBuffer = fs.readFileSync(pdfPath);
    fs.unlinkSync(pdfPath); // Supprimer le fichier immédiatement

    const fileName = path.basename(pdfPath);
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    const pdfUrl = `${baseUrl}/api/caisse-pdf/${fileName}`;

    // Stocker en cache mémoire
    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(`caisses/${fileName}`, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    setTimeout(() => {
      if (global.pdfCache) {
        global.pdfCache.delete(`caisses/${fileName}`);
      }
    }, 5 * 60 * 1000);

    return res.json({ success: true, pdfUrl, filePath: pdfPath });
  } catch (error) {
    console.error('[caisse-pdf] Erreur génération PDF caisse:', error);
    console.error('[caisse-pdf] Stack:', error.stack);
    if (error.original) {
      console.error('[caisse-pdf] Erreur originale:', error.original);
    }
    return res.status(500).json({
      success: false,
      message: 'Erreur génération PDF',
      error: error.message
    });
  }
});

// Générer un rapport PDF avec plage de dates
// IMPORTANT: Cette route doit être AVANT toute route paramétrée comme /:id
router.post('/rapport', authenticateToken, async (req, res) => {
  try {
    console.log('[caisse-pdf-rapport] 📥 Requête reçue pour générer rapport PDF');
    console.log('[caisse-pdf-rapport] Body:', req.body);

    const { dateFrom, dateTo, caisseType } = req.body;

    if (!dateFrom || !dateTo) {
      console.error('[caisse-pdf-rapport] ❌ Dates manquantes - dateFrom:', dateFrom, 'dateTo:', dateTo);
      return res.status(400).json({
        success: false,
        message: 'Les dates de début et de fin sont requises'
      });
    }

    console.log('[caisse-pdf-rapport] 📅 Période:', dateFrom, 'à', dateTo);
    console.log('[caisse-pdf-rapport] 📊 Type de caisse:', caisseType || 'declared');

    // Récupérer les données de caisse pour la période
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const donnees = await caisseService.getCaisseDataForReport(dateFrom, dateTo, sequelize, caisseType);
    console.log('[caisse-pdf-rapport] ✅ Données récupérées:', {
      documentsCount: donnees?.documents?.length || 0,
      totalEntrees: donnees?.totaux?.total_entrees || 0,
      totalSorties: donnees?.totaux?.total_sorties || 0
    });

    // Récupérer les informations depuis le fichier JSON de configuration
    const documentSociete = pdfConfigService.getDocumentSociete();

    // Générer le PDF
    const pdfPath = await caissePdfService.genererRapportCaissePDF(donnees, {
      documentSociete: documentSociete,
      caisseType: caisseType || 'declared'
    });


    // Lire le PDF en mémoire et le supprimer immédiatement
    const pdfBuffer = fs.readFileSync(pdfPath);
    fs.unlinkSync(pdfPath);

    const fileName = path.basename(pdfPath);
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    const pdfUrl = `${baseUrl}/api/caisse-pdf/${fileName}`;

    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(`caisses/${fileName}`, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    setTimeout(() => {
      if (global.pdfCache) {
        global.pdfCache.delete(`caisses/${fileName}`);
      }
    }, 5 * 60 * 1000);

    return res.json({ success: true, pdfUrl, filePath: pdfPath });
  } catch (error) {
    console.error('========================================');
    console.error('[caisse-pdf-rapport] ❌ ERREUR lors de la génération du PDF rapport');
    console.error('[caisse-pdf-rapport] Message:', error.message);
    console.error('[caisse-pdf-rapport] Stack:', error.stack);
    if (error.original) {
      console.error('[caisse-pdf-rapport] Erreur originale:', error.original);
    }
    if (error.code) {
      console.error('[caisse-pdf-rapport] Code erreur:', error.code);
    }
    console.error('========================================');
    return res.status(500).json({
      success: false,
      message: 'Erreur génération PDF rapport',
      error: error.message
    });
  }
});

// Générer un rapport PDF filtré par employé et plage de dates
router.post('/rapport-by-employe', authenticateToken, async (req, res) => {
  try {
    console.log('[caisse-pdf-rapport-by-employe] 📥 Requête reçue pour générer rapport PDF par employé');
    console.log('[caisse-pdf-rapport-by-employe] Body:', req.body);

    const { dateFrom, dateTo, employeId, caisseType } = req.body;

    if (!dateFrom || !dateTo) {
      console.error('[caisse-pdf-rapport-by-employe] ❌ Dates manquantes - dateFrom:', dateFrom, 'dateTo:', dateTo);
      return res.status(400).json({
        success: false,
        message: 'Les dates de début et de fin sont requises'
      });
    }

    if (!employeId) {
      console.error('[caisse-pdf-rapport-by-employe] ❌ Employé ID manquant');
      return res.status(400).json({
        success: false,
        message: 'L\'ID de l\'employé est requis'
      });
    }

    console.log('[caisse-pdf-rapport-by-employe] 📅 Période:', dateFrom, 'à', dateTo);
    console.log('[caisse-pdf-rapport-by-employe] 👤 Employé ID:', employeId);
    console.log('[caisse-pdf-rapport-by-employe] 📊 Type de caisse:', caisseType || 'declared');

    // Récupérer les données de caisse pour la période filtrée par employé
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const donnees = await caisseService.getCaisseDataForReportByEmploye(dateFrom, dateTo, employeId, sequelize, caisseType);
    console.log('[caisse-pdf-rapport-by-employe] ✅ Données récupérées:', {
      documentsCount: donnees?.documents?.length || 0,
      totalEntrees: donnees?.totalEntrees || 0,
      totalSorties: donnees?.totalSorties || 0
    });

    // Récupérer les documents de la société si disponible
    let documentSociete = null;
    // Récupérer les informations depuis le fichier JSON de configuration
    documentSociete = pdfConfigService.getDocumentSociete();

    // Récupérer le nom de l'employé pour l'inclure dans le titre du PDF
    let employeNom = 'Employé ' + employeId;
    try {
      const [employeData] = await sequelize.query(
        'SELECT nom_complet, nom, prenom FROM employe WHERE id = :employeId',
        {
          replacements: { employeId },
          type: sequelize.QueryTypes.SELECT
        }
      );
      if (employeData) {
        employeNom = employeData.nom_complet || (employeData.prenom + ' ' + employeData.nom) || employeNom;
      }
    } catch (error) {
      console.warn('[caisse-pdf-rapport-by-employe] ⚠️ Impossible de récupérer le nom de l\'employé:', error.message);
    }

    // Générer le PDF (utiliser la même fonction mais avec les données filtrées)
    // On va modifier légèrement la fonction pour accepter un paramètre employeNom et employeId
    const pdfPath = await caissePdfService.genererRapportCaissePDFByEmploye(donnees, {
      documentSociete: documentSociete,
      caisseType: caisseType || 'declared',
      employeNom: employeNom,
      employeId: employeId
    });


    // Lire le PDF en mémoire et le supprimer immédiatement
    const pdfBuffer = fs.readFileSync(pdfPath);
    fs.unlinkSync(pdfPath);

    const fileName = path.basename(pdfPath);
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    const pdfUrl = `${baseUrl}/api/caisse-pdf/${fileName}`;

    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(`caisses/${fileName}`, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    setTimeout(() => {
      if (global.pdfCache) {
        global.pdfCache.delete(`caisses/${fileName}`);
      }
    }, 5 * 60 * 1000);

    return res.json({ success: true, pdfUrl, filePath: pdfPath });
  } catch (error) {
    console.error('========================================');
    console.error('[caisse-pdf-rapport-by-employe] ❌ ERREUR lors de la génération du PDF rapport par employé');
    console.error('[caisse-pdf-rapport-by-employe] Message:', error.message);
    console.error('[caisse-pdf-rapport-by-employe] Stack:', error.stack);
    if (error.original) {
      console.error('[caisse-pdf-rapport-by-employe] Erreur originale:', error.original);
    }
    if (error.code) {
      console.error('[caisse-pdf-rapport-by-employe] Code erreur:', error.code);
    }
    console.error('========================================');
    return res.status(500).json({
      success: false,
      message: 'Erreur génération PDF rapport par employé',
      error: error.message
    });
  }
});

// Générer un rapport PDF pour les rubriques 2000/3000
router.post('/rapport-group-2000-3000', authenticateToken, async (req, res) => {
  try {
    console.log('[caisse-pdf-rapport-group-2000-3000] 📥 Requête reçue');
    const { dateFrom, dateTo, caisseType, rubriqueIds } = req.body;

    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, message: 'Dates requises' });
    }

    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const donnees = await caisseService.getCaisseDataForReportGroup2000_3000(dateFrom, dateTo, sequelize, caisseType, rubriqueIds);

    // Récupérer les informations depuis le fichier JSON de configuration
    const documentSociete = pdfConfigService.getDocumentSociete();

    const pdfPath = await caissePdfService.genererRapportCaisseGroup2000_3000PDF(donnees, {
      documentSociete,
      caisseType
    });

    // Lire le PDF en mémoire et le supprimer immédiatement
    const pdfBuffer = fs.readFileSync(pdfPath);
    fs.unlinkSync(pdfPath);

    const fileName = path.basename(pdfPath);
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    const pdfUrl = `${baseUrl}/api/caisse-pdf/${fileName}`;

    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(`caisses/${fileName}`, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    setTimeout(() => {
      if (global.pdfCache) {
        global.pdfCache.delete(`caisses/${fileName}`);
      }
    }, 5 * 60 * 1000);

    return res.json({ success: true, pdfUrl, filePath: pdfPath });
  } catch (error) {
    console.error('[caisse-pdf-rapport-group-2000-3000] ❌ Erreur:', error);
    return res.status(500).json({ success: false, message: 'Erreur génération PDF', error: error.message });
  }
});

// Générer un PDF de caisse filtré par employé
// IMPORTANT: Cette route doit être définie AVANT toute route paramétrée
router.post('/generate-by-employe', authenticateToken, async (req, res) => {
  try {
    const { caisse_id, employe_id } = req.body;

    const caisseId = parseInt(caisse_id, 10);
    const employeId = parseInt(employe_id, 10);

    if (isNaN(caisseId)) {
      return res.status(400).json({ success: false, message: 'caisse_id invalide' });
    }

    if (isNaN(employeId)) {
      return res.status(400).json({ success: false, message: 'employe_id invalide' });
    }


    // Récupérer les données de bon de caisse selon les requêtes SQL spécifiées
    // Passer req.sequelize pour utiliser la connexion injectée
    const sequelize = req.sequelize || require('../services/database-switch.service').getConnectionToUse();
    const bonDeCaisseData = await caisseService.getBonDeCaisseByEmploye(caisseId, employeId, sequelize);

    if (!bonDeCaisseData) {
      return res.status(404).json({ success: false, message: 'Données de bon de caisse introuvables' });
    }

    // Récupérer les informations depuis le fichier JSON de configuration
    const documentSociete = pdfConfigService.getDocumentSociete();

    // Générer le PDF du bon de caisse
    const pdfPath = await caissePdfService.genererBonDeCaissePDF(bonDeCaisseData, {
      documentSociete: documentSociete
    });

    // Lire le PDF en mémoire et le supprimer immédiatement
    const pdfBuffer = fs.readFileSync(pdfPath);
    fs.unlinkSync(pdfPath);

    const fileName = path.basename(pdfPath);
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    const pdfUrl = `${baseUrl}/api/caisse-pdf/${fileName}`;

    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(`caisses/${fileName}`, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    setTimeout(() => {
      if (global.pdfCache) {
        global.pdfCache.delete(`caisses/${fileName}`);
      }
    }, 5 * 60 * 1000);

    return res.json({ success: true, pdfUrl, filePath: pdfPath });
  } catch (error) {
    console.error('[caisse-pdf-by-employe] Erreur génération PDF caisse par employé:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur génération PDF',
      error: error.message
    });
  }
});

// Envoyer le PDF de caisse par employé via Telegram
// IMPORTANT: Cette route doit être définie AVANT toute route paramétrée
router.post('/send-telegram-by-employe', authenticateToken, async (req, res) => {
  try {
    const { caisse_id, employe_id, message, chat_id } = req.body;

    const caisseId = parseInt(caisse_id, 10);
    const employeId = parseInt(employe_id, 10);

    if (isNaN(caisseId)) return res.status(400).json({ success: false, message: 'caisse_id invalide' });
    if (isNaN(employeId)) return res.status(400).json({ success: false, message: 'employe_id invalide' });

    // Récupérer les données du bon de caisse
    const sequelize = req.sequelize || require('../services/database-switch.service').getConnectionToUse();
    const bonDeCaisseData = await caisseService.getBonDeCaisseByEmploye(caisseId, employeId, sequelize);
    if (!bonDeCaisseData) return res.status(404).json({ success: false, message: 'Données de bon de caisse introuvables' });

    // Récupérer le chat_id Telegram de l'employé
    // Si chat_id est fourni dans la requête, l'utiliser, sinon essayer de le récupérer depuis la base de données
    let telegramChatId = chat_id;

    if (!telegramChatId) {
      // Essayer de récupérer le telegram_id depuis la base de données (colonne telegram_id dans la table employé)
      try {
        const [employeData] = await sequelize.query(
          'SELECT telegram_id FROM employe WHERE id = :employeId',
          {
            replacements: { employeId },
            type: sequelize.QueryTypes.SELECT
          }
        );
        if (employeData && employeData.telegram_id) {
          telegramChatId = employeData.telegram_id;
          console.log('[caisse-pdf-telegram] ✅ Chat ID récupéré depuis la base de données:', telegramChatId);
        }
      } catch (dbError) {
        console.warn('[caisse-pdf-telegram] Impossible de récupérer telegram_id depuis la base:', dbError.message);
      }
    }

    if (!telegramChatId) {
      return res.status(400).json({
        success: false,
        message: 'Chat ID Telegram manquant',
        details: {
          instructions: [
            'Le chat_id Telegram est requis pour envoyer le message.',
            'Options:',
            '1. Fournir le chat_id dans la requête (paramètre chat_id)',
            '2. Stocker le telegram_id dans la table employé (colonne telegram_id)',
            '',
            'Pour obtenir le chat_id:',
            '1. Démarrer une conversation avec votre bot Telegram',
            '2. Envoyer un message au bot',
            '3. Visiter: https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates',
            '4. Chercher "chat":{"id": dans la réponse',
            '',
            'Pour stocker dans la base de données:',
            'UPDATE employe SET telegram_id = \'VOTRE_CHAT_ID\' WHERE id = ID_EMPLOYE;'
          ]
        }
      });
    }

    // Document société
    let documentSociete = null;
    // Récupérer les informations depuis le fichier JSON de configuration
    documentSociete = pdfConfigService.getDocumentSociete();

    // Générer le PDF
    const pdfPath = await caissePdfService.genererBonDeCaissePDF(bonDeCaisseData, { documentSociete });
    const fileName = path.basename(pdfPath);

    // Configuration Telegram
    require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    console.log('[caisse-pdf-telegram] 🔍 Configuration Telegram:');
    console.log('[caisse-pdf-telegram] - Bot Token présent:', botToken ? `✅ (${botToken.substring(0, 10)}...)` : '❌ Manquant');
    console.log('[caisse-pdf-telegram] - Chat ID:', telegramChatId || '❌ Manquant');

    if (!botToken) {
      console.error('[caisse-pdf-telegram] ❌ Configuration Telegram manquante:');
      return res.status(500).json({
        success: false,
        message: 'Configuration Telegram manquante dans .env',
        details: {
          tokenPresent: !!botToken,
          instructions: [
            '1. Vérifiez que le fichier .env existe dans le dossier backend/',
            '2. Créez un bot Telegram via @BotFather sur Telegram',
            '3. Ajoutez la variable suivante dans .env:',
            '   - TELEGRAM_BOT_TOKEN=votre_bot_token',
            '4. Redémarrez le serveur backend après modification du .env'
          ]
        }
      });
    }

    // Envoyer le document via l'API Telegram
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendDocument`;

    const form = new FormData();
    form.append('chat_id', telegramChatId);
    form.append('document', fs.createReadStream(pdfPath), {
      filename: fileName,
      contentType: 'application/pdf'
    });

    if (message) {
      form.append('caption', message);
    }

    try {
      const telegramResponse = await axios.post(telegramApiUrl, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      console.log('[caisse-pdf-telegram] ✅ Document envoyé avec succès');

      return res.json({
        success: true,
        message: 'PDF envoyé via Telegram avec succès',
        telegramResponse: telegramResponse.data
      });
    } catch (telegramError) {
      const errorData = telegramError.response?.data || {};
      const errorCode = errorData.error_code;
      const errorDescription = errorData.description || '';

      console.error('[caisse-pdf-telegram] ❌ Erreur envoi Telegram:', errorDescription);

      // Gestion des erreurs courantes de Telegram
      if (errorCode === 401) {
        return res.status(401).json({
          success: false,
          message: 'Token Telegram invalide',
          error: 'Le token du bot Telegram est invalide. Vérifiez TELEGRAM_BOT_TOKEN dans .env'
        });
      }

      if (errorCode === 400 && errorDescription.includes('chat not found')) {
        return res.status(400).json({
          success: false,
          message: 'Chat Telegram introuvable',
          error: 'Le chat_id fourni est invalide ou le bot n\'a pas encore démarré de conversation avec cet utilisateur',
          details: {
            instructions: [
              '1. Assurez-vous que l\'utilisateur a démarré une conversation avec le bot',
              '2. Vérifiez que le chat_id est correct',
              '3. L\'utilisateur doit envoyer /start au bot au moins une fois'
            ]
          }
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Erreur envoi Telegram',
        error: errorDescription || telegramError.message,
        errorCode: errorCode
      });
    }

  } catch (error) {
    console.error('[caisse-pdf-telegram-by-employe] Erreur:', error.message);
    console.error('[caisse-pdf-telegram-by-employe] Stack:', error.stack);

    return res.status(500).json({
      success: false,
      message: 'Erreur envoi Telegram',
      error: error.message
    });
  }
});

// Envoyer le PDF de caisse par employé via WhatsApp (route conservée pour compatibilité)
// IMPORTANT: Cette route doit être définie AVANT toute route paramétrée
router.post('/send-whatsapp-by-employe', authenticateToken, async (req, res) => {
  try {
    const { caisse_id, employe_id, message } = req.body;

    const caisseId = parseInt(caisse_id, 10);
    const employeId = parseInt(employe_id, 10);

    if (isNaN(caisseId)) return res.status(400).json({ success: false, message: 'caisse_id invalide' });
    if (isNaN(employeId)) return res.status(400).json({ success: false, message: 'employe_id invalide' });

    // Récupérer les données du bon de caisse
    // Passer req.sequelize pour utiliser la connexion injectée
    const sequelize = req.sequelize || require('../services/database-switch.service').getConnectionToUse();
    const bonDeCaisseData = await caisseService.getBonDeCaisseByEmploye(caisseId, employeId, sequelize);
    if (!bonDeCaisseData) return res.status(404).json({ success: false, message: 'Données de bon de caisse introuvables' });

    const phone = bonDeCaisseData.employe?.telephone;
    if (!phone) return res.status(400).json({ success: false, message: 'Aucun numéro de téléphone trouvé pour cet employé' });

    // Document société
    // Récupérer les informations depuis le fichier JSON de configuration
    const documentSociete = pdfConfigService.getDocumentSociete();

    // Générer le PDF
    const pdfPath = await caissePdfService.genererBonDeCaissePDF(bonDeCaisseData, { documentSociete });
    const fileName = path.basename(pdfPath);

    // Configuration WhatsApp
    // Recharger dotenv pour s'assurer que les variables sont à jour
    require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v20.0';

    // Log pour débogage (masquer le token complet pour sécurité)
    console.log('[caisse-pdf-whatsapp] 🔍 Configuration WhatsApp:');
    console.log('[caisse-pdf-whatsapp] - Token présent:', token ? `✅ (${token.substring(0, 10)}...)` : '❌ Manquant');
    console.log('[caisse-pdf-whatsapp] - Phone Number ID:', phoneNumberId || '❌ Manquant');
    console.log('[caisse-pdf-whatsapp] - API Version:', apiVersion);

    if (!token || !phoneNumberId) {
      console.error('[caisse-pdf-whatsapp] ❌ Configuration WhatsApp manquante:');
      console.error('[caisse-pdf-whatsapp] - WHATSAPP_TOKEN:', token ? '✅ Présent' : '❌ Manquant');
      console.error('[caisse-pdf-whatsapp] - WHATSAPP_PHONE_NUMBER_ID:', phoneNumberId ? '✅ Présent' : '❌ Manquant');
      return res.status(500).json({
        success: false,
        message: 'Configuration WhatsApp manquante dans .env',
        details: {
          tokenPresent: !!token,
          phoneNumberIdPresent: !!phoneNumberId,
          instructions: [
            '1. Vérifiez que le fichier .env existe dans le dossier backend/',
            '2. Vérifiez que les variables suivantes sont définies:',
            '   - WHATSAPP_TOKEN=votre_token',
            '   - WHATSAPP_PHONE_NUMBER_ID=votre_phone_number_id',
            '   - WHATSAPP_API_VERSION=v20.0 (optionnel)',
            '3. Redémarrez le serveur backend après modification du .env'
          ]
        }
      });
    }

    // Nettoyer le numéro
    let numeroNettoye = String(phone).replace(/\D/g, '');
    if (numeroNettoye.startsWith('0')) numeroNettoye = '212' + numeroNettoye.substring(1);
    else if (!numeroNettoye.startsWith('212')) numeroNettoye = '212' + numeroNettoye;

    // ----- Étape 1: Upload PDF via multipart/form-data (méthode correcte pour WhatsApp Cloud API) -----
    const form = new FormData();
    // Utiliser un stream pour l'upload (méthode recommandée)
    const fileStream = fs.createReadStream(pdfPath);
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'document');
    form.append('file', fileStream, {
      filename: fileName,
      contentType: 'application/pdf',
      knownLength: fs.statSync(pdfPath).size
    });

    let mediaResponse;
    try {
      mediaResponse = await axios.post(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`,
        form,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ...form.getHeaders()
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );
    } catch (uploadError) {
      const errorData = uploadError.response?.data || {};
      const errorCode = errorData.error?.code;
      const errorSubcode = errorData.error?.error_subcode;
      const errorMessage = errorData.error?.message || '';

      // Vérifier si c'est une erreur d'expiration du token
      if (errorMessage.includes('expired') || errorMessage.includes('Session has expired') ||
        errorCode === 190 || errorCode === 102 || errorSubcode === 463) {
        return res.status(401).json({
          success: false,
          message: 'Token WhatsApp expiré',
          error: 'Le token d\'accès WhatsApp a expiré. Veuillez le renouveler.',
          details: {
            errorCode: errorCode,
            errorSubcode: errorSubcode,
            errorMessage: errorMessage,
            instructions: [
              '1. Allez sur https://developers.facebook.com/apps/',
              '2. Sélectionnez votre application WhatsApp Business',
              '3. Allez dans "WhatsApp" > "API Setup"',
              '4. Copiez le "Temporary access token" (ou générez un token permanent)',
              '5. Mettez à jour dans le fichier .env: WHATSAPP_TOKEN=votre_nouveau_token',
              '6. Redémarrez le serveur backend',
              '',
              'Note: Les tokens temporaires expirent après 24h. Pour un token permanent, configurez un System User.'
            ]
          }
        });
      }
      throw uploadError;
    }

    const mediaId = mediaResponse.data.id;

    // ----- Étape 2: Envoyer le message -----
    const messagePayload = {
      messaging_product: 'whatsapp',
      to: numeroNettoye,
      type: 'document',
      document: { id: mediaId, filename: fileName }
    };

    if (message) messagePayload.document.caption = message;

    let messageResponse;
    try {
      messageResponse = await axios.post(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        messagePayload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (messageError) {
      const errorData = messageError.response?.data || {};
      const errorCode = errorData.error?.code;
      const errorSubcode = errorData.error?.error_subcode;
      const errorMessage = errorData.error?.message || '';

      // Vérifier si c'est une erreur d'expiration du token
      if (errorMessage.includes('expired') || errorMessage.includes('Session has expired') ||
        errorCode === 190 || errorCode === 102 || errorSubcode === 463) {
        return res.status(401).json({
          success: false,
          message: 'Token WhatsApp expiré',
          error: 'Le token d\'accès WhatsApp a expiré. Veuillez le renouveler.',
          details: {
            errorCode: errorCode,
            errorSubcode: errorSubcode,
            errorMessage: errorMessage,
            instructions: [
              '1. Allez sur https://developers.facebook.com/apps/',
              '2. Sélectionnez votre application WhatsApp Business',
              '3. Allez dans "WhatsApp" > "API Setup"',
              '4. Copiez le "Temporary access token" (ou générez un token permanent)',
              '5. Mettez à jour dans le fichier .env: WHATSAPP_TOKEN=votre_nouveau_token',
              '6. Redémarrez le serveur backend',
              '',
              'Note: Les tokens temporaires expirent après 24h. Pour un token permanent, configurez un System User.'
            ]
          }
        });
      }
      throw messageError;
    }

    return res.json({
      success: true,
      message: 'PDF envoyé via WhatsApp avec succès',
      whatsappResponse: messageResponse.data
    });

  } catch (error) {
    const errorData = error.response?.data || {};
    const errorCode = errorData.error?.code;
    const errorSubcode = errorData.error?.error_subcode;
    const errorMessage = errorData.error?.message || error.message;

    console.error('[caisse-pdf-whatsapp-by-employe] Erreur:', errorData || error.message);

    // Vérifier si c'est une erreur d'expiration du token (fallback)
    if (errorMessage.includes('expired') || errorMessage.includes('Session has expired') ||
      errorCode === 190 || errorCode === 102 || errorSubcode === 463) {
      return res.status(401).json({
        success: false,
        message: 'Token WhatsApp expiré',
        error: 'Le token d\'accès WhatsApp a expiré. Veuillez le renouveler.',
        details: {
          errorCode: errorCode,
          errorSubcode: errorSubcode,
          errorMessage: errorMessage
        }
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Erreur envoi WhatsApp',
      error: errorMessage
    });
  }
});

module.exports = router;

