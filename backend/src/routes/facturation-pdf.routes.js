const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const facturationPdfService = require('../services/facturation-pdf.service');
const devisHtmlPdfService = require('../services/devis-html-pdf.service');
const { getFactureReportById, getFactureContratById } = require('../models/ventes/facturation.model');
const pdfConfigService = require('../services/pdf-config.service');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');
const { checkPdfPermission } = require('../middleware/pdf-permissions.middleware');
const {
  sortPdfLinesByDisplayOrder,
  buildPdfLineOrderSignature
} = require('../utils/pdf-line-order.helper');
const {
  enrichRowsWithNomenclature,
  buildNomenclatureSignature,
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

function getRecentGeneratedPdf(requestCacheKey) {
  const cache = getGeneratedPdfRequestCache();
  const cached = cache.get(requestCacheKey);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > GENERATED_PDF_TTL_MS) {
    cache.delete(requestCacheKey);
    return null;
  }

  const existsInMemory = !!(cached.fileCacheKey && global.pdfCache && global.pdfCache.has(cached.fileCacheKey));
  const existsOnDisk = cached.absoluteFilePath ? fs.existsSync(cached.absoluteFilePath) : false;
  if (!existsInMemory && !existsOnDisk) {
    cache.delete(requestCacheKey);
    return null;
  }

  return cached;
}

function rememberGeneratedPdf(requestCacheKey, pdfUrl, fileCacheKey, absoluteFilePath) {
  getGeneratedPdfRequestCache().set(requestCacheKey, {
    pdfUrl,
    fileCacheKey,
    absoluteFilePath,
    timestamp: Date.now()
  });
}

/**
 * Routes pour la génération de PDF des FACTURES
 * Utilise la vue v_facture_report
 */

// Route GET publique pour servir les PDFs (appelée via window.open() sans headers)
router.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    console.log(`[FacturationPDF Route] 🔍 Requête GET pour: ${filename}`);
    
    // Vérifier que le nom de fichier est valide (éviter les attaques path traversal)
    if (!filename || !filename.endsWith('.pdf') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      console.log(`[FacturationPDF Route] ❌ Nom de fichier invalide: ${filename}`);
      return res.status(400).json({ success: false, message: 'Nom de fichier invalide' });
    }

    const cacheKey = `factures/${filename}`;
    
    // Vérifier le cache mémoire
    if (global.pdfCache && global.pdfCache.has(cacheKey)) {
      const cached = global.pdfCache.get(cacheKey);
      // Vérifier que le cache n'est pas trop vieux (1 heure)
      if (Date.now() - cached.timestamp < 60 * 60 * 1000) {
        console.log(`[FacturationPDF Route] ✅ PDF trouvé dans le cache: ${cacheKey}`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', cached.buffer.length);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
        return res.send(cached.buffer);
      } else {
        console.log(`[FacturationPDF Route] ⏰ Cache expiré pour: ${cacheKey}`);
        // Supprimer du cache si trop vieux
        global.pdfCache.delete(cacheKey);
      }
    }

    // Si pas dans le cache, vérifier si le fichier existe sur disque
    const factureDir = path.join(__dirname, '..', 'public', 'factures');
    const pdfPath = path.join(factureDir, filename);
    console.log(`[FacturationPDF Route] 🔍 Vérification fichier sur disque: ${pdfPath}`);
    
    if (fs.existsSync(pdfPath)) {
      // Vérifier l'âge du fichier (ne pas servir les fichiers de plus de 1 heure)
      const stats = fs.statSync(pdfPath);
      const fileAge = Date.now() - stats.mtime.getTime();
      console.log(`[FacturationPDF Route] 📅 Age du fichier: ${Math.round(fileAge / 1000)} secondes`);
      
      if (fileAge < 60 * 60 * 1000) {
        console.log(`[FacturationPDF Route] ✅ Envoi du PDF depuis le disque: ${pdfPath}`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
        return res.sendFile(pdfPath);
      } else {
        console.log(`[FacturationPDF Route] ⏰ Fichier trop vieux, suppression: ${pdfPath}`);
        // Supprimer le fichier s'il est trop vieux
        try {
          fs.unlinkSync(pdfPath);
          console.log(`🗑️ Fichier PDF supprimé (trop vieux): ${pdfPath}`);
        } catch (unlinkError) {
          console.error('Erreur suppression fichier PDF:', unlinkError);
        }
      }
    } else {
      console.log(`[FacturationPDF Route] ❌ Fichier non trouvé: ${pdfPath}`);
    }

    // Si le fichier n'existe pas, retourner 404
    console.log(`[FacturationPDF Route] ❌ PDF introuvable: ${cacheKey}`);
    return res.status(404).json({ success: false, message: 'PDF introuvable' });
  } catch (error) {
    console.error('[FacturationPDF Route] ❌ Erreur service PDF :', error);
    console.error('[FacturationPDF Route] ❌ Stack:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Erreur service PDF facturation',
      error: error.message
    });
  }
});

