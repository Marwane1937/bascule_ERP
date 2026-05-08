const { getConnection } = require('../../config/database');
const {
  getLivraisonQuillCandidates,
  loadQuillRowsByDocument
} = require('./quill-table.helper');
const {
  loadStockInfoRowsByDocumentIds
} = require('./stock-info-table.helper');

const tableColumnSetCache = new Map();

const getTableColumnSet = async (sequelize, tableName) => {
  const cacheKey = `${String(sequelize?.config?.database || 'default').toLowerCase()}:${String(tableName || '').toLowerCase()}`;
  if (tableColumnSetCache.has(cacheKey)) {
    return tableColumnSetCache.get(cacheKey);
  }

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

  const columnSet = new Set((Array.isArray(cols) ? cols : []).map((c) => String(c.COLUMN_NAME || '').toLowerCase()));
  tableColumnSetCache.set(cacheKey, columnSet);
  return columnSet;
};

const toFiniteNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const normalizedValue = typeof value === 'string'
    ? value.trim().replace(',', '.')
    : value;
  const parsed = Number(normalizedValue);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundCurrency = (value) => Math.round((toFiniteNumber(value, 0) + Number.EPSILON) * 100) / 100;

const parseSortableDateValue = (value) => {
  if (!value) return 0;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const sortDocumentsByLatest = (a = {}, b = {}) => {
  const dateDelta = parseSortableDateValue(b.date) - parseSortableDateValue(a.date);
  if (dateDelta !== 0) {
    return dateDelta;
  }

  return String(b.numero || '').localeCompare(String(a.numero || ''), 'fr', {
    numeric: true,
    sensitivity: 'base'
  });
};

const collectUniqueDocuments = (rows = [], config = {}) => {
  const {
    idKey,
    numberKey,
    dateKey,
    mapRow
  } = config;

  const documents = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const id = Number(row?.[idKey] || 0);
    const numero = String(row?.[numberKey] || '').trim();

    if (!id && !numero) {
      return;
    }

    const document = mapRow
      ? mapRow(row, { id: id || null, numero, date: row?.[dateKey] || null })
      : { id: id || null, numero, date: row?.[dateKey] || null };

    const mapKey = id || numero;
    if (!documents.has(mapKey)) {
      documents.set(mapKey, document);
    }
  });

  return Array.from(documents.values()).sort(sortDocumentsByLatest);
};

const buildNetHtFromLine = (line = {}) => {
  const qte = toFiniteNumber(line.quantite, 0);
  const pu = toFiniteNumber(line.prix, 0);
  const totalAvantRemise = qte * pu;
  const remiseValue = toFiniteNumber(line.remise, 0);
  const remiseMontant = toFiniteNumber(line.remise_montant, 0);

  let ht = totalAvantRemise;
  if (remiseMontant > 0) {
    ht -= remiseMontant;
  } else if (remiseValue > 0 && remiseValue <= 1) {
    ht *= (1 - remiseValue);
  } else if (remiseValue > 1) {
    ht *= (1 - (remiseValue / 100));
  }

  return roundCurrency(Math.max(0, ht));
};

const aggregateFactureRowsByLot = (rows = []) => {
  const groupedRows = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const articleKey = String(
      row?.article_id
      ?? row?.article_cod
      ?? row?.article
      ?? row?.article_nom
      ?? row?.designation
      ?? ''
    ).trim();
    const lotKey = String(row?.numero_lot ?? row?.serie ?? '').trim();
    const groupKey = `${articleKey}__${lotKey}`;
    const quantite = roundCurrency(toFiniteNumber(row?.quantite, 0));
    const prix = row?.prix === null || row?.prix === undefined || row?.prix === '' ? null : roundCurrency(row.prix);
    const tauxTva = row?.taux_tva === null || row?.taux_tva === undefined || row?.taux_tva === '' ? null : toFiniteNumber(row.taux_tva, 0);
    const totalHtNet = roundCurrency(row?.total_ht_net);
    const totalRemiseAmount = roundCurrency(row?.total_remise_amount);
    const totalTvaAmount = roundCurrency(row?.total_tva_amount);

    if (!groupedRows.has(groupKey)) {
      groupedRows.set(groupKey, {
        ...row,
        quantite,
        prix,
        taux_tva: tauxTva,
        total_ht_net: totalHtNet,
        total_remise_amount: totalRemiseAmount,
        total_tva_amount: totalTvaAmount,
        numero_lot: lotKey,
        serie: lotKey,
        _sortIndex: index,
        _prixConsistent: true,
        _tauxConsistent: true
      });
      return;
    }

    const existing = groupedRows.get(groupKey);
    const existingPrix = existing.prix;
    const existingTauxTva = existing.taux_tva;

    existing.quantite = roundCurrency(toFiniteNumber(existing.quantite, 0) + quantite);
    existing.total_ht_net = roundCurrency(toFiniteNumber(existing.total_ht_net, 0) + totalHtNet);
    existing.total_remise_amount = roundCurrency(toFiniteNumber(existing.total_remise_amount, 0) + totalRemiseAmount);
    existing.total_tva_amount = roundCurrency(toFiniteNumber(existing.total_tva_amount, 0) + totalTvaAmount);

    if (existing._prixConsistent) {
      if (existingPrix === null) {
        existing.prix = prix;
      } else if (prix !== null && Math.abs(existingPrix - prix) > 0.0001) {
        existing._prixConsistent = false;
        existing.prix = null;
      }
    }

    if (existing._tauxConsistent) {
      if (existingTauxTva === null) {
        existing.taux_tva = tauxTva;
      } else if (tauxTva !== null && Math.abs(existingTauxTva - tauxTva) > 0.0001) {
        existing._tauxConsistent = false;
        existing.taux_tva = null;
      }
    }
  });

  return Array.from(groupedRows.values())
    .sort((a, b) => a._sortIndex - b._sortIndex)
    .map(({ _sortIndex, _prixConsistent, _tauxConsistent, ...row }) => row);
};

