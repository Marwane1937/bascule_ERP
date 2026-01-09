import { Component, OnInit } from '@angular/core';
import { StockService } from 'src/app/service/stock.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-stock-reporting',
  templateUrl: './stock-reporting.component.html',
  styleUrls: ['./stock-reporting.component.css']
})
export class StockReportingComponent implements OnInit {
  activeTab: string = 'etat-stock';

  // État de stock
  etatStock: any[] = [];
  etatStockLoading: boolean = false;
  etatStockSearchTerm: string = '';
  etatStockCurrentPage: number = 1;
  etatStockPageSize: number = 25;
  etatStockTotalRecords: number = 0;
  etatStockTotalPages: number = 0;
  etatStockSortColumn: string = 'article_nom';
  etatStockSortDirection: 'ASC' | 'DESC' = 'ASC';
  etatStockDepotId: number = 1;

  // Fiche de stock
  ficheStock: any = null;
  ficheStockLoading: boolean = false;
  ficheStockArticleId: number = 0;
  ficheStockArticleInfo: any = null;
  ficheStockMouvements: any[] = [];
  ficheStockCurrentPage: number = 1;
  ficheStockPageSize: number = 50;
  ficheStockTotalRecords: number = 0;
  ficheStockTotalPages: number = 0;
  ficheStockDateFrom: string = '';
  ficheStockDateTo: string = '';

  // Chiffre d'affaires
  caArticles: any[] = [];
  caArticlesLoading: boolean = false;
  caArticlesSearchTerm: string = '';
  caArticlesCurrentPage: number = 1;
  caArticlesPageSize: number = 25;
  caArticlesTotalRecords: number = 0;
  caArticlesTotalPages: number = 0;
  caArticlesSortColumn: string = 'chiffre_affaires';
  caArticlesSortDirection: 'ASC' | 'DESC' = 'DESC';
  caArticlesDateFrom: string = '';
  caArticlesDateTo: string = '';

  constructor(private stockService: StockService) { }

  ngOnInit(): void {
    this.getEtatStock();
  }

  // === ONGLET ÉTAT DE STOCK ===

  getEtatStock(): void {
    this.etatStockLoading = true;

    const options: any = {
      page: this.etatStockCurrentPage,
      pageSize: this.etatStockPageSize,
      orderBy: this.etatStockSortColumn,
      orderDirection: this.etatStockSortDirection,
      search: this.etatStockSearchTerm,
      depotId: this.etatStockDepotId
    };

    this.stockService.getEtatStock(options).subscribe({
      next: (response: any) => {
        this.etatStock = response.data || [];
        this.etatStockTotalRecords = response.pagination?.total || 0;
        this.etatStockTotalPages = response.pagination?.totalPages || 0;
        this.etatStockLoading = false;
      },
      error: (error) => {
        console.error('Erreur chargement état stock:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement de l\'état du stock', 'error');
        this.etatStockLoading = false;
      }
    });
  }

  onEtatStockSearch(): void {
    this.etatStockCurrentPage = 1;
    this.getEtatStock();
  }

  onEtatStockPageChange(page: number): void {
    this.etatStockCurrentPage = page;
    this.getEtatStock();
  }

  onEtatStockSort(column: string): void {
    if (this.etatStockSortColumn === column) {
      this.etatStockSortDirection = this.etatStockSortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.etatStockSortColumn = column;
      this.etatStockSortDirection = 'ASC';
    }
    this.etatStockCurrentPage = 1;
    this.getEtatStock();
  }

