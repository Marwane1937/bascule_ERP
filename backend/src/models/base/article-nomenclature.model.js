const sequelize = require('../../config/database');

/**
 * Modèle: article_Nomenclature
 * - Compose_id: article "parent" (article_id)
 * - Composant_id: article "composant" (article_id)
 * - Champs complémentaires: Famille, Quantite, Unite, Poids_Standard, Poids_reel
 */

const getNomenclatureByComposeId = async (compose_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const results = await connectionToUse.query(
    `
      SELECT
        n.Compose_id,
        n.Composant_id,
        n.Famille,
        n.Quantite,
        n.Unite,
        n.Poids_Standard,
        n.Poids_reel,
        a.article_cod AS composant_cod,
        a.article_nom AS composant_nom,
        f.nom AS famille_nom,
        u.nom AS unite_nom
      FROM article_Nomenclature n
      LEFT JOIN article a ON a.article_id = n.Composant_id
      LEFT JOIN famille f ON f.id = n.Famille
      LEFT JOIN unite u ON u.id = n.Unite
      WHERE n.Compose_id = :compose_id
      ORDER BY a.article_nom ASC
    `,
    {
      replacements: { compose_id },
      type: connectionToUse.QueryTypes.SELECT,
    }
  );
  return results || [];
};

const upsertNomenclatureLine = async (compose_id, line, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  const {
    composant_id,
    famille,
    quantite,
    unite,
    poids_standard,
    poids_reel,
  } = line || {};

  if (!compose_id || !composant_id) {
    throw new Error('compose_id et composant_id sont requis');
  }

  const exists = await connectionToUse.query(
    `
      SELECT TOP 1 1 AS ok
      FROM article_Nomenclature
      WHERE Compose_id = :compose_id AND Composant_id = :composant_id
    `,
    {
      replacements: { compose_id, composant_id },
      type: connectionToUse.QueryTypes.SELECT,
    }
  );

  if (exists && exists.length > 0) {
    await connectionToUse.query(
      `
        UPDATE article_Nomenclature
        SET
          Famille = :famille,
          Quantite = :quantite,
          Unite = :unite,
          Poids_Standard = :poids_standard,
          Poids_reel = :poids_reel
        WHERE Compose_id = :compose_id AND Composant_id = :composant_id
      `,
      {
        replacements: {
          compose_id,
          composant_id,
          famille: famille ?? null,
          quantite: quantite ?? null,
          unite: unite ?? null,
          poids_standard: poids_standard ?? null,
          poids_reel: poids_reel ?? null,
        },
        type: connectionToUse.QueryTypes.UPDATE,
      }
    );
    return { compose_id, composant_id, updated: true };
  }

  await connectionToUse.query(
    `
      INSERT INTO article_Nomenclature
        (Compose_id, Composant_id, Famille, Quantite, Unite, Poids_Standard, Poids_reel)
      VALUES
        (:compose_id, :composant_id, :famille, :quantite, :unite, :poids_standard, :poids_reel)
    `,
    {
      replacements: {
        compose_id,
        composant_id,
        famille: famille ?? null,
        quantite: quantite ?? null,
        unite: unite ?? null,
        poids_standard: poids_standard ?? null,
        poids_reel: poids_reel ?? null,
      },
      type: connectionToUse.QueryTypes.INSERT,
    }
  );

  return { compose_id, composant_id, created: true };
};

const deleteNomenclatureLine = async (compose_id, composant_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;
  await connectionToUse.query(
    `
      DELETE FROM article_Nomenclature
      WHERE Compose_id = :compose_id AND Composant_id = :composant_id
    `,
    {
      replacements: { compose_id, composant_id },
      type: connectionToUse.QueryTypes.DELETE,
    }
  );
  return { compose_id, composant_id, deleted: true };
};

module.exports = {
  getNomenclatureByComposeId,
  getComposedArticles: async (sequelizeConnection = null) => {
    const connectionToUse = sequelizeConnection || sequelize;
    const results = await connectionToUse.query(
      `
        SELECT DISTINCT
          a.article_id,
          a.article_cod,
          a.article_nom,
          a.famille,
          a.unite_id
        FROM article_Nomenclature n
        INNER JOIN article a ON a.article_id = n.Compose_id
        WHERE (a.etat = 1 OR a.etat IS NULL)
        ORDER BY a.article_nom ASC
      `,
      { type: connectionToUse.QueryTypes.SELECT }
    );
    return results || [];
  },
  upsertNomenclatureLine,
  deleteNomenclatureLine,
};


