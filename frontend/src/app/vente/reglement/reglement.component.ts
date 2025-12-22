import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { VentesService } from 'src/app/service/ventes.service';
import Swal from 'sweetalert2';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-reglement',
  templateUrl: './reglement.component.html',
  styleUrls: ['./reglement.component.css']
})
export class ReglementComponent implements OnInit, AfterViewInit, OnDestroy {
  reglements: any[] = [];
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
  sortColumn: string = 'date';
  sortDirection: 'ASC' | 'DESC' = 'DESC';
  
  // Filtres avancés
  showAdvancedFilters: boolean = false;
  filterDateFrom: string = '';
  filterDateTo: string = '';
  filterClient: string = '';
  filterMontantMin: number | null = null;
  filterMontantMax: number | null = null;
  
  // Liste des clients pour le filtre
  clientsList: string[] = [];

  // Formulaire modal
  ReglementForm!: FormGroup;
  clients: any[] = [];
  filteredClients: any[] = [];
  modesReglement: any[] = [];
  nextReglementNumero: string = 'REG25-0001';
  
  private clientSearchSub?: Subscription;

  constructor(
    private ventesService: VentesService,
    private router: Router,
    private baseService: BaseService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadReglements();
    this.AllClients();
    this.loadModeReglements();
    this.initForm();
    this.resetFormState();
  }

  ngAfterViewInit(): void {
    const anyWindow = window as any;
    // @ts-ignore
    if (typeof ($) !== 'undefined') {
      // @ts-ignore
      $('#addReglementModal').on('shown.bs.modal', () => {
        this.resetFormState();
        this.loadNextReglementNumero();
        // Recharger les clients si la liste est vide
        if (!this.clients || this.clients.length === 0) {
          console.log('[ReglementComponent] Rechargement des clients à l\'ouverture du modal...');
          this.AllClients();
        }
      });

      // @ts-ignore
      $('#addReglementModal').on('hidden.bs.modal', () => {
        this.resetFormState();
      });
    }
  }

  ngOnDestroy(): void {
    this.clientSearchSub?.unsubscribe();
  }

  initForm(): void {
    this.ReglementForm = this.fb.group({
      numero: [''], // Plus besoin de required, généré automatiquement
      date: [new Date().toISOString().substring(0, 10), Validators.required],
      part_id: [0, Validators.required],
      clientSearch: ['', Validators.required],
      mode: [null, Validators.required],
      reference: [''],
      montant: [0, [Validators.required, Validators.min(0.01)]]
    });

    this.setupFormListeners();
  }

  private setupFormListeners(): void {
    this.clientSearchSub?.unsubscribe();

    this.clientSearchSub = this.clientSearchControl.valueChanges
      .pipe(
        debounceTime(150),
        distinctUntilChanged()
      )
      .subscribe(value => {
        this.searchTerm = value || '';
        this.onSearchChange(value);
      });
  }

  private resetFormState(): void {
    if (!this.ReglementForm) {
      return;
    }

    this.ReglementForm.reset({
      numero: '',
      date: new Date().toISOString().substring(0, 10),
      part_id: 0,
      clientSearch: '',
      mode: null,
      reference: '',
      montant: 0
    }, { emitEvent: false });

    this.filteredClients = [];
    this.searchTerm = '';
  }

  private normalizeValue(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    return value
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private matchTerm(haystack: string, searchTerm: string): boolean {
    const normalizedHaystack = this.normalizeValue(haystack);
    const tokens = this.normalizeValue(searchTerm)
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length === 0) {
      return false;
    }

    return tokens.every(token => normalizedHaystack.includes(token));
  }

  AllClients(): void {
    console.log('[ReglementComponent] Chargement des clients...');
    this.baseService.getClient().subscribe({
      next: (response: any) => {
        // Gérer différents formats de réponse
        let clientsData = response;
        if (response && response.data && Array.isArray(response.data)) {
          clientsData = response.data;
        } else if (response && response.success && Array.isArray(response.data)) {
          clientsData = response.data;
        } else if (Array.isArray(response)) {
          clientsData = response;
        } else {
          clientsData = [];
        }
        
        this.clients = clientsData || [];
        this.filteredClients = [];
        console.log(`[ReglementComponent] ✅ ${this.clients.length} clients chargés`);
        
        if (this.clients.length === 0) {
          console.warn('[ReglementComponent] ⚠️ Aucun client chargé - vérifier l\'API');
        }
      },
      error: (err: any) => {
        console.error('[ReglementComponent] ❌ Erreur lors du chargement des clients:', err);
        this.clients = [];
        this.filteredClients = [];
        // Optionnel: afficher une notification à l'utilisateur
        // this.showError('Impossible de charger la liste des clients');
      }
    });
  }

