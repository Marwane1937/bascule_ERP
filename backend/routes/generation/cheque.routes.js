const express = require('express');
const router = express.Router();
const chequeController = require('../../controllers/generation/cheque.controller');

// Liste des règlements chèque
router.get('/reglements', chequeController.listReglementsCheque);
// Charger données pour édition
router.get('/edit/:regleId', chequeController.loadChequeData);
// Sauvegarder champ template
router.put('/field/:fieldId', chequeController.updateChequeField);
// Sauvegarder calibration
router.put('/calibration/:calibrationId', chequeController.updateCalibration);
// Générer PDF
router.post('/generate-pdf/:regleId', chequeController.generatePDF);
// Impression test
router.post('/test-print/:regleId', chequeController.testPrint);

module.exports = router;
