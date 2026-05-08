const { getConnection } = require('../../config/database');

const tableColumnSetCache = new Map();
const FOURNISSEUR_PARTNER_TYPE = 2;

const getTableColumnSet = async (sequelize, tableName) => {
  const cacheKey = `${String(sequelize?.config?.database || 'default').toLowerCase()}:${String(tableName || '').toLowerCase()}`;
  if (tableColumnSetCache.has(cacheKey)) {
    return tableColumnSetCache.get(cacheKey);
  }

  const rows = await sequelize.query(
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

  const columnSet = new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.COLUMN_NAME || '').toLowerCase()));
  tableColumnSetCache.set(cacheKey, columnSet);
  return columnSet;
};

const normalizePositiveInt = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const toFiniteNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatToSqlDateTime = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const extractInsertedId = (queryResult, fieldName = 'id') => {
  if (!Array.isArray(queryResult)) {
    if (queryResult && typeof queryResult === 'object' && queryResult[fieldName]) {
      return queryResult[fieldName];
    }
    return typeof queryResult === 'number' ? queryResult : null;
  }

  for (const item of queryResult) {
    if (Array.isArray(item)) {
      const nested = extractInsertedId(item, fieldName);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (item && typeof item === 'object' && item[fieldName]) {
      return item[fieldName];
    }

    if (typeof item === 'number') {
      return item;
    }
  }

  return null;
};

const getHeaderConfig = async (sequelize) => {
  const columns = await getTableColumnSet(sequelize, 'stock_document');
  const hasContactId = columns.has('contact_id');
  const hasEmployeId = columns.has('employe_id');
  const contactExpr = hasContactId && hasEmployeId
    ? 'COALESCE(sd.contact_id, sd.employe_id)'
    : (hasContactId ? 'sd.contact_id' : (hasEmployeId ? 'sd.employe_id' : 'NULL'));
  const depotExpr = columns.has('depot_id')
    ? 'sd.depot_id'
    : (columns.has('adresse_id') ? 'sd.adresse_id' : 'NULL');
  const depotColumn = columns.has('depot_id')
    ? 'depot_id'
    : (columns.has('adresse_id') ? 'adresse_id' : null);

  return {
    columns,
    hasContactId,
    hasEmployeId,
    contactExpr,
    depotExpr,
    depotColumn,
    hasPartRef: columns.has('part_ref'),
    hasUserId: columns.has('user_id'),
    hasEtat: columns.has('etat'),
    hasCrDate: columns.has('cr_date'),
    hasImprime: columns.has('imprime'),
    hasParent: columns.has('parent'),
    hasDate: columns.has('date'),
    hasPartId: columns.has('part_id')
  };
};

const getDetailConfig = async (sequelize) => {
  const columns = await getTableColumnSet(sequelize, 'stock_document_detail');
  const depotExpr = columns.has('depot_id')
    ? 'sdd.depot_id'
    : (columns.has('adresse_id') ? 'sdd.adresse_id' : 'NULL');

  return {
    columns,
    depotExpr,
    depotColumn: columns.has('depot_id')
      ? 'depot_id'
      : (columns.has('adresse_id') ? 'adresse_id' : null),
    hasDescription: columns.has('description'),
    hasRubriqueId: columns.has('rubrique_id'),
    hasEtat: columns.has('etat'),
    hasSens: columns.has('sens'),
    hasUserId: columns.has('user_id'),
    hasCrDate: columns.has('cr_date'),
    hasUniteId: columns.has('unite_id')
  };
};

const loadPartnerInfo = async (sequelize, partId) => {
  const safePartId = normalizePositiveInt(partId);
  if (!safePartId) {
    return null;
  }

  const rows = await sequelize.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'partenaire'
    `,
    { type: sequelize.QueryTypes.SELECT }
  );

  const availableColumns = new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.COLUMN_NAME || '').toLowerCase()));
  const selectFields = ['p.part_id', 'p.nom'];
  const optionalColumns = [
    { column: 'telephone', alias: 'telephone' },
    { column: 'email', alias: 'email' },
    { column: 'adresse', alias: 'adresse' },
    { column: 'ice', alias: 'ice' },
    { column: 'cin', alias: 'cin' },
    { column: 'rc', alias: 'rc' },
    { column: 'IF_', alias: 'IF_' },
    { column: 'PATENTE', alias: 'PATENTE' },
    { column: 'cnss', alias: 'cnss' }
  ];

  optionalColumns.forEach(({ column, alias }) => {
    if (availableColumns.has(column.toLowerCase())) {
      selectFields.push(`p.${column} AS [${alias}]`);
    } else {
      selectFields.push(`NULL AS [${alias}]`);
    }
  });

  const partnerRows = await sequelize.query(
    `SELECT ${selectFields.join(', ')} FROM partenaire p WHERE p.part_id = :partId AND p.type = :partnerType`,
    {
      replacements: { partId: safePartId, partnerType: FOURNISSEUR_PARTNER_TYPE },
      type: sequelize.QueryTypes.SELECT
    }
  );

  return Array.isArray(partnerRows) && partnerRows.length > 0 ? partnerRows[0] : null;
};

const ensurePartnerType = async (sequelize, partId, expectedType, partnerLabel) => {
  const safePartId = normalizePositiveInt(partId);
  if (!safePartId) {
    return null;
  }

  const rows = await sequelize.query(
    `
      SELECT TOP 1 part_id
      FROM partenaire
      WHERE part_id = :partId AND type = :expectedType
    `,
    {
      replacements: {
        partId: safePartId,
        expectedType: normalizePositiveInt(expectedType)
      },
      type: sequelize.QueryTypes.SELECT
    }
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Le partenaire sélectionné n'est pas un ${partnerLabel} valide.`);
  }

  return safePartId;
};

