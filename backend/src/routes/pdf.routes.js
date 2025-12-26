const express = require('express');
const router = express.Router();
const emailService = require('../services/email.service');
const { getEmailDataByDocumentId } = require('../models/email.model');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');
const documentSocieteService = require('../services/document_societe.service');
const path = require('path');
const https = require('https');
const fs = require('fs');

// utilise les méthodes de emailService directement

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

router.post('/generate', async (req, res) => { 
  try {
    const { document_id, withStamp } = req.body;
    const docId = parseInt(document_id, 10);
    console.log('📄 Génération PDF demandée pour document_id:', docId, '(type:', typeof docId, ')');
    
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

    // Récupérer les informations de la société (logo, en-tête, pied de page)
    let documentSociete = null;
    try {
      if (req.user && req.user.societe_id) {
        documentSociete = await documentSocieteService.getDocumentSociete(req.user.societe_id);
        console.log('📄 Informations de la société récupérées:', documentSociete ? 'Oui' : 'Non');
      }
    } catch (societeError) {
      console.warn('⚠️ Erreur lors de la récupération des informations de la société:', societeError);
      // Ne pas bloquer la génération du PDF si les infos de la société ne sont pas disponibles
    }

    const pdfPath = await emailService.genererPDF(devisData, { 
      withStamp: !!withStamp,
      documentSociete: documentSociete,
      sequelize
    });
    
    // Déterminer le dossier selon le type de document
    const documentType = devisData[0]?.document_kind || (devisData[0] && (devisData[0].etat === 2 || devisData[0].type === 2) ? 'COMMANDE' : 'DEVIS');
    let folderName = 'devis';
    
    switch ((documentType || '').toUpperCase()) {
      case 'COMMANDE':
        folderName = 'commandes';
        break;
      case 'LIVRAISON':
      case 'BON DE LIVRAISON':
        folderName = 'livraisons';
        break;
      case 'RETOUR CLIENT':
      case 'RETOUR':
        folderName = 'retours';
        break;
      default:
        folderName = 'devis';
        break;
    }
    
    const pdfUrl = `http://localhost:3500/${folderName}/${path.basename(pdfPath)}`;

    return res.json({ success: true, pdfUrl });
  } catch (error) {
    console.error('Erreur génération PDF :', error);
    return res.status(500).json({ success: false, message: 'Erreur génération PDF', error: error.message });
  }
});

// Envoi du PDF en pièce jointe via WhatsApp Cloud API (méthode correcte)
router.post('/send-whatsapp', async (req, res) => {
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
    const pdfPath = await emailService.genererPDF(devisData);
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


module.exports = router;