  getEtatStockSortIcon(column: string): string {
    if (this.etatStockSortColumn !== column) {
      return 'fa-sort';
    }
    return this.etatStockSortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // === ONGLET FICHE DE STOCK ===

  getFicheStock(): void {
    if (!this.ficheStockArticleId) {
      Swal.fire('Erreur', 'Veuillez saisir un ID d\'article', 'error');
      return;
    }

    this.ficheStockLoading = true;

    const options: any = {
      page: this.ficheStockCurrentPage,
      pageSize: this.ficheStockPageSize
    };

    if (this.ficheStockDateFrom) options.dateFrom = this.ficheStockDateFrom;
    if (this.ficheStockDateTo) options.dateTo = this.ficheStockDateTo;

    this.stockService.getFicheStock(this.ficheStockArticleId, options).subscribe({
      next: (response: any) => {
        this.ficheStock = response;
        this.ficheStockArticleInfo = response.article;
        this.ficheStockMouvements = response.mouvements || [];
        this.ficheStockTotalRecords = response.pagination?.total || 0;
        this.ficheStockTotalPages = response.pagination?.totalPages || 0;
        this.ficheStockLoading = false;
      },
      error: (error) => {
        console.error('Erreur chargement fiche stock:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement de la fiche de stock', 'error');
        this.ficheStockLoading = false;
      }
    });
  }

  onFicheStockSearch(): void {
    this.ficheStockCurrentPage = 1;
    this.getFicheStock();
  }

  onFicheStockPageChange(page: number): void {
    this.ficheStockCurrentPage = page;
    this.getFicheStock();
  }

  // === ONGLET CHIFFRE D'AFFAIRES ===

  getChiffreAffairesArticles(): void {
    this.caArticlesLoading = true;

    const options: any = {
      page: this.caArticlesCurrentPage,
      pageSize: this.caArticlesPageSize,
      orderBy: this.caArticlesSortColumn,
      orderDirection: this.caArticlesSortDirection,
      search: this.caArticlesSearchTerm
    };

    if (this.caArticlesDateFrom) options.dateFrom = this.caArticlesDateFrom;
    if (this.caArticlesDateTo) options.dateTo = this.caArticlesDateTo;

    this.stockService.getChiffreAffairesArticles(options).subscribe({
      next: (response: any) => {
        this.caArticles = response.data || [];
        this.caArticlesTotalRecords = response.pagination?.total || 0;
        this.caArticlesTotalPages = response.pagination?.totalPages || 0;
        this.caArticlesLoading = false;
      },
      error: (error) => {
        console.error('Erreur chargement CA articles:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement du chiffre d\'affaires', 'error');
        this.caArticlesLoading = false;
      }
    });
  }

  onChiffreAffairesSearch(): void {
    this.caArticlesCurrentPage = 1;
    this.getChiffreAffairesArticles();
  }

  onChiffreAffairesPageChange(page: number): void {
    this.caArticlesCurrentPage = page;
    this.getChiffreAffairesArticles();
  }

  onChiffreAffairesSort(column: string): void {
    if (this.caArticlesSortColumn === column) {
      this.caArticlesSortDirection = this.caArticlesSortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.caArticlesSortColumn = column;
      this.caArticlesSortDirection = 'DESC';
    }
    this.caArticlesCurrentPage = 1;
    this.getChiffreAffairesArticles();
  }

  getChiffreAffairesSortIcon(column: string): string {
    if (this.caArticlesSortColumn !== column) {
      return 'fa-sort';
    }
    return this.caArticlesSortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // === UTILITAIRES ===

  switchTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'etat-stock' && this.etatStock.length === 0) {
      this.getEtatStock();
    } else if (tab === 'chiffre-affaires' && this.caArticles.length === 0) {
      this.getChiffreAffairesArticles();
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount || 0);
  }