// Routes POST protégées (nécessitent authentification)
// Générer un PDF de facture
router.post('/generate', authenticateToken, databaseInjector.injectConnection.bind(databaseInjector), checkPdfPermission('facturation'), async (req, res) => {
  try {
    const { facture_id, withStamp, simple } = req.body;
    
    if (!facture_id) {
      return res.status(400).json({ success: false, message: 'facture_id est requis' });
    }

    // Récupérer les données de la facture depuis v_facture_report
    const baseRequestCacheKey = ['facturation-pdf', PDF_RENDERER_VERSION, facture_id, simple ? 'simple' : 'standard', withStamp ? 'stamp' : 'nostamp'].join(':');
    let requestCacheKey = baseRequestCacheKey;
    const cachedPdfAfterLookup = null;
    if (cachedPdfAfterLookup) {
      console.log(`[facturation-pdf/generate] â™»ï¸ PDF recent renvoye sans regeneration: ${cachedPdfAfterLookup.fileCacheKey || requestCacheKey}`);
      return res.json({ success: true, pdfUrl: cachedPdfAfterLookup.pdfUrl });
    }

    let factureData = await getFactureReportById(facture_id, req.sequelize);

    if (!factureData || (Array.isArray(factureData) && factureData.length === 0)) {
      console.error('[facturation-pdf/generate] ❌ Aucune donnée trouvée pour facture_id:', facture_id);
      return res.status(404).json({ 
        success: false, 
        message: 'Facture introuvable ou aucune ligne de détail trouvée',
        facture_id: facture_id
      });
    }

    // Récupérer les informations depuis le fichier JSON de configuration
    const documentSociete = pdfConfigService.getDocumentSociete();

    factureData = sortPdfLinesByDisplayOrder(factureData);
    factureData = await enrichRowsWithNomenclature(factureData, req.sequelize);
    factureData = removeNomenclatureComponentRows(factureData);
    const lineOrderSignature = [
      buildPdfLineOrderSignature(factureData),
      buildNomenclatureSignature(factureData)
    ].filter(Boolean).join('|nomenclature:');
    requestCacheKey = [baseRequestCacheKey, lineOrderSignature].join(':');

    let isClientExonerated = false;
    const firstLine = factureData[0] || {};
    if (firstLine.part_id) {
      try {
        const exonerationModel = require('../models/base/partenaire-exoneration.model');
        const exonerations = await exonerationModel.getAllExonerationsByPartId(firstLine.part_id, req.sequelize);
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
        console.warn('[facturation-pdf/generate] Vérification exonération ignorée:', error.message);
      }
    }

    const factureHtmlData = (Array.isArray(factureData) ? factureData : []).map((line) => ({
      ...line,
      designation: line.designation || line.article || line.article_nom || '',
      article: line.designation || line.article || line.article_nom || '',
      numero_livraison: line.numero_livraison || ''
    }));

    const factureDir = path.join(__dirname, '..', 'public', 'factures');
    const numeroDoc = factureData[0]?.numero || 'FACTURE';
    const nomClient = (factureData[0]?.client || 'CLIENT')
      .toString()
      .trim()
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
    const simpleSuffix = simple ? '_simple' : '';
    const fileName = `${numeroDoc}_${nomClient}${simpleSuffix}.pdf`;
    const savedPdfPath = path.join(factureDir, fileName);
    const fileCacheKey = `factures/${fileName}`;
    const cachedPdf = getRecentGeneratedPdf(requestCacheKey);
    if (cachedPdf) {
      console.log(`[facturation-pdf/generate] ♻️ PDF recent renvoye sans regeneration: ${fileCacheKey}`);
      return res.json({ success: true, pdfUrl: cachedPdf.pdfUrl });
    }

    const pdfBuffer = await devisHtmlPdfService.generatePdfBuffer(factureHtmlData, {
      withStamp: !!withStamp,
      documentSociete,
      isClientExonerated,
      simpleMode: !!simple,
      hideNomenclatureComponents: false
    });
    
    // Lire le PDF en mémoire
    
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(factureDir)) {
      fs.mkdirSync(factureDir, { recursive: true });
    }

    // Sauvegarder le PDF sur disque (ne pas le supprimer immédiatement)
    fs.writeFileSync(savedPdfPath, pdfBuffer);
    console.log(`✅ PDF facture sauvegardé sur disque : ${savedPdfPath}`);
    
    // Supprimer le fichier temporaire original s'il est différent
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    const pdfUrl = `${baseUrl}/api/facturation-pdf/${fileName}?v=${encodeURIComponent(PDF_RENDERER_VERSION)}&sig=${encodeURIComponent(lineOrderSignature)}`;

    // Stocker aussi en cache mémoire pour accès rapide
    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(fileCacheKey, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    rememberGeneratedPdf(requestCacheKey, pdfUrl, fileCacheKey, savedPdfPath);
    
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
          console.log(`🗑️ Fichier PDF facture supprimé après 1h : ${savedPdfPath}`);
        }
      } catch (unlinkError) {
        console.error('Erreur suppression fichier PDF:', unlinkError);
      }
    }, 60 * 60 * 1000);

    return res.json({ success: true, pdfUrl });
  } catch (error) {
    console.error('Erreur génération PDF facture :', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur génération PDF facture',
      error: error.message
    });
  }
});

