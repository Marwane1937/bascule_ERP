const { getConnection } = require('../config/database');

// Récupérer les données d'une facture depuis v_facture_report pour le PDF
const getFactureReportById = async (facture_id) => {
  const sequelize = getConnection();
  try {
    const query = `SELECT * FROM v_facture_report WHERE facture_id = :facture_id`;
    
    const results = await sequelize.query(query, {
      replacements: { facture_id },
      type: sequelize.QueryTypes.SELECT
    });
    
    if (results && results.length > 0) {
      return results[0];
    }
    
    return null;
  } catch (error) {
    console.error('[getFactureReportById] Erreur:', error);
    throw error;
  }
};

module.exports = {
  getFactureReportById
};

