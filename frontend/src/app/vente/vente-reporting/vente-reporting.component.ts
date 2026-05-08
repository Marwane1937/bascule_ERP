import { Component, OnInit } from '@angular/core';
import { VenteService } from 'src/app/service/vente.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-vente-reporting',
  templateUrl: './vente-reporting.component.html',
  styleUrls: ['./vente-reporting.component.css']
})
export class VenteReportingComponent implements OnInit {
  activeTab: string = 'grand-livre';

  // Grand livre
  grandLivre: any[] = [];
  grandLivreLoading: boolean = false;
  grandLivreSearchTerm: string = '';
  grandLivreCurrentPage: number = 1;
  grandLivrePageSize: number = 25;
  grandLivreTotalRecords: number = 0;
  grandLivreTotalPages: number = 0;
  grandLivreSortColumn: string = 'date';
  grandLivreSortDirection: 'ASC' | 'DESC' = 'DESC';
  grandLivreDateFrom: string = '';
  grandLivreDateTo: string = '';

  // Factures par client
  facturesClient: any[] = [];
  facturesClientLoading: boolean = false;
  facturesClientSearchTerm: string = '';
  facturesClientCurrentPage: number = 1;
  facturesClientPageSize: number = 25;
  facturesClientTotalRecords: number = 0;
  facturesClientTotalPages: number = 0;
  facturesClientSortColumn: string = 'facture_dat';
  facturesClientSortDirection: 'ASC' | 'DESC' = 'DESC';
  facturesClientDateFrom: string = '';
  facturesClientDateTo: string = '';

  // Chiffre d'affaires par article
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

  // Chiffre d'affaires par client
  caClients: any[] = [];
  caClientsLoading: boolean = false;
  caClientsSearchTerm: string = '';
  caClientsCurrentPage: number = 1;
  caClientsPageSize: number = 25;
  caClientsTotalRecords: number = 0;
  caClientsTotalPages: number = 0;
  caClientsSortColumn: string = 'chiffre_affaires';
  caClientsSortDirection: 'ASC' | 'DESC' = 'DESC';
  caClientsDateFrom: string = '';
  caClientsDateTo: string = '';
  clientSuggestions: any[] = [];
  articleSuggestions: any[] = [];
  activeAutocomplete: string | null = null;
  private autocompleteTimer: any = null;

  constructor(private venteService: VenteService) { }

  formatNumber(value: any, minimumFractionDigits = 0, maximumFractionDigits = 2): string {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('fr-FR', {
      minimumFractionDigits,
      maximumFractionDigits
    });
  }

  ngOnInit(): void {
    this.getGrandLivre();
  }

  // === ONGLET GRAND LIVRE ===

  getGrandLivre(): void {
    this.grandLivreLoading = true;

    const options: any = {
      page: this.grandLivreCurrentPage,
      pageSize: this.grandLivrePageSize,
      orderBy: this.grandLivreSortColumn,
      orderDirection: this.grandLivreSortDirection,
      search: this.grandLivreSearchTerm
    };

    if (this.grandLivreDateFrom) options.dateFrom = this.grandLivreDateFrom;
    if (this.grandLivreDateTo) options.dateTo = this.grandLivreDateTo;

    this.venteService.getGrandLivre(options).subscribe({
      next: (response: any) => {
        this.grandLivre = response.data || [];
        this.grandLivreTotalRecords = response.pagination?.total || 0;
        this.grandLivreTotalPages = response.pagination?.totalPages || 0;
        this.grandLivreLoading = false;
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors du chargement du grand livre', 'error');
        this.grandLivreLoading = false;
      }
    });
  }

  onGrandLivreSearch(): void {
    this.grandLivreCurrentPage = 1;
    this.getGrandLivre();
  }

  onGrandLivrePageChange(page: number): void {
    this.grandLivreCurrentPage = page;
    this.getGrandLivre();
  }

  onGrandLivreSort(column: string): void {
    if (this.grandLivreSortColumn === column) {
      this.grandLivreSortDirection = this.grandLivreSortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.grandLivreSortColumn = column;
      this.grandLivreSortDirection = 'DESC';
    }
    this.grandLivreCurrentPage = 1;
    this.getGrandLivre();
  }