const buildHeaderUpdateSets = (config, payload, replacements) => {
  const sets = [];

  if (payload.date !== undefined && config.hasDate) {
    sets.push('date = :date');
    replacements.date = formatToSqlDateTime(payload.date) || null;
  }

  if (payload.description !== undefined) {
    sets.push('description = :description');
    replacements.description = String(payload.description || '');
  }

  if (payload.part_id !== undefined && config.hasPartId) {
    sets.push('part_id = :part_id');
    replacements.part_id = normalizePositiveInt(payload.part_id);
  }

  if (payload.contact_id !== undefined) {
    const contactValue = normalizePositiveInt(payload.contact_id);
    if (config.hasContactId) {
      sets.push('contact_id = :contact_id');
      replacements.contact_id = contactValue;
    }
    if (config.hasEmployeId) {
      sets.push('employe_id = :employe_id');
      replacements.employe_id = contactValue;
    }
  }

  if (payload.depot_id !== undefined && config.depotColumn) {
    sets.push(`${config.depotColumn} = :depot_id`);
    replacements.depot_id = normalizePositiveInt(payload.depot_id);
  }

  return sets;
};

const getAllEntreesStock = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const headerConfig = await getHeaderConfig(sequelize);

  const {
    page = 1,
    pageSize = 25,
    orderBy = 'date',
    orderDirection = 'DESC',
    search = '',
    dateFrom = '',
    dateTo = '',
    fournisseur = ''
  } = options;

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safePageSize = Math.max(1, parseInt(pageSize, 10) || 25);
  const offset = (safePage - 1) * safePageSize;
  const validColumns = ['document_id', 'numero', 'date', 'client', 'commercial', 'total_ht', 'total_tva', 'total_ttc'];
  const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'date';
  const safeOrderDirection = String(orderDirection).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const hasContactJoin = headerConfig.contactExpr !== 'NULL';
  const contactJoin = hasContactJoin ? `LEFT JOIN contact c ON c.id = ${headerConfig.contactExpr}` : '';
  const contactSelect = hasContactJoin ? 'c.nom' : 'NULL';
  const orderColumnMap = {
    document_id: 'sd.id',
    numero: 'sd.numero',
    date: 'sd.date',
    client: 'p.nom',
    commercial: hasContactJoin ? 'c.nom' : 'sd.id',
    total_ht: 'ISNULL(t.total_ht, 0)',
    total_tva: 'ISNULL(t.total_tva, 0)',
    total_ttc: 'ISNULL(t.total_ttc, 0)'
  };
  const orderByExpression = orderColumnMap[safeOrderBy] || 'sd.date';

  const whereConditions = [
    'sd.type = 21',
    'ISNULL(sd.etat, 1) <> 0',
    `EXISTS (SELECT 1 FROM partenaire p_filter WHERE p_filter.part_id = sd.part_id AND p_filter.type = ${FOURNISSEUR_PARTNER_TYPE})`
  ];
  const replacements = { offset, pageSize: safePageSize };

  if (String(search || '').trim()) {
    whereConditions.push(hasContactJoin
      ? `(
          sd.numero LIKE :search
          OR p.nom LIKE :search
          OR c.nom LIKE :search
          OR sd.description LIKE :search
        )`
      : `(
          sd.numero LIKE :search
          OR p.nom LIKE :search
          OR sd.description LIKE :search
        )`);
    replacements.search = `%${String(search).trim()}%`;
  }

  if (String(fournisseur || '').trim()) {
    whereConditions.push('p.nom LIKE :fournisseur');
    replacements.fournisseur = `%${String(fournisseur).trim()}%`;
  }

  if (dateFrom) {
    whereConditions.push('CAST(sd.date AS DATE) >= :dateFrom');
    replacements.dateFrom = dateFrom;
  }

  if (dateTo) {
    whereConditions.push('CAST(sd.date AS DATE) <= :dateTo');
    replacements.dateTo = dateTo;
  }

  const query = `
    SELECT *
    FROM (
      SELECT
        sd.id AS document_id,
        sd.numero,
        sd.date,
        sd.description,
        ${headerConfig.hasPartRef ? 'sd.part_ref' : 'NULL'} AS part_ref,
        p.nom AS client,
        ${contactSelect} AS commercial,
        ISNULL(t.total_ht, 0) AS total_ht,
        ISNULL(t.total_tva, 0) AS total_tva,
        ISNULL(t.total_ttc, 0) AS total_ttc,
        rec.id AS transferred_reception_id,
        CAST(CASE WHEN rec.id IS NULL THEN 0 ELSE 1 END AS BIT) AS is_transferred_to_reception,
        COUNT(*) OVER() AS total_count,
        ROW_NUMBER() OVER (ORDER BY ${orderByExpression} ${safeOrderDirection}) AS RowNum
      FROM stock_document sd
      LEFT JOIN (
        SELECT
          sdd.stock_id,
          SUM(ISNULL(sdd.quantite, 0) * ISNULL(sdd.prix, 0)) AS total_ht,
          SUM((ISNULL(sdd.quantite, 0) * ISNULL(sdd.prix, 0)) * ISNULL(sdd.taux_tva, 0)) AS total_tva,
          SUM((ISNULL(sdd.quantite, 0) * ISNULL(sdd.prix, 0)) * (1 + ISNULL(sdd.taux_tva, 0))) AS total_ttc
        FROM stock_document_detail sdd
        GROUP BY sdd.stock_id
      ) t ON t.stock_id = sd.id
      LEFT JOIN partenaire p ON p.part_id = sd.part_id AND p.type = ${FOURNISSEUR_PARTNER_TYPE}
      ${contactJoin}
      LEFT JOIN stock rec ON rec.parent = sd.id AND rec.type = 1
      WHERE ${whereConditions.join(' AND ')}
    ) AS PaginatedResults
    WHERE RowNum > :offset AND RowNum <= (:offset + :pageSize)
    ORDER BY RowNum
  `;

  const rows = await sequelize.query(query, {
    replacements,
    type: sequelize.QueryTypes.SELECT
  });

  const data = Array.isArray(rows) ? rows.map(({ total_count, RowNum, ...row }) => row) : [];
  const total = Array.isArray(rows) && rows.length > 0 ? Number(rows[0].total_count || 0) : 0;

  return {
    data,
    pagination: {
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize))
    }
  };
};

