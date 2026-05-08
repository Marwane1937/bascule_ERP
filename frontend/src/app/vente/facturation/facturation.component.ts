import { AfterViewInit, ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { VentesService } from 'src/app/service/ventes.service';
import { EmailService } from 'src/app/service/email.service';
import { PermissionsService } from 'src/app/service/permissions.service';
import { PdfPermissionsService } from 'src/app/service/pdf-permissions.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-facturation',
  templateUrl: './facturation.component.html',
  styleUrls: ['./facturation.component.css']
})
export class FacturationComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly defaultColumnWidths: Record<string, string> = {
    facture_num: '120px',
    facture_dat: '150px',
    client: '200px',
    total_ht: '100px',
    total_tva: '100px',
    total_ttc: '110px',
    status: '95px',
    date_echeance: '150px',
    jours_restants_echeance: '95px',
    numero_livraison: '150px'
  };
  readonly detailColumns: string[] = [
    'date_echeance',
    'jours_restants_echeance',
    'numero_livraison'
  ];
  factures: any[] = [];
  allFactures: any[] = []; // Stocker toutes les factures pour le filtrage
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
  filterClient: string = '';
  filterMontantMin: number | null = null;
  filterMontantMax: number | null = null;
  
  // Affichage de la ligne de filtres
  showFilterRow: boolean = false;
  
  // Liste des clients pour le filtre
  clientsList: string[] = [];

  // Filtres par colonne (style Excel)
  columnFilters: any = {
    facture_num: '',
    facture_dat: '',
    client: '',
    total_ht: '',
    total_tva: '',
    total_ttc: '',
    status: '',
    condition_paiement: '',
    date_echeance: '',
    jours_restants_echeance: '',
    numero_livraison: ''
  };

  // Options pour le filtre Etat
  etatOptions = [
    { value: 'Payée', label: 'Payée', checked: false },
    { value: 'Partiellement Payée', label: 'Partiellement Payée', checked: false },
    { value: 'Non Payée', label: 'Non Payée', checked: false }
  ];

  // Menu déroulant ouvert pour Etat
  showEtatFilter: boolean = false;

  // Gestion des colonnes (affichage/masquage, épinglage, etc.)
  columnVisibility: any = {
    facture_num: true,
    facture_dat: true,
    client: true,
    total_ht: true,
    total_tva: true,
    total_ttc: true,
    status: true,
    date_echeance: false,
    jours_restants_echeance: false,
    numero_livraison: false
  };

  pinnedColumns: string[] = [];
  columnWidths: any = { ...this.defaultColumnWidths };
  showColumnMenu: boolean = false;
  activeColumnMenu: string = '';
  menuPosition: any = { x: 0, y: 0 };
  resizingColumn: string | null = null;
  resizeStartX = 0;
  resizeStartWidth = 0;

  showParcoursModal: boolean = false;
  parcoursLoading: boolean = false;
  parcoursError: string = '';
  factureParcours: any = null;
  showLivraisonDetailsModal: boolean = false;
  livraisonDetailsLoading: boolean = false;
  livraisonDetailsError: string = '';
  factureLivraisonDetails: any = null;
  selectedFacture: any = null;

  // Vérifier si l'utilisateur a accès à l'interface contrat
  hasContratAccess: boolean = false;
  detailMode: boolean = false;
  private sidebarStateBeforeDetailMode: boolean | null = null;
  private readonly livraisonFocusStorageKey = 'facturation-focus-livraison';
  private sidebarObserver: MutationObserver | null = null;

  constructor(
    private ventesService: VentesService,
    private router: Router,
    private emailService: EmailService,
    private cdr: ChangeDetectorRef,
    private permissionsService: PermissionsService,
    public pdfPermissionsService: PdfPermissionsService
  ) {}

  ngOnInit(): void {
    // Vérifier si l'utilisateur a accès à l'interface contrat
    this.hasContratAccess = this.permissionsService.hasAccessToRoute('/Contrat');
    
    // Toujours utiliser loadFactures avec pagination dès le démarrage
    this.loadFactures(1, '', false);
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

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showLivraisonDetailsModal) {
      this.closeFactureLivraisonDetails();
      return;
    }

    if (this.showParcoursModal) {
      this.closeFactureParcours();
    }
  }

  toggleDetailMode(): void {
    if (!this.detailMode) {
      this.sidebarStateBeforeDetailMode = this.isSidebarHidden();
    }

    this.detailMode = !this.detailMode;
    this.applyDetailMode();
  }

  private applyDetailMode(): void {
    this.detailColumns.forEach((column) => {
      this.columnVisibility[column] = this.detailMode;
    });

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

  getJoursRestantsLabel(value: any): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    const days = Number(value);
    if (!Number.isFinite(days)) {
      return '-';
    }

    if (days === 0) {
      return 'Aujourd’hui';
    }

    if (days < 0) {
      return `${Math.abs(days)} jour${Math.abs(days) > 1 ? 's' : ''} de retard`;
    }

    return `${days} jour${days > 1 ? 's' : ''}`;
  }

  isFactureReglee(status: any): boolean {
    const normalizedStatus = String(status || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    return normalizedStatus === 'regle' || normalizedStatus === 'reglee' || normalizedStatus === 'payee';
  }

  formatTableDate(value: any): string {
    if (!value) {
      return '-';
    }

    const pad = (n: number) => n.toString().padStart(2, '0');
    const formatParts = (day: number, month: number, year: string | number): string =>
      `${pad(day)}/${pad(month)}/${year}`;

    if (value instanceof Date && !isNaN(value.getTime())) {
      return formatParts(
        value.getDate(),
        value.getMonth() + 1,
        value.getFullYear()
      );
    }

    const rawValue = String(value).trim();
    const isoDateMatch = rawValue.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoDateMatch) {
      return formatParts(
        Number(isoDateMatch[3]),
        Number(isoDateMatch[2]),
        isoDateMatch[1]
      );
    }

    const frenchDateMatch = rawValue.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (frenchDateMatch) {
      return formatParts(
        Number(frenchDateMatch[1]),
        Number(frenchDateMatch[2]),
        frenchDateMatch[3]
      );
    }

    const parsedDate = new Date(rawValue.replace(' ', 'T'));
    if (isNaN(parsedDate.getTime())) {
      return '-';
    }

    return formatParts(
      parsedDate.getDate(),
      parsedDate.getMonth() + 1,
      parsedDate.getFullYear()
    );
  }

  getJoursRestantsBadgeClass(value: any): string {
    const days = Number(value);
    if (!Number.isFinite(days)) {
      return 'jours-badge jours-badge--muted';
    }

    if (days < 0) {
      return 'jours-badge jours-badge--danger';
    }

    if (days <= 7) {
      return 'jours-badge jours-badge--warning';
    }

    return 'jours-badge jours-badge--success';
  }

  loadFactures(page: number = 1, search: string = '', resetFilters: boolean = false): void {
    this.loading = true;
    this.currentPage = page;
    this.searchTerm = search;
    
    if (resetFilters) {
      this.filterDateFrom = '';
      this.filterDateTo = '';
      this.filterClient = '';
      this.filterMontantMin = null;
      this.filterMontantMax = null;
      // Réinitialiser les filtres de colonnes
      this.columnFilters = {
        facture_num: '',
        facture_dat: '',
        client: '',
        total_ht: '',
        total_tva: '',
        total_ttc: '',
        status: '',
        condition_paiement: '',
        date_echeance: '',
        jours_restants_echeance: '',
        numero_livraison: ''
      };
    }

    // Construire la recherche combinée avec les filtres de colonnes
    let combinedSearch = search;
    if (this.columnFilters.facture_num) {
      combinedSearch += (combinedSearch ? ' ' : '') + this.columnFilters.facture_num;
    }
    if (this.columnFilters.client) {
      combinedSearch += (combinedSearch ? ' ' : '') + this.columnFilters.client;
    }

    this.ventesService.getFactures({
      page: page,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: combinedSearch
    }).subscribe({
      next: (response: any) => {
        const result = response.data || [];
        const pagination = response.pagination || {};
        
        // Les données sont déjà filtrées et paginées par le serveur
        let factures = (Array.isArray(result) ? result : []).filter(f => !this.isAvoirFacture(f));
        
        // Stocker toutes les factures pour le filtrage
        this.allFactures = factures;
        
        // Appliquer les filtres de colonnes côté client
        this.factures = this.applyColumnFilters(factures);
        
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;
        
        
        // Extraire la liste des clients uniques pour le filtre (depuis la page actuelle uniquement)
        this.extractClientsList(this.factures);
        
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.showError("❌ Une erreur s'est produite lors du chargement des factures.");
        this.loading = false;
        this.factures = [];
        this.cdr.detectChanges();
      }
    });
  }

  private isAvoirFacture(facture: any): boolean {
    return String(facture?.facture_num || '').trim().toUpperCase().startsWith('AV');
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

  applyAdvancedFilters(factures: any[]): any[] {
    // Les filtres sont appliqués côté serveur via la recherche
    // Pour les filtres complexes, on peut filtrer côté client aussi
    let filtered = [...factures];
    
    if (this.filterDateFrom) {
      const fromDate = new Date(this.filterDateFrom);
      filtered = filtered.filter(f => {
        if (!f.facture_dat) return false;
        const factureDate = new Date(f.facture_dat);
        return factureDate >= fromDate;
      });
    }
    
    if (this.filterDateTo) {
      const toDate = new Date(this.filterDateTo);
      toDate.setHours(23, 59, 59, 999); // Fin de journée
      filtered = filtered.filter(f => {
        if (!f.facture_dat) return false;
        const factureDate = new Date(f.facture_dat);
        return factureDate <= toDate;
      });
    }
    
    if (this.filterClient) {
      filtered = filtered.filter(f => 
        f.client?.toLowerCase().includes(this.filterClient.toLowerCase())
      );
    }
    
    if (this.filterMontantMin !== null && this.filterMontantMin !== undefined) {
      filtered = filtered.filter(f => (f.total_ttc || 0) >= this.filterMontantMin!);
    }
    
    if (this.filterMontantMax !== null && this.filterMontantMax !== undefined) {
      filtered = filtered.filter(f => (f.total_ttc || 0) <= this.filterMontantMax!);
    }
    
    return filtered;
  }

  onFilterChange(): void {
    // Recharger les données avec les nouveaux filtres
    this.loadFactures(this.currentPage, this.searchTerm);
  }

  resetFilters(): void {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterClient = '';
    this.filterMontantMin = null;
    this.filterMontantMax = null;
    this.loadFactures(1, this.searchTerm, true);
  }

  extractClientsList(factures: any[]): void {
    const clients = new Set<string>();
    factures.forEach(f => {
      if (f.client) {
        clients.add(f.client);
      }
    });
    this.clientsList = Array.from(clients).sort();
  }

  // Appliquer les filtres de colonnes
  applyColumnFilters(factures: any[]): any[] {
    let filtered = [...factures];

    // Filtre par numéro de facture
    if (this.columnFilters.facture_num) {
      filtered = filtered.filter(f => 
        f.facture_num?.toLowerCase().includes(this.columnFilters.facture_num.toLowerCase())
      );
    }

    // Filtre par date
    if (this.columnFilters.facture_dat) {
      const filterDate = new Date(this.columnFilters.facture_dat);
      filtered = filtered.filter(f => {
        if (!f.facture_dat) return false;
        const factureDate = new Date(f.facture_dat);
        return factureDate.toDateString() === filterDate.toDateString();
      });
    }

    // Filtre par client
    if (this.columnFilters.client) {
      filtered = filtered.filter(f => 
        f.client?.toLowerCase().includes(this.columnFilters.client.toLowerCase())
      );
    }

    // Filtre par montant HT
    if (this.columnFilters.total_ht) {
      const amount = parseFloat(this.columnFilters.total_ht);
      if (!isNaN(amount)) {
        filtered = filtered.filter(f => (f.total_ht || 0) >= amount);
      }
    }

    // Filtre par TVA
    if (this.columnFilters.total_tva) {
      const amount = parseFloat(this.columnFilters.total_tva);
      if (!isNaN(amount)) {
        filtered = filtered.filter(f => (f.total_tva || 0) >= amount);
      }
    }

    // Filtre par TTC
    if (this.columnFilters.total_ttc) {
      const amount = parseFloat(this.columnFilters.total_ttc);
      if (!isNaN(amount)) {
        filtered = filtered.filter(f => (f.total_ttc || 0) >= amount);
      }
    }

    // Filtre par statut
    if (this.columnFilters.status) {
      filtered = filtered.filter(f => 
        f.status?.toLowerCase().includes(this.columnFilters.status.toLowerCase())
      );
    }

    if (this.columnFilters.condition_paiement) {
      filtered = filtered.filter(f =>
        f.condition_paiement?.toLowerCase().includes(this.columnFilters.condition_paiement.toLowerCase())
      );
    }

    if (this.columnFilters.date_echeance) {
      const filterDate = new Date(this.columnFilters.date_echeance);
      filtered = filtered.filter(f => {
        if (!f.date_echeance) return false;
        const echeanceDate = new Date(f.date_echeance);
        return echeanceDate.toDateString() === filterDate.toDateString();
      });
    }

    if (this.columnFilters.jours_restants_echeance !== '' && this.columnFilters.jours_restants_echeance !== null) {
      const days = Number(this.columnFilters.jours_restants_echeance);
      if (!Number.isNaN(days)) {
        filtered = filtered.filter(f => Number(f.jours_restants_echeance) <= days);
      }
    }

    if (this.columnFilters.numero_livraison) {
      filtered = filtered.filter(f =>
        f.numero_livraison?.toLowerCase().includes(this.columnFilters.numero_livraison.toLowerCase())
      );
    }

    return filtered;
  }

  // Gérer les changements de filtres de colonnes
  onColumnFilterChange(column: string, value: any): void {
    this.columnFilters[column] = value;
    // Appliquer le filtre immédiatement sur les données de la page actuelle
    this.factures = this.applyColumnFilters([...this.allFactures]);
  }

  // Gérer le filtre Etat avec checkboxes
  onEtatFilterChange(option: any): void {
    option.checked = !option.checked;
    this.columnFilters.etat = this.etatOptions
      .filter(opt => opt.checked)
      .map(opt => opt.value);
    this.loadFactures(1, this.searchTerm);
  }

  // Sélectionner/désélectionner tout pour le filtre Etat
  toggleAllEtatFilters(selectAll: boolean): void {
    this.etatOptions.forEach(opt => opt.checked = selectAll);
    if (selectAll) {
      this.columnFilters.etat = this.etatOptions.map(opt => opt.value);
    } else {
      this.columnFilters.etat = [];
    }
    this.loadFactures(1, this.searchTerm);
  }

  // Vérifier si tous les états sont sélectionnés
  areAllEtatFiltersSelected(): boolean {
    return this.etatOptions.every(opt => opt.checked);
  }

  // Réinitialiser les filtres de colonnes
  clearColumnFilters(): void {
    this.columnFilters = {
      facture_num: '',
      facture_dat: '',
      client: '',
      total_ht: '',
      total_tva: '',
      total_ttc: '',
      status: '',
      condition_paiement: '',
      date_echeance: '',
      jours_restants_echeance: '',
      numero_livraison: ''
    };
    this.loadFactures(1, this.searchTerm);
  }

  // Gestion du menu contextuel des colonnes
  showColumnContextMenu(event: MouseEvent, column: string): void {
    event.preventDefault();
    event.stopPropagation();
    
    this.activeColumnMenu = column;
    
    // Positionner le menu près de l'en-tête de colonne
    const rect = (event.target as HTMLElement).closest('th')?.getBoundingClientRect();
    if (rect) {
      this.menuPosition = {
        x: rect.right - 250, // Ajuster pour que le menu ne dépasse pas
        y: rect.bottom + 5
      };
    } else {
      this.menuPosition = {
        x: event.clientX,
        y: event.clientY
      };
    }
    
    // S'assurer que le menu ne dépasse pas de l'écran
    if (this.menuPosition.x < 10) {
      this.menuPosition.x = 10;
    }
    if (this.menuPosition.y < 10) {
      this.menuPosition.y = 10;
    }
    
    this.showColumnMenu = true;
  }

  hideColumnContextMenu(): void {
    this.showColumnMenu = false;
    this.activeColumnMenu = '';
  }

  openColumnMenu(event: MouseEvent, column: string): void {
    event.stopPropagation();
    this.showColumnContextMenu(event, column);
  }

  // Toggle visibilité d'une colonne
  toggleColumnVisibility(column: string): void {
    this.columnVisibility[column] = !this.columnVisibility[column];
    this.hideColumnContextMenu();
    this.cdr.detectChanges();
  }

  // Épingler/Désépingler une colonne
  togglePinColumn(column: string): void {
    const index = this.pinnedColumns.indexOf(column);
    if (index > -1) {
      this.pinnedColumns.splice(index, 1);
    } else {
      this.pinnedColumns.push(column);
    }
    this.hideColumnContextMenu();
    this.cdr.detectChanges();
  }

  isColumnPinned(column: string): boolean {
    return this.pinnedColumns.includes(column);
  }

  startColumnResize(event: MouseEvent, column: string, headerEl: HTMLElement): void {
    event.preventDefault();
    event.stopPropagation();
    this.resizingColumn = column;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = headerEl?.offsetWidth || parseInt(String(this.getColumnWidth(column) || ''), 10) || 150;
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
      facture_num: 120,
      facture_dat: 150,
      client: 190,
      total_ht: 90,
      total_tva: 90,
      total_ttc: 90,
      status: 100,
      date_echeance: 150,
      jours_restants_echeance: 120,
      numero_livraison: 190
    };
    const maxByColumn: any = {
      facture_num: 260,
      facture_dat: 220,
      client: 420,
      total_ht: 180,
      total_tva: 180,
      total_ttc: 180,
      status: 180,
      date_echeance: 280,
      jours_restants_echeance: 220,
      numero_livraison: 420
    };
    const minWidth = minByColumn[this.resizingColumn] ?? 80;
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

  // Ajuster automatiquement la taille d'une colonne
  autoSizeColumn(column: string): void {
    // Utiliser setTimeout pour s'assurer que le DOM est rendu
    setTimeout(() => {
      const table = document.getElementById('facturationTable');
      if (table) {
        const columnIndex = this.getColumnIndex(column);
        if (columnIndex >= 0) {
          let maxWidth = 100; // Largeur minimale
          
          // Parcourir toutes les cellules de la colonne pour trouver la largeur maximale
          const headerCell = table.querySelector(`thead tr:first-child th:nth-child(${columnIndex + 1})`);
          if (headerCell) {
            const headerWidth = (headerCell as HTMLElement).scrollWidth;
            if (headerWidth > maxWidth) {
              maxWidth = headerWidth;
            }
          }
          
          const cells = table.querySelectorAll(`tbody td:nth-child(${columnIndex + 1})`);
          cells.forEach((cell: any) => {
            const cellWidth = cell.scrollWidth;
            if (cellWidth > maxWidth) {
              maxWidth = cellWidth;
            }
          });
          
          // Ajouter un peu de padding
          maxWidth += 30;
          this.columnWidths[column] = maxWidth + 'px';
          this.cdr.detectChanges();
        }
      }
    }, 100);
    this.hideColumnContextMenu();
  }

  // Ajuster automatiquement toutes les colonnes
  autoSizeAllColumns(): void {
    const columns = this.getAllColumns();
    columns.forEach(col => {
      if (this.columnVisibility[col]) {
        this.autoSizeColumn(col);
      }
    });
  }

  // Réinitialiser toutes les colonnes
  resetColumns(): void {
    this.columnVisibility = {
      facture_num: true,
      facture_dat: true,
      client: true,
      total_ht: true,
      total_tva: true,
      total_ttc: true,
      status: true,
      date_echeance: this.detailMode,
      jours_restants_echeance: this.detailMode,
      numero_livraison: this.detailMode
    };
    this.pinnedColumns = [];
    this.columnWidths = { ...this.defaultColumnWidths };
    this.hideColumnContextMenu();
    this.cdr.detectChanges();
  }

  getColumnWidth(column: string): string {
    return this.columnWidths[column] || this.defaultColumnWidths[column] || 'auto';
  }

  // Obtenir l'index d'une colonne
  getColumnIndex(column: string): number {
    const columnOrder = this.getAllColumns();
    return columnOrder.indexOf(column);
  }

  // Obtenir le nom d'affichage d'une colonne
  getColumnDisplayName(column: string): string {
    const names: any = {
      facture_num: 'Numéro',
      facture_dat: 'Date',
      client: 'Client',
      total_ht: 'HT',
      total_tva: 'TVA',
      total_ttc: 'TTC',
      status: 'Statut',
      date_echeance: 'Echeance',
      jours_restants_echeance: 'Reste/J',
      numero_livraison: 'BL affectes'
    };
    return names[column] || column;
  }

  // Obtenir toutes les colonnes disponibles
  getAllColumns(): string[] {
    return [
      'facture_num',
      'facture_dat',
      'client',
      'total_ht',
      'total_tva',
      'total_ttc',
      'status',
      'date_echeance',
      'jours_restants_echeance',
      'numero_livraison'
    ];
  }

  // Obtenir la classe CSS pour le badge de statut
  getStatusBadgeClass(status: string): string {
    if (!status) return 'badge-secondary';
    const statusLower = status.toLowerCase().trim();
    if (statusLower === 'réglé' || statusLower === 'regele' || statusLower === 'regle') {
      return 'badge-success';
    } else if (statusLower === 'en cours' || statusLower === 'encours') {
      return 'badge-warning';
    } else if (statusLower === 'non réglé' || statusLower === 'non regele' || statusLower === 'non regle') {
      return 'badge-danger';
    }
    return 'badge-secondary';
  }

  // Afficher toutes les colonnes
  showAllColumns(): void {
    this.getAllColumns().forEach(col => {
      this.columnVisibility[col] = true;
    });
    this.hideColumnContextMenu();
    this.cdr.detectChanges();
  }

  // Compter les colonnes visibles
  getVisibleColumnsCount(): number {
    return Object.keys(this.columnVisibility).filter(key => this.columnVisibility[key]).length;
  }

  // Export des données
  exportToCSV(): void {
    const headers = ['Numéro', 'Date', 'Client', 'HT', 'TVA', 'TTC'];
    const rows = this.factures.map(f => [
      f.facture_num || '',
      this.formatTableDate(f.facture_dat),
      f.client || '',
      (f.total_ht || 0).toFixed(2),
      (f.total_tva || 0).toFixed(2),
      (f.total_ttc || 0).toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `factures_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    this.showNotification('✅ Export CSV réussi !', false);
  }

  onPrintFacture(facture_id: any, type: 'standard' | 'simple' | 'contrat' = 'standard') {
    if (!facture_id) {
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
    
    const serviceCall = type === 'contrat'
      ? this.emailService.generateFactureContratPDF(facture_id.toString())
      : this.emailService.generateFacturePDF(facture_id.toString(), { simple: type === 'simple' });
    
    serviceCall.subscribe({
      next: (res: any) => {
        Swal.close();
        const url = res?.pdfUrl;
        if (url) {
          window.open(url, '_blank');
        } else {
          Swal.fire({ icon: 'error', title: 'Erreur', text: 'Lien PDF non reçu.' });
        }
      },
      error: (err: any) => {
        Swal.close();
        Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors de la génération du PDF." });
      }
    });
  }

  openFactureParcours(facture: any): void {
    const factureId = Number(facture?.facture_id || 0);
    if (!factureId) {
      return;
    }

    this.selectedFacture = facture;
    this.showParcoursModal = true;
    this.parcoursLoading = true;
    this.parcoursError = '';
    this.factureParcours = null;

    this.ventesService.getFactureParcours(factureId).subscribe({
      next: (response: any) => {
        this.factureParcours = response?.data || response || null;
        this.parcoursLoading = false;
        this.cdr.detectChanges();
      },
      error: (error: any) => {
        this.parcoursLoading = false;
        this.parcoursError = error?.error?.message || 'Erreur lors du chargement du parcours de facture.';
        this.cdr.detectChanges();
      }
    });
  }

  closeFactureParcours(): void {
    this.showParcoursModal = false;
    this.parcoursLoading = false;
    this.parcoursError = '';
    this.factureParcours = null;
    if (!this.showLivraisonDetailsModal) {
      this.selectedFacture = null;
    }
  }

  getParcoursDocuments(key: 'commandes' | 'preparations' | 'livraisons'): any[] {
    const documents = this.factureParcours?.[key];
    return Array.isArray(documents) ? documents : [];
  }

  getParcoursStepSubtitle(step: any): string {
    const count = Number(step?.count || 0);
    const status = String(step?.status || '');

    if (status === 'direct') {
      return 'Transfert direct';
    }

    if (count === 0) {
      return 'Aucun document';
    }

    return count === 1 ? '1 document' : `${count} documents`;
  }

  getParcoursStepClass(step: any): string {
    const status = String(step?.status || 'pending');
    return `is-${status}`;
  }

  getLivraisonSourceLabel(livraison: any): string {
    const sourceNumero = String(livraison?.source_numero || '').trim();
    if (!sourceNumero) {
      return '';
    }

    return livraison?.source_type === 'preparation'
      ? `Depuis préparation ${sourceNumero}`
      : `Depuis commande ${sourceNumero}`;
  }
  openFactureLivraisonDetails(facture: any): void {
    const factureId = Number(facture?.facture_id || 0);
    if (!factureId) {
      return;
    }

    this.selectedFacture = facture;
    this.showLivraisonDetailsModal = true;
    this.livraisonDetailsLoading = true;
    this.livraisonDetailsError = '';
    this.factureLivraisonDetails = null;

    this.ventesService.getFactureLivraisonDetails(factureId).subscribe({
      next: (response: any) => {
        this.factureLivraisonDetails = response?.data || response || null;
        this.livraisonDetailsLoading = false;
        this.cdr.detectChanges();
      },
      error: (error: any) => {
        this.livraisonDetailsLoading = false;
        this.livraisonDetailsError = error?.error?.message || 'Erreur lors du chargement du détail des bons de livraison.';
        this.cdr.detectChanges();
      }
    });
  }

  closeFactureLivraisonDetails(): void {
    this.showLivraisonDetailsModal = false;
    this.livraisonDetailsLoading = false;
    this.livraisonDetailsError = '';
    this.factureLivraisonDetails = null;
    if (!this.showParcoursModal) {
      this.selectedFacture = null;
    }
  }

  getFactureLivraisonDocuments(): any[] {
    const livraisons = this.factureLivraisonDetails?.livraisons;
    return Array.isArray(livraisons) ? livraisons : [];
  }

  openLivraisonFromFacture(livraison: any): void {
    const numero = String(livraison?.numero || '').trim();
    if (!numero) {
      return;
    }

    localStorage.setItem(this.livraisonFocusStorageKey, JSON.stringify({
      numero,
      timestamp: Date.now()
    }));

    this.closeFactureLivraisonDetails();
    this.router.navigate(['/Livraison']);
  }
}
