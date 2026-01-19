const express = require('express');
const router = express.Router();
const receptionPdfService = require('../services/reception-pdf.service');
const receptionModel = require('../models/achats/reception.model');
const { authenticateToken } = require('../middleware/auth.middleware');
const databaseInjector = require('../middleware/database-injector.middleware');
const path = require('path');

/**
 * Routes pour la génération de PDF des BONS DE RÉCEPTION
 */

// Toutes les routes nécessitent une authentification
router.use(authenticateToken);

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

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

// Générer un PDF de réception
router.post('/generate', async (req, res) => {
  try {
    const { document_id, withStamp } = req.body;
    const sequelize = req.sequelize || require('../config/database').getConnection();
    
    const receptionData = await getReceptionDataForPdf(document_id, sequelize);

    if (!receptionData || receptionData.length === 0) {
      return res.status(404).json({ success: false, message: 'Réception introuvable' });
    }

    // Récupérer les informations du document_societe si disponibles
    const documentSociete = req.body.documentSociete || null;

    const pdfPath = await receptionPdfService.genererPDF(receptionData, {
      withStamp: !!withStamp,
      documentSociete: documentSociete
    });
    
    const pdfUrl = `http://localhost:3500/receptions/${path.basename(pdfPath)}`;

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

