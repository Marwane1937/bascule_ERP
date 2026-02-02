const { getConnection } = require('../../config/database');
const { getCompteurCurrent } = require('../../services/compteur.service');

/**
 * Achats -> Réception
 * - Réception = entrée dans stock avec type = 1
 * - Lignes = stock_detail avec sens = 1
 *
 * Notes:
 * - On lie la réception à la commande achat via stock.parent = achat_document.document_id
 * - On évite de modifier le schéma existant (pas de colonne reception_id ajoutée).
 */

const getCommandesNonReceptionnees = async (sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  // Commandes achat = achat_document.type = 2
  // Non réceptionnée = aucune ligne dans stock (type=1) avec parent = document_id
  const query = `
    SELECT
      a.document_id,
      a.numero,
      a.date,
      a.description,
      p.nom AS fournisseur,
      a.part_id
    FROM achat_document a
    INNER JOIN partenaire p ON p.part_id = a.part_id AND p.type = 2
    WHERE a.type = 2
      AND NOT EXISTS (
        SELECT 1
        FROM stock s
        WHERE s.type = 1
          AND s.parent = a.document_id
          AND (s.etat = 1 OR s.etat IS NULL)
      )
    ORDER BY a.date DESC, a.document_id DESC
  `;

  const results = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
  return Array.isArray(results) ? results : (results ? [results] : []);
};

// Récupérer toutes les réceptions (stock.type = 1) avec pagination (comme Livraison)
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

  // Cas 3 : string SQL déjà valide
  return value;
};

 

const createReceptionFromCommande = async (commandeId, detailsOverride = null, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  return await sequelize.transaction(async (t) => {
    // 1) Charger la commande
    const [commande] = await sequelize.query(
      `
        SELECT document_id, numero, date, description, part_id, contact_id
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
      throw new Error('Commande achat non trouvée');
    }

    // 2) Empêcher double réception
    const already = await sequelize.query(
      `
        SELECT TOP 1 id
        FROM stock
        WHERE type = 1 AND parent = :commandeId
      `,
      {
        replacements: { commandeId },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      }
    );
    if (Array.isArray(already) && already.length > 0) {
      throw new Error('Cette commande a déjà été réceptionnée');
    }

    // 3) Générer le numéro (compteur dédié Réception)
    const compteurActuel = await getCompteurCurrent('REC', sequelize);
    const anneeCourte = new Date().getFullYear().toString().slice(2);
    const numeroReception = `REC${anneeCourte}-${Number(compteurActuel).toString().padStart(4, '0')}`;

    const dateSql = formatToSqlDateTime(commande.date);

  // 4) Créer l'entête stock (type=1) + incrément compteur
    const [insertRes] = await sequelize.query(
      `
        INSERT INTO stock (numero, date, description, part_id, employe_id, type, etat, parent)
        OUTPUT INSERTED.id
        VALUES (:numero, :date, :description, :part_id, :employe_id, 1, 1, :parent);
        UPDATE compteur SET compteur = compteur + 1 WHERE LTRIM(RTRIM(code)) = 'REC';
      `,
      {

        replacements: {
          numero: numeroReception,
          date: dateSql || null,
          description: commande.description || null,
          part_id: commande.part_id || null,
          employe_id: commande.contact_id || null,
          parent: commande.document_id
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
      throw new Error('Impossible de créer la réception (stock_id non récupéré)');
    }

    // 5) Charger les détails commande
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
          remise_montant
        FROM achat_document_detail
        WHERE document_id = :commandeId
        ORDER BY id
      `,
      {
        replacements: { commandeId },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      }
    );

    const rows = Array.isArray(details) ? details : (details ? [details] : []);

    // 6) Insérer stock_detail (sens=1)
    // Si le frontend fournit des lignes modifiées, les utiliser (sans modifier la commande originale)
    const inputRows = Array.isArray(detailsOverride) && detailsOverride.length > 0 ? detailsOverride : rows;
    for (const d of inputRows) {
      const descriptionLimited = String(d?.description || '').substring(0, 200);
      await sequelize.query(
        `
          INSERT INTO stock_detail (stock_id, article_id, quantite, prix, taux_tva, description, sens, remise, remise_montant)
          VALUES (:stock_id, :article_id, :quantite, :prix, :taux_tva, :description, 1, :remise, :remise_montant)
        `,
        {
          replacements: {
            stock_id: stockId,
            article_id: d?.article_id ?? null,
            // Supporte les deux conventions (quantite/prix) et (qte/pu)
            quantite: d?.quantite ?? d?.qte ?? 0,
            prix: d?.prix ?? d?.pu ?? 0,
            taux_tva: d?.taux_tva ?? 0,
            description: descriptionLimited,
            remise: d?.remise ?? 0,
            remise_montant: d?.remise_montant ?? 0
          },
          type: sequelize.QueryTypes.INSERT,
          transaction: t
        }
      );
    }

    return {
      stock_id: stockId,
      numero: numeroReception,
      commande_id: commande.document_id
    };
  });
};

