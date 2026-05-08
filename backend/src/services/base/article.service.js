// services/clientService.js
const articleModel = require('../../models/base/article.model');

// Obtenir tous les article
const getArticles = async (sequelizeConnection = null) => {
  return await articleModel.getAllArticle(sequelizeConnection);
};

// Obtenir un article par ID
const getArticle = async (article_id, sequelizeConnection = null) => {
  const article = await articleModel.getArticleById(article_id, sequelizeConnection);
  if (!article) {
    throw new Error('article non trouvé');
  }
  return article;
};

// Créer un nouveau article
const createArticle = async (articleData, sequelizeConnection = null) => {
  const article_id = await articleModel.addArticle(articleData, sequelizeConnection);
  return { article_id, ...articleData };
};

// Modifier un article existant
const editArticle = async (article_id, articleData, sequelizeConnection = null) => {
  const article = await articleModel.getArticleById(article_id, sequelizeConnection);
  if (!article) {
    throw new Error('article à modifier non trouvé');
  }
  return await articleModel.updatArticle(article_id, articleData, sequelizeConnection);
};

// supprimé un article existant
const deleteArticle = async (article_id, sequelizeConnection = null) => {
  const article = await articleModel.getArticleById(article_id, sequelizeConnection);
  if (!article) {
    throw new Error('article non trouvé');
  }
  await articleModel.deleteArticle(article_id, sequelizeConnection);
  return { message: 'article supprimé avec succès' };
};

// Archiver un article
const archiveArticle = async (article_id, sequelizeConnection = null) => {
  const article = await articleModel.getArticleById(article_id, sequelizeConnection);
  if (!article) {
    throw new Error('article non trouvé');
  }
  await articleModel.archiveArticle(article_id, sequelizeConnection);
  return { message: 'article archivé avec succès' };
};

// Récupérer les articles paginés
const getArticlesPaged = async (options = {}, sequelizeConnection = null) => {
  return await articleModel.getArticlesPaged(options, sequelizeConnection);
};

const getArticleStockDisponible = async (article_id, sequelizeConnection = null) => {
  return await articleModel.getStockDisponibleByArticleId(article_id, sequelizeConnection);
};

const buildArticleRecommendations = (stats = {}) => {
  const recommendations = [];
  const stockDisponible = Number(stats?.article?.stock_disponible || 0);
  const quantitySold = Number(stats?.sales?.quantity_sold || 0);
  const monthlySales = Array.isArray(stats?.charts?.monthly_sales) ? stats.charts.monthly_sales : [];
  const suppliers = Array.isArray(stats?.suppliers) ? stats.suppliers : [];
  const avgMonthlyQty = monthlySales.length > 0
    ? monthlySales.reduce((sum, row) => sum + Number(row?.quantity_sold || 0), 0) / monthlySales.length
    : 0;
  const marginRate = Number(stats?.margin?.margin_rate || 0);
  const latestMonthRevenue = monthlySales.length > 0 ? Number(monthlySales[monthlySales.length - 1]?.revenue_ht || 0) : 0;
  const previousMonthRevenue = monthlySales.length > 1 ? Number(monthlySales[monthlySales.length - 2]?.revenue_ht || 0) : 0;

  if (quantitySold <= 0) {
    recommendations.push({
      tone: 'warning',
      title: 'Relancer la demande',
      message: 'Aucune vente détectée sur cet article. Vérifiez le positionnement prix, la visibilité commerciale et les clients cibles.'
    });
  }

  if (marginRate > 0 && marginRate < 15) {
    recommendations.push({
      tone: 'alert',
      title: 'Marge faible',
      message: `La marge estimée reste limitée (${marginRate.toFixed(1)}%). Renégociez le coût fournisseur ou revoyez le prix de vente.`
    });
  }

  if (avgMonthlyQty > 0 && stockDisponible > avgMonthlyQty * 3) {
    recommendations.push({
      tone: 'info',
      title: 'Stock élevé',
      message: 'Le stock disponible couvre largement plusieurs mois de vente. Une offre ciblée ou une mise en avant peut accélérer la rotation.'
    });
  }

  if (avgMonthlyQty > 0 && stockDisponible < avgMonthlyQty) {
    recommendations.push({
      tone: 'positive',
      title: 'Réapprovisionnement à anticiper',
      message: 'Le stock disponible devient inférieur au rythme moyen de sortie. Préparez un réapprovisionnement pour éviter une rupture.'
    });
  }

  if (suppliers.length <= 1) {
    recommendations.push({
      tone: 'info',
      title: 'Diversifier les fournisseurs',
      message: 'L’article dépend d’un nombre limité de fournisseurs. Ajouter une seconde source réduit le risque d’approvisionnement.'
    });
  }

  if (previousMonthRevenue > 0 && latestMonthRevenue < previousMonthRevenue * 0.7) {
    recommendations.push({
      tone: 'warning',
      title: 'Tendance en baisse',
      message: 'Le chiffre d’affaires du dernier mois est en retrait. Vérifiez la disponibilité, la concurrence et les relances client.'
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      tone: 'positive',
      title: 'Performance stable',
      message: 'L’article présente des indicateurs équilibrés. Continuez le suivi de marge et gardez le rythme de rotation actuel.'
    });
  }

  return recommendations.slice(0, 4);
};

const getArticleStatistics = async (article_id, sequelizeConnection = null) => {
  const stats = await articleModel.getArticleStatistics(article_id, sequelizeConnection);
  if (!stats) {
    throw new Error('article non trouvé');
  }

  return {
    ...stats,
    recommendations: buildArticleRecommendations(stats)
  };
};

module.exports = {
  getArticles,
  getArticlesPaged,
  getArticleStockDisponible,
  getArticleStatistics,
  deleteArticle,
  createArticle,
  editArticle,
  getArticle,
  archiveArticle
};
