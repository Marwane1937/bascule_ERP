function getQueryTypes(sequelize) {
  return sequelize.QueryTypes || require('sequelize').QueryTypes;
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = typeof value === 'string'
    ? Number(value.replace(',', '.'))
    : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getLineQuantity(line, fallback = 1) {
  return toFiniteNumber(
    line?.quantite ?? line?.qte ?? line?.quantity ?? line?.qty,
    fallback
  );
}

function getLinePrice(line, fallback = 0) {
  return toFiniteNumber(
    line?.prix ?? line?.pu ?? line?.price,
    fallback
  );
}

function getLineTax(line, fallback = 0) {
  return toFiniteNumber(
    line?.taux_tva ?? line?.tva ?? line?.taxe,
    fallback
  );
}

async function getNomenclatureRows(sequelize, composeId) {
  const id = parseInt(composeId, 10);
  if (!id) {
    return [];
  }

  const rows = await sequelize.query(
    `
      SELECT
        n.Compose_id,
        n.Composant_id,
        n.Quantite,
        n.Poids_Standard,
        n.Poids_reel,
        a.article_cod AS composant_cod,
        a.article_nom AS composant_nom,
        a.prix_vente AS composant_prix,
        f.nom AS famille_nom,
        u.nom AS unite_nom,
        CASE WHEN EXISTS (
          SELECT 1
          FROM article_Nomenclature child
          WHERE child.Compose_id = n.Composant_id
        ) THEN 1 ELSE 0 END AS has_children
      FROM article_Nomenclature n
      LEFT JOIN article a ON a.article_id = n.Composant_id
      LEFT JOIN famille f ON f.id = n.Famille
      LEFT JOIN unite u ON u.id = n.Unite
      WHERE n.Compose_id = :composeId
      ORDER BY a.article_nom ASC
    `,
    {
      replacements: { composeId: id },
      type: getQueryTypes(sequelize).SELECT
    }
  );

  return Array.isArray(rows) ? rows : [];
}

async function hasNomenclature(sequelize, articleId) {
  const rows = await getNomenclatureRows(sequelize, articleId);
  return rows.length > 0;
}

async function getNomenclatureNodes(sequelize, composeId, parentQuantity = 1, depth = 0, visited = new Set()) {
  const id = parseInt(composeId, 10);
  if (!id || depth > 4 || visited.has(id)) {
    return [];
  }

  const nextVisited = new Set(visited);
  nextVisited.add(id);
  const rows = await getNomenclatureRows(sequelize, id);
  const nodes = [];

  for (const row of rows) {
    const componentId = parseInt(row?.Composant_id, 10) || 0;
    const unitQuantity = toFiniteNumber(row?.Quantite, 0);
    const totalQuantity = unitQuantity * toFiniteNumber(parentQuantity, 1);
    const price = toFiniteNumber(row?.composant_prix, 0);
    const node = {
      article_id: componentId,
      code: row?.composant_cod || '',
      designation: row?.composant_nom || '',
      quantite: unitQuantity,
      quantiteTotale: totalQuantity,
      prix: price,
      total: price * totalQuantity,
      famille: row?.famille_nom || '',
      unite: row?.unite_nom || '',
      poidsStandard: row?.Poids_Standard != null ? toFiniteNumber(row.Poids_Standard, 0) : null,
      poidsReel: row?.Poids_reel != null ? toFiniteNumber(row.Poids_reel, 0) : null,
      children: []
    };

    if (componentId && Number(row?.has_children || 0) === 1) {
      node.children = await getNomenclatureNodes(sequelize, componentId, totalQuantity, depth + 1, nextVisited);
    }

    nodes.push(node);
  }

  return nodes;
}

async function enrichRowsWithNomenclature(rows, sequelize) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const cache = new Map();

  for (const line of safeRows) {
    const articleId = parseInt(line?.article_id, 10) || 0;
    if (!articleId) {
      line.nomenclatureComponents = [];
      continue;
    }

    const quantity = getLineQuantity(line, 1);
    const cacheKey = `${articleId}:${quantity}`;
    if (!cache.has(cacheKey)) {
      cache.set(cacheKey, await getNomenclatureNodes(sequelize, articleId, quantity));
    }

    line.nomenclatureComponents = cloneNomenclatureNodes(cache.get(cacheKey) || []);
  }

  return safeRows;
}

function cloneNomenclatureNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : []).map((node) => ({
    ...node,
    children: cloneNomenclatureNodes(node?.children)
  }));
}

function flattenNomenclatureNodeRefs(nodes) {
  const result = [];
  for (const node of Array.isArray(nodes) ? nodes : []) {
    result.push(node);
    if (Array.isArray(node?.children) && node.children.length > 0) {
      result.push(...flattenNomenclatureNodeRefs(node.children));
    }
  }
  return result;
}

function getArticleId(value) {
  return parseInt(
    value?.article_id
    ?? value?.Composant_id
    ?? value?.composant_id
    ?? 0,
    10
  ) || 0;
}

function getNomenclatureLineType(value) {
  const typeKeys = [
    'ligne_type',
    'line_type',
    'detail_type',
    'nomenclature_type',
    'component_type',
    'type_ligne'
  ];

  for (const key of typeKeys) {
    if (value?.[key] !== null && value?.[key] !== undefined && value?.[key] !== '') {
      const numeric = Number(value[key]);
      return Number.isFinite(numeric) ? numeric : null;
    }
  }

  // In frontend edit payloads, detail rows expose the line type as `type`.
  // PDF rows also carry the document type in `type`, so keep that value out
  // when a document kind is present.
  if (!value?.document_kind && value?.type !== null && value?.type !== undefined && value?.type !== '') {
    const numeric = Number(value.type);
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

function isPersistedNomenclatureComponentRow(row) {
  return Number(getNomenclatureLineType(row)) === 1 || row?.__isNomenclatureComponent === true;
}

function getNomenclatureGroupKey(row) {
  const value = row?.source_stock_id
    ?? row?.stock_id
    ?? row?.source_document_id
    ?? row?.document_id
    ?? null;
  return value === null || value === undefined || value === '' ? null : String(value);
}

function isSameNomenclatureGroup(left, right) {
  const leftKey = getNomenclatureGroupKey(left);
  const rightKey = getNomenclatureGroupKey(right);
  return !leftKey || !rightKey || leftKey === rightKey;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPersistedNomenclatureNode(row, parentLine = {}) {
  const quantity = getLineQuantity(row, 0);
  const price = getLinePrice(row, 0);
  const parentQuantity = getLineQuantity(parentLine, 1) || 1;

  return {
    id: row?.id ?? row?.ligne_id ?? row?.detail_id ?? null,
    article_id: getArticleId(row),
    code: row?.article_cod || row?.code || '',
    designation: stripHtml(
      row?.article
      || row?.designation
      || row?.article_nom
      || row?.description
      || ''
    ),
    quantite: parentQuantity > 0 ? quantity / parentQuantity : quantity,
    quantiteTotale: quantity,
    prix: price,
    total: quantity * price,
    famille: row?.famille_nom || row?.famille || '',
    unite: row?.unite_nom || row?.unite || '',
    poidsStandard: row?.poidsStandard ?? row?.Poids_Standard ?? null,
    poidsReel: row?.poidsReel ?? row?.Poids_reel ?? null,
    children: []
  };
}

function collapsePersistedNomenclatureRows(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (safeRows.length === 0) {
    return { rows, collapsed: false };
  }

  const visibleRows = [];
  let currentParent = null;
  const parentTrackers = [];
  const persistedGroups = new Set();
  let collapsed = false;

  const getGroupToken = (row) => getNomenclatureGroupKey(row) || '__default__';

  const getRemainingComponentRows = (startIndex, parentRow) => {
    const result = [];
    for (let index = startIndex; index < safeRows.length; index += 1) {
      const row = safeRows[index];
      if (isPersistedNomenclatureComponentRow(row) && isSameNomenclatureGroup(row, parentRow)) {
        result.push(row);
      }
    }
    return result;
  };

  const countLookaheadMatches = (tracker, matchIndex, startIndex) => {
    const futureRows = getRemainingComponentRows(startIndex, tracker.row);
    let expectedIndex = matchIndex;
    let matches = 0;

    for (const row of futureRows) {
      const expectedNode = tracker.expectedFlatNodes[expectedIndex];
      if (!expectedNode) {
        break;
      }

      if (getArticleId(row) !== getArticleId(expectedNode)) {
        break;
      }

      matches += 1;
      expectedIndex += 1;
    }

    return matches;
  };

  const buildTrackerCandidate = (tracker, matchIndex, rowIndex) => ({
    tracker,
    matchIndex,
    skippedExpectedNodes: Math.max(0, matchIndex - tracker.nextIndex),
    lookaheadMatches: countLookaheadMatches(tracker, matchIndex, rowIndex)
  });

  const sortTrackerCandidates = (left, right) => {
    if (right.lookaheadMatches !== left.lookaheadMatches) {
      return right.lookaheadMatches - left.lookaheadMatches;
    }

    if (left.skippedExpectedNodes !== right.skippedExpectedNodes) {
      return left.skippedExpectedNodes - right.skippedExpectedNodes;
    }

    if (right.tracker.nextIndex !== left.tracker.nextIndex) {
      return right.tracker.nextIndex - left.tracker.nextIndex;
    }

    return right.tracker.index - left.tracker.index;
  };

  const chooseExpectedParentTracker = (componentRow, rowIndex) => {
    const rowArticleId = getArticleId(componentRow);
    if (!rowArticleId) {
      return null;
    }

    const eligibleTrackers = parentTrackers.filter((tracker) =>
      tracker.expectedFlatNodes.length > 0
      && tracker.nextIndex < tracker.expectedFlatNodes.length
      && isSameNomenclatureGroup(componentRow, tracker.row)
    );

    let candidates = eligibleTrackers
      .filter((tracker) => getArticleId(tracker.expectedFlatNodes[tracker.nextIndex]) === rowArticleId)
      .map((tracker) => buildTrackerCandidate(tracker, tracker.nextIndex, rowIndex));

    if (candidates.length === 0) {
      candidates = eligibleTrackers
        .map((tracker) => {
          const matchIndex = tracker.expectedFlatNodes.findIndex((node, index) =>
            index >= tracker.nextIndex && getArticleId(node) === rowArticleId
          );
          return matchIndex >= 0 ? buildTrackerCandidate(tracker, matchIndex, rowIndex) : null;
        })
        .filter(Boolean);
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort(sortTrackerCandidates);
    return candidates[0];
  };

  const attachPersistedComponent = (tracker, row, matchIndex = tracker.nextIndex) => {
    if (!tracker.row.__usesPersistedNomenclatureRows) {
      tracker.row.nomenclatureComponents = [];
      tracker.row.__usesPersistedNomenclatureRows = true;
      tracker.row.nomenclatureFromPersistedRows = true;
    }

    tracker.nextIndex = Math.max(tracker.nextIndex, matchIndex);
    tracker.row.nomenclatureComponents.push(buildPersistedNomenclatureNode(row, tracker.row));
    tracker.row.nomenclatureTotal = tracker.row.nomenclatureComponents
      .reduce((sum, node) => sum + toFiniteNumber(node.total, 0), 0);
    tracker.nextIndex += 1;
    collapsed = true;
  };

  for (let rowIndex = 0; rowIndex < safeRows.length; rowIndex += 1) {
    const row = safeRows[rowIndex];
    if (isPersistedNomenclatureComponentRow(row)) {
      persistedGroups.add(getGroupToken(row));
      const trackerCandidate = chooseExpectedParentTracker(row, rowIndex);
      if (trackerCandidate) {
        attachPersistedComponent(trackerCandidate.tracker, row, trackerCandidate.matchIndex);
        continue;
      }

      const hasExpectedParentInGroup = parentTrackers.some((tracker) =>
        tracker.expectedFlatNodes.length > 0 && isSameNomenclatureGroup(row, tracker.row)
      );
      if (!currentParent || hasExpectedParentInGroup || !isSameNomenclatureGroup(row, currentParent)) {
        collapsed = true;
        continue;
      }

      let fallbackTracker = parentTrackers.find((tracker) => tracker.row === currentParent);
      if (!fallbackTracker) {
        fallbackTracker = {
          row: currentParent,
          index: parentTrackers.length,
          expectedFlatNodes: [],
          nextIndex: 0
        };
        parentTrackers.push(fallbackTracker);
      }
      attachPersistedComponent(fallbackTracker, row);
      continue;
    }

    visibleRows.push(row);
    currentParent = row;
    parentTrackers.push({
      row,
      index: parentTrackers.length,
      expectedFlatNodes: flattenNomenclatureNodeRefs(cloneNomenclatureNodes(row?.nomenclatureComponents)),
      nextIndex: 0
    });
  }

  if (collapsed && persistedGroups.size > 0) {
    for (const tracker of parentTrackers) {
      if (
        tracker.expectedFlatNodes.length > 0
        && persistedGroups.has(getGroupToken(tracker.row))
        && !tracker.row.__usesPersistedNomenclatureRows
      ) {
        tracker.row.nomenclatureComponents = [];
        tracker.row.nomenclatureTotal = 0;
      }
    }
  }

  for (const row of visibleRows) {
    if (row && typeof row === 'object') {
      delete row.__usesPersistedNomenclatureRows;
    }
  }

  return { rows: visibleRows, collapsed };
}

function syncNomenclatureNodeFromRow(node, row) {
  const quantity = getLineQuantity(row, node?.quantiteTotale ?? node?.quantite ?? 0);
  const price = getLinePrice(row, node?.prix ?? 0);

  node.quantiteTotale = quantity;
  node.prix = price;
  node.total = quantity * price;

  if (row?.article_cod) {
    node.code = row.article_cod;
  }

  const designation = row?.article_nom || row?.composant_nom || '';
  if (designation) {
    node.designation = stripHtml(designation);
  }

  if (row?.unite_nom) {
    node.unite = row.unite_nom;
  }
}

function syncNomenclatureNodeFromRows(node, rows) {
  const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (safeRows.length === 0) {
    return;
  }

  if (safeRows.length === 1) {
    syncNomenclatureNodeFromRow(node, safeRows[0]);
    return;
  }

  const quantity = safeRows.reduce((sum, row) => sum + getLineQuantity(row, 0), 0);
  const total = safeRows.reduce((sum, row) => {
    const rowQuantity = getLineQuantity(row, 0);
    const rowPrice = getLinePrice(row, node?.prix ?? 0);
    return sum + (rowQuantity * rowPrice);
  }, 0);
  const price = quantity > 0 ? total / quantity : getLinePrice(safeRows[0], node?.prix ?? 0);

  node.quantiteTotale = quantity;
  node.prix = price;
  node.total = total;

  if (safeRows[0]?.article_cod) {
    node.code = safeRows[0].article_cod;
  }

  const designation = safeRows[0]?.article_nom || safeRows[0]?.composant_nom || '';
  if (designation) {
    node.designation = stripHtml(designation);
  }

  if (safeRows[0]?.unite_nom) {
    node.unite = safeRows[0].unite_nom;
  }
}

function removeNomenclatureComponentRows(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return rows;
  }

  const persistedCollapse = collapsePersistedNomenclatureRows(rows);
  if (persistedCollapse.collapsed) {
    return persistedCollapse.rows;
  }

  const hiddenIndexes = new Set();
  const syncMatchedRows = options.syncMatchedRowsToHierarchy !== false;

  for (let index = 0; index < rows.length; index += 1) {
    if (hiddenIndexes.has(index)) {
      continue;
    }

    const line = rows[index];
    const nodes = cloneNomenclatureNodes(line?.nomenclatureComponents);
    line.nomenclatureComponents = nodes;

    const flatNodes = flattenNomenclatureNodeRefs(nodes);
    if (flatNodes.length === 0) {
      continue;
    }

    let matched = true;
    const matchedGroups = [];
    let cursor = index + 1;
    for (let nodeIndex = 0; nodeIndex < flatNodes.length; nodeIndex += 1) {
      const node = flatNodes[nodeIndex];
      const nodeArticleId = getArticleId(node);
      const groupIndexes = [];

      while (
        cursor < rows.length
        && !hiddenIndexes.has(cursor)
        && getArticleId(rows[cursor]) === nodeArticleId
      ) {
        groupIndexes.push(cursor);
        cursor += 1;

        const nextNode = flatNodes[nodeIndex + 1];
        if (nextNode && getArticleId(nextNode) === nodeArticleId) {
          break;
        }
      }

      if (groupIndexes.length === 0) {
        matched = false;
        break;
      }

      matchedGroups.push({ node, groupIndexes });
    }

    if (!matched) {
      matchedGroups.length = 0;
      const expectedNodesByArticleId = new Map();
      let remainingMatches = 0;
      flatNodes.forEach((node) => {
        const nodeArticleId = getArticleId(node);
        if (!nodeArticleId) {
          return;
        }
        const existing = expectedNodesByArticleId.get(nodeArticleId) || [];
        existing.push(node);
        expectedNodesByArticleId.set(nodeArticleId, existing);
        remainingMatches += 1;
      });

      const expectedArticleIds = new Set(expectedNodesByArticleId.keys());
      const matchedGroupByArticleId = new Map();
      const maxLookahead = Math.max(flatNodes.length * 4, flatNodes.length + 8);

      for (
        let rowIndex = index + 1;
        rowIndex < rows.length && rowIndex <= index + maxLookahead && remainingMatches > 0;
        rowIndex += 1
      ) {
        if (hiddenIndexes.has(rowIndex)) {
          continue;
        }

        const rowArticleId = getArticleId(rows[rowIndex]);
        const expectedNodes = expectedNodesByArticleId.get(rowArticleId);
        if ((!expectedNodes || expectedNodes.length === 0) && matchedGroupByArticleId.has(rowArticleId)) {
          matchedGroupByArticleId.get(rowArticleId).groupIndexes.push(rowIndex);
          continue;
        }

        if (!expectedArticleIds.has(rowArticleId) || !expectedNodes || expectedNodes.length === 0) {
          continue;
        }

        const node = expectedNodes.shift();
        const group = { node, groupIndexes: [rowIndex] };
        matchedGroups.push(group);
        matchedGroupByArticleId.set(rowArticleId, group);
        remainingMatches -= 1;
      }

      if (remainingMatches > 0) {
        continue;
      }
    }

    for (const group of matchedGroups) {
      for (const rowIndex of group.groupIndexes) {
        hiddenIndexes.add(rowIndex);
      }
      if (syncMatchedRows) {
        syncNomenclatureNodeFromRows(
          group.node,
          group.groupIndexes.map((rowIndex) => rows[rowIndex])
        );
      }
    }
  }

  if (hiddenIndexes.size === 0) {
    return rows;
  }

  return rows.filter((_, index) => !hiddenIndexes.has(index));
}

function buildNomenclatureSignature(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((line) => Array.isArray(line?.nomenclatureComponents) && line.nomenclatureComponents.length > 0)
    .map((line) => `${line.article_id}:${JSON.stringify(line.nomenclatureComponents)}`)
    .join('|');
}

function flattenNodes(nodes, parentLine = {}) {
  const result = [];
  const parentTax = getLineTax(parentLine, 0);
  const parentDepotId = parentLine?.depot_id ?? parentLine?.adresse_id ?? null;
  const parentDocumentId = parentLine?.document_id ?? parentLine?.stock_id ?? null;

  for (const node of Array.isArray(nodes) ? nodes : []) {
    result.push({
      article_id: node.article_id,
      designation: node.designation || '',
      description: node.designation || '',
      quantite: toFiniteNumber(node.quantiteTotale, 0),
      qte: toFiniteNumber(node.quantiteTotale, 0),
      prix: toFiniteNumber(node.prix, 0),
      pu: toFiniteNumber(node.prix, 0),
      taux_tva: parentTax,
      tva: parentTax,
      taxe: parentTax,
      remise: null,
      remise_montant: null,
      depot_id: parentDepotId,
      adresse_id: parentDepotId,
      document_id: parentDocumentId,
      stock_id: parentDocumentId,
      sens: parentLine?.sens != null ? Number(parentLine.sens) : -1,
      unite_id: parentLine?.unite_id || 1,
      lot: parentLine?.lot || null,
      etat: parentLine?.etat != null ? Number(parentLine.etat) : 0,
      type: 1,
      __isNomenclatureComponent: true
    });

    if (Array.isArray(node.children) && node.children.length > 0) {
      result.push(...flattenNodes(node.children, parentLine));
    }
  }

  return result;
}

async function buildFlatComponentLines(sequelize, line) {
  const articleId = parseInt(line?.article_id, 10) || 0;
  if (!articleId) {
    return [];
  }

  const nodes = await getNomenclatureNodes(sequelize, articleId, getLineQuantity(line, 1));
  return flattenNodes(nodes, line);
}

module.exports = {
  toFiniteNumber,
  getLineQuantity,
  getLinePrice,
  getLineTax,
  getNomenclatureRows,
  hasNomenclature,
  getNomenclatureNodes,
  enrichRowsWithNomenclature,
  buildNomenclatureSignature,
  getNomenclatureLineType,
  isPersistedNomenclatureComponentRow,
  removeNomenclatureComponentRows,
  buildFlatComponentLines
};
