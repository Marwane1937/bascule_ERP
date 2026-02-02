const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const facturationPdfService = require('../services/facturation-pdf.service');
const { getFactureReportById, getFactureContratById } = require('../models/ventes/facturation.model');
const pdfConfigService = require('../services/pdf-config.service');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');
const { checkPdfPermission } = require('../middleware/pdf-permissions.middleware');

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
      console.log(`[FacturationPDF Route] 📅 Âge du fichier: ${Math.round(fileAge / 1000)} secondes`);
      
      if (fileAge < 60 * 60 * 1000) {
        console.log(`[FacturationPDF Route] ✅ Envoi du PDF depuis le disque: ${pdfPath}`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
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
    const { facture_id, withStamp } = req.body;
    
    if (!facture_id) {
      return res.status(400).json({ success: false, message: 'facture_id est requis' });
    }

    // Récupérer les données de la facture depuis v_facture_report
    const factureData = await getFactureReportById(facture_id);

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

    const pdfPath = await facturationPdfService.genererPDF(factureData, {
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
    console.log(`✅ PDF facture sauvegardé sur disque : ${savedPdfPath}`);
    
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

