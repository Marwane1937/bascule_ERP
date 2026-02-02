const express = require('express');
const router = express.Router();
const receptionPdfService = require('../services/reception-pdf.service');
const receptionModel = require('../models/achats/reception.model');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');
const { checkPdfPermission } = require('../middleware/pdf-permissions.middleware');
const path = require('path');
const fs = require('fs');

/**
 * Routes pour la génération de PDF des BONS DE RÉCEPTION
 */

// Route GET publique pour servir les PDFs (appelée via window.open() sans headers)
router.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    console.log(`[ReceptionPDF Route] 🔍 Requête GET pour: ${filename}`);
    
    // Vérifier que le nom de fichier est valide (éviter les attaques path traversal)
    if (!filename || !filename.endsWith('.pdf') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      console.log(`[ReceptionPDF Route] ❌ Nom de fichier invalide: ${filename}`);
      return res.status(400).json({ success: false, message: 'Nom de fichier invalide' });
    }

    const cacheKey = `receptions/${filename}`;
    
    // Vérifier le cache mémoire
    if (global.pdfCache && global.pdfCache.has(cacheKey)) {
      const cached = global.pdfCache.get(cacheKey);
      // Vérifier que le cache n'est pas trop vieux (1 heure)
      if (Date.now() - cached.timestamp < 60 * 60 * 1000) {
        console.log(`[ReceptionPDF Route] ✅ PDF trouvé dans le cache: ${cacheKey}`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length', cached.buffer.length);
        return res.send(cached.buffer);
      } else {
        console.log(`[ReceptionPDF Route] ⏰ Cache expiré pour: ${cacheKey}`);
        // Supprimer du cache si trop vieux
        global.pdfCache.delete(cacheKey);
      }
    }

    // Si pas dans le cache, vérifier si le fichier existe sur disque
    const receptionDir = path.join(__dirname, '..', 'public', 'receptions');
    const pdfPath = path.join(receptionDir, filename);
    console.log(`[ReceptionPDF Route] 🔍 Vérification fichier sur disque: ${pdfPath}`);
    
    if (fs.existsSync(pdfPath)) {
      // Vérifier l'âge du fichier (ne pas servir les fichiers de plus de 1 heure)
      const stats = fs.statSync(pdfPath);
      const fileAge = Date.now() - stats.mtime.getTime();
      console.log(`[ReceptionPDF Route] 📅 Âge du fichier: ${Math.round(fileAge / 1000)} secondes`);
      
      if (fileAge < 60 * 60 * 1000) {
        console.log(`[ReceptionPDF Route] ✅ Envoi du PDF depuis le disque: ${pdfPath}`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        return res.sendFile(pdfPath);
      } else {
        console.log(`[ReceptionPDF Route] ⏰ Fichier trop vieux, suppression: ${pdfPath}`);
        // Supprimer le fichier s'il est trop vieux
        try {
          fs.unlinkSync(pdfPath);
          console.log(`🗑️ Fichier PDF supprimé (trop vieux): ${pdfPath}`);
        } catch (unlinkError) {
          console.error('Erreur suppression fichier PDF:', unlinkError);
        }
      }
    } else {
      console.log(`[ReceptionPDF Route] ❌ Fichier non trouvé: ${pdfPath}`);
    }

    // Si le fichier n'existe pas, retourner 404
    console.log(`[ReceptionPDF Route] ❌ PDF introuvable: ${cacheKey}`);
    return res.status(404).json({ success: false, message: 'PDF introuvable' });
  } catch (error) {
    console.error('[ReceptionPDF Route] ❌ Erreur service PDF :', error);
    console.error('[ReceptionPDF Route] ❌ Stack:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Erreur service PDF réception',
      error: error.message
    });
  }
});

