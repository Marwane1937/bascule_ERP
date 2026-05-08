const express = require('express');
const router = express.Router();
const commandePdfService = require('../services/commande-pdf.service');
const devisHtmlPdfService = require('../services/devis-html-pdf.service');
const { getEmailDataByDocumentId } = require('../models/email.model');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');
const pdfConfigService = require('../services/pdf-config.service');
const path = require('path');
const https = require('https');
const fs = require('fs');
const {
  sortPdfLinesByDisplayOrder,
  buildPdfLineOrderSignature
} = require('../utils/pdf-line-order.helper');
const {
  removeNomenclatureComponentRows
} = require('../utils/nomenclature.helper');
const GENERATED_PDF_TTL_MS = 3 * 60 * 1000;
const PDF_RENDERER_VERSION = '20260501-nomenclature-parent-match';

function getGeneratedPdfRequestCache() {
  if (!global.generatedPdfRequestCache) {
    global.generatedPdfRequestCache = new Map();
  }
  return global.generatedPdfRequestCache;
}

function getRecentGeneratedPdf(requestCacheKey, fileCacheKey, absoluteFilePath) {
  const cache = getGeneratedPdfRequestCache();
  const cached = cache.get(requestCacheKey);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > GENERATED_PDF_TTL_MS) {
    cache.delete(requestCacheKey);
    return null;
  }

  const existsInMemory = !!(global.pdfCache && global.pdfCache.has(fileCacheKey));
  const existsOnDisk = absoluteFilePath ? fs.existsSync(absoluteFilePath) : false;
  if (!existsInMemory && !existsOnDisk) {
    cache.delete(requestCacheKey);
    return null;
  }

  return cached;
}