// Récupérer toutes les factures avec pagination depuis la vue v_facture
// Optimisé avec COUNT(*) OVER() pour éviter une requête séparée de comptage
const getAllFactures = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'facture_dat',
      orderDirection = 'DESC',
      search = ''
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    const validColumns = [
      'facture_id',
      'facture_num',
      'facture_dat',
      'client',
      'total_ht',
      'total_tva',
      'total_ttc',
      'status',
      'condition_paiement',
      'date_echeance',
      'jours_restants_echeance',
      'numero_livraison',
      'adresse',
      'ice'
    ];
    const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'facture_dat';
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const orderExpression = safeOrderBy === 'facture_dat'
      ? `facture_dat ${safeOrderDirection}, facture_num ${safeOrderDirection}`
      : `${safeOrderBy} ${safeOrderDirection}, facture_dat ${safeOrderDirection}, facture_num ${safeOrderDirection}`;

    let whereClause = "WHERE ISNULL(facture_num, '') NOT LIKE 'AV%'";
    const replacements = {};

    if (search && search.trim()) {
      whereClause += ` AND (
        facture_num LIKE :search 
        OR client LIKE :search
        OR numero_livraison LIKE :search
        OR condition_paiement LIKE :search
        OR adresse LIKE :search
        OR ice LIKE :search
      )`;
      replacements.search = `%${search.trim()}%`;
    }

    // Requête unique avec COUNT(*) OVER() pour obtenir le total sans requête séparée
    const query = `
      WITH EnrichedFactures AS (
        SELECT
          source.facture_id,
          source.facture_num,
          source.client,
          source.facture_dat,
          source.total_ht,
          source.remise,
          source.total_tva,
          source.total_ttc,
          source.status,
          source.adresse,
          source.ice,
          source.condition_paiement,
          source.condition_jours,
          source.date_echeance,
          source.jours_restants_echeance,
          source.numero_livraison
        FROM (
          SELECT
            v.facture_id,
            v.facture_num,
            COALESCE(NULLIF(LTRIM(RTRIM(v.client)), ''), NULLIF(LTRIM(RTRIM(vp.nom)), ''), '') AS client,
            v.facture_dat,
            v.total_ht,
            v.remise,
            v.total_tva,
            v.total_ttc,
            v.status,
            COALESCE(NULLIF(LTRIM(RTRIM(vp.adresse)), ''), '') AS adresse,
            COALESCE(NULLIF(LTRIM(RTRIM(vp.ice)), ''), '') AS ice,
            COALESCE(NULLIF(LTRIM(RTRIM(cond.condition_paiement)), ''), '') AS condition_paiement,
            cond.condition_jours,
            CASE
              WHEN cond.condition_jours IS NOT NULL AND v.facture_dat IS NOT NULL
                THEN CAST(DATEADD(DAY, cond.condition_jours, CAST(v.facture_dat AS DATE)) AS DATE)
              ELSE NULL
            END AS date_echeance,
            CASE
              WHEN cond.condition_jours IS NOT NULL AND v.facture_dat IS NOT NULL
                THEN DATEDIFF(
                  DAY,
                  CAST(GETDATE() AS DATE),
                  CAST(DATEADD(DAY, cond.condition_jours, CAST(v.facture_dat AS DATE)) AS DATE)
                )
              ELSE NULL
            END AS jours_restants_echeance,
            COALESCE(NULLIF(LTRIM(RTRIM(liv.numero_livraison)), ''), '') AS numero_livraison
          FROM v_facture v
          LEFT JOIN facture_souche fs ON fs.facture_id = v.facture_id
          LEFT JOIN v_partenaire vp ON vp.part_id = fs.part_id
          OUTER APPLY (
            SELECT TOP 1
              cp.nom AS condition_paiement,
              cp.jours AS condition_jours
            FROM partenaire_condition pc
            LEFT JOIN condition_paiement cp ON cp.id = pc.condition_id
            WHERE pc.part_id = fs.part_id
            ORDER BY pc.id DESC
          ) cond
          OUTER APPLY (
            SELECT
              STUFF((
                SELECT ', ' + bl.numero
                FROM (
                  SELECT DISTINCT
                    s2.numero,
                    CAST(s2.date AS DATE) AS bl_date
                  FROM stock s2
                  WHERE s2.facture_id = v.facture_id
                    AND s2.numero IS NOT NULL
                    AND LTRIM(RTRIM(s2.numero)) <> ''
                ) bl
                ORDER BY bl.bl_date DESC, bl.numero DESC
                FOR XML PATH(''), TYPE
              ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS numero_livraison
          ) liv
        ) source
      )
      SELECT
        facture_id,
        facture_num,
        client,
        facture_dat,
        total_ht,
        remise,
        total_tva,
        total_ttc,
        status,
        adresse,
        ice,
        condition_paiement,
        condition_jours,
        date_echeance,
        jours_restants_echeance,
        numero_livraison,
        total_count
      FROM (
        SELECT
          facture_id,
          facture_num,
          client,
          facture_dat,
          total_ht,
          remise,
          total_tva,
          total_ttc,
          status,
          adresse,
          ice,
          condition_paiement,
          condition_jours,
          date_echeance,
          jours_restants_echeance,
          numero_livraison,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY ${orderExpression}) AS RowNum
        FROM EnrichedFactures
        ${whereClause}
      ) AS PaginatedResults
      WHERE RowNum > ${offset} AND RowNum <= ${offset + safePageSize}
      ORDER BY RowNum
    `;

    let results = [];
    let total = 0;

    try {
      const dataQueryResult = await sequelize.query(query, {
        replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
        type: sequelize.QueryTypes.SELECT
      });

      if (Array.isArray(dataQueryResult)) {
        results = dataQueryResult;
      } else {
        results = dataQueryResult ? [dataQueryResult] : [];
      }

      // Extraire le total depuis la première ligne
      if (results.length > 0) {
        total = parseInt(results[0].total_count) || 0;
        results = results.map(({ total_count, ...rest }) => rest);
      }
    } catch (dataError) {
      console.error('[getAllFactures] Erreur:', dataError.message);
      throw new Error(`Erreur lors de la récupération des factures: ${dataError.message || 'Erreur inconnue'}`);
    }

    const totalPages = Math.ceil(total / safePageSize) || 1;

    return {
      data: results,
      pagination: {
        page: safePage,
        pageSize: safePageSize,
        total: total,
        totalPages: totalPages
      }
    };
  } catch (error) {
    console.error('[getAllFactures] Erreur:', error.message);

    if (error.message && (error.message.includes('v_facture') || error.message.includes('Invalid object name'))) {
      throw new Error(`La vue v_facture n'est pas accessible. Veuillez vérifier que la vue existe dans la base de données.`);
    }

    throw error;
  }
};