  loadModeReglements(): void {
    this.ventesService.getModeReglements().subscribe({
      next: (response: any) => {
        this.modesReglement = response?.data || [];
      },
      error: (err: any) => {
        console.error('Erreur lors du chargement des modes de règlement:', err);
      }
    });
  }

  loadNextReglementNumero(): void {
    this.ventesService.getNextReglementNumero().subscribe({
      next: (response: any) => {
        if (response && response.numero) {
          this.nextReglementNumero = response.numero;
          this.ReglementForm.patchValue({ numero: response.numero });
        }
      },
      error: (err: any) => {
        console.error('Erreur lors du chargement du numéro de règlement:', err);
      }
    });
  }

  onSearchChange(term: string | null | undefined): void {
    if (!term || this.normalizeValue(term).length === 0) {
      this.filteredClients = [];
      return;
    }

    if (!Array.isArray(this.clients) || this.clients.length === 0) {
      // Si les clients ne sont pas encore chargés, essayer de les recharger
      if (this.clients.length === 0) {
        console.warn('[ReglementComponent] ⚠️ Liste des clients vide - tentative de rechargement...');
        this.AllClients();
      }
      this.filteredClients = [];
      return;
    }

    const normalizedTerm = this.normalizeValue(term);
    this.filteredClients = this.clients.filter(client => {
      if (!client) {
        return false;
      }

      const searchSources = [
        client.nom,
        client.raison_sociale,
        client.raisonSociale,
        client.rs,
        client.part_ref,
        client.nom_commercial,
        client.email,
        client.telephone
      ];

      return searchSources.some(source => source && this.matchTerm(source, normalizedTerm));
    }).slice(0, 10); // Limiter à 10 résultats pour l'autocomplétion
    
    console.log(`[ReglementComponent] 🔍 Recherche "${term}": ${this.filteredClients.length} clients trouvés sur ${this.clients.length}`);
  }

  selectClient(client: any): void {
    if (!client) return;
    
    this.ReglementForm.patchValue({
      clientSearch: client.nom,
      part_id: client.part_id
    }, { emitEvent: false });
    this.filteredClients = [];
    this.searchTerm = client.nom;
    this.cdr.detectChanges();
  }

  get clientSearchControl() {
    return this.ReglementForm.get('clientSearch') as FormControl;
  }

