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
  mouvements: any[] = [];
  mouvementDetails: { [key: number]: any[] } = {};
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
  filterType: string = '';
  filterArticle: string = '';

  // Types de mouvements
  typesMouvement: any[] = [
    { value: '', label: 'Tous les types' },
    { value: '20', label: 'Inventaire' },
    { value: '21', label: 'Entrée de stock' },
    { value: '22', label: 'Sortie de stock' }
  ];

  constructor(private stockService: StockService) { }

  ngOnInit(): void {
    this.getHistoriqueMouvements();
  }

  // Récupération de l'historique des mouvements
  getHistoriqueMouvements(): void {
    this.loading = true;

    const options: any = {
      page: this.currentPage,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: this.searchTerm
    };

    // Ajouter les filtres avancés si activés
    if (this.showAdvancedFilters) {
      if (this.filterDateFrom) options.dateFrom = this.filterDateFrom;
      if (this.filterDateTo) options.dateTo = this.filterDateTo;
      if (this.filterType) options.type = this.filterType;
      if (this.filterArticle) options.article = this.filterArticle;
    }

    // Pour l'instant, utiliser une requête qui retourne des données d'exemple
    // TODO: Créer une vraie fonction pour récupérer l'historique des mouvements
    this.stockService.getAchatsNonEntresStock(options).subscribe({
      next: (response: any) => {
        // Transformer les données pour simuler des mouvements
        this.mouvements = (response.data || []).slice(0, 10).map((item: any, index: number) => ({
          id: index + 1,
          numero: `MV${String(index + 1).padStart(3, '0')}`,
          date: new Date(Date.now() - index * 86400000), // Dates décroissantes
          type: Math.floor(Math.random() * 3) + 20, // 20, 21, ou 22
          description: `Mouvement ${index + 1}`,
          utilisateur: 'Admin',
          articles_count: Math.floor(Math.random() * 5) + 1,
          total_quantite: Math.floor(Math.random() * 100) + 10
        }));
        this.totalRecords = this.mouvements.length;
        this.totalPages = Math.ceil(this.totalRecords / this.pageSize);
        this.loading = false;
      },
      error: (error) => {
        console.error('Erreur chargement historique:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement de l\'historique', 'error');
        this.loading = false;
      }
    });
  }

  // Recherche
  onSearch(): void {
    this.currentPage = 1;
    this.getHistoriqueMouvements();
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
    this.getHistoriqueMouvements();
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
      this.getHistoriqueMouvements();
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
    this.getHistoriqueMouvements();
  }

  resetFilters(): void {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterType = '';
    this.filterArticle = '';
    this.currentPage = 1;
    this.getHistoriqueMouvements();
  }

  // Gestion des détails
  toggleRowExpansion(mouvement: any, index: number): void {
    if (this.expandedRows[index]) {
      // Fermer la ligne
      this.expandedRows[index] = false;
    } else {
      // Ouvrir la ligne et charger les détails si pas encore chargés
      this.expandedRows[index] = true;

      if (!this.mouvementDetails[mouvement.id]) {
        this.loadingDetails[mouvement.id] = true;

        // Simuler le chargement des détails
        setTimeout(() => {
          this.mouvementDetails[mouvement.id] = Array.from({ length: mouvement.articles_count }, (_, i) => ({
            article_nom: `Article ${i + 1}`,
            article_cod: `ART${String(i + 1).padStart(3, '0')}`,
            quantite: Math.floor(Math.random() * 10) + 1,
            sens: mouvement.type === 21 ? 1 : -1 // Entrée ou sortie
          }));
          this.loadingDetails[mouvement.id] = false;
          this.detailsLoaded[mouvement.id] = true;
        }, 500);
      }
    }
  }

  getMouvementDetails(mouvementId: number): any[] {
    return this.mouvementDetails[mouvementId] || [];
  }

  isLoadingDetails(mouvementId: number): boolean {
    return this.loadingDetails[mouvementId] || false;
  }

  // Utilitaires
  getTypeLabel(type: number): string {
    switch (type) {
      case 20: return 'Inventaire';
      case 21: return 'Entrée de stock';
      case 22: return 'Sortie de stock';
      default: return 'Inconnu';
    }
  }

  getTypeBadgeClass(type: number): string {
    switch (type) {
      case 20: return 'badge bg-success';
      case 21: return 'badge bg-primary';
      case 22: return 'badge bg-warning';
      default: return 'badge bg-secondary';
    }
  }

  getSensLabel(sens: number): string {
    return sens === 1 ? 'Entrée' : 'Sortie';
  }

  getSensBadgeClass(sens: number): string {
    return sens === 1 ? 'badge bg-success' : 'badge bg-danger';
  }

  // Export
  exporterHistorique(): void {
    Swal.fire('Information', 'Fonctionnalité d\'export à implémenter', 'info');
  }
}

