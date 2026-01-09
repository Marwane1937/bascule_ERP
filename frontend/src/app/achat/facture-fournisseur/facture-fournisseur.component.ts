import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AchatsService } from 'src/app/service/achats.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-facture-fournisseur',
  templateUrl: './facture-fournisseur.component.html',
  styleUrls: ['./facture-fournisseur.component.css']
})
export class FactureFournisseurComponent implements OnInit {
  factures: any[] = [];
  loading: boolean = true;
  successMessage: string | null = null;
  isError: boolean = false;
  
  // Pagination
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 0;
  searchTerm: string = '';
  
  // Tri
  sortColumn: string = 'facture_dat';
  sortDirection: 'ASC' | 'DESC' = 'DESC';
  
  // Filtres avancés
  showAdvancedFilters: boolean = false;
  filterDateFrom: string = '';
  filterDateTo: string = '';
  filterFournisseur: string = '';
  filterMontantMin: number | null = null;
  filterMontantMax: number | null = null;
  
  // Modal transfert commande → facture
  showTransfertModal: boolean = false;
  commandesNonFacturees: any[] = [];
  commandesNonFactureesFiltered: any[] = [];
  loadingCommandes: boolean = false;
  
  // Pagination et tri pour le modal
  modalCurrentPage: number = 1;
  modalPageSize: number = 10;
  modalTotalPages: number = 1;
  modalSortColumn: string = 'date';
  modalSortDirection: 'ASC' | 'DESC' = 'DESC';
  modalSearchTerm: string = '';

  constructor(
    private achatsService: AchatsService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadFactures(1, '', false);
  }

