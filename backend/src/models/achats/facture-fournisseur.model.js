const { getConnection } = require('../../config/database');

const SUPPLIER_STOP_WORDS = new Set([
  'DE',
  'DU',
  'DES',
  'D',
  'LA',
  'LE',
  'LES',
  'ET',
  'THE',
  'COMPANY',
  'COMPAGNIE',
  'CIE',
  'STE',
  'SOCIETE',
  'SARL',
  'SA',
  'SAS',
  'SASU',
  'EURL',
  'SNC',
  'GROUPE',
  'GROUP'
]);

function normalizeSupplierText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function compactSupplierText(value) {
  return normalizeSupplierText(value).replace(/\s+/g, '');
}

function tokenizeSupplierText(value) {
  return normalizeSupplierText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && token.length > 1 && !SUPPLIER_STOP_WORDS.has(token));
}

function scoreSupplierCandidate(reference, candidate) {
  const referenceCompact = compactSupplierText(reference.nom);
  const candidateCompact = compactSupplierText(candidate.nom);
  const referenceTokens = tokenizeSupplierText(reference.nom);
  const candidateTokens = tokenizeSupplierText(candidate.nom);

  if (reference.ice && candidate.ice && String(reference.ice).trim() === String(candidate.ice).trim()) {
    return 1000;
  }

  let score = 0;

  if (referenceCompact && candidateCompact) {
    if (referenceCompact === candidateCompact) {
      score += 900;
    } else if (candidateCompact.includes(referenceCompact) || referenceCompact.includes(candidateCompact)) {
      score += 260;
    }
  }

  if (referenceTokens.length > 0 && candidateTokens.length > 0) {
    const candidateTokenSet = new Set(candidateTokens);
    const overlap = referenceTokens.filter((token) => candidateTokenSet.has(token));
    const overlapCount = overlap.length;

    if (overlapCount > 0) {
      score += overlapCount * 40;
      score += (overlapCount / referenceTokens.length) * 160;
      score += (overlapCount / candidateTokens.length) * 90;
    }

    const longestReferenceToken = [...referenceTokens].sort((a, b) => b.length - a.length)[0];
    if (longestReferenceToken && candidateTokens.includes(longestReferenceToken)) {
      score += 35;
    }
  }

  return score;
}

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value) {
  const parsed = toNumber(value, 0) || 0;
  return Math.round(parsed * 100) / 100;
}

function sanitizeFactureNumber(value) {
  const original = String(value || '').trim();
  const compact = original.replace(/\s+/g, '');
  const normalized = compact || original;
  return normalized.slice(0, 16);
}

function normalizeSqlDateToken(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  if (/^\d{8}$/.test(raw)) {
    return raw;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw.replace(/-/g, '');
  }

  const match = raw.match(/^(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})$/);
  if (match) {
    return `${match[3]}${match[2]}${match[1]}`;
  }

  return null;
}

function sanitizeDesignation(value, fallback = '') {
  return String(value || fallback || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 512);
}

function normalizeScanDetailLine(article, index = 0) {
  const designation = sanitizeDesignation(article?.designation, `Ligne ${index + 1}`);
  let quantite = toNumber(article?.quantite, null);
  let prix = toNumber(article?.prix_unitaire, null);
  const totalLigne = toNumber(article?.total_ligne, null);

  if (quantite == null && prix != null && totalLigne != null && prix !== 0) {
    quantite = totalLigne / prix;
  }

  if (prix == null && quantite != null && totalLigne != null && quantite !== 0) {
    prix = totalLigne / quantite;
  }

  if (quantite == null) {
    quantite = 1;
  }

  if (prix == null) {
    prix = 0;
  }

  return {
    designation,
    quantite: roundMoney(quantite),
    prix: roundMoney(prix)
  };
}

async function findBestSupplierMatch({ fournisseur, ice, transaction, sequelize }) {
  const candidates = await sequelize.query(
    `
      SELECT
        p.part_id,
        p.nom,
        pi.identifiant AS ice
      FROM partenaire p
      LEFT JOIN partenaire_identifiant pi ON pi.part_id = p.part_id AND pi.identifiant_type = 8
      WHERE p.type = 2
      ORDER BY p.nom ASC
    `,
    {
      type: sequelize.QueryTypes.SELECT,
      transaction
    }
  );

  const reference = { nom: fournisseur, ice };
  const scoredCandidates = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => ({
      ...candidate,
      score: scoreSupplierCandidate(reference, candidate)
    }))
    .sort((left, right) => right.score - left.score || String(left.nom || '').localeCompare(String(right.nom || '')));

  const bestMatch = scoredCandidates[0] || null;

  if (!bestMatch || bestMatch.score < 120) {
    return {
      match: null,
      suggestions: scoredCandidates.slice(0, 5).map((candidate) => candidate.nom).filter(Boolean)
    };
  }

  return {
    match: bestMatch,
    suggestions: scoredCandidates.slice(1, 5).map((candidate) => candidate.nom).filter(Boolean)
  };
}