function rememberGeneratedPdf(requestCacheKey, pdfUrl, fileCacheKey) {
  getGeneratedPdfRequestCache().set(requestCacheKey, {
    pdfUrl,
    fileCacheKey,
    timestamp: Date.now()
  });
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function getCommandeNomenclatureNodes(sequelize, composeId, parentQuantity = 1, depth = 0, visited = new Set()) {
  const id = parseInt(composeId, 10);
  if (!id || depth > 4 || visited.has(id)) {
    return [];
  }

  const nextVisited = new Set(visited);
  nextVisited.add(id);

  const rows = await sequelize.query(
    `
      SELECT
        n.Compose_id,
        n.Composant_id,
        n.Quantite,
        n.Poids_Standard,
        n.Poids_reel,
        a.article_cod AS composant_cod,
        a.article_nom AS composant_nom,
        a.prix_vente AS composant_prix,
        f.nom AS famille_nom,
        u.nom AS unite_nom,
        CASE WHEN EXISTS (
          SELECT 1
          FROM article_Nomenclature child
          WHERE child.Compose_id = n.Composant_id
        ) THEN 1 ELSE 0 END AS has_children
      FROM article_Nomenclature n
      LEFT JOIN article a ON a.article_id = n.Composant_id
      LEFT JOIN famille f ON f.id = n.Famille
      LEFT JOIN unite u ON u.id = n.Unite
      WHERE n.Compose_id = :composeId
      ORDER BY a.article_nom ASC
    `,
    {
      replacements: { composeId: id },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const safeRows = Array.isArray(rows) ? rows : [];
  const nodes = [];

  for (const row of safeRows) {
    const componentId = parseInt(row?.Composant_id, 10) || 0;
    const unitQuantity = toFiniteNumber(row?.Quantite, 0);
    const totalQuantity = unitQuantity * toFiniteNumber(parentQuantity, 1);
    const price = toFiniteNumber(row?.composant_prix, 0);
    const node = {
      article_id: componentId,
      code: row?.composant_cod || '',
      designation: row?.composant_nom || '',
      quantite: unitQuantity,
      quantiteTotale: totalQuantity,
      prix: price,
      total: price * totalQuantity,
      famille: row?.famille_nom || '',
      unite: row?.unite_nom || '',
      poidsStandard: row?.Poids_Standard != null ? toFiniteNumber(row.Poids_Standard, 0) : null,
      poidsReel: row?.Poids_reel != null ? toFiniteNumber(row.Poids_reel, 0) : null,
      children: []
    };

    if (componentId && Number(row?.has_children || 0) === 1) {
      node.children = await getCommandeNomenclatureNodes(sequelize, componentId, totalQuantity, depth + 1, nextVisited);
    }

    nodes.push(node);
  }

  return nodes;
}

async function enrichCommandeRowsWithNomenclature(rows, sequelize) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const cache = new Map();

  for (const line of safeRows) {
    const articleId = parseInt(line?.article_id, 10) || 0;
    if (!articleId) {
      line.nomenclatureComponents = [];
      continue;
    }

    const cacheKey = `${articleId}:${toFiniteNumber(line?.quantite, 1)}`;
    if (!cache.has(cacheKey)) {
      cache.set(cacheKey, await getCommandeNomenclatureNodes(sequelize, articleId, toFiniteNumber(line?.quantite, 1)));
    }

    line.nomenclatureComponents = cache.get(cacheKey) || [];
  }

  return safeRows;
}

function buildCommandeNomenclatureSignature(rows) {
  const parts = (Array.isArray(rows) ? rows : [])
    .filter((line) => Array.isArray(line?.nomenclatureComponents) && line.nomenclatureComponents.length > 0)
    .map((line) => `${line.article_id}:${JSON.stringify(line.nomenclatureComponents)}`);
  return parts.join('|');
}

/**
 * Routes pour la génération de PDF des BONS DE COMMANDE
 * Ce service est séparé du service de devis pour éviter toute confusion
 */

// Route GET publique pour servir les PDFs (appelée via window.open() sans headers)
router.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    console.log(`[CommandePDF Route] 🔍 Requête GET pour: ${filename}`);
    
    // Vérifier que le nom de fichier est valide (éviter les attaques path traversal)
    if (!filename || !filename.endsWith('.pdf') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      console.log(`[CommandePDF Route] ❌ Nom de fichier invalide: ${filename}`);
      return res.status(400).json({ success: false, message: 'Nom de fichier invalide' });
    }

    const cacheKey = `commandes/${filename}`;
    
    // Vérifier le cache mémoire
    if (global.pdfCache && global.pdfCache.has(cacheKey)) {
      const cached = global.pdfCache.get(cacheKey);
      // Vérifier que le cache n'est pas trop vieux (1 heure)
      if (Date.now() - cached.timestamp < 60 * 60 * 1000) {
        console.log(`[CommandePDF Route] ✅ PDF trouvé dans le cache: ${cacheKey}`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', cached.buffer.length);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
        return res.send(cached.buffer);
      } else {
        console.log(`[CommandePDF Route] ⏰ Cache expiré pour: ${cacheKey}`);
        // Supprimer du cache si trop vieux
        global.pdfCache.delete(cacheKey);
      }
    }

    // Si pas dans le cache, vérifier si le fichier existe sur disque
    const commandeDir = path.join(__dirname, '..', 'public', 'commandes');
    const pdfPath = path.join(commandeDir, filename);
    console.log(`[CommandePDF Route] 🔍 Vérification fichier sur disque: ${pdfPath}`);
    
    if (fs.existsSync(pdfPath)) {
      // Vérifier l'âge du fichier (ne pas servir les fichiers de plus de 1 heure)
      const stats = fs.statSync(pdfPath);
      const fileAge = Date.now() - stats.mtime.getTime();
      console.log(`[CommandePDF Route] 📅 ge du fichier: ${Math.round(fileAge / 1000)} secondes`);
      
      if (fileAge < 60 * 60 * 1000) {
        console.log(`[CommandePDF Route] ✅ Envoi du PDF depuis le disque: ${pdfPath}`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
        return res.sendFile(pdfPath);
      } else {
        console.log(`[CommandePDF Route] ⏰ Fichier trop vieux, suppression: ${pdfPath}`);
        // Supprimer le fichier s'il est trop vieux
        try {
          fs.unlinkSync(pdfPath);
          console.log(`🗑️ Fichier PDF supprimé (trop vieux): ${pdfPath}`);
        } catch (unlinkError) {
          console.error('Erreur suppression fichier PDF:', unlinkError);
        }
      }
    } else {
      console.log(`[CommandePDF Route] ❌ Fichier non trouvé: ${pdfPath}`);
    }

    // Si le fichier n'existe pas, retourner 404
    console.log(`[CommandePDF Route] ❌ PDF introuvable: ${cacheKey}`);
    return res.status(404).json({ success: false, message: 'PDF introuvable' });
  } catch (error) {
    console.error('[CommandePDF Route] ❌ Erreur service PDF :', error);
    console.error('[CommandePDF Route] ❌ Stack:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Erreur service PDF commande',
      error: error.message
    });
  }
});

// Créer un router séparé pour les routes publiques (sans authentification) - gardé pour compatibilité
const publicRouter = express.Router();

// Servir un PDF de commande directement via GET (route publique) - route alternative
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

