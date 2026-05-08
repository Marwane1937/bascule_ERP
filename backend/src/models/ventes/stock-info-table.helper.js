const BASE_INFO_TABLE = 'vente_document_info';
const STOCK_INFO_TABLE = 'stock_detail_info';
const TABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertSafeTableName(tableName) {
  if (!TABLE_NAME_PATTERN.test(String(tableName || ''))) {
    throw new Error(`Nom de table info invalide: ${tableName}`);
  }
  return tableName;
}

async function tableExists(sequelize, tableName, transaction = null) {
  const safeTableName = assertSafeTableName(tableName);
  const rows = await sequelize.query(
    `
      SELECT 1 AS found
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = :tableName
    `,
    {
      replacements: { tableName: safeTableName },
      type: sequelize.QueryTypes.SELECT,
      transaction
    }
  );

  return Array.isArray(rows) && rows.length > 0;
}

async function getTableColumnSet(sequelize, tableName, transaction = null) {
  const safeTableName = assertSafeTableName(tableName);
  const rows = await sequelize.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = :tableName
    `,
    {
      replacements: { tableName: safeTableName },
      type: sequelize.QueryTypes.SELECT,
      transaction
    }
  );

  return new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.COLUMN_NAME || '').toLowerCase()));
}

async function ensureStockInfoTable(sequelize, transaction = null) {
  if (await tableExists(sequelize, STOCK_INFO_TABLE, transaction)) {
    return true;
  }

  if (await tableExists(sequelize, BASE_INFO_TABLE, transaction)) {
    await sequelize.query(
      `SELECT TOP 0 * INTO ${assertSafeTableName(STOCK_INFO_TABLE)} FROM ${assertSafeTableName(BASE_INFO_TABLE)}`,
      { transaction }
    );
    return true;
  }

  await sequelize.query(
    `
      CREATE TABLE ${assertSafeTableName(STOCK_INFO_TABLE)} (
        document_id INT NOT NULL PRIMARY KEY,
        [date] DATETIME NULL,
        [condition] NVARCHAR(255) NULL,
        expedition NVARCHAR(255) NULL,
        transporteur NVARCHAR(255) NULL
      )
    `,
    { transaction }
  );

  return true;
}

function normalizeInfoRow(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  let normalizedDate = row.date || null;
  if (normalizedDate) {
    const parsed = normalizedDate instanceof Date ? normalizedDate : new Date(normalizedDate);
    if (!Number.isNaN(parsed.getTime())) {
      const pad = (value) => String(value).padStart(2, '0');
      normalizedDate = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
    }
  }

  return {
    ...row,
    document_id: row.document_id ?? null,
    date: normalizedDate,
    condition: row.condition || '',
    expedition: row.expedition || '',
    transporteur: row.transporteur || ''
  };
}

async function loadStockInfoRowsByDocumentIds(sequelize, documentIds, transaction = null) {
  const ids = Array.from(
    new Set(
      (Array.isArray(documentIds) ? documentIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  if (ids.length === 0) {
    return [];
  }

  const tableReady = await tableExists(sequelize, STOCK_INFO_TABLE, transaction);
  if (!tableReady) {
    return [];
  }

  const replacements = {};
  const placeholders = ids.map((id, index) => {
    const key = `documentId${index}`;
    replacements[key] = id;
    return `:${key}`;
  });

  const rows = await sequelize.query(
    `
      SELECT
        document_id,
        [date] AS [date],
        [condition] AS [condition],
        expedition,
        transporteur
      FROM ${assertSafeTableName(STOCK_INFO_TABLE)}
      WHERE document_id IN (${placeholders.join(', ')})
    `,
    {
      replacements,
      type: sequelize.QueryTypes.SELECT,
      transaction
    }
  );

  return (Array.isArray(rows) ? rows : [])
    .map(normalizeInfoRow)
    .filter(Boolean);
}

async function loadStockInfoByDocument(sequelize, documentId, transaction = null) {
  const rows = await loadStockInfoRowsByDocumentIds(sequelize, [documentId], transaction);
  return rows[0] || null;
}

async function upsertStockInfo(sequelize, info, transaction = null) {
  const documentId = Number(info?.document_id || 0);

  if (!Number.isFinite(documentId) || documentId <= 0) {
    return false;
  }

  const tableReady = await ensureStockInfoTable(sequelize, transaction);
  if (!tableReady) {
    return false;
  }

  const columnSet = await getTableColumnSet(sequelize, STOCK_INFO_TABLE, transaction);
  const insertColumns = ['document_id'];
  const insertValues = [':document_id'];
  const updateParts = [];
  const replacements = {
    document_id: documentId,
    date: info?.date || null,
    condition: info?.condition || '',
    expedition: info?.expedition || '',
    transporteur: info?.transporteur || ''
  };

  if (columnSet.has('date')) {
    insertColumns.push('[date]');
    insertValues.push(':date');
    updateParts.push('[date] = :date');
  }
  if (columnSet.has('condition')) {
    insertColumns.push('[condition]');
    insertValues.push(':condition');
    updateParts.push('[condition] = :condition');
  }
  if (columnSet.has('expedition')) {
    insertColumns.push('expedition');
    insertValues.push(':expedition');
    updateParts.push('expedition = :expedition');
  }
  if (columnSet.has('transporteur')) {
    insertColumns.push('transporteur');
    insertValues.push(':transporteur');
    updateParts.push('transporteur = :transporteur');
  }

  if (updateParts.length === 0) {
    return false;
  }

  await sequelize.query(
    `
      IF EXISTS (SELECT 1 FROM ${assertSafeTableName(STOCK_INFO_TABLE)} WHERE document_id = :document_id)
        UPDATE ${assertSafeTableName(STOCK_INFO_TABLE)}
        SET ${updateParts.join(', ')}
        WHERE document_id = :document_id
      ELSE
        INSERT INTO ${assertSafeTableName(STOCK_INFO_TABLE)} (${insertColumns.join(', ')})
        VALUES (${insertValues.join(', ')})
    `,
    {
      replacements,
      transaction
    }
  );

  return true;
}

module.exports = {
  BASE_INFO_TABLE,
  STOCK_INFO_TABLE,
  ensureStockInfoTable,
  loadStockInfoByDocument,
  loadStockInfoRowsByDocumentIds,
  upsertStockInfo
};
