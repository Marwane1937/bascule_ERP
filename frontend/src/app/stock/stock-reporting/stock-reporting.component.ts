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
  ficheStockArticleNom: string = '';
  ficheStockArticle: string = ''; // Pour le filtre article
  ficheStockArticleInfo: any = null;
  ficheStockMouvements: any[] = [];
  ficheStockCurrentPage: number = 1;
  ficheStockPageSize: number = 50;
  ficheStockTotalRecords: number = 0;
  ficheStockTotalPages: number = 0;
  ficheStockDateFrom: string = '';
  ficheStockDateTo: string = '';
  ficheStockSortColumn: string = 'date';
  ficheStockSortDirection: 'ASC' | 'DESC' = 'DESC';
  ficheStockHasMore: boolean = true; // Pour le scroll infini
  ficheStockLoadingMore: boolean = false; // Indicateur de chargement
  // Auto-complétion articles
  allArticles: any[] = [];
  filteredArticles: any[] = [];
  showArticleAutocomplete: boolean = false;
  selectedArticleDisplay: string = ''; // Pour afficher le filtre sélectionné

  // Chiffre d'affaires
  caArticles: any[] = [];
  caArticlesLoading: boolean = false;
  caArticlesSearchTerm: string = '';
  caArticlesCurrentPage: number = 1;
  caArticlesPageSize: number = 25;
  caArticlesTotalRecords: number = 0;
  caArticlesTotalPages: number = 0;
  caArticlesSortColumn: string = 'ca';
  caArticlesSortDirection: 'ASC' | 'DESC' = 'DESC';
  caArticlesDateFrom: string = '';
  caArticlesDateTo: string = '';

  constructor(private stockService: StockService) { }

  ngOnInit(): void {
    this.getEtatStock();
    this.loadAllArticles(); // Charger tous les articles pour l'auto-complétion
  }

  // Charger tous les articles pour l'auto-complétion
  loadAllArticles(): void {
    const options: any = {
      page: 1,
      pageSize: 10000, // Charger tous les articles
      orderBy: 'article_nom',
      orderDirection: 'ASC'
    };

    this.stockService.getArticlesStock(options).subscribe({
      next: (response: any) => {
        this.allArticles = response.data || [];
      },
      error: (error) => {
      }
    });
  }

  // Auto-complétion des articles
  onArticleSearchChange(term: string): void {
    if (!term || term.trim().length === 0) {
      this.filteredArticles = [];
      this.showArticleAutocomplete = false;
      return;
    }

    term = term.trim().toLowerCase();
    this.filteredArticles = this.allArticles.filter((article: any) => {
      const nom = (article.article_nom || '').toLowerCase();
      const cod = (article.article_cod || '').toLowerCase();
      return nom.includes(term) || cod.includes(term);
    }).slice(0, 10); // Limiter à 10 résultats

    this.showArticleAutocomplete = this.filteredArticles.length > 0;
  }

  selectArticle(article: any): void {
    this.ficheStockArticle = `${article.article_cod} - ${article.article_nom}`;
    this.ficheStockArticleId = article.article_id; // Stocker l'ID de l'article
    this.selectedArticleDisplay = this.ficheStockArticle;
    this.filteredArticles = [];
    this.showArticleAutocomplete = false;
  }

  onArticleInputFocus(): void {
    if (this.ficheStockArticle && this.filteredArticles.length > 0) {
      this.showArticleAutocomplete = true;
    }
  }

  onArticleInputBlur(): void {
    // Délai pour permettre le clic sur une suggestion
    setTimeout(() => {
      this.showArticleAutocomplete = false;
    }, 200);
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

  getFicheStock(reset: boolean = false): void {
    if (reset) {
      this.ficheStockCurrentPage = 1;
      this.ficheStockMouvements = [];
      this.ficheStockHasMore = true;
    }

    if (!this.ficheStockHasMore || this.ficheStockLoading) {
      return;
    }

    this.ficheStockLoading = true;
    if (this.ficheStockCurrentPage > 1) {
      this.ficheStockLoadingMore = true;
    }

    const options: any = {
      page: this.ficheStockCurrentPage,
      pageSize: this.ficheStockPageSize
    };

    if (this.ficheStockDateFrom) options.dateFrom = this.ficheStockDateFrom;
    if (this.ficheStockDateTo) options.dateTo = this.ficheStockDateTo;
    
    // Si un article_id est sélectionné (via auto-complétion), utiliser SEULEMENT l'ID
    // Ne PAS envoyer les filtres texte article/article_nom
    if (this.ficheStockArticleId && this.ficheStockArticleId > 0) {
      options.article_id = this.ficheStockArticleId;
      // Ne pas ajouter les filtres texte quand article_id est fourni
    } else {
      // Utiliser les filtres texte seulement si article_id n'est pas fourni
      if (this.ficheStockArticleNom) options.article_nom = this.ficheStockArticleNom;
      if (this.ficheStockArticle) options.article = this.ficheStockArticle;
    }

    const articleId = this.ficheStockArticleId && this.ficheStockArticleId > 0 ? this.ficheStockArticleId : null;

    this.stockService.getFicheStock(articleId, options).subscribe({
      next: (response: any) => {
        const newMouvements = response.mouvements || [];
        
        if (reset) {
          this.ficheStockMouvements = newMouvements;
        } else {
          // Ajouter les nouvelles données aux existantes
          this.ficheStockMouvements = [...this.ficheStockMouvements, ...newMouvements];
        }

        this.ficheStock = response;
        this.ficheStockArticleInfo = response.article;
        this.ficheStockTotalRecords = response.pagination?.total || 0;
        this.ficheStockTotalPages = response.pagination?.totalPages || 0;
        
        
        // Vérifier s'il reste des pages à charger
        this.ficheStockHasMore = this.ficheStockCurrentPage < this.ficheStockTotalPages;
        
        this.ficheStockLoading = false;
        this.ficheStockLoadingMore = false;
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors du chargement de la fiche de stock', 'error');
        this.ficheStockMouvements = reset ? [] : this.ficheStockMouvements;
        this.ficheStockLoading = false;
        this.ficheStockLoadingMore = false;
      }
    });
  }

  onFicheStockSearch(): void {
    // Sauvegarder le filtre article pour l'affichage
    this.selectedArticleDisplay = this.ficheStockArticle || '';
    this.getFicheStock(true); // reset = true
  }

  // Ajouter la méthode pour le scroll infini
  onFicheStockScroll(event: any): void {
    const element = event.target;
    const atBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 100; // 100px avant la fin

    if (atBottom && this.ficheStockHasMore && !this.ficheStockLoading && !this.ficheStockLoadingMore) {
      this.ficheStockCurrentPage++;
      this.getFicheStock(false);
    }
  }

  onFicheStockPageChange(page: number): void {
    this.ficheStockCurrentPage = page;
    this.getFicheStock();
  }

  onFicheStockSort(column: string): void {
    if (this.ficheStockSortColumn === column) {
      this.ficheStockSortDirection = this.ficheStockSortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.ficheStockSortColumn = column;
      this.ficheStockSortDirection = 'DESC';
    }
    this.ficheStockCurrentPage = 1;
    // Le tri sera fait côté client pour la fiche de stock
    this.sortFicheStockMouvements();
  }

  sortFicheStockMouvements(): void {
    if (!this.ficheStockMouvements || this.ficheStockMouvements.length === 0) {
      return;
    }

    this.ficheStockMouvements.sort((a, b) => {
      let aValue = a[this.ficheStockSortColumn];
      let bValue = b[this.ficheStockSortColumn];

      if (aValue === null || aValue === undefined) aValue = '';
      if (bValue === null || bValue === undefined) bValue = '';

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) {
        return this.ficheStockSortDirection === 'ASC' ? -1 : 1;
      }
      if (aValue > bValue) {
        return this.ficheStockSortDirection === 'ASC' ? 1 : -1;
      }
      return 0;
    });
  }

  getFicheStockSortIcon(column: string): string {
    if (this.ficheStockSortColumn !== column) {
      return 'fa-sort';
    }
    return this.ficheStockSortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
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

    this.stockService.getChiffreAffairesArticles(options).subscribe({
      next: (response: any) => {
        this.caArticles = response.data || [];
        this.caArticlesTotalRecords = response.pagination?.total || 0;
        this.caArticlesTotalPages = response.pagination?.totalPages || 0;
        this.caArticlesLoading = false;
      },
      error: (error) => {
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
    } else if (tab === 'fiche-stock' && this.ficheStockMouvements.length === 0) {
      // Charger toutes les données par défaut pour la fiche de stock
      this.ficheStockArticleNom = '';
      this.ficheStockArticle = '';
      this.ficheStockArticleId = 0;
      this.selectedArticleDisplay = '';
      this.ficheStockDateFrom = '';
      this.ficheStockDateTo = '';
      this.ficheStockCurrentPage = 1;
      this.ficheStockHasMore = true;
      this.getFicheStock(true);
    } else if (tab === 'chiffre-affaires' && this.caArticles.length === 0) {
      this.getChiffreAffairesArticles();
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0) + ' dh';
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
    const options: any = {
      page: 1,
      pageSize: 10000,
      orderBy: this.etatStockSortColumn,
      orderDirection: this.etatStockSortDirection,
      search: this.etatStockSearchTerm
    };
    this.stockService.exportEtatStockPDF(options).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `etat-stock-${new Date().toISOString().split('T')[0]}.html`;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        if (error.status === 401) {
          Swal.fire('Erreur', 'Token d\'accès requis. Veuillez vous reconnecter.', 'error');
        } else {
          Swal.fire('Erreur', error.error?.message || 'Erreur lors de l\'export PDF', 'error');
        }
      }
    });
  }

  exportEtatStockExcel(): void {
    const options: any = {
      page: 1,
      pageSize: 10000,
      orderBy: this.etatStockSortColumn,
      orderDirection: this.etatStockSortDirection,
      search: this.etatStockSearchTerm
    };
    this.stockService.exportEtatStockExcel(options).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `etat-stock-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors de l\'export Excel', 'error');
      }
    });
  }

  // === EXPORT FICHE DE STOCK ===

  exportFicheStock(format: 'pdf' | 'excel'): void {
    if (!this.ficheStockMouvements || this.ficheStockMouvements.length === 0) {
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
    // Exporter uniquement les données visibles (ficheStockMouvements)
    if (!this.ficheStockMouvements || this.ficheStockMouvements.length === 0) {
      Swal.fire('Erreur', 'Aucune donnée à exporter', 'error');
      return;
    }

    // Générer le PDF avec les données visibles uniquement
    const htmlContent = this.generateFicheStockPDFHTML(this.ficheStockMouvements);
    
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = `fiche-stock-${new Date().toISOString().split('T')[0]}.html`;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  generateFicheStockPDFHTML(mouvements: any[]): string {
    const articleDisplay = this.selectedArticleDisplay ? `<div class="mb-2"><strong>Article :</strong> <span style="color: #007bff; font-weight: bold;">${this.selectedArticleDisplay}</span></div>` : '';
    const dateFromDisplay = this.ficheStockDateFrom ? `<div class="mb-2"><strong>Date du :</strong> ${this.formatDate(this.ficheStockDateFrom)}</div>` : '';
    const dateToDisplay = this.ficheStockDateTo ? `<div class="mb-2"><strong>Date au :</strong> ${this.formatDate(this.ficheStockDateTo)}</div>` : '';

    return `
      <!DOCTYPE html>
        <html>
          <head>
        <meta charset="utf-8">
        <title>Fiche de Stock</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #007bff; text-align: center; margin-bottom: 20px; }
          .filter-info { background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #007bff; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 11px; }
          th { background-color: #343a40; color: white; font-weight: bold; }
              .text-end { text-align: right; }
              .text-success { color: #198754; font-weight: bold; }
              .text-danger { color: #dc3545; font-weight: bold; }
          @page { margin: 1cm; }
          @media print {
            body { margin: 0; }
            .filter-info { page-break-inside: avoid; }
          }
            </style>
          </head>
          <body>
            <h1>Fiche de Stock</h1>
        <div class="filter-info">
          ${articleDisplay}
          ${dateFromDisplay}
          ${dateToDisplay}
            </div>
            <table>
              <thead>
                <tr>
              <th>Dépôt</th>
                  <th>Date</th>
                  <th>Type</th>
              <th>Numéro</th>
              <th>Tiers</th>
              <th class="text-end">Entrée</th>
              <th class="text-end">Sortie</th>
              <th class="text-end">Solde</th>
                </tr>
              </thead>
              <tbody>
            ${mouvements.map(item => `
              <tr>
                <td>${item.depot || '-'}</td>
                <td>${item.date ? this.formatDate(item.date) : ''}</td>
                <td>${item.type || '-'}</td>
                <td>${item.numero || '-'}</td>
                <td>${item.tiers || '-'}</td>
                <td class="text-end text-success">${item.entree && item.entree > 0 ? Number(item.entree || 0).toFixed(2) : '0'}</td>
                <td class="text-end text-danger">${item.sortie && item.sortie > 0 ? Number(item.sortie || 0).toFixed(2) : '0'}</td>
                <td class="text-end"><strong>${Number(item.solde || 0).toFixed(2)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
        <div style="margin-top: 20px; text-align: center; color: #6c757d; font-size: 12px;">
          Total: ${mouvements.length} mouvement(s) - Généré le ${new Date().toLocaleDateString('fr-FR')}
        </div>
          </body>
        </html>
    `;
  }

  exportFicheStockExcel(): void {
    const articleId = this.ficheStockArticleId && this.ficheStockArticleId > 0 ? this.ficheStockArticleId : null;
    const options: any = {
      page: 1,
      pageSize: 10000,
      dateFrom: this.ficheStockDateFrom,
      dateTo: this.ficheStockDateTo,
      article_nom: this.ficheStockArticleNom
    };
    this.stockService.exportFicheStockExcel(articleId, options).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const filename = articleId ? `fiche-stock-${articleId}-${new Date().toISOString().split('T')[0]}.csv` : `fiche-stock-${new Date().toISOString().split('T')[0]}.csv`;
        link.download = filename;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors de l\'export Excel', 'error');
      }
    });
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
    const options: any = {
      page: 1,
      pageSize: 10000,
      orderBy: this.caArticlesSortColumn,
      orderDirection: this.caArticlesSortDirection,
      search: this.caArticlesSearchTerm
    };
    this.stockService.exportChiffreAffairesPDF(options).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `chiffre-affaires-articles-${new Date().toISOString().split('T')[0]}.html`;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        if (error.status === 401) {
          Swal.fire('Erreur', 'Token d\'accès requis. Veuillez vous reconnecter.', 'error');
        } else {
          Swal.fire('Erreur', error.error?.message || 'Erreur lors de l\'export PDF', 'error');
        }
      }
    });
  }

  exportChiffreAffairesExcel(): void {
    const options: any = {
      page: 1,
      pageSize: 10000,
      orderBy: this.caArticlesSortColumn,
      orderDirection: this.caArticlesSortDirection,
      search: this.caArticlesSearchTerm
    };
    this.stockService.exportChiffreAffairesExcel(options).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `chiffre-affaires-articles-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors de l\'export Excel', 'error');
      }
    });
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