// Routes POST protégées (nécessitent authentification)
const { checkPdfPermission } = require('../middleware/pdf-permissions.middleware');
router.post('/generate', authenticateToken, databaseInjector.injectConnection.bind(databaseInjector), checkPdfPermission('commande'), async (req, res) => {
  try {
    const { document_id, withStamp } = req.body;
    const sequelize = req.sequelize || require('../config/database');
    let commandeData = await getEmailDataByDocumentId(document_id, sequelize, { forceDocumentType: 'COMMANDE' });

    if (!commandeData || commandeData.length === 0) {
      return res.status(404).json({ success: false, message: 'Commande introuvable' });
    }
    commandeData = sortPdfLinesByDisplayOrder(commandeData);
    await enrichCommandeRowsWithNomenclature(commandeData, sequelize);
    commandeData = removeNomenclatureComponentRows(commandeData);
    const lineOrderSignature = [
      buildPdfLineOrderSignature(commandeData),
      buildCommandeNomenclatureSignature(commandeData)
    ].filter(Boolean).join(':nom:');

    // Récupérer les informations depuis le fichier JSON de configuration (pdf-config.json)
    const documentSociete = pdfConfigService.getDocumentSociete();
    console.log('[commande-pdf/generate] 📄 Informations de la société récupérées depuis la configuration:', documentSociete ? 'Oui' : 'Non');

    let isClientExonerated = false;
    const firstLine = commandeData[0] || {};
    if (firstLine.part_id) {
      try {
        const exonerationModel = require('../models/base/partenaire-exoneration.model');
        const exonerations = await exonerationModel.getAllExonerationsByPartId(firstLine.part_id, sequelize);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        isClientExonerated = (Array.isArray(exonerations) ? exonerations : []).some((exon) => {
          if (!exon?.date_debut || !exon?.date_fin) return false;
          const dateDebut = new Date(exon.date_debut);
          const dateFin = new Date(exon.date_fin);
          dateDebut.setHours(0, 0, 0, 0);
          dateFin.setHours(0, 0, 0, 0);
          return today >= dateDebut && today <= dateFin;
        });
      } catch (error) {
        console.warn('[commande-pdf/generate] Vérification exonération ignorée:', error.message);
      }
    }

    const commandeDir = path.join(__dirname, '..', 'public', 'commandes');
    const numeroDoc = commandeData[0]?.numero || 'COMMANDE';
    const nomClient = (commandeData[0]?.client || 'CLIENT')
      .toString()
      .trim()
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    const fileName = `${numeroDoc}_${nomClient}.pdf`;
    const savedPdfPath = path.join(commandeDir, fileName);
    const requestCacheKey = ['commande-pdf', PDF_RENDERER_VERSION, document_id, withStamp ? 'stamp' : 'nostamp', lineOrderSignature].join(':');
    const fileCacheKey = `commandes/${fileName}`;
    const cachedPdf = getRecentGeneratedPdf(requestCacheKey, fileCacheKey, savedPdfPath);
    if (cachedPdf) {
      console.log(`[commande-pdf/generate] ♻️ PDF recent renvoye sans regeneration: ${fileCacheKey}`);
      return res.json({ success: true, pdfUrl: cachedPdf.pdfUrl });
    }

    const pdfBuffer = await devisHtmlPdfService.generatePdfBuffer(commandeData, {
      withStamp: !!withStamp,
      documentSociete,
      isClientExonerated,
      hideNomenclatureComponents: false
    });
    
    // Lire le PDF en mémoire
    
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(commandeDir)) {
      fs.mkdirSync(commandeDir, { recursive: true });
    }

    // Sauvegarder le PDF sur disque (ne pas le supprimer immédiatement)
    fs.writeFileSync(savedPdfPath, pdfBuffer);
    console.log(`✅ PDF commande sauvegardé sur disque : ${savedPdfPath}`);
    
    // Supprimer le fichier temporaire original s'il est différent
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    const pdfUrl = `${baseUrl}/api/commande-pdf/${fileName}?v=${encodeURIComponent(PDF_RENDERER_VERSION)}&sig=${encodeURIComponent(lineOrderSignature)}`;

    // Stocker aussi en cache mémoire pour accès rapide
    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(fileCacheKey, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    rememberGeneratedPdf(requestCacheKey, pdfUrl, fileCacheKey);
    
    // Nettoyer le cache mémoire après 1 heure
    setTimeout(() => {
      if (global.pdfCache) {
        global.pdfCache.delete(fileCacheKey);
      }
    }, 60 * 60 * 1000);

    // Nettoyer le fichier sur disque après 1 heure
    setTimeout(() => {
      try {
        if (fs.existsSync(savedPdfPath)) {
          fs.unlinkSync(savedPdfPath);
          console.log(`🗑️ Fichier PDF commande supprimé après 1h : ${savedPdfPath}`);
        }
      } catch (unlinkError) {
        console.error('Erreur suppression fichier PDF:', unlinkError);
      }
    }, 60 * 60 * 1000);

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


// Envoi du PDF de commande en pièce jointe via WhatsApp Cloud API (route protégée)
router.post('/send-whatsapp', authenticateToken, databaseInjector.injectConnection.bind(databaseInjector), async (req, res) => {
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

    const sequelize = req.sequelize || require('../config/database');
    let commandeData = sortPdfLinesByDisplayOrder(
      await getEmailDataByDocumentId(document_id, sequelize, { forceDocumentType: 'COMMANDE' })
    );
    if (!commandeData || commandeData.length === 0) {
      return res.status(404).json({ success: false, message: 'Commande introuvable' });
    }
    await enrichCommandeRowsWithNomenclature(commandeData, sequelize);
    commandeData = removeNomenclatureComponentRows(commandeData);

    // Récupérer les informations depuis le fichier JSON de configuration
    const pdfConfigService = require('../services/pdf-config.service');
    const documentSociete = pdfConfigService.getDocumentSociete();
    
    const pdfPath = await commandePdfService.genererPDF(commandeData, {
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