async function ensureFactureFournisseurExists(factureId, sequelize, transaction = null) {
  const rows = await sequelize.query(
    `
      SELECT TOP 1 fs.facture_id
      FROM facture_souche fs
      WHERE fs.facture_id = :factureId AND fs.sens = 2
    `,
    {
      replacements: { factureId },
      type: sequelize.QueryTypes.SELECT,
      transaction: transaction || undefined
    }
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function ensureSupplierExists(partId, sequelize, transaction = null) {
  const rows = await sequelize.query(
    `
      SELECT TOP 1 part_id, nom
      FROM partenaire
      WHERE part_id = :partId AND type = 2
    `,
    {
      replacements: { partId },
      type: sequelize.QueryTypes.SELECT,
      transaction: transaction || undefined
    }
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function insertFactureDetailRows(factureId, rows, sequelize, transaction = null) {
  const detailRows = Array.isArray(rows) ? rows : [];

  for (let index = 0; index < detailRows.length; index += 1) {
    const line = detailRows[index];
    const designation = sanitizeDesignation(line?.designation, `Ligne ${index + 1}`);
    const quantite = roundMoney(line?.quantite);
    const prix = roundMoney(line?.prix);

    await sequelize.query(
      `
        INSERT INTO facture_detail (facture_id, designation, quantite, prix)
        VALUES (:factureId, :designation, :quantite, :prix)
      `,
      {
        replacements: {
          factureId,
          designation,
          quantite,
          prix
        },
        transaction: transaction || undefined
      }
    );
  }
}

async function copyCommandeDetailsToFactureDetail(factureId, commandeId, sequelize, transaction = null) {
  await sequelize.query(
    `
      INSERT INTO facture_detail (facture_id, designation, quantite, prix)
      SELECT
        :factureId,
        LEFT(
          COALESCE(
            NULLIF(LTRIM(RTRIM(ad.description)), ''),
            aa.article_nom,
            'Article'
          ),
          512
        ) AS designation,
        ISNULL(ad.quantite, 0) AS quantite,
        ISNULL(ad.prix, 0) AS prix
      FROM achat_document_detail ad
      LEFT JOIN article aa ON aa.article_id = ad.article_id
      WHERE ad.document_id = :commandeId
    `,
    {
      replacements: { factureId, commandeId },
      transaction: transaction || undefined
    }
  );
}

async function loadFactureHeader(factureId, sequelize, transaction = null) {
  const rows = await sequelize.query(
    `
      SELECT TOP 1
        f.facture_id,
        f.facture_num,
        f.facture_dat,
        ISNULL(f.facture_ht, 0) AS facture_ht,
        ISNULL(f.facture_tva, 0) AS facture_tva,
        fs.part_id,
        p.nom AS fournisseur,
        (
          SELECT TOP 1 a.nom
          FROM adresse a
          WHERE a.part_id = p.part_id
          ORDER BY a.id DESC
        ) AS adresse,
        (
          SELECT TOP 1 v.nom
          FROM adresse a
          LEFT JOIN ville v ON v.id = a.ville
          WHERE a.part_id = p.part_id
          ORDER BY a.id DESC
        ) AS ville,
        pi.identifiant AS ice,
        (
          SELECT TOP 1 ad.numero
          FROM achat_document ad
          WHERE ad.facture_id = f.facture_id
          ORDER BY ad.document_id DESC
        ) AS numero_commande
      FROM facture f
      INNER JOIN facture_souche fs ON fs.facture_id = f.facture_id AND fs.sens = 2
      INNER JOIN partenaire p ON p.part_id = fs.part_id
      LEFT JOIN partenaire_identifiant pi ON pi.part_id = p.part_id AND pi.identifiant_type = 8
      WHERE f.facture_id = :factureId
    `,
    {
      replacements: { factureId },
      type: sequelize.QueryTypes.SELECT,
      transaction: transaction || undefined
    }
  );

  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function getApproximateTvaRate(header) {
  const ht = toNumber(header?.facture_ht, 0) || 0;
  const tva = toNumber(header?.facture_tva, 0) || 0;

  if (ht <= 0) {
    return 0;
  }

  return tva / ht;
}

async function getStoredFactureDetails(factureId, sequelize, transaction = null) {
  const rows = await sequelize.query(
    `
      SELECT
        fd.id,
        fd.facture_id,
        fd.designation,
        fd.quantite,
        fd.prix
      FROM facture_detail fd
      WHERE fd.facture_id = :factureId
      ORDER BY fd.id ASC
    `,
    {
      replacements: { factureId },
      type: sequelize.QueryTypes.SELECT,
      transaction: transaction || undefined
    }
  );

  return Array.isArray(rows) ? rows : [];
}

async function getCommandeFallbackDetails(factureId, sequelize, transaction = null) {
  const rows = await sequelize.query(
    `
      SELECT
        ad.id,
        ad.article_id,
        COALESCE(
          NULLIF(LTRIM(RTRIM(ad.description)), ''),
          aa.article_nom,
          'Article'
        ) AS designation,
        aa.article_nom,
        aa.article_cod,
        ISNULL(ad.quantite, 0) AS quantite,
        ISNULL(ad.prix, 0) AS prix,
        ISNULL(ad.taux_tva, 0) AS taux_tva,
        ISNULL(ad.remise, 0) AS remise,
        ISNULL(ad.remise_montant, 0) AS remise_montant
      FROM achat_document a
      INNER JOIN achat_document_detail ad ON ad.document_id = a.document_id
      LEFT JOIN article aa ON aa.article_id = ad.article_id
      WHERE a.facture_id = :factureId
      ORDER BY ad.id ASC
    `,
    {
      replacements: { factureId },
      type: sequelize.QueryTypes.SELECT,
      transaction: transaction || undefined
    }
  );

  return Array.isArray(rows) ? rows : [];
}

function buildSyntheticDetailRow(header) {
  const approxTvaRate = getApproximateTvaRate(header);
  const headerHt = roundMoney(header?.facture_ht);

  return {
    id: null,
    detail_id: null,
    document_id: header?.facture_id || null,
    facture_id: header?.facture_id || null,
    article_id: null,
    designation: 'Facture fournisseur',
    description: 'Facture fournisseur',
    article_nom: 'Facture fournisseur',
    article_cod: '',
    qte: headerHt > 0 ? 1 : 0,
    quantite: headerHt > 0 ? 1 : 0,
    pu: headerHt,
    prix: headerHt,
    tva: approxTvaRate,
    taux_tva: approxTvaRate,
    remise: 0,
    remise_montant: 0,
    detail_source: 'synthetic'
  };
}

function mapFactureDetails(rawRows, header, source) {
  const approxTvaRate = getApproximateTvaRate(header);
  const rows = Array.isArray(rawRows) ? rawRows : [];

  return rows.map((row, index) => {
    const quantite = roundMoney(row?.quantite ?? row?.qte ?? 0);
    const prix = roundMoney(row?.prix ?? row?.pu ?? 0);
    const designation = sanitizeDesignation(
      row?.designation ?? row?.description ?? row?.article_nom,
      `Ligne ${index + 1}`
    );

    const detailId = source === 'facture_detail'
      ? (toNumber(row?.id, null) ? Number(row.id) : null)
      : null;

    const tauxTva = source === 'facture_detail'
      ? approxTvaRate
      : roundMoney(row?.taux_tva ?? row?.tva ?? 0);

    return {
      id: detailId,
      detail_id: detailId,
      source_detail_id: toNumber(row?.id, null),
      document_id: header?.facture_id || null,
      facture_id: header?.facture_id || null,
      article_id: row?.article_id ?? null,
      designation,
      description: designation,
      article_nom: row?.article_nom || designation,
      article_cod: row?.article_cod || '',
      qte: quantite,
      quantite,
      pu: prix,
      prix,
      tva: tauxTva,
      taux_tva: tauxTva,
      remise: roundMoney(row?.remise ?? 0),
      remise_montant: roundMoney(row?.remise_montant ?? 0),
      detail_source: source
    };
  });
}

async function getFactureDetailRowsForEdit(factureId, header, sequelize, transaction = null) {
  const storedRows = await getStoredFactureDetails(factureId, sequelize, transaction);
  if (storedRows.length > 0) {
    return mapFactureDetails(storedRows, header, 'facture_detail');
  }

  const fallbackRows = await getCommandeFallbackDetails(factureId, sequelize, transaction);
  if (fallbackRows.length > 0) {
    return mapFactureDetails(fallbackRows, header, 'achat_document_detail');
  }

  return [buildSyntheticDetailRow(header)];
}

async function syncFactureHtFromDetail(factureId, sequelize, transaction = null) {
  const [row] = await sequelize.query(
    `
      SELECT ISNULL(SUM(ISNULL(quantite, 0) * ISNULL(prix, 0)), 0) AS total_ht
      FROM facture_detail
      WHERE facture_id = :factureId
    `,
    {
      replacements: { factureId },
      type: sequelize.QueryTypes.SELECT,
      transaction: transaction || undefined
    }
  );

  const totalHt = roundMoney(row?.total_ht);

  await sequelize.query(
    `
      UPDATE facture
      SET facture_ht = :totalHt
      WHERE facture_id = :factureId
    `,
    {
      replacements: { factureId, totalHt },
      transaction: transaction || undefined
    }
  );

  return totalHt;
}

function buildFactureFournisseurInfo(header) {
  return {
    part_id: header?.part_id || null,
    nom: header?.fournisseur || '',
    adresse: header?.adresse || '',
    telephone: '',
    email: '',
    ice: header?.ice || ''
  };
}

// Recuperer toutes les factures fournisseur avec pagination
const getAllFacturesFournisseur = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  const {
    page = 1,
    pageSize = 10,
    orderBy = 'facture_num',
    orderDirection = 'DESC',
    search = ''
  } = options;

  const safePage = parseInt(page, 10) || 1;
  const safePageSize = parseInt(pageSize, 10) || 25;
  const offset = (safePage - 1) * safePageSize;

  const validColumns = ['facture_id', 'facture_num', 'facture_dat', 'fournisseur', 'facture_ht', 'facture_tva'];
  const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'facture_num';
  const safeOrderDirection = String(orderDirection).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  let whereClause = '';
  const replacements = {};

  if (search && String(search).trim()) {
    whereClause = `
      WHERE (
        f.facture_num LIKE :search
        OR p.nom LIKE :search
      )
    `;
    replacements.search = `%${String(search).trim()}%`;
  }

  const query = `
    SELECT
      facture_id,
      facture_num,
      facture_dat,
      fournisseur,
      part_id,
      facture_ht,
      facture_tva,
      total_count
    FROM (
      SELECT
        f.facture_id,
        f.facture_num,
        f.facture_dat,
        p.nom AS fournisseur,
        fs.part_id,
        ISNULL(f.facture_ht, 0) AS facture_ht,
        ISNULL(f.facture_tva, 0) AS facture_tva,
        COUNT(*) OVER() AS total_count,
        ROW_NUMBER() OVER (ORDER BY f.${safeOrderBy} ${safeOrderDirection}) AS RowNum
      FROM facture f
      INNER JOIN facture_souche fs ON fs.facture_id = f.facture_id AND fs.sens = 2
      INNER JOIN partenaire p ON p.part_id = fs.part_id
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
    total = parseInt(results[0].total_count, 10) || 0;
    results = results.map(({ total_count, ...rest }) => rest);
  }

  const totalPages = Math.ceil(total / safePageSize) || 1;

  return {
    data: results,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages
    }
  };
};

// Recuperer une facture fournisseur par ID
const getFactureFournisseurById = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const factureId = parseInt(id, 10);

  if (!Number.isInteger(factureId) || factureId <= 0) {
    return null;
  }

  const header = await loadFactureHeader(factureId, sequelize);
  if (!header) {
    return null;
  }

  const details = await getFactureDetailRowsForEdit(factureId, header, sequelize);

  return {
    ...header,
    document_id: header.facture_id,
    fournisseurInfo: buildFactureFournisseurInfo(header),
    details
  };
};

// Recuperer les commandes non facturees
const getCommandesNonFacturees = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  const query = `
    SELECT
      a.document_id,
      a.numero,
      a.date,
      a.description,
      p.nom AS fournisseur,
      p.part_id,
      ISNULL(SUM(ad.quantite * ad.prix), 0) AS total_ht
    FROM achat_document a
    INNER JOIN partenaire p ON p.part_id = a.part_id
    LEFT JOIN achat_document_detail ad ON ad.document_id = a.document_id
    WHERE a.type = 2
      AND NOT EXISTS (
        SELECT 1
        FROM facture_souche fs
        WHERE fs.facture_id = a.facture_id
          AND fs.sens = 2
      )
    GROUP BY a.document_id, a.numero, a.date, a.description, p.nom, p.part_id
    ORDER BY a.date DESC
  `;

  const results = await sequelize.query(query, {
    type: sequelize.QueryTypes.SELECT
  });

  return Array.isArray(results) ? results : [];
};

// Creer une facture fournisseur depuis une commande
const createFactureFournisseurFromCommande = async (commandeId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  return sequelize.transaction(async (t) => {
    const commandeRows = await sequelize.query(
      `
        SELECT
          a.document_id,
          a.numero,
          a.date,
          a.part_id,
          a.description
        FROM achat_document a
        WHERE a.document_id = :commandeId AND a.type = 2
      `,
      {
        replacements: { commandeId },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      }
    );

    const commande = Array.isArray(commandeRows) && commandeRows.length > 0 ? commandeRows[0] : null;

    if (!commande) {
      throw new Error('Commande non trouvee');
    }

    const { getCompteurFormate } = require('../../services/compteur.service');
    const numeroFacture = await getCompteurFormate('FAF', 'FAF', sequelize);

    const [totals] = await sequelize.query(
      `
        SELECT
          ISNULL(SUM((ad.quantite * ad.prix) - ISNULL(ad.remise_montant, 0)), 0) AS total_ht,
          ISNULL(SUM(((ad.quantite * ad.prix) - ISNULL(ad.remise_montant, 0)) * ISNULL(ad.taux_tva, 0)), 0) AS total_tva
        FROM achat_document_detail ad
        WHERE ad.document_id = :commandeId
      `,
      {
        replacements: { commandeId },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      }
    );

    const totalHt = roundMoney(totals?.total_ht);
    const totalTva = roundMoney(totals?.total_tva);

    const [factureSoucheResult] = await sequelize.query(
      `
        INSERT INTO facture_souche (part_id, sens)
        OUTPUT INSERTED.facture_id
        VALUES (:partId, 2)
      `,
      {
        replacements: { partId: commande.part_id },
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      }
    );

    let factureId = null;
    if (Array.isArray(factureSoucheResult) && factureSoucheResult.length > 0) {
      factureId = factureSoucheResult[0].facture_id;
    } else if (factureSoucheResult && factureSoucheResult.facture_id) {
      factureId = factureSoucheResult.facture_id;
    }

    if (!factureId) {
      throw new Error('Erreur lors de la creation de facture_souche : facture_id non recupere');
    }

    await sequelize.query(
      `
        INSERT INTO facture (facture_id, facture_num, facture_dat, facture_ind, facture_typ, facture_ht, facture_tva)
        VALUES (:factureId, :numeroFacture, GETDATE(), 1, 'FA', :totalHt, :totalTva)
      `,
      {
        replacements: { factureId, numeroFacture, totalHt, totalTva },
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      }
    );

    await sequelize.query(
      `
        UPDATE achat_document
        SET facture_id = :factureId
        WHERE document_id = :commandeId
      `,
      {
        replacements: { factureId, commandeId },
        transaction: t
      }
    );

    await copyCommandeDetailsToFactureDetail(factureId, commandeId, sequelize, t);

    return {
      facture_id: factureId,
      numero: numeroFacture,
      commande_id: commandeId
    };
  });
};

const createFactureFournisseurFromScan = async (scanData, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  const fournisseur = String(scanData?.fournisseur || '').trim();
  const ice = String(scanData?.ice || '').trim() || null;
  const numeroFactureOriginal = String(scanData?.numero_facture || '').trim();
  const numeroFacture = sanitizeFactureNumber(numeroFactureOriginal);
  const factureDate = normalizeSqlDateToken(scanData?.date_facture);

  const detailRows = (Array.isArray(scanData?.articles) ? scanData.articles : [])
    .map((article, index) => normalizeScanDetailLine(article, index));

  const computedHtFromLines = roundMoney(
    detailRows.reduce((sum, line) => sum + (roundMoney(line.quantite) * roundMoney(line.prix)), 0)
  );

  const extractedTotalHt = toNumber(scanData?.total_ht, null);
  const totalTtc = toNumber(scanData?.total_ttc, null);
  let totalHt = roundMoney(extractedTotalHt != null ? extractedTotalHt : computedHtFromLines);
  let totalTva = roundMoney(toNumber(scanData?.tva, 0) || 0);

  if (totalHt <= 0 && computedHtFromLines > 0) {
    totalHt = computedHtFromLines;
  }

  if (totalHt > 0 && totalTva > 0) {
    const amountFromRate = roundMoney(totalHt * (totalTva / 100));
    const amountFromTtc = totalTtc != null ? roundMoney(totalTtc - totalHt) : null;
    const isClose = (left, right) => Math.abs(Number(left) - Number(right)) <= 0.05;

    if (amountFromTtc != null) {
      if (!isClose(totalTva, amountFromTtc) && isClose(amountFromRate, amountFromTtc)) {
        totalTva = amountFromRate;
      }
    } else if (totalTva <= 100) {
      totalTva = amountFromRate;
    }
  }

  if (!fournisseur) {
    const error = new Error('Le fournisseur extrait est requis pour enregistrer la facture.');
    error.statusCode = 400;
    throw error;
  }

  if (!numeroFacture) {
    const error = new Error('Le numero de facture extrait est requis pour enregistrer la facture.');
    error.statusCode = 400;
    throw error;
  }

  return sequelize.transaction(async (t) => {
    const existingFacture = await sequelize.query(
      `
        SELECT TOP 1 f.facture_id
        FROM facture f
        INNER JOIN facture_souche fs ON fs.facture_id = f.facture_id AND fs.sens = 2
        WHERE LTRIM(RTRIM(ISNULL(f.facture_num, ''))) = :numeroFacture
      `,
      {
        replacements: { numeroFacture },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      }
    );

    if (Array.isArray(existingFacture) && existingFacture.length > 0) {
      const error = new Error(`La facture fournisseur ${numeroFacture} existe deja.`);
      error.statusCode = 409;
      throw error;
    }

    const supplierMatch = await findBestSupplierMatch({
      fournisseur,
      ice,
      transaction: t,
      sequelize
    });

    const fournisseurTrouve = supplierMatch.match;

    if (!fournisseurTrouve?.part_id) {
      const suggestionsText = supplierMatch.suggestions?.length
        ? ` Suggestions: ${supplierMatch.suggestions.join(', ')}.`
        : '';
      const error = new Error(`Aucun fournisseur correspondant a "${fournisseur}" n'a ete trouve dans partenaire (type = 2).${suggestionsText}`);
      error.statusCode = 404;
      throw error;
    }

    const [factureSoucheResult] = await sequelize.query(
      `
        INSERT INTO facture_souche (part_id, sens)
        OUTPUT INSERTED.facture_id
        VALUES (:partId, 2)
      `,
      {
        replacements: { partId: fournisseurTrouve.part_id },
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      }
    );

    let factureId = null;
    if (Array.isArray(factureSoucheResult) && factureSoucheResult.length > 0) {
      factureId = factureSoucheResult[0].facture_id;
    } else if (factureSoucheResult && factureSoucheResult.facture_id) {
      factureId = factureSoucheResult.facture_id;
    }

    if (!factureId) {
      throw new Error('Erreur lors de la creation de facture_souche : facture_id non recupere');
    }

    await sequelize.query(
      `
        INSERT INTO facture (facture_id, facture_num, facture_dat, facture_ind, facture_typ, facture_ht, facture_tva)
        VALUES (
          :factureId,
          :numeroFacture,
          COALESCE(CONVERT(datetime, NULLIF(:factureDate, ''), 112), GETDATE()),
          1,
          'FA',
          :totalHt,
          :totalTva
        )
      `,
      {
        replacements: {
          factureId,
          numeroFacture,
          factureDate,
          totalHt,
          totalTva
        },
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      }
    );

    if (detailRows.length > 0) {
      await insertFactureDetailRows(factureId, detailRows, sequelize, t);
    }

    return {
      facture_id: factureId,
      facture_num: numeroFacture,
      numero_facture_original: numeroFactureOriginal || numeroFacture,
      facture_dat: factureDate,
      facture_ht: totalHt,
      facture_tva: totalTva,
      part_id: fournisseurTrouve.part_id,
      fournisseur: fournisseurTrouve.nom
    };
  });
};

const createFactureFournisseurManual = async (factureData, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  const partId = parseInt(factureData?.part_id, 10);
  const factureNum = sanitizeFactureNumber(factureData?.facture_num);
  const factureDate = normalizeSqlDateToken(factureData?.facture_dat ?? factureData?.date);
  const detailRows = (Array.isArray(factureData?.details) ? factureData.details : [])
    .map((line, index) => ({
      designation: sanitizeDesignation(line?.designation, `Ligne ${index + 1}`),
      quantite: roundMoney(line?.quantite ?? line?.qte ?? 0),
      prix: roundMoney(line?.prix ?? line?.pu ?? 0)
    }))
    .filter((line) => line.designation || line.quantite || line.prix);

  const computedHt = roundMoney(
    detailRows.reduce((sum, line) => sum + (roundMoney(line.quantite) * roundMoney(line.prix)), 0)
  );
  const totalHt = roundMoney(toNumber(factureData?.facture_ht, null) != null ? factureData.facture_ht : computedHt);
  const totalTva = roundMoney(toNumber(factureData?.facture_tva, 0) || 0);

  if (!Number.isInteger(partId) || partId <= 0) {
    const error = new Error('Le fournisseur est requis.');
    error.statusCode = 400;
    throw error;
  }

  if (!factureNum) {
    const error = new Error('Le numero de facture est requis.');
    error.statusCode = 400;
    throw error;
  }

  return sequelize.transaction(async (t) => {
    const supplier = await ensureSupplierExists(partId, sequelize, t);
    if (!supplier) {
      const error = new Error('Le fournisseur selectionne est invalide.');
      error.statusCode = 400;
      throw error;
    }

    const duplicate = await sequelize.query(
      `
        SELECT TOP 1 facture_id
        FROM facture
        WHERE LTRIM(RTRIM(ISNULL(facture_num, ''))) = :factureNum
      `,
      {
        replacements: { factureNum },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      }
    );

    if (Array.isArray(duplicate) && duplicate.length > 0) {
      const error = new Error(`La facture fournisseur ${factureNum} existe deja.`);
      error.statusCode = 409;
      throw error;
    }

    const [factureSoucheResult] = await sequelize.query(
      `
        INSERT INTO facture_souche (part_id, sens)
        OUTPUT INSERTED.facture_id
        VALUES (:partId, 2)
      `,
      {
        replacements: { partId },
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      }
    );

    let factureId = null;
    if (Array.isArray(factureSoucheResult) && factureSoucheResult.length > 0) {
      factureId = factureSoucheResult[0].facture_id;
    } else if (factureSoucheResult && factureSoucheResult.facture_id) {
      factureId = factureSoucheResult.facture_id;
    }

    if (!factureId) {
      throw new Error('Erreur lors de la creation de facture_souche : facture_id non recupere');
    }

    await sequelize.query(
      `
        INSERT INTO facture (facture_id, facture_num, facture_dat, facture_ind, facture_typ, facture_ht, facture_tva)
        VALUES (
          :factureId,
          :factureNum,
          COALESCE(CONVERT(datetime, NULLIF(:factureDate, ''), 112), GETDATE()),
          1,
          'FA',
          :totalHt,
          :totalTva
        )
      `,
      {
        replacements: {
          factureId,
          factureNum,
          factureDate,
          totalHt,
          totalTva
        },
        type: sequelize.QueryTypes.INSERT,
        transaction: t
      }
    );

    if (detailRows.length > 0) {
      await insertFactureDetailRows(factureId, detailRows, sequelize, t);
    }

    return {
      facture_id: factureId,
      part_id: supplier.part_id,
      fournisseur: supplier.nom,
      facture_num: factureNum,
      facture_dat: factureDate,
      facture_ht: totalHt,
      facture_tva: totalTva,
      details: detailRows.map((line) => ({
        designation: line.designation,
        quantite: line.quantite,
        prix: line.prix
      }))
    };
  });
};

const updateFactureFournisseur = async (id, factureData, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const factureId = parseInt(id, 10);

  if (!Number.isInteger(factureId) || factureId <= 0) {
    const error = new Error('ID de facture invalide.');
    error.statusCode = 400;
    throw error;
  }

  return sequelize.transaction(async (t) => {
    const existing = await loadFactureHeader(factureId, sequelize, t);

    if (!existing) {
      const error = new Error('Facture fournisseur non trouvee.');
      error.statusCode = 404;
      throw error;
    }

    const partId = parseInt(factureData?.part_id, 10);
    if (!Number.isInteger(partId) || partId <= 0) {
      const error = new Error('Le fournisseur est requis.');
      error.statusCode = 400;
      throw error;
    }

    const supplier = await ensureSupplierExists(partId, sequelize, t);
    if (!supplier) {
      const error = new Error('Le fournisseur selectionne est invalide.');
      error.statusCode = 400;
      throw error;
    }

    const factureNum = sanitizeFactureNumber(factureData?.facture_num ?? existing.facture_num);
    if (!factureNum) {
      const error = new Error('Le numero de facture est requis.');
      error.statusCode = 400;
      throw error;
    }

    const duplicate = await sequelize.query(
      `
        SELECT TOP 1 facture_id
        FROM facture
        WHERE facture_id <> :factureId
          AND LTRIM(RTRIM(ISNULL(facture_num, ''))) = :factureNum
      `,
      {
        replacements: { factureId, factureNum },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      }
    );

    if (Array.isArray(duplicate) && duplicate.length > 0) {
      const error = new Error(`La facture fournisseur ${factureNum} existe deja.`);
      error.statusCode = 409;
      throw error;
    }

    const factureDate = normalizeSqlDateToken(factureData?.facture_dat ?? factureData?.date ?? existing.facture_dat);
    const providedHt = toNumber(factureData?.facture_ht, null);
    const providedTva = toNumber(factureData?.facture_tva, null);
    const factureHt = roundMoney(providedHt != null ? providedHt : existing.facture_ht);
    const factureTva = roundMoney(providedTva != null ? providedTva : existing.facture_tva);

    await sequelize.query(
      `
        UPDATE facture_souche
        SET part_id = :partId
        WHERE facture_id = :factureId AND sens = 2
      `,
      {
        replacements: { factureId, partId },
        transaction: t
      }
    );

    await sequelize.query(
      `
        UPDATE facture
        SET facture_num = :factureNum,
            facture_dat = COALESCE(CONVERT(datetime, NULLIF(:factureDate, ''), 112), facture_dat),
            facture_ht = :factureHt,
            facture_tva = :factureTva
        WHERE facture_id = :factureId
      `,
      {
        replacements: {
          factureId,
          factureNum,
          factureDate,
          factureHt,
          factureTva
        },
        transaction: t
      }
    );

    return getFactureFournisseurById(factureId, sequelize);
  });
};

const saveDetailLines = async (lignes, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  if (!Array.isArray(lignes) || lignes.length === 0) {
    return [];
  }

  return sequelize.transaction(async (t) => {
    const results = [];
    const touchedFactures = new Set();

    for (let index = 0; index < lignes.length; index += 1) {
      const ligne = lignes[index] || {};
      const factureId = parseInt(ligne.facture_id ?? ligne.document_id, 10);
      const updateMode = String(ligne.update_mode || 'I').toUpperCase();
      const detailId = parseInt(ligne.id, 10);

      if (!Number.isInteger(factureId) || factureId <= 0) {
        results.push({
          id: Number.isInteger(detailId) ? detailId : null,
          update_mode: updateMode,
          success: false,
          error: 'facture_id manquant'
        });
        continue;
      }

      const factureExists = await ensureFactureFournisseurExists(factureId, sequelize, t);
      if (!factureExists) {
        results.push({
          id: Number.isInteger(detailId) ? detailId : null,
          update_mode: updateMode,
          success: false,
          error: 'facture fournisseur introuvable'
        });
        continue;
      }

      touchedFactures.add(factureId);

      if (updateMode === 'D' && Number.isInteger(detailId) && detailId > 0) {
        await sequelize.query(
          `
            DELETE FROM facture_detail
            WHERE id = :id AND facture_id = :factureId
          `,
          {
            replacements: { id: detailId, factureId },
            transaction: t
          }
        );

        results.push({ id: detailId, update_mode: 'D', success: true });
        continue;
      }

      const designation = sanitizeDesignation(ligne.designation, `Ligne ${index + 1}`);
      const quantite = roundMoney(ligne.qte ?? ligne.quantite ?? 0);
      const prix = roundMoney(ligne.pu ?? ligne.prix ?? 0);

      if (updateMode === 'U' && Number.isInteger(detailId) && detailId > 0) {
        await sequelize.query(
          `
            UPDATE facture_detail
            SET designation = :designation,
                quantite = :quantite,
                prix = :prix
            WHERE id = :id AND facture_id = :factureId
          `,
          {
            replacements: {
              id: detailId,
              factureId,
              designation,
              quantite,
              prix
            },
            transaction: t
          }
        );

        results.push({ id: detailId, update_mode: 'U', success: true });
        continue;
      }

      const [insertResult] = await sequelize.query(
        `
          INSERT INTO facture_detail (facture_id, designation, quantite, prix)
          OUTPUT INSERTED.id
          VALUES (:factureId, :designation, :quantite, :prix)
        `,
        {
          replacements: {
            factureId,
            designation,
            quantite,
            prix
          },
          type: sequelize.QueryTypes.INSERT,
          transaction: t
        }
      );

      let insertedId = null;
      if (Array.isArray(insertResult) && insertResult.length > 0) {
        insertedId = insertResult[0].id;
      } else if (insertResult && insertResult.id) {
        insertedId = insertResult.id;
      }

      results.push({ id: insertedId, update_mode: 'I', success: true });
    }

    for (const factureId of touchedFactures) {
      await syncFactureHtFromDetail(factureId, sequelize, t);
    }

    return results;
  });
};

const deleteLignesParIds = async (ligneIds, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  if (!Array.isArray(ligneIds) || ligneIds.length === 0) {
    throw new Error('IDs de lignes invalides');
  }

  return sequelize.transaction(async (t) => {
    const replacements = {};
    const placeholders = ligneIds.map((id, index) => {
      const key = `id${index}`;
      replacements[key] = parseInt(id, 10);
      return `:${key}`;
    }).join(', ');

    const impactedRows = await sequelize.query(
      `
        SELECT DISTINCT facture_id
        FROM facture_detail
        WHERE id IN (${placeholders})
      `,
      {
        replacements,
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      }
    );

    await sequelize.query(
      `
        DELETE FROM facture_detail
        WHERE id IN (${placeholders})
      `,
      {
        replacements,
        transaction: t
      }
    );

    for (const row of Array.isArray(impactedRows) ? impactedRows : []) {
      const factureId = parseInt(row?.facture_id, 10);
      if (Number.isInteger(factureId) && factureId > 0) {
        await syncFactureHtFromDetail(factureId, sequelize, t);
      }
    }
  });
};

// Supprimer une facture fournisseur
const deleteFactureFournisseur = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const factureId = parseInt(id, 10);

  return sequelize.transaction(async (t) => {
    const existing = await ensureFactureFournisseurExists(factureId, sequelize, t);
    if (!existing) {
      throw new Error('Facture fournisseur non trouvee');
    }

    await sequelize.query(
      `
        UPDATE achat_document
        SET facture_id = NULL
        WHERE facture_id = :factureId
      `,
      {
        replacements: { factureId },
        transaction: t
      }
    );

    await sequelize.query(
      `
        DELETE FROM facture_detail
        WHERE facture_id = :factureId
      `,
      {
        replacements: { factureId },
        transaction: t
      }
    );

    await sequelize.query(
      `
        DELETE FROM facture_souche
        WHERE facture_id = :factureId AND sens = 2
      `,
      {
        replacements: { factureId },
        transaction: t
      }
    );

    await sequelize.query(
      `
        DELETE FROM facture
        WHERE facture_id = :factureId
      `,
      {
        replacements: { factureId },
        transaction: t
      }
    );

    return { success: true };
  });
};