// Générer un PDF de facture contrat (route protégée)
router.post('/generate-contrat', authenticateToken, databaseInjector.injectConnection.bind(databaseInjector), async (req, res) => {
  try {
    const { facture_id, withStamp } = req.body;
    
    if (!facture_id) {
      return res.status(400).json({ success: false, message: 'facture_id est requis' });
    }

    // Récupérer les données de la facture depuis v_facture_contrat
    const factureData = await getFactureContratById(facture_id, req.sequelize);

    if (!factureData || (Array.isArray(factureData) && factureData.length === 0)) {
      console.error('[facturation-pdf/generate-contrat] ❌ Aucune donnée trouvée pour facture_id:', facture_id);
      return res.status(404).json({ 
        success: false, 
        message: 'Facture contrat introuvable ou aucune ligne de détail trouvée',
        facture_id: facture_id
      });
    }

    // Récupérer les informations depuis le fichier JSON de configuration
    const documentSociete = pdfConfigService.getDocumentSociete();

    const pdfPath = await facturationPdfService.genererPDFContrat(factureData, {
      withStamp: !!withStamp,
      documentSociete: documentSociete,
      sequelize: req.sequelize
    });
    
    // Lire le PDF en mémoire
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    // Créer le dossier s'il n'existe pas
    const factureDir = path.join(__dirname, '..', 'public', 'factures');
    if (!fs.existsSync(factureDir)) {
      fs.mkdirSync(factureDir, { recursive: true });
    }

    // Sauvegarder le PDF sur disque (ne pas le supprimer immédiatement)
    const savedPdfPath = path.join(factureDir, path.basename(pdfPath));
    fs.writeFileSync(savedPdfPath, pdfBuffer);
    console.log(`✅ PDF facture contrat sauvegardé sur disque : ${savedPdfPath}`);
    
    // Supprimer le fichier temporaire original s'il est différent
    if (pdfPath !== savedPdfPath && fs.existsSync(pdfPath)) {
      try {
        fs.unlinkSync(pdfPath);
      } catch (unlinkError) {
        console.warn('Erreur suppression fichier temporaire:', unlinkError);
      }
    }

    const fileName = path.basename(savedPdfPath);
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    const pdfUrl = `${baseUrl}/api/facturation-pdf/${fileName}`;

    // Stocker aussi en cache mémoire pour accès rapide
    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(`factures/${fileName}`, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    
    // Nettoyer le cache mémoire après 1 heure
    setTimeout(() => {
      if (global.pdfCache) {
        global.pdfCache.delete(`factures/${fileName}`);
      }
    }, 60 * 60 * 1000);

    // Nettoyer le fichier sur disque après 1 heure
    setTimeout(() => {
      try {
        if (fs.existsSync(savedPdfPath)) {
          fs.unlinkSync(savedPdfPath);
          console.log(`🗑️ Fichier PDF facture contrat supprimé après 1h : ${savedPdfPath}`);
        }
      } catch (unlinkError) {
        console.error('Erreur suppression fichier PDF:', unlinkError);
      }
    }, 60 * 60 * 1000);

    return res.json({ success: true, pdfUrl });
  } catch (error) {
    console.error('Erreur génération PDF facture contrat :', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur génération PDF facture contrat',
      error: error.message
    });
  }
});

module.exports = router;
