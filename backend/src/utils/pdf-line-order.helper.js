const crypto = require('crypto');

const ORDER_KEYS = ['ordre_ligne', 'ligne', 'line_order', 'position', 'ordre'];
const ID_KEYS = ['ligne_id', 'detail_id', 'id'];
const SOURCE_KEYS = ['source_stock_id', 'stock_id', 'source_document_id'];

const toPositiveNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
};

const firstPositiveNumber = (row, keys) => {
  for (const key of keys) {
    const value = toPositiveNumberOrNull(row?.[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
};

const compareNullableNumber = (left, right) => {
  const leftHasValue = left !== null && left !== undefined;
  const rightHasValue = right !== null && right !== undefined;

  if (leftHasValue && rightHasValue && left !== right) {
    return left - right;
  }

  if (leftHasValue && !rightHasValue) {
    return -1;
  }

  if (!leftHasValue && rightHasValue) {
    return 1;
  }

  return 0;
};

const normalizeSignatureValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).replace(/\s+/g, ' ').trim().slice(0, 240);
};

const sortPdfLinesByDisplayOrder = (rows) => {
  if (!Array.isArray(rows)) {
    return rows;
  }

  return rows
    .map((row, index) => ({
      row,
      index,
      sourceOrder: firstPositiveNumber(row, SOURCE_KEYS),
      lineOrder: firstPositiveNumber(row, ORDER_KEYS),
      lineId: firstPositiveNumber(row, ID_KEYS)
    }))
    .sort((left, right) => {
      const sourceCompare = compareNullableNumber(left.sourceOrder, right.sourceOrder);
      if (sourceCompare !== 0) {
        return sourceCompare;
      }

      const lineCompare = compareNullableNumber(left.lineOrder, right.lineOrder);
      if (lineCompare !== 0) {
        return lineCompare;
      }

      if (left.lineOrder !== null || right.lineOrder !== null) {
        const idCompare = compareNullableNumber(left.lineId, right.lineId);
        if (idCompare !== 0) {
          return idCompare;
        }
      }

      return left.index - right.index;
    })
    .map(({ row }) => row);
};

const buildPdfLineOrderSignature = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return 'empty';
  }

  const payload = rows.map((row, index) => [
    index,
    firstPositiveNumber(row, SOURCE_KEYS) || '',
    firstPositiveNumber(row, ORDER_KEYS) || '',
    firstPositiveNumber(row, ID_KEYS) || '',
    normalizeSignatureValue(row?.article_id),
    normalizeSignatureValue(row?.article_cod),
    normalizeSignatureValue(row?.quantite),
    normalizeSignatureValue(row?.prix),
    normalizeSignatureValue(row?.taux_tva),
    normalizeSignatureValue(row?.remise),
    normalizeSignatureValue(row?.remise_montant),
    normalizeSignatureValue(row?.designation || row?.article || row?.article_nom)
  ].join('~')).join('|');

  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
};

module.exports = {
  sortPdfLinesByDisplayOrder,
  buildPdfLineOrderSignature
};
