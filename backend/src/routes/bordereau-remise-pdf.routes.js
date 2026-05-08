const express = require('express');
const router = express.Router();
const bordereauRemisePdfService = require('../services/finance/bordereau-remise-pdf.service');
const bordereauRemiseModel = require('../models/finance/bordereau-remise.model');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');
const { checkPdfPermission } = require('../middleware/pdf-permissions.middleware');
const path = require('path');
const fs = require('fs');

/**
 * Routes pour la génération de PDF des BORDEREAUX DE REMISE
 */

// Route GET publique pour servir les PDFs (appelée via window.open() sans headers)
router.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    console.log(`[BordereauRemisePDF Route] 🔍 Requête GET pour: ${filename}`);
    
    // Vérifier que le nom de fichier est valide (éviter les attaques path traversal)
    if (!filename || !filename.endsWith('.pdf') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      console.log(`[BordereauRemisePDF Route] ❌ Nom de fichier invalide: ${filename}`);
      return res.status(400).json({ success: false, message: 'Nom de fichier invalide' });
    }

    const cacheKey = `bordereaux-remise/${filename}`;
    
    // Vérifier le cache mémoire
    if (global.pdfCache && global.pdfCache.has(cacheKey)) {
      const cached = global.pdfCache.get(cacheKey);
      // Vérifier que le cache n'est pas trop vieux (1 heure)
      if (Date.now() - cached.timestamp < 60 * 60 * 1000) {
        console.log(`[BordereauRemisePDF Route] ✅ PDF trouvé dans le cache: ${cacheKey}`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', cached.buffer.length);
        return res.send(cached.buffer);
      } else {
        console.log(`[BordereauRemisePDF Route] ⏰ Cache expiré pour: ${cacheKey}`);
        // Supprimer du cache si trop vieux
        global.pdfCache.delete(cacheKey);
      }
    }

    // Si pas dans le cache, vérifier si le fichier existe sur disque
    const bordereauDir = path.join(__dirname, '..', 'public', 'bordereaux-remise');
    const pdfPath = path.join(bordereauDir, filename);
    console.log(`[BordereauRemisePDF Route] 🔍 Vérification fichier sur disque: ${pdfPath}`);
    
    if (fs.existsSync(pdfPath)) {
      // Vérifier l'âge du fichier (ne pas servir les fichiers de plus de 1 heure)
      const stats = fs.statSync(pdfPath);
      const fileAge = Date.now() - stats.mtime.getTime();
      console.log(`[BordereauRemisePDF Route] 📅 ge du fichier: ${Math.round(fileAge / 1000)} secondes`);
      
      if (fileAge < 60 * 60 * 1000) {
        console.log(`[BordereauRemisePDF Route] ✅ Envoi du PDF depuis le disque: ${pdfPath}`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        return res.sendFile(pdfPath);
      } else {
        console.log(`[BordereauRemisePDF Route] ⏰ Fichier trop vieux, suppression: ${pdfPath}`);
        // Supprimer le fichier s'il est trop vieux
        try {
          fs.unlinkSync(pdfPath);
          console.log(`🗑️ Fichier PDF supprimé (trop vieux): ${pdfPath}`);
        } catch (unlinkError) {
          console.error('Erreur suppression fichier PDF:', unlinkError);
        }
      }
    } else {
      console.log(`[BordereauRemisePDF Route] ❌ Fichier non trouvé: ${pdfPath}`);
    }

    // Si le fichier n'existe pas, retourner 404
    console.log(`[BordereauRemisePDF Route] ❌ PDF introuvable: ${cacheKey}`);
    return res.status(404).json({ success: false, message: 'PDF introuvable' });
  } catch (error) {
    console.error('[BordereauRemisePDF Route] ❌ Erreur service PDF :', error);
    console.error('[BordereauRemisePDF Route] ❌ Stack:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Erreur service PDF bordereau',
      error: error.message
    });
  }
});

// Routes POST protégées (nécessitent authentification)
router.post('/generate', authenticateToken, databaseInjector.injectConnection.bind(databaseInjector), checkPdfPermission('bordereau_remise'), async (req, res) => {
  try {
    const { bordereau_id } = req.body;
    const sequelize = req.sequelize || require('../config/database').getConnection();
    
    if (!bordereau_id) {
      return res.status(400).json({ success: false, message: 'bordereau_id est requis' });
    }

    const bordereauData = await bordereauRemiseModel.getBordereauForPDF(bordereau_id);

    if (!bordereauData || bordereauData.length === 0) {
      return res.status(404).json({ success: false, message: 'Bordereau introuvable' });
    }

    // Récupérer les informations depuis le fichier JSON de configuration
    const pdfConfigService = require('../services/pdf-config.service');
    const documentSociete = pdfConfigService.getDocumentSociete();
    console.log('[bordereau-remise-pdf/generate] 📄 Informations de la société récupérées depuis la configuration:', documentSociete ? 'Oui' : 'Non');

    const pdfPath = await bordereauRemisePdfService.genererPDF(bordereauData, {
      documentSociete: documentSociete
    });
    
    // Lire le PDF en mémoire
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    // Créer le dossier s'il n'existe pas
    const bordereauDir = path.join(__dirname, '..', 'public', 'bordereaux-remise');
    if (!fs.existsSync(bordereauDir)) {
      fs.mkdirSync(bordereauDir, { recursive: true });
    }

    // Sauvegarder le PDF sur disque (ne pas le supprimer immédiatement)
    const savedPdfPath = path.join(bordereauDir, path.basename(pdfPath));
    fs.writeFileSync(savedPdfPath, pdfBuffer);
    console.log(`✅ PDF bordereau sauvegardé sur disque : ${savedPdfPath}`);
    
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
    const pdfUrl = `${baseUrl}/api/bordereau-remise-pdf/${fileName}`;

    // Stocker aussi en cache mémoire pour accès rapide
    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(`bordereaux-remise/${fileName}`, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    
    // Nettoyer le cache mémoire après 1 heure
    setTimeout(() => {
      if (global.pdfCache) {
        global.pdfCache.delete(`bordereaux-remise/${fileName}`);
      }
    }, 60 * 60 * 1000);

    // Nettoyer le fichier sur disque après 1 heure
    setTimeout(() => {
      try {
        if (fs.existsSync(savedPdfPath)) {
          fs.unlinkSync(savedPdfPath);
          console.log(`🗑️ Fichier PDF bordereau supprimé après 1h : ${savedPdfPath}`);
        }
      } catch (unlinkError) {
        console.error('Erreur suppression fichier PDF:', unlinkError);
      }
    }, 60 * 60 * 1000);

    return res.json({ success: true, pdfUrl });
  } catch (error) {
    console.error('Erreur génération PDF bordereau :', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur génération PDF bordereau',
      error: error.message
    });
  }
});

module.exports = router;