// Fonction pour récupérer les données de réception pour le PDF
const getReceptionDataForPdf = async (document_id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || require('../config/database').getConnection();
  
  const result = await sequelize.query(
    `
      SELECT 
        s.id AS document_id,
        s.numero,
        s.description AS client_ref,
        s.date,
        s.part_id,
        p.nom AS fournisseur,
        p.nom AS client,
        sd.article_id AS article_id,
        a.article_cod,
        sd.description AS designation,
        a.article_nom,
        sd.quantite,
        sd.prix,
        CASE WHEN sd.description IS NULL OR LTRIM(RTRIM(CAST(sd.description AS VARCHAR(MAX)))) = '' THEN a.article_nom ELSE sd.description END AS article,
        sd.taux_tva,
        CASE 
          WHEN sd.remise <> 0 THEN (sd.quantite * sd.prix) - ((sd.quantite * sd.prix) * sd.remise)
          ELSE (sd.quantite * sd.prix) - ISNULL(sd.remise_montant, 0)
        END AS remise,
        '' AS condition,
        '' AS expedition,
        '' AS transporteur,
        adr.nom AS adresse,
        '' AS ville,
        sd.id AS ligne_id,
        s.type,
        s.etat,
        'RÉCEPTION' AS document_kind
      FROM stock s
      LEFT JOIN stock_detail sd ON sd.stock_id = s.id AND sd.sens = 1
      LEFT JOIN partenaire p ON p.part_id = s.part_id AND p.type = 2
      LEFT JOIN adresse adr ON adr.part_id = p.part_id
      LEFT JOIN article a ON a.article_id = sd.article_id
      WHERE s.id = :id AND s.type = 1
      ORDER BY sd.id
    `,
    {
      replacements: { id: document_id },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  return result;
};

// Routes POST protégées (nécessitent authentification)
router.post('/generate', authenticateToken, databaseInjector.injectConnection.bind(databaseInjector), checkPdfPermission('reception'), async (req, res) => {
  try {
    const { document_id, withStamp } = req.body;
    const sequelize = req.sequelize || require('../config/database').getConnection();
    
    const receptionData = await getReceptionDataForPdf(document_id, sequelize);

    if (!receptionData || receptionData.length === 0) {
      return res.status(404).json({ success: false, message: 'Réception introuvable' });
    }

    // Récupérer les informations depuis le fichier JSON de configuration
    const pdfConfigService = require('../services/pdf-config.service');
    const documentSociete = pdfConfigService.getDocumentSociete();
    console.log('[reception-pdf/generate] 📄 Informations de la société récupérées depuis la configuration:', documentSociete ? 'Oui' : 'Non');

    const pdfPath = await receptionPdfService.genererPDF(receptionData, {
      withStamp: !!withStamp,
      documentSociete: documentSociete
    });
    
    // Lire le PDF en mémoire
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    // Créer le dossier s'il n'existe pas
    const receptionDir = path.join(__dirname, '..', 'public', 'receptions');
    if (!fs.existsSync(receptionDir)) {
      fs.mkdirSync(receptionDir, { recursive: true });
    }

    // Sauvegarder le PDF sur disque (ne pas le supprimer immédiatement)
    const savedPdfPath = path.join(receptionDir, path.basename(pdfPath));
    fs.writeFileSync(savedPdfPath, pdfBuffer);
    console.log(`✅ PDF réception sauvegardé sur disque : ${savedPdfPath}`);
    
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
    const pdfUrl = `${baseUrl}/api/reception-pdf/${fileName}`;

    // Stocker aussi en cache mémoire pour accès rapide
    if (!global.pdfCache) {
      global.pdfCache = new Map();
    }
    global.pdfCache.set(`receptions/${fileName}`, {
      buffer: pdfBuffer,
      timestamp: Date.now()
    });
    
    // Nettoyer le cache mémoire après 1 heure
    setTimeout(() => {
      if (global.pdfCache) {
        global.pdfCache.delete(`receptions/${fileName}`);
      }
    }, 60 * 60 * 1000);

    // Nettoyer le fichier sur disque après 1 heure
    setTimeout(() => {
      try {
        if (fs.existsSync(savedPdfPath)) {
          fs.unlinkSync(savedPdfPath);
          console.log(`🗑️ Fichier PDF réception supprimé après 1h : ${savedPdfPath}`);
        }
      } catch (unlinkError) {
        console.error('Erreur suppression fichier PDF:', unlinkError);
      }
    }, 60 * 60 * 1000);

    return res.json({ success: true, pdfUrl });
  } catch (error) {
    console.error('Erreur génération PDF réception :', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur génération PDF réception',
      error: error.message
    });
  }
});

module.exports = router;