// Récupérer une réception par ID (similaire à getLivraisonById)
const getReceptionById = async (id, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  try {
    console.log(`[getReceptionById] 🔍 Recherche réception avec id=${id}`);

    // Récupérer les infos principales depuis stock (type = 1)
    const receptionRows = await sequelize.query(
      `SELECT 
        s.id,
        s.numero,
        s.date,
        s.description,
        s.part_id,
        s.employe_id AS contact_id,
        s.part_ref,
        p.nom AS fournisseur_nom
      FROM stock s
      LEFT JOIN partenaire p ON p.part_id = s.part_id AND p.type = 2
      WHERE s.id = :id AND s.type = 1`,
      {
        replacements: { id },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const reception = Array.isArray(receptionRows) && receptionRows.length > 0 ? receptionRows[0] : null;
    if (!reception) {
      console.log(`[getReceptionById] ❌ Réception non trouvée pour id=${id}`);
      return null;
    }

    console.log(`[getReceptionById] ✅ Réception trouvée:`, {
      id: reception.id,
      numero: reception.numero,
      part_id: reception.part_id
    });

    const documentId = reception.id;

    // Récupérer les détails depuis stock_detail (sens = 1)
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
        a.article_nom,
        a.article_cod
      FROM stock_detail sd
      LEFT JOIN article a ON a.article_id = sd.article_id
      WHERE sd.stock_id = :id AND sd.sens = 1
      ORDER BY sd.id DESC`,
      {
        replacements: { id: documentId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const details = Array.isArray(detailRows) ? detailRows : [];

    // Normaliser les détails
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
        remise: remiseFraction,
        remise_montant: remiseMontant,
        remise_mode: remiseMode,
        ht: prix * quantite,
        ttc: (prix * quantite) * (1 + (taux_tva || 0))
      };
    });

  // Récupérer les informations du fournisseur avec jointures sur adresse et partenaire_identifiant
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
      console.error('[getReceptionById] ❌ Erreur récupération fournisseur:', error);
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
      details: Array.isArray(normalizedDetails) ? normalizedDetails : [],
      fournisseurInfo: fournisseurInfo || null
    };
  } catch (error) {
    console.error(`[getReceptionById] ❌ Erreur lors de la récupération de la réception id=${id}:`, error);
    throw error;
  }
};

// Mettre à jour une réception
const updateReception = async (id, receptionData, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  await sequelize.query(
    `UPDATE stock
     SET date = :date,
         description = :description,
         part_id = :part_id,
         employe_id = :employe_id
     WHERE id = :id AND type = 1`,
    {
      replacements: {
        id,
        date: receptionData.date || null,
        description: receptionData.description || null,
        part_id: receptionData.part_id || null,
        employe_id: receptionData.contact_id || null
      }
    }
  );

  return await getReceptionById(id, sequelize);
};

// Supprimer une réception (soft delete: etat = 0)
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

  return { success: true, message: 'Réception supprimée avec succès' };
};

// Sauvegarder une ligne de détail dans stock_detail
const saveDetailStock = async (payload, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const {
    stock_id,
    article_id,
    quantite,
    prix,
    taux_tva,
    description,
    remise,
    remise_montant
  } = payload;

  const [result] = await sequelize.query(
    `INSERT INTO stock_detail (stock_id, article_id, quantite, prix, taux_tva, description, sens, remise, remise_montant , cr_date)
     OUTPUT INSERTED.id
     VALUES (:stock_id, :article_id, :quantite, :prix, :taux_tva, :description, 1, 0, :remise_montant, GETDATE())`,
    {
      replacements: {
        stock_id,
        article_id: article_id || null,
        quantite: quantite || 0,
        prix: prix || 0,
        taux_tva: taux_tva || 0,
        description: String(description || '').substring(0, 200),
        remise: remise !== null && remise !== undefined ? remise : null,
        remise_montant: remise_montant !== null && remise_montant !== undefined ? remise_montant : null
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

// Mettre à jour une ligne de détail dans stock_detail
const updateDetailStock = async (id, payload, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();
  const {
    article_id,
    quantite,
    prix,
    taux_tva,
    description,
    remise,
    remise_montant
  } = payload;

  await sequelize.query(
    `UPDATE stock_detail
     SET article_id = :article_id,
         quantite = :quantite,
         prix = :prix,
         taux_tva = :taux_tva,
         description = :description,
         remise = :remise,
         remise_montant = :remise_montant,
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
        remise_montant: remise_montant !== null && remise_montant !== undefined ? remise_montant : null
      }
    }
  );
};

// Sauvegarder les lignes de détail d'une réception (traitement en lot)
const saveDetailLines = async (lignes, sequelizeConnection = null) => {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return [];
  }

  const sequelize = sequelizeConnection || getConnection();
  const results = [];

  for (const ligne of lignes) {
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
      
      // Détecter le mode de remise
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
        remise: remiseFraction,
        remise_montant: remiseMontant
      };

      if (ligne?.update_mode === 'U' && ligne?.id) {
        await updateDetailStock(ligne.id, payload, sequelize);
        results.push({ id: ligne.id, update_mode: 'U', success: true, remise_mode: detectedMode });
      } else if (ligne?.update_mode === 'D' && ligne?.id) {
        await deleteLignesParIds([ligne.id], sequelize);
        results.push({ id: ligne.id, update_mode: 'D', success: true, remise_mode: detectedMode });
      } else {
        const insertedId = await saveDetailStock(payload, sequelize);
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

// Supprimer des lignes de détail par IDs
const deleteLignesParIds = async (ligneIds, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  if (!Array.isArray(ligneIds) || ligneIds.length === 0) {
    throw new Error('IDs de lignes invalides pour la suppression');
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
  getReceptionById,
  updateReception,
  deleteReception,
  saveDetailLines,
  deleteLignesParIds
};