// Récupérer toutes les factures sans pagination (pour compatibilité et fallback)
// Utilise la vue v_facture directement
const getAllFacturesNoPagination = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `SELECT 
      v.facture_id,
      v.facture_num,
      v.facture_dat,
      v.nom,
      fs.part_id,
      v.facture_ht,
      v.facture_tva
    FROM v_facture v
    LEFT JOIN facture_souche fs ON fs.facture_id = v.facture_id
    WHERE ISNULL(v.facture_num, '') NOT LIKE 'AV%'
    ORDER BY v.facture_dat DESC, v.facture_num DESC`;

    const [results] = await sequelize.query(query);

    if (!Array.isArray(results)) {
      console.error('[getAllFacturesNoPagination] Résultats n\'est pas un tableau!', results);
      return [];
    }

    return results || [];
  } catch (error) {
    console.error('[getAllFacturesNoPagination] Erreur:', error);
    throw error;
  }
};

// Récupérer une facture par ID depuis la vue v_facture (plus fiable)
const getFactureById = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `
      SELECT v.*, fs.part_id 
      FROM v_facture v
      LEFT JOIN facture_souche fs ON fs.facture_id = v.facture_id
      WHERE v.facture_id = :id
    `;

    const results = await sequelize.query(query, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    });

    if (Array.isArray(results) && results.length > 0) {
      return results[0];
    }

    return null;
  } catch (error) {
    console.error('[getFactureById] Erreur:', error);
    throw error;
  }
};

// Récupérer le rapport de facturation avec les détails des articles
const getFacturationReport = async (options = {}, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const { factureId } = options;

    // Construire la requête de base
    let query = `
      SELECT 
        fr.facture_id,
        fr.numero,
        fr.date,
        fr.numero_livraison,
        a.article_cod,
        a.article_nom,
        fr.quantite,
        fr.prix,
        fr.total_ht,
        fr.total_tva,
        fr.total_ttc,
        fr.nom_client
      FROM v_facture_report fr
      INNER JOIN article a ON a.article_id = fr.article_id
    `;

    const replacements = {};

    // Ajouter un filtre par facture_id si fourni
    if (factureId) {
      query += ` WHERE fr.facture_id = :factureId`;
      replacements.factureId = factureId;
    }

    // Ajouter un ORDER BY pour un ordre cohérent
    query += ` ORDER BY fr.facture_id, fr.numero, a.article_cod`;


    const [results] = await sequelize.query(query, {
      replacements: Object.keys(replacements).length > 0 ? replacements : undefined,
      type: sequelize.QueryTypes.SELECT
    });

    // Gérer le format de retour de Sequelize
    let dataArray = [];
    if (Array.isArray(results)) {
      dataArray = results;
    } else if (results) {
      dataArray = [results];
    }


    return dataArray;
  } catch (error) {
    console.error('[getFacturationReport] ❌ Erreur:', error);
    throw error;
  }
};

