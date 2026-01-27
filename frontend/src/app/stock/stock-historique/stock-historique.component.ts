import { Component, OnInit } from '@angular/core';
import { StockService } from '../../service/stock.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-stock-historique',
  templateUrl: './stock-historique.component.html',
  styleUrls: ['./stock-historique.component.css']
})
export class StockHistoriqueComponent implements OnInit {

  // Données
  historique: any[] = [];
  
  // État
  loading: boolean = false;

  // Pagination
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 1;

  // Recherche et tri
  sortColumn: string = 'date';
  sortDirection: 'ASC' | 'DESC' = 'DESC';

  // Filtres
  filterArticleNom: string = '';
  filterDateFrom: string = '';
  filterDateTo: string = '';
  filterStatus: string = '';

  constructor(private stockService: StockService) { }

  ngOnInit(): void {
    this.getHistorique();
  }

  // Récupération de l'historique
  getHistorique(): void {
    this.loading = true;

    const options: any = {
      page: this.currentPage,
      pageSize: this.pageSize,
      article_nom: this.filterArticleNom,
      dateFrom: this.filterDateFrom,
      dateTo: this.filterDateTo,
      status: this.filterStatus
    };

    this.stockService.getStockHistorique(options).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.historique = response.data || [];
          this.totalRecords = response.pagination?.total || 0;
          this.totalPages = response.pagination?.totalPages || 1;
        } else {
          Swal.fire('Erreur', response.message || 'Erreur lors du chargement', 'error');
        }
        this.loading = false;
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors du chargement de l\'historique', 'error');
        this.loading = false;
      }
    });
  }

  // Recherche
  onSearch(): void {
    this.currentPage = 1;
    this.getHistorique();
  }

  // Pagination
  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.getHistorique();
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPages = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPages / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPages - 1);

    if (endPage - startPage < maxPages - 1) {
      startPage = Math.max(1, endPage - maxPages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  getDisplayRange(): string {
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `${start}-${end}`;
  }

  // Réinitialiser les filtres
  resetFilters(): void {
    this.filterArticleNom = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterStatus = '';
    this.currentPage = 1;
    this.getHistorique();
  }

  // Vérifier si c'est un inventaire
  isInventory(row: any): boolean {
    return row.status && row.status.toString().toLowerCase().includes('inventory');
  }

  // Vérifier si c'est une entrée (positif) ou sortie (négatif)
  isEntree(row: any): boolean {
    const quantite = parseFloat(row.quantite) || 0;
    return quantite > 0;
  }

  // Export PDF
  exportPDF(): void {
    this.loading = true;

    const options: any = {
      article_nom: this.filterArticleNom,
      dateFrom: this.filterDateFrom,
      dateTo: this.filterDateTo,
      status: this.filterStatus
    };

    this.stockService.exportStockHistoriquePDF(options).subscribe({
      next: (response: any) => {
        this.loading = false;
        if (response.success && response.pdfUrl) {
          // Ouvrir le PDF dans un nouvel onglet
          window.open(response.pdfUrl, '_blank');
          Swal.fire('Succès', 'PDF généré avec succès', 'success');
        } else {
          Swal.fire('Erreur', response.message || 'Erreur lors de la génération du PDF', 'error');
        }
      },
      error: (error) => {
        this.loading = false;
        Swal.fire('Erreur', 'Erreur lors de la génération du PDF', 'error');
      }
    });
  }

  // Export Excel
  exportExcel(): void {
    this.loading = true;

    const options: any = {
      article_nom: this.filterArticleNom,
      dateFrom: this.filterDateFrom,
      dateTo: this.filterDateTo,
      status: this.filterStatus
    };

    this.stockService.exportStockHistoriqueExcel(options).subscribe({
      next: (blob: Blob) => {
        this.loading = false;
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const dateStr = new Date().toISOString().split('T')[0];
        link.download = `historique-stock-${dateStr}.csv`;
        link.click();
        window.URL.revokeObjectURL(url);
        Swal.fire('Succès', 'Export Excel téléchargé avec succès', 'success');
      },
      error: (error) => {
        this.loading = false;
        Swal.fire('Erreur', 'Erreur lors de l\'export Excel', 'error');
      }
    });
  }
}
