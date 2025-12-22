const bonCommandeService = require('../../services/achats/bon-commande.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getBonCommande = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'date',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || ''
    };
    const result = await bonCommandeService.getBonCommande(options, sequelize);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getBonCommandeById = async (req, res) => {
  try {
    const bonCommande = await bonCommandeService.getBonCommandeById(req.params.id);
    if (!bonCommande) return res.status(404).json({ message: 'Bon de commande non trouvé' });
    res.json(bonCommande);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createBonCommande = async (req, res) => {
  try {
    const newBonCommande = await bonCommandeService.createBonCommande(req.body);
    res.status(201).json(newBonCommande);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getNextBonCommandeNumero = async (req, res) => {
  try {
    const numero = await bonCommandeService.getNextBonCommandeNumero();
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
        const id = await bonCommandeService.saveDetail(detail);
        results.push({ id, status: 'success' });
      }
      res.status(200).json(results);
    } else {
      const id = await bonCommandeService.saveDetail(data);
      res.status(200).json({ id, status: 'success' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const saveInfo = async (req, res) => {
  try {
    const result = await bonCommandeService.saveInfo(req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateBonCommande = async (req, res) => {
  try {
    const result = await bonCommandeService.updateBonCommande(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteBonCommande = async (req, res) => {
  try {
    const result = await bonCommandeService.deleteBonCommande(req.body.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteLignesParIds = async (req, res) => {
  try {
    const result = await bonCommandeService.deleteLignesParIds(req.body.ids);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getBonCommande,
  getBonCommandeById,
  createBonCommande,
  getNextBonCommandeNumero,
  saveDetail,
  saveInfo,
  updateBonCommande,
  deleteBonCommande,
  deleteLignesParIds
};