// Récupérer le rapport de facturation par ID pour la génération PDF
// Retourne les données au format attendu par le générateur PDF (comme getEmailDataByDocumentId)
// Les factures sont créées depuis les livraisons (stock), donc les détails sont dans stock_detail
const getFactureReportById = async (factureId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    // D'abord, récupérer les informations de base de la facture
    const factureInfoQuery = `
      SELECT  
        f.facture_id, 
        f.facture_num AS numero, 
        f.facture_dat AS date, 
        fs.part_id, 
        p.nom AS nom_client, 
        p.ice AS ice,
        COALESCE(
          NULLIF(LTRIM(RTRIM(p.adresse)), ''),
          NULLIF(LTRIM(RTRIM(
            COALESCE(addr.adresse_ligne, '') +
            CASE
              WHEN addr.adresse_ligne IS NOT NULL AND addr.ville_nom IS NOT NULL THEN ', ' + addr.ville_nom
              WHEN addr.adresse_ligne IS NULL AND addr.ville_nom IS NOT NULL THEN addr.ville_nom
              ELSE ''
            END
          )), ''),
          ''
        ) AS adresse,
        ISNULL(addr.ville_nom, '') AS ville
      FROM facture f 
      INNER JOIN facture_souche fs ON fs.facture_id = f.facture_id 
      LEFT JOIN v_partenaire p ON p.part_id = fs.part_id
      LEFT JOIN partenaire_identifiant pi ON pi.part_id = p.part_id AND pi.identifiant_type = 8
      OUTER APPLY (
        SELECT TOP 1
          NULLIF(LTRIM(RTRIM(a.adresse)), '') AS adresse_ligne,
          NULLIF(LTRIM(RTRIM(v.nom)), '') AS ville_nom
        FROM adresse a
        LEFT JOIN ville v ON v.id = a.ville
        WHERE a.part_id = p.part_id
        ORDER BY
          CASE WHEN NULLIF(LTRIM(RTRIM(a.adresse)), '') IS NULL THEN 1 ELSE 0 END,
          ISNULL(a.id, 0) DESC
      ) addr
      WHERE f.facture_id = :factureId
    `;

    const [factureInfo, stockDetailColSet] = await Promise.all([
      sequelize.query(factureInfoQuery, {
        replacements: { factureId },
        type: sequelize.QueryTypes.SELECT
      }),
      getTableColumnSet(sequelize, 'stock_detail')
    ]);

    if (!factureInfo || (Array.isArray(factureInfo) && factureInfo.length === 0)) {
      console.warn('[getFactureReportById] ⚠️ Facture non trouvée:', factureId);
      return null;
    }

    const facture = Array.isArray(factureInfo) ? factureInfo[0] : factureInfo;
    const detailOrderBy = stockDetailColSet.has('ligne')
      ? 'ORDER BY CASE WHEN sd.ligne IS NULL THEN 1 ELSE 0 END, sd.ligne ASC, sd.id ASC'
      : 'ORDER BY sd.id DESC';

    // Récupérer les détails depuis stock_detail (car facture_id = stock_id)
    // Les factures sont créées depuis les livraisons, donc stock_id = facture_id
    const detailsQuery = `
      SELECT 
        :factureId AS document_id,
        :numero AS numero,
        :date AS date,
        '' AS client_ref,
        :factureId AS etat,
        4 AS type,
        'FACTURE' AS document_kind,
        :part_id AS part_id,
        :nom_client AS client,
        '' AS commercial,
        sd.article_id,
        ISNULL(a.article_cod, '') AS article_cod,
        ISNULL(sd.description, '') AS designation,
        ISNULL(a.article_nom, '') AS article_nom,
        sd.quantite,
        sd.prix,
        ISNULL(a.article_nom, '') AS article,
        ISNULL(sd.taux_tva, 0) AS taux_tva,
        ISNULL(sd.remise, 0) AS remise,
        ISNULL(sd.remise_montant, 0) AS remise_montant,
        '' AS condition,
        '' AS expedition,
        '' AS transporteur,
        :adresse AS adresse,
        :ville AS ville,
        :ice AS ice,
        ISNULL(s.numero, '') AS source_numero_livraison,
        s.id AS source_stock_id,
        ${stockDetailColSet.has('ligne') ? 'sd.ligne AS ordre_ligne,' : 'NULL AS ordre_ligne,'}
        sd.id AS ligne_id,
        sd.id AS detail_id,
        ${stockDetailColSet.has('type') ? 'sd.type AS ligne_type,' : 'NULL AS ligne_type,'}
        (sd.quantite * sd.prix) AS total_ht,
        (sd.quantite * sd.prix * ISNULL(sd.taux_tva, 0)) AS total_tva,
        (sd.quantite * sd.prix * (1 + ISNULL(sd.taux_tva, 0))) AS total_ttc,
        '' AS numero_livraison
      FROM stock_detail sd
      LEFT JOIN stock s ON s.id = sd.stock_id
      LEFT JOIN article a ON a.article_id = sd.article_id
      WHERE s.facture_id = :factureId
      ${detailOrderBy}
    `;

    // Préparer les replacements avec gestion des valeurs null/undefined
    const replacements = {
      factureId: factureId,
      numero: facture.numero || '',
      date: facture.date || null,
      part_id: facture.part_id || null,
      nom_client: facture.nom_client || facture.nom || '',
      adresse: (facture.adresse || '').substring(0, 200), // Limiter la longueur
      ville: facture.ville || '',
      ice: facture.ice || ''
    };

    if (process.env.DEBUG_FACTURE_REPORT === '1') {

    console.log('[getFactureReportById] 📋 Informations facture récupérées:', {
      facture_id: facture.facture_id,
      numero: replacements.numero,
      nom_client: replacements.nom_client,
      ice: replacements.ice,
      adresse: replacements.adresse,
      ville: replacements.ville
    });

    // Afficher la requête SQL complète pour déboguer
    console.log('[getFactureReportById] 📋 Requête SQL pour récupérer les détails de facture:');
    console.log(detailsQuery);
    console.log('[getFactureReportById] 📋 Paramètres:', JSON.stringify(replacements, null, 2));

    }

    const results = await sequelize.query(detailsQuery, {
      replacements: replacements,
      type: sequelize.QueryTypes.SELECT
    });

    // Afficher les premières lignes pour vérifier remise_montant
    if (process.env.DEBUG_FACTURE_REPORT === '1' && results && results.length > 0) {
      console.log('[getFactureReportById] ✅ Résultats récupérés:', results.length, 'ligne(s)');
      console.log('[getFactureReportById] 📊 Première ligne (exemple):', {
        article_cod: results[0].article_cod,
        quantite: results[0].quantite,
        prix: results[0].prix,
        remise: results[0].remise,
        remise_montant: results[0].remise_montant,
        total_ht: results[0].total_ht
      });
    }


    // Gérer le format de retour de Sequelize pour SQL Server
    // Sequelize avec SQL Server peut retourner [results, metadata] ou directement results
    let dataArray = [];

    if (Array.isArray(results)) {
      // Si c'est un tableau, vérifier si c'est [results, metadata] ou directement les résultats
      if (results.length === 2 && Array.isArray(results[0]) && !Array.isArray(results[1])) {
        // Format [results, metadata]
        dataArray = results[0];
      } else if (results.length > 0 && typeof results[0] === 'object' && results[0] !== null) {
        // Format direct tableau de résultats
        dataArray = results;
      } else {
        // Format inattendu, essayer de récupérer les résultats
        dataArray = results;
      }
    } else if (results && typeof results === 'object') {
      // Un seul objet
      dataArray = [results];
    }

    if (dataArray.length > 0) {
      const numeroLivraison = Array.from(
        dataArray.reduce((map, row) => {
          const numero = String(row?.source_numero_livraison || '').trim();
          const stockId = Number(row?.source_stock_id || Number.MAX_SAFE_INTEGER);

          if (!numero) {
            return map;
          }

          const existingStockId = map.get(numero);
          if (existingStockId === undefined || stockId < existingStockId) {
            map.set(numero, stockId);
          }

          return map;
        }, new Map()).entries()
      )
        .sort((a, b) => {
          if (a[1] === b[1]) {
            return a[0].localeCompare(b[0], 'fr', { numeric: true, sensitivity: 'base' });
          }

          return a[1] - b[1];
        })
        .map(([numero]) => numero)
        .join(', ');

      const stockIds = Array.from(
        new Set(
          dataArray
            .map((row) => Number(row?.source_stock_id || 0))
            .filter((id) => Number.isFinite(id) && id > 0)
        )
      );

      if (stockIds.length > 0) {
        const quillRowsById = new Map();
        const stockInfoRows = await loadStockInfoRowsByDocumentIds(sequelize, stockIds);
        const stockInfoById = new Map(
          (Array.isArray(stockInfoRows) ? stockInfoRows : []).map((row) => [Number(row.document_id), row])
        );

        const quillRowsByStock = await Promise.all(
          stockIds.map((stockId) => loadQuillRowsByDocument(
            sequelize,
            stockId,
            getLivraisonQuillCandidates()
          ))
        );

        for (const quillRows of quillRowsByStock) {
          for (const row of Array.isArray(quillRows) ? quillRows : []) {
            quillRowsById.set(String(row.quill_id), row.designation || '');
          }
        }

        dataArray = dataArray.map((row) => {
          const quillDesignation = quillRowsById.get(String(row?.ligne_id));
          const designation = quillDesignation || row.designation || row.article || row.article_nom || '';
          const stockInfo = stockInfoById.get(Number(row?.source_stock_id || 0));

          return {
            ...row,
            condition: stockInfo?.condition || row.condition || '',
            expedition: stockInfo?.expedition || row.expedition || '',
            transporteur: stockInfo?.transporteur || row.transporteur || '',
            numero_livraison: numeroLivraison || row.numero_livraison || '',
            designation,
            article: designation || row.article_nom || ''
          };
        });

        const sharedInfo = dataArray.reduce((acc, row) => ({
          condition: acc.condition || row.condition || '',
          expedition: acc.expedition || row.expedition || '',
          transporteur: acc.transporteur || row.transporteur || ''
        }), {
          condition: '',
          expedition: '',
          transporteur: ''
        });

        dataArray = dataArray.map((row) => ({
          ...row,
          condition: row.condition || sharedInfo.condition || '',
          expedition: row.expedition || sharedInfo.expedition || '',
          transporteur: row.transporteur || sharedInfo.transporteur || '',
          numero_livraison: numeroLivraison || row.numero_livraison || ''
        }));
      }

      const detailIds = Array.from(
        new Set(
          dataArray
            .map((row) => Number(row?.detail_id ?? row?.ligne_id ?? 0))
            .filter((id) => Number.isFinite(id) && id > 0)
        )
      );

      const lotColSet = await getTableColumnSet(sequelize, 'stock_detail_lot');
      const lotRowsByDetailId = new Map();

      if (lotColSet.has('detail_id') && lotColSet.has('serie') && detailIds.length > 0) {
        const detailPlaceholders = detailIds.map((_, index) => `:detailId${index}`).join(', ');
        const lotReplacements = detailIds.reduce((acc, detailId, index) => {
          acc[`detailId${index}`] = detailId;
          return acc;
        }, {});
        const lotQuantiteExpr = lotColSet.has('quantite') ? 'ISNULL(sdl.quantite, 0)' : 'NULL';
        const lotSortBy = [
          lotColSet.has('ligne') ? 'ISNULL(sdl.ligne, 0)' : null,
          lotColSet.has('id') ? 'ISNULL(sdl.id, 0)' : null,
          'ISNULL(sdl.detail_id, 0)'
        ].filter(Boolean).join(', ');

        const lotRows = await sequelize.query(
          `
            SELECT
              sdl.detail_id,
              NULLIF(LTRIM(RTRIM(ISNULL(sdl.serie, ''))), '') AS serie,
              ${lotQuantiteExpr} AS quantite
            FROM stock_detail_lot sdl
            WHERE sdl.detail_id IN (${detailPlaceholders})
            ORDER BY ${lotSortBy}
          `,
          {
            replacements: lotReplacements,
            type: sequelize.QueryTypes.SELECT
          }
        );

        for (const lotRow of Array.isArray(lotRows) ? lotRows : []) {
          const detailId = Number(lotRow?.detail_id || 0);
          if (!detailId) continue;
          const existing = lotRowsByDetailId.get(detailId) || [];
          existing.push({
            serie: String(lotRow?.serie || '').trim(),
            quantite: lotRow?.quantite
          });
          lotRowsByDetailId.set(detailId, existing);
        }
      }

      const expandedRows = [];
      for (const row of dataArray) {
        const detailId = Number(row?.detail_id ?? row?.ligne_id ?? 0);
        const lineLots = detailId ? (lotRowsByDetailId.get(detailId) || []) : [];
        const normalizedLots = lineLots.filter((lot) => String(lot?.serie || '').trim() || toFiniteNumber(lot?.quantite, 0) > 0);
        const baseQuantite = toFiniteNumber(row?.quantite, 0);
        const basePrix = toFiniteNumber(row?.prix, 0);
        const baseTauxTva = toFiniteNumber(row?.taux_tva, 0);
        const baseHt = buildNetHtFromLine(row);
        const baseRemiseAmount = roundCurrency(Math.max(0, (baseQuantite * basePrix) - baseHt));

        if (normalizedLots.length === 0) {
          expandedRows.push({
            ...row,
            numero_lot: '',
            serie: '',
            total_ht_net: baseHt,
            total_remise_amount: baseRemiseAmount,
            total_tva_amount: roundCurrency(baseHt * baseTauxTva)
          });
          continue;
        }

        const totalLotQuantite = normalizedLots.reduce((sum, lot) => sum + Math.max(0, toFiniteNumber(lot?.quantite, 0)), 0);

        normalizedLots.forEach((lot) => {
          const lotQuantite = totalLotQuantite > 0
            ? Math.max(0, toFiniteNumber(lot?.quantite, 0))
            : roundCurrency(baseQuantite / normalizedLots.length);
          const ratio = totalLotQuantite > 0
            ? (lotQuantite / totalLotQuantite)
            : (1 / normalizedLots.length);
          const lotHt = roundCurrency(baseHt * ratio);
          const lotRemiseAmount = roundCurrency(baseRemiseAmount * ratio);

          expandedRows.push({
            ...row,
            quantite: lotQuantite,
            numero_lot: String(lot?.serie || '').trim(),
            serie: String(lot?.serie || '').trim(),
            total_ht_net: lotHt,
            total_remise_amount: lotRemiseAmount,
            total_tva_amount: roundCurrency(lotHt * baseTauxTva)
          });
        });
      }

      dataArray = aggregateFactureRowsByLot(expandedRows).map((row) => ({
        ...row,
        ordre_ligne: row?.ordre_ligne === null || row?.ordre_ligne === undefined || row?.ordre_ligne === ''
          ? null
          : Number(row.ordre_ligne),
        numero_livraison: numeroLivraison || row.numero_livraison || '',
        total_ht: row.total_ht_net,
        total_tva: row.total_tva_amount,
        total_ttc: roundCurrency(toFiniteNumber(row.total_ht_net, 0) + toFiniteNumber(row.total_tva_amount, 0))
      })).sort((left, right) => {
        const leftHasOrder = left?.ordre_ligne !== null && left?.ordre_ligne !== undefined;
        const rightHasOrder = right?.ordre_ligne !== null && right?.ordre_ligne !== undefined;
        if (!leftHasOrder && !rightHasOrder) {
          return 0;
        }

        const leftOrder = leftHasOrder ? Number(left.ordre_ligne) : Number.MAX_SAFE_INTEGER;
        const rightOrder = rightHasOrder ? Number(right.ordre_ligne) : Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return Number(left?.detail_id || left?.ligne_id || 0) - Number(right?.detail_id || right?.ligne_id || 0);
      }).map((row) => ({
        ...row,
        numero_livraison: numeroLivraison || row.numero_livraison || ''
      }));
    } else {
      console.warn('[getFactureReportById] ⚠️ Aucun détail trouvé dans stock_detail pour stock_id:', factureId);
    }

    return dataArray.length > 0 ? dataArray : null;
  } catch (error) {
    console.error('[getFactureReportById] ❌ Erreur:', error);
    console.error('[getFactureReportById] ❌ Stack:', error.stack);
    throw error;
  }
};

