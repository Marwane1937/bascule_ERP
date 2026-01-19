import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { StockService } from 'src/app/service/stock.service';
import { BaseService } from 'src/app/service/base.service';
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

  // Formulaire d'ajout
  EntreeStockForm!: FormGroup;
  fournisseurs: any[] = [];
  filteredFournisseurs: any[] = [];
  searchFournisseur: string = '';
  nextEntreeStockNumero: string = 'ENT25-0001';

  constructor(
    private stockService: StockService,
    private fb: FormBuilder,
    private router: Router,
    private baseService: BaseService
  ) { }

  ngOnInit(): void {
    this.getEntreesStock();
    this.initForm();
    this.loadFournisseurs();
    this.loadNextEntreeStockNumero();
  }

  initForm(): void {
    const today = new Date().toISOString().split('T')[0];
    
    this.EntreeStockForm = this.fb.group({
      date: [today],
      description: [''],
      part_id: [0, Validators.required], // Fournisseur obligatoire
      contact_id: [0],
      fournisseurSearch: ['']
    });
  }

  loadFournisseurs(): void {
    this.baseService.getFournisseur().subscribe({
      next: (response: any) => {
        const data = response?.data || response || [];
        this.fournisseurs = Array.isArray(data) ? data : [];
        this.filteredFournisseurs = [...this.fournisseurs];
      },
      error: (error) => {
        console.error('Erreur chargement fournisseurs:', error);
      }
    });
  }

  onFournisseurSearchChange(value: string): void {
    this.searchFournisseur = value || '';
    if (!value || value.trim() === '') {
      this.filteredFournisseurs = [...this.fournisseurs];
      return;
    }
    const searchLower = value.toLowerCase().trim();
    this.filteredFournisseurs = this.fournisseurs.filter(f => 
      f.nom?.toLowerCase().includes(searchLower)
    );
  }

  selectFournisseur(fournisseur: any): void {
    this.EntreeStockForm.patchValue({
      part_id: fournisseur.part_id,
      fournisseurSearch: fournisseur.nom
    });
    this.filteredFournisseurs = [];
    this.searchFournisseur = fournisseur.nom;
  }

  loadNextEntreeStockNumero(): void {
    this.stockService.getNextEntreeStockNumero().subscribe({
      next: (response: any) => {
        if (response?.success && response?.data?.numero) {
          this.nextEntreeStockNumero = response.data.numero;
        }
      },
      error: (error) => {
        console.error('Erreur chargement numéro:', error);
      }
    });
  }

  onSubmitEntreeStock(): void {
    if (this.EntreeStockForm.valid) {
      const formValue = {
        ...this.EntreeStockForm.value
      };
      
      this.stockService.createEntreeStock(formValue).subscribe({
        next: (response: any) => {
          Swal.fire({
            icon: 'success',
            title: 'Succès',
            text: `Entrée de stock ${response.numero || ''} créée avec succès !`,
            timer: 2000,
            showConfirmButton: false
          });
          
          // Fermer la modal
          const modal = document.getElementById('addEntreeStockModal');
          if (modal) {
            const bsModal = (window as any).bootstrap?.Modal?.getInstance(modal);
            if (bsModal) {
              bsModal.hide();
            }
          }
          
          // Rediriger vers la page d'édition
          if (response.id || response.stockId) {
            this.router.navigate(['/Edit-EntreeStock', response.id || response.stockId]);
          } else {
            this.EntreeStockForm.reset();
            this.initForm();
            this.loadNextEntreeStockNumero();
            this.getEntreesStock();
          }
        },
        error: (err) => {
          Swal.fire({
            icon: 'error',
            title: 'Erreur',
            text: `Une erreur s'est produite lors de la création de l'entrée de stock: ${err.error?.message || err.message || 'Erreur inconnue'}`
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

  getEntreesStock(): void {
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

    this.stockService.getEntreesStock(options).subscribe({
      next: (response: any) => {
        this.achats = response.data || [];
        this.totalRecords = response.pagination?.total || 0;
        this.totalPages = response.pagination?.totalPages || 0;
        this.loading = false;
      },
      error: (error) => {
        console.error('Erreur chargement entrées de stock:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement des entrées de stock', 'error');
        this.loading = false;
      },
    });
  }

  onSearch(): void {
    this.currentPage = 1;
    this.getEntreesStock();
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.getEntreesStock();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.getEntreesStock();
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'DESC';
    }
    this.currentPage = 1;
    this.getEntreesStock();
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
    this.getEntreesStock();
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

  editEntreeStock(documentId: number): void {
    this.router.navigate(['/Edit-EntreeStock', documentId]);
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

            this.getEntreesStock();
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