  getGrandLivreSortIcon(column: string): string {
    if (this.grandLivreSortColumn !== column) {
      return 'fa-sort';
    }
    return this.grandLivreSortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // === ONGLET FACTURES PAR CLIENT ===

  getFacturesClient(): void {
    this.facturesClientLoading = true;

    const options: any = {
      page: this.facturesClientCurrentPage,
      pageSize: this.facturesClientPageSize,
      orderBy: this.facturesClientSortColumn,
      orderDirection: this.facturesClientSortDirection,
      search: this.facturesClientSearchTerm
    };

    if (this.facturesClientDateFrom) options.dateFrom = this.facturesClientDateFrom;
    if (this.facturesClientDateTo) options.dateTo = this.facturesClientDateTo;

    this.venteService.getFacturesByClient(options).subscribe({
      next: (response: any) => {
        this.facturesClient = response.data || [];
        this.facturesClientTotalRecords = response.pagination?.total || 0;
        this.facturesClientTotalPages = response.pagination?.totalPages || 0;
        this.facturesClientLoading = false;
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors du chargement des factures par client', 'error');
        this.facturesClientLoading = false;
      }
    });
  }

  onFacturesClientSearch(): void {
    this.facturesClientCurrentPage = 1;
    this.getFacturesClient();
  }

  onFacturesClientPageChange(page: number): void {
    this.facturesClientCurrentPage = page;
    this.getFacturesClient();
  }

  onFacturesClientSort(column: string): void {
    if (this.facturesClientSortColumn === column) {
      this.facturesClientSortDirection = this.facturesClientSortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.facturesClientSortColumn = column;
      this.facturesClientSortDirection = 'DESC';
    }
    this.facturesClientCurrentPage = 1;
    this.getFacturesClient();
  }

  getFacturesClientSortIcon(column: string): string {
    if (this.facturesClientSortColumn !== column) {
      return 'fa-sort';
    }
    return this.facturesClientSortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // === ONGLET CHIFFRE D'AFFAIRES PAR ARTICLE ===

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

    this.venteService.getChiffreAffairesArticles(options).subscribe({
      next: (response: any) => {
        this.caArticles = response.data || [];
        this.caArticlesTotalRecords = response.pagination?.total || 0;
        this.caArticlesTotalPages = response.pagination?.totalPages || 0;
        this.caArticlesLoading = false;
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors du chargement du chiffre d\'affaires par article', 'error');
        this.caArticlesLoading = false;
      }
    });
  }

  onChiffreAffairesArticlesSearch(): void {
    this.caArticlesCurrentPage = 1;
    this.getChiffreAffairesArticles();
  }

  onChiffreAffairesArticlesPageChange(page: number): void {
    this.caArticlesCurrentPage = page;
    this.getChiffreAffairesArticles();
  }

  onChiffreAffairesArticlesSort(column: string): void {
    if (this.caArticlesSortColumn === column) {
      this.caArticlesSortDirection = this.caArticlesSortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.caArticlesSortColumn = column;
      this.caArticlesSortDirection = 'DESC';
    }
    this.caArticlesCurrentPage = 1;
    this.getChiffreAffairesArticles();
  }

  getChiffreAffairesArticlesSortIcon(column: string): string {
    if (this.caArticlesSortColumn !== column) {
      return 'fa-sort';
    }
    return this.caArticlesSortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // === ONGLET CHIFFRE D'AFFAIRES PAR CLIENT ===

  getChiffreAffairesClients(): void {
    this.caClientsLoading = true;

    const options: any = {
      page: this.caClientsCurrentPage,
      pageSize: this.caClientsPageSize,
      orderBy: this.caClientsSortColumn,
      orderDirection: this.caClientsSortDirection,
      search: this.caClientsSearchTerm
    };

    if (this.caClientsDateFrom) options.dateFrom = this.caClientsDateFrom;
    if (this.caClientsDateTo) options.dateTo = this.caClientsDateTo;

    this.venteService.getChiffreAffairesClients(options).subscribe({
      next: (response: any) => {
        this.caClients = response.data || [];
        this.caClientsTotalRecords = response.pagination?.total || 0;
        this.caClientsTotalPages = response.pagination?.totalPages || 0;
        this.caClientsLoading = false;
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors du chargement du chiffre d\'affaires par client', 'error');
        this.caClientsLoading = false;
      }
    });
  }

  onChiffreAffairesClientsSearch(): void {
    this.caClientsCurrentPage = 1;
    this.getChiffreAffairesClients();
  }

  onChiffreAffairesClientsPageChange(page: number): void {
    this.caClientsCurrentPage = page;
    this.getChiffreAffairesClients();
  }

