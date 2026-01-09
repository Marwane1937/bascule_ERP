const articleNomenclatureModel = require('../../models/base/article-nomenclature.model');

const getNomenclatureByComposeId = async (compose_id, sequelizeConnection = null) => {
  return await articleNomenclatureModel.getNomenclatureByComposeId(compose_id, sequelizeConnection);
};

const getComposedArticles = async (sequelizeConnection = null) => {
  return await articleNomenclatureModel.getComposedArticles(sequelizeConnection);
};

const upsertNomenclatureLine = async (compose_id, line, sequelizeConnection = null) => {
  return await articleNomenclatureModel.upsertNomenclatureLine(compose_id, line, sequelizeConnection);
};

const deleteNomenclatureLine = async (compose_id, composant_id, sequelizeConnection = null) => {
  return await articleNomenclatureModel.deleteNomenclatureLine(compose_id, composant_id, sequelizeConnection);
};

module.exports = {
  getNomenclatureByComposeId,
  getComposedArticles,
  upsertNomenclatureLine,
  deleteNomenclatureLine,
};