const countAllEntreesStock = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const rows = await sequelize.query(
    `
      SELECT COUNT(*) AS total
      FROM stock_document sd
      WHERE sd.type = 21
        AND ISNULL(sd.etat, 1) <> 0
        AND EXISTS (
          SELECT 1
          FROM partenaire p
          WHERE p.part_id = sd.part_id AND p.type = ${FOURNISSEUR_PARTNER_TYPE}
        )
    `,
    { type: sequelize.QueryTypes.SELECT }
  );
  return Number(Array.isArray(rows) && rows.length > 0 ? rows[0].total || 0 : 0);
};

const getEntreeStockById = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const safeId = normalizePositiveInt(id);
  if (!safeId) {
    return null;
  }

  const [headerConfig, detailConfig] = await Promise.all([
    getHeaderConfig(sequelize),
    getDetailConfig(sequelize)
  ]);

  const hasContactJoin = headerConfig.contactExpr !== 'NULL';
  const contactJoin = hasContactJoin ? `LEFT JOIN contact c ON c.id = ${headerConfig.contactExpr}` : '';
  const contactSelect = hasContactJoin ? 'c.nom' : 'NULL';
  const rubriqueJoin = detailConfig.hasRubriqueId
    ? `LEFT JOIN listes l ON l.id = sdd.rubrique_id AND l.group_id = 6000`
    : '';

  const headerRows = await sequelize.query(
    `
      SELECT
        sd.id,
        sd.numero,
        sd.date,
        sd.description,
        ${headerConfig.hasPartId ? 'sd.part_id' : 'NULL'} AS part_id,
        ${headerConfig.contactExpr} AS contact_id,
        ${headerConfig.hasPartRef ? 'sd.part_ref' : 'NULL'} AS part_ref,
        p.nom AS client_nom,
        ${contactSelect} AS commercial_nom
      FROM stock_document sd
      LEFT JOIN partenaire p ON p.part_id = sd.part_id AND p.type = ${FOURNISSEUR_PARTNER_TYPE}
      ${contactJoin}
      WHERE sd.id = :id AND sd.type = 21 AND ISNULL(sd.etat, 1) <> 0
    `,
    {
      replacements: { id: safeId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const entreeStock = Array.isArray(headerRows) && headerRows.length > 0 ? headerRows[0] : null;
  if (!entreeStock) {
    return null;
  }

  const detailRows = await sequelize.query(
    `
      SELECT
        sdd.id,
        sdd.id AS detail_id,
        sdd.stock_id AS document_id,
        sdd.article_id,
        a.article_cod,
        a.article_nom,
        sdd.quantite AS qte,
        sdd.prix AS pu,
        sdd.taux_tva AS tva,
        ${detailConfig.depotExpr} AS depot_id,
        ${detailConfig.hasRubriqueId ? 'sdd.rubrique_id' : 'NULL'} AS rubrique_id,
        ${detailConfig.hasDescription ? 'sdd.description' : 'NULL'} AS description,
        w.nom AS depot_nom,
        ${detailConfig.hasRubriqueId ? 'l.nom' : 'NULL'} AS rubrique_nom
      FROM stock_document_detail sdd
      LEFT JOIN article a ON a.article_id = sdd.article_id
      LEFT JOIN warehouse w ON w.id = ${detailConfig.depotExpr}
      ${rubriqueJoin}
      WHERE sdd.stock_id = :id
      ORDER BY sdd.id DESC
    `,
    {
      replacements: { id: safeId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const normalizedDetails = (Array.isArray(detailRows) ? detailRows : []).map((detail) => {
    const prix = toFiniteNumber(detail.pu, 1);
    const quantite = toFiniteNumber(detail.qte, 0);
    const tauxTva = toFiniteNumber(detail.tva, 0);
    const designation = detail.description || detail.article_nom || '';

    return {
      id: detail.id ?? detail.detail_id ?? null,
      detail_id: detail.detail_id ?? detail.id ?? null,
      document_id: detail.document_id ?? safeId,
      article_id: normalizePositiveInt(detail.article_id),
      article_cod: detail.article_cod || '',
      designation,
      description: designation,
      article_nom: detail.article_nom || designation,
      pu: prix,
      prix,
      qte: quantite,
      quantite,
      tva: tauxTva,
      taux_tva: tauxTva,
      remise: 0,
      remise_montant: 0,
      remise_mode: null,
      depot_id: normalizePositiveInt(detail.depot_id),
      depot_nom: detail.depot_nom || null,
      rubrique_id: normalizePositiveInt(detail.rubrique_id),
      rubrique_nom: detail.rubrique_nom || null,
      ht: quantite * prix,
      ttc: (quantite * prix) * (1 + tauxTva)
    };
  });

  const clientInfo = await loadPartnerInfo(sequelize, entreeStock.part_id);

  return {
    ...entreeStock,
    document_id: safeId,
    part_id: normalizePositiveInt(entreeStock.part_id),
    contact_id: normalizePositiveInt(entreeStock.contact_id),
    client: entreeStock.client_nom || null,
    commercial: entreeStock.commercial_nom || null,
    client_nom: entreeStock.client_nom || null,
    commercial_nom: entreeStock.commercial_nom || null,
    source: 'stock_document',
    details: normalizedDetails,
    clientInfo: clientInfo || null
  };
};

const addEntreeStock = async ({
  numero,
  date,
  description,
  part_id,
  contact_id,
  depot_id = null,
  type = 21,
  etat = 1,
  parent = null
}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const { getCompteurCurrent } = require('../../services/compteur.service');
  const headerConfig = await getHeaderConfig(sequelize);

  return await sequelize.transaction(async (transaction) => {
    let numeroFinal = String(numero || '').trim();
    const shouldIncrementCounter = !numeroFinal;
    const validatedPartId = await ensurePartnerType(sequelize, part_id, FOURNISSEUR_PARTNER_TYPE, 'fournisseur');

    if (!numeroFinal) {
      const compteurActuel = await getCompteurCurrent('ENT', sequelize);
      if (compteurActuel === null || compteurActuel === undefined) {
        throw new Error('Impossible de recuperer le compteur ENT');
      }

      const anneeCourte = new Date().getFullYear().toString().slice(2);
      numeroFinal = `ENT${anneeCourte}-${String(compteurActuel).padStart(4, '0')}`;
    }

    const insertCols = ['numero', 'type', 'description'];
    const insertVals = [':numero', ':type', ':description'];
    const replacements = {
      numero: numeroFinal,
      type: normalizePositiveInt(type) || 21,
      description: description || null
    };

    if (headerConfig.hasDate) {
      insertCols.push('date');
      insertVals.push(':date');
      replacements.date = formatToSqlDateTime(date) || formatToSqlDateTime(new Date());
    }

    if (headerConfig.hasPartId) {
      insertCols.push('part_id');
      insertVals.push(':part_id');
      replacements.part_id = validatedPartId;
    }

    if (headerConfig.hasPartRef) {
      insertCols.push('part_ref');
      insertVals.push(':part_ref');
      replacements.part_ref = null;
    }

    if (headerConfig.hasContactId) {
      insertCols.push('contact_id');
      insertVals.push(':contact_id');
      replacements.contact_id = normalizePositiveInt(contact_id);
    }

    if (headerConfig.hasEmployeId) {
      insertCols.push('employe_id');
      insertVals.push(':employe_id');
      replacements.employe_id = normalizePositiveInt(contact_id);
    }

    if (headerConfig.depotColumn) {
      insertCols.push(headerConfig.depotColumn);
      insertVals.push(':depot_id');
      replacements.depot_id = normalizePositiveInt(depot_id);
    }

    if (headerConfig.hasUserId) {
      insertCols.push('user_id');
      insertVals.push(':user_id');
      replacements.user_id = 1;
    }

    if (headerConfig.hasEtat) {
      insertCols.push('etat');
      insertVals.push(':etat');
      replacements.etat = normalizePositiveInt(etat) || 1;
    }

    if (headerConfig.hasCrDate) {
      insertCols.push('cr_date');
      insertVals.push('GETDATE()');
    }

    if (headerConfig.hasImprime) {
      insertCols.push('imprime');
      insertVals.push('0');
    }

    if (headerConfig.hasParent && parent !== undefined && parent !== null) {
      insertCols.push('parent');
      insertVals.push(':parent');
      replacements.parent = normalizePositiveInt(parent);
    }

    await sequelize.query(
      `INSERT INTO stock_document (${insertCols.join(', ')}) VALUES (${insertVals.join(', ')})`,
      {
        replacements,
        type: sequelize.QueryTypes.INSERT,
        transaction
      }
    );

    const idRows = await sequelize.query(
      'SELECT TOP 1 id FROM stock_document WHERE numero = :numero ORDER BY id DESC',
      {
        replacements: { numero: numeroFinal },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    const stockDocumentId = Array.isArray(idRows) && idRows.length > 0 ? idRows[0].id : null;
    if (!stockDocumentId) {
      throw new Error('Erreur lors de la creation de l entree de stock');
    }

    if (shouldIncrementCounter) {
      await sequelize.query(
        `UPDATE compteur SET compteur = compteur + 1 WHERE LTRIM(RTRIM(code)) = 'ENT'`,
        { type: sequelize.QueryTypes.UPDATE, transaction }
      );
    }

    return stockDocumentId;
  });
};

const saveDetailStock = async (detail, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const detailConfig = await getDetailConfig(sequelize);
  const stockId = normalizePositiveInt(detail.stock_id || detail.document_id);

  if (!stockId) {
    throw new Error('stock_id manquant');
  }

  const insertCols = ['stock_id', 'article_id', 'quantite', 'prix', 'taux_tva'];
  const insertVals = [':stock_id', ':article_id', ':quantite', ':prix', ':taux_tva'];
  const replacements = {
    stock_id: stockId,
    article_id: normalizePositiveInt(detail.article_id),
    quantite: toFiniteNumber(detail.qte ?? detail.quantite, 0),
    prix: toFiniteNumber(detail.pu ?? detail.prix, 1),
    taux_tva: toFiniteNumber(detail.tva ?? detail.taux_tva, 0)
  };

  if (detailConfig.hasSens) {
    insertCols.push('sens');
    insertVals.push(':sens');
    replacements.sens = 1;
  }

  if (detailConfig.depotColumn) {
    insertCols.push(detailConfig.depotColumn);
    insertVals.push(':depot_id');
    replacements.depot_id = normalizePositiveInt(detail.depot_id ?? detail.adresse_id);
  }

  if (detailConfig.hasRubriqueId) {
    insertCols.push('rubrique_id');
    insertVals.push(':rubrique_id');
    replacements.rubrique_id = normalizePositiveInt(detail.rubrique_id);
  }

  if (detailConfig.hasDescription) {
    insertCols.push('description');
    insertVals.push(':description');
    replacements.description = String(detail.description || detail.designation || '').substring(0, 200) || null;
  }

  if (detailConfig.hasUniteId) {
    insertCols.push('unite_id');
    insertVals.push(':unite_id');
    replacements.unite_id = normalizePositiveInt(detail.unite_id) || 1;
  }

  if (detailConfig.hasEtat) {
    insertCols.push('etat');
    insertVals.push(':etat');
    replacements.etat = 0;
  }

  if (detailConfig.hasUserId) {
    insertCols.push('user_id');
    insertVals.push(':user_id');
    replacements.user_id = 1;
  }

  if (detailConfig.hasCrDate) {
    insertCols.push('cr_date');
    insertVals.push('GETDATE()');
  }

  const queryResult = await sequelize.query(
    `INSERT INTO stock_document_detail (${insertCols.join(', ')}) OUTPUT INSERTED.id VALUES (${insertVals.join(', ')})`,
    {
      replacements,
      type: sequelize.QueryTypes.INSERT
    }
  );

  const insertedId = extractInsertedId(queryResult, 'id');
  if (insertedId) {
    return insertedId;
  }

  const fallbackRows = await sequelize.query(
    'SELECT TOP 1 id FROM stock_document_detail WHERE stock_id = :stock_id ORDER BY id DESC',
    {
      replacements: { stock_id: stockId },
      type: sequelize.QueryTypes.SELECT
    }
  );

  return Array.isArray(fallbackRows) && fallbackRows.length > 0 ? fallbackRows[0].id : null;
};

const updateDetailStock = async (id, detail, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const detailConfig = await getDetailConfig(sequelize);
  const safeId = normalizePositiveInt(id);

  if (!safeId) {
    throw new Error('ID de detail invalide');
  }

  const replacements = {
    id: safeId,
    article_id: normalizePositiveInt(detail.article_id),
    quantite: toFiniteNumber(detail.qte ?? detail.quantite, 0),
    prix: toFiniteNumber(detail.pu ?? detail.prix, 1),
    taux_tva: toFiniteNumber(detail.tva ?? detail.taux_tva, 0)
  };

  const sets = [
    'article_id = :article_id',
    'quantite = :quantite',
    'prix = :prix',
    'taux_tva = :taux_tva'
  ];

  if (detailConfig.hasSens) {
    sets.push('sens = :sens');
    replacements.sens = 1;
  }

  if (detailConfig.depotColumn) {
    sets.push(`${detailConfig.depotColumn} = :depot_id`);
    replacements.depot_id = normalizePositiveInt(detail.depot_id ?? detail.adresse_id);
  }

  if (detailConfig.hasRubriqueId) {
    sets.push('rubrique_id = :rubrique_id');
    replacements.rubrique_id = normalizePositiveInt(detail.rubrique_id);
  }

  if (detailConfig.hasDescription) {
    sets.push('description = :description');
    replacements.description = String(detail.description || detail.designation || '').substring(0, 200) || null;
  }

  if (detailConfig.hasUniteId) {
    sets.push('unite_id = :unite_id');
    replacements.unite_id = normalizePositiveInt(detail.unite_id) || 1;
  }

  await sequelize.query(
    `UPDATE stock_document_detail SET ${sets.join(', ')} WHERE id = :id`,
    {
      replacements,
      type: sequelize.QueryTypes.UPDATE
    }
  );

  return safeId;
};

const saveInfo = async (info, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const safeDocumentId = normalizePositiveInt(info?.document_id);
  if (!safeDocumentId) {
    return;
  }

  const description = [info?.condition, info?.expedition, info?.transporteur, info?.note]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n');

  if (!description) {
    return;
  }

  await sequelize.query(
    `UPDATE stock_document SET description = :description WHERE id = :id AND type = 21`,
    {
      replacements: {
        id: safeDocumentId,
        description
      },
      type: sequelize.QueryTypes.UPDATE
    }
  );
};

const updateEntreeStock = async (id, payload, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const safeId = normalizePositiveInt(id);
  if (!safeId) {
    throw new Error('ID entree de stock invalide');
  }

  const headerConfig = await getHeaderConfig(sequelize);
  const replacements = { id: safeId };
  const sets = buildHeaderUpdateSets(headerConfig, payload || {}, replacements);

  if (payload && Object.prototype.hasOwnProperty.call(payload, 'part_id') && headerConfig.hasPartId) {
    replacements.part_id = await ensurePartnerType(sequelize, payload.part_id, FOURNISSEUR_PARTNER_TYPE, 'fournisseur');
  }

  if (sets.length === 0) {
    return;
  }

  await sequelize.query(
    `UPDATE stock_document SET ${sets.join(', ')} WHERE id = :id AND type = 21`,
    {
      replacements,
      type: sequelize.QueryTypes.UPDATE
    }
  );
};

const deleteEntreeStock = async (ids, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const safeIds = (Array.isArray(ids) ? ids : []).map(normalizePositiveInt).filter(Boolean);
  if (safeIds.length === 0) {
    throw new Error('IDs invalides pour la suppression');
  }

  await sequelize.query(
    `DELETE FROM stock_document_detail WHERE stock_id IN (${safeIds.map(() => '?').join(',')})`,
    { replacements: safeIds }
  );

  await sequelize.query(
    `UPDATE stock_document SET etat = 0 WHERE id IN (${safeIds.map(() => '?').join(',')}) AND type = 21`,
    { replacements: safeIds }
  );
};

const deleteLignesParIds = async (ligneIds, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const safeIds = (Array.isArray(ligneIds) ? ligneIds : []).map(normalizePositiveInt).filter(Boolean);
  if (safeIds.length === 0) {
    throw new Error('IDs de lignes invalides pour la suppression');
  }

  await sequelize.query(
    `DELETE FROM stock_document_detail WHERE id IN (${safeIds.map(() => '?').join(',')})`,
    { replacements: safeIds }
  );
};

const saveDetailLines = async (lignes, sequelizeConnection = null) => {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return [];
  }

  const sequelize = sequelizeConnection || getConnection();
  const results = [];

  for (const ligne of lignes) {
    try {
      const stockId = normalizePositiveInt(ligne?.stock_id ?? ligne?.document_id);
      if (!stockId) {
        results.push({
          id: ligne?.id ?? null,
          update_mode: ligne?.update_mode ?? null,
          success: false,
          error: 'stock_id manquant'
        });
        continue;
      }

      const payload = {
        stock_id: stockId,
        document_id: stockId,
        article_id: normalizePositiveInt(ligne?.article_id),
        qte: toFiniteNumber(ligne?.qte ?? ligne?.quantite, 0),
        quantite: toFiniteNumber(ligne?.qte ?? ligne?.quantite, 0),
        pu: 1,
        prix: 1,
        tva: toFiniteNumber(ligne?.tva ?? ligne?.taux_tva, 0),
        taux_tva: toFiniteNumber(ligne?.tva ?? ligne?.taux_tva, 0),
        description: ligne?.designation || ligne?.description || '',
        depot_id: normalizePositiveInt(ligne?.depot_id),
        rubrique_id: normalizePositiveInt(ligne?.rubrique_id),
        unite_id: normalizePositiveInt(ligne?.unite_id) || 1
      };

      if (ligne?.update_mode === 'U' && ligne?.id) {
        await updateDetailStock(ligne.id, payload, sequelize);
        results.push({ id: ligne.id, update_mode: 'U', success: true });
      } else if (ligne?.update_mode === 'D' && ligne?.id) {
        await deleteLignesParIds([ligne.id], sequelize);
        results.push({ id: ligne.id, update_mode: 'D', success: true });
      } else {
        const insertedId = await saveDetailStock(payload, sequelize);
        results.push({ id: insertedId, update_mode: 'I', success: true });
      }
    } catch (error) {
      results.push({
        id: ligne?.id ?? null,
        update_mode: ligne?.update_mode ?? null,
        success: false,
        error: error.message || 'Erreur inconnue'
      });
    }
  }

  return results;
};

module.exports = {
  getAllEntreesStock,
  countAllEntreesStock,
  getEntreeStockById,
  addEntreeStock,
  saveDetailStock,
  saveDetailLines,
  updateDetailStock,
  updateEntreeStock,
  deleteEntreeStock,
  deleteLignesParIds,
  saveInfo
};
