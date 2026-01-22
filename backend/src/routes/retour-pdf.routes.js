const express = require('express');
const router = express.Router();
const emailService = require('../services/email.service');
const { getEmailDataByDocumentId } = require('../models/email.model');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');
const path = require('path');
const https = require('https');
const fs = require('fs');

/**
 * Routes pour la génération de PDF des RETOURS CLIENT
 * Ce service est séparé pour éviter toute confusion
 */

// Toutes les routes nécessitent une authentification
// Les routes sont déjà protégées par authenticateToken dans app.js

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Générer un PDF de retour
router.post('/generate', async (req, res) => {
  try {
    const { document_id, withStamp } = req.body;
    console.log(`[RetourPDF] 📥 Requête génération PDF pour document_id: ${document_id}`);
    const docId = parseInt(document_id, 10);

    if (isNaN(docId)) {
      console.error('❌ document_id invalide:', document_id);
      return res.status(400).json({ success: false, message: 'document_id invalide' });
    }

    const retourData = await getEmailDataByDocumentId(docId);

    if (!retourData || retourData.length === 0) {
      console.error('❌ Retour introuvable pour document_id:', docId);
      return res.status(404).json({ success: false, message: 'Retour introuvable' });
    }

    // Vérifier que c'est bien un retour
    const documentKind = retourData[0]?.document_kind || '';
    if (!documentKind.toUpperCase().includes('RETOUR')) {
      console.error('❌ Le document n\'est pas un retour:', documentKind);
      return res.status(400).json({ success: false, message: 'Le document n\'est pas un retour' });
    }

    // Récupérer les informations depuis le fichier JSON de configuration
    const pdfConfigService = require('../services/pdf-config.service');
    const documentSociete = pdfConfigService.getDocumentSociete();
    
    const pdfPath = await emailService.genererPDF(retourData, { 
      withStamp: !!withStamp,
      documentSociete: documentSociete
    });

    // Lire le PDF en mémoire et le supprimer immédiatement
    const pdfBuffer = require('fs').readFileSync(pdfPath);
    require('fs').unlinkSync(pdfPath);

    const fileName = path.basename(pdfPath);
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    const pdfUrl = `${baseUrl}/api/retour-pdf/${fileName}`;

    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(`retours/${fileName}`, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    setTimeout(() => {
      if (global.pdfCache) {
        global.pdfCache.delete(`retours/${fileName}`);
      }
    }, 5 * 60 * 1000);

    return res.json({ success: true, pdfUrl });
  } catch (error) {
    console.error('❌ [RetourPDF] Erreur génération PDF retour :', error);
    console.error('❌ [RetourPDF] Stack:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Erreur génération PDF retour',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Envoi du PDF de retour en pièce jointe via WhatsApp Cloud API
router.post('/send-whatsapp', async (req, res) => {
  try {
    const { document_id, phone, message } = req.body;


    if (!document_id || !phone) {
      return res.status(400).json({
        success: false,
        message: 'document_id et phone sont requis'
      });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      return res.status(500).json({
        success: false,
        message: 'Configuration WhatsApp manquante. Ajoutez dans votre .env :\nWHATSAPP_TOKEN=votre_token\nWHATSAPP_PHONE_NUMBER_ID=votre_phone_number_id'
      });
    }

    const docId = parseInt(document_id, 10);
    if (isNaN(docId)) {
      return res.status(400).json({ success: false, message: 'document_id invalide' });
    }

    const retourData = await getEmailDataByDocumentId(docId);
    if (!retourData || retourData.length === 0) {
      return res.status(404).json({ success: false, message: 'Retour introuvable' });
    }

    // Récupérer les informations depuis le fichier JSON de configuration
    const pdfConfigService = require('../services/pdf-config.service');
    const documentSociete = pdfConfigService.getDocumentSociete();
    
    const pdfPath = await emailService.genererPDF(retourData, {
      documentSociete: documentSociete
    });
    const fileName = path.basename(pdfPath);

    // Lire le fichier PDF
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfBase64 = pdfBuffer.toString('base64');


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

    const mediaResponse = await new Promise((resolve, reject) => {
      const reqUpload = https.request(uploadOptions, (resp) => {
        let data = '';
        resp.on('data', (chunk) => { data += chunk; });
        resp.on('end', () => {
          try {
            const json = JSON.parse(data || '{}');
            if (resp.statusCode && resp.statusCode >= 200 && resp.statusCode < 300) {
              resolve(json);
            } else {
              reject(new Error(json.error?.message || `Upload error: ${resp.statusCode} - ${data}`));
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


    // Étape 2: Envoyer le message avec le PDF en pièce jointe
    const messagePayload = JSON.stringify({
      messaging_product: 'whatsapp',
      to: numeroNettoye,
      type: 'document',
      document: {
        id: mediaResponse.id,
        filename: fileName,
        caption: message || 'Votre bon de retour client en pièce jointe'
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

    const messageResponse = await new Promise((resolve, reject) => {
      const reqMessage = https.request(messageOptions, (resp) => {
        let data = '';
        resp.on('data', (chunk) => { data += chunk; });
        resp.on('end', () => {
          try {
            const json = JSON.parse(data || '{}');
            if (resp.statusCode && resp.statusCode >= 200 && resp.statusCode < 300) {
              resolve(json);
            } else {
              reject(new Error(json.error?.message || `Message error: ${resp.statusCode} - ${data}`));
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

    return res.json({
      success: true,
      message: 'PDF retour envoyé en pièce jointe via WhatsApp',
      messageId: messageResponse.messages?.[0]?.id,
      mediaId: mediaResponse.id,
      fileName: fileName,
      phone: numeroNettoye
    });
  } catch (error) {
    console.error('❌ Erreur envoi WhatsApp PDF retour :', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;



