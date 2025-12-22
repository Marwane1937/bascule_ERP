const facturationModel = require('../../models/ventes/facturation.model');

// Obtenir toutes les factures avec pagination
const getFactures = async (options = {}, sequelizeConnection = null) => {
  try {
    console.log('[getFactures Service] 🔍 Options reçues:', JSON.stringify(options, null, 2));
    const result = await facturationModel.getAllFactures(options, sequelizeConnection);
    console.log('[getFactures Service] 📊 Résultat du modèle:', JSON.stringify(result, null, 2));
    console.log('[getFactures Service] 📊 Nombre de factures dans result.data:', result?.data?.length || 0);
    return result;
  } catch (error) {
    console.error('[getFactures Service] ❌ Erreur dans getFactures service (pagination):', error);

    // Si la pagination échoue, essayer sans pagination comme fallback
    console.log('Tentative de récupération sans pagination comme fallback...');
    try {
      const allFactures = await facturationModel.getAllFacturesNoPagination(sequelizeConnection);
      const page = parseInt(options.page) || 1;
      const pageSize = parseInt(options.pageSize) || 25;

      // Faire la pagination manuellement côté serveur
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedData = Array.isArray(allFactures) ? allFactures.slice(startIndex, endIndex) : [];
      const total = Array.isArray(allFactures) ? allFactures.length : 0;

      return {
        data: paginatedData,
        pagination: {
          page: page,
          pageSize: pageSize,
          total: total,
          totalPages: Math.ceil(total / pageSize)
        }
      };
    } catch (fallbackError) {
      console.error('Erreur même sans pagination:', fallbackError);

      // Vérifier si c'est une erreur liée à la vue
      const errorMessage = fallbackError.message || fallbackError.toString();
      if (errorMessage.includes('v_facture') || errorMessage.includes('Invalid object name')) {
        console.error('❌ La vue v_facture n\'existe pas dans la base de données.');
        console.error('📝 Veuillez créer la vue v_facture avec la requête SQL fournie initialement.');
      }

      // Retourner un format cohérent même en cas d'erreur totale
      return {
        data: [],
        pagination: {
          page: options.page || 1,
          pageSize: options.pageSize || 25,
          total: 0,
          totalPages: 0
        }
      };
    }
  }
};

// Obtenir une facture par ID
const getFacture = async (id, sequelizeConnection = null) => {
  const facture = await facturationModel.getFactureById(id, sequelizeConnection);
  if (!facture) {
    throw new Error('Facture non trouvée');
  }
  return facture;
};

// Obtenir le rapport de facturation
const getFacturationReport = async (options = {}, sequelizeConnection = null) => {
  try {
    const report = await facturationModel.getFacturationReport(options, sequelizeConnection);
    return report;
  } catch (error) {
    console.error('[getFacturationReport Service] ❌ Erreur:', error);
    throw error;
  }
};

// Obtenir les montants HT et TVA d'une facture depuis v_facture_montant
const getFactureMontant = async (factureId, sequelizeConnection = null) => {
  try {
    const montant = await facturationModel.getFactureMontant(factureId, sequelizeConnection);
    return montant;
  } catch (error) {
    console.error('[getFactureMontant Service] ❌ Erreur:', error);
    throw error;
  }
};

module.exports = {
  getFactures,
  getFacture,
  getFacturationReport,
  getFactureMontant
};