  onSubmitReglement(): void {
    if (this.ReglementForm.valid) {
      const formValue = this.ReglementForm.value;
      // Le numéro sera généré automatiquement côté serveur si vide
      const reglementData = {
        numero: '', // Laisser vide pour génération automatique
        date: formValue.date,
        part_id: formValue.part_id,
        mode: formValue.mode,
        reference: formValue.reference || '',
        montant: formValue.montant
      };
      
      this.ventesService.addReglement(reglementData).subscribe({
        next: (response: any) => {
          const numero = response?.numero || response?.data?.numero || reglementData.numero;
          this.showNotification(`✅ Règlement ${numero || ''} créé avec succès !`, false);
          
          // Fermer le modal proprement
          this.closeModal();
          
          this.ReglementForm.reset();
          this.initForm();
          this.loadReglements();
          // Recharger le prochain numéro pour la prochaine création
          setTimeout(() => {
            this.loadNextReglementNumero();
          }, 300);
        },
        error: (err: any) => {
          console.error('Erreur création règlement:', err);
          this.showError(`❌ Une erreur s'est produite lors de la création du règlement: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    } else {
      this.showError("❗ Le formulaire est invalide. Veuillez remplir tous les champs requis.");
    }
  }

  private closeModal(): void {
    // Méthode pour fermer le modal proprement et éviter les conflits
    const modalElement = document.getElementById('addReglementModal');
    if (modalElement) {
      // Utiliser Bootstrap modal API si disponible
      const anyWindow = window as any;
      // @ts-ignore
      if (typeof $ !== 'undefined' && $.fn.modal) {
        // @ts-ignore
        $('#addReglementModal').modal('hide');
      } else if (anyWindow.bootstrap) {
        const modal = anyWindow.bootstrap.Modal.getInstance(modalElement);
        if (modal) {
          modal.hide();
        } else {
          // Créer une nouvelle instance et la fermer
          const newModal = new anyWindow.bootstrap.Modal(modalElement);
          newModal.hide();
        }
      }
      
      // Nettoyer les backdrops multiples
      setTimeout(() => {
        const backdrops = document.querySelectorAll('.modal-backdrop');
        if (backdrops.length > 1) {
          backdrops.forEach((backdrop, index) => {
            if (index > 0) {
              backdrop.remove();
            }
          });
        }
        // Réinitialiser le body
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
      }, 150);
    }
  }

  loadReglements(page: number = 1, search: string = '', resetFilters: boolean = false): void {
    this.loading = true;
    this.currentPage = page;
    this.searchTerm = search;
    
    if (resetFilters) {
      this.filterDateFrom = '';
      this.filterDateTo = '';
      this.filterClient = '';
      this.filterMontantMin = null;
      this.filterMontantMax = null;
    }

    this.ventesService.getReglements({
      page: page,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: search
    }).subscribe({
      next: (response: any) => {
        const result = response.data || [];
        const pagination = response.pagination || {};
        
        const allReglements = Array.isArray(result) ? result : [];
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;
        
        // Extraire la liste des clients uniques pour le filtre
        this.extractClientsList(allReglements);
        
        // Appliquer les filtres avancés côté client
        this.reglements = this.applyAdvancedFilters(allReglements);
        
        
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('[ReglementComponent] ❌ Erreur lors du chargement des règlements:', err);
        this.showError("❌ Une erreur s'est produite lors du chargement des règlements.");
        this.loading = false;
        this.reglements = [];
        this.cdr.detectChanges();
      }
    });
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.loadReglements(page, this.searchTerm);
    }
  }

  onPageSizeChange(event: any): void {
    const newPageSize = parseInt(event.target.value);
    if (newPageSize > 0) {
      this.pageSize = newPageSize;
      this.loadReglements(1, this.searchTerm);
    }
  }

  onSearch(): void {
    this.loadReglements(1, this.searchTerm);
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

    setTimeout(() => {
      this.successMessage = null;
    }, 5000);
  }

  showNotification(message: string, isError: boolean = false) {
    this.successMessage = message;
    this.isError = isError;

    setTimeout(() => {
      this.successMessage = null;
    }, 5000);
  }

  // Tri par colonne
  onSort(column: string): void {
    if (this.sortColumn === column) {
      // Inverser la direction si on clique sur la même colonne
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      // Nouvelle colonne, trier par défaut en DESC
      this.sortColumn = column;
      this.sortDirection = 'DESC';
    }
    this.loadReglements(1, this.searchTerm);
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

  applyAdvancedFilters(reglements: any[]): any[] {
    let filtered = [...reglements];
    
    if (this.filterDateFrom) {
      const fromDate = new Date(this.filterDateFrom);
      filtered = filtered.filter(r => {
        if (!r.date) return false;
        const reglementDate = new Date(r.date);
        return reglementDate >= fromDate;
      });
    }
    
    if (this.filterDateTo) {
      const toDate = new Date(this.filterDateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => {
        if (!r.date) return false;
        const reglementDate = new Date(r.date);
        return reglementDate <= toDate;
      });
    }
    
    if (this.filterClient) {
      filtered = filtered.filter(r => 
        r.client?.toLowerCase().includes(this.filterClient.toLowerCase())
      );
    }
    
    if (this.filterMontantMin !== null && this.filterMontantMin !== undefined) {
      filtered = filtered.filter(r => (r.montant || 0) >= this.filterMontantMin!);
    }
    
    if (this.filterMontantMax !== null && this.filterMontantMax !== undefined) {
      filtered = filtered.filter(r => (r.montant || 0) <= this.filterMontantMax!);
    }
    
    return filtered;
  }

  onFilterChange(): void {
    this.loadReglements(this.currentPage, this.searchTerm);
  }

  resetFilters(): void {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterClient = '';
    this.filterMontantMin = null;
    this.filterMontantMax = null;
    this.loadReglements(1, this.searchTerm, true);
  }

  extractClientsList(reglements: any[]): void {
    const clients = new Set<string>();
    reglements.forEach(r => {
      if (r.client) {
        clients.add(r.client);
      }
    });
    this.clientsList = Array.from(clients).sort();
  }

  // Export des données
  exportToCSV(): void {
    const headers = ['Numéro', 'Date', 'Client', 'Mode', 'Référence', 'Montant'];
    const rows = this.reglements.map(r => [
      r.numero || '',
      r.date ? new Date(r.date).toLocaleDateString('fr-FR') : '',
      r.client || '',
      r.mode || '',
      r.reference || '',
      (r.montant || 0).toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reglements_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    this.showNotification('✅ Export CSV réussi !', false);
  }

  // Navigation vers la page d'édition
  onEditReglement(regle_id: number): void {
    this.router.navigate(['/Edit-Reglement', regle_id]);
  }

  // Supprimer un règlement
  onDeleteReglement(reglement: any, index: number): void {
    Swal.fire({
      title: 'Êtes-vous sûr ?',
      text: `Voulez-vous vraiment supprimer le règlement ${reglement.numero} ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.ventesService.deleteReglement(reglement.id).subscribe({
          next: () => {
            Swal.fire('Supprimé !', 'Le règlement a été supprimé avec succès.', 'success');
            this.loadReglements(this.currentPage || 1, this.searchTerm || '');
          },
          error: (err: any) => {
            console.error('Erreur lors de la suppression:', err);
            Swal.fire('Erreur !', 'Une erreur est survenue lors de la suppression.', 'error');
          }
        });
      }
    });
  }
}
