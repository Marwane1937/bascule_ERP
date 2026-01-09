const { getConnection } = require('../../config/database');

/**
 * Récupérer toutes les interventions avec pagination
 */
const getAllInterventions = async (options = {}) => {
  const sequelize = getConnection();
  try {
    const {
      page = 1,
      pageSize = 25,
      orderBy = 'date',
      orderDirection = 'DESC',
      search = '',
      etat = null,
      employe_id = null,
      part_id = null,
      dateFrom = null,
      dateTo = null
    } = options;

    const safePage = parseInt(page) || 1;
    const safePageSize = parseInt(pageSize) || 25;
    const offset = (safePage - 1) * safePageSize;

    // Mapper les colonnes de tri vers les colonnes réelles de la table
    const columnMapping = {
      'technicien': 'employe_id',
      'client': 'part_id',
      'technicien_nom': 'employe_id',
      'client_nom': 'part_id',
      'id': 'id',
      'numero': 'numero',
      'date': 'date',
      'description': 'description',
      'etat': 'etat'
    };
    const mappedOrderBy = columnMapping[orderBy] || 'date';
    const safeOrderBy = mappedOrderBy;
    const safeOrderDirection = orderDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let whereConditions = [];
    const replacements = {};

    if (search && search.trim()) {
      whereConditions.push(`(
        i.numero LIKE :search
        OR e.prenom + ' ' + e.nom LIKE :search
        OR p.nom LIKE :search
        OR i.description LIKE :search
      )`);
      replacements.search = `%${search.trim()}%`;
    }

    if (etat) {
      whereConditions.push('i.etat = :etat');
      replacements.etat = etat;
    }

    if (employe_id) {
      whereConditions.push('i.employe_id = :employe_id');
      replacements.employe_id = employe_id;
    }

    if (part_id) {
      whereConditions.push('i.part_id = :part_id');
      replacements.part_id = part_id;
    }

    if (dateFrom) {
      whereConditions.push('i.date >= :dateFrom');
      replacements.dateFrom = dateFrom;
    }

    if (dateTo) {
      whereConditions.push('i.date <= :dateTo');
      replacements.dateTo = dateTo;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT
        pr.id,
        pr.numero,
        pr.date,
        pr.description,
        pr.etat,
        pr.cr_date,
        e.prenom + ' ' + e.nom AS technicien,
        p.nom AS client,
        COALESCE(SUM(idt.quantite * idt.prix), 0) AS total_cout,
        COUNT(idt.id) AS reparations_count,
        pr.total_count
      FROM (
        SELECT
          i.id,
          i.numero,
          i.date,
          i.description,
          i.etat,
          i.cr_date,
          i.employe_id,
          i.part_id,
          COUNT(*) OVER() AS total_count,
          ROW_NUMBER() OVER (ORDER BY i.${safeOrderBy} ${safeOrderDirection}) AS RowNum
        FROM intervention i
        ${whereClause}
      ) AS pr
      LEFT JOIN partenaire p ON p.part_id = pr.part_id
      LEFT JOIN employe e ON e.id = pr.employe_id
      LEFT JOIN intervention_detail idt ON idt.intervention_id = pr.id
      WHERE pr.RowNum > ${offset} AND pr.RowNum <= ${offset + safePageSize}
      GROUP BY pr.id, pr.numero, pr.date, pr.description, pr.etat, pr.cr_date,
               e.prenom + ' ' + e.nom, p.nom, pr.total_count, pr.RowNum
      ORDER BY pr.RowNum
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

      if (results.length > 0) {
        total = parseInt(results[0].total_count) || 0;
        results = results.map(({ total_count, ...rest }) => rest);
      }
    } catch (dataError) {
      console.error('[getAllInterventions] Erreur:', dataError.message);
      throw new Error(`Erreur lors de la récupération des interventions: ${dataError.message || 'Erreur inconnue'}`);
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
    console.error('[getAllInterventions] Erreur:', error.message);
    throw error;
  }
};

/**
 * Récupérer une intervention par ID
 */
const getInterventionById = async (id) => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT
        i.id,
        i.numero,
        i.date,
        i.description,
        i.etat,
        i.cr_date,
        e.id AS employe_id,
        e.prenom + ' ' + e.nom AS technicien_nom,
        e.telegram_id AS technicien_telegram_id,
        p.part_id AS partenaire_id,
        p.nom AS client_nom
      FROM intervention i
      INNER JOIN employe e ON e.id = i.employe_id
      INNER JOIN partenaire p ON p.part_id = i.part_id
      WHERE i.id = :id
    `;

    const results = await sequelize.query(query, {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    });

    if (Array.isArray(results) && results.length > 0) {
      const intervention = results[0];

      // Récupérer les détails avec les rubriques
      const detailsQuery = `
        SELECT 
              i.date, 
			  p.nom as client ,
			  e.prenom+' '+e.nom as technicien,
              idt.quantite, 
              idt.prix, 
              idt.description, 
              r.nom AS rubrique_nom, 
              (idt.quantite * idt.prix) AS total_ligne 
            FROM intervention i 
			inner join intervention_detail idt on i.id = idt.intervention_id
			inner join partenaire p on p.part_id = i.part_id
			inner join employe e on i.employe_id = e.id
            LEFT JOIN listes r ON r.id = idt.rubrique_id and r.group_id = 5000
        WHERE idt.intervention_id = :interventionId
        ORDER BY idt.ligne, idt.id
      `;

      const details = await sequelize.query(detailsQuery, {
        replacements: { interventionId: id },
        type: sequelize.QueryTypes.SELECT
      });

      return {
        ...intervention,
        details: Array.isArray(details) ? details : []
      };
    }

    return null;
  } catch (error) {
    console.error('[getInterventionById] Erreur:', error);
    throw error;
  }
};

/**
 * Créer une nouvelle intervention
 */
const createIntervention = async (data) => {
  const sequelize = getConnection();
  return await sequelize.transaction(async (t) => {
    try {
      const {
        numero,
        date,
        employe_id,
        part_id,
        description,
        etat = 'EN_COURS',
        type = 'MAINTENANCE',
        details = [],
      } = data;

      // Ne pas générer de numéro, laisser NULL (la base gère l'auto-incrémentation)
      let finalNumero = null;

      // Insérer l'intervention
      const insertQuery = `
        INSERT INTO intervention (
          numero, date, description, employe_id, part_id,
          type, etat, cr_date
        )
        OUTPUT INSERTED.id
        VALUES (
          :numero, :date, :description, :employe_id, :part_id,
          :type, :etat, GETDATE()
        )
      `;

      const [insertResult] = await sequelize.query(insertQuery, {
        replacements: {
          numero: finalNumero,
          date: date || new Date(),
          description: description || '',
          employe_id,
          part_id,
          type,
          etat
        },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      });

      const interventionId = insertResult.id;

      // Insérer les détails si fournis
      if (details && details.length > 0) {
        const detailsQuery = `
          INSERT INTO intervention_detail (
            intervention_id, rubrique_id, quantite, prix, ligne, cr_date
          )
          VALUES (
            :intervention_id, :rubrique_id, :quantite, :prix, :ligne, GETDATE()
          )
        `;

        for (const detail of details) {
          await sequelize.query(detailsQuery, {
            replacements: {
              intervention_id: interventionId,
              rubrique_id: detail.rubrique_id,
              quantite: detail.quantite || 1,
              prix: detail.prix || 0,
              ligne: detail.ligne || 1
            },
            type: sequelize.QueryTypes.INSERT,
            transaction: t
          });
        }
      }

      return {
        id: interventionId,
        numero: finalNumero,
        message: 'Intervention créée avec succès'
      };

    } catch (error) {
      console.error('[createIntervention] Erreur:', error);
      throw error;
    }
  });
};

/**
 * Créer une intervention depuis Telegram
 */
const createInterventionFromTelegram = async (telegramUserId, pdfText, sequelizeConnection = null) => {
  const sequelize = sequelizeConnection || getConnection();

  return await sequelize.transaction(async (t) => {
    try {
      // Parser les données du PDF
      const parsedData = parseInterventionFromPDF(pdfText);

      // Trouver le technicien par telegram_id
      const technicienQuery = `
        SELECT id, prenom + ' ' + nom AS nom_complet
        FROM employe
        WHERE telegram_id = :telegramUserId AND etat = 1
      `;

      const [technicien] = await sequelize.query(technicienQuery, {
        replacements: { telegramUserId: telegramUserId.toString() },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      });

      if (!technicien) {
        throw new Error('Technicien non trouvé ou non autorisé');
      }

      // Trouver le partenaire (client)
      const partenaireQuery = `
        SELECT part_id, nom
        FROM partenaire
        WHERE nom LIKE :partenaireName AND etat = 1
      `;

      const [partenaire] = await sequelize.query(partenaireQuery, {
        replacements: { partenaireName: `%${parsedData.client}%` },
        type: sequelize.QueryTypes.SELECT,
        transaction: t
      });

      if (!partenaire) {
        throw new Error(`Partenaire "${parsedData.client}" non trouvé`);
      }

      // Créer l'intervention
      const interventionData = {
        date: parsedData.date ? parseDate(parsedData.date) : new Date(),
        employe_id: technicien.id,
        part_id: partenaire.part_id,
        description: `Intervention créée depuis Telegram par ${technicien.nom_complet}`,
        etat: 'TERMINEE',
        type: 'MAINTENANCE',
        details: parsedData.reparations.map(rep => ({
          description: rep.description,
          quantite: 1,
          prix: rep.cout || 0,
          taux_tva: 20,
          remise: 0
        }))
      };

      return await createIntervention(interventionData);

    } catch (error) {
      console.error('[createInterventionFromTelegram] Erreur:', error);
      throw error;
    }
  });
};

/**
 * Générer un numéro d'intervention
 */
const generateInterventionNumero = async (sequelize, transaction = null) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const month = (new Date().getMonth() + 1).toString().padStart(2, '0');

  const query = `
    SELECT COUNT(*) as count
    FROM intervention
    WHERE numero LIKE 'INT${year}${month}%'
  `;

  const [result] = await sequelize.query(query, {
    type: sequelize.QueryTypes.SELECT,
    transaction
  });

  const count = parseInt(result.count) + 1;
  return `INT${year}${month}${count.toString().padStart(4, '0')}`;
};

/**
 * Parser les données d'intervention depuis le texte PDF
 */
const parseInterventionFromPDF = (text) => {
  const data = {
    technicien: '',
    client: '',
    date: '',
    reparations: []
  };

  // Extraire le technicien
  const technicienMatch = text.match(/Technicien\s*:\s*([^\n]+)/i);
  if (technicienMatch) data.technicien = technicienMatch[1].trim();

  // Extraire le client
  const clientMatch = text.match(/Client\s*:\s*([^\n]+)/i);
  if (clientMatch) data.client = clientMatch[1].trim();

  // Extraire la date
  const dateMatch = text.match(/Date\s*:\s*([^\n]+)/i);
  if (dateMatch) data.date = dateMatch[1].trim();

  // Extraire les réparations
  const lines = text.split('\n');
  const reparationsSection = false;

  for (const line of lines) {
    // Détecter le début de la section réparations
    if (line.toLowerCase().includes('réparation') || line.toLowerCase().includes('intervention')) {
      // Les prochaines lignes peuvent contenir des réparations
      continue;
    }

    // Regex pour détecter une ligne de réparation
    const reparationRegex = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:€|EUR)?\s*(.+)?$/i;
    const match = line.match(reparationRegex);

    if (match) {
      data.reparations.push({
        description: match[1].trim(),
        cout: parseFloat(match[2].replace(',', '.')),
        notes: match[3] ? match[3].trim() : ''
      });
    }
  }

  return data;
};

/**
 * Parser une date
 */
const parseDate = (dateStr) => {
  if (!dateStr) return new Date();

  // Format DD/MM/YYYY
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/');
    return new Date(`${year}-${month}-${day}`);
  }

  return new Date(dateStr);
};

/**
 * Mettre à jour une intervention
 */
const updateIntervention = async (id, data) => {
  const sequelize = getConnection();
  return await sequelize.transaction(async (t) => {
    try {
      const updateQuery = `
        UPDATE intervention
        SET date = :date,
            employe_id = :employe_id,
            part_id = :part_id,
            description = :description
        WHERE id = :id
      `;

      await sequelize.query(updateQuery, {
        replacements: {
          id,
          date: data.date,
          employe_id: data.employe_id,
          part_id: data.part_id,
          description: data.description,
          etat: data.etat,
          type: data.type
        },
        type: sequelize.QueryTypes.UPDATE,
        transaction: t
      });

      return { success: true, message: 'Intervention mise à jour avec succès' };

    } catch (error) {
      console.error('[updateIntervention] Erreur:', error);
      throw error;
    }
  });
};

/**
 * Supprimer une intervention
 */
const deleteIntervention = async (id) => {
  const sequelize = getConnection();
  return await sequelize.transaction(async (t) => {
    try {
      // Supprimer les détails d'abord
      await sequelize.query(
        'DELETE FROM intervention_detail WHERE intervention_id = :id',
        {
          replacements: { id },
          type: sequelize.QueryTypes.DELETE,
          transaction: t
        }
      );

      // Supprimer l'intervention
      await sequelize.query(
        'DELETE FROM intervention WHERE id = :id',
        {
          replacements: { id },
          type: sequelize.QueryTypes.DELETE,
          transaction: t
        }
      );

      return { success: true, message: 'Intervention supprimée avec succès' };

    } catch (error) {
      console.error('[deleteIntervention] Erreur:', error);
      throw error;
    }
  });
};

module.exports = {
  getAllInterventions,
  getInterventionById,
  createIntervention,
  createInterventionFromTelegram,
  updateIntervention,
  deleteIntervention,
  parseInterventionFromPDF,
  generateInterventionNumero
};