  formatDate(date: string): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString('fr-FR');
  }

  getDisplayRange(currentPage: number, pageSize: number, totalRecords: number): string {
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalRecords);
    return `${start} - ${end}`;
  }

  getPageNumbers(totalPages: number, currentPage: number): number[] {
    const pages: number[] = [];
    const maxPages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
    let endPage = Math.min(totalPages, startPage + maxPages - 1);

    if (endPage - startPage < maxPages - 1) {
      startPage = Math.max(1, endPage - maxPages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  // === EXPORT ÉTAT DE STOCK ===

  exportEtatStock(format: 'pdf' | 'excel'): void {
    if (this.etatStock.length === 0) {
      Swal.fire('Erreur', 'Aucune donnée à exporter', 'error');
      return;
    }

    if (format === 'pdf') {
      this.exportEtatStockPDF();
    } else {
      this.exportEtatStockExcel();
    }
  }

  exportEtatStockPDF(): void {
    // Pour l'instant, on ouvre une nouvelle fenêtre avec les données
    // Dans une vraie implémentation, on ferait appel à une API backend
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>État de Stock</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { color: #007bff; text-align: center; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f8f9fa; font-weight: bold; }
              .text-end { text-align: right; }
              .badge { padding: 2px 6px; border-radius: 3px; font-size: 0.8em; }
              .bg-success { background-color: #d1edff; color: #0d6efd; }
              .bg-warning { background-color: #fff3cd; color: #856404; }
              .bg-danger { background-color: #f8d7da; color: #721c24; }
              @media print { body { margin: 0; } }
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
                  <th style="text-align: right;">Stock Actuel</th>
                  <th style="text-align: right;">Prix Moyen</th>
                  <th style="text-align: right;">Valeur Stock</th>
                  <th style="text-align: right;">Stock Min</th>
                  <th style="text-align: right;">Stock Max</th>
                </tr>
              </thead>
              <tbody>
                ${this.etatStock.map(article => `
                  <tr>
                    <td>${article.article_cod}</td>
                    <td>${article.article_nom}</td>
                    <td>${article.categorie_nom || '-'}</td>
                    <td>${article.unite_nom || '-'}</td>
                    <td style="text-align: right;">
                      <span class="badge ${article.stock_actuel <= article.stock_minimum ? 'bg-warning' : article.stock_actuel <= 0 ? 'bg-danger' : 'bg-success'}">
                        ${article.stock_actuel.toFixed(2)}
                      </span>
                    </td>
                    <td style="text-align: right;">${this.formatCurrency(article.prix_moyen)}</td>
                    <td style="text-align: right;"><strong>${this.formatCurrency(article.valeur_stock)}</strong></td>
                    <td style="text-align: right;">${article.stock_minimum || 0}</td>
                    <td style="text-align: right;">${article.stock_maximum || 0}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  }

  exportEtatStockExcel(): void {
    // Pour une vraie implémentation, utiliser xlsx ou une API backend
    // Pour l'instant, on crée un CSV simple
    const csvData = [
      ['Code Article', 'Nom Article', 'Catégorie', 'Unité', 'Stock Actuel', 'Prix Moyen', 'Valeur Stock', 'Stock Min', 'Stock Max'],
      ...this.etatStock.map(article => [
        article.article_cod,
        article.article_nom,
        article.categorie_nom || '',
        article.unite_nom || '',
        article.stock_actuel,
        article.prix_moyen,
        article.valeur_stock,
        article.stock_minimum || 0,
        article.stock_maximum || 0
      ])
    ];

    this.downloadCSV(csvData, 'etat-stock.csv');
  }

  // === EXPORT FICHE DE STOCK ===

  exportFicheStock(format: 'pdf' | 'excel'): void {
    if (!this.ficheStockArticleInfo || !this.ficheStockMouvements || this.ficheStockMouvements.length === 0) {
      Swal.fire('Erreur', 'Aucune donnée à exporter', 'error');
      return;
    }

    if (format === 'pdf') {
      this.exportFicheStockPDF();
    } else {
      this.exportFicheStockExcel();
    }
  }

  exportFicheStockPDF(): void {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Fiche de Stock - ${this.ficheStockArticleInfo.article_cod}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { color: #007bff; text-align: center; }
              .article-info { background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 0.9em; }
              th { background-color: #f8f9fa; font-weight: bold; }
              .text-end { text-align: right; }
              .text-success { color: #198754; font-weight: bold; }
              .text-danger { color: #dc3545; font-weight: bold; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <h1>Fiche de Stock</h1>
            <div class="article-info">
              <h3>${this.ficheStockArticleInfo.article_cod} - ${this.ficheStockArticleInfo.article_nom}</h3>
              <p><strong>Stock actuel:</strong> ${this.ficheStockArticleInfo.stock_actuel.toFixed(2)}</p>
              <p><strong>Catégorie:</strong> ${this.ficheStockArticleInfo.categorie_nom || '-'}</p>
              <p><strong>Unité:</strong> ${this.ficheStockArticleInfo.unite_nom || '-'}</p>
              <p><strong>Total mouvements:</strong> ${this.ficheStockTotalRecords}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Document</th>
                  <th>Description</th>
                  <th style="text-align: right;">Entrée</th>
                  <th style="text-align: right;">Sortie</th>
                  <th style="text-align: right;">Stock Final</th>
                  <th style="text-align: right;">Prix Unit.</th>
                  <th style="text-align: right;">Valeur</th>
                  <th>Partenaire</th>
                </tr>
              </thead>
              <tbody>
                ${this.ficheStockMouvements.map(mvt => `
                  <tr>
                    <td>${this.formatDate(mvt.date_mouvement)}</td>
                    <td>${mvt.type_mouvement}</td>
                    <td>${mvt.numero_document}</td>
                    <td>${mvt.description}</td>
                    <td style="text-align: right;" class="text-success">${mvt.quantite_entree > 0 ? '+' + mvt.quantite_entree.toFixed(2) : ''}</td>
                    <td style="text-align: right;" class="text-danger">${mvt.quantite_sortie > 0 ? '-' + mvt.quantite_sortie.toFixed(2) : ''}</td>
                    <td style="text-align: right;"><strong>${mvt.stock_apres_mouvement.toFixed(2)}</strong></td>
                    <td style="text-align: right;">${this.formatCurrency(mvt.prix_unitaire)}</td>
                    <td style="text-align: right;">${this.formatCurrency(mvt.valeur_mouvement)}</td>
                    <td>${mvt.partenaire_nom || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  }

  exportFicheStockExcel(): void {
    const csvData = [
      ['Date', 'Type', 'Document', 'Description', 'Entrée', 'Sortie', 'Stock Final', 'Prix Unit.', 'Valeur', 'Partenaire'],
      ...this.ficheStockMouvements.map(mvt => [
        this.formatDate(mvt.date_mouvement),
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

    this.downloadCSV(csvData, `fiche-stock-${this.ficheStockArticleInfo.article_cod}.csv`);
  }

  // === EXPORT CHIFFRE D'AFFAIRES ===

  exportChiffreAffaires(format: 'pdf' | 'excel'): void {
    if (this.caArticles.length === 0) {
      Swal.fire('Erreur', 'Aucune donnée à exporter', 'error');
      return;
    }

    if (format === 'pdf') {
      this.exportChiffreAffairesPDF();
    } else {
      this.exportChiffreAffairesExcel();
    }
  }

  exportChiffreAffairesPDF(): void {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const dateRange = this.caArticlesDateFrom && this.caArticlesDateTo
        ? `du ${this.formatDate(this.caArticlesDateFrom)} au ${this.formatDate(this.caArticlesDateTo)}`
        : 'toutes périodes';

      printWindow.document.write(`
        <html>
          <head>
            <title>Chiffre d'Affaires par Article</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { color: #007bff; text-align: center; }
              .periode { text-align: center; color: #6c757d; margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f8f9fa; font-weight: bold; }
              .text-end { text-align: right; }
              .badge { padding: 2px 6px; border-radius: 3px; font-size: 0.8em; }
              .bg-success { background-color: #d1edff; color: #0d6efd; }
              .bg-warning { background-color: #fff3cd; color: #856404; }
              .bg-danger { background-color: #f8d7da; color: #721c24; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <h1>Chiffre d'Affaires par Article</h1>
            <div class="periode">Période: ${dateRange}</div>
            <table>
              <thead>
                <tr>
                  <th>Code Article</th>
                  <th>Nom Article</th>
                  <th>Catégorie</th>
                  <th style="text-align: right;">Qté Vendue</th>
                  <th style="text-align: right;">Chiffre d'Affaires</th>
                  <th style="text-align: right;">Prix Moyen</th>
                  <th style="text-align: right;">Marge Moyenne</th>
                </tr>
              </thead>
              <tbody>
                ${this.caArticles.map(article => `
                  <tr>
                    <td>${article.article_cod}</td>
                    <td>${article.article_nom}</td>
                    <td>${article.categorie_nom || '-'}</td>
                    <td style="text-align: right;">${article.quantite_vendue.toFixed(2)}</td>
                    <td style="text-align: right;"><strong>${this.formatCurrency(article.chiffre_affaires)}</strong></td>
                    <td style="text-align: right;">${this.formatCurrency(article.prix_moyen_vente)}</td>
                    <td style="text-align: right;">
                      <span class="badge ${article.marge_moyenne >= 20 ? 'bg-success' : article.marge_moyenne >= 10 ? 'bg-warning' : 'bg-danger'}">
                        ${article.marge_moyenne.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  }

  exportChiffreAffairesExcel(): void {
    const csvData = [
      ['Code Article', 'Nom Article', 'Catégorie', 'Qté Vendue', 'Chiffre d\'Affaires', 'Prix Moyen', 'Marge Moyenne (%)'],
      ...this.caArticles.map(article => [
        article.article_cod,
        article.article_nom,
        article.categorie_nom || '',
        article.quantite_vendue,
        article.chiffre_affaires,
        article.prix_moyen_vente,
        article.marge_moyenne
      ])
    ];

    this.downloadCSV(csvData, 'chiffre-affaires-articles.csv');
  }

  // === UTILITAIRE POUR TÉLÉCHARGEMENT CSV ===

  downloadCSV(data: any[][], filename: string): void {
    const csvContent = data.map(row =>
      row.map(cell => {
        // Échapper les virgules et guillemets dans les cellules
        if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
