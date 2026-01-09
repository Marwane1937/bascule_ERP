const articleNomenclatureService = require('../../services/base/article-nomenclature.service');
const databaseSwitchService = require('../../services/database-switch.service');

const listComposedArticles = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const rows = await articleNomenclatureService.getComposedArticles(sequelize);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('❌ [ArticleNomenclatureController] Erreur listComposedArticles:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const listByComposeId = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const compose_id = parseInt(req.params.id, 10);
    const rows = await articleNomenclatureService.getNomenclatureByComposeId(compose_id, sequelize);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('❌ [ArticleNomenclatureController] Erreur listByComposeId:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const createLine = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const compose_id = parseInt(req.params.id, 10);
    const result = await articleNomenclatureService.upsertNomenclatureLine(compose_id, req.body, sequelize);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('❌ [ArticleNomenclatureController] Erreur createLine:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateLine = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const compose_id = parseInt(req.params.id, 10);
    const composant_id = parseInt(req.params.composant_id, 10);
    const payload = { ...(req.body || {}), composant_id };
    const result = await articleNomenclatureService.upsertNomenclatureLine(compose_id, payload, sequelize);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('❌ [ArticleNomenclatureController] Erreur updateLine:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteLine = async (req, res) => {
  try {
    const sequelize = req.sequelize || databaseSwitchService.getConnectionToUse();
    const compose_id = parseInt(req.params.id, 10);
    const composant_id = parseInt(req.params.composant_id, 10);
    const result = await articleNomenclatureService.deleteNomenclatureLine(compose_id, composant_id, sequelize);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('❌ [ArticleNomenclatureController] Erreur deleteLine:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  listComposedArticles,
  listByComposeId,
  createLine,
  updateLine,
  deleteLine,
};


