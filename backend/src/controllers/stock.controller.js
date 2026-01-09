const stockService = require('../services/stock.service');

/**
 * Récupérer les achats non encore entrés en stock
 */
const getAchatsNonEntresStock = async (req, res) => {
  try {
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'date',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || ''
    };

    const result = await stockService.getAchatsNonEntresStock(options);
    res.json(result);
  } catch (err) {
    console.error('[getAchatsNonEntresStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer les détails d'un achat pour entrée en stock
 */
const getAchatDetailsForStock = async (req, res) => {
  try {
    const achatDocumentId = parseInt(req.params.achatDocumentId, 10);

    if (!achatDocumentId || isNaN(achatDocumentId)) {
      return res.status(400).json({ message: 'achatDocumentId est requis et doit être un nombre' });
    }

    const result = await stockService.getAchatDetailsForStock(achatDocumentId);
    res.json(result);
  } catch (err) {
    console.error('[getAchatDetailsForStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer les ventes facturées non encore sorties du stock
 */
const getVentesNonSortiesStock = async (req, res) => {
  try {
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'date',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || '',
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
      client: req.query.client || null
    };

    const result = await stockService.getVentesNonSortiesStock(options);
    res.json(result);
  } catch (err) {
    console.error('[getVentesNonSortiesStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer les détails d'une vente pour sortie de stock
 */
const getVenteDetailsForStock = async (req, res) => {
  try {
    const venteDocumentId = parseInt(req.params.venteDocumentId, 10);

    if (!venteDocumentId || isNaN(venteDocumentId)) {
      return res.status(400).json({ message: 'venteDocumentId est requis et doit être un nombre' });
    }

    const result = await stockService.getVenteDetailsForStock(venteDocumentId);
    res.json(result);
  } catch (err) {
    console.error('[getVenteDetailsForStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer les articles avec leur stock
 */
const getArticlesStock = async (req, res) => {
  try {
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'article_nom',
      orderDirection: req.query.orderDirection || 'ASC',
      search: req.query.search || ''
    };

    const result = await stockService.getArticlesStock(options);
    res.json(result);
  } catch (err) {
    console.error('[getArticlesStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer l'état détaillé du stock
 */
const getEtatStock = async (req, res) => {
  try {
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'article_nom',
      orderDirection: req.query.orderDirection || 'ASC',
      search: req.query.search || '',
      depotId: req.query.depotId || 1,
      stockMinimum: req.query.stockMinimum || null
    };

    const result = await stockService.getEtatStock(options);
    res.json(result);
  } catch (err) {
    console.error('[getEtatStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer la fiche de stock pour un article
 */
const getFicheStock = async (req, res) => {
  try {
    const articleId = parseInt(req.params.articleId, 10);

    if (!articleId || isNaN(articleId)) {
      return res.status(400).json({ message: 'articleId est requis et doit être un nombre' });
    }

    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 50,
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null
    };

    const result = await stockService.getFicheStock(articleId, options);
    if (!result.article) {
      return res.status(404).json({ message: 'Article non trouvé' });
    }

    res.json(result);
  } catch (err) {
    console.error('[getFicheStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer le chiffre d'affaires par article
 */
const getChiffreAffairesArticles = async (req, res) => {
  try {
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'chiffre_affaires',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || '',
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null
    };

    const result = await stockService.getChiffreAffairesArticles(options);
    res.json(result);
  } catch (err) {
    console.error('[getChiffreAffairesArticles] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer tous les documents de stock
 */
const getAllStockDocuments = async (req, res) => {
  try {
    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
      orderBy: req.query.orderBy || 'date',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || '',
      type: req.query.type || null
    };

    const result = await stockService.getAllStockDocuments(options);
    res.json(result);
  } catch (err) {
    console.error('[getAllStockDocuments] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Récupérer un document de stock par ID
 */
const getStockDocumentById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (!id || isNaN(id)) {
      return res.status(400).json({ message: 'ID est requis et doit être un nombre' });
    }

    const result = await stockService.getStockDocumentById(id);
    if (!result) {
      return res.status(404).json({ message: 'Document de stock non trouvé' });
    }

    res.json(result);
  } catch (err) {
    console.error('[getStockDocumentById] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Créer une entrée de stock depuis un achat
 */
const createEntreeStockFromAchat = async (req, res) => {
  try {
    const { achatDocumentId, details } = req.body;
    const utilisateurId = req.user?.id || 1; // Récupérer depuis le token d'authentification

    console.log('[createEntreeStockFromAchat] Reçu:', { achatDocumentId, detailsLength: details?.length, utilisateurId });

    if (!achatDocumentId || !Array.isArray(details) || details.length === 0) {
      console.log('[createEntreeStockFromAchat] Validation échouée:', { achatDocumentId, details, detailsIsArray: Array.isArray(details) });
      return res.status(400).json({
        message: 'achatDocumentId et details (tableau non vide) sont requis'
      });
    }

    console.log('[createEntreeStockFromAchat] Appel du service...');
    const result = await stockService.createEntreeStockFromAchat(achatDocumentId, details, utilisateurId);
    console.log('[createEntreeStockFromAchat] Succès:', result);
    res.status(201).json(result);
  } catch (err) {
    console.error('[createEntreeStockFromAchat] Erreur:', err);
    console.error('[createEntreeStockFromAchat] Stack:', err.stack);
    res.status(500).json({ message: err.message, stack: err.stack });
  }
};

/**
 * Créer une sortie de stock depuis une vente
 */
const createSortieStockFromVente = async (req, res) => {
  try {
    const { venteDocumentId, details } = req.body;
    const utilisateurId = req.user?.id || 1; // Récupérer depuis le token d'authentification

    console.log('[createSortieStockFromVente] Reçu:', { venteDocumentId, detailsLength: details?.length, utilisateurId });

    if (!venteDocumentId || !Array.isArray(details) || details.length === 0) {
      console.log('[createSortieStockFromVente] Validation échouée:', { venteDocumentId, details, detailsIsArray: Array.isArray(details) });
      return res.status(400).json({
        message: 'venteDocumentId et details (tableau non vide) sont requis'
      });
    }

    console.log('[createSortieStockFromVente] Appel du service...');
    const result = await stockService.createSortieStockFromVente(venteDocumentId, details, utilisateurId);
    console.log('[createSortieStockFromVente] Succès:', result);
    res.status(201).json(result);
  } catch (err) {
    console.error('[createSortieStockFromVente] Erreur:', err);
    console.error('[createSortieStockFromVente] Stack:', err.stack);
    res.status(500).json({ message: err.message, stack: err.stack });
  }
};

/**
 * Créer une sortie de stock
 */
const createSortieStock = async (req, res) => {
  try {
    const { details, description } = req.body;
    const utilisateurId = req.user?.id || 1; // Récupérer depuis le token d'authentification

    if (!Array.isArray(details) || details.length === 0) {
      return res.status(400).json({
        message: 'details (tableau non vide) est requis'
      });
    }

    const result = await stockService.createSortieStock(details, description, utilisateurId);
    res.status(201).json(result);
  } catch (err) {
    console.error('[createSortieStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Créer un inventaire
 */
const createInventaire = async (req, res) => {
  try {
    const { inventaireData, description } = req.body;
    const utilisateurId = req.user?.id || 1; // Récupérer depuis le token d'authentification

    if (!Array.isArray(inventaireData) || inventaireData.length === 0) {
      return res.status(400).json({
        message: 'inventaireData (tableau non vide) est requis'
      });
    }

    const result = await stockService.createInventaire(inventaireData, description, utilisateurId);
    res.status(201).json(result);
  } catch (err) {
    console.error('[createInventaire] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Exporter l'état de stock
 */
const exportEtatStock = async (req, res) => {
  try {
    const format = req.params.format?.toLowerCase();
    if (!['pdf', 'excel'].includes(format)) {
      return res.status(400).json({ message: 'Format non supporté. Utilisez pdf ou excel.' });
    }

    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 10000, // Grande page pour export complet
      orderBy: req.query.orderBy || 'article_nom',
      orderDirection: req.query.orderDirection || 'ASC',
      search: req.query.search || '',
      depotId: req.query.depotId || 1
    };

    const result = await stockService.getEtatStock(options);

    if (format === 'excel') {
      return exportEtatStockExcel(result.data, res);
    } else {
      return exportEtatStockPDF(result.data, res);
    }
  } catch (err) {
    console.error('[exportEtatStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Exporter la fiche de stock
 */
const exportFicheStock = async (req, res) => {
  try {
    const format = req.params.format?.toLowerCase();
    if (!['pdf', 'excel'].includes(format)) {
      return res.status(400).json({ message: 'Format non supporté. Utilisez pdf ou excel.' });
    }

    const articleId = parseInt(req.params.articleId, 10);
    if (!articleId || isNaN(articleId)) {
      return res.status(400).json({ message: 'articleId est requis et doit être un nombre' });
    }

    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 10000, // Grande page pour export complet
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null
    };

    const result = await stockService.getFicheStock(articleId, options);

    if (format === 'excel') {
      return exportFicheStockExcel(result.article, result.mouvements, res);
    } else {
      return exportFicheStockPDF(result.article, result.mouvements, res);
    }
  } catch (err) {
    console.error('[exportFicheStock] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Exporter le chiffre d'affaires par article
 */
const exportChiffreAffairesArticles = async (req, res) => {
  try {
    const format = req.params.format?.toLowerCase();
    if (!['pdf', 'excel'].includes(format)) {
      return res.status(400).json({ message: 'Format non supporté. Utilisez pdf ou excel.' });
    }

    const options = {
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 10000, // Grande page pour export complet
      orderBy: req.query.orderBy || 'chiffre_affaires',
      orderDirection: req.query.orderDirection || 'DESC',
      search: req.query.search || '',
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null
    };

    const result = await stockService.getChiffreAffairesArticles(options);

    if (format === 'excel') {
      return exportChiffreAffairesExcel(result.data, res);
    } else {
      return exportChiffreAffairesPDF(result.data, res);
    }
  } catch (err) {
    console.error('[exportChiffreAffairesArticles] Erreur:', err);
    res.status(500).json({ message: err.message });
  }
};

// Fonctions d'export Excel (utilisent un format CSV simple)
function exportEtatStockExcel(data, res) {
  const headers = ['Code Article', 'Nom Article', 'Catégorie', 'Unité', 'Stock Actuel', 'Prix Moyen', 'Valeur Stock', 'Stock Min', 'Stock Max'];

  const csvData = [
    headers,
    ...data.map(item => [
      item.article_cod,
      item.article_nom,
      item.categorie_nom || '',
      item.unite_nom || '',
      item.stock_actuel,
      item.prix_moyen,
      item.valeur_stock,
      item.stock_minimum || 0,
      item.stock_maximum || 0
    ])
  ];

  const csvContent = csvData.map(row =>
    row.map(cell => {
      if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="etat-stock-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send('\ufeff' + csvContent); // BOM pour Excel
}

function exportFicheStockExcel(articleInfo, mouvements, res) {
  const headers = ['Date', 'Type', 'Document', 'Description', 'Entrée', 'Sortie', 'Stock Final', 'Prix Unit.', 'Valeur', 'Partenaire'];

  const csvData = [
    [`Fiche de Stock - ${articleInfo.article_cod} - ${articleInfo.article_nom}`],
    ['Stock actuel', articleInfo.stock_actuel],
    ['Catégorie', articleInfo.categorie_nom || ''],
    ['Unité', articleInfo.unite_nom || ''],
    [], // Ligne vide
    headers,
    ...mouvements.map(mvt => [
      new Date(mvt.date_mouvement).toLocaleDateString('fr-FR'),
      mvt.type_mouvement,
      mvt.numero_document,
      mvt.description,
      mvt.quantite_entree || '',
      mvt.quantite_sortie || '',
      mvt.stock_apres_mouvement,
      mvt.prix_unitaire,
      mvt.valeur_mouvement,
      mvt.partenaire_nom || ''
    ])
  ];

  const csvContent = csvData.map(row =>
    row.map(cell => {
      if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fiche-stock-${articleInfo.article_cod}-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send('\ufeff' + csvContent);
}

function exportChiffreAffairesExcel(data, res) {
  const headers = ['Code Article', 'Nom Article', 'Catégorie', 'Qté Vendue', 'Chiffre d\'Affaires', 'Prix Moyen', 'Marge Moyenne (%)'];

  const csvData = [
    headers,
    ...data.map(item => [
      item.article_cod,
      item.article_nom,
      item.categorie_nom || '',
      item.quantite_vendue,
      item.chiffre_affaires,
      item.prix_moyen_vente,
      item.marge_moyenne
    ])
  ];

  const csvContent = csvData.map(row =>
    row.map(cell => {
      if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="chiffre-affaires-articles-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send('\ufeff' + csvContent);
}

// Fonctions d'export PDF (génèrent du HTML imprimable)
function exportEtatStockPDF(data, res) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>État de Stock</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #007bff; text-align: center; margin-bottom: 30px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .text-end { text-align: right; }
        .badge { padding: 2px 6px; border-radius: 3px; font-size: 0.8em; }
        .bg-success { background-color: #d1edff; color: #0d6efd; }
        .bg-warning { background-color: #fff3cd; color: #856404; }
        .bg-danger { background-color: #f8d7da; color: #721c24; }
        @page { margin: 1cm; }
      </style>
    </head>
    <body>
      <h1>État de Stock - ${new Date().toLocaleDateString('fr-FR')}</h1>
      <table>
        <thead>
          <tr>
            <th>Code Article</th>
            <th>Nom Article</th>
            <th>Catégorie</th>
            <th>Unité</th>
            <th class="text-end">Stock Actuel</th>
            <th class="text-end">Prix Moyen</th>
            <th class="text-end">Valeur Stock</th>
            <th class="text-end">Stock Min</th>
            <th class="text-end">Stock Max</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(article => `
            <tr>
              <td>${article.article_cod}</td>
              <td>${article.article_nom}</td>
              <td>${article.categorie_nom || '-'}</td>
              <td>${article.unite_nom || '-'}</td>
              <td class="text-end">
                <span class="badge ${article.stock_actuel <= article.stock_minimum ? 'bg-warning' : article.stock_actuel <= 0 ? 'bg-danger' : 'bg-success'}">
                  ${Number(article.stock_actuel).toFixed(2)}
                </span>
              </td>
              <td class="text-end">${Number(article.prix_moyen).toFixed(2)} €</td>
              <td class="text-end"><strong>${Number(article.valeur_stock).toFixed(2)} €</strong></td>
              <td class="text-end">${article.stock_minimum || 0}</td>
              <td class="text-end">${article.stock_maximum || 0}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="etat-stock-${new Date().toISOString().split('T')[0]}.html"`);
  res.send(htmlContent);
}

function exportFicheStockPDF(articleInfo, mouvements, res) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Fiche de Stock - ${articleInfo.article_cod}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #007bff; text-align: center; margin-bottom: 30px; }
        .article-info { background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 11px; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .text-end { text-align: right; }
        .text-success { color: #198754; font-weight: bold; }
        .text-danger { color: #dc3545; font-weight: bold; }
        @page { margin: 1cm; }
      </style>
    </head>
    <body>
      <h1>Fiche de Stock</h1>
      <div class="article-info">
        <h3>${articleInfo.article_cod} - ${articleInfo.article_nom}</h3>
        <p><strong>Stock actuel:</strong> ${Number(articleInfo.stock_actuel).toFixed(2)}</p>
        <p><strong>Catégorie:</strong> ${articleInfo.categorie_nom || '-'}</p>
        <p><strong>Unité:</strong> ${articleInfo.unite_nom || '-'}</p>
        <p><strong>Total mouvements:</strong> ${mouvements.length}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Document</th>
            <th>Description</th>
            <th class="text-end">Entrée</th>
            <th class="text-end">Sortie</th>
            <th class="text-end">Stock Final</th>
            <th class="text-end">Prix Unit.</th>
            <th class="text-end">Valeur</th>
            <th>Partenaire</th>
          </tr>
        </thead>
        <tbody>
          ${mouvements.map(mvt => `
            <tr>
              <td>${new Date(mvt.date_mouvement).toLocaleDateString('fr-FR')}</td>
              <td>${mvt.type_mouvement}</td>
              <td>${mvt.numero_document}</td>
              <td>${mvt.description}</td>
              <td class="text-end text-success">${mvt.quantite_entree > 0 ? '+' + Number(mvt.quantite_entree).toFixed(2) : ''}</td>
              <td class="text-end text-danger">${mvt.quantite_sortie > 0 ? '-' + Number(mvt.quantite_sortie).toFixed(2) : ''}</td>
              <td class="text-end"><strong>${Number(mvt.stock_apres_mouvement).toFixed(2)}</strong></td>
              <td class="text-end">${Number(mvt.prix_unitaire).toFixed(2)} €</td>
              <td class="text-end">${Number(mvt.valeur_mouvement).toFixed(2)} €</td>
              <td>${mvt.partenaire_nom || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fiche-stock-${articleInfo.article_cod}-${new Date().toISOString().split('T')[0]}.html"`);
  res.send(htmlContent);
}

function exportChiffreAffairesPDF(data, res) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Chiffre d'Affaires par Article</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #007bff; text-align: center; margin-bottom: 30px; }
        .periode { text-align: center; color: #6c757d; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .text-end { text-align: right; }
        .badge { padding: 2px 6px; border-radius: 3px; font-size: 0.8em; }
        .bg-success { background-color: #d1edff; color: #0d6efd; }
        .bg-warning { background-color: #fff3cd; color: #856404; }
        .bg-danger { background-color: #f8d7da; color: #721c24; }
        @page { margin: 1cm; }
      </style>
    </head>
    <body>
      <h1>Chiffre d'Affaires par Article</h1>
      <div class="periode">Généré le ${new Date().toLocaleDateString('fr-FR')}</div>
      <table>
        <thead>
          <tr>
            <th>Code Article</th>
            <th>Nom Article</th>
            <th>Catégorie</th>
            <th class="text-end">Qté Vendue</th>
            <th class="text-end">Chiffre d'Affaires</th>
            <th class="text-end">Prix Moyen</th>
            <th class="text-end">Marge Moyenne</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(article => `
            <tr>
              <td>${article.article_cod}</td>
              <td>${article.article_nom}</td>
              <td>${article.categorie_nom || '-'}</td>
              <td class="text-end">${Number(article.quantite_vendue).toFixed(2)}</td>
              <td class="text-end"><strong>${Number(article.chiffre_affaires).toFixed(2)} €</strong></td>
              <td class="text-end">${Number(article.prix_moyen_vente).toFixed(2)} €</td>
              <td class="text-end">
                <span class="badge ${article.marge_moyenne >= 20 ? 'bg-success' : article.marge_moyenne >= 10 ? 'bg-warning' : 'bg-danger'}">
                  ${Number(article.marge_moyenne).toFixed(1)}%
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="chiffre-affaires-articles-${new Date().toISOString().split('T')[0]}.html"`);
  res.send(htmlContent);
}

module.exports = {
  getAchatsNonEntresStock,
  getAchatDetailsForStock,
  getVentesNonSortiesStock,
  getVenteDetailsForStock,
  getArticlesStock,
  getEtatStock,
  getFicheStock,
  getChiffreAffairesArticles,
  exportEtatStock,
  exportFicheStock,
  exportChiffreAffairesArticles,
  getAllStockDocuments,
  getStockDocumentById,
  createEntreeStockFromAchat,
  createSortieStockFromVente,
  createSortieStock,
  createInventaire
};

