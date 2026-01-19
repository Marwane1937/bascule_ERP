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
      search: req.query.search || ''
    };
    const result = await sortieStockService.getSortiesStock(options, sequelize);
    res.json({
      success: true,
      data: result.data || [],
      pagination: result.pagination || {}
    });
  } catch (err) {
    console.error('[getSortiesStock] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

const getNextSortieStockNumero = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const numero = await sortieStockService.getNextSortieStockNumero(sequelize);
    res.json({
      success: true,
      data: numero
    });
  } catch (err) {
    console.error('[getNextSortieStockNumero] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message
    });
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

    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID de sortie de stock invalide'
      });
    }

    const sortieStock = await sortieStockService.getSortieStock(id, sequelize);

    if (!sortieStock) {
      return res.status(404).json({
        success: false,
        message: 'Sortie de stock non trouvée'
      });
    }

    res.json({
      success: true,
      data: sortieStock
    });
  } catch (err) {
    console.error('[getSortieStock] Erreur:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Erreur lors de la récupération de la sortie de stock'
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

const deleteLignesParIds = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const { ligneIds } = req.body;

    if (!Array.isArray(ligneIds) || ligneIds.length === 0) {
      return res.status(400).json({ message: 'Tableau d\'IDs de lignes requis' });
    }

    const sortieStockModel = require('../../models/stock/sortie-stock.model');
    await sortieStockModel.deleteLignesParIds(ligneIds, sequelize);
    res.json({ success: true });
  } catch (err) {
    console.error('[deleteLignesParIds] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

// Méthode pour récupérer les données de sortie de stock pour le PDF
const getSortieStockDataForPdf = async (document_id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || databaseSwitchService.getConnectionToUse();

  const result = await sequelize.query(
    `
      SELECT
        s.id AS document_id,
        s.numero,
        s.description AS client_ref,
        s.date,
        s.part_id,
        p.nom AS client,
        p.nom AS fournisseur,
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
        'SORTIE DE STOCK' AS document_kind,
        l.nom AS rubrique_nom,
        sd.rubrique_id
      FROM stock s
      LEFT JOIN stock_detail sd ON sd.stock_id = s.id AND sd.sens = -1
      LEFT JOIN partenaire p ON p.part_id = s.part_id AND p.type = 1
      LEFT JOIN adresse adr ON adr.part_id = p.part_id
      LEFT JOIN article a ON a.article_id = sd.article_id
      LEFT JOIN listes l ON l.id = sd.rubrique_id AND l.group_id = 7000
      WHERE s.id = :id AND s.type = 22
      ORDER BY sd.id
    `,
    {
      replacements: { id: document_id },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  return result;
};

module.exports = {
  getSortiesStock,
  getNextSortieStockNumero,
  createSortieStock,
  getSortieStock,
  updateSortieStock,
  saveDetail,
  saveInfo,
  deleteLignesParIds,
  getSortieStockDataForPdf
};