const getFactureParcoursById = async (factureId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const id = parseInt(factureId, 10);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('facture_id invalide');
  }

  const rows = await sequelize.query(
    `
      SELECT
        f.facture_id,
        f.facture_num AS facture_numero,
        f.facture_dat AS facture_date,
        fs.part_id,
        p.nom AS client,
        s.id AS livraison_id,
        s.numero AS livraison_numero,
        s.date AS livraison_date,
        prep.id AS preparation_id,
        prep.numero AS preparation_numero,
        prep.date AS preparation_date,
        cmd.document_id AS commande_id,
        cmd.numero AS commande_numero,
        cmd.date AS commande_date
      FROM facture f
      LEFT JOIN facture_souche fs ON fs.facture_id = f.facture_id
      LEFT JOIN partenaire p ON p.part_id = fs.part_id
      LEFT JOIN stock s
        ON s.facture_id = f.facture_id
       AND s.type = 2
      LEFT JOIN stock_document prep
        ON prep.id = s.parent
       AND prep.type = 10
      LEFT JOIN vente_document cmd
        ON cmd.document_id = COALESCE(prep.parent, s.parent)
       AND cmd.type = 2
      WHERE f.facture_id = :factureId
      ORDER BY ISNULL(s.date, f.facture_dat) DESC, ISNULL(s.id, 0) DESC
    `,
    {
      replacements: { factureId: id },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const firstRow = Array.isArray(rows) ? rows[0] : rows;
  if (!firstRow?.facture_id) {
    return null;
  }

  const commandes = collectUniqueDocuments(rows, {
    idKey: 'commande_id',
    numberKey: 'commande_numero',
    dateKey: 'commande_date'
  });

  const preparations = collectUniqueDocuments(rows, {
    idKey: 'preparation_id',
    numberKey: 'preparation_numero',
    dateKey: 'preparation_date'
  });

  const livraisons = collectUniqueDocuments(rows, {
    idKey: 'livraison_id',
    numberKey: 'livraison_numero',
    dateKey: 'livraison_date',
    mapRow: (row, baseDocument) => ({
      ...baseDocument,
      source_type: row?.preparation_id ? 'preparation' : 'commande',
      source_numero: row?.preparation_id
        ? String(row?.preparation_numero || '').trim()
        : String(row?.commande_numero || '').trim()
    })
  });

  const hasPreparation = preparations.length > 0;
  const hasDirectLivraison = livraisons.some((livraison) => livraison.source_type === 'commande');

  return {
    facture: {
      id: Number(firstRow.facture_id),
      numero: firstRow.facture_numero || '',
      date: firstRow.facture_date || null,
      client: firstRow.client || '',
      part_id: Number(firstRow.part_id || 0) || null
    },
    commandes,
    preparations,
    livraisons,
    summary: {
      commande_count: commandes.length,
      preparation_count: preparations.length,
      livraison_count: livraisons.length,
      route_type: hasPreparation
        ? (hasDirectLivraison ? 'mixte' : 'preparation')
        : 'direct'
    },
    steps: [
      {
        key: 'commande',
        label: 'Bon de commande',
        status: commandes.length > 0 ? 'done' : 'pending',
        count: commandes.length
      },
      {
        key: 'preparation',
        label: 'Bon de préparation',
        status: hasPreparation ? 'done' : (livraisons.length > 0 ? 'direct' : 'pending'),
        count: preparations.length
      },
      {
        key: 'livraison',
        label: 'Bon de livraison',
        status: livraisons.length > 0 ? 'done' : 'pending',
        count: livraisons.length
      },
      {
        key: 'facture',
        label: 'Facture',
        status: 'current',
        count: 1
      }
    ]
  };
};

// Récupérer les montants HT et TVA d'une facture depuis v_facture_montant
const getFactureLivraisonDetailsById = async (factureId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const id = parseInt(factureId, 10);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('facture_id invalide');
  }

  const stockDetailColSet = await getTableColumnSet(sequelize, 'stock_detail');
  const descriptionExpression = stockDetailColSet.has('description')
    ? "NULLIF(LTRIM(RTRIM(ISNULL(sd.description, ''))), '')"
    : 'NULL';
  const lineOrderBy = stockDetailColSet.has('ligne')
    ? 'CASE WHEN sd.ligne IS NULL THEN 1 ELSE 0 END, sd.ligne ASC, ISNULL(sd.id, 0)'
    : 'ISNULL(sd.id, 0)';

  const rows = await sequelize.query(
    `
      SELECT
        f.facture_id,
        f.facture_num AS facture_numero,
        f.facture_dat AS facture_date,
        fs.part_id,
        p.nom AS client,
        s.id AS livraison_id,
        s.id AS document_id,
        s.numero AS livraison_numero,
        s.date AS livraison_date,
        sd.id AS detail_id,
        ${stockDetailColSet.has('ligne') ? 'sd.ligne AS ordre_ligne,' : 'NULL AS ordre_ligne,'}
        ${stockDetailColSet.has('type') ? 'sd.type AS ligne_type,' : 'NULL AS ligne_type,'}
        sd.article_id,
        ISNULL(a.article_cod, '') AS article_cod,
        COALESCE(
          ${descriptionExpression},
          NULLIF(LTRIM(RTRIM(ISNULL(a.article_nom, ''))), ''),
          NULLIF(LTRIM(RTRIM(ISNULL(a.article_cod, ''))), ''),
          'Article'
        ) AS article,
        ISNULL(sd.quantite, 0) AS quantite,
        ISNULL(sd.prix, 0) AS prix,
        ISNULL(sd.taux_tva, 0) AS taux_tva,
        CAST(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0) AS DECIMAL(18, 2)) AS total_ht,
        CAST(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0) * ISNULL(sd.taux_tva, 0) AS DECIMAL(18, 2)) AS total_tva,
        CAST(ISNULL(sd.quantite, 0) * ISNULL(sd.prix, 0) * (1 + ISNULL(sd.taux_tva, 0)) AS DECIMAL(18, 2)) AS total_ttc
      FROM facture f
      LEFT JOIN facture_souche fs ON fs.facture_id = f.facture_id
      LEFT JOIN partenaire p ON p.part_id = fs.part_id
      LEFT JOIN stock s
        ON s.facture_id = f.facture_id
       AND s.type = 2
      LEFT JOIN stock_detail sd ON sd.stock_id = s.id
      LEFT JOIN article a ON a.article_id = sd.article_id
      WHERE f.facture_id = :factureId
      ORDER BY ISNULL(s.date, f.facture_dat) DESC, ISNULL(s.id, 0) DESC, ${lineOrderBy}
    `,
    {
      replacements: { factureId: id },
      type: sequelize.QueryTypes.SELECT
    }
  );

  const firstRow = Array.isArray(rows) ? rows[0] : rows;
  if (!firstRow?.facture_id) {
    return null;
  }

  const livraisonsById = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const livraisonId = Number(row?.livraison_id || 0);
    const livraisonNumero = String(row?.livraison_numero || '').trim();

    if (!livraisonId && !livraisonNumero) {
      return;
    }

    const mapKey = livraisonId || livraisonNumero;
    if (!livraisonsById.has(mapKey)) {
      livraisonsById.set(mapKey, {
        id: livraisonId || null,
        document_id: Number(row?.document_id || livraisonId || 0) || null,
        numero: livraisonNumero,
        date: row?.livraison_date || null,
        lines: [],
        totals: {
          total_ht: 0,
          total_tva: 0,
          total_ttc: 0,
          line_count: 0,
          article_count: 0
        }
      });
    }

    const livraison = livraisonsById.get(mapKey);
    const detailId = Number(row?.detail_id || 0);
    if (!detailId) {
      return;
    }

    const line = {
      id: detailId,
      ordre_ligne: row?.ordre_ligne === null || row?.ordre_ligne === undefined || row?.ordre_ligne === ''
        ? null
        : Number(row.ordre_ligne),
      article_id: Number(row?.article_id || 0) || null,
      article_cod: String(row?.article_cod || '').trim(),
      article: String(row?.article || '').trim(),
      quantite: toFiniteNumber(row?.quantite, 0),
      prix: toFiniteNumber(row?.prix, 0),
      taux_tva: toFiniteNumber(row?.taux_tva, 0),
      total_ht: roundCurrency(row?.total_ht),
      total_tva: roundCurrency(row?.total_tva),
      total_ttc: roundCurrency(row?.total_ttc)
    };

    livraison.lines.push(line);
    livraison.totals.total_ht = roundCurrency(livraison.totals.total_ht + line.total_ht);
    livraison.totals.total_tva = roundCurrency(livraison.totals.total_tva + line.total_tva);
    livraison.totals.total_ttc = roundCurrency(livraison.totals.total_ttc + line.total_ttc);
    livraison.totals.line_count += 1;
  });

  const livraisons = Array.from(livraisonsById.values())
    .map((livraison) => ({
      ...livraison,
      lines: [...livraison.lines].sort((left, right) => {
        const leftOrder = left?.ordre_ligne === null || left?.ordre_ligne === undefined ? Number.MAX_SAFE_INTEGER : Number(left.ordre_ligne);
        const rightOrder = right?.ordre_ligne === null || right?.ordre_ligne === undefined ? Number.MAX_SAFE_INTEGER : Number(right.ordre_ligne);
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return Number(left?.id || 0) - Number(right?.id || 0);
      }),
      totals: {
        ...livraison.totals,
        article_count: new Set(
          livraison.lines.map((line) => String(line.article_id || line.article_cod || line.article || '').trim())
        ).size
      }
    }))
    .sort(sortDocumentsByLatest);

  return {
    facture: {
      id: Number(firstRow.facture_id),
      numero: firstRow.facture_numero || '',
      date: firstRow.facture_date || null,
      client: firstRow.client || '',
      part_id: Number(firstRow.part_id || 0) || null
    },
    livraisons,
    summary: {
      livraison_count: livraisons.length,
      line_count: livraisons.reduce((sum, livraison) => sum + Number(livraison?.totals?.line_count || 0), 0)
    }
  };
};

