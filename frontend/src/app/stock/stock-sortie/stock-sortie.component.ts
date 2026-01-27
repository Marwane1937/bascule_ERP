import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { StockService } from 'src/app/service/stock.service';
import { BaseService } from 'src/app/service/base.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-stock-sortie',
  templateUrl: './stock-sortie.component.html',
  styleUrls: ['./stock-sortie.component.css']
})
export class StockSortieComponent implements OnInit {
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
  filterClient: string = '';

  // Formulaire d'ajout
  SortieStockForm!: FormGroup;
  clients: any[] = [];
  filteredClients: any[] = [];
  searchClient: string = '';
  nextSortieStockNumero: string = 'SORT22-0001';

  constructor(
    private stockService: StockService,
    private fb: FormBuilder,
    private router: Router,
    private baseService: BaseService
  ) { }

  ngOnInit(): void {
    this.getSortiesStock();
    this.initForm();
    this.loadClients();
    this.loadNextSortieStockNumero();
  }

  initForm(): void {
    const today = new Date().toISOString().split('T')[0];
    
    this.SortieStockForm = this.fb.group({
      date: [today],
      description: [''],
      part_id: [0, Validators.required], // Client obligatoire
      contact_id: [0],
      clientSearch: ['']
    });
  }

  loadClients(): void {
    this.baseService.getClient().subscribe({
      next: (response: any) => {
        const data = response?.data || response || [];
        this.clients = Array.isArray(data) ? data : [];
        this.filteredClients = [...this.clients];
      },
      error: (error) => {
      }
    });
  }

  onClientSearchChange(value: string): void {
    this.searchClient = value || '';
    if (!value || value.trim() === '') {
      this.filteredClients = [...this.clients];
      return;
    }
    const searchLower = value.toLowerCase().trim();
    this.filteredClients = this.clients.filter(c => 
      c.nom?.toLowerCase().includes(searchLower)
    );
  }

  selectClient(client: any): void {
    this.SortieStockForm.patchValue({
      part_id: client.part_id,
      clientSearch: client.nom
    });
    this.filteredClients = [];
    this.searchClient = client.nom;
  }

  loadNextSortieStockNumero(): void {
    this.stockService.getNextSortieStockNumero().subscribe({
      next: (response: any) => {
        if (response?.success && response?.data?.numero) {
          this.nextSortieStockNumero = response.data.numero;
        }
      },
      error: (error) => {
      }
    });
  }

  onSubmitSortieStock(): void {
    if (this.SortieStockForm.valid) {
      const formValue = {
        ...this.SortieStockForm.value
      };
      
      this.stockService.createSortieStock(formValue).subscribe({
        next: (response: any) => {
          Swal.fire({
            icon: 'success',
            title: 'Succès',
            text: `Sortie de stock ${response.numero || ''} créée avec succès !`,
            timer: 2000,
            showConfirmButton: false
          });
          
          // Fermer la modal
          const modal = document.getElementById('addSortieStockModal');
          if (modal) {
            const bsModal = (window as any).bootstrap?.Modal?.getInstance(modal);
            if (bsModal) {
              bsModal.hide();
            }
          }
          
          // Rediriger vers la page d'édition
          if (response.id || response.stockId) {
            this.router.navigate(['/Edit-SortieStock', response.id || response.stockId]);
          } else {
            this.SortieStockForm.reset();
            this.initForm();
            this.loadNextSortieStockNumero();
            this.getSortiesStock();
          }
        },
        error: (err) => {
          Swal.fire({
            icon: 'error',
            title: 'Erreur',
            text: `Une erreur s'est produite lors de la création de la sortie de stock: ${err.error?.message || err.message || 'Erreur inconnue'}`
          });
        }
      });
    } else {
      Swal.fire({
        icon: 'warning',
        title: 'Formulaire invalide',
        text: 'Veuillez remplir tous les champs requis.'
      });
    }
  }

  getSortiesStock(): void {
    this.loading = true;

    // Nettoyer le cache des détails quand on change de page
    this.clearDetailsCache();

    const options: any = {
      page: this.currentPage,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: this.searchTerm,
      type: 22 // Type 22 pour sorties de stock
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

    this.stockService.getSortiesStock(options).subscribe({
      next: (response: any) => {
        this.achats = response.data || [];
        this.totalRecords = response.pagination?.total || 0;
        this.totalPages = response.pagination?.totalPages || 0;
        this.loading = false;
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors du chargement des sorties de stock', 'error');
        this.loading = false;
      },
    });
  }

  onSearch(): void {
    this.currentPage = 1;
    this.getSortiesStock();
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.getSortiesStock();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.getSortiesStock();
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'DESC';
    }
    this.currentPage = 1;
    this.getSortiesStock();
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
    this.filterClient = '';
    this.currentPage = 1;
    this.getSortiesStock();
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

  editSortieStock(documentId: number): void {
    this.router.navigate(['/Edit-SortieStock', documentId]);
  }

  isButtonDisabled(achatId: number): boolean {
    // Désactiver le bouton par défaut, l'activer seulement quand les détails sont chargés
    return !this.detailsLoaded[achatId];
  }

  accepterSortieStock(achat: any): void {
    const details = this.getAchatDetails(achat.document_id);

    if (details.length === 0) {
      Swal.fire('Erreur', 'Aucun détail trouvé pour cette sortie', 'error');
      return;
    }

    // Créer les détails pour la sortie de stock
    const stockDetails = details.map(detail => ({
      article_id: detail.article_id,
      quantite: detail.quantite,
      prix: detail.prix,
      taux_tva: detail.taux_tva,
      sens: -1 // Sortie = -1
    }));

    Swal.fire({
      title: 'Confirmation',
      text: `Confirmer la sortie en stock de ${details.length} article(s) depuis la sortie ${achat.numero} ?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Oui, accepter',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.stockService.createSortieStockFromVente(achat.document_id, stockDetails).subscribe({
          next: (response: any) => {
            Swal.fire('Succès', response.message || 'Sortie de stock créée avec succès', 'success');

            // Fermer la ligne expandée et nettoyer le cache pour cette sortie
            Object.keys(this.expandedRows).forEach(key => {
              this.expandedRows[parseInt(key)] = false;
            });

            // Supprimer les détails de la sortie traitée du cache
            delete this.achatDetails[achat.document_id];
            delete this.loadingDetails[achat.document_id];

            this.getSortiesStock();
          },
          error: (error) => {
            Swal.fire('Erreur', error.error?.message || 'Erreur lors de la création de la sortie de stock', 'error');
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

