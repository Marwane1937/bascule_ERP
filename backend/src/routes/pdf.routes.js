const express = require('express');
const router = express.Router();
const emailService = require('../services/email.service');
const { getEmailDataByDocumentId } = require('../models/email.model');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');
const pdfConfigService = require('../services/pdf-config.service');
const path = require('path');
const https = require('https');
const fs = require('fs');

// utilise les méthodes de emailService directement

// Route GET publique pour servir les PDFs depuis le cache mémoire ou le disque
// Cette route est publique car elle est appelée via window.open() qui n'envoie pas les headers d'authentification
router.get('/:folder/:filename', async (req, res) => {
  try {
    const { folder, filename } = req.params;
    
    console.log(`[PDF Route] 🔍 Requête GET pour: ${folder}/${filename}`);
    
    // Valider le nom de fichier (sécurité)
    if (!filename || !filename.endsWith('.pdf') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      console.log(`[PDF Route] ❌ Nom de fichier invalide: ${filename}`);
      return res.status(400).json({ success: false, message: 'Nom de fichier invalide' });
    }
    
    const cacheKey = `${folder}/${filename}`;
    
    // Vérifier le cache mémoire
    if (global.pdfCache && global.pdfCache.has(cacheKey)) {
      const cached = global.pdfCache.get(cacheKey);
      // Vérifier que le cache n'est pas trop vieux (1 heure)
      if (Date.now() - cached.timestamp < 60 * 60 * 1000) {
        console.log(`[PDF Route] ✅ PDF trouvé dans le cache: ${cacheKey}`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', cached.buffer.length);
        return res.send(cached.buffer);
      } else {
        console.log(`[PDF Route] ⏰ Cache expiré pour: ${cacheKey}`);
        // Supprimer du cache si trop vieux
        global.pdfCache.delete(cacheKey);
      }
    }
    
    // Si pas dans le cache, vérifier si le fichier existe sur disque
    const publicPath = path.join(__dirname, '..', 'public', folder, filename);
    console.log(`[PDF Route] 🔍 Vérification fichier sur disque: ${publicPath}`);
    
    if (fs.existsSync(publicPath)) {
      // Vérifier l'âge du fichier (ne pas servir les fichiers de plus de 1 heure)
      const stats = fs.statSync(publicPath);
      const fileAge = Date.now() - stats.mtime.getTime();
      console.log(`[PDF Route] 📅 Âge du fichier: ${Math.round(fileAge / 1000)} secondes`);
      
      if (fileAge < 60 * 60 * 1000) {
        console.log(`[PDF Route] ✅ Envoi du PDF depuis le disque: ${publicPath}`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        return res.sendFile(publicPath);
      } else {
        console.log(`[PDF Route] ⏰ Fichier trop vieux, suppression: ${publicPath}`);
        // Supprimer le fichier s'il est trop vieux
        try {
          fs.unlinkSync(publicPath);
          console.log(`🗑️ Fichier PDF supprimé (trop vieux): ${publicPath}`);
        } catch (unlinkError) {
          console.error('Erreur suppression fichier PDF:', unlinkError);
        }
      }
    } else {
      console.log(`[PDF Route] ❌ Fichier non trouvé: ${publicPath}`);
    }
    
    // Si le fichier n'existe pas, retourner 404
    console.log(`[PDF Route] ❌ PDF introuvable: ${cacheKey}`);
    return res.status(404).json({ success: false, message: 'PDF introuvable' });
  } catch (error) {
    console.error('[PDF Route] ❌ Erreur service PDF :', error);
    console.error('[PDF Route] ❌ Stack:', error.stack);
    return res.status(500).json({ success: false, message: 'Erreur service PDF', error: error.message });
  }
});

// Route POST protégée pour générer les PDFs (nécessite authentification)
router.post('/generate', authenticateToken, databaseInjector.injectConnection.bind(databaseInjector), async (req, res) => { 
  try {
    const { document_id, withStamp, printMode, composeArticle, forceDocumentType } = req.body;
    const docId = parseInt(document_id, 10);
    console.log('📄 Génération PDF demandée pour document_id:', docId, '(type:', typeof docId, ')', forceDocumentType ? `[Force: ${forceDocumentType}]` : '');
    
    if (isNaN(docId)) {
      console.error('❌ document_id invalide:', document_id);
      return res.status(400).json({ success: false, message: 'document_id invalide' });
    }
    
    // Utiliser la connexion injectée par le middleware
    const sequelize = req.sequelize || require('../config/database');
    
    let devisData;
    try {
      devisData = await getEmailDataByDocumentId(docId, sequelize);

      console.log('📊 Données récupérées:', devisData?.length || 0, 'ligne(s)');
      if (!devisData || devisData.length === 0) {
        console.error('❌ Document introuvable pour document_id:', docId);
        return res.status(404).json({ success: false, message: 'Document introuvable' });
      }
      
      console.log('📊 Première ligne de données:', devisData[0] ? Object.keys(devisData[0]) : 'Aucune donnée');
    } catch (queryError) {
      console.error('❌ Erreur lors de la récupération des données pour le PDF:', queryError);
      console.error('❌ Stack:', queryError.stack);
      return res.status(500).json({ 
        success: false, 
        message: 'Erreur lors de la récupération des données', 
        error: queryError.message 
      });
    }

    // Récupérer les informations depuis le fichier JSON de configuration
    const documentSociete = pdfConfigService.getDocumentSociete();
    console.log('📄 Informations de la société récupérées depuis la configuration:', documentSociete ? 'Oui' : 'Non');

    // Générer le PDF en mémoire (buffer) au lieu de sauvegarder
    const pdfBuffer = await emailService.genererPDFBuffer(devisData, { 
      withStamp: !!withStamp,
      documentSociete: documentSociete,
      sequelize,
      document_id: docId,
      printMode: printMode || 'normal',
      composeArticle: composeArticle || null,
      forceDocumentType: forceDocumentType || null
    });
    
    // Déterminer le nom du fichier selon le type de document
    const documentType = devisData[0]?.document_kind || (devisData[0] && (devisData[0].etat === 2 || devisData[0].type === 2) ? 'COMMANDE' : 'DEVIS');
    let folderName = 'devis';
    let documentTitle = 'DEVIS';
    
    switch ((documentType || '').toUpperCase()) {
      case 'COMMANDE':
        folderName = 'commandes';
        documentTitle = 'COMMANDE';
        break;
      case 'LIVRAISON':
      case 'BON DE LIVRAISON':
        folderName = 'livraisons';
        documentTitle = 'LIVRAISON';
        break;
      case 'RETOUR CLIENT':
      case 'RETOUR':
        folderName = 'retours';
        documentTitle = 'RETOUR';
        break;
      default:
        folderName = 'devis';
        documentTitle = 'DEVIS';
        break;
    }
    
    // Créer un nom de fichier
    const numeroDoc = devisData[0]?.numero || documentTitle;
    const nomClient = (devisData[0]?.client || 'CLIENT').toString().trim().replace(/[^a-zA-Z0-9\s\-_]/g, '').replace(/\s+/g, '_').substring(0, 50);
    const fileName = `${numeroDoc}_${nomClient}.pdf`;
    
    // Utiliser l'URL de la requête pour construire l'URL du PDF
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    const pdfUrl = `${baseUrl}/api/pdf/${folderName}/${fileName}`;

    // Créer le dossier s'il n'existe pas
    const publicFolderPath = path.join(__dirname, '..', 'public', folderName);
    if (!fs.existsSync(publicFolderPath)) {
      fs.mkdirSync(publicFolderPath, { recursive: true });
    }

    // Sauvegarder le PDF sur disque
    const pdfFilePath = path.join(publicFolderPath, fileName);
    fs.writeFileSync(pdfFilePath, pdfBuffer);
    console.log(`✅ PDF sauvegardé sur disque : ${pdfFilePath}`);

    // Stocker aussi en cache mémoire pour accès rapide
    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(`${folderName}/${fileName}`, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    
    // Nettoyer le cache mémoire après 1 heure
    setTimeout(() => {
      if (global.pdfCache) {
        global.pdfCache.delete(`${folderName}/${fileName}`);
      }
    }, 60 * 60 * 1000);

    // Nettoyer le fichier sur disque après 1 heure
    setTimeout(() => {
      try {
        if (fs.existsSync(pdfFilePath)) {
          fs.unlinkSync(pdfFilePath);
          console.log(`🗑️ Fichier PDF supprimé après 1h : ${pdfFilePath}`);
        }
      } catch (unlinkError) {
        console.error('Erreur suppression fichier PDF:', unlinkError);
      }
    }, 60 * 60 * 1000);

    return res.json({ success: true, pdfUrl });
  } catch (error) {
    console.error('Erreur génération PDF :', error);
    return res.status(500).json({ success: false, message: 'Erreur génération PDF', error: error.message });
  }
});

// Envoi du PDF en pièce jointe via WhatsApp Cloud API (méthode correcte)
// Route POST protégée (nécessite authentification)
router.post('/send-whatsapp', authenticateToken, databaseInjector.injectConnection.bind(databaseInjector), async (req, res) => {
  try {
    const { document_id, phone, message } = req.body;

    console.log('📱 Envoi PDF WhatsApp:', { document_id, phone, message });

    if (!document_id || !phone) {
      return res.status(400).json({ success: false, message: 'document_id et phone sont requis' });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      return res.status(500).json({ 
        success: false, 
        message: 'Configuration WhatsApp manquante. Ajoutez dans votre .env :\nWHATSAPP_TOKEN=votre_token\nWHATSAPP_PHONE_NUMBER_ID=votre_phone_number_id' 
      });
    }

    const devisData = await getEmailDataByDocumentId(document_id);
    if (!devisData || devisData.length === 0) {
      return res.status(404).json({ success: false, message: 'Devis introuvable' });
    }

    console.log('📄 Génération PDF...');
    // Récupérer les informations depuis le fichier JSON de configuration
    const pdfConfigService = require('../services/pdf-config.service');
    const documentSociete = pdfConfigService.getDocumentSociete();
    
    const pdfPath = await emailService.genererPDF(devisData, {
      documentSociete: documentSociete
    });
    const fileName = path.basename(pdfPath);
    
    // Lire le fichier PDF
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');
    
    console.log('📎 PDF converti en base64, taille:', pdfBase64.length);

    // Nettoyer le numéro
    let numeroNettoye = phone.replace(/\D/g, '');
    if (numeroNettoye.startsWith('0')) {
      numeroNettoye = '212' + numeroNettoye.substring(1);
    } else if (!numeroNettoye.startsWith('212')) {
      numeroNettoye = '212' + numeroNettoye;
    }

    // Étape 1: Uploader le PDF vers WhatsApp Cloud API
    const uploadPayload = JSON.stringify({
      messaging_product: 'whatsapp',
      type: 'document',
      file: pdfBase64,
      filename: fileName
    });

    const uploadOptions = {
      hostname: 'graph.facebook.com',
      path: `/v20.0/${phoneNumberId}/media`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(uploadPayload)
      }
    };

    console.log('📤 Upload du PDF vers WhatsApp...');
    const mediaResponse = await new Promise((resolve, reject) => {
      const reqUpload = https.request(uploadOptions, (resp) => {
        let data = '';
        resp.on('data', (chunk) => { data += chunk; });
        resp.on('end', () => {
          console.log('📨 Réponse Upload:', { statusCode: resp.statusCode, data });
          try {
            const json = JSON.parse(data || '{}');
            if (resp.statusCode && resp.statusCode >= 200 && resp.statusCode < 300) {
              resolve(json);
            } else {
              const errorMsg = json.error?.message || `Upload error: ${resp.statusCode} - ${data}`;
              const errorCode = json.error?.code || json.error?.error_subcode;
              
              // Vérifier si c'est une erreur d'expiration du token
              if (errorMsg.includes('expired') || errorMsg.includes('Session has expired') || 
                  errorCode === 190 || errorCode === 102) {
                reject(new Error(
                  'Token WhatsApp expiré.\n\n' +
                  'Pour renouveler le token:\n' +
                  '1. Allez sur https://developers.facebook.com/apps/\n' +
                  '2. Sélectionnez votre application WhatsApp Business\n' +
                  '3. Allez dans "WhatsApp" > "API Setup"\n' +
                  '4. Copiez le "Temporary access token" (ou générez un token permanent)\n' +
                  '5. Mettez à jour dans le fichier .env:\n' +
                  '   WHATSAPP_TOKEN=votre_nouveau_token\n' +
                  '6. Redémarrez le serveur backend\n\n' +
                  'Note: Les tokens temporaires expirent après 24h. Pour un token permanent, ' +
                  'configurez un System User et générez un token système.'
                ));
              } else {
                reject(new Error(errorMsg));
              }
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      reqUpload.on('error', reject);
      reqUpload.write(uploadPayload);
      reqUpload.end();
    });

    console.log('✅ PDF uploadé, ID média:', mediaResponse.id);

    // Étape 2: Envoyer le message avec le PDF en pièce jointe
    const messagePayload = JSON.stringify({
      messaging_product: 'whatsapp',
      to: numeroNettoye,
      type: 'document',
      document: {
        id: mediaResponse.id,
        filename: fileName,
        caption: message || 'Votre devis en pièce jointe'
      }
    });

    const messageOptions = {
      hostname: 'graph.facebook.com',
      path: `/v20.0/${phoneNumberId}/messages`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(messagePayload)
      }
    };

    console.log('📨 Envoi du message avec PDF...');
    const messageResponse = await new Promise((resolve, reject) => {
      const reqMessage = https.request(messageOptions, (resp) => {
        let data = '';
        resp.on('data', (chunk) => { data += chunk; });
        resp.on('end', () => {
          console.log('📨 Réponse Message:', { statusCode: resp.statusCode, data });
          try {
            const json = JSON.parse(data || '{}');
            if (resp.statusCode && resp.statusCode >= 200 && resp.statusCode < 300) {
              resolve(json);
            } else {
              const errorMsg = json.error?.message || `Message error: ${resp.statusCode} - ${data}`;
              const errorCode = json.error?.code || json.error?.error_subcode;
              
              // Vérifier si c'est une erreur d'expiration du token
              if (errorMsg.includes('expired') || errorMsg.includes('Session has expired') || 
                  errorCode === 190 || errorCode === 102) {
                reject(new Error(
                  'Token WhatsApp expiré lors de l\'envoi.\n\n' +
                  'Pour renouveler le token:\n' +
                  '1. Allez sur https://developers.facebook.com/apps/\n' +
                  '2. Sélectionnez votre application WhatsApp Business\n' +
                  '3. Allez dans "WhatsApp" > "API Setup"\n' +
                  '4. Copiez le "Temporary access token" (ou générez un token permanent)\n' +
                  '5. Mettez à jour dans le fichier .env:\n' +
                  '   WHATSAPP_TOKEN=votre_nouveau_token\n' +
                  '6. Redémarrez le serveur backend'
                ));
              } else {
                reject(new Error(errorMsg));
              }
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      reqMessage.on('error', reject);
      reqMessage.write(messagePayload);
      reqMessage.end();
    });

    console.log('✅ PDF envoyé en pièce jointe via WhatsApp');
    return res.json({ 
      success: true, 
      message: 'PDF envoyé en pièce jointe via WhatsApp', 
      messageId: messageResponse.messages?.[0]?.id,
      mediaId: mediaResponse.id,
      fileName: fileName,
      phone: numeroNettoye
    });
  } catch (error) {
    console.error('❌ Erreur envoi WhatsApp PDF :', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});


// Route GET pour récupérer le logo depuis pdf-config.json
router.get('/logo', authenticateToken, (req, res) => {
  try {
    console.log('[PDF Route] 🔍 Requête logo reçue');
    const logoPath = pdfConfigService.getLogoPath();
    
    if (!logoPath) {
      console.warn('[PDF Route] ⚠️ Aucun chemin de logo retourné par pdfConfigService');
      return res.status(404).json({
        success: false,
        message: 'Logo non trouvé dans la configuration'
      });
    }

    if (!fs.existsSync(logoPath)) {
      console.error('[PDF Route] ❌ Fichier logo introuvable:', logoPath);
      return res.status(404).json({
        success: false,
        message: 'Logo non trouvé dans la configuration',
        path: logoPath
      });
    }

    // Déterminer le type MIME basé sur l'extension
    const ext = path.extname(logoPath).toLowerCase();
    let contentType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') {
      contentType = 'image/jpeg';
    } else if (ext === '.gif') {
      contentType = 'image/gif';
    } else if (ext === '.svg') {
      contentType = 'image/svg+xml';
    }

    console.log('[PDF Route] ✅ Envoi du logo:', logoPath, 'Content-Type:', contentType);
    res.setHeader('Content-Type', contentType);
    res.sendFile(path.resolve(logoPath));
  } catch (error) {
    console.error('[PDF Route] ❌ Erreur récupération logo:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du logo',
      error: error.message
    });
  }
});

module.exports = router;