const getFactureMontant = async (factureId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `
      SELECT 
        total_ht,
        total_tva
      FROM v_facture_montant
      WHERE facture_id = :factureId
    `;

    const [results] = await sequelize.query(query, {
      replacements: { factureId },
      type: sequelize.QueryTypes.SELECT
    });

    if (Array.isArray(results) && results.length > 0) {
      return results[0];
    } else if (results && typeof results === 'object') {
      return results;
    }

    return { total_ht: 0, total_tva: 0 };
  } catch (error) {
    console.error('[getFactureMontant] Erreur:', error);
    throw error;
  }
};

// Récupérer les données d'une facture contrat depuis v_facture_contrat
const getFactureContratById = async (factureId, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  try {
    const query = `
      SELECT
        vc.*,
        fs.part_id AS facturation_part_id,
        p.nom AS partenaire_nom,
        p.adresse AS partenaire_adresse,
        p.ice AS partenaire_ice
      FROM v_facture_contrat vc
      LEFT JOIN facture_souche fs ON fs.facture_id = vc.facture_id
      LEFT JOIN v_partenaire p ON p.part_id = fs.part_id
      WHERE vc.facture_id = :factureId
      ORDER BY vc.facture_id
    `;

    const results = await sequelize.query(query, {
      replacements: { factureId },
      type: sequelize.QueryTypes.SELECT
    });

    // Gérer le format de retour de Sequelize pour SQL Server
    let dataArray = [];
    if (Array.isArray(results)) {
      if (results.length === 2 && Array.isArray(results[0]) && !Array.isArray(results[1])) {
        dataArray = results[0];
      } else if (results.length > 0 && typeof results[0] === 'object' && results[0] !== null) {
        dataArray = results;
      } else {
        dataArray = results;
      }
    } else if (results && typeof results === 'object') {
      dataArray = [results];
    }

    if (dataArray.length === 0) {
      console.warn('[getFactureContratById] ⚠️ Aucune donnée trouvée pour facture_id:', factureId);
      return null;
    }

    return dataArray.map((row) => ({
      ...row,
      part_id: row?.part_id || row?.facturation_part_id || null,
      client: row?.client || row?.nom_client || row?.partenaire_nom || '',
      nom_client: row?.nom_client || row?.client || row?.partenaire_nom || '',
      adresse: row?.adresse || row?.partenaire_adresse || '',
      ice: row?.ice || row?.partenaire_ice || ''
    }));
  } catch (error) {
    console.error('[getFactureContratById] ❌ Erreur:', error);
    throw error;
  }
};

module.exports = {
  getAllFactures,
  getAllFacturesNoPagination,
  getFactureById,
  getFacturationReport,
  getFactureReportById,
  getFactureParcoursById,
  getFactureLivraisonDetailsById,
  getFactureMontant,
  getFactureContratById
};
