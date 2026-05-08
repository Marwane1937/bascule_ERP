import { Component, OnInit } from '@angular/core';
import { AchatsService } from 'src/app/service/achats.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-achat-reporting',
  templateUrl: './achat-reporting.component.html',
  styleUrls: ['./achat-reporting.component.css']
})
export class AchatReportingComponent implements OnInit {
  activeTab = 'factures-fournisseur';

  facturesFournisseur: any[] = [];
  facturesFournisseurLoading = false;
  facturesFournisseurSearchTerm = '';
  facturesFournisseurDateFrom = '';
  facturesFournisseurDateTo = '';
  facturesFournisseurPageSize = 25;
  facturesFournisseurCurrentPage = 1;
  facturesFournisseurTotalRecords = 0;
  facturesFournisseurTotalPages = 0;
  facturesFournisseurSortColumn = 'facture_dat';
  facturesFournisseurSortDirection: 'ASC' | 'DESC' = 'DESC';

  achatsFournisseurs: any[] = [];
  achatsFournisseursLoading = false;
  achatsFournisseursSearchTerm = '';
  achatsFournisseursDateFrom = '';
  achatsFournisseursDateTo = '';
  achatsFournisseursPageSize = 25;
  achatsFournisseursCurrentPage = 1;
  achatsFournisseursTotalRecords = 0;
  achatsFournisseursTotalPages = 0;
  achatsFournisseursSortColumn = 'total_ttc';
  achatsFournisseursSortDirection: 'ASC' | 'DESC' = 'DESC';

  achatsArticles: any[] = [];
  achatsArticlesLoading = false;
  achatsArticlesSearchTerm = '';
  achatsArticlesDateFrom = '';
  achatsArticlesDateTo = '';
  achatsArticlesPageSize = 25;
  achatsArticlesCurrentPage = 1;
  achatsArticlesTotalRecords = 0;
  achatsArticlesTotalPages = 0;
  achatsArticlesSortColumn = 'total_ttc';
  achatsArticlesSortDirection: 'ASC' | 'DESC' = 'DESC';

  fournisseurSuggestions: any[] = [];
  articleSuggestions: any[] = [];
  activeAutocomplete: string | null = null;
  private autocompleteTimer: any = null;

  constructor(private achatsService: AchatsService) {}

  ngOnInit(): void {
    this.getFacturesFournisseur();
  }

  switchTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'factures-fournisseur' && this.facturesFournisseur.length === 0) {
      this.getFacturesFournisseur();
    } else if (tab === 'achats-fournisseurs' && this.achatsFournisseurs.length === 0) {
      this.getAchatsFournisseurs();
    } else if (tab === 'achats-articles' && this.achatsArticles.length === 0) {
      this.getAchatsArticles();
    }
  }

  getFacturesFournisseur(): void {
    this.facturesFournisseurLoading = true;
    this.achatsService.getReportingFacturesFournisseur(this.buildFacturesOptions()).subscribe({
      next: (response: any) => {
        this.facturesFournisseur = response.data || [];
        this.facturesFournisseurTotalRecords = response.pagination?.total || 0;
        this.facturesFournisseurTotalPages = response.pagination?.totalPages || 0;
        this.facturesFournisseurLoading = false;
      },
      error: () => {
        Swal.fire('Erreur', 'Erreur lors du chargement des factures fournisseur', 'error');
        this.facturesFournisseurLoading = false;
      }
    });
  }

  getAchatsFournisseurs(): void {
    this.achatsFournisseursLoading = true;
    this.achatsService.getReportingAchatsFournisseurs(this.buildFournisseursOptions()).subscribe({
      next: (response: any) => {
        this.achatsFournisseurs = response.data || [];
        this.achatsFournisseursTotalRecords = response.pagination?.total || 0;
        this.achatsFournisseursTotalPages = response.pagination?.totalPages || 0;
        this.achatsFournisseursLoading = false;
      },
      error: () => {
        Swal.fire('Erreur', 'Erreur lors du chargement des achats par fournisseur', 'error');
        this.achatsFournisseursLoading = false;
      }
    });
  }

  getAchatsArticles(): void {
    this.achatsArticlesLoading = true;
    this.achatsService.getReportingAchatsArticles(this.buildArticlesOptions()).subscribe({
      next: (response: any) => {
        this.achatsArticles = response.data || [];
        this.achatsArticlesTotalRecords = response.pagination?.total || 0;
        this.achatsArticlesTotalPages = response.pagination?.totalPages || 0;
        this.achatsArticlesLoading = false;
      },
      error: () => {
        Swal.fire('Erreur', 'Erreur lors du chargement des achats par article', 'error');
        this.achatsArticlesLoading = false;
      }
    });
  }

  buildFacturesOptions(): any {
    return {
      page: this.facturesFournisseurCurrentPage,
      pageSize: this.facturesFournisseurPageSize,
      orderBy: this.facturesFournisseurSortColumn,
      orderDirection: this.facturesFournisseurSortDirection,
      search: this.facturesFournisseurSearchTerm,
      dateFrom: this.facturesFournisseurDateFrom,
      dateTo: this.facturesFournisseurDateTo
    };
  }

  buildFournisseursOptions(): any {
    return {
      page: this.achatsFournisseursCurrentPage,
      pageSize: this.achatsFournisseursPageSize,
      orderBy: this.achatsFournisseursSortColumn,
      orderDirection: this.achatsFournisseursSortDirection,
      search: this.achatsFournisseursSearchTerm,
      dateFrom: this.achatsFournisseursDateFrom,
      dateTo: this.achatsFournisseursDateTo
    };
  }

  buildArticlesOptions(): any {
    return {
      page: this.achatsArticlesCurrentPage,
      pageSize: this.achatsArticlesPageSize,
      orderBy: this.achatsArticlesSortColumn,
      orderDirection: this.achatsArticlesSortDirection,
      search: this.achatsArticlesSearchTerm,
      dateFrom: this.achatsArticlesDateFrom,
      dateTo: this.achatsArticlesDateTo
    };
  }

  onFacturesSearch(): void {
    this.facturesFournisseurCurrentPage = 1;
    this.getFacturesFournisseur();
  }

  onFournisseursSearch(): void {
    this.achatsFournisseursCurrentPage = 1;
    this.getAchatsFournisseurs();
  }

  onArticlesSearch(): void {
    this.achatsArticlesCurrentPage = 1;
    this.getAchatsArticles();
  }

  onFournisseurInput(section: string, value: string): void {
    if (section === 'factures-fournisseur') this.facturesFournisseurSearchTerm = value || '';
    if (section === 'achats-fournisseurs') this.achatsFournisseursSearchTerm = value || '';
    this.activeAutocomplete = section;
    this.loadFournisseurSuggestions(value);
  }

  onArticleInput(value: string): void {
    this.achatsArticlesSearchTerm = value || '';
    this.activeAutocomplete = 'achats-articles';
    this.loadArticleSuggestions(value);
  }

  showFournisseurAutocomplete(section: string, value: string = ''): void {
    this.activeAutocomplete = section;
    this.loadFournisseurSuggestions(value);
  }

  showArticleAutocomplete(value: string = ''): void {
    this.activeAutocomplete = 'achats-articles';
    this.loadArticleSuggestions(value);
  }

  hideAutocompleteDelayed(): void {
    setTimeout(() => this.activeAutocomplete = null, 180);
  }

  selectFournisseur(section: string, fournisseur: any): void {
    const name = fournisseur?.fournisseur_nom || '';
    if (section === 'factures-fournisseur') {
      this.facturesFournisseurSearchTerm = name;
      this.onFacturesSearch();
    } else if (section === 'achats-fournisseurs') {
      this.achatsFournisseursSearchTerm = name;
      this.onFournisseursSearch();
    }
    this.activeAutocomplete = null;
    this.fournisseurSuggestions = [];
  }

  selectArticle(article: any): void {
    this.achatsArticlesSearchTerm = article?.article_nom || article?.article_cod || '';
    this.activeAutocomplete = null;
    this.articleSuggestions = [];
    this.onArticlesSearch();
  }

  loadFournisseurSuggestions(search: string = ''): void {
    if (this.autocompleteTimer) clearTimeout(this.autocompleteTimer);
    this.autocompleteTimer = setTimeout(() => {
      this.achatsService.getAchatFournisseurSuggestions({ search: search || '', limit: 20 }).subscribe({
        next: (response: any) => this.fournisseurSuggestions = response.data || [],
        error: () => this.fournisseurSuggestions = []
      });
    }, 150);
  }

  loadArticleSuggestions(search: string = ''): void {
    if (this.autocompleteTimer) clearTimeout(this.autocompleteTimer);
    this.autocompleteTimer = setTimeout(() => {
      this.achatsService.getAchatArticleSuggestions({ search: search || '', limit: 20 }).subscribe({
        next: (response: any) => this.articleSuggestions = response.data || [],
        error: () => this.articleSuggestions = []
      });
    }, 150);
  }

  changePage(section: string, page: number): void {
    if (page < 1) return;
    if (section === 'factures-fournisseur') {
      this.facturesFournisseurCurrentPage = page;
      this.getFacturesFournisseur();
    } else if (section === 'achats-fournisseurs') {
      this.achatsFournisseursCurrentPage = page;
      this.getAchatsFournisseurs();
    } else if (section === 'achats-articles') {
      this.achatsArticlesCurrentPage = page;
      this.getAchatsArticles();
    }
  }

  exportFacturesFournisseur(format: 'pdf' | 'excel'): void {
    if (this.facturesFournisseur.length === 0) {
      Swal.fire('Erreur', 'Aucune donnee a exporter', 'error');
      return;
    }

    const headers = ['Facture', 'Date', 'Fournisseur', 'HT', 'TVA', 'TTC'];
    const rows = this.facturesFournisseur.map((item) => [
      item.facture_num || '',
      this.formatDate(item.facture_dat),
      item.fournisseur_nom || '',
      item.total_ht || 0,
      item.total_tva || 0,
      item.total_ttc || 0
    ]);

    if (format === 'pdf') {
      this.printReport('Factures fournisseur', headers, rows, [3, 4, 5]);
      return;
    }

    this.downloadCSV([headers, ...rows], 'factures-fournisseur.csv');
  }

  exportAchatsFournisseurs(format: 'pdf' | 'excel'): void {
    if (this.achatsFournisseurs.length === 0) {
      Swal.fire('Erreur', 'Aucune donnee a exporter', 'error');
      return;
    }

    const headers = ['Fournisseur', 'Factures', 'Derniere facture', 'HT', 'TVA', 'TTC', 'Moyenne'];
    const rows = this.achatsFournisseurs.map((item) => [
      item.fournisseur_nom || '',
      item.nombre_factures || 0,
      this.formatDate(item.derniere_facture_date),
      item.total_ht || 0,
      item.total_tva || 0,
      item.total_ttc || 0,
      item.montant_moyen || 0
    ]);

    if (format === 'pdf') {
      this.printReport('Achats par fournisseur', headers, rows, [3, 4, 5, 6]);
      return;
    }

    this.downloadCSV([headers, ...rows], 'achats-par-fournisseur.csv');
  }

  exportAchatsArticles(format: 'pdf' | 'excel'): void {
    if (this.achatsArticles.length === 0) {
      Swal.fire('Erreur', 'Aucune donnee a exporter', 'error');
      return;
    }

    const headers = ['Code', 'Article', 'Famille', 'Quantite', 'HT', 'TVA', 'TTC'];
    const rows = this.achatsArticles.map((item) => [
      item.article_cod || '',
      item.article_nom || '',
      item.famille_nom || '',
      item.quantite || 0,
      item.total_ht || 0,
      item.total_tva || 0,
      item.total_ttc || 0
    ]);

    if (format === 'pdf') {
      this.printReport('Achats par article', headers, rows, [3, 4, 5, 6]);
      return;
    }

    this.downloadCSV([headers, ...rows], 'achats-par-article.csv');
  }

  printReport(title: string, headers: string[], rows: any[][], moneyColumns: number[] = []): void {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${this.escapeHtml(title)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #212529; }
            h1 { color: #007bff; text-align: center; margin-bottom: 8px; }
            .date { text-align: center; color: #6c757d; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f8f9fa; font-weight: bold; }
            .text-end { text-align: right; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <h1>${this.escapeHtml(title)}</h1>
          <div class="date">${new Date().toLocaleDateString('fr-FR')}</div>
          <table>
            <thead>
              <tr>${headers.map((header, index) => `<th class="${moneyColumns.includes(index) ? 'text-end' : ''}">${this.escapeHtml(header)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  ${row.map((cell, index) => `
                    <td class="${moneyColumns.includes(index) ? 'text-end' : ''}">
                      ${moneyColumns.includes(index) ? this.formatCurrency(Number(cell || 0)) : this.escapeHtml(cell)}
                    </td>
                  `).join('')}
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

  downloadCSV(data: any[][], filename: string): void {
    const csvContent = data.map((row) =>
      row.map((cell) => {
        const value = cell === null || cell === undefined ? '' : String(cell);
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
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
    URL.revokeObjectURL(url);
  }

  escapeHtml(value: any): string {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  formatCurrency(amount: number): string {
    const value = Number(amount || 0);
    const sign = value < 0 ? '-' : '';
    const formatted = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value));
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
}
