import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { VentesService } from 'src/app/service/ventes.service';
import { EmailService } from 'src/app/service/email.service';
import { PdfPermissionsService } from 'src/app/service/pdf-permissions.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-commande',
  templateUrl: './commande.component.html',
   styleUrls: ['./commande.component.css']
})
export class CommandeComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly defaultColumnWidths: Record<string, string> = {
    numero: '126px',
    date: '124px',
    client: '240px',
    depot: '120px',
    status: '108px',
    progression: '165px'
  };
  readonly actionColumnWidth = 112;
  devis: any[] = [];
  filteredDevis: any[] = [];
  commandes: any[] = [];
  dataTableDevis: any;
  dataTableCommande: any;
  loading: boolean = true;
  loadingCommandes: boolean = false;
  searchTerm = '';
  searchTermCommandes: string = ''; // Terme de recherche pour les commandes
  searchTermDevis = ''; // Terme de recherche sp?cifique pour les devis
  clients: any[] = [];
  filteredClients: any[] = [];
  selectedClient: any = null;
  searchCommercial = '';
  commerciaux: any[] = [];
  filteredCommerciaux: any[] = [];
  selectedCommercial: any = null;
  depots: any[] = [];
  DevisForm!: FormGroup;
  DevisSupprimes: number[] = [];
  successMessage: string | null = null;
  isError: boolean = false;
  private isSelectingAll = false;
  nextCommandeNumero: string = 'BC25-0001'; // Numéro par défaut
  
  // Pagination pour les devis
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  totalDevis = 0;
  startIndex = 0;
  endIndex = 0;
  
  // Tri pour les devis
  sortColumn: string = 'numero';
  sortDirection: 'asc' | 'desc' = 'desc';
  
  // Pagination pour les commandes
  currentPageCommandes: number = 1;
  pageSizeCommandes: number = 25;
  totalRecordsCommandes: number = 0;
  totalPagesCommandes: number = 0;
  
  // Tri pour les commandes
  sortColumnCommandes: string = 'document_id';
  sortDirectionCommandes: 'ASC' | 'DESC' = 'DESC';
  
  // Filtres avanc?s pour les commandes
  showAdvancedFiltersCommandes: boolean = false;
  filterDateFromCommandes: string = '';
  
  // Affichage de la ligne de filtres
  showFilterRow: boolean = false;
  filterDateToCommandes: string = '';
  filterClientCommandes: string = '';
  
  // Liste des clients pour le filtre
  clientsListCommandes: string[] = [];

  // Filtres par colonne (style Excel) pour les commandes
  columnFilters: any = {
    numero: '',
    date: '',
    client: '',
    depot: '',
    status: '',
    progression: ''
  };

  allCommandes: any[] = []; // Stocker toutes les commandes pour le filtrage

  // Gestion des colonnes (affichage/masquage, ?pinglage, etc.)
  columnVisibility: any = {
    numero: true,
    date: true,
    client: true,
    depot: true,
    status: true,
    progression: true
  };

  pinnedColumns: string[] = [];
  columnWidths: any = { ...this.defaultColumnWidths };
  showColumnMenu: boolean = false;
  activeColumnMenu: string = '';
  menuPosition: any = { x: 0, y: 0 };
  resizingColumn: string | null = null;
  resizeStartX = 0;
  resizeStartWidth = 0;
  detailMode: boolean = false;
  private sidebarStateBeforeDetailMode: boolean | null = null;
  private sidebarObserver: MutationObserver | null = null;

  getSelectedCount(): number {
    const count = this.devis.filter(d => {
      return d.checked === true || d.checked === 'true' || d.checked === 1;
    }).length;
    return count;
  }

  trackByDocumentId(index: number, item: any): any {
    return item.document_id || index;
  }

  constructor(
    private ventesService: VentesService, 
    private router: Router,
    private baseService: BaseService, 
    private fb: FormBuilder, 
    private emailService: EmailService,
    private cdr: ChangeDetectorRef,
    public pdfPermissionsService: PdfPermissionsService
  ) {
      
     }

  ngOnInit(): void {
    this.getDevisNonTransferes(); // Utiliser la nouvelle méthode pour n'afficher que les devis non transférés
    this.getCommande();
    this.AllClients();
    this.AllCommerciaux();
    this.AllDepots();
    this.initForm();
    this.loadNextCommandeNumero(); // Charger le numéro de commande au démarrage

      // Les abonnements valueChanges sont maintenant g?r?s directement via (input) dans le template
      // pour ?viter les conflits avec [(ngModel)]
  }

  initForm(): void {
    this.DevisForm = this.fb.group({
      date: [this.getCurrentDateTimeLocal()], // Date/heure du jour par défaut
      description: [''],
      part_id: [0, Validators.required], // Client requis
      contact_id: [0], // Commercial non requis
      depot_id: [null],
      date_fin: [''],
      etat: [2],

      
    clientSearch: [''],   // le texte visible pour client
    commercialSearch: [''] // le texte visible pour commercial
    });

    
  }

  private getCurrentDateTimeLocal(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  ngAfterViewInit(): void {
    // Ajouter un listener pour fermer le menu contextuel quand on clique ailleurs
    document.addEventListener('click', (event) => {
      if (this.showColumnMenu) {
        const target = event.target as HTMLElement;
        if (!target.closest('.column-context-menu') && !target.closest('.column-menu-btn')) {
          this.hideColumnContextMenu();
        }
      }
    });

    // Ne rien faire ici, on initialise dans getClients apr?s chargement
    // Ajuster les colonnes lorsque le modal est affich? pour que DataTables calcule correctement les largeurs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyWindow = window as any;
    // @ts-ignore - jQuery disponible globalement ? l'ex?cution
    if (typeof ($) !== 'undefined') {
      // @ts-ignore
      $('#modalDevisCommandeXL').on('shown.bs.modal', () => {
        // Recharger les devis non transférés ? chaque ouverture de la popup
        this.getDevisNonTransferes();
      });

      // @ts-ignore - Recharger le numéro de commande ? chaque ouverture du modal
      $('#addClientModal').on('shown.bs.modal', () => {
        this.loadNextCommandeNumero();
        // Réinitialiser le formulaire
        this.DevisForm.reset();
        this.initForm();
      });

      // @ts-ignore - Réinitialiser le formulaire ? la fermeture du modal
      $('#addClientModal').on('hidden.bs.modal', () => {
        this.DevisForm.reset();
        this.initForm();
        this.searchTerm = '';
        this.searchCommercial = '';
        this.filteredClients = [];
        this.filteredCommerciaux = [];
      });
    }

    this.startSidebarObserver();
  }

  ngOnDestroy(): void {
    this.onDocumentMouseUp();
    this.sidebarObserver?.disconnect();
    this.sidebarObserver = null;
    if (this.detailMode && this.sidebarStateBeforeDetailMode === false) {
      this.setSidebarHidden(false);
    }
  }

  // Charger le prochain numéro de commande depuis le serveur (utilise le compteur BLC)
  loadNextCommandeNumero(): void {
    this.ventesService.getNextCommandeNumero().subscribe({
      next: (response: any) => {
        if (response && response.numero) {
          this.nextCommandeNumero = response.numero;
        }
      },
      error: (err) => {
        // Garder la valeur par défaut en cas d'erreur
      }
    });
  }

  // M?thode pour obtenir le numéro (utilis?e dans le template)
  getNextLigne(): string { 
    return this.nextCommandeNumero;
}
  getDevis(): void {
    this.loading = true;

    this.ventesService.getDevis().subscribe((data: any) => {
     // this.devis = data;
    this.devis = data.map((d: any) => ({ ...d, checked: false }));
      setTimeout(() => {
        if (this.dataTableDevis) {
          this.dataTableDevis.destroy();
        }

        // @ts-ignore - jQuery DataTables
        this.dataTableDevis = $('#devisTable-devis').DataTable({
          pageLength: 10,
          order: [0, 'desc'],
          searching: true,
          lengthChange: true
        });

      }, 0);
      this.loading = false; // OK on cache le spinner apr?s le chargement
    });
  }

  getDevisNonTransferes(): void {
    this.loading = true;

    this.ventesService.getDevisNonTransferes().subscribe({
      next: (response: any) => {
        
      // Pr?server l'?tat checked des devis existants
      const existingChecked = new Map();
      this.devis.forEach(d => {
        if (d.checked) {
          existingChecked.set(d.document_id, true);
        }
      });

        // G?rer la r?ponse qui peut ?tre { success: true, data: [...] } ou directement un tableau
        let data = response;
        if (response && response.data && Array.isArray(response.data)) {
          data = response.data;
        } else if (Array.isArray(response)) {
          data = response;
        } else {
          data = [];
        }

      this.devis = data.map((d: any) => ({ 
        ...d, 
        checked: existingChecked.get(d.document_id) || false 
      }));
      
      // Appliquer le filtre et la pagination
      this.applyFilterAndPagination();
      
      this.loading = false; // OK on cache le spinner apr?s le chargement
      },
      error: (error) => {
      this.loading = false;
        this.devis = [];
        this.filteredDevis = [];
      this.showError('Erreur lors du chargement des devis');
      }
    });
  }
  
  // Appliquer le filtre, le tri et la pagination
  applyFilterAndPagination(): void {
    // 1. Filtrer par terme de recherche
    let filtered = [...this.devis];
    
    if (this.searchTermDevis && this.searchTermDevis.trim() !== '') {
      const searchLower = this.searchTermDevis.toLowerCase();
      filtered = filtered.filter(d => 
        (d.numero && d.numero.toLowerCase().includes(searchLower)) ||
        (d.description && d.description.toLowerCase().includes(searchLower)) ||
        (d.client && d.client.toLowerCase().includes(searchLower)) ||
        (d.commercial && d.commercial.toLowerCase().includes(searchLower)) ||
        (d.date && d.date.toString().includes(searchLower))
      );
    }
    
    // 2. Trier
    filtered.sort((a, b) => {
      let aVal = a[this.sortColumn];
      let bVal = b[this.sortColumn];
      
      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';
      
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (this.sortDirection === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });
    
    // 3. Calculer la pagination
    this.totalDevis = filtered.length;
    this.totalPages = Math.ceil(this.totalDevis / this.pageSize);
    
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages;
    }
    
    this.startIndex = (this.currentPage - 1) * this.pageSize;
    this.endIndex = Math.min(this.startIndex + this.pageSize, this.totalDevis);
    
    // 4. Extraire les devis pour la page courante
    this.filteredDevis = filtered.slice(this.startIndex, this.endIndex);
  }
  
  // M?thodes pour la pagination
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.applyFilterAndPagination();
    }
  }
  
  onPageSizeChange(): void {
    this.currentPage = 1;
    this.applyFilterAndPagination();
  }
  
  onSearchChangeDevis(): void {
    this.currentPage = 1;
    this.applyFilterAndPagination();
  }
  
  // M?thode pour le tri
  sortBy(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc';
    }
    this.applyFilterAndPagination();
  }
  
  // V?rifier si tous les devis sont sélectionnés
  isAllSelected(): boolean {
    if (this.filteredDevis.length === 0) return false;
    return this.filteredDevis.every(d => d.checked);
  }

  // M?thode utilitaire pour nettoyer DataTables
  private destroyDataTableCommande(): void {
    try {
      // D?truire l'instance TypeScript si elle existe
      if (this.dataTableCommande) {
        this.dataTableCommande.destroy();
        this.dataTableCommande = null;
      }
      
      // V?rifier et d?truire via jQuery si n?cessaire
      // @ts-ignore - jQuery DataTables disponible globalement
      if (typeof $ !== 'undefined' && $.fn.DataTable) {
        // @ts-ignore
        if ($.fn.DataTable.isDataTable('#devisTable-Commande')) {
          // @ts-ignore
          const dt = $('#devisTable-Commande').DataTable();
          dt.destroy(); // Ne pas utiliser clear() car cela vide le tbody
        }
      }
      
      // NE PAS vider le tbody manuellement - laisser Angular g?rer via *ngFor
      // Angular va automatiquement mettre ? jour le DOM quand this.commandes change
    } catch (e) {
    }
  }

  loadCommandes(page: number = 1, search: string = '', resetFilters: boolean = false): void {
    this.loadingCommandes = true;
    this.currentPageCommandes = page;
    this.searchTermCommandes = search;
    
    if (resetFilters) {
      this.filterDateFromCommandes = '';
      this.filterDateToCommandes = '';
      this.filterClientCommandes = '';
    }

    this.ventesService.getCommande({
      page: page,
      pageSize: this.pageSizeCommandes,
      orderBy: this.sortColumnCommandes,
      orderDirection: this.sortDirectionCommandes,
      search: search
    }).subscribe({
      next: (response: any) => {
        const result = response.data || [];
        const pagination = response.pagination || {};
        
        const commandesData = (Array.isArray(result) ? result : []).map((d: any) => {
          const progressionPreparation = Number(d?.progression_preparation || 0);
          const mapped = {
            ...d,
            quantite_demandee_preparation: Number(d?.quantite_demandee_preparation || 0),
            quantite_preparee_preparation: Number(d?.quantite_preparee_preparation || 0),
            progression_preparation: progressionPreparation
          };

          return {
            ...mapped,
            status: progressionPreparation >= 100 ? 'Traité' : (d?.status ?? d?.Status ?? null),
            progression: this.getCommandeProgressLabel(mapped)
          };
        });
        this.totalRecordsCommandes = pagination.total || 0;
        this.totalPagesCommandes = pagination.totalPages || 1;
        
        // Extraire la liste des clients uniques pour le filtre
        this.extractClientsListCommandes(commandesData);
        
        // Appliquer les filtres avanc?s c?t? client
        this.commandes = this.applyAdvancedFiltersCommandes(commandesData).map((d: any) => ({ ...d, checked: false }));
        this.allCommandes = [...this.commandes]; // Stocker une copie pour les filtres locaux
        
        // Appliquer les filtres de colonne s'ils existent
        this.applyColumnFilters();
        
        this.loadingCommandes = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.showError("Erreur Une erreur s'est produite lors du chargement des commandes.");
        this.loadingCommandes = false;
        this.commandes = [];
        this.allCommandes = [];
        this.cdr.detectChanges();
      }
    });
  }

  getCommande(showLoading: boolean = true): void {
    this.loadCommandes();
  }

  // M?thodes de pagination pour les commandes
  onPageChangeCommandes(page: number): void {
    if (page >= 1 && page <= this.totalPagesCommandes && page !== this.currentPageCommandes) {
      this.loadCommandes(page, this.searchTermCommandes);
    }
  }

  onPageSizeChangeCommandes(event: any): void {
    const newPageSize = parseInt(event.target.value);
    if (newPageSize > 0) {
      this.pageSizeCommandes = newPageSize;
      this.loadCommandes(1, this.searchTermCommandes);
    }
  }

  onSearchCommandes(): void {
    this.loadCommandes(1, this.searchTermCommandes);
  }

  onSearchKeyPressCommandes(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearchCommandes();
    }
  }

  getPageNumbersCommandes(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.currentPageCommandes - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPagesCommandes, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  getDisplayRangeCommandes(): string {
    const start = ((this.currentPageCommandes - 1) * this.pageSizeCommandes) + 1;
    const end = Math.min(this.currentPageCommandes * this.pageSizeCommandes, this.totalRecordsCommandes);
    return `${start} ? ${end}`;
  }

  toggleDetailMode(): void {
    if (!this.detailMode) {
      this.sidebarStateBeforeDetailMode = this.isSidebarHidden();
    }

    this.detailMode = !this.detailMode;
    this.applyDetailMode();
  }

  private applyDetailMode(): void {
    if (this.detailMode) {
      this.setSidebarHidden(true);
      return;
    }

    if (this.sidebarStateBeforeDetailMode === false) {
      this.setSidebarHidden(false);
    }
    this.sidebarStateBeforeDetailMode = null;
  }

  private isSidebarHidden(): boolean {
    return !!document.querySelector('.wrapper.sidebar-hidden-desktop');
  }

  private setSidebarHidden(hidden: boolean): void {
    const currentlyHidden = this.isSidebarHidden();
    if (currentlyHidden === hidden) {
      return;
    }

    const selector = hidden ? '.toggle-sidebar' : '.btn-sidebar-toggle-float, .toggle-sidebar';
    const toggleButton = document.querySelector(selector) as HTMLElement | null;
    toggleButton?.click();
  }

  private startSidebarObserver(): void {
    const wrapper = document.querySelector('.wrapper');
    if (!wrapper) {
      return;
    }

    this.sidebarObserver?.disconnect();
    this.sidebarObserver = new MutationObserver(() => {
      if (this.detailMode && !this.isSidebarHidden()) {
        this.detailMode = false;
        this.applyDetailMode();
        this.cdr.detectChanges();
      }
    });

    this.sidebarObserver.observe(wrapper, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  // Tri par colonne pour les commandes
  onSortCommandes(column: string): void {
    if (this.sortColumnCommandes === column) {
      this.sortDirectionCommandes = this.sortDirectionCommandes === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumnCommandes = column;
      this.sortDirectionCommandes = 'DESC';
    }
    this.loadCommandes(1, this.searchTermCommandes);
  }

  getSortIconCommandes(column: string): string {
    if (this.sortColumnCommandes !== column) {
      return 'fa-sort';
    }
    return this.sortDirectionCommandes === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // Filtres avanc?s pour les commandes
  toggleAdvancedFiltersCommandes(): void {
    this.showAdvancedFiltersCommandes = !this.showAdvancedFiltersCommandes;
  }

  applyAdvancedFiltersCommandes(commandes: any[]): any[] {
    let filtered = [...commandes];
    
    if (this.filterDateFromCommandes) {
      const fromDate = new Date(this.filterDateFromCommandes);
      filtered = filtered.filter(c => {
        if (!c.date) return false;
        const commandeDate = new Date(c.date);
        return commandeDate >= fromDate;
      });
    }
    
    if (this.filterDateToCommandes) {
      const toDate = new Date(this.filterDateToCommandes);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(c => {
        if (!c.date) return false;
        const commandeDate = new Date(c.date);
        return commandeDate <= toDate;
      });
    }
    
    if (this.filterClientCommandes) {
      filtered = filtered.filter(c => 
        c.client?.toLowerCase().includes(this.filterClientCommandes.toLowerCase())
      );
    }
    
    return filtered;
  }

  onFilterChangeCommandes(): void {
    this.loadCommandes(this.currentPageCommandes, this.searchTermCommandes);
  }

  resetFiltersCommandes(): void {
    this.filterDateFromCommandes = '';
    this.filterDateToCommandes = '';
    this.filterClientCommandes = '';
    this.loadCommandes(1, this.searchTermCommandes, true);
  }

  extractClientsListCommandes(commandes: any[]): void {
    const clients = new Set<string>();
    commandes.forEach(c => {
      if (c.client) {
        clients.add(c.client);
      }
    });
    this.clientsListCommandes = Array.from(clients).sort();
  }

  // Export des données pour les commandes
  exportToCSVCommandes(): void {
    const headers = ['Numero', 'Date', 'Client', 'Depot', 'Status', 'Progression'];
    const rows = this.commandes.map(c => [
      c.numero || '',
      c.date ? new Date(c.date).toLocaleDateString('fr-FR') : '',
      c.client || '',
      c.depot || '',
      c.status ?? '',
      this.getCommandeProgressLabel(c)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `commandes_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    this.showNotification('OK Export CSV réussi !', false);
  }

  // M?thode pour initialiser DataTables
  private initializeDataTable(): void {
    try {
      // V?rifier que le tableau existe et contient des lignes
      // @ts-ignore - jQuery disponible globalement
      const tbody = $('#devisTable-Commande tbody');
      const rowCount = tbody.find('tr').length;
      
      if (rowCount === 0 && this.commandes.length === 0) {
        return;
      }
      
      // Réinitialiser DataTables avec l'option destroy pour ?viter les conflits
      // @ts-ignore - jQuery DataTables
      this.dataTableCommande = $('#devisTable-Commande').DataTable({
        pageLength: 10,
        order: [0, 'desc'],
        searching: true,
        lengthChange: true,
        destroy: true, // Permet de r?initialiser proprement si une instance existe déjà
        paging: true, // S'assurer que la pagination est activ?e
        info: true, // Afficher les informations de pagination
        retrieve: false, // Ne pas récupérer une instance existante
        language: {
          emptyTable: 'Aucune donnée disponible dans le tableau',
          info: 'Affichage de _START_ à _END_ sur _TOTAL_ entrées',
          infoEmpty: 'Affichage de 0 à 0 sur 0 entrées',
          infoFiltered: '(filtré à partir de _MAX_ entrées au total)',
          lengthMenu: 'Afficher _MENU_ entrées',
          loadingRecords: 'Chargement...',
          processing: 'Traitement en cours...',
          search: 'Rechercher:',
          zeroRecords: 'Aucun enregistrement correspondant trouvé'
        }
      });

      // Forcer le redraw pour s'assurer que toutes les lignes sont visibles
      // @ts-ignore
      if (this.dataTableCommande) {
        this.dataTableCommande.draw(false); // false = ne pas r?initialiser la pagination
        
        // V?rifier le nombre de lignes apr?s l'initialisation
        const rowCountAfterInit = this.dataTableCommande.rows().count();
        
        if (rowCountAfterInit === 0 && this.commandes.length > 0) {
        }
      }
    } catch (error) {
    }
  }

  toggleAllDevis(event: Event) {
    this.isSelectingAll = true;
    const checked = (event.target as HTMLInputElement).checked;
    // Mettre ? jour explicitement chaque devis dans filteredDevis (seulement ceux visibles)
    this.filteredDevis.forEach((d) => {
      d.checked = checked;
      // Mettre ? jour aussi dans devis principal
      const index = this.devis.findIndex(devis => devis.document_id === d.document_id);
      if (index !== -1) {
        this.devis[index].checked = checked;
      }
    });
    // Ne pas ouvrir de pop-up pour "S?lectionner tout" - l'utilisateur utilisera le bouton "Transf?rer"
    setTimeout(() => {
      this.isSelectingAll = false;
    }, 100);
  }

  onDevisCheckboxChange(devis: any, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    
    // Trouver l'index dans le tableau et mettre ? jour directement
    const index = this.devis.findIndex(d => d.document_id === devis.document_id);
    if (index !== -1) {
      // Mettre ? jour directement dans le tableau
      this.devis[index].checked = checked;
      // Mettre ? jour aussi l'objet pass? en param?tre (pour coh?rence)
      devis.checked = checked;
      
      // Mettre ? jour aussi dans filteredDevis
      const filteredIndex = this.filteredDevis.findIndex(d => d.document_id === devis.document_id);
      if (filteredIndex !== -1) {
        this.filteredDevis[filteredIndex].checked = checked;
      }
      
    } else {
    }
    // Ne plus déclencher automatiquement le transfert - l'utilisateur doit cliquer sur le bouton "Transf?rer"
  }

  // Cette méthode n'est plus utilis?e - le transfert se fait via transfererSelectionnes()
  // Mais on la garde pour r?f?rence si besoin de transfert individuel direct
  transfererDevis(devis: any) {
    this.ventesService.transfererDevisVersCommande(devis.document_id).subscribe({
      next: (response: any) => {
        this.showSuccess(`OK Devis ${devis.numero} transféré en commande ${response.numero} avec succès !`);
        devis.checked = false;
        this.getDevisNonTransferes(); // Rafraîchir la liste des devis non transférés
                this.loadCommandes(); // Rafraîchir la liste des commandes
      },
      error: (err) => {
        this.showError(`Erreur Une erreur s'est produite lors du transfert du devis ${devis.numero}.`);
        devis.checked = false;
      }
    });
  }

  transfererSelectionnes() {
    // Filtrer les devis cochés en v?rifiant explicitement l'?tat
    const devisSelectionnes = this.devis.filter(d => {
      // V?rifier plusieurs façons d'acc?der ? la propriété checked
      const isChecked = d.checked === true || d.checked === 'true' || d.checked === 1;
      if (isChecked) {
      }
      return isChecked;
    });
    
    
    if (devisSelectionnes.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Aucun devis sélectionné',
        text: 'Veuillez sélectionner au moins un devis à transférer.',
        confirmButtonText: 'OK'
      });
      return;
    }

    // Si un seul devis est sélectionné, afficher le numéro dans la confirmation
    const message = devisSelectionnes.length === 1
      ? `Voulez-vous transférer le devis <strong>${devisSelectionnes[0].numero}</strong> vers une commande ?`
      : `Voulez-vous transférer <strong>${devisSelectionnes.length}</strong> devis vers des commandes ?`;

    Swal.fire({
      title: 'Confirmer le transfert',
      html: message,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Oui, transférer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#dc3545'
    }).then((result) => {
      if (result.isConfirmed) {
        this.transfererPlusieursDevis(devisSelectionnes);
      }
    });
  }

  transfererPlusieursDevis(devisList: any[]) {
    let completed = 0;
    let errors = 0;
    const total = devisList.length;

    devisList.forEach(devis => {
      this.ventesService.transfererDevisVersCommande(devis.document_id).subscribe({
        next: (response: any) => {
          completed++;
          devis.checked = false;
          
          if (completed + errors === total) {
            if (errors === 0) {
              this.showSuccess(`OK ${completed} devis transférés avec succès !`);
            } else {
              this.showError(`Attention ${completed} devis transférés, ${errors} erreurs.`);
            }
            this.getDevisNonTransferes(); // Rafraîchir la liste des devis non transférés
            this.getCommande();
          }
        },
        error: (err) => {
          errors++;
          devis.checked = false;
          
          if (completed + errors === total) {
            if (completed > 0) {
              this.showError(`Attention ${completed} devis transférés, ${errors} erreurs.`);
            } else {
              this.showError(`Erreur Aucun devis n'a pu être transféré.`);
            }
            this.getDevisNonTransferes(); // Rafraîchir la liste des devis non transférés
            this.getCommande();
          }
        }
      });
    });
}

  toggleAllCommande(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  this.commandes.forEach(d => d.checked = checked);
}

  OnEdit(document_id: any) {
    // Fermer le modal s'il est ouvert pour ?viter que le backdrop reste affich?
    this.closeModalIfOpen('modalDevisCommandeXL');
    this.router.navigate(['/Edit-Devis/' + document_id]);
  }

  OnEditCommande(document_id: any) {
    // Fermer le modal s'il est ouvert pour ?viter que le backdrop reste affich?
    this.closeModalIfOpen('modalDevisCommandeXL');
    this.router.navigate(['/Edit-Commande/' + document_id]);
  }

  OnPrintCommande(document_id: any) {
    const pendingPdfWindow = window.open('', '_blank');
    if (pendingPdfWindow) {
      pendingPdfWindow.document.title = 'Generation du PDF';
      pendingPdfWindow.document.body.innerHTML = `
        <div style="font-family: Arial, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8fafc; color: #0f172a;">
          <div style="text-align: center; padding: 32px;">
            <div style="width: 56px; height: 56px; border: 4px solid #cbd5e1; border-top-color: #2563eb; border-radius: 50%; margin: 0 auto 16px; animation: spin 0.9s linear infinite;"></div>
            <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Generation du PDF...</div>
            <div style="font-size: 14px; color: #475569;">Le document va s'afficher dans cet onglet.</div>
          </div>
        </div>
        <style>
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        </style>
      `;
    }

    Swal.fire({
      title: 'Generation du PDF',
      text: 'Veuillez patienter...',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // G?n?rer et ouvrir le PDF de la commande
    this.emailService.generateCommandePDF(document_id.toString()).subscribe({
      next: (res: any) => {
        Swal.close();
        if (res?.pdfUrl) {
          if (pendingPdfWindow && !pendingPdfWindow.closed) {
            pendingPdfWindow.location.href = res.pdfUrl;
          } else {
            window.open(res.pdfUrl, '_blank');
          }
        } else {
          pendingPdfWindow?.close();
          Swal.fire({ icon: 'error', title: 'Erreur', text: 'Lien PDF non reçu.' });
        }
      },
      error: (err: any) => {
        Swal.close();
        pendingPdfWindow?.close();
        Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors de la génération du PDF." });
      }
    });
  }

  AllClients() {
    this.baseService.getClient().subscribe({
      next: (data) => {
        // G?rer différents formats de r?ponse
        let clientsData = data;
        if (data && data.data && Array.isArray(data.data)) {
          clientsData = data.data;
        } else if (data && Array.isArray(data)) {
          clientsData = data;
        } else {
          clientsData = [];
        }
        
        this.clients = (clientsData || []).filter((client: any) => Number(client?.type) === 1);
        this.filteredClients = [];
      },
      error: (err) => {
        this.clients = [];
        this.filteredClients = [];
      }
    });
  }

  onSearchChange(term: string | null | undefined) {
  if (!term || typeof term !== 'string') {
    this.filteredClients = [];
    this.searchTerm = term || '';
    return;
  }

  this.searchTerm = term;
  term = term.trim().toLowerCase();

  if (term.length === 0) {
    this.filteredClients = [];
    return;
  }

  if (!this.clients || this.clients.length === 0) {
    this.filteredClients = [];
    return;
  }

  this.filteredClients = this.clients.filter(client =>
    client && client.nom && client.nom.toLowerCase().includes(term)
  );
}

  selectClient(client: any) {
  if (!client || !client.part_id) {
    return;
  }
  this.DevisForm.patchValue({
    clientSearch: client.nom,
    part_id: client.part_id
  });
  this.filteredClients = [];
  this.searchTerm = client.nom;
}

  AllDepots() {
    this.baseService.getDepots().subscribe({
      next: (response: any) => {
        const data = response?.data || (Array.isArray(response) ? response : []);
        this.depots = Array.isArray(data) ? data : [];
      },
      error: () => {
        this.depots = [];
      }
    });
  }

  AllCommerciaux() {
    this.baseService.getCommercial().subscribe({
      next: (data) => {
        // G?rer différents formats de r?ponse
        let commerciauxData = data;
        if (data && data.data && Array.isArray(data.data)) {
          commerciauxData = data.data;
        } else if (data && Array.isArray(data)) {
          commerciauxData = data;
        } else {
          commerciauxData = [];
        }
        
        this.commerciaux = commerciauxData;
        this.filteredCommerciaux = [];
      },
      error: (err) => {
        this.commerciaux = [];
        this.filteredCommerciaux = [];
      }
    });
  }

  onCommercialSearchChange(term: string | null | undefined) {
  if (!term || typeof term !== 'string') {
    this.filteredCommerciaux = [];
    this.searchCommercial = term || '';
    return;
  }

  this.searchCommercial = term;
  term = term.trim().toLowerCase();

  if (term.length === 0) {
    this.filteredCommerciaux = [];
    return;
  }

  if (!this.commerciaux || this.commerciaux.length === 0) {
    this.filteredCommerciaux = [];
    return;
  }

  this.filteredCommerciaux = this.commerciaux.filter(com =>
    com && com.nom && com.nom.toLowerCase().includes(term)
  );
}

 selectCommercial(com: any) {
  if (!com || !com.id) {
    return;
  }
  this.DevisForm.patchValue({
    commercialSearch: com.nom,
    contact_id: com.id
  });
  this.filteredCommerciaux = [];
  this.searchCommercial = com.nom;
}

  onSubmit(): void {
    if (this.DevisForm.valid) {
      const formValue = {
        ...this.DevisForm.value,
        depot_id: this.DevisForm.value?.depot_id ? Number(this.DevisForm.value.depot_id) : null,
        etat: 2  // État pour une commande
      };
      
      // Utiliser addCommande au lieu de addDevis pour créer une commande avec etat=2
      this.ventesService.addCommande(formValue).subscribe({
        next: (response: any) => {
          this.showSuccess(`OK Commande ${response.numero || ''} créée avec succès !`);
          // Fermer le modal et recharger les données
          const modal = document.getElementById('addClientModal');
          if (modal) {
            const bsModal = (window as any).bootstrap?.Modal?.getInstance(modal);
            if (bsModal) {
              bsModal.hide();
            }
          }
          // Réinitialiser le formulaire
          this.DevisForm.reset();
          this.initForm();
          // Recharger les données
          this.getCommande();
          this.loadNextCommandeNumero(); // Recharger le prochain numéro
        },
        error: (err) => {
          this.showError(`Erreur Une erreur s'est produite lors de la création de la commande: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    } else {
      this.showError("Le formulaire est invalide. Veuillez remplir tous les champs requis.");
      // Afficher les erreurs de validation
      Object.keys(this.DevisForm.controls).forEach(key => {
        const control = this.DevisForm.get(key);
        if (control && control.invalid) {
        }
      });
    }
  }

  showSuccess(message: string) {
    Swal.fire({
      icon: 'success',
      title: 'Succès',
      text: message,
      confirmButtonText: 'OK',
      customClass: {
        confirmButton: 'btn btn-success'
      },
      buttonsStyling: false
    }).then(() => {
      // Recharger les commandes avec pagination au lieu de recharger toute la page
      this.loadCommandes(this.currentPageCommandes, this.searchTermCommandes);
    });
  }

  showError(message: string) {
    Swal.fire({
      icon: 'error',
      title: 'Erreur',
      text: message,
      confirmButtonText: 'Fermer',
      customClass: {
        confirmButton: 'btn btn-danger'
      },
      buttonsStyling: false
    });
  }

  private closeModalIfOpen(modalId: string) {
    // @ts-ignore - jQuery/Bootstrap dispo globalement
    const modalEl = document.getElementById(modalId);
    if (!modalEl) return;

    // Tente via Bootstrap 5 API
    const w = window as unknown as { bootstrap?: any };
    const bs = w.bootstrap;
    try {
      if (bs && bs.Modal) {
        let instance = bs.Modal.getInstance(modalEl);
        if (!instance) {
          instance = new bs.Modal(modalEl);
        }
        instance.hide();
      } else {
        // Fallback jQuery
        // @ts-ignore
        $(modalEl).modal('hide');
      }
    } catch (_) {
      // Ignore et fallback nettoyage manuel
    }

    // Nettoyage de secours du backdrop si n?cessaire
    setTimeout(() => {
      try {
        // @ts-ignore
        $('.modal-backdrop').remove();
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('padding-right');
      } catch (_) {}
    }, 50);
  }

  get clientSearchControl() {
  return this.DevisForm.get('clientSearch') as FormControl;
}

get commercialSearchControl() {
  return this.DevisForm.get('commercialSearch') as FormControl;
}

  removeDevis(index: number) {
  const dev = this.devis[index];

  if (dev.document_id) {
    this.DevisSupprimes.push(dev.document_id);

    this.ventesService.RemoveDevis(this.DevisSupprimes).subscribe({
      next: (res: { message: string }) => {
        this.showNotification(res.message, false);

        // Supprime l'élément du tableau local pour mise à jour immédiate de la vue
        this.devis.splice(index, 1);

        this.DevisSupprimes = [];
      },
      error: (err: any) => {
        this.showNotification(err.message, true);
      }
    });
  }
}

  // M?thode pour supprimer une commande avec confirmation
  removeCommande(commande: any, index: number) {
    // Afficher la pop-up de confirmation
    Swal.fire({
      title: 'Confirmer la suppression',
      html: `Voulez-vous vraiment supprimer la commande <strong>${commande.numero || 'N/A'}</strong> ?<br><br><small class="text-muted">Cette action est irréversible.</small>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      reverseButtons: true,
      customClass: {
        confirmButton: 'btn btn-danger',
        cancelButton: 'btn btn-secondary'
      },
      buttonsStyling: false
    }).then((result) => {
      if (result.isConfirmed) {
        // Si l'utilisateur confirme, supprimer la commande
        if (commande.document_id) {
          const idsToDelete = [commande.document_id];
          
          this.ventesService.RemoveDevis(idsToDelete).subscribe({
            next: (res: any) => {
              // Afficher un message de succès
              Swal.fire({
                icon: 'success',
                title: 'Supprimé !',
                text: `La commande ${commande.numero || 'N/A'} a été supprimée avec succès.`,
                confirmButtonText: 'OK',
                customClass: {
                  confirmButton: 'btn btn-success'
                },
                buttonsStyling: false,
                timer: 2000, // Fermer automatiquement apr?s 2 secondes
                timerProgressBar: true
              }).then(() => {
                // Recharger les commandes avec pagination au lieu de recharger toute la page
                this.loadCommandes(this.currentPageCommandes, this.searchTermCommandes);
              });
            },
            error: (err: any) => {
              Swal.fire({
                icon: 'error',
                title: 'Erreur',
                text: `Une erreur s'est produite lors de la suppression : ${err.error?.message || err.message || 'Erreur inconnue'}`,
                confirmButtonText: 'Fermer',
                customClass: {
                  confirmButton: 'btn btn-danger'
                },
                buttonsStyling: false
              });
            }
          });
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Erreur',
            text: 'ID de commande introuvable.',
            confirmButtonText: 'Fermer',
            customClass: {
              confirmButton: 'btn btn-danger'
            },
            buttonsStyling: false
          });
        }
      }
    });
}

showNotification(message: string, isError: boolean = false) {
  this.successMessage = message;
  this.isError = isError;

  setTimeout(() => {
    this.successMessage = null;
  }, 5000);
}

  // ===== FILTRES PAR COLONNE (STYLE EXCEL) =====
  onColumnFilterChange(column: string, value: string): void {
    this.columnFilters[column] = value;
    this.applyColumnFilters();
  }

  applyColumnFilters(): void {
    this.commandes = this.allCommandes.filter(item => {
      return Object.keys(this.columnFilters).every(key => {
        const filterValue = this.columnFilters[key];
        if (!filterValue) return true;
        
        const itemValue = item[key];
        if (itemValue === null || itemValue === undefined) return false;
        
        return itemValue.toString().toLowerCase().includes(filterValue.toLowerCase());
      });
    });
    
    this.totalRecordsCommandes = this.commandes.length;
    this.cdr.detectChanges();
  }

  clearColumnFilters(): void {
    this.columnFilters = {
      numero: '',
      date: '',
      client: '',
      depot: '',
      status: '',
      progression: ''
    };
    this.applyColumnFilters();
  }

  // ===== GESTION DU MENU CONTEXTUEL DES COLONNES =====
  showColumnContextMenu(event: MouseEvent, column: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.activeColumnMenu = column;
    this.menuPosition = {
      x: event.clientX,
      y: event.clientY
    };
    this.showColumnMenu = true;
    this.cdr.detectChanges();
  }

  hideColumnContextMenu(): void {
    this.showColumnMenu = false;
    this.activeColumnMenu = '';
    this.cdr.detectChanges();
  }

  toggleColumnVisibility(column: string): void {
    this.columnVisibility[column] = !this.columnVisibility[column];
    this.hideColumnContextMenu();
  }

  togglePinColumn(column: string): void {
    const index = this.pinnedColumns.indexOf(column);
    if (index > -1) {
      this.pinnedColumns.splice(index, 1);
    } else {
      this.pinnedColumns.push(column);
    }
    this.hideColumnContextMenu();
  }

  isColumnPinned(column: string): boolean {
    return this.pinnedColumns.includes(column);
  }

  autoSizeColumn(column: string): void {
    this.columnWidths[column] = this.defaultColumnWidths[column] || 'auto';
    this.hideColumnContextMenu();
  }

  autoSizeAllColumns(): void {
    Object.keys(this.columnVisibility).forEach(column => {
      this.columnWidths[column] = this.defaultColumnWidths[column] || 'auto';
    });
    this.hideColumnContextMenu();
  }

  resetColumns(): void {
    this.columnVisibility = {
      numero: true,
      date: true,
      client: true,
      depot: true,
      status: true,
      progression: true
    };
    this.pinnedColumns = [];
    this.columnWidths = { ...this.defaultColumnWidths };
    this.hideColumnContextMenu();
  }

  startColumnResize(event: MouseEvent, column: string, headerEl: HTMLElement): void {
    event.preventDefault();
    event.stopPropagation();
    this.resizingColumn = column;
    this.resizeStartX = event.clientX;
    const currentWidth = headerEl?.offsetWidth || parseInt(String(this.columnWidths[column] || ''), 10) || 160;
    this.resizeStartWidth = currentWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (!this.resizingColumn) {
      return;
    }

    const delta = event.clientX - this.resizeStartX;
    const minByColumn: any = {
      numero: 126,
      date: 124,
      client: 220,
      depot: 110,
      status: 100,
      progression: 150
    };
    const maxByColumn: any = {
      numero: 220,
      date: 180,
      client: 900,
      depot: 260,
      status: 220,
      progression: 420
    };
    const minWidth = minByColumn[this.resizingColumn] ?? 90;
    const maxWidth = maxByColumn[this.resizingColumn] ?? 600;
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, this.resizeStartWidth + delta));
    this.columnWidths[this.resizingColumn] = `${nextWidth}px`;
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    if (!this.resizingColumn) {
      return;
    }

    this.resizingColumn = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  getColumnIndex(column: string): number {
    const columns = Object.keys(this.columnVisibility);
    return columns.indexOf(column);
  }

  getColumnDisplayName(column: string): string {
    const names: any = {
      numero: 'Numero',
      date: 'Date',
      client: 'Client',
      depot: 'Depot',
      status: 'Status',
      progression: 'Progression'
    };
    return names[column] || column;
  }

  getColumnWidth(column: string): string {
    return this.columnWidths[column] || this.defaultColumnWidths[column] || 'auto';
  }

  getTableMinWidth(): number {
    const visibleColumns = Object.keys(this.columnVisibility).filter((key) => this.columnVisibility[key]);
    const total = visibleColumns.reduce((sum, column) => {
      const rawWidth = this.getColumnWidth(column);
      const width = parseInt(String(rawWidth || '').replace('px', ''), 10);
      return sum + (Number.isFinite(width) ? width : 0);
    }, 0);

    return total + this.actionColumnWidth + 24;
  }

  getAllColumns(): string[] {
    return Object.keys(this.columnVisibility);
  }

  showAllColumns(): void {
    Object.keys(this.columnVisibility).forEach(key => {
      this.columnVisibility[key] = true;
    });
    this.hideColumnContextMenu();
  }

  // Helper pour compter les colonnes visibles
  getVisibleColumnsCount(): number {
    return Object.keys(this.columnVisibility).filter(key => this.columnVisibility[key]).length;
  }

  // Helper pour afficher le menu contextuel avec stopPropagation
  openColumnMenu(event: MouseEvent, column: string): void {
    event.stopPropagation();
    this.showColumnContextMenu(event, column);
  }

  formatStatus(value: any): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return String(value);
  }

  getCommandeStatusBadgeClass(item: any): string {
    const status = String(item?.status ?? item?.Status ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (status === 'traite' || status === 'traitee') {
      return 'badge bg-success';
    }
    return 'badge bg-secondary';
  }

  getCommandeProgressPercent(item: any): number {
    const percent = Number(item?.progression_preparation || 0);
    if (!Number.isFinite(percent) || percent <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, percent));
  }

  getCommandeProgressLabel(item: any): string {
    const prepared = Number(item?.quantite_preparee_preparation || 0);
    const demanded = Number(item?.quantite_demandee_preparation || 0);
    const percent = Number(item?.progression_preparation || 0);

    if (!Number.isFinite(demanded) || demanded <= 0) {
      return '0 / 0 (0%)';
    }

    const safePrepared = Number.isFinite(prepared) ? Math.max(0, prepared) : 0;
    const displayPrepared = Math.min(safePrepared, demanded);
    const safePercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    return `${displayPrepared.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} / ${demanded.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} (${safePercent.toFixed(0)}%)`;
  }
}





