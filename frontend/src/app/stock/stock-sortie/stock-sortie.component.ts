import { Component, OnInit } from '@angular/core';
import { StockService } from '../../service/stock.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-stock-sortie',
  templateUrl: './stock-sortie.component.html',
  styleUrls: ['./stock-sortie.component.css']
})
export class StockSortieComponent implements OnInit {

  // Données
  ventes: any[] = [];
  venteDetails: { [key: number]: any[] } = {};
  loadingDetails: { [key: number]: boolean } = {};
  detailsLoaded: { [key: number]: boolean } = {};
  expandedRows: { [key: number]: boolean } = {};

  // État
  loading: boolean = false;
  showAdvancedFilters: boolean = false;

  // Pagination
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 1;

  // Recherche et tri
  searchTerm: string = '';
  sortColumn: string = 'date';
  sortDirection: 'ASC' | 'DESC' = 'DESC';

  // Filtres avancés
  filterDateFrom: string = '';
  filterDateTo: string = '';
  filterClient: string = '';

  constructor(private stockService: StockService) { }

  ngOnInit(): void {
    this.getDemandesSortie();
  }

  // Récupération des ventes non sorties
  getDemandesSortie(): void {
    this.loading = true;

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
    if (this.filterClient && this.filterClient.trim()) {
      options.client = this.filterClient.trim();
    }

    this.stockService.getVentesNonSortiesStock(options).subscribe({
      next: (response: any) => {
        this.ventes = response.data || [];
        this.totalRecords = response.pagination?.total || 0;
        this.totalPages = response.pagination?.totalPages || 1;
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Erreur chargement ventes:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement des ventes', 'error');
        this.loading = false;
      }
    });
  }

  // Recherche
  onSearch(): void {
    this.currentPage = 1;
    this.getDemandesSortie();
  }

  // Tri
  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'DESC';
    }
    this.currentPage = 1;
    this.getDemandesSortie();
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort';
    }
    return this.sortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // Pagination
  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.getDemandesSortie();
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

  // Filtres
  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.getDemandesSortie();
  }

  resetFilters(): void {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterClient = '';
    this.currentPage = 1;
    this.getDemandesSortie();
  }

  // Gestion des détails
  toggleRowExpansion(vente: any, index: number): void {
    if (this.expandedRows[index]) {
      // Fermer la ligne
      this.expandedRows[index] = false;
    } else {
      // Ouvrir la ligne et charger les détails si pas encore chargés
      this.expandedRows[index] = true;

      if (!this.venteDetails[vente.document_id]) {
        this.loadingDetails[vente.document_id] = true;
        this.stockService.getVenteDetailsForStock(vente.document_id).subscribe({
          next: (details: any) => {
            this.venteDetails[vente.document_id] = details || [];
            this.loadingDetails[vente.document_id] = false;
            this.detailsLoaded[vente.document_id] = true;
          },
          error: (error: any) => {
            console.error('Erreur chargement détails vente:', error);
            Swal.fire('Erreur', 'Erreur lors du chargement des détails', 'error');
            this.expandedRows[index] = false;
            this.loadingDetails[vente.document_id] = false;
          }
        });
      }
    }
  }

  getVenteDetails(venteId: number): any[] {
    return this.venteDetails[venteId] || [];
  }

  isLoadingDetails(venteId: number): boolean {
    return this.loadingDetails[venteId] || false;
  }

  isButtonDisabled(venteId: number): boolean {
    // Désactiver le bouton par défaut, l'activer seulement quand les détails sont chargés
    return !this.detailsLoaded[venteId];
  }

  // Acceptation de sortie de stock
  accepterSortieStock(vente: any): void {
    Swal.fire({
      title: 'Confirmation',
      text: `Confirmer la sortie en stock pour la vente ${vente.numero} ?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Oui, sortir',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.executerSortieStock(vente);
      }
    });
  }

  private executerSortieStock(vente: any): void {
    // Récupérer les détails de la vente
    const details = this.getVenteDetails(vente.document_id);

    if (details.length === 0) {
      Swal.fire('Erreur', 'Aucun détail trouvé pour cette vente', 'error');
      return;
    }

    // Créer les détails pour la sortie de stock
    const stockDetails = details.map(detail => ({
      article_id: detail.article_id,
      quantite: detail.quantite,
      prix: detail.prix,
      taux_tva: detail.taux_tva
    }));

    // Créer la sortie de stock depuis la vente
    this.stockService.createSortieStockFromVente(vente.document_id, stockDetails).subscribe({
      next: (response: any) => {
        Swal.fire('Succès', response.message || 'Sortie de stock créée avec succès', 'success');

        // Fermer la ligne expandée et nettoyer le cache
        Object.keys(this.expandedRows).forEach(key => {
          this.expandedRows[parseInt(key)] = false;
        });

        // Supprimer les détails de la vente traitée du cache
        delete this.venteDetails[vente.document_id];
        delete this.loadingDetails[vente.document_id];
        delete this.detailsLoaded[vente.document_id];

        // Recharger les données
        this.getDemandesSortie();
      },
      error: (error: any) => {
        console.error('Erreur création sortie stock:', error);
        Swal.fire('Erreur', error.error?.message || 'Erreur lors de la création de la sortie de stock', 'error');
      }
    });
  }

  // Création de sortie manuelle (TODO: à implémenter)
  creerSortieManuelle(): void {
    Swal.fire('Information', 'Fonctionnalité à implémenter : création de sortie manuelle', 'info');
  }
}

