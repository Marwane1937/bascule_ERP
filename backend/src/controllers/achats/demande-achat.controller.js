const demandeAchatService = require('../../services/achats/demande-achat.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getDemandeAchat = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'date',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || ''
    };
    const result = await demandeAchatService.getDemandeAchat(options, sequelize);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getDemandeAchatById = async (req, res) => {
  try {
    const demandeAchat = await demandeAchatService.getDemandeAchatById(req.params.id);
    if (!demandeAchat) return res.status(404).json({ message: 'Demande d\'achat non trouvée' });
    res.json(demandeAchat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createDemandeAchat = async (req, res) => {
  try {
    const newDemandeAchat = await demandeAchatService.createDemandeAchat(req.body);
    res.status(201).json(newDemandeAchat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getNextDemandeAchatNumero = async (req, res) => {
  try {
    const numero = await demandeAchatService.getNextDemandeAchatNumero();
    res.json(numero);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const saveDetail = async (req, res) => {
  try {
    const data = req.body;
    if (Array.isArray(data)) {
      const results = [];
      for (const detail of data) {
        const id = await demandeAchatService.saveDetail(detail);
        results.push({ id, status: 'success' });
      }
      res.status(200).json(results);
    } else {
      const id = await demandeAchatService.saveDetail(data);
      res.status(200).json({ id, status: 'success' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const saveInfo = async (req, res) => {
  try {
    const result = await demandeAchatService.saveInfo(req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateDemandeAchat = async (req, res) => {
  try {
    const result = await demandeAchatService.updateDemandeAchat(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteDemandeAchat = async (req, res) => {
  try {
    const result = await demandeAchatService.deleteDemandeAchat(req.body.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteLignesParIds = async (req, res) => {
  try {
    const result = await demandeAchatService.deleteLignesParIds(req.body.ids);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const genererPDF = async (req, res) => {
  try {
    const id = req.params.id;
    const withStamp = req.query.withStamp === 'true';
    
    const pdfPath = await demandeAchatService.genererPDF(id, { withStamp });
    
    // Envoyer le fichier PDF
    res.download(pdfPath, `demande-achat-${id}.pdf`, (err) => {
      if (err) {
        console.error('Erreur envoi PDF:', err);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Erreur lors de l\'envoi du PDF' });
        }
      }
    });
  } catch (err) {
    console.error('Erreur génération PDF:', err);
    res.status(500).json({ message: err.message });
  }
};

const getDemandesAchatNonTransformees = async (req, res) => {
  try {
    const demandeAchatService = require('../../services/achats/demande-achat.service');
    const result = await demandeAchatService.getDemandesAchatNonTransformees();
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getDemandeAchat,
  getDemandeAchatById,
  createDemandeAchat,
  getNextDemandeAchatNumero,
  saveDetail,
  saveInfo,
  updateDemandeAchat,
  deleteDemandeAchat,
  deleteLignesParIds,
  genererPDF,
  getDemandesAchatNonTransformees
};