  onChiffreAffairesClientsSort(column: string): void {
    if (this.caClientsSortColumn === column) {
      this.caClientsSortDirection = this.caClientsSortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.caClientsSortColumn = column;
      this.caClientsSortDirection = 'DESC';
    }
    this.caClientsCurrentPage = 1;
    this.getChiffreAffairesClients();
  }

  getChiffreAffairesClientsSortIcon(column: string): string {
    if (this.caClientsSortColumn !== column) {
      return 'fa-sort';
    }
    return this.caClientsSortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  onClientSearchInput(section: string, value: string): void {
    this.setSearchTerm(section, value);
    this.activeAutocomplete = section;
    this.loadClientSuggestions(value);
  }

  onArticleSearchInput(value: string): void {
    this.caArticlesSearchTerm = value || '';
    this.activeAutocomplete = 'ca-articles';
    this.loadArticleSuggestions(value);
  }

  showClientAutocomplete(section: string, value: string = ''): void {
    this.activeAutocomplete = section;
    this.loadClientSuggestions(value);
  }

  showArticleAutocomplete(value: string = ''): void {
    this.activeAutocomplete = 'ca-articles';
    this.loadArticleSuggestions(value);
  }

  hideAutocompleteDelayed(): void {
    setTimeout(() => {
      this.activeAutocomplete = null;
    }, 180);
  }

  selectClientSuggestion(section: string, client: any): void {
    this.setSearchTerm(section, client?.client_nom || '');
    this.activeAutocomplete = null;
    this.clientSuggestions = [];

    if (section === 'grand-livre') {
      this.onGrandLivreSearch();
    } else if (section === 'factures-client') {
      this.onFacturesClientSearch();
    } else if (section === 'ca-clients') {
      this.onChiffreAffairesClientsSearch();
    }
  }

  selectArticleSuggestion(article: any): void {
    this.caArticlesSearchTerm = article?.article_nom || article?.article_cod || '';
    this.activeAutocomplete = null;
    this.articleSuggestions = [];
    this.onChiffreAffairesArticlesSearch();
  }

  loadClientSuggestions(search: string = ''): void {
    if (this.autocompleteTimer) {
      clearTimeout(this.autocompleteTimer);
    }

    this.autocompleteTimer = setTimeout(() => {
      this.venteService.getClientSuggestions({ search: search || '', limit: 20 }).subscribe({
        next: (response: any) => {
          this.clientSuggestions = response.data || [];
        },
        error: () => {
          this.clientSuggestions = [];
        }
      });
    }, 150);
  }

  loadArticleSuggestions(search: string = ''): void {
    if (this.autocompleteTimer) {
      clearTimeout(this.autocompleteTimer);
    }

    this.autocompleteTimer = setTimeout(() => {
      this.venteService.getArticleSuggestions({ search: search || '', limit: 20 }).subscribe({
        next: (response: any) => {
          this.articleSuggestions = response.data || [];
        },
        error: () => {
          this.articleSuggestions = [];
        }
      });
    }, 150);
  }

  private setSearchTerm(section: string, value: string): void {
    if (section === 'grand-livre') {
      this.grandLivreSearchTerm = value || '';
    } else if (section === 'factures-client') {
      this.facturesClientSearchTerm = value || '';
    } else if (section === 'ca-clients') {
      this.caClientsSearchTerm = value || '';
    }
  }

  // === UTILITAIRES ===

  switchTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'grand-livre' && this.grandLivre.length === 0) {
      this.getGrandLivre();
    } else if (tab === 'factures-client' && this.facturesClient.length === 0) {
      this.getFacturesClient();
    } else if (tab === 'ca-articles' && this.caArticles.length === 0) {
      this.getChiffreAffairesArticles();
    } else if (tab === 'ca-clients' && this.caClients.length === 0) {
      this.getChiffreAffairesClients();
    }
  }

  formatCurrency(amount: number): string {
    const value = Number(amount || 0);
    const sign = value < 0 ? '-' : '';
    const formatted = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Math.abs(value));
    return `${sign}${formatted} dh`;
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

  // === EXPORT GRAND LIVRE ===

  exportGrandLivre(format: 'pdf' | 'excel'): void {
    if (this.grandLivre.length === 0) {
      Swal.fire('Erreur', 'Aucune donnée à exporter', 'error');
      return;
    }

    if (format === 'pdf') {
      this.exportGrandLivrePDF();
    } else {
      this.exportGrandLivreExcel();
    }
  }

  exportGrandLivrePDF(): void {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Grand Livre</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { color: #007bff; text-align: center; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f8f9fa; font-weight: bold; }
              .text-end { text-align: right; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <h1>Grand Livre - ${new Date().toLocaleDateString('fr-FR')}</h1>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Document</th>
                  <th>Type</th>
                  <th>Client</th>
                  <th>Description</th>
                  <th style="text-align: right;">Montant HT</th>
                  <th style="text-align: right;">TVA</th>
                  <th style="text-align: right;">Montant TTC</th>
                </tr>
              </thead>
              <tbody>
                ${this.grandLivre.map(item => `
                  <tr>
                    <td>${this.formatDate(item.date)}</td>
                    <td>${item.numero || item.facture_num || '-'}</td>
                    <td>${item.document_type || '-'}</td>
                    <td>${item.client || item.nom || '-'}</td>
                    <td>${item.description || '-'}</td>
                    <td style="text-align: right;">${this.formatCurrency(item.total_ht || item.facture_ht || 0)}</td>
                    <td style="text-align: right;">${this.formatCurrency(item.total_tva || item.facture_tva || 0)}</td>
                    <td style="text-align: right;"><strong>${this.formatCurrency(item.total_ttc || (item.facture_ht || 0) + (item.facture_tva || 0))}</strong></td>
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

  exportGrandLivreExcel(): void {
    const csvData = [
      ['Date', 'Document', 'Type', 'Client', 'Description', 'Montant HT', 'TVA', 'Montant TTC'],
      ...this.grandLivre.map(item => [
        this.formatDate(item.date),
        item.numero || item.facture_num || '',
        item.document_type || '',
        item.client || item.nom || '',
        item.description || '',
        item.total_ht || item.facture_ht || 0,
        item.total_tva || item.facture_tva || 0,
        item.total_ttc || (item.facture_ht || 0) + (item.facture_tva || 0)
      ])
    ];

    this.downloadCSV(csvData, 'grand-livre.csv');
  }

  // === EXPORT FACTURES PAR CLIENT ===

  exportFacturesClient(format: 'pdf' | 'excel'): void {
    if (this.facturesClient.length === 0) {
      Swal.fire('Erreur', 'Aucune donnée à exporter', 'error');
      return;
    }

    if (format === 'pdf') {
      this.exportFacturesClientPDF();
    } else {
      this.exportFacturesClientExcel();
    }
  }

  exportFacturesClientPDF(): void {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Factures par Client</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { color: #007bff; text-align: center; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f8f9fa; font-weight: bold; }
              .text-end { text-align: right; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <h1>Factures par Client - ${new Date().toLocaleDateString('fr-FR')}</h1>
            <table>
              <thead>
                <tr>
                  <th>Numéro Facture</th>
                  <th>Date</th>
                  <th>Client</th>
                  <th style="text-align: right;">Montant HT</th>
                  <th style="text-align: right;">TVA</th>
                  <th style="text-align: right;">Montant TTC</th>
                </tr>
              </thead>
              <tbody>
                ${this.facturesClient.map(item => `
                  <tr>
                    <td>${item.facture_num || '-'}</td>
                    <td>${this.formatDate(item.facture_dat)}</td>
                    <td>${item.client_nom || item.nom || '-'}</td>
                    <td style="text-align: right;">${this.formatCurrency(item.facture_ht || 0)}</td>
                    <td style="text-align: right;">${this.formatCurrency(item.facture_tva || 0)}</td>
                    <td style="text-align: right;"><strong>${this.formatCurrency(item.total_ttc || (item.facture_ht || 0) + (item.facture_tva || 0))}</strong></td>
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

  exportFacturesClientExcel(): void {
    const csvData = [
      ['Numéro Facture', 'Date', 'Client', 'Montant HT', 'TVA', 'Montant TTC'],
      ...this.facturesClient.map(item => [
        item.facture_num || '',
        this.formatDate(item.facture_dat),
        item.client_nom || item.nom || '',
        item.facture_ht || 0,
        item.facture_tva || 0,
        item.total_ttc || (item.facture_ht || 0) + (item.facture_tva || 0)
      ])
    ];

    this.downloadCSV(csvData, 'factures-client.csv');
  }

  // === EXPORT CHIFFRE D'AFFAIRES PAR ARTICLE ===

  exportChiffreAffairesArticles(format: 'pdf' | 'excel'): void {
    if (this.caArticles.length === 0) {
      Swal.fire('Erreur', 'Aucune donnée à exporter', 'error');
      return;
    }

    if (format === 'pdf') {
      this.exportChiffreAffairesArticlesPDF();
    } else {
      this.exportChiffreAffairesArticlesExcel();
    }
  }

  exportChiffreAffairesArticlesPDF(): void {
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
                  <th>Famille</th>
                  <th style="text-align: right;">Qté Vendue</th>
                  <th style="text-align: right;">Chiffre d'Affaires</th>
                  <th style="text-align: right;">Prix Moyen</th>
                </tr>
              </thead>
              <tbody>
                ${this.caArticles.map(article => `
                  <tr>
                    <td>${article.article_cod}</td>
                    <td>${article.article_nom}</td>
                    <td>${article.famille_nom || article.categorie_nom || '-'}</td>
                    <td style="text-align: right;">${article.quantite_vendue?.toFixed(2) || '0.00'}</td>
                    <td style="text-align: right;"><strong>${this.formatCurrency(article.chiffre_affaires || 0)}</strong></td>
                    <td style="text-align: right;">${this.formatCurrency(article.prix_moyen_vente || 0)}</td>
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

  exportChiffreAffairesArticlesExcel(): void {
    const csvData = [
      ['Code Article', 'Nom Article', 'Famille', 'Qté Vendue', 'Chiffre d\'Affaires', 'Prix Moyen'],
      ...this.caArticles.map(article => [
        article.article_cod,
        article.article_nom,
        article.famille_nom || article.categorie_nom || '',
        article.quantite_vendue || 0,
        article.chiffre_affaires || 0,
        article.prix_moyen_vente || 0
      ])
    ];

    this.downloadCSV(csvData, 'chiffre-affaires-articles.csv');
  }

  // === EXPORT CHIFFRE D'AFFAIRES PAR CLIENT ===

  exportChiffreAffairesClients(format: 'pdf' | 'excel'): void {
    if (this.caClients.length === 0) {
      Swal.fire('Erreur', 'Aucune donnée à exporter', 'error');
      return;
    }

    if (format === 'pdf') {
      this.exportChiffreAffairesClientsPDF();
    } else {
      this.exportChiffreAffairesClientsExcel();
    }
  }

  exportChiffreAffairesClientsPDF(): void {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const dateRange = this.caClientsDateFrom && this.caClientsDateTo
        ? `du ${this.formatDate(this.caClientsDateFrom)} au ${this.formatDate(this.caClientsDateTo)}`
        : 'toutes périodes';

      printWindow.document.write(`
        <html>
          <head>
            <title>Chiffre d'Affaires par Client</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { color: #007bff; text-align: center; }
              .periode { text-align: center; color: #6c757d; margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f8f9fa; font-weight: bold; }
              .text-end { text-align: right; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <h1>Chiffre d'Affaires par Client</h1>
            <div class="periode">Période: ${dateRange}</div>
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th style="text-align: right;">Nombre Factures</th>
                  <th style="text-align: right;">Chiffre d'Affaires</th>
                  <th style="text-align: right;">Montant Moyen</th>
                </tr>
              </thead>
              <tbody>
                ${this.caClients.map(client => `
                  <tr>
                    <td>${client.client_nom || '-'}</td>
                    <td style="text-align: right;">${client.nombre_factures || 0}</td>
                    <td style="text-align: right;"><strong>${this.formatCurrency(client.chiffre_affaires || 0)}</strong></td>
                    <td style="text-align: right;">${this.formatCurrency(client.montant_moyen || 0)}</td>
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

  exportChiffreAffairesClientsExcel(): void {
    const csvData = [
      ['Client', 'Nombre Factures', 'Chiffre d\'Affaires', 'Montant Moyen'],
      ...this.caClients.map(client => [
        client.client_nom || '',
        client.nombre_factures || 0,
        client.chiffre_affaires || 0,
        client.montant_moyen || 0
      ])
    ];

    this.downloadCSV(csvData, 'chiffre-affaires-clients.csv');
  }

  // === UTILITAIRE POUR TÉLÉCHARGEMENT CSV ===

  downloadCSV(data: any[][], filename: string): void {
    const csvContent = data.map(row =>
      row.map(cell => {
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
