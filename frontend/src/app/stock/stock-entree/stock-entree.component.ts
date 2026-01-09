import { Component, OnInit } from '@angular/core';
import { StockService } from 'src/app/service/stock.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-stock-entree',
  templateUrl: './stock-entree.component.html',
  styleUrls: ['./stock-entree.component.css']
})
export class StockEntreeComponent implements OnInit {
  achats: any[] = [];
  loading: boolean = true;
  searchTerm: string = '';
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 0;
  expandedRows: { [key: number]: boolean } = {};
  achatDetails: { [key: number]: any[] } = {};
  loadingDetails: { [key: number]: boolean } = {};
  detailsLoaded: { [key: number]: boolean } = {};
  sortColumn: string = 'date';
  sortDirection: 'ASC' | 'DESC' = 'DESC';

  // Filtres avancés
  showAdvancedFilters: boolean = false;
  filterDateFrom: string = '';
  filterDateTo: string = '';
  filterFournisseur: string = '';

  constructor(private stockService: StockService) { }

  ngOnInit(): void {
    this.getAchatsNonEntres();
  }

  getAchatsNonEntres(): void {
    this.loading = true;

    // Nettoyer le cache des détails quand on change de page
    this.clearDetailsCache();

    const options: any = {
      page: this.currentPage,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: this.searchTerm
    };

    // Ajouter les filtres avancés s'ils sont définis
    if (this.filterDateFrom) {
      options.dateFrom = this.filterDateFrom;
    }
    if (this.filterDateTo) {
      options.dateTo = this.filterDateTo;
    }
    if (this.filterFournisseur && this.filterFournisseur.trim()) {
      options.fournisseur = this.filterFournisseur.trim();
    }

    this.stockService.getAchatsNonEntresStock(options).subscribe({
      next: (response: any) => {
        this.achats = response.data || [];
        this.totalRecords = response.pagination?.total || 0;
        this.totalPages = response.pagination?.totalPages || 0;
        this.loading = false;
      },
      error: (error) => {
        console.error('Erreur chargement achats:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement des achats', 'error');
        this.loading = false;
      },
    });
  }

  onSearch(): void {
    this.currentPage = 1;
    this.getAchatsNonEntres();
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.getAchatsNonEntres();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.getAchatsNonEntres();
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'DESC';
    }
    this.currentPage = 1;
    this.getAchatsNonEntres();
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort';
    }
    return this.sortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterFournisseur = '';
    this.currentPage = 1;
    this.getAchatsNonEntres();
  }

  toggleRowExpansion(achat: any, index: number): void {
    if (this.expandedRows[index]) {
      // Fermer la ligne
      this.expandedRows[index] = false;
    } else {
      // Ouvrir la ligne et charger les détails si pas encore chargés
      this.expandedRows[index] = true;

      if (!this.achatDetails[achat.document_id]) {
        // Afficher l'indicateur de chargement
        this.loadingDetails[achat.document_id] = true;

            this.stockService.getAchatDetailsForStock(achat.document_id).subscribe({
              next: (details: any) => {
                this.achatDetails[achat.document_id] = details || [];
                this.loadingDetails[achat.document_id] = false;
                this.detailsLoaded[achat.document_id] = true;
              },
              error: (error) => {
                console.error('Erreur chargement détails:', error);
                Swal.fire('Erreur', 'Erreur lors du chargement des détails', 'error');
                this.expandedRows[index] = false;
                this.loadingDetails[achat.document_id] = false;
              }
            });
      }
    }
  }


  getAchatDetails(achatId: number): any[] {
    return this.achatDetails[achatId] || [];
  }

  isLoadingDetails(achatId: number): boolean {
    return this.loadingDetails[achatId] || false;
  }

  isButtonDisabled(achatId: number): boolean {
    // Désactiver le bouton par défaut, l'activer seulement quand les détails sont chargés
    return !this.detailsLoaded[achatId];
  }

  accepterEntreeStock(achat: any): void {
    const details = this.getAchatDetails(achat.document_id);

    if (details.length === 0) {
      Swal.fire('Erreur', 'Aucun détail trouvé pour cet achat', 'error');
      return;
    }

    // Créer les détails pour l'entrée de stock
    const stockDetails = details.map(detail => ({
      article_id: detail.article_id,
      quantite: detail.quantite,
      prix: detail.prix,
      taux_tva: detail.taux_tva
    }));

    Swal.fire({
      title: 'Confirmation',
      text: `Confirmer l'entrée en stock de ${details.length} article(s) depuis l'achat ${achat.numero} ?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Oui, accepter',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.stockService.createEntreeStockFromAchat(achat.document_id, stockDetails).subscribe({
          next: (response: any) => {
            Swal.fire('Succès', response.message || 'Entrée de stock créée avec succès', 'success');

            // Fermer la ligne expandée et nettoyer le cache pour cet achat
            Object.keys(this.expandedRows).forEach(key => {
              this.expandedRows[parseInt(key)] = false;
            });

            // Supprimer les détails de l'achat traité du cache
            delete this.achatDetails[achat.document_id];
            delete this.loadingDetails[achat.document_id];

            this.getAchatsNonEntres();
          },
          error: (error) => {
            console.error('Erreur création entrée stock:', error);
            Swal.fire('Erreur', error.error?.message || 'Erreur lors de la création de l\'entrée de stock', 'error');
          }
        });
      }
    });
  }

  getDisplayRange(): string {
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `${start} - ${end}`;
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

  /**
   * Nettoie le cache des détails lors du changement de page
   */
  clearDetailsCache(): void {
    // Nettoyer le cache à chaque changement de page pour économiser la mémoire
    this.achatDetails = {};
    this.loadingDetails = {};
    this.detailsLoaded = {};
    this.expandedRows = {};
  }

}
