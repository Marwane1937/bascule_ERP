const chequeService = require('../../services/generation/cheque.service');
const pdfService = require('../../services/generation/pdf.service');
const calibrationService = require('../../services/generation/calibration.service');

module.exports = {
  listReglementsCheque: (req, res) => {
    // ...
    res.json([]);
  },
  loadChequeData: (req, res) => {
    // ...
    res.json({});
  },
  updateChequeField: (req, res) => {
    // ...
    res.json({ success: true });
  },
  updateCalibration: (req, res) => {
    // ...
    res.json({ success: true });
  },
  generatePDF: (req, res) => {
    // ...
    res.json({ pdfUrl: '' });
  },
  testPrint: (req, res) => {
    // ...
    res.json({ success: true });
  }
};
