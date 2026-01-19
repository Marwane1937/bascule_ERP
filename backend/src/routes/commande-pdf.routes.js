const express = require('express');
const router = express.Router();
const commandePdfService = require('../services/commande-pdf.service');
const { getEmailDataByDocumentId } = require('../models/email.model');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');
const path = require('path');
const https = require('https');
const fs = require('fs');

/**
 * Routes pour la génération de PDF des BONS DE COMMANDE
 * Ce service est séparé du service de devis pour éviter toute confusion
 */

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Créer un router séparé pour les routes publiques (sans authentification)
const publicRouter = express.Router();

// Servir un PDF de commande directement via GET (route publique)
publicRouter.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const path = require('path');
    const fs = require('fs');

    // Vérifier que le nom de fichier est valide (éviter les attaques path traversal)
    if (!filename || !filename.endsWith('.pdf') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Nom de fichier invalide' });
    }

    const commandeDir = path.join(__dirname, '..', 'public', 'commandes');
    const pdfPath = path.join(commandeDir, filename);

    // Vérifier si le fichier existe
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ success: false, message: 'PDF introuvable' });
    }

    // Servir le fichier PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Erreur lors de la récupération du PDF commande :', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur récupération PDF commande',
      error: error.message
    });
  }
});

// Toutes les autres routes nécessitent une authentification
router.use(authenticateToken);

// Générer un PDF de commande
router.post('/generate', async (req, res) => {
  try {
    const { document_id, withStamp } = req.body;
    const commandeData = await getEmailDataByDocumentId(document_id);

    if (!commandeData || commandeData.length === 0) {
      return res.status(404).json({ success: false, message: 'Commande introuvable' });
    }

    // Récupérer les informations du document_societe si disponibles
    const documentSociete = req.body.documentSociete || null;

    const pdfPath = await commandePdfService.genererPDF(commandeData, {
      withStamp: !!withStamp,
      documentSociete: documentSociete
    });
    
    const pdfUrl = `http://localhost:3500/commandes/${path.basename(pdfPath)}`;

    return res.json({ success: true, pdfUrl });
  } catch (error) {
    console.error('Erreur génération PDF commande :', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur génération PDF commande',
      error: error.message
    });
  }
});


// Envoi du PDF de commande en pièce jointe via WhatsApp Cloud API
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

    const commandeData = await getEmailDataByDocumentId(document_id);
    if (!commandeData || commandeData.length === 0) {
      return res.status(404).json({ success: false, message: 'Commande introuvable' });
    }

    const pdfPath = await commandePdfService.genererPDF(commandeData);
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
        caption: message || 'Votre bon de commande en pièce jointe'
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
      message: 'PDF commande envoyé en pièce jointe via WhatsApp',
      messageId: messageResponse.messages?.[0]?.id,
      mediaId: mediaResponse.id,
      fileName: fileName,
      phone: numeroNettoye
    });
  } catch (error) {
    console.error('❌ Erreur envoi WhatsApp PDF commande :', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Exporter les deux routers : router (protégé) et publicRouter (public)
module.exports = {
  router, // Routes avec authentification (/api/commande-pdf/*)
  publicRouter // Routes publiques (/commandes/*)
};

