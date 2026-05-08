const { getConnection } = require('../../config/database');

const toInt = (value, fallback = null) => {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
};

const toBit = (value) => {
  if (value === true || value === 'true' || value === 1 || value === '1') return 1;
  return 0;
};

const getArticleUnites = async (articleId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  return await sequelize.query(
    `
      SELECT au.article_id, au.unite_id, au.fact, u.nom AS unite_nom
      FROM article_unite au
      LEFT JOIN unite u ON u.id = au.unite_id
      WHERE au.article_id = :articleId
      ORDER BY au.unite_id
    `,
    {
      replacements: { articleId: toInt(articleId, 0) },
      type: sequelize.QueryTypes.SELECT
    }
  );
};

const saveArticleUnites = async (articleId, unites = [], sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const articleIdNum = toInt(articleId, 0);

  return await sequelize.transaction(async (t) => {
    await sequelize.query(
      `DELETE FROM article_unite WHERE article_id = :articleId`,
      {
        replacements: { articleId: articleIdNum },
        type: sequelize.QueryTypes.DELETE,
        transaction: t
      }
    );

    const cleaned = (Array.isArray(unites) ? unites : [])
      .map((line) => ({
        unite_id: toInt(line?.unite_id, null),
        fact: toInt(line?.fact, 0)
      }))
      .filter((line) => line.unite_id && line.unite_id > 0);

    for (const line of cleaned) {
      await sequelize.query(
        `
          INSERT INTO article_unite (article_id, unite_id, fact)
          VALUES (:articleId, :unite_id, :fact)
        `,
        {
          replacements: {
            articleId: articleIdNum,
            unite_id: line.unite_id,
            fact: line.fact
          },
          transaction: t
        }
      );
    }

    return { success: true, count: cleaned.length };
  });
};

const getDepots = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  try {
    return await sequelize.query(
      `SELECT id, nom FROM warehouse WHERE [type] = 1 ORDER BY nom`,
      { type: sequelize.QueryTypes.SELECT }
    );
  } catch (_) {
    const rows = await sequelize.query(
      `
        SELECT DISTINCT depot_id AS id
        FROM article_stock
        WHERE depot_id IS NOT NULL
        ORDER BY depot_id
      `,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (!rows || rows.length === 0) {
      return [{ id: 1, nom: 'Depot principal' }];
    }

    return rows.map((r) => ({
      id: r.id,
      nom: `Depot ${r.id}`
    }));
  }
};

const getArticleStocks = async (articleId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  return await sequelize.query(
    `
      SELECT
        article_id,
        depot_id,
        emplacement,
        stock_min,
        stock_max,
        perissable,
        duree,
        lot,
        lot_num,
        type,
        etat,
        cr_date,
        user_id
      FROM article_stock
      WHERE article_id = :articleId
      ORDER BY depot_id
    `,
    {
      replacements: { articleId: toInt(articleId, 0) },
      type: sequelize.QueryTypes.SELECT
    }
  );
};

const saveArticleStocks = async (articleId, stocks = [], sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const articleIdNum = toInt(articleId, 0);

  return await sequelize.transaction(async (t) => {
    await sequelize.query(
      `DELETE FROM article_stock WHERE article_id = :articleId`,
      {
        replacements: { articleId: articleIdNum },
        type: sequelize.QueryTypes.DELETE,
        transaction: t
      }
    );

    const cleaned = (Array.isArray(stocks) ? stocks : [])
      .map((line) => ({
        depot_id: toInt(line?.depot_id, null),
        stock_min: Number(line?.stock_min ?? 0) || 0,
        stock_max: Number(line?.stock_max ?? 0) || 0,
        perissable: toBit(line?.perissable)
      }))
      .filter((line) => line.depot_id && line.depot_id > 0);

    for (const line of cleaned) {
      await sequelize.query(
        `
          INSERT INTO article_stock (
            article_id, depot_id, emplacement, stock_min, stock_max,
            perissable, duree, lot, lot_num, type, etat, cr_date, user_id
          )
          VALUES (
            :articleId, :depot_id, '', :stock_min, :stock_max,
            :perissable, 0, 0, '', NULL, 1, GETDATE(), 1
          )
        `,
        {
          replacements: {
            articleId: articleIdNum,
            depot_id: line.depot_id,
            stock_min: line.stock_min,
            stock_max: line.stock_max,
            perissable: line.perissable
          },
          transaction: t
        }
      );
    }

    return { success: true, count: cleaned.length };
  });
};

const getArticleCodes = async (articleId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  return await sequelize.query(
    `
      SELECT ac.article_id, ac.ligne, ac.code, ac.description, ac.part_id, p.nom AS fournisseur
      FROM article_code ac
      LEFT JOIN partenaire p ON p.part_id = ac.part_id
      WHERE ac.article_id = :articleId
      ORDER BY ac.ligne
    `,
    {
      replacements: { articleId: toInt(articleId, 0) },
      type: sequelize.QueryTypes.SELECT
    }
  );
};

const saveArticleCodes = async (articleId, codes = [], sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const articleIdNum = toInt(articleId, 0);

  return await sequelize.transaction(async (t) => {
    await sequelize.query(
      `DELETE FROM article_code WHERE article_id = :articleId`,
      {
        replacements: { articleId: articleIdNum },
        type: sequelize.QueryTypes.DELETE,
        transaction: t
      }
    );

    const cleaned = (Array.isArray(codes) ? codes : [])
      .map((line) => ({
        ligne: toInt(line?.ligne, null),
        code: (line?.code ?? '').toString().trim(),
        description: (line?.description ?? '').toString().trim(),
        part_id: toInt(line?.part_id, null)
      }))
      .filter((line) => line.ligne && line.part_id);

    for (const line of cleaned) {
      await sequelize.query(
        `
          INSERT INTO article_code (article_id, ligne, code, description, part_id, type, etat, cr_date, user_id)
          VALUES (:articleId, :ligne, :code, :description, :part_id, NULL, 1, GETDATE(), 1)
        `,
        {
          replacements: {
            articleId: articleIdNum,
            ligne: line.ligne,
            code: line.code,
            description: line.description,
            part_id: line.part_id
          },
          transaction: t
        }
      );
    }

    return { success: true, count: cleaned.length };
  });
};

module.exports = {
  getArticleUnites,
  saveArticleUnites,
  getDepots,
  getArticleStocks,
  saveArticleStocks,
  getArticleCodes,
  saveArticleCodes
};
