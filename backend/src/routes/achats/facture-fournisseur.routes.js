const express = require('express');
const router = express.Router();
const multer = require('multer');
const factureFournisseurController = require('../../controllers/achats/facture-fournisseur.controller');
const databaseInjector = require('../../middleware/database-injector.middleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file?.mimetype?.startsWith('image/')) {
      return cb(null, true);
    }

    return cb(new Error('Seules les images scannees sont autorisees.'));
  }
});

// Middleware pour injecter la connexion appropriée
router.use(databaseInjector.injectConnection.bind(databaseInjector));

// Routes pour les factures fournisseur
// IMPORTANT: Les routes spécifiques doivent être AVANT les routes paramétrées

// Récupérer les commandes non facturées (pour le transfert commande → facture)
router.get('/commandes-non-facturees', factureFournisseurController.getCommandesNonFacturees);

// Créer une facture depuis une commande
router.post('/from-commande', factureFournisseurController.createFactureFournisseurFromCommande);
router.post('/analyze-scan', upload.single('scan'), factureFournisseurController.analyzeFactureFournisseurScan);
router.post('/from-scan', factureFournisseurController.createFactureFournisseurFromScan);
router.post('/manual', factureFournisseurController.createFactureFournisseurManual);
router.post('/save-details', factureFournisseurController.saveDetail);
router.post('/delete-lignes', factureFournisseurController.deleteLignesParIds);

// Supprimer une facture fournisseur
router.post('/delete', factureFournisseurController.deleteFactureFournisseur);

// Liste des factures fournisseur avec pagination
router.get('/', factureFournisseurController.getFacturesFournisseur);

// Récupérer une facture fournisseur par ID
router.get('/:id', factureFournisseurController.getFactureFournisseur);
router.put('/:id', factureFournisseurController.updateFactureFournisseur);

module.exports = router;





















