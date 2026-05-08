const sortieStockService = require('../../services/stock/sortie-stock.service');
const databaseSwitchService = require('../../services/database-switch.service');

const getSortiesStock = async (req, res) => {
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
      client: req.query.client || ''
    };

    const result = await sortieStockService.getSortiesStock(options, sequelize);
    res.json({
      success: true,
      data: result.data || [],
      pagination: result.pagination || {}
    });
  } catch (err) {
    console.error('[getSortiesStock] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getNextSortieStockNumero = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const numero = await sortieStockService.getNextSortieStockNumero(sequelize);
    res.json({ success: true, data: numero });
  } catch (err) {
    console.error('[getNextSortieStockNumero] Erreur:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const createSortieStock = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const newSortieStock = await sortieStockService.createSortieStock(req.body, sequelize);
    res.status(201).json(newSortieStock);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getSortieStock = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const id = parseInt(req.params.id, 10);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID de sortie de stock invalide' });
    }

    const sortieStock = await sortieStockService.getSortieStock(id, sequelize);
    if (!sortieStock) {
      return res.status(404).json({ success: false, message: 'Sortie de stock non trouvee' });
    }

    res.json({ success: true, data: sortieStock });
  } catch (err) {
    console.error('[getSortieStock] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la recuperation de la sortie de stock'
    });
  }
};

const updateSortieStock = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const updatedSortieStock = await sortieStockService.updateSortieStock(req.params.id, req.body, sequelize);
    res.json(updatedSortieStock);
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

    const results = await sortieStockService.saveDetail({ lignes }, sequelize);
    res.json({ success: true, results });
  } catch (err) {
    console.error('[saveDetail] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

const saveInfo = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    await sortieStockService.saveInfo(req.body, sequelize);
    res.json({ success: true });
  } catch (err) {
    console.error('[saveInfo] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

const transferSortieStockToLivraison = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const sortieStockId = parseInt(req.body?.sortieStockId, 10);

    if (!Number.isInteger(sortieStockId) || sortieStockId <= 0) {
      return res.status(400).json({ success: false, message: 'sortieStockId invalide' });
    }

    const result = await sortieStockService.transferSortieStockToLivraison(sortieStockId, sequelize);
    return res.status(201).json({
      success: true,
      message: 'Bon de livraison cree avec succes depuis la sortie de stock',
      data: result
    });
  } catch (err) {
    console.error('[transferSortieStockToLivraison] Erreur:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors du transfert vers le bon de livraison'
    });
  }
};

const deleteLignesParIds = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { ligneIds } = req.body;

    if (!Array.isArray(ligneIds) || ligneIds.length === 0) {
      return res.status(400).json({ message: 'Tableau d IDs de lignes requis' });
    }

    const sortieStockModel = require('../../models/stock/sortie-stock.model');
    await sortieStockModel.deleteLignesParIds(ligneIds, sequelize);
    res.json({ success: true });
  } catch (err) {
    console.error('[deleteLignesParIds] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

const getSortieStockDataForPdf = async (document_id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();
  const sortieStockModel = require('../../models/stock/sortie-stock.model');
  const sortie = await sortieStockModel.getSortieStockById(document_id, sequelize);

  if (!sortie) {
    return [];
  }

  return (Array.isArray(sortie.details) ? sortie.details : []).map((detail) => ({
    document_id: sortie.document_id,
    numero: sortie.numero,
    client_ref: sortie.description || '',
    date: sortie.date,
    part_id: sortie.part_id,
    client: sortie.client || sortie.client_nom || '',
    fournisseur: sortie.client || sortie.client_nom || '',
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
    adresse: sortie.clientInfo?.adresse || '',
    ville: '',
    ligne_id: detail.detail_id || detail.id || null,
    type: 22,
    etat: 1,
    document_kind: 'SORTIE DE STOCK',
    rubrique_nom: detail.rubrique_nom || '',
    rubrique_id: detail.rubrique_id || null
  }));
};

module.exports = {
  getSortiesStock,
  getNextSortieStockNumero,
  createSortieStock,
  getSortieStock,
  updateSortieStock,
  saveDetail,
  saveInfo,
  transferSortieStockToLivraison,
  deleteLignesParIds,
  getSortieStockDataForPdf
};
