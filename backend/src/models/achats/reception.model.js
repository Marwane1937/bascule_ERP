const { getConnection } = require('../../config/database');
const { getCompteurCurrent } = require('../../services/compteur.service');

const getTableColumnSet = async (sequelize, tableName) => {
  const cols = await sequelize.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = :tableName
    `,
    {
      replacements: { tableName },
      type: sequelize.QueryTypes.SELECT
    }
  );
  return new Set((Array.isArray(cols) ? cols : []).map((c) => String(c.COLUMN_NAME || '').toLowerCase()));
};

const normalizePositiveInt = (value) => {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const getStockHeaderDepotValue = async (sequelize, stockId, sequelizeTransaction = null) => {
  const safeStockId = normalizePositiveInt(stockId);
  if (!safeStockId) return null;

  const stockColSet = await getTableColumnSet(sequelize, 'stock');
  const depotExpr = stockColSet.has('depot_id')
    ? 'depot_id'
    : (stockColSet.has('adresse_id') ? 'adresse_id' : null);

  if (!depotExpr) return null;

  const [row] = await sequelize.query(
    `SELECT ${depotExpr} AS depot_id FROM stock WHERE id = :id`,
    {
      replacements: { id: safeStockId },
      type: sequelize.QueryTypes.SELECT,
      transaction: sequelizeTransaction || undefined
    }
  );

  return normalizePositiveInt(row?.depot_id);
};

const allocateReceivedQuantitiesByArticle = (details, receivedByArticleMap) => {
  const remainingByArticle = new Map(receivedByArticleMap || []);

  return (Array.isArray(details) ? details : []).map((detail) => {
    const articleKey = Number(detail?.article_id || 0);
    const orderedQty = Number(detail?.quantite || 0);
    const alreadyReceivedForArticle = Number(remainingByArticle.get(articleKey) || 0);
    const receivedOnLine = Math.max(0, Math.min(orderedQty, alreadyReceivedForArticle));
    const remainingQty = Math.max(0, orderedQty - receivedOnLine);

    if (articleKey > 0) {
      remainingByArticle.set(articleKey, Math.max(0, alreadyReceivedForArticle - receivedOnLine));
    }

    return {
      ...detail,
      quantite_commandee: orderedQty,
      quantite_receptionnee: receivedOnLine,
      quantite_restante: remainingQty,
      etat: remainingQty <= 0 ? 1 : 0
    };
  });
};

const getCommandeReceivedByArticle = async (sequelize, commandeId, sequelizeTransaction = null) => {
  const rows = await sequelize.query(
    `
      SELECT
        sd.article_id,
        SUM(ISNULL(sd.quantite, 0)) AS quantite_receptionnee
      FROM stock s
      INNER JOIN stock_detail sd ON sd.stock_id = s.id
      WHERE s.type = 1
        AND s.parent = :commandeId
        AND (s.etat = 1 OR s.etat IS NULL)
      GROUP BY sd.article_id
    `,
    {
      replacements: { commandeId },
      type: sequelize.QueryTypes.SELECT,
      transaction: sequelizeTransaction || undefined
    }
  );

  return new Map(
    (Array.isArray(rows) ? rows : []).map((row) => [
      Number(row?.article_id || 0),
      Number(row?.quantite_receptionnee || 0)
    ])
  );
};

const getCommandeDetailReceptionState = async (
  sequelize,
  commandeId,
  achatDetailDepotSelect,
  sequelizeTransaction = null
) => {
  const details = await sequelize.query(
    `
      SELECT
        id,
        article_id,
        quantite,
        prix,
        taux_tva,
        description,
        remise,
        remise_montant,
        ${achatDetailDepotSelect}
      FROM achat_document_detail
      WHERE document_id = :commandeId
      ORDER BY id
    `,
    {
      replacements: { commandeId },
      type: sequelize.QueryTypes.SELECT,
      transaction: sequelizeTransaction || undefined
    }
  );

  const receivedByArticle = await getCommandeReceivedByArticle(sequelize, commandeId, sequelizeTransaction);
  return allocateReceivedQuantitiesByArticle(details, receivedByArticle);
};

/**
 * Achats -> RÃ©ception
 * - RÃ©ception = entrÃ©e dans stock avec type = 1
 * - Lignes = stock_detail avec sens = 1
 *
 * Notes:
 * - On lie la rÃ©ception Ã  la commande achat via stock.parent = achat_document.document_id
 * - On Ã©vite de modifier le schÃ©ma existant (pas de colonne reception_id ajoutÃ©e).
 */

const getCommandesNonReceptionnees = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  // Commandes achat = achat_document.type = 2
  // Non rÃ©ceptionnÃ©e = aucune ligne dans stock (type=1) avec parent = document_id
  const query = `
    WITH commande_totals AS (
      SELECT document_id, SUM(ISNULL(quantite, 0)) AS total_commande
      FROM achat_document_detail
      GROUP BY document_id
    ),
    reception_totals AS (
      SELECT s.parent AS commande_id, SUM(ISNULL(sd.quantite, 0)) AS total_receptionnee
      FROM stock s
      INNER JOIN stock_detail sd ON sd.stock_id = s.id
      WHERE s.type = 1
        AND (s.etat = 1 OR s.etat IS NULL)
      GROUP BY s.parent
    )
    SELECT
      a.document_id,
      a.numero,
      a.date,
      a.description,
      p.nom AS fournisseur,
      a.part_id,
      ISNULL(ct.total_commande, 0) AS total_commande,
      ISNULL(rt.total_receptionnee, 0) AS total_receptionnee,
      CASE
        WHEN ISNULL(ct.total_commande, 0) <= 0 THEN 0
        ELSE CAST(ROUND((ISNULL(rt.total_receptionnee, 0) * 100.0) / NULLIF(ct.total_commande, 0), 2) AS DECIMAL(10,2))
      END AS progression_percent
    FROM achat_document a
    INNER JOIN partenaire p ON p.part_id = a.part_id AND p.type = 2
    LEFT JOIN commande_totals ct ON ct.document_id = a.document_id
    LEFT JOIN reception_totals rt ON rt.commande_id = a.document_id
    WHERE a.type = 2
      AND ISNULL(ct.total_commande, 0) > ISNULL(rt.total_receptionnee, 0)
    ORDER BY a.date DESC, a.document_id DESC
  `;

  const results = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
  return Array.isArray(results) ? results : (results ? [results] : []);
};

// RÃ©cupÃ©rer toutes les rÃ©ceptions (stock.type = 1) avec pagination (comme Livraison)
const getAllReceptions = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const {
    page = 1,
    pageSize = 25,
    orderBy = 'date',
    orderDirection = 'DESC',
    search = ''
  } = options;

  const safePage = parseInt(page) || 1;
  const safePageSize = parseInt(pageSize) || 25;
  const offset = (safePage - 1) * safePageSize;

  const validColumns = ['document_id', 'numero', 'date', 'fournisseur', 'total_ht', 'total_tva', 'total_ttc'];
  const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'date';
  const safeOrderDirection = String(orderDirection).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  let whereClause = 'WHERE s.type = 1';
  const replacements = {};

  if (search && String(search).trim()) {
    whereClause += ` AND (
      s.numero LIKE :search
      OR p.nom LIKE :search
      OR s.description LIKE :search
    )`;
    replacements.search = `%${String(search).trim()}%`;
  }

  const query = `
    SELECT
      document_id,
      numero,
      date,
      description,
      fournisseur,
      total_ht,
      total_tva,
      total_ttc,
      total_count
    FROM (
      SELECT
        s.id AS document_id,
        s.numero,
        s.date,
        s.description,
        p.nom AS fournisseur,
        ISNULL(t.total_ht, 0) AS total_ht,
        ISNULL(t.total_tva, 0) AS total_tva,
        ISNULL(t.total_ttc, 0) AS total_ttc,
        COUNT(*) OVER() AS total_count,
        ROW_NUMBER() OVER (ORDER BY ${safeOrderBy} ${safeOrderDirection}) AS RowNum
      FROM stock s
      LEFT JOIN (
        SELECT
          stock_id,
          SUM(quantite * prix) AS total_ht,
          SUM((quantite * prix) * taux_tva) AS total_tva,
          SUM((quantite * prix) + (quantite * prix) * taux_tva) AS total_ttc
        FROM stock_detail
        GROUP BY stock_id
      ) t ON t.stock_id = s.id
      LEFT JOIN partenaire p ON p.part_id = s.part_id
      ${whereClause}
    ) AS PaginatedResults
    WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
    ORDER BY RowNum
  `;

  const queryResult = await sequelize.query(query, {
    replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
    type: sequelize.QueryTypes.SELECT
  });

  let results = Array.isArray(queryResult) ? queryResult : (queryResult ? [queryResult] : []);
  let total = 0;
  if (results.length > 0) {
    total = results[0].total_count || 0;
    results = results.map(({ total_count, ...rest }) => rest);
  }

  const totalPages = Math.ceil(total / safePageSize);
  return {
    data: results || [],
    pagination: {
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages
    }
  };
};

const formatToSqlDateTime = (value) => {
  if (!value) return null;

  // Cas 1 : string venant de Angular (datetime-local)
  if (typeof value === 'string' && value.includes('T')) {
    return value.replace('T', ' ') + ':00';
  }

  // Cas 2 : objet Date JS
  if (value instanceof Date) {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ` +
           `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }

  // Cas 3 : string SQL dÃ©jÃ  valide
  return value;
};

const getStockDetailLotColumnSet = async (sequelize) => getTableColumnSet(sequelize, 'stock_detail_lot');

const getNextStockDetailLotLigne = async (sequelize, stockId, sequelizeTransaction = null) => {
  const safeStockId = normalizePositiveInt(stockId);
  if (!safeStockId) return 1;
  const lotColSet = await getStockDetailLotColumnSet(sequelize);
  if (!lotColSet.has('stock_id') || !lotColSet.has('ligne')) return 1;

  const [row] = await sequelize.query(
    `
      SELECT ISNULL(MAX(ligne), 0) + 1 AS next_ligne
      FROM stock_detail_lot
      WHERE stock_id = :stockId
    `,
    {
      replacements: { stockId: safeStockId },
      type: sequelize.QueryTypes.SELECT,
      transaction: sequelizeTransaction || undefined
    }
  );

  return normalizePositiveInt(row?.next_ligne) || 1;
};

const syncStockDetailLot = async (sequelize, payload, sequelizeTransaction = null) => {
  const lotColSet = await getStockDetailLotColumnSet(sequelize);
  if (!lotColSet.size) return;
  if (!lotColSet.has('stock_id') || !lotColSet.has('detail_id')) return;

  const stockId = normalizePositiveInt(payload?.stock_id);
  const detailId = normalizePositiveInt(payload?.detail_id);
  if (!stockId || !detailId) return;

  await sequelize.query(
    `
      DELETE FROM stock_detail_lot
      WHERE stock_id = :stockId AND detail_id = :detailId
    `,
    {
      replacements: { stockId, detailId },
      transaction: sequelizeTransaction || undefined
    }
  );

  const serie = String(payload?.serie || payload?.numero_lot || '').trim();
  if (!serie) return;

  const ligne = normalizePositiveInt(payload?.ligne)
    || await getNextStockDetailLotLigne(sequelize, stockId, sequelizeTransaction);

  const replacements = {
    stockId,
    ligne,
    articleId: normalizePositiveInt(payload?.article_id),
    quantite: Number(payload?.quantite) || 0,
    serie: serie.substring(0, 200),
    detailId,
    userId: normalizePositiveInt(payload?.user_id)
  };

  const columns = [];
  const values = [];

  if (lotColSet.has('stock_id')) {
    columns.push('stock_id');
    values.push(':stockId');
  }
  if (lotColSet.has('ligne')) {
    columns.push('ligne');
    values.push(':ligne');
  }
  if (lotColSet.has('article_id')) {
    columns.push('article_id');
    values.push(':articleId');
  }
  if (lotColSet.has('quantite')) {
    columns.push('quantite');
    values.push(':quantite');
  }
  if (lotColSet.has('barcode')) {
    columns.push('barcode');
    values.push('NULL');
  }
  if (lotColSet.has('code')) {
    columns.push('code');
    values.push('NULL');
  }
  if (lotColSet.has('serie')) {
    columns.push('serie');
    values.push(':serie');
  }
  if (lotColSet.has('date')) {
    columns.push('date');
    values.push('GETDATE()');
  }
  if (lotColSet.has('lot_id')) {
    columns.push('lot_id');
    values.push('NULL');
  }
  if (lotColSet.has('detail_id')) {
    columns.push('detail_id');
    values.push(':detailId');
  }
  if (lotColSet.has('emplacement')) {
    columns.push('emplacement');
    values.push('NULL');
  }
  if (lotColSet.has('type')) {
    columns.push('type');
    values.push('1');
  }
  if (lotColSet.has('etat')) {
    columns.push('etat');
    values.push('1');
  }
  if (lotColSet.has('cr_date')) {
    columns.push('cr_date');
    values.push('GETDATE()');
  }
  if (lotColSet.has('user_id')) {
    columns.push('user_id');
    values.push(':userId');
  }

  if (!columns.length) return;

  await sequelize.query(
    `INSERT INTO stock_detail_lot (${columns.join(', ')}) VALUES (${values.join(', ')})`,
    {
      replacements,
      transaction: sequelizeTransaction || undefined
    }
  );
};

const createReceptionFromCommande = async (commandeId, detailsOverride = null, userId = null, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  return await sequelize.transaction(async (t) => {
    const stockColSet = await getTableColumnSet(sequelize, 'stock');
    const stockDetailColSet = await getTableColumnSet(sequelize, 'stock_detail');
    const achatDetailColSet = await getTableColumnSet(sequelize, 'achat_document_detail');
    const achatDocumentColSet = await getTableColumnSet(sequelize, 'achat_document');
    const stockDepotColumn = stockColSet.has('depot_id')
      ? 'depot_id'
      : (stockColSet.has('adresse_id') ? 'adresse_id' : null);
    const stockDetailDepotColumn = stockDetailColSet.has('depot_id')
      ? 'depot_id'
      : (stockDetailColSet.has('adresse_id') ? 'adresse_id' : null);
    const achatDetailDepotSelect = achatDetailColSet.has('depot_id')
      ? 'depot_id'
      : (achatDetailColSet.has('adresse_id') ? 'adresse_id' : 'NULL AS depot_id');
    const achatDocumentDepotSelect = achatDocumentColSet.has('depot_id')
      ? 'depot_id'
      : (achatDocumentColSet.has('adresse_id') ? 'adresse_id' : 'NULL AS depot_id');

    const [commande] = await sequelize.query(
      `
        SELECT document_id, numero, date, description, part_id, contact_id, ${achatDocumentDepotSelect}
        FROM achat_document
        WHERE document_id = :commandeId AND type = 2
      `,
      {
        replacements: { commandeId },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      }
    );

    if (!commande) {
      throw new Error('Commande achat non trouvee');
    }

    const headerDepotValue = normalizePositiveInt(commande?.depot_id ?? commande?.adresse_id);
    const sourceRows = await getCommandeDetailReceptionState(sequelize, commandeId, achatDetailDepotSelect, t);
    const remainingRows = sourceRows.filter((row) => Number(row?.quantite_restante || 0) > 0);

    if (!remainingRows.length) {
      throw new Error('Toutes les quantites de cette commande ont deja ete receptionnees');
    }

    const compteurActuel = await getCompteurCurrent('REC', sequelize);
    const anneeCourte = new Date().getFullYear().toString().slice(2);
    const numeroReception = `REC${anneeCourte}-${Number(compteurActuel).toString().padStart(4, '0')}`;
    const dateSql = formatToSqlDateTime(commande.date);

    let stockColumns = 'numero, date, description, part_id, employe_id, type, etat, parent';
    let stockValues = ':numero, :date, :description, :part_id, :employe_id, 1, 1, :parent';
    if (stockColSet.has('part_ref')) {
      stockColumns += ', part_ref';
      stockValues += ', :part_ref';
    }
    if (stockDepotColumn) {
      stockColumns += `, ${stockDepotColumn}`;
      stockValues += ', :stockDepotValue';
    }

    const [insertRes] = await sequelize.query(
      `
        INSERT INTO stock (${stockColumns})
        OUTPUT INSERTED.id
        VALUES (${stockValues});
        UPDATE compteur SET compteur = compteur + 1 WHERE LTRIM(RTRIM(code)) = 'REC';
      `,
      {
        replacements: {
          numero: numeroReception,
          date: dateSql || null,
          description: commande.description || null,
          part_id: commande.part_id || null,
          employe_id: commande.contact_id || null,
          parent: commande.document_id,
          part_ref: commande.numero || null,
          stockDepotValue: headerDepotValue
        },
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      }
    );

    let stockId = null;
    if (Array.isArray(insertRes) && insertRes.length > 0) {
      stockId = insertRes[0]?.id ?? insertRes[0];
    } else if (insertRes && typeof insertRes === 'object' && insertRes.id) {
      stockId = insertRes.id;
    }
    if (!stockId) {
      const [fallback] = await sequelize.query(
        'SELECT TOP 1 id FROM stock ORDER BY id DESC',
        { type: sequelize.QueryTypes.SELECT, transaction: t }
      );
      stockId = fallback?.id || null;
    }
    if (!stockId) {
      throw new Error('Impossible de creer la reception (stock_id non recupere)');
    }

    const overrideRows = Array.isArray(detailsOverride) ? detailsOverride : [];
    const overrideMap = new Map(
      overrideRows.map((row, index) => [Number(row?.source_detail_id || row?.id || -(index + 1)), row])
    );

    const hasOverrideRows = overrideRows.length > 0;
    const rowsToInsert = remainingRows
      .filter((row) => !hasOverrideRows || overrideMap.has(Number(row?.id)))
      .map((row) => {
        const override = overrideMap.get(Number(row?.id));
        const requestedQty = override
          ? Number(override?.quantite ?? override?.qte ?? 0)
          : Number(row?.quantite_restante || 0);
        const remainingQty = Number(row?.quantite_restante || 0);
        const finalQty = Math.max(0, Math.min(remainingQty, Number.isFinite(requestedQty) ? requestedQty : 0));

        return {
          ...row,
          quantite: finalQty,
          prix: override?.prix ?? override?.pu ?? row?.prix ?? 0,
          taux_tva: override?.taux_tva ?? row?.taux_tva ?? 0,
          description: override?.description ?? row?.description ?? '',
          remise: override?.remise ?? row?.remise ?? 0,
          remise_montant: override?.remise_montant ?? row?.remise_montant ?? 0,
          depot_id: override?.depot_id ?? override?.adresse_id ?? row?.depot_id ?? row?.adresse_id ?? null,
          numero_lot: override?.numero_lot ?? override?.serie ?? ''
        };
      })
      .filter((row) => Number(row?.quantite || 0) > 0);

    if (!rowsToInsert.length) {
      throw new Error('Aucune quantite restante valide a receptionner');
    }

    for (let index = 0; index < rowsToInsert.length; index++) {
      const d = rowsToInsert[index];
      const descriptionLimited = String(d?.description || '').substring(0, 200);
      const depotValue = normalizePositiveInt(d?.depot_id ?? d?.adresse_id ?? d?.depot) ?? headerDepotValue;
      let detailColumns = 'stock_id, article_id, quantite, prix, taux_tva, description, sens, remise, remise_montant, cr_date';
      let detailValues = ':stock_id, :article_id, :quantite, :prix, :taux_tva, :description, 1, :remise, :remise_montant, GETDATE()';
      if (stockDetailDepotColumn) {
        detailColumns += `, ${stockDetailDepotColumn}`;
        detailValues += ', :depotValue';
      }
      const [insertedDetail] = await sequelize.query(
        `
          INSERT INTO stock_detail (${detailColumns})
          OUTPUT INSERTED.id
          VALUES (${detailValues})
        `,
        {
          replacements: {
            stock_id: stockId,
            article_id: d?.article_id ?? null,
            quantite: d?.quantite ?? 0,
            prix: d?.prix ?? 0,
            taux_tva: d?.taux_tva ?? 0,
            description: descriptionLimited,
            remise: d?.remise ?? 0,
            remise_montant: d?.remise_montant ?? 0,
            depotValue
          },
          type: sequelize.QueryTypes.INSERT,
          transaction: t
        }
      );

      const detailId = Array.isArray(insertedDetail)
        ? (insertedDetail[0]?.id ?? insertedDetail[0] ?? null)
        : (insertedDetail?.id ?? null);

      await syncStockDetailLot(sequelize, {
        stock_id: stockId,
        detail_id: detailId,
        ligne: index + 1,
        article_id: d?.article_id ?? null,
        quantite: d?.quantite ?? 0,
        serie: d?.numero_lot ?? d?.serie ?? '',
        user_id: userId
      }, t);
    }

    if (achatDetailColSet.has('etat')) {
      const updatedRows = await getCommandeDetailReceptionState(sequelize, commandeId, achatDetailDepotSelect, t);
      for (const row of updatedRows) {
        await sequelize.query(
          'UPDATE achat_document_detail SET etat = :etat WHERE id = :id',
          {
            replacements: {
              id: row.id,
              etat: Number(row?.quantite_restante || 0) <= 0 ? 1 : 0
            },
            transaction: t
          }
        );
      }
    }

    return {
      stock_id: stockId,
      numero: numeroReception,
      commande_id: commande.document_id
    };
  });
};

// RÃ©cupÃ©rer une rÃ©ception par ID (similaire Ã  getLivraisonById)
const createReceptionFromStockEntree = async (entreeStockId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  return await sequelize.transaction(async (t) => {
    const stockColSet = await getTableColumnSet(sequelize, 'stock');
    const stockDetailColSet = await getTableColumnSet(sequelize, 'stock_detail');
    const stockDocColSet = await getTableColumnSet(sequelize, 'stock_document');
    const stockDocDetailColSet = await getTableColumnSet(sequelize, 'stock_document_detail');
    const stockDepotColumn = stockColSet.has('depot_id')
      ? 'depot_id'
      : (stockColSet.has('adresse_id') ? 'adresse_id' : null);
    const stockDetailDepotColumn = stockDetailColSet.has('depot_id')
      ? 'depot_id'
      : (stockDetailColSet.has('adresse_id') ? 'adresse_id' : null);
    const stockDocDepotColumn = stockDocColSet.has('depot_id')
      ? 'depot_id'
      : (stockDocColSet.has('adresse_id') ? 'adresse_id' : null);
    const stockDocDetailDepotColumn = stockDocDetailColSet.has('depot_id')
      ? 'depot_id'
      : (stockDocDetailColSet.has('adresse_id') ? 'adresse_id' : null);

    const safeEntreeStockId = normalizePositiveInt(entreeStockId);
    if (!safeEntreeStockId) throw new Error('ID entrÃ©e de stock invalide');

    const sourceContactExpr = stockDocColSet.has('contact_id') && stockDocColSet.has('employe_id')
      ? 'COALESCE(contact_id, employe_id)'
      : (stockDocColSet.has('contact_id') ? 'contact_id' : (stockDocColSet.has('employe_id') ? 'employe_id' : 'NULL'));
    const sourceDepotSelect = stockDocDepotColumn ? `${stockDocDepotColumn} AS depot_id` : 'NULL AS depot_id';
    const [sourceEntree] = await sequelize.query(
      `SELECT id, numero, date, description, part_id, ${sourceContactExpr} AS contact_id, ${sourceDepotSelect}
       FROM stock_document
       WHERE id = :id AND type = 21`,
      {
        replacements: { id: safeEntreeStockId },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      }
    );

    if (!sourceEntree) throw new Error('EntrÃ©e de stock introuvable');

    const already = await sequelize.query(
      `SELECT TOP 1 id FROM stock WHERE type = 1 AND parent = :sourceId`,
      {
        replacements: { sourceId: safeEntreeStockId },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      }
    );
    if (Array.isArray(already) && already.length > 0) {
      throw new Error('Cette entrÃ©e de stock a dÃ©jÃ  Ã©tÃ© transfÃ©rÃ©e en rÃ©ception');
    }

    const headerDepotValue = normalizePositiveInt(sourceEntree?.depot_id);
    const compteurActuel = await getCompteurCurrent('REC', sequelize);
    const anneeCourte = new Date().getFullYear().toString().slice(2);
    const numeroReception = `REC${anneeCourte}-${Number(compteurActuel).toString().padStart(4, '0')}`;
    const dateSql = formatToSqlDateTime(sourceEntree.date);

    let stockColumns = 'numero, date, description, part_id, employe_id, type, etat, parent';
    let stockValues = ':numero, :date, :description, :part_id, :employe_id, 1, 1, :parent';
    if (stockColSet.has('part_ref')) {
      stockColumns += ', part_ref';
      stockValues += ', :part_ref';
    }
    if (stockDepotColumn) {
      stockColumns += `, ${stockDepotColumn}`;
      stockValues += ', :stockDepotValue';
    }

    const [insertRes] = await sequelize.query(
      `INSERT INTO stock (${stockColumns})
       OUTPUT INSERTED.id
       VALUES (${stockValues});
       UPDATE compteur SET compteur = compteur + 1 WHERE LTRIM(RTRIM(code)) = 'REC';`,
      {
        replacements: {
          numero: numeroReception,
          date: dateSql || null,
          description: sourceEntree.description || `Depuis entrÃ©e de stock ${sourceEntree.numero || safeEntreeStockId}`,
          part_id: sourceEntree.part_id || null,
          employe_id: sourceEntree.contact_id || null,
          parent: safeEntreeStockId,
          part_ref: sourceEntree.numero || null,
          stockDepotValue: headerDepotValue
        },
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      }
    );

    let stockId = null;
    if (Array.isArray(insertRes) && insertRes.length > 0) {
      stockId = insertRes[0]?.id ?? insertRes[0];
    } else if (insertRes && typeof insertRes === 'object' && insertRes.id) {
      stockId = insertRes.id;
    }
    if (!stockId) {
      const [fallback] = await sequelize.query(
        'SELECT TOP 1 id FROM stock ORDER BY id DESC',
        { type: sequelize.QueryTypes.SELECT, transaction: t }
      );
      stockId = fallback?.id || null;
    }
    if (!stockId) throw new Error('Impossible de crÃ©er la rÃ©ception (stock_id non rÃ©cupÃ©rÃ©)');

    const sourceDetailDepotSelect = stockDocDetailDepotColumn ? `${stockDocDetailDepotColumn} AS depot_id` : 'NULL AS depot_id';
    const sourceDetailDescriptionExpr = stockDocDetailColSet.has('description') ? 'description' : 'NULL';
    const sourceDetailConditions = ['stock_id = :stockId'];
    if (stockDocDetailColSet.has('sens')) {
      sourceDetailConditions.push('sens = 1');
    }
    const sourceDetails = await sequelize.query(
      `SELECT id, article_id, quantite, prix, taux_tva, ${sourceDetailDescriptionExpr} AS description, 0 AS remise, 0 AS remise_montant, ${sourceDetailDepotSelect}
       FROM stock_document_detail
       WHERE ${sourceDetailConditions.join(' AND ')}
       ORDER BY id`,
      {
        replacements: { stockId: safeEntreeStockId },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      }
    );

    const rows = Array.isArray(sourceDetails) ? sourceDetails : (sourceDetails ? [sourceDetails] : []);
    for (const d of rows) {
      const descriptionLimited = String(d?.description || '').substring(0, 200);
      const depotValue = normalizePositiveInt(d?.depot_id) ?? headerDepotValue;
      let detailColumns = 'stock_id, article_id, quantite, prix, taux_tva, description, sens, remise, remise_montant, cr_date';
      let detailValues = ':stock_id, :article_id, :quantite, :prix, :taux_tva, :description, 1, :remise, :remise_montant, GETDATE()';
      if (stockDetailDepotColumn) {
        detailColumns += `, ${stockDetailDepotColumn}`;
        detailValues += ', :depotValue';
      }
      await sequelize.query(
        `INSERT INTO stock_detail (${detailColumns}) VALUES (${detailValues})`,
        {
          replacements: {
            stock_id: stockId,
            article_id: d?.article_id ?? null,
            quantite: d?.quantite ?? 0,
            prix: d?.prix ?? 0,
            taux_tva: d?.taux_tva ?? 0,
            description: descriptionLimited,
            remise: d?.remise ?? 0,
            remise_montant: d?.remise_montant ?? 0,
            depotValue
          },
          type: sequelize.QueryTypes.INSERT,
          transaction: t
        }
      );
    }

    return { stock_id: stockId, numero: numeroReception, entree_stock_id: safeEntreeStockId };
  });
};

const getReceptionById = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  try {
    console.log(`[getReceptionById] ðŸ” Recherche rÃ©ception avec id=${id}`);
    const stockColSet = await getTableColumnSet(sequelize, 'stock');
    const stockDepotExpr = stockColSet.has('depot_id')
      ? 's.depot_id'
      : (stockColSet.has('adresse_id') ? 's.adresse_id' : null);
    const stockDepotIdSelect = stockDepotExpr ? `${stockDepotExpr} AS depot_id` : 'NULL AS depot_id';
    const stockDepotNomSelect = stockDepotExpr ? 'wh.nom AS depot_nom' : 'NULL AS depot_nom';
    const stockDepotJoin = stockDepotExpr ? `LEFT JOIN warehouse wh ON wh.id = ${stockDepotExpr}` : '';

    // RÃ©cupÃ©rer les infos principales depuis stock (type = 1)
    const receptionRows = await sequelize.query(
      `SELECT 
        s.id,
        s.numero,
        s.date,
        s.description,
        s.part_id,
        s.parent,
        s.employe_id AS contact_id,
        s.part_ref,
        bc.document_id AS source_commande_id,
        bc.numero AS source_commande_numero,
        es.id AS source_entree_stock_id,
        es.numero AS source_entree_stock_numero,
        ${stockDepotIdSelect},
        ${stockDepotNomSelect},
        p.nom AS fournisseur_nom
      FROM stock s
      LEFT JOIN achat_document bc ON bc.document_id = s.parent AND bc.type = 2
      LEFT JOIN stock_document es ON es.id = s.parent AND es.type = 21
      LEFT JOIN partenaire p ON p.part_id = s.part_id AND p.type = 2
      ${stockDepotJoin}
      WHERE s.id = :id AND s.type = 1`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const reception = Array.isArray(receptionRows) && receptionRows.length > 0 ? receptionRows[0] : null;
    if (!reception) {
      console.log(`[getReceptionById] âŒ RÃ©ception non trouvÃ©e pour id=${id}`);
      return null;
    }

    console.log(`[getReceptionById] âœ… RÃ©ception trouvÃ©e:`, {
      id: reception.id,
      numero: reception.numero,
      part_id: reception.part_id
    });

    const documentId = reception.id;
    const stockDetailColSet = await getTableColumnSet(sequelize, 'stock_detail');
    const depotExpr = stockDetailColSet.has('depot_id')
      ? 'sd.depot_id'
      : (stockDetailColSet.has('adresse_id') ? 'sd.adresse_id' : null);
    const depotIdSelect = depotExpr ? `${depotExpr} AS depot_id` : 'NULL AS depot_id';
    const depotNomSelect = depotExpr ? 'w.nom AS depot_nom' : 'NULL AS depot_nom';
    const depotJoin = depotExpr ? `LEFT JOIN warehouse w ON w.id = ${depotExpr}` : '';

    // RÃ©cupÃ©rer les dÃ©tails depuis stock_detail (sens = 1)
    const detailRows = await sequelize.query(
      `SELECT 
        sd.id, 
        sd.id AS detail_id, 
        sd.stock_id AS document_id, 
        sd.article_id, 
        sd.quantite AS qte, 
        sd.prix AS pu, 
        sd.taux_tva AS tva,
        sd.remise,
        sd.remise_montant,
        sd.description,
        ${depotIdSelect},
        ${depotNomSelect},
        a.article_nom,
        a.article_cod
      FROM stock_detail sd
      LEFT JOIN article a ON a.article_id = sd.article_id
      ${depotJoin}
      WHERE sd.stock_id = :id AND sd.sens = 1
      ORDER BY sd.id DESC`,
      {
        replacements: { id: documentId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const details = Array.isArray(detailRows) ? detailRows : [];
    const lotColSet = await getStockDetailLotColumnSet(sequelize);
    const lotMap = new Map();

    if (lotColSet.size && details.length > 0) {
      const lotRows = await sequelize.query(
        `
          SELECT detail_id, serie
          FROM (
            SELECT
              detail_id,
              serie,
              ROW_NUMBER() OVER (
                PARTITION BY detail_id
                ORDER BY ISNULL(cr_date, date) DESC, ISNULL(ligne, 0) DESC
              ) AS rn
            FROM stock_detail_lot
            WHERE stock_id = :id
          ) lots
          WHERE rn = 1
        `,
        {
          replacements: { id: documentId },
          type: sequelize.QueryTypes.SELECT
        }
      );

      for (const lotRow of Array.isArray(lotRows) ? lotRows : []) {
        const detailId = normalizePositiveInt(lotRow?.detail_id);
        if (detailId) {
          lotMap.set(detailId, lotRow?.serie || '');
        }
      }
    }

    // Normaliser les dÃ©tails
    const normalizedDetails = details.map((detail) => {
      const articleId = detail.article_id ?? null;
      const prix = detail.pu ?? detail.prix ?? 0;
      const quantite = detail.qte ?? detail.quantite ?? 0;
      const taux_tva = detail.tva ?? detail.taux_tva ?? 0;
      const designation = detail.description ?? detail.article_nom ?? '';

      let remiseMode = null;
      let remiseFraction = null;
      let remiseMontant = null;

      const remiseMontantStock = detail.remise_montant != null && detail.remise_montant !== undefined ? Number(detail.remise_montant) : null;
      const remiseFractionStock = detail.remise != null && detail.remise !== undefined ? Number(detail.remise) : null;

      if (detail.remise_montant != null && detail.remise_montant !== undefined && (detail.remise === null || detail.remise === undefined)) {
        remiseMode = 'montant';
        remiseMontant = remiseMontantStock !== null && !isNaN(remiseMontantStock) ? remiseMontantStock : 0;
        remiseFraction = null;
      } else if (detail.remise != null && detail.remise !== undefined && (detail.remise_montant === null || detail.remise_montant === undefined)) {
        remiseMode = 'pourcentage';
        remiseFraction = remiseFractionStock !== null && !isNaN(remiseFractionStock) ? remiseFractionStock : 0;
        remiseMontant = null;
      } else {
        remiseFraction = remiseFractionStock !== null && !isNaN(remiseFractionStock) ? remiseFractionStock : 0;
        remiseMontant = remiseMontantStock !== null && !isNaN(remiseMontantStock) ? remiseMontantStock : 0;
        remiseMode = null;
      }

      return {
        id: detail.id ?? detail.detail_id ?? null,
        detail_id: detail.detail_id ?? detail.id ?? null,
        document_id: detail.document_id ?? documentId,
        article_id: articleId,
        designation,
        description: detail.description ?? detail.article_nom ?? '',
        article_nom: detail.article_nom ?? designation,
        article_cod: detail.article_cod ?? '',
        pu: prix,
        prix,
        qte: quantite,
        quantite,
        tva: taux_tva,
        taux_tva,
        depot_id: detail.depot_id ?? null,
        depot_nom: detail.depot_nom ?? null,
        numero_lot: lotMap.get(normalizePositiveInt(detail.detail_id ?? detail.id)) || '',
        serie: lotMap.get(normalizePositiveInt(detail.detail_id ?? detail.id)) || '',
        remise: remiseFraction,
        remise_montant: remiseMontant,
        remise_mode: remiseMode,
        ht: prix * quantite,
        ttc: (prix * quantite) * (1 + (taux_tva || 0))
      };
    });

  // RÃ©cupÃ©rer les informations du fournisseur avec jointures sur adresse et partenaire_identifiant
  let fournisseurInfo = null;
  if (reception.part_id != null) {
    try {
      const fournisseurRows = await sequelize.query(
        `SELECT 
          p.part_id, 
          p.nom,
          a.nom AS adresse,
          pi.identifiant AS ice
        FROM partenaire p
        LEFT JOIN adresse a ON p.part_id = a.part_id AND p.type = 2
        LEFT JOIN partenaire_identifiant pi ON pi.part_id = p.part_id AND pi.identifiant_type = 8
        WHERE p.part_id = :part_id`,
        {
          replacements: { part_id: reception.part_id },
          type: sequelize.QueryTypes.SELECT
        }
      );

      if (Array.isArray(fournisseurRows) && fournisseurRows.length > 0) {
        fournisseurInfo = fournisseurRows[0];
      }
    } catch (error) {
      console.error('[getReceptionById] âŒ Erreur rÃ©cupÃ©ration fournisseur:', error);
      // Continuer sans les infos fournisseur
      fournisseurInfo = null;
    }
  }

    return {
      ...reception,
      document_id: documentId,
      part_id: reception.part_id,
      contact_id: reception.contact_id ?? reception.employe_id ?? null,
      fournisseur: reception.fournisseur_nom || null,
      fournisseur_nom: reception.fournisseur_nom || null,
      source_document_id: reception.source_commande_id || reception.source_entree_stock_id || reception.parent || null,
      source_document_type: reception.source_commande_id ? 'BON_COMMANDE' : (reception.source_entree_stock_id ? 'ENTREE_STOCK' : null),
      source_numero: reception.source_commande_numero || reception.source_entree_stock_numero || reception.part_ref || null,
      details: Array.isArray(normalizedDetails) ? normalizedDetails : [],
      fournisseurInfo: fournisseurInfo || null
    };
  } catch (error) {
    console.error(`[getReceptionById] âŒ Erreur lors de la rÃ©cupÃ©ration de la rÃ©ception id=${id}:`, error);
    throw error;
  }
};

// Mettre Ã  jour une rÃ©ception
const updateReception = async (id, receptionData, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const stockColSet = await getTableColumnSet(sequelize, 'stock');
  const stockDetailColSet = await getTableColumnSet(sequelize, 'stock_detail');
  const depotColumn = stockColSet.has('depot_id')
    ? 'depot_id'
    : (stockColSet.has('adresse_id') ? 'adresse_id' : null);
  const detailDepotColumn = stockDetailColSet.has('depot_id')
    ? 'depot_id'
    : (stockDetailColSet.has('adresse_id') ? 'adresse_id' : null);
  const depotValue = normalizePositiveInt(receptionData?.depot_id ?? receptionData?.adresse_id);
  const depotSet = depotColumn ? `,\n         ${depotColumn} = :depotValue` : '';

  await sequelize.query(
    `UPDATE stock
     SET date = :date,
         description = :description,
         part_id = :part_id,
         employe_id = :employe_id${depotSet}
     WHERE id = :id AND type = 1`,
    {
      replacements: {
        id,
        date: receptionData.date || null,
        description: receptionData.description || null,
        part_id: receptionData.part_id || null,
        employe_id: receptionData.contact_id || null,
        depotValue
      }
    }
  );

  if (detailDepotColumn && depotValue) {
    await sequelize.query(
      `UPDATE stock_detail
       SET ${detailDepotColumn} = :depotValue
       WHERE stock_id = :id AND sens = 1`,
      {
        replacements: { id, depotValue }
      }
    );
  }

  return await getReceptionById(id, sequelize);
};

// Supprimer une rÃ©ception (soft delete: etat = 0)
const deleteReception = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  await sequelize.query(
    `UPDATE stock
     SET etat = 0
     WHERE id = :id AND type = 1`,
    {
      replacements: { id }
    }
  );

  return { success: true, message: 'RÃ©ception supprimÃ©e avec succÃ¨s' };
};

// Sauvegarder une ligne de dÃ©tail dans stock_detail
const saveDetailStock = async (payload, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const stockDetailColSet = await getTableColumnSet(sequelize, 'stock_detail');
  const depotColumn = stockDetailColSet.has('depot_id')
    ? 'depot_id'
    : (stockDetailColSet.has('adresse_id') ? 'adresse_id' : null);
  const {
    stock_id,
    article_id,
    quantite,
    prix,
    taux_tva,
    description,
    remise,
    remise_montant,
    depot_id
  } = payload;
  let depotValue = normalizePositiveInt(depot_id);
  if (!depotValue) {
    depotValue = await getStockHeaderDepotValue(sequelize, stock_id, null);
  }
  let columns = 'stock_id, article_id, quantite, prix, taux_tva, description, sens, remise, remise_montant , cr_date';
  let values = ':stock_id, :article_id, :quantite, :prix, :taux_tva, :description, 1, :remise, :remise_montant, GETDATE()';
  if (depotColumn) {
    columns += `, ${depotColumn}`;
    values += ', :depotValue';
  }

  const [result] = await sequelize.query(
    `INSERT INTO stock_detail (${columns})
     OUTPUT INSERTED.id
     VALUES (${values})`,
    {
      replacements: {
        stock_id,
        article_id: article_id || null,
        quantite: quantite || 0,
        prix: prix || 0,
        taux_tva: taux_tva || 0,
        description: String(description || '').substring(0, 200),
        remise: remise !== null && remise !== undefined ? remise : null,
        remise_montant: remise_montant !== null && remise_montant !== undefined ? remise_montant : null,
        depotValue
      },
      type: sequelize.QueryTypes.INSERT
    }
  );

  let detail_id = null;
  if (Array.isArray(result) && result.length > 0) {
    detail_id = result[0]?.id ?? result[0];
  } else if (result && typeof result === 'object' && result.id) {
    detail_id = result.id;
  }

  return detail_id;
};

// Mettre Ã  jour une ligne de dÃ©tail dans stock_detail
const updateDetailStock = async (id, payload, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const stockDetailColSet = await getTableColumnSet(sequelize, 'stock_detail');
  const depotColumn = stockDetailColSet.has('depot_id')
    ? 'depot_id'
    : (stockDetailColSet.has('adresse_id') ? 'adresse_id' : null);
  const {
    article_id,
    quantite,
    prix,
    taux_tva,
    description,
    remise,
    remise_montant,
    depot_id
  } = payload;
  let depotValue = normalizePositiveInt(depot_id);
  if (!depotValue) {
    depotValue = await getStockHeaderDepotValue(sequelize, payload?.stock_id ?? payload?.document_id, null);
  }

  await sequelize.query(
    `UPDATE stock_detail
     SET article_id = :article_id,
         quantite = :quantite,
         prix = :prix,
         taux_tva = :taux_tva,
         description = :description,
         remise = :remise,
         remise_montant = :remise_montant,
         ${depotColumn ? `${depotColumn} = :depotValue,` : ''}
         cr_date = GETDATE()
     WHERE id = :id AND sens = 1`,
    {
      replacements: {
        id,
        article_id: article_id || null,
        quantite: quantite || 0,
        prix: prix || 0,
        taux_tva: taux_tva || 0,
        description: String(description || '').substring(0, 200),
        remise: remise !== null && remise !== undefined ? remise : null,
        remise_montant: remise_montant !== null && remise_montant !== undefined ? remise_montant : null,
        depotValue
      }
    }
  );
};

// Sauvegarder les lignes de dÃ©tail d'une rÃ©ception (traitement en lot)
const saveDetailLines = async (lignes, userId = null, sequelizeConnection = null) => {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return [];
  }

  const sequelize = sequelizeConnection || getConnection();
  const results = [];

  for (let index = 0; index < lignes.length; index++) {
    const ligne = lignes[index];
    try {
      const stockId = ligne?.stock_id ?? ligne?.document_id ?? null;
      if (!stockId) {
        results.push({
          id: ligne?.id ?? null,
          update_mode: ligne?.update_mode ?? null,
          success: false,
          error: 'stock_id manquant'
        });
        continue;
      }

      const articleId = ligne?.article_id ?? null;
      const quantite = Number(ligne?.qte ?? ligne?.quantite) || 0;
      const prix = Number(ligne?.pu ?? ligne?.prix) || 0;
      const tauxTva = ligne?.tva != null
        ? Number(ligne.tva)
        : (ligne?.taux_tva != null ? Number(ligne.taux_tva) : 0);
      const description = ligne?.designation ?? ligne?.description ?? '';
      
      // DÃ©tecter le mode de remise
      const remiseValue = ligne?.remise;
      const remiseMontantValue = ligne?.remise_montant;

      let remiseFraction = 0;
      let remiseMontant = 0;
      let detectedMode = null;

      if (remiseMontantValue !== null && remiseMontantValue !== undefined && (remiseValue === null || remiseValue === undefined)) {
        detectedMode = 'montant';
        remiseMontant = remiseMontantValue === null || remiseMontantValue === undefined ? 0 : Number(remiseMontantValue);
        if (isNaN(remiseMontant)) remiseMontant = 0;
        remiseFraction = null;
      }
      else if (remiseValue !== null && remiseValue !== undefined && (remiseMontantValue === null || remiseMontantValue === undefined)) {
        detectedMode = 'pourcentage';
        remiseFraction = remiseValue === null || remiseValue === undefined ? 0 : Number(remiseValue);
        if (!isNaN(remiseFraction) && remiseFraction > 1) {
          remiseFraction = remiseFraction / 100;
        }
        if (isNaN(remiseFraction)) remiseFraction = 0;
        remiseMontant = null;
      }
      else if (remiseMontantValue !== null && remiseMontantValue !== undefined) {
        detectedMode = 'montant';
        remiseMontant = Number(remiseMontantValue);
        if (isNaN(remiseMontant)) remiseMontant = 0;
        remiseFraction = null;
      }
      else {
        remiseFraction = null;
        remiseMontant = null;
      }

      const payload = {
        stock_id: stockId,
        document_id: stockId,
        article_id: articleId,
        quantite,
        prix,
        taux_tva: tauxTva,
        description,
        depot_id: ligne?.depot_id ?? ligne?.adresse_id ?? ligne?.depot ?? null,
        remise: remiseFraction,
        remise_montant: remiseMontant
      };
      const numeroLot = ligne?.numero_lot ?? ligne?.serie ?? '';

      if (ligne?.update_mode === 'U' && ligne?.id) {
        await updateDetailStock(ligne.id, payload, sequelize);
        await syncStockDetailLot(sequelize, {
          stock_id: stockId,
          detail_id: ligne.id,
          ligne: index + 1,
          article_id: articleId,
          quantite,
          serie: numeroLot,
          user_id: userId
        });
        results.push({ id: ligne.id, update_mode: 'U', success: true, remise_mode: detectedMode });
      } else if (ligne?.update_mode === 'D' && ligne?.id) {
        await deleteLignesParIds([ligne.id], sequelize);
        results.push({ id: ligne.id, update_mode: 'D', success: true, remise_mode: detectedMode });
      } else {
        const insertedId = await saveDetailStock(payload, sequelize);
        await syncStockDetailLot(sequelize, {
          stock_id: stockId,
          detail_id: insertedId,
          ligne: index + 1,
          article_id: articleId,
          quantite,
          serie: numeroLot,
          user_id: userId
        });
        results.push({ id: insertedId, update_mode: 'I', success: true, remise_mode: detectedMode });
      }
    } catch (error) {
      console.error('Erreur lors du traitement d\'une ligne stock_detail:', error);
      results.push({
        id: ligne?.id ?? null,
        update_mode: ligne?.update_mode ?? null,
        success: false,
        error: error.message
      });
    }
  }

  return results;
};

// Supprimer des lignes de dÃ©tail par IDs
const deleteLignesParIds = async (ligneIds, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const lotColSet = await getStockDetailLotColumnSet(sequelize);

  if (!Array.isArray(ligneIds) || ligneIds.length === 0) {
    throw new Error('IDs de lignes invalides pour la suppression');
  }

  if (lotColSet.size) {
    await sequelize.query(
      `DELETE FROM stock_detail_lot WHERE detail_id IN (${ligneIds.map(() => '?').join(',')})`,
      { replacements: ligneIds }
    );
  }

  await sequelize.query(
    `DELETE FROM stock_detail WHERE id IN (${ligneIds.map(() => '?').join(',')}) AND sens = 1`,
    { replacements: ligneIds }
  );
};

module.exports = {
  getCommandesNonReceptionnees,
  getAllReceptions,
  createReceptionFromCommande,
  createReceptionFromStockEntree,
  getReceptionById,
  updateReception,
  deleteReception,
  saveDetailLines,
  deleteLignesParIds
};



