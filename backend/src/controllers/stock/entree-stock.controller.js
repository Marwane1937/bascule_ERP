const entreeStockService = require('../../services/stock/entree-stock.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getEntreesStock = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'numero',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || '',
      dateFrom: req.query.dateFrom || '',
      dateTo: req.query.dateTo || '',
      fournisseur: req.query.fournisseur || ''
    };

    const result = await entreeStockService.getEntreesStock(options, sequelize);
    res.json({
      success: true,
      data: result.data || [],
      pagination: result.pagination || {}
    });
  } catch (err) {
    console.error('[getEntreesStock] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getNextEntreeStockNumero = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const numero = await entreeStockService.getNextEntreeStockNumero(sequelize);
    res.json({ success: true, data: numero });
  } catch (err) {
    console.error('[getNextEntreeStockNumero] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const createEntreeStock = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const newEntreeStock = await entreeStockService.createEntreeStock(req.body, sequelize);
    res.status(201).json(newEntreeStock);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getEntreeStock = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const id = parseInt(req.params.id, 10);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID d entree de stock invalide' });
    }

    const entreeStock = await entreeStockService.getEntreeStock(id, sequelize);
    if (!entreeStock) {
      return res.status(404).json({ success: false, message: 'Entree de stock non trouvee' });
    }

    res.json({ success: true, data: entreeStock });
  } catch (err) {
    console.error('[getEntreeStock] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la recuperation de l entree de stock'
    });
  }
};

const updateEntreeStock = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const updatedEntreeStock = await entreeStockService.updateEntreeStock(req.params.id, req.body, sequelize);
    res.json(updatedEntreeStock);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const saveDetail = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { lignes } = req.body;

    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ message: 'Tableau de lignes requis' });
    }

    const results = await entreeStockService.saveDetail({ lignes }, sequelize);
    res.json({ success: true, results });
  } catch (err) {
    console.error('[saveDetail] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

const saveInfo = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    await entreeStockService.saveInfo(req.body, sequelize);
    res.json({ success: true });
  } catch (err) {
    console.error('[saveInfo] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

const deleteLignesParIds = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { ligneIds } = req.body;

    if (!Array.isArray(ligneIds) || ligneIds.length === 0) {
      return res.status(400).json({ message: 'Tableau d IDs de lignes requis' });
    }

    const entreeStockModel = require('../../models/stock/entree-stock.model');
    await entreeStockModel.deleteLignesParIds(ligneIds, sequelize);
    res.json({ success: true });
  } catch (err) {
    console.error('[deleteLignesParIds] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

const getEntreeStockDataForPdf = async (document_id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
  const entreeStockModel = require('../../models/stock/entree-stock.model');
  const entree = await entreeStockModel.getEntreeStockById(document_id, sequelize);

  if (!entree) {
    return [];
  }

  return (Array.isArray(entree.details) ? entree.details : []).map((detail) => ({
    document_id: entree.document_id,
    numero: entree.numero,
    client_ref: entree.description || '',
    date: entree.date,
    part_id: entree.part_id,
    fournisseur: entree.client || entree.client_nom || '',
    client: entree.client || entree.client_nom || '',
    article_id: detail.article_id,
    article_cod: detail.article_cod || '',
    designation: detail.designation || detail.article_nom || '',
    article_nom: detail.article_nom || detail.designation || '',
    quantite: detail.quantite || 0,
    prix: detail.prix || 0,
    article: detail.designation || detail.article_nom || '',
    taux_tva: detail.taux_tva || 0,
    remise: 0,
    condition: '',
    expedition: '',
    transporteur: '',
    adresse: entree.clientInfo?.adresse || '',
    ville: '',
    ligne_id: detail.detail_id || detail.id || null,
    type: 21,
    etat: 1,
    document_kind: 'ENTREE DE STOCK',
    rubrique_nom: detail.rubrique_nom || '',
    rubrique_id: detail.rubrique_id || null
  }));
};

module.exports = {
  getEntreesStock,
  getNextEntreeStockNumero,
  createEntreeStock,
  getEntreeStock,
  updateEntreeStock,
  saveDetail,
  saveInfo,
  deleteLignesParIds,
  getEntreeStockDataForPdf
};
