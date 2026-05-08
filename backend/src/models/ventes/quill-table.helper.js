const BASE_QUILL_TABLE = 'vente_document_quill';
const COMMANDE_QUILL_TABLE = 'vente_commande_quill';
const LIVRAISON_QUILL_TABLE = 'vente_livraison_quill';

const TABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertSafeTableName(tableName) {
  if (!TABLE_NAME_PATTERN.test(String(tableName || ''))) {
    throw new Error(`Nom de table Quill invalide: ${tableName}`);
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

async function ensureQuillTable(sequelize, tableName, transaction = null) {
  const safeTableName = assertSafeTableName(tableName);

  if (safeTableName === BASE_QUILL_TABLE) {
    return await tableExists(sequelize, safeTableName, transaction);
  }

  if (await tableExists(sequelize, safeTableName, transaction)) {
    return true;
  }

  if (!(await tableExists(sequelize, BASE_QUILL_TABLE, transaction))) {
    return false;
  }

  await sequelize.query(
    `SELECT TOP 0 * INTO ${safeTableName} FROM ${BASE_QUILL_TABLE}`,
    { transaction }
  );

  return true;
}

function getVenteDocumentQuillTable(documentType) {
  return Number(documentType) === 2 ? COMMANDE_QUILL_TABLE : BASE_QUILL_TABLE;
}

function getVenteDocumentQuillCandidates(documentType) {
  const primaryTable = getVenteDocumentQuillTable(documentType);
  return primaryTable === BASE_QUILL_TABLE
    ? [BASE_QUILL_TABLE]
    : [primaryTable, BASE_QUILL_TABLE];
}

function getLivraisonQuillCandidates() {
  return [LIVRAISON_QUILL_TABLE];
}

async function getExistingTables(sequelize, tableNames, transaction = null) {
  const existing = [];

  for (const tableName of tableNames) {
    if (await tableExists(sequelize, tableName, transaction)) {
      existing.push(tableName);
    }
  }

  return existing;
}

async function loadQuillRowsByDocument(sequelize, documentId, tableNames, transaction = null) {
  const existingTables = await getExistingTables(sequelize, tableNames, transaction);
  const mergedRows = [];
  const seenQuillIds = new Set();

  for (const tableName of existingTables) {
    const columnSet = await getTableColumnSet(sequelize, tableName, transaction);
    const selectColumns = [
      columnSet.has('id') ? 'id' : 'NULL AS id',
      'quill_id',
      'document_id',
      'designation',
      columnSet.has('article_id') ? 'article_id' : 'NULL AS article_id',
      columnSet.has('type') ? 'type' : 'NULL AS type'
    ];
    const rows = await sequelize.query(
      `SELECT ${selectColumns.join(', ')} FROM ${assertSafeTableName(tableName)} WHERE document_id = :documentId`,
      {
        replacements: { documentId },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    for (const row of Array.isArray(rows) ? rows : []) {
      const key = String(row.quill_id);
      if (seenQuillIds.has(key)) {
        continue;
      }
      seenQuillIds.add(key);
      mergedRows.push({ ...row, __tableName: tableName });
    }
  }

  return mergedRows;
}

function mergeDetailsWithQuill(details, quillRows, options = {}) {
  const detailIdField = options.detailIdField || 'id';
  const designationField = options.designationField || 'designation';
  const fallbackFields = Array.isArray(options.fallbackFields)
    ? options.fallbackFields
    : ['description', 'article_nom'];

  const quillMap = new Map();
  for (const row of (Array.isArray(quillRows) ? quillRows : [])) {
    if (row?.quill_id !== undefined && row?.quill_id !== null) {
      quillMap.set(String(row.quill_id), row);
    }
    if (row?.id !== undefined && row?.id !== null) {
      quillMap.set(String(row.id), row);
    }
  }

  return (Array.isArray(details) ? details : []).map((detail) => {
    const row = quillMap.get(String(detail?.[detailIdField]));
    let designation = row?.designation;

    if (!designation) {
      for (const field of fallbackFields) {
        if (detail?.[field]) {
          designation = detail[field];
          break;
        }
      }
    }

    return {
      ...detail,
      [designationField]: designation || ''
    };
  });
}

async function upsertQuillDesignation(sequelize, options = {}) {
  const {
    tableName,
    quillId,
    documentId,
    designation,
    articleId,
    entryType = null,
    transaction = null
  } = options;

  if (!quillId || !documentId || articleId === undefined || articleId === null) {
    return false;
  }

  const safeTableName = assertSafeTableName(tableName);
  const tableReady = await ensureQuillTable(sequelize, safeTableName, transaction);

  if (!tableReady) {
    return false;
  }

  const columnSet = await getTableColumnSet(sequelize, safeTableName, transaction);
  if (!columnSet.has('quill_id') || !columnSet.has('document_id') || !columnSet.has('designation')) {
    return false;
  }

  const replacements = {
    quillId,
    documentId,
    designation: designation || '',
    articleId,
    entryType
  };
  const updateParts = [
    'document_id = :documentId',
    'designation = :designation'
  ];
  const insertColumns = ['quill_id', 'document_id', 'designation'];
  const insertValues = [':quillId', ':documentId', ':designation'];

  if (columnSet.has('article_id')) {
    updateParts.push('article_id = :articleId');
    insertColumns.push('article_id');
    insertValues.push(':articleId');
  }

  if (entryType !== null && entryType !== undefined && columnSet.has('type')) {
    updateParts.push('type = :entryType');
    insertColumns.push('type');
    insertValues.push(':entryType');
  }

  if (columnSet.has('cr_date')) {
    updateParts.push('cr_date = GETDATE()');
    insertColumns.push('cr_date');
    insertValues.push('GETDATE()');
  }

  await sequelize.query(
    `
      IF EXISTS (SELECT 1 FROM ${safeTableName} WHERE quill_id = :quillId)
        UPDATE ${safeTableName}
        SET ${updateParts.join(',\n            ')}
        WHERE quill_id = :quillId
      ELSE
        INSERT INTO ${safeTableName} (${insertColumns.join(', ')})
        VALUES (${insertValues.join(', ')})
    `,
    {
      replacements,
      transaction
    }
  );

  if (columnSet.has('id')) {
    const rows = await sequelize.query(
      `SELECT TOP 1 id, quill_id FROM ${safeTableName} WHERE quill_id = :quillId ORDER BY id DESC`,
      {
        replacements: { quillId },
        type: sequelize.QueryTypes.SELECT,
        transaction
      }
    );
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : true;
  }

  return { id: quillId, quill_id: quillId };
}

async function deleteQuillRowsByIds(sequelize, tableNames, quillIds, transaction = null) {
  if (!Array.isArray(quillIds) || quillIds.length === 0) {
    return;
  }

  const existingTables = await getExistingTables(sequelize, tableNames, transaction);

  if (existingTables.length === 0) {
    return;
  }

  for (const tableName of existingTables) {
    const columnSet = await getTableColumnSet(sequelize, tableName, transaction);
    const predicates = [];
    if (columnSet.has('quill_id')) {
      predicates.push(`quill_id IN (${quillIds.map((_, index) => `:id${index}`).join(',')})`);
    }
    if (columnSet.has('id')) {
      predicates.push(`id IN (${quillIds.map((_, index) => `:id${index}`).join(',')})`);
    }
    if (predicates.length === 0) {
      continue;
    }

    await sequelize.query(
      `DELETE FROM ${assertSafeTableName(tableName)} WHERE ${predicates.join(' OR ')}`,
      {
        replacements: quillIds.reduce((acc, id, index) => {
          acc[`id${index}`] = id;
          return acc;
        }, {}),
        type: sequelize.QueryTypes.DELETE,
        transaction
      }
    );
  }
}

module.exports = {
  BASE_QUILL_TABLE,
  COMMANDE_QUILL_TABLE,
  LIVRAISON_QUILL_TABLE,
  tableExists,
  getTableColumnSet,
  ensureQuillTable,
  getVenteDocumentQuillTable,
  getVenteDocumentQuillCandidates,
  getLivraisonQuillCandidates,
  loadQuillRowsByDocument,
  mergeDetailsWithQuill,
  upsertQuillDesignation,
  deleteQuillRowsByIds
};