// Recuperer le rapport de facture fournisseur par ID pour la generation PDF
const getFactureFournisseurReportById = async (factureId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const normalizedFactureId = parseInt(factureId, 10);

  if (!Number.isInteger(normalizedFactureId) || normalizedFactureId <= 0) {
    return null;
  }

  const header = await loadFactureHeader(normalizedFactureId, sequelize);
  if (!header) {
    return null;
  }

  const details = await getFactureDetailRowsForEdit(normalizedFactureId, header, sequelize);
  const factureHt = roundMoney(header.facture_ht);
  const factureTva = roundMoney(header.facture_tva);
  const factureTtc = roundMoney(factureHt + factureTva);

  return details.map((detail) => {
    const quantite = roundMoney(detail.quantite);
    const prix = roundMoney(detail.prix);
    const tauxTva = toNumber(detail.taux_tva, 0) || 0;
    const totalHt = roundMoney(quantite * prix);
    const totalTva = roundMoney(totalHt * tauxTva);
    const totalTtc = roundMoney(totalHt + totalTva);

    return {
      numero: header.facture_num,
      date: header.facture_dat,
      fournisseur: header.fournisseur,
      ice: header.ice,
      adresse: header.adresse,
      designation: detail.designation,
      quantite,
      prix,
      remise: roundMoney(detail.remise),
      facture_ht: factureHt,
      facture_tva: factureTva,
      facture_ttc: factureTtc,
      document_id: normalizedFactureId,
      etat: normalizedFactureId,
      type: 4,
      document_kind: 'FACTURE_FOURNISSEUR',
      part_id: header.part_id,
      commercial: '',
      article_cod: detail.article_cod || '',
      article_nom: detail.article_nom || detail.designation,
      article: detail.designation,
      taux_tva: tauxTva,
      remise_montant: roundMoney(detail.remise_montant),
      condition: '',
      expedition: '',
      transporteur: '',
      client_ref: '',
      ville: header.ville || '',
      ligne_id: detail.id,
      total_ht: totalHt,
      total_tva: totalTva,
      total_ttc: totalTtc,
      numero_commande: header.numero_commande || ''
    };
  });
};

module.exports = {
  getAllFacturesFournisseur,
  getFactureFournisseurById,
  getCommandesNonFacturees,
  createFactureFournisseurFromCommande,
  createFactureFournisseurFromScan,
  createFactureFournisseurManual,
  updateFactureFournisseur,
  saveDetailLines,
  deleteLignesParIds,
  deleteFactureFournisseur,
  getFactureFournisseurReportById
};