  loadFactures(page: number = 1, search: string = '', resetFilters: boolean = false): void {
    this.loading = true;
    this.currentPage = page;
    this.searchTerm = search;
    
    if (resetFilters) {
      this.filterDateFrom = '';
      this.filterDateTo = '';
      this.filterFournisseur = '';
      this.filterMontantMin = null;
      this.filterMontantMax = null;
    }

    this.achatsService.getFacturesFournisseur({
      page: page,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: search
    }).subscribe({
      next: (response: any) => {
        const result = response.data || [];
        const pagination = response.pagination || {};
        
        this.factures = Array.isArray(result) ? result : [];
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;
        
        console.log(`[FactureFournisseurComponent] Page ${page}/${this.totalPages}, ${this.factures.length} factures chargées`);
        
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('[FactureFournisseurComponent] ❌ Erreur:', err);
        this.showError("❌ Erreur lors du chargement des factures fournisseur.");
        this.loading = false;
        this.factures = [];
        this.cdr.detectChanges();
      }
    });
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.loadFactures(page, this.searchTerm);
    }
  }

  onPageSizeChange(event: any): void {
    const newPageSize = parseInt(event.target.value);
    if (newPageSize > 0) {
      this.pageSize = newPageSize;
      this.loadFactures(1, this.searchTerm);
    }
  }

  onSearch(): void {
    this.loadFactures(1, this.searchTerm);
  }

  onSearchKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearch();
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  getDisplayRange(): string {
    const start = ((this.currentPage - 1) * this.pageSize) + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `${start} à ${end}`;
  }

  showError(message: string) {
    this.successMessage = message;
    this.isError = true;
    setTimeout(() => { this.successMessage = null; }, 5000);
  }

  showNotification(message: string, isError: boolean = false) {
    this.successMessage = message;
    this.isError = isError;
    setTimeout(() => { this.successMessage = null; }, 5000);
  }

  // Tri par colonne
  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'DESC';
    }
    this.loadFactures(1, this.searchTerm);
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort';
    }
    return this.sortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // Filtres avancés
  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  onFilterChange(): void {
    this.loadFactures(this.currentPage, this.searchTerm);
  }

  resetFilters(): void {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterFournisseur = '';
    this.filterMontantMin = null;
    this.filterMontantMax = null;
    this.loadFactures(1, this.searchTerm, true);
  }

  // Export CSV
  exportToCSV(): void {
    const headers = ['Numéro', 'Date', 'Fournisseur', 'HT', 'TVA', 'TTC'];
    const rows = this.factures.map(f => [
      f.facture_num || '',
      f.facture_dat ? new Date(f.facture_dat).toLocaleDateString('fr-FR') : '',
      f.fournisseur || '',
      (f.facture_ht || 0).toFixed(2),
      (f.facture_tva || 0).toFixed(2),
      ((f.facture_ht || 0) + (f.facture_tva || 0)).toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `factures_fournisseur_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    this.showNotification('✅ Export CSV réussi !', false);
  }

  // Imprimer une facture fournisseur
  onPrintFacture(factureId: number): void {
    if (!factureId) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'ID de facture introuvable.' });
      return;
    }
    
    Swal.fire({
      title: 'Génération du PDF...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    
    this.achatsService.telechargerPDFFactureFournisseur(factureId).subscribe({
      next: (response: Blob) => {
        Swal.close();
        const file = new Blob([response], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(file);
        window.open(fileURL, '_blank');
      },
      error: (err) => {
        Swal.close();
        console.error('Erreur génération PDF facture fournisseur :', err);
        Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors de la génération du PDF." });
      }
    });
  }

  // Supprimer une facture
  deleteFacture(factureId: number): void {
    Swal.fire({
      title: 'Êtes-vous sûr ?',
      text: "Cette action est irréversible !",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.achatsService.deleteFactureFournisseur(factureId).subscribe({
          next: () => {
            Swal.fire('Supprimé !', 'La facture a été supprimée.', 'success');
            this.loadFactures(this.currentPage, this.searchTerm);
          },
          error: (err) => {
            console.error('Erreur suppression:', err);
            Swal.fire('Erreur', 'Impossible de supprimer la facture.', 'error');
          }
        });
      }
    });
  }

  // ===== TRANSFERT COMMANDE → FACTURE =====
  
  openTransfertModal(): void {
    this.showTransfertModal = true;
    this.loadingCommandes = true;
    this.modalCurrentPage = 1;
    this.modalSearchTerm = '';
    
    this.achatsService.getCommandesNonFacturees().subscribe({
      next: (response: any) => {
        this.commandesNonFacturees = response.data || [];
        this.applyModalFiltersAndSort();
        this.loadingCommandes = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Erreur chargement commandes:', err);
        this.commandesNonFacturees = [];
        this.commandesNonFactureesFiltered = [];
        this.loadingCommandes = false;
        Swal.fire('Erreur', 'Impossible de charger les commandes non facturées.', 'error');
      }
    });
  }

  closeTransfertModal(): void {
    this.showTransfertModal = false;
    this.commandesNonFacturees = [];
    this.commandesNonFactureesFiltered = [];
    this.modalSearchTerm = '';
  }

  // Appliquer filtres et tri au modal
  applyModalFiltersAndSort(): void {
    let filtered = [...this.commandesNonFacturees];

    // Filtre par recherche
    if (this.modalSearchTerm.trim()) {
      const search = this.modalSearchTerm.toLowerCase();
      filtered = filtered.filter(cmd => 
        (cmd.numero?.toLowerCase().includes(search)) ||
        (cmd.fournisseur?.toLowerCase().includes(search)) ||
        (cmd.description?.toLowerCase().includes(search))
      );
    }

    // Tri
    filtered.sort((a, b) => {
      let valA = a[this.modalSortColumn];
      let valB = b[this.modalSortColumn];

      if (this.modalSortColumn === 'date') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else if (this.modalSortColumn === 'total_ht') {
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
      } else {
        valA = (valA || '').toString().toLowerCase();
        valB = (valB || '').toString().toLowerCase();
      }

      if (this.modalSortDirection === 'ASC') {
        return valA > valB ? 1 : valA < valB ? -1 : 0;
      } else {
        return valA < valB ? 1 : valA > valB ? -1 : 0;
      }
    });

    // Pagination
    this.modalTotalPages = Math.ceil(filtered.length / this.modalPageSize) || 1;
    if (this.modalCurrentPage > this.modalTotalPages) {
      this.modalCurrentPage = 1;
    }
    const start = (this.modalCurrentPage - 1) * this.modalPageSize;
    const end = start + this.modalPageSize;
    this.commandesNonFactureesFiltered = filtered.slice(start, end);
  }

  onModalSort(column: string): void {
    if (this.modalSortColumn === column) {
      this.modalSortDirection = this.modalSortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.modalSortColumn = column;
      this.modalSortDirection = 'DESC';
    }
    this.applyModalFiltersAndSort();
  }

  getModalSortIcon(column: string): string {
    if (this.modalSortColumn !== column) return 'fa-sort';
    return this.modalSortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  onModalPageChange(page: number): void {
    if (page >= 1 && page <= this.modalTotalPages) {
      this.modalCurrentPage = page;
      this.applyModalFiltersAndSort();
    }
  }

  onModalSearch(): void {
    this.modalCurrentPage = 1;
    this.applyModalFiltersAndSort();
  }

  getModalPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPages = 5;
    let start = Math.max(1, this.modalCurrentPage - Math.floor(maxPages / 2));
    let end = Math.min(this.modalTotalPages, start + maxPages - 1);
    if (end - start < maxPages - 1) {
      start = Math.max(1, end - maxPages + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  getTotalCommandesCount(): number {
    return this.commandesNonFacturees.length;
  }

  transfererCommande(commandeId: number): void {
    Swal.fire({
      title: 'Créer une facture ?',
      text: "Cette commande sera transformée en facture fournisseur.",
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Oui, créer la facture',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire({
          title: 'Création en cours...',
          allowOutsideClick: false,
          didOpen: () => { Swal.showLoading(); }
        });

        this.achatsService.createFactureFournisseurFromCommande(commandeId).subscribe({
          next: (response: any) => {
            Swal.fire({
              icon: 'success',
              title: 'Facture créée !',
              text: `Facture ${response.data?.numero || ''} créée avec succès.`
            });
            this.closeTransfertModal();
            this.loadFactures(1, '');
          },
          error: (err) => {
            console.error('Erreur création facture:', err);
            Swal.fire('Erreur', err.error?.message || 'Impossible de créer la facture.', 'error');
          }
        });
      }
    });
  }
}

