const { getConnection } = require('../../config/database');

/**
 * Récupérer les détails d'une intervention
 */
const getInterventionDetails = async (interventionId) => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT
        id,
        intervention_id,
        description_reparation,
        cout_main_oeuvre,
        cout_pieces,
        temps_estime,
        date_creation
      FROM intervention_detail
      WHERE intervention_id = :interventionId
      ORDER BY date_creation
    `;

    const results = await sequelize.query(query, {
      replacements: { interventionId },
      type: sequelize.QueryTypes.SELECT
    });

    return Array.isArray(results) ? results : [];
  } catch (error) {
    console.error('[getInterventionDetails] Erreur:', error);
    throw error;
  }
};

/**
 * Ajouter un détail à une intervention
 */
const addInterventionDetail = async (interventionId, detailData) => {
  const sequelize = getConnection();
  try {
    const query = `
      INSERT INTO intervention_detail (
        intervention_id, description_reparation, cout_main_oeuvre,
        cout_pieces, temps_estime, date_creation
      )
      OUTPUT INSERTED.id
      VALUES (
        :intervention_id, :description_reparation, :cout_main_oeuvre,
        :cout_pieces, :temps_estime, GETDATE()
      )
    `;

    const [result] = await sequelize.query(query, {
      replacements: {
        intervention_id: interventionId,
        description_reparation: detailData.description_reparation,
        cout_main_oeuvre: detailData.cout_main_oeuvre || 0,
        cout_pieces: detailData.cout_pieces || 0,
        temps_estime: detailData.temps_estime || null
      },
      type: sequelize.QueryTypes.SELECT
    });

    return {
      id: result.id,
      message: 'Détail ajouté avec succès'
    };
  } catch (error) {
    console.error('[addInterventionDetail] Erreur:', error);
    throw error;
  }
};

/**
 * Mettre à jour un détail d'intervention
 */
const updateInterventionDetail = async (id, detailData) => {
  const sequelize = getConnection();
  try {
    const query = `
      UPDATE intervention_detail
      SET description_reparation = :description_reparation,
          cout_main_oeuvre = :cout_main_oeuvre,
          cout_pieces = :cout_pieces,
          temps_estime = :temps_estime
      WHERE id = :id
    `;

    await sequelize.query(query, {
      replacements: {
        id,
        description_reparation: detailData.description_reparation,
        cout_main_oeuvre: detailData.cout_main_oeuvre || 0,
        cout_pieces: detailData.cout_pieces || 0,
        temps_estime: detailData.temps_estime || null
      },
      type: sequelize.QueryTypes.UPDATE
    });

    return { success: true, message: 'Détail mis à jour avec succès' };
  } catch (error) {
    console.error('[updateInterventionDetail] Erreur:', error);
    throw error;
  }
};

/**
 * Supprimer un détail d'intervention
 */
const deleteInterventionDetail = async (id) => {
  const sequelize = getConnection();
  try {
    await sequelize.query(
      'DELETE FROM intervention_detail WHERE id = :id',
      {
        replacements: { id },
        type: sequelize.QueryTypes.DELETE
      }
    );

    return { success: true, message: 'Détail supprimé avec succès' };
  } catch (error) {
    console.error('[deleteInterventionDetail] Erreur:', error);
    throw error;
  }
};

/**
 * Récupérer les statistiques des détails d'intervention
 */
const getInterventionDetailsStats = async (interventionId) => {
  const sequelize = getConnection();
  try {
    const query = `
      SELECT
        COUNT(*) as total_reparations,
        SUM(cout_main_oeuvre) as total_main_oeuvre,
        SUM(cout_pieces) as total_pieces,
        SUM(cout_main_oeuvre + cout_pieces) as total_general,
        AVG(temps_estime) as temps_moyen
      FROM intervention_detail
      WHERE intervention_id = :interventionId
    `;

    const [result] = await sequelize.query(query, {
      replacements: { interventionId },
      type: sequelize.QueryTypes.SELECT
    });

    return {
      total_reparations: parseInt(result.total_reparations) || 0,
      total_main_oeuvre: parseFloat(result.total_main_oeuvre) || 0,
      total_pieces: parseFloat(result.total_pieces) || 0,
      total_general: parseFloat(result.total_general) || 0,
      temps_moyen: parseFloat(result.temps_moyen) || 0
    };
  } catch (error) {
    console.error('[getInterventionDetailsStats] Erreur:', error);
    throw error;
  }
};

module.exports = {
  getInterventionDetails,
  addInterventionDetail,
  updateInterventionDetail,
  deleteInterventionDetail,
  getInterventionDetailsStats
};
