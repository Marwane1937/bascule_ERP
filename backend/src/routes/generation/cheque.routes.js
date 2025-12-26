const express = require('express');
const router = express.Router();
const chequeController = require('../../controllers/generation/cheque.controller');

// Liste des règlements chèque
router.get('/reglements', chequeController.listReglementsCheque);

// Liste des banques
router.get('/banques', chequeController.listBanques);

// Templates par banque (chèques/effets)
router.get('/templates', chequeController.listTemplates);
router.get('/template/:templateId', chequeController.getTemplate);
router.put('/template/:templateId', chequeController.updateTemplate);

// Charger données pour édition (template, champs, calibration, valeurs du chèque)
router.get('/edit/:regleId', chequeController.loadChequeData);

// Sauvegarder champ template (Config X/Y)
router.post('/save-field/:fieldId', chequeController.saveFieldConfig);

// Sauvegarder calibration
router.put('/calibration/:calibrationId', chequeController.updateCalibration);
router.get('/calibration', chequeController.getCalibration);
router.post('/calibration', chequeController.saveCalibration);

// Générer PDF (preview ou final)
router.post('/generate-pdf/:regleId', chequeController.generatePDF);

// Sauvegarder données du chèque (Mode Éditeur)
router.post('/save-data/:regleId', chequeController.saveChequeData);

// Impression test
router.post('/test-print/:regleId', chequeController.testPrint);

module.exports = router;
