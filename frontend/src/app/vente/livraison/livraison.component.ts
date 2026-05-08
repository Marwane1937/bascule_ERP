import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { VentesService } from 'src/app/service/ventes.service';
import { EmailService } from 'src/app/service/email.service';
import { PdfPermissionsService } from 'src/app/service/pdf-permissions.service';
import Swal from 'sweetalert2';
import { Subscription, forkJoin } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

interface CommandeProgressLine {
  article_id: number | null;
  article_cod: string;
  article_nom: string;
  quantite_demandee: number;
  quantite_preparee: number;
  quantite_livree: number;
  quantite_restante_preparation: number;
  quantite_restante_livraison: number;
  preparation_percent: number;
  livraison_percent: number;
  etat_label: string;
  has_preparation: boolean;
}

interface CommandeProgressData {
  commande_id: number;
  commande_numero: string;
  has_preparation: boolean;
  message?: string;
  totals: {
    quantite_demandee: number;
    quantite_preparee: number;
    quantite_livree: number;
    quantite_restante_preparation: number;
    quantite_restante_livraison: number;
    pending_products_count: number;
    progression_percent: number;
  };
  lines: CommandeProgressLine[];
}

@Component({
  selector: 'app-livraison',
  templateUrl: './livraison.component.html',
  styleUrls: ['./livraison.component.css']
})
export class LivraisonComponent implements OnInit, AfterViewInit, OnDestroy {
  livraisons: any[] = [];
  dataTableLivraison: any;
  loading: boolean = true;
  loadingLivraisons: boolean = false;
  loadingCommandes: boolean = false;
  loadingCommandesFacturation: boolean = false;
  dataTableCommandes: any;
  dataTableCommandesFacturation: any;
  searchTerm = '';
  searchTermLivraisons: string = '';
  clients: any[] = [];
  filteredClients: any[] = [];
  selectedClient: any = null;
  searchCommercial = '';
  commerciaux: any[] = [];
  filteredCommerciaux: any[] = [];
  selectedCommercial: any = null;
  depots: any[] = [];
  LivraisonForm!: FormGroup;
  successMessage: string | null = null;
  isError: boolean = false;
  isWarning: boolean = false;
  nextLivraisonNumero: string = 'BL25-0001';
  
  // Commandes pour transfert vers livraison
  commandes: any[] = [];
  filteredCommandes: any[] = [];
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  totalCommandes = 0;
  startIndex = 0;
  endIndex = 0;
  sortColumn: string = 'numero';
  sortDirection: 'asc' | 'desc' = 'desc';
  
  // Commandes pour transfert vers facturation
  commandesFacturation: any[] = [];
  filteredCommandesFacturation: any[] = [];
  currentPageFacturation = 1;
  pageSizeFacturation = 10;
  totalPagesFacturation = 1;
  totalCommandesFacturation = 0;
  startIndexFacturation = 0;
  endIndexFacturation = 0;
  sortColumnFacturation: string = 'numero';
  sortDirectionFacturation: 'asc' | 'desc' = 'desc';
  
  // Pagination pour les livraisons
  currentPageLivraisons: number = 1;
  pageSizeLivraisons: number = 25;
  totalRecordsLivraisons: number = 0;
  totalPagesLivraisons: number = 0;
  
  // Tri pour les livraisons
  sortColumnLivraisons: string = 'date';
  sortDirectionLivraisons: 'ASC' | 'DESC' = 'DESC';
  
  // Filtres avanc?s pour les livraisons
  showAdvancedFiltersLivraisons: boolean = false;
  filterDateFromLivraisons: string = '';
  filterDateToLivraisons: string = '';
  filterClientLivraisons: string = '';
  
  // Affichage de la ligne de filtres
  showFilterRow: boolean = false;
  
  // Liste des clients pour le filtre
  clientsListLivraisons: string[] = [];

  // Filtres par colonne (style Excel) pour les livraisons
  columnFilters: any = {
    numero: '',
    commande_numero: '',
    date: '',
    client: '',
    total_ht: '',
    total_tva: '',
    total_ttc: ''
  };

  allLivraisons: any[] = []; // Stocker toutes les livraisons pour le filtrage

  // Gestion des colonnes (affichage/masquage, ?pinglage, etc.)
  columnVisibility: any = {
    numero: true,
    commande_numero: true,
    date: true,
    client: true,
    total_ht: true,
    total_tva: true,
    total_ttc: true
  };

  pinnedColumns: string[] = [];
  columnWidths: any = {};
  showColumnMenu: boolean = false;
  activeColumnMenu: string = '';
  menuPosition: any = { x: 0, y: 0 };
  resizingColumn: string | null = null;
  resizeStartX = 0;
  resizeStartWidth = 0;
  highlightedLivraisonNumero: string = '';
  detailMode: boolean = false;
  private readonly livraisonFocusStorageKey = 'facturation-focus-livraison';
  private sidebarStateBeforeDetailMode: boolean | null = null;
  private sidebarObserver: MutationObserver | null = null;
  
  private clientSearchSub?: Subscription;
  private commercialSearchSub?: Subscription;

  // Email form
  emailForm!: FormGroup;
  selectedLivraisonForEmail: any = null;
  isSending: boolean = false;

  // Dashboard
  showDashboard: boolean = false;
  dashboardLoading: boolean = false;
  dashboardStats: any = {
    totalLivraisons: 0,
    totalClients: 0,
    totalMontantHT: 0,
    totalMontantTTC: 0,
    totalTVA: 0,
    prixMoyenVente: 0,
    chiffreAffaireParClient: [],
    chiffreAffaireParArticle: []
  };
  
  // Charts
  evolutionChart: any = null;
  clientChart: any = null;
  topClientsChart: any = null;
  articleChart: any = null;
  commandePopoverVisible: boolean = false;
  commandePopoverLoading: boolean = false;
  commandePopoverData: CommandeProgressData | null = null;
  commandePopoverPosition = { top: 0, left: 0 };
  private hoveredCommandeId: number | null = null;
  private commandePopoverAnchor = { x: 0, y: 0 };
  private commandePopoverHideTimeout: ReturnType<typeof setTimeout> | null = null;
  private commandeProgressCache = new Map<number, CommandeProgressData>();

  constructor(
    private ventesService: VentesService, 
    private router: Router,
    private baseService: BaseService, 
    private fb: FormBuilder, 
    private emailService: EmailService,
    private cdr: ChangeDetectorRef,
    public pdfPermissionsService: PdfPermissionsService
  ) {
    this.emailForm = this.fb.group({
      to: ['', [Validators.required, Validators.email]],
      cc: [''],
      subject: ['Livraison à votre attention'],
      body: ['Bonjour,\n\nVeuillez trouver ci-joint le bon de livraison demandé.\n\nCordialement,']
    });
  }

  ngOnInit(): void {
    const focusedLivraison = this.consumePendingFocusedLivraison();
    if (focusedLivraison?.numero) {
      this.highlightedLivraisonNumero = focusedLivraison.numero;
      this.ventesService.getLivraisonLocationByNumero(focusedLivraison.numero, {
        pageSize: this.pageSizeLivraisons,
        orderBy: this.sortColumnLivraisons,
        orderDirection: this.sortDirectionLivraisons
      }).subscribe({
        next: (response: any) => {
          const page = Number(response?.data?.page || 1);
          this.loadLivraisons(page > 0 ? page : 1, '', false);
        },
        error: () => {
          this.loadLivraisons(1, '', false);
        }
      });
    } else {
      this.getLivraisons();
    }
    this.getCommandesNonLivrees();
    this.AllClients();
    this.AllCommerciaux();
    this.AllDepots();
    this.initForm();
    this.resetFormState();
    this.loadNextLivraisonNumero();
  }

  initForm(): void {
    // R?cup?rer la date du jour au format YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    
    this.LivraisonForm = this.fb.group({
      date: [today], // Date du jour par défaut, automatiquement renseign?e
      description: [''], // Non obligatoire
      part_id: [0, Validators.required], // Client obligatoire uniquement
      contact_id: [0], // Commercial non obligatoire
      depot_id: [null],
      date_fin: [''], // Non obligatoire
      etat: [3],
      clientSearch: [''],
      commercialSearch: ['']
    });

    this.setupFormListeners();
  }

  private setupFormListeners(): void {
    // Les listeners ne sont plus n?cessaires car on utilise directement (input) dans le template
    // On garde cette méthode vide pour ?viter les erreurs si elle est appel?e ailleurs
  }

  private resetFormState(): void {
    if (!this.LivraisonForm) {
      return;
    }

    // R?cup?rer la date du jour au format YYYY-MM-DD
   // const today = new Date().toISOString().split('T')[0];
   const now = new Date();
   const pad = (n: number) => n.toString().padStart(2, '0');
   const datetimeLocal =
     `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T` +
     `${pad(now.getHours())}:${pad(now.getMinutes())}`;
   
    
    this.LivraisonForm.reset({ 
      date: datetimeLocal, // Date du jour par défaut
      description: '',
      part_id: 0,
      contact_id: 0,
      depot_id: null,
      date_fin: '',
      etat: 3,
      clientSearch: '',
      commercialSearch: ''
    }, { emitEvent: false });

    this.filteredClients = [];
    this.filteredCommerciaux = [];
    this.searchTerm = '';
    this.searchCommercial = '';
  }

  getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
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

    const anyWindow = window as any;
    // @ts-ignore
    if (typeof ($) !== 'undefined') {
      // @ts-ignore
      $('#modalCommandeLivraisonXL').on('shown.bs.modal', () => {
        this.getCommandesNonLivrees();
      });

      // @ts-ignore
      $('#modalCommandeFacturationXL').on('shown.bs.modal', () => {
        this.getCommandesNonLivrees();
      });

      // @ts-ignore
      $('#modalCommandeLivraisonXL').on('hidden.bs.modal', () => {
        if (this.dataTableCommandes) {
          // @ts-ignore
          this.dataTableCommandes.destroy();
          this.dataTableCommandes = null;
        }
      });

      // @ts-ignore
      $('#modalCommandeFacturationXL').on('hidden.bs.modal', () => {
        if (this.dataTableCommandesFacturation) {
          // @ts-ignore
          this.dataTableCommandesFacturation.destroy();
          this.dataTableCommandesFacturation = null;
        }
      });

      // @ts-ignore
      $('#addLivraisonModal').on('shown.bs.modal', () => {
        this.resetFormState();
        this.loadNextLivraisonNumero();
        // S'assurer que les clients et commerciaux sont charg?s ? chaque ouverture du modal
        this.AllClients();
        this.AllCommerciaux();
        // Réinitialiser les listes filtr?es
        this.filteredClients = [];
        this.filteredCommerciaux = [];
        this.searchTerm = '';
        this.searchCommercial = '';
      });

      // @ts-ignore
      $('#addLivraisonModal').on('hidden.bs.modal', () => {
        this.resetFormState();
      });
    }

    this.startSidebarObserver();
  }

  loadNextLivraisonNumero(): void {
    this.ventesService.getNextLivraisonNumero().subscribe({
      next: (response: any) => {
        if (response && response.numero) {
          this.nextLivraisonNumero = response.numero;
        }
      },
      error: (err) => {
        // Erreur silencieuse
      }
    });
  }

  loadLivraisons(page: number = 1, search: string = '', resetFilters: boolean = false): void {
    this.loadingLivraisons = true;
    this.hideCommandeProgressPopover(true);
    this.currentPageLivraisons = page;
    this.searchTermLivraisons = search;
    
    if (resetFilters) {
      this.filterDateFromLivraisons = '';
      this.filterDateToLivraisons = '';
      this.filterClientLivraisons = '';
    }

    this.ventesService.getLivraisons({
      page: page,
      pageSize: this.pageSizeLivraisons,
      orderBy: this.sortColumnLivraisons,
      orderDirection: this.sortDirectionLivraisons,
      search: search
    }).subscribe({
      next: (response: any) => {
        const result = response.data || [];
        const pagination = response.pagination || {};
        
        // Les données sont déjà filtr?es et pagin?es par le serveur
        const livraisonsData = (Array.isArray(result) ? result : []).map((item: any) => ({
          ...item,
          checked: false
        }));
        this.livraisons = livraisonsData;
        this.allLivraisons = [...livraisonsData]; // Stocker une copie pour les filtres locaux
        this.totalRecordsLivraisons = pagination.total || 0;
        this.totalPagesLivraisons = pagination.totalPages || 1;
        
        // Extraire la liste des clients uniques pour le filtre (depuis la page actuelle uniquement)
        this.extractClientsListLivraisons(this.livraisons);
        
        // Appliquer les filtres de colonne s'ils existent
        this.applyColumnFilters();
        
        this.loadingLivraisons = false;
        this.cdr.detectChanges();
        this.applyFocusedLivraisonHighlight();
      },
      error: (err) => {
        this.showError("Erreur Une erreur s'est produite lors du chargement des livraisons.");
        this.loadingLivraisons = false;
        this.livraisons = [];
        this.allLivraisons = [];
        this.cdr.detectChanges();
      }
    });
  }

  getLivraisons(): void {
    // Toujours utiliser loadLivraisons avec pagination d?s le démarrage
    this.loadLivraisons(1, '', false);
  }

  private consumePendingFocusedLivraison(): { numero: string } | null {
    try {
      const rawValue = localStorage.getItem(this.livraisonFocusStorageKey);
      if (!rawValue) {
        return null;
      }

      localStorage.removeItem(this.livraisonFocusStorageKey);
      const parsed = JSON.parse(rawValue);
      const numero = String(parsed?.numero || '').trim();
      return numero ? { numero } : null;
    } catch {
      localStorage.removeItem(this.livraisonFocusStorageKey);
      return null;
    }
  }

  private applyFocusedLivraisonHighlight(): void {
    if (!this.highlightedLivraisonNumero) {
      return;
    }

    setTimeout(() => {
      const rows = Array.from(document.querySelectorAll('[data-livraison-numero]')) as HTMLElement[];
      const targetRow = rows.find((row) => String(row.getAttribute('data-livraison-numero') || '').trim() === this.highlightedLivraisonNumero);
      if (!targetRow) {
        return;
      }

      targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  }

  isFocusedLivraison(livraison: any): boolean {
    return String(livraison?.numero || '').trim() === this.highlightedLivraisonNumero;
  }

  onCommandeCellEnter(livraison: any, event: MouseEvent): void {
    const commandeId = Number(livraison?.commande_id || 0);
    const commandeNumero = String(livraison?.commande_numero || '').trim();

    if (!commandeId || !commandeNumero) {
      return;
    }

    this.clearCommandePopoverHideTimer();
    this.hoveredCommandeId = commandeId;
    this.commandePopoverVisible = true;
    this.commandePopoverLoading = false;
    this.updateCommandePopoverPosition(event);

    const cachedProgress = this.commandeProgressCache.get(commandeId);
    if (cachedProgress) {
      this.commandePopoverData = cachedProgress;
      return;
    }

    this.commandePopoverLoading = true;
    this.commandePopoverData = this.createEmptyCommandeProgressData(commandeId, commandeNumero, 'Chargement de la progression...');

    this.ventesService.getLivraisonCommandeProgress(commandeId).subscribe({
      next: (response: any) => {
        const progress = (response?.data || response || null) as CommandeProgressData | null;
        if (!progress) {
          if (this.hoveredCommandeId === commandeId) {
            this.commandePopoverData = this.createEmptyCommandeProgressData(commandeId, commandeNumero, 'Aucune progression disponible.');
            this.commandePopoverLoading = false;
            this.cdr.detectChanges();
          }
          return;
        }

        this.commandeProgressCache.set(commandeId, progress);

        if (this.hoveredCommandeId !== commandeId) {
          return;
        }

        this.commandePopoverData = progress;
        this.commandePopoverLoading = false;
        this.updateCommandePopoverPosition();
        this.cdr.detectChanges();
      },
      error: () => {
        if (this.hoveredCommandeId !== commandeId) {
          return;
        }

        this.commandePopoverData = this.createEmptyCommandeProgressData(
          commandeId,
          commandeNumero,
          'Impossible de charger l\'etat de cette commande.'
        );
        this.commandePopoverLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  onCommandeCellMove(event: MouseEvent): void {
    if (!this.commandePopoverVisible) {
      return;
    }

    this.updateCommandePopoverPosition(event);
  }

  onCommandePopoverMouseEnter(): void {
    this.clearCommandePopoverHideTimer();
  }

  scheduleHideCommandeProgressPopover(): void {
    this.clearCommandePopoverHideTimer();
    this.commandePopoverHideTimeout = setTimeout(() => {
      this.hideCommandeProgressPopover();
    }, 160);
  }

  hideCommandeProgressPopover(force: boolean = false): void {
    this.clearCommandePopoverHideTimer();
    this.hoveredCommandeId = null;
    this.commandePopoverVisible = false;
    this.commandePopoverLoading = false;
    this.commandePopoverData = null;

    if (force) {
      this.commandePopoverPosition = { top: 0, left: 0 };
    }
  }

  getCommandeLinePendingLabel(line: CommandeProgressLine): string {
    if (Number(line?.quantite_restante_preparation || 0) > 0) {
      return `${this.formatQuantity(line.quantite_restante_preparation)} a preparer`;
    }

    if (Number(line?.quantite_restante_livraison || 0) > 0) {
      return `${this.formatQuantity(line.quantite_restante_livraison)} a livrer`;
    }

    return 'Termine';
  }

  getCommandeLineStatusClass(line: CommandeProgressLine): string {
    const status = String(line?.etat_label || '').toLowerCase();

    if (status.includes('livre')) {
      return 'is-done';
    }
    if (status.includes('livraison')) {
      return 'is-delivery';
    }
    if (status.includes('pret')) {
      return 'is-ready';
    }
    if (status.includes('preparation')) {
      return 'is-preparation';
    }

    return 'is-pending';
  }

  getCommandeLineRemainingValue(line: CommandeProgressLine): number {
    const restePreparation = Number(line?.quantite_restante_preparation || 0);
    if (restePreparation > 0) {
      return restePreparation;
    }

    return Number(line?.quantite_restante_livraison || 0);
  }

  getCommandeLineRemainingLabel(line: CommandeProgressLine): string {
    if (Number(line?.quantite_restante_preparation || 0) > 0) {
      return 'A preparer';
    }

    if (Number(line?.quantite_restante_livraison || 0) > 0) {
      return 'A livrer';
    }

    return 'Termine';
  }

  getCommandePreparationPercent(totalDemandee: number, totalPreparee: number): number {
    const demandee = Number(totalDemandee || 0);
    if (demandee <= 0) {
      return 0;
    }

    return Number((((Number(totalPreparee || 0)) * 100) / demandee).toFixed(2));
  }

  getCommandeDisplayedRemainingTotal(data: CommandeProgressData | null): number {
    if (!data?.totals) {
      return 0;
    }

    const restePreparation = Number(data.totals.quantite_restante_preparation || 0);
    if (restePreparation > 0) {
      return restePreparation;
    }

    return Number(data.totals.quantite_restante_livraison || 0);
  }

  private createEmptyCommandeProgressData(
    commandeId: number,
    commandeNumero: string,
    message: string
  ): CommandeProgressData {
    return {
      commande_id: commandeId,
      commande_numero: commandeNumero,
      has_preparation: false,
      message,
      totals: {
        quantite_demandee: 0,
        quantite_preparee: 0,
        quantite_livree: 0,
        quantite_restante_preparation: 0,
        quantite_restante_livraison: 0,
        pending_products_count: 0,
        progression_percent: 0
      },
      lines: []
    };
  }

  private updateCommandePopoverPosition(event?: MouseEvent): void {
    if (event) {
      this.commandePopoverAnchor = {
        x: event.clientX,
        y: event.clientY
      };
    }

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1280;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720;
    const popoverWidth = Math.min(380, Math.max(0, viewportWidth - 32));
    const lineCount = this.commandePopoverData?.lines?.length || 0;
    const estimatedHeight = Math.min(430, this.commandePopoverLoading ? 170 : 170 + (lineCount * 84));
    const popoverHeight = Math.min(estimatedHeight, Math.max(0, viewportHeight - 32));
    const left = Math.max(16, Math.round((viewportWidth - popoverWidth) / 2));
    const top = Math.max(16, Math.round((viewportHeight - popoverHeight) / 2));

    this.commandePopoverPosition = { top, left };
  }

  private clearCommandePopoverHideTimer(): void {
    if (this.commandePopoverHideTimeout) {
      clearTimeout(this.commandePopoverHideTimeout);
      this.commandePopoverHideTimeout = null;
    }
  }

  private formatQuantity(value: number): string {
    const numericValue = Number(value || 0);
    return Number.isInteger(numericValue) ? `${numericValue}` : numericValue.toFixed(2);
  }

  getSelectedLivraisonsCount(): number {
    return this.livraisons.filter((l: any) => !!l?.checked && !this.isFacturee(l)).length;
  }

  hasMultipleLivraisonsSelected(): boolean {
    return this.getSelectedLivraisonsCount() > 1;
  }

  isAllLivraisonsSelected(): boolean {
    const selectableLivraisons = this.livraisons.filter((l: any) => !this.isFacturee(l));
    if (selectableLivraisons.length === 0) return false;
    return selectableLivraisons.every((l: any) => !!l.checked);
  }

  toggleAllLivraisons(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.livraisons.forEach((l: any) => {
      if (!this.isFacturee(l)) {
        l.checked = checked;
      }
    });
    this.cdr.detectChanges();
  }

  toggleLivraisonSelection(livraison: any, event: Event): void {
    if (!livraison || this.isFacturee(livraison)) return;
    livraison.checked = (event.target as HTMLInputElement).checked;
    this.cdr.detectChanges();
  }

  clearLivraisonSelection(): void {
    this.livraisons.forEach((l: any) => l.checked = false);
    this.allLivraisons.forEach((l: any) => l.checked = false);
  }

  transfererLivraisonsSelectionneesVersFacturation(): void {
    const livraisonsSelectionnees = this.livraisons.filter((l: any) => !!l?.checked && !this.isFacturee(l));
    if (livraisonsSelectionnees.length <= 1) return;

    Swal.fire({
      title: 'Vérification des bons sélectionnés...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    const checks = livraisonsSelectionnees.map((livraison: any) =>
      this.ventesService.getLivraisonDataForTransfer(Number(livraison.document_id))
    );

    forkJoin(checks).subscribe({
      next: (details: any[]) => {
        const validSelections = livraisonsSelectionnees.map((livraison: any, index: number) => {
          const detail = details[index] || {};
          return {
            livraison,
            partId: Number(detail?.part_id),
            clientName: detail?.client_nom || detail?.client || '',
            date: detail?.date
          };
        }).filter((item: any) => !!item.partId && !isNaN(item.partId));

        if (validSelections.length !== livraisonsSelectionnees.length) {
          Swal.close();
          this.showNotification('Transfert groupé impossible: certains bons sont invalides.', 'warning');
          return;
        }

        const uniquePartIds = Array.from(new Set(validSelections.map((item: any) => item.partId)));
        if (uniquePartIds.length > 1) {
          Swal.close();
          this.showNotification('Transfert groupé impossible: les bons sélectionnés appartiennent à des clients différents.', 'warning');
          return;
        }

        const first = validSelections[0];
        const defaultDate = first?.date
          ? new Date(first.date).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
        const defaultClientName = first?.clientName || '';
        const defaultPartId = Number(first?.partId);

        Swal.close();
        this.openGroupedFacturationPopup(livraisonsSelectionnees, defaultDate, defaultClientName, defaultPartId);
      },
      error: () => {
        Swal.close();
        this.showNotification('Impossible de vérifier les bons sélectionnés.', 'warning');
      }
    });
  }

  private openGroupedFacturationPopup(
    livraisons: any[],
    defaultDate: string,
    defaultClientName: string,
    defaultPartId: number
  ): void {
    let selectedPartId = defaultPartId || null;

    const htmlContent = `
      <div style="text-align: left; padding: 10px;">
        <div class="mb-3">
          <label for="factureDate" style="display: block; margin-bottom: 5px; font-weight: bold;">Date de facture:</label>
          <input type="date" id="factureDate" class="swal2-input" value="${defaultDate}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <div class="mb-3" style="position: relative;">
          <label for="factureClient" style="display: block; margin-bottom: 5px; font-weight: bold;">Client:</label>
          <input type="text" id="factureClient" class="swal2-input" value="${defaultClientName}" 
                 placeholder="Rechercher un client..." 
                 style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                 autocomplete="off">
          <div id="clientSuggestions" style="position: absolute; z-index: 1000; background: white; border: 1px solid #ddd; max-height: 200px; overflow-y: auto; width: calc(100% - 2px); margin-top: 2px; display: none; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"></div>
        </div>
        <input type="hidden" id="selectedPartId" value="${defaultPartId || ''}">
      </div>
    `;

    Swal.fire({
      title: 'Confirmer le transfert',
      html: htmlContent,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Oui, transférer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      reverseButtons: true,
      width: '650px',
      padding: '2rem',
      didOpen: () => {
        const clientInput = document.getElementById('factureClient') as HTMLInputElement;
        const suggestionsDiv = document.getElementById('clientSuggestions');
        const hiddenPartId = document.getElementById('selectedPartId') as HTMLInputElement;

        if (clientInput && suggestionsDiv && hiddenPartId) {
          let searchTimeout: any;

          clientInput.addEventListener('input', (e: any) => {
            const searchTerm = e.target.value;
            clearTimeout(searchTimeout);

            if (searchTerm.length >= 2) {
              searchTimeout = setTimeout(() => {
                this.onSearchChange(searchTerm);
                setTimeout(() => {
                  if (this.filteredClients.length > 0) {
                    suggestionsDiv.innerHTML = this.filteredClients.map((client: any) => {
                      const clientName = (client.nom || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                      return `<div style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;" 
                                  onmouseover="this.style.background='#f0f0f0'" 
                                  onmouseout="this.style.background='white'"
                                  data-part-id="${client.part_id}"
                                  data-client-name="${clientName}">
                              ${client.nom || ''}
                            </div>`;
                    }).join('');
                    suggestionsDiv.style.display = 'block';

                    suggestionsDiv.querySelectorAll('div[data-part-id]').forEach((div: any) => {
                      div.addEventListener('click', () => {
                        const partId = parseInt(div.getAttribute('data-part-id'), 10);
                        const clientName = div.getAttribute('data-client-name');
                        clientInput.value = clientName;
                        selectedPartId = partId;
                        hiddenPartId.value = partId.toString();
                        suggestionsDiv.style.display = 'none';
                      });
                    });
                  } else {
                    suggestionsDiv.innerHTML = '<div style="padding: 10px; color: #999;">Aucun client trouvé</div>';
                    suggestionsDiv.style.display = 'block';
                  }
                }, 100);
              }, 300);
            } else {
              suggestionsDiv.style.display = 'none';
            }
          });
        }
      },
      preConfirm: () => {
        const dateInput = document.getElementById('factureDate') as HTMLInputElement;
        const hiddenPartId = document.getElementById('selectedPartId') as HTMLInputElement;

        if (!dateInput || !dateInput.value) {
          Swal.showValidationMessage('La date est requise');
          return false;
        }

        const partId = hiddenPartId ? parseInt(hiddenPartId.value, 10) : selectedPartId;
        if (!partId || isNaN(partId)) {
          Swal.showValidationMessage('Le client est requis');
          return false;
        }

        return {
          factureDate: dateInput.value,
          partId: partId
        };
      }
    }).then((result) => {
      if (!result.isConfirmed || !result.value) return;
      const { factureDate, partId } = result.value;
      this.processLivraisonsVersFacturation(livraisons, factureDate, partId);
    });
  }
  private processLivraisonsVersFacturation(
    livraisons: any[],
    factureDate: string,
    partId: number
  ): void {
    const stockIds = livraisons
      .map((livraison: any) => Number(livraison?.document_id))
      .filter((id: number) => !!id && !isNaN(id));

    Swal.fire({
      title: 'Transfert en cours...',
      html: 'Regroupement des bons de livraison dans une seule facture...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    this.ventesService.transfererLivraisonsVersFacturation(stockIds, factureDate, partId).subscribe({
      next: (res: any) => {
        Swal.fire({
          icon: 'success',
          title: 'Transfert réussi',
          text: `Les bons sélectionnés ont été regroupés dans la facture ${res?.factureNum || ''}.`,
          confirmButtonText: 'OK'
        }).then(() => {
          this.clearLivraisonSelection();
          this.loadLivraisons(this.currentPageLivraisons, this.searchTermLivraisons);
        });
      },
      error: (err: any) => {
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: err?.error?.message || err?.message || 'Erreur lors du transfert groupé en facturation',
          confirmButtonText: 'Fermer'
        });
      }
    });
  }

  private initializeDataTable(): void {
    try {
      // @ts-ignore
      if (typeof $ === 'undefined' || !$.fn.DataTable) {
        return;
      }
      
      // @ts-ignore
      const tableElement = $('#livraisonTable');
      if (tableElement.length === 0) {
        return;
      }
      
      // @ts-ignore
      if ($.fn.DataTable.isDataTable('#livraisonTable')) {
        // @ts-ignore
        $('#livraisonTable').DataTable().destroy();
      }
      
      // Initialiser DataTables simple (c?t? client)
      // @ts-ignore
      this.dataTableLivraison = $('#livraisonTable').DataTable({
        pageLength: 25,
        order: [[0, 'desc']],
        searching: true,
        lengthChange: true,
        deferRender: true,
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
      
    } catch (error) {
      // Erreur silencieuse
    }
  }

  getCommandesNonLivrees(): void {
    this.loadingCommandes = true;
    this.loadingCommandesFacturation = true;
    this.ventesService.getCommandesNonLivrees().subscribe({
      next: (response: any) => {
        // G?rer le format de r?ponse (peut ?tre { success: true, data: [...] } ou directement un tableau)
        let commandesData = response;
        if (response && response.data && Array.isArray(response.data)) {
          commandesData = response.data;
        } else if (response && response.success && Array.isArray(response.data)) {
          commandesData = response.data;
        } else if (!Array.isArray(response)) {
          commandesData = [];
        }
        
        this.commandes = commandesData.map((d: any) => ({ ...d, checked: false }));
        this.commandesFacturation = commandesData.map((d: any) => ({ ...d, checked: false }));
        
        this.loadingCommandes = false;
        this.loadingCommandesFacturation = false;
        this.cdr.detectChanges();
        
        // Initialiser DataTables apr?s le chargement des données
        setTimeout(() => {
          this.initializeDataTableCommandes();
          this.initializeDataTableCommandesFacturation();
        }, 300);
      },
      error: (error) => {
        this.loadingCommandes = false;
        this.loadingCommandesFacturation = false;
        this.commandes = [];
        this.commandesFacturation = [];
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: 'Erreur lors du chargement des commandes: ' + (error.error?.message || error.message || 'Erreur inconnue')
        });
        this.cdr.detectChanges();
      }
    });
  }

  initializeDataTableCommandes(): void {
    try {
      // @ts-ignore
      if (typeof $ === 'undefined' || !$.fn.DataTable) {
        return;
      }
      
      // @ts-ignore
      const tableElement = $('#commandesTable-modal');
      if (tableElement.length === 0) {
        return;
      }
      
      // @ts-ignore
      if ($.fn.DataTable.isDataTable('#commandesTable-modal')) {
        // @ts-ignore
        $('#commandesTable-modal').DataTable().destroy();
      }
      
      // @ts-ignore
      this.dataTableCommandes = $('#commandesTable-modal').DataTable({
        pageLength: 10,
        order: [[1, 'desc']],
        searching: true,
        lengthChange: true,
        deferRender: true,
        // Ne pas utiliser data: pour laisser Angular g?rer le rendu
        // DataTables g?re juste la pagination, recherche et tri
        columnDefs: [
          { orderable: false, targets: [0, 6] }, // D?sactiver le tri sur la colonne checkbox et Status
          { searchable: false, targets: [0, 6] } // D?sactiver la recherche sur checkbox et Status
        ],
        // Écouter les changements de checkbox après le rendu DataTables
        drawCallback: () => {
          // R?attacher les ?v?nements aux checkboxes apr?s chaque redraw
          // @ts-ignore
          $('#commandesTable-modal tbody input[type="checkbox"]').off('change').on('change', (e: any) => {
            const checkbox = e.target;
            const checkboxId = checkbox.id;
            if (checkboxId) {
              const documentId = parseInt(checkboxId.replace('checkbox-', ''));
              const commande = this.commandes.find(c => c.document_id === documentId);
              if (commande) {
                const checked = checkbox.checked;
                commande.checked = checked;
                this.commandes.find(c => c.document_id === documentId)!.checked = checked;
                this.cdr.detectChanges();
              }
            }
          });

          // DataTables redessine le tbody et casse les bindings Angular sur ces boutons.
          // On rattache donc des handlers DOM avec delegation.
          // @ts-ignore
          $('#commandesTable-modal tbody').off('click', 'button[data-action="edit-commande"]');
          // @ts-ignore
          $('#commandesTable-modal tbody').on('click', 'button[data-action="edit-commande"]', (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            const rawId = e.currentTarget?.getAttribute('data-document-id');
            const documentId = Number(rawId);
            if (documentId > 0) {
              this.OnEditCommande(documentId);
            }
          });

          // @ts-ignore
          $('#commandesTable-modal tbody').off('click', 'button[data-action="print-commande"]');
          // @ts-ignore
          $('#commandesTable-modal tbody').on('click', 'button[data-action="print-commande"]', (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            const rawId = e.currentTarget?.getAttribute('data-document-id');
            const documentId = Number(rawId);
            if (documentId > 0) {
              this.OnPrintCommande(documentId);
            }
          });
        },
        language: {
          emptyTable: 'Aucune commande disponible',
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
      
    } catch (error) {
      // Erreur silencieuse
    }
  }

  initializeDataTableCommandesFacturation(): void {
    try {
      // @ts-ignore
      if (typeof $ === 'undefined' || !$.fn.DataTable) {
        return;
      }
      
      // @ts-ignore
      const tableElement = $('#commandesTable-facturation');
      if (tableElement.length === 0) {
        return;
      }
      
      // @ts-ignore
      if ($.fn.DataTable.isDataTable('#commandesTable-facturation')) {
        // @ts-ignore
        $('#commandesTable-facturation').DataTable().destroy();
      }
      
      // @ts-ignore
      this.dataTableCommandesFacturation = $('#commandesTable-facturation').DataTable({
        pageLength: 10,
        order: [[1, 'desc']],
        searching: true,
        lengthChange: true,
        deferRender: true,
        columnDefs: [
          { orderable: false, targets: 0 } // D?sactiver le tri sur la colonne checkbox
        ],
        language: {
          emptyTable: 'Aucune commande disponible',
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
      
    } catch (error) {
      // Erreur silencieuse
    }
  }

  getSelectedCount(): number {
    // V?rifier ? la fois dans le tableau et dans le DOM pour ?tre s?r
    const countFromArray = this.commandes.filter(d => {
      return d.checked === true || d.checked === 'true' || d.checked === 1 || d.checked === 'checked';
    }).length;
    
    // V?rifier aussi dans le DOM au cas o? DataTables cacherait des lignes
    try {
      // @ts-ignore
      if (typeof $ !== 'undefined') {
        // @ts-ignore
        const checkedInDOM = $('#commandesTable-modal tbody input[type="checkbox"]:checked').length;
        return Math.max(countFromArray, checkedInDOM);
      }
    } catch (e) {
      // Erreur silencieuse
    }
    
    return countFromArray;
  }

  getSelectedCountFacturation(): number {
    return this.commandesFacturation.filter(d => d.checked === true || d.checked === 'true' || d.checked === 1).length;
  }

  isAllSelected(): boolean {
    if (this.commandes.length === 0) return false;
    // V?rifier que toutes les commandes sont coch?es
    const allChecked = this.commandes.every(d => {
      return d.checked === true || d.checked === 'true' || d.checked === 1 || d.checked === 'checked';
    });
    return allChecked;
  }

  isAllSelectedFacturation(): boolean {
    if (this.commandesFacturation.length === 0) return false;
    return this.commandesFacturation.every(d => d.checked);
  }

  toggleAllCommandes(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    // Mettre ? jour toutes les commandes dans le tableau principal
    this.commandes.forEach((d) => {
      d.checked = checked;
    });
    this.cdr.detectChanges();
  }

  toggleAllCommandesFacturation(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    // Mettre ? jour toutes les commandes dans le tableau principal
    this.commandesFacturation.forEach((d) => {
      d.checked = checked;
    });
    this.cdr.detectChanges();
  }

  onCommandeCheckboxChange(commande: any, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    
    const checkbox = event.target as HTMLInputElement;
    const checked = checkbox.checked;
    const index = this.commandes.findIndex(d => d.document_id === commande.document_id);
    
    if (index !== -1) {
      // Mettre ? jour l'?tat dans le tableau principal
      this.commandes[index].checked = checked;
      commande.checked = checked;
      
      // Forcer la d?tection de changement
      this.cdr.detectChanges();
    }
  }

  OnEditCommande(document_id: any): void {
    // Fermer le modal avant la navigation (Bootstrap 5)
    const modalElement = document.getElementById('modalCommandeLivraisonXL');
    if (modalElement) {
      const modal = (window as any).bootstrap?.Modal?.getInstance(modalElement);
      if (modal) {
        modal.hide();
      } else {
        // Si l'instance n'existe pas, cr?er une nouvelle instance et la fermer
        const bsModal = new (window as any).bootstrap.Modal(modalElement);
        bsModal.hide();
      }
    }
    
    // Naviguer vers la page d'?dition de la commande
    this.router.navigate(['/Edit-Commande/' + document_id]);
  }

  OnPrintCommande(document_id: any): void {
    // Afficher un loader pendant la g?n?ration du PDF
    Swal.fire({
      title: 'Génération du PDF...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.emailService.generateCommandePDF(document_id.toString()).subscribe({
      next: (res: any) => {
        Swal.close();
        const url = res?.pdfUrl;
        if (url) {
          // Ouvrir le PDF dans un nouvel onglet
          window.open(url, '_blank');
        } else {
          Swal.fire({ 
            icon: 'error', 
            title: 'Erreur', 
            text: 'Lien PDF non reçu.' 
          });
        }
      },
      error: (err: any) => {
        Swal.close();
        Swal.fire({ 
          icon: 'error', 
          title: 'Erreur', 
          text: err.error?.message || 'Erreur lors de la génération du PDF.' 
        });
      }
    });
  }

  onCommandeCheckboxChangeFacturation(commande: any, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const index = this.commandesFacturation.findIndex(d => d.document_id === commande.document_id);
    if (index !== -1) {
      this.commandesFacturation[index].checked = checked;
      commande.checked = checked;
    }
  }

  transfererCommandeVersLivraison() {
    // V?rifier ? la fois dans le tableau et dans le DOM
    let commandesSelectionnees = this.commandes.filter(d => {
      return d.checked === true || d.checked === 'true' || d.checked === 1 || d.checked === 'checked';
    });
    
    // Si aucune trouvée dans le tableau, vérifier dans le DOM
    if (commandesSelectionnees.length === 0) {
      try {
        // @ts-ignore
        if (typeof $ !== 'undefined') {
          // @ts-ignore
          $('#commandesTable-modal tbody input[type="checkbox"]:checked').each((index: number, element: any) => {
            // @ts-ignore
            const checkboxId = $(element).attr('id');
            if (checkboxId) {
              const documentId = parseInt(checkboxId.replace('checkbox-', ''));
              const commande = this.commandes.find(c => c.document_id === documentId);
              if (commande && !commandesSelectionnees.includes(commande)) {
                commande.checked = true;
                commandesSelectionnees.push(commande);
              }
            }
          });
        }
      } catch (e) {
        // Erreur silencieuse
      }
    }
    
    if (commandesSelectionnees.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Aucune commande sélectionnée',
        text: 'Veuillez sélectionner au moins une commande à transférer.',
        confirmButtonText: 'OK'
      });
      return;
    }

    // Message de confirmation adapt? au nombre de commandes
    const message = commandesSelectionnees.length === 1
      ? `Voulez-vous transférer cette commande en livraison ?`
      : `Voulez-vous transférer <strong>${commandesSelectionnees.length}</strong> commandes en livraison ?`;

    Swal.fire({
      title: 'Confirmer le transfert',
      html: message,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Oui, transférer',
      cancelButtonText: 'Non',
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        // Afficher un loader pendant le traitement
        Swal.fire({
          title: 'Traitement en cours...',
          html: 'Création des livraisons...',
          allowOutsideClick: false,
          allowEscapeKey: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        let completed = 0;
        let errors = 0;
        const total = commandesSelectionnees.length;
        const livraisonsCrees: string[] = [];

        commandesSelectionnees.forEach(commande => {
          this.ventesService.transfererCommandeVersLivraison(commande.document_id).subscribe({
            next: (response: any) => {
              completed++;
              if (response.numero) {
                livraisonsCrees.push(response.numero);
              }
              
              if (completed + errors === total) {
                Swal.close();
                if (errors === 0) {
                  Swal.fire({
                    icon: 'success',
                    title: 'Transfert réussi',
                    text: `OK ${completed} livraison(s) créée(s) avec succès !`,
                    confirmButtonText: 'OK'
                  }).then(() => {
                    // Fermer le modal
                    const modalElement = document.getElementById('modalCommandeLivraisonXL');
                    if (modalElement) {
                      const modal = (window as any).bootstrap?.Modal?.getInstance(modalElement);
                      if (modal) {
                        modal.hide();
                      }
                    }
                    // Recharger la page pour actualiser les données
                    window.location.reload();
                  });
                } else {
                  this.showError(`Attention ${completed} livraison(s) créée(s), ${errors} erreur(s).`);
                  
                  // D?cocher toutes les cases apr?s transfert
                  commandesSelectionnees.forEach(c => {
                    c.checked = false;
                    const index = this.commandes.findIndex(d => d.document_id === c.document_id);
                    if (index !== -1) {
                      this.commandes[index].checked = false;
                    }
                  });
                  this.cdr.detectChanges();
                  
                  // Actualiser les données
                  this.getCommandesNonLivrees();
                  this.loadLivraisons(this.currentPageLivraisons, this.searchTermLivraisons);
                }
              }
            },
            error: (err) => {
              errors++;
              if (completed + errors === total) {
                Swal.close();
                if (completed > 0) {
                  this.showError(`Attention ${completed} livraison(s) créée(s), ${errors} erreur(s).`);
                } else {
                  this.showError(`Erreur Aucune livraison n'a pu être créée.`);
                }
                
                // Actualiser les données m?me en cas d'erreur partielle
                this.getCommandesNonLivrees();
                this.getLivraisons();
              }
            }
          });
        });
      }
      // Si l'utilisateur choisit "Non", aucune action n'est effectu?e
    });
  }

  transfererCommandeVersFacturation() {
    const commandesSelectionnees = this.commandesFacturation.filter(d => {
      return d.checked === true || d.checked === 'true' || d.checked === 1;
    });
    
    if (commandesSelectionnees.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Aucune commande sélectionnée',
        text: 'Veuillez sélectionner au moins une commande à transférer.',
        confirmButtonText: 'OK'
      });
      return;
    }

    // Pour chaque commande, afficher une popup pour saisir la date et le client
    this.processCommandeVersFacturation(commandesSelectionnees, 0);
  }

  private processCommandeVersFacturation(commandes: any[], index: number) {
    if (index >= commandes.length) {
      // Toutes les commandes ont ?t? trait?es
      Swal.fire({
        icon: 'success',
        title: 'Transfert terminé !',
        text: `OK ${commandes.length} commande(s) transférée(s) vers la facturation avec succès !`,
        confirmButtonText: 'OK'
      }).then(() => {
        this.getCommandesNonLivrees();
        this.loadLivraisons(this.currentPageLivraisons, this.searchTermLivraisons);
        // D?cocher toutes les commandes
        commandes.forEach(c => {
          c.checked = false;
          const cmdIndex = this.commandesFacturation.findIndex(cmd => cmd.document_id === c.document_id);
          if (cmdIndex !== -1) {
            this.commandesFacturation[cmdIndex].checked = false;
          }
        });
        this.cdr.detectChanges();
      });
      return;
    }

    const commande = commandes[index];
    const dateValue = commande.date ? new Date(commande.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    let selectedPartId = commande.part_id || null;
    
    // Cr?er le HTML pour la popup avec date et client modifiables
    const htmlContent = `
      <div style="text-align: left; padding: 10px;">
        <div class="mb-3">
          <label for="factureDate${index}" style="display: block; margin-bottom: 5px; font-weight: bold;">Date de facture:</label>
          <input type="date" id="factureDate${index}" class="swal2-input" value="${dateValue}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        <div class="mb-3" style="position: relative;">
          <label for="factureClient${index}" style="display: block; margin-bottom: 5px; font-weight: bold;">Client:</label>
          <input type="text" id="factureClient${index}" class="swal2-input" value="${commande.client || ''}" 
                 placeholder="Rechercher un client..." 
                 style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                 autocomplete="off">
          <div id="clientSuggestions${index}" style="position: absolute; z-index: 1000; background: white; border: 1px solid #ddd; max-height: 200px; overflow-y: auto; width: calc(100% - 2px); margin-top: 2px; display: none; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"></div>
        </div>
        <input type="hidden" id="selectedPartId${index}" value="${commande.part_id || ''}">
        <p class="text-muted small">Commande: ${commande.numero || 'N/A'}</p>
        <p class="text-info small">Cela créera <strong>deux livraisons</strong> et <strong>une facture</strong></p>
      </div>
    `;
    
    // Afficher la popup avec le formulaire
    Swal.fire({
      title: `Commande ${index + 1} sur ${commandes.length}`,
      html: htmlContent,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: index === commandes.length - 1 ? 'Transférer' : 'Suivant',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      reverseButtons: true,
      width: '650px',
      padding: '2rem',
      didOpen: () => {
        const clientInput = document.getElementById(`factureClient${index}`) as HTMLInputElement;
        const suggestionsDiv = document.getElementById(`clientSuggestions${index}`);
        const hiddenPartId = document.getElementById(`selectedPartId${index}`) as HTMLInputElement;
        
        // Gestion de la recherche de client
        if (clientInput && suggestionsDiv && hiddenPartId) {
          let searchTimeout: any;
          
          clientInput.addEventListener('input', (e: any) => {
            const searchTerm = e.target.value;
            clearTimeout(searchTimeout);
            
            if (searchTerm.length >= 2) {
              searchTimeout = setTimeout(() => {
                this.onSearchChange(searchTerm);
                setTimeout(() => {
                  if (this.filteredClients.length > 0) {
                    suggestionsDiv.innerHTML = this.filteredClients.map((client: any) => {
                      const clientName = (client.nom || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                      return `<div style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;" 
                                  onmouseover="this.style.background='#f0f0f0'" 
                                  onmouseout="this.style.background='white'"
                                  data-part-id="${client.part_id}"
                                  data-client-name="${clientName}">
                              ${client.nom || ''}
                            </div>`;
                    }).join('');
                    suggestionsDiv.style.display = 'block';
                    
                    // Ajouter les event listeners pour chaque suggestion
                    suggestionsDiv.querySelectorAll('div[data-part-id]').forEach((div: any) => {
                      div.addEventListener('click', () => {
                        const partId = parseInt(div.getAttribute('data-part-id'), 10);
                        const clientName = div.getAttribute('data-client-name');
                        clientInput.value = clientName;
                        selectedPartId = partId;
                        if (hiddenPartId) {
                          hiddenPartId.value = partId.toString();
                        }
                        suggestionsDiv.style.display = 'none';
                      });
                    });
                  } else {
                    suggestionsDiv.innerHTML = '<div style="padding: 10px; color: #999;">Aucun client trouvé</div>';
                    suggestionsDiv.style.display = 'block';
                  }
                }, 100);
              }, 300);
            } else {
              suggestionsDiv.style.display = 'none';
            }
          });
        }
      },
      preConfirm: () => {
        const dateInput = document.getElementById(`factureDate${index}`) as HTMLInputElement;
        const hiddenPartId = document.getElementById(`selectedPartId${index}`) as HTMLInputElement;
        
        if (!dateInput || !dateInput.value) {
          Swal.showValidationMessage('La date est requise');
          return false;
        }
        
        const partId = hiddenPartId ? parseInt(hiddenPartId.value, 10) : selectedPartId;
        if (!partId || isNaN(partId)) {
          Swal.showValidationMessage('Le client est requis');
          return false;
        }
        
        return {
          factureDate: dateInput.value,
          partId: partId
        };
      }
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        const { factureDate, partId } = result.value;
        
        // Afficher un loader
        Swal.fire({
          title: `Transfert en cours... (${index + 1}/${commandes.length})`,
          html: 'Création de 2 livraisons et 1 facture...',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });
        
        this.ventesService.transfererCommandeVersFacturation(commande.document_id, factureDate, partId).subscribe({
          next: (res: any) => {
            // D?cocher la commande
            commande.checked = false;
            const cmdIndex = this.commandesFacturation.findIndex(c => c.document_id === commande.document_id);
            if (cmdIndex !== -1) {
              this.commandesFacturation[cmdIndex].checked = false;
            }
            this.cdr.detectChanges();
            
            // Traiter la commande suivante
            this.processCommandeVersFacturation(commandes, index + 1);
          },
          error: (err: any) => {
            Swal.fire({
              icon: 'error',
              title: 'Erreur',
              text: `Erreur lors du transfert de la commande ${commande.numero || 'N/A'}: ${err.error?.message || err.message || 'Erreur inconnue'}`,
              confirmButtonText: 'Continuer',
              showCancelButton: true,
              cancelButtonText: 'Arrêter'
            }).then((result) => {
              if (result.isConfirmed) {
                // Continuer avec la commande suivante m?me en cas d'erreur
                this.processCommandeVersFacturation(commandes, index + 1);
              }
            });
          }
        });
      } else if (!result.isConfirmed && index === 0) {
        // L'utilisateur a annul? d?s le d?but, on ne fait rien
      } else if (!result.isConfirmed) {
        // L'utilisateur a annul?, on continue avec les commandes restantes
        this.processCommandeVersFacturation(commandes, index + 1);
      }
    });
  }

  OnEditLivraison(document_id: any) {
    this.router.navigate(['/Edit-Livraison/' + document_id]);
  }

  transfererLivraisonVersFacturation(stockId: number) {
    // R?cup?rer les données de la livraison
    this.ventesService.getLivraisonDataForTransfer(stockId).subscribe({
      next: (livraisonData: any) => {
        // Formater la date pour l'input date
        const dateValue = livraisonData.date ? new Date(livraisonData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        let selectedPartId = livraisonData.part_id || null;
        
        // Cr?er le HTML pour la popup avec date et client modifiables
        const htmlContent = `
          <div style="text-align: left; padding: 10px;">
            <div class="mb-3">
              <label for="factureDate" style="display: block; margin-bottom: 5px; font-weight: bold;">Date de facture:</label>
              <input type="date" id="factureDate" class="swal2-input" value="${dateValue}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            <div class="mb-3" style="position: relative;">
              <label for="factureClient" style="display: block; margin-bottom: 5px; font-weight: bold;">Client:</label>
              <input type="text" id="factureClient" class="swal2-input" value="${livraisonData.client_nom || ''}" 
                     placeholder="Rechercher un client..." 
                     style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                     autocomplete="off">
              <div id="clientSuggestions" style="position: absolute; z-index: 1000; background: white; border: 1px solid #ddd; max-height: 200px; overflow-y: auto; width: calc(100% - 2px); margin-top: 2px; display: none; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"></div>
            </div>
            <input type="hidden" id="selectedPartId" value="${livraisonData.part_id || ''}">
          </div>
        `;
        
        // Afficher la popup avec le formulaire
        Swal.fire({
          title: 'Confirmer le transfert',
          html: htmlContent,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Oui, transférer',
          cancelButtonText: 'Annuler',
          confirmButtonColor: '#28a745',
          cancelButtonColor: '#6c757d',
          reverseButtons: true,
          width: '650px',
          padding: '2rem',
          didOpen: () => {
            const clientInput = document.getElementById('factureClient') as HTMLInputElement;
            const suggestionsDiv = document.getElementById('clientSuggestions');
            const hiddenPartId = document.getElementById('selectedPartId') as HTMLInputElement;
            
            // Gestion de la recherche de client
            if (clientInput && suggestionsDiv && hiddenPartId) {
              let searchTimeout: any;
              
              clientInput.addEventListener('input', (e: any) => {
                const searchTerm = e.target.value;
                clearTimeout(searchTimeout);
                
                if (searchTerm.length >= 2) {
                  searchTimeout = setTimeout(() => {
                    this.onSearchChange(searchTerm);
                    setTimeout(() => {
                      if (this.filteredClients.length > 0) {
                        suggestionsDiv.innerHTML = this.filteredClients.map((client: any) => {
                          const clientName = (client.nom || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                          return `<div style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; transition: background 0.2s;" 
                                      onmouseover="this.style.background='#f0f0f0'" 
                                      onmouseout="this.style.background='white'"
                                      data-part-id="${client.part_id}"
                                      data-client-name="${clientName}">
                                  ${client.nom || ''}
                                </div>`;
                        }).join('');
                        suggestionsDiv.style.display = 'block';
                        
                        // Ajouter les event listeners pour chaque suggestion
                        suggestionsDiv.querySelectorAll('div[data-part-id]').forEach((div: any) => {
                          div.addEventListener('click', () => {
                            const partId = parseInt(div.getAttribute('data-part-id'), 10);
                            const clientName = div.getAttribute('data-client-name');
                            clientInput.value = clientName;
                            selectedPartId = partId;
                            if (hiddenPartId) {
                              hiddenPartId.value = partId.toString();
                            }
                            suggestionsDiv.style.display = 'none';
                          });
                        });
                      } else {
                        suggestionsDiv.innerHTML = '<div style="padding: 10px; color: #999;">Aucun client trouvé</div>';
                        suggestionsDiv.style.display = 'block';
                      }
                    }, 100);
                  }, 300);
                } else {
                  suggestionsDiv.style.display = 'none';
                }
              });
              
              // Fermer les suggestions quand on clique ailleurs
              setTimeout(() => {
                document.addEventListener('click', (e: any) => {
                  if (clientInput && suggestionsDiv && 
                      !clientInput.contains(e.target) && 
                      !suggestionsDiv.contains(e.target)) {
                    suggestionsDiv.style.display = 'none';
                  }
                });
              }, 100);
            }
          },
          preConfirm: () => {
            const dateInput = document.getElementById('factureDate') as HTMLInputElement;
            const hiddenPartId = document.getElementById('selectedPartId') as HTMLInputElement;
            
            if (!dateInput || !dateInput.value) {
              Swal.showValidationMessage('La date est requise');
              return false;
            }
            
            const partId = hiddenPartId ? parseInt(hiddenPartId.value, 10) : selectedPartId;
            if (!partId || isNaN(partId)) {
              Swal.showValidationMessage('Le client est requis');
              return false;
            }
            
            return {
              factureDate: dateInput.value,
              partId: partId
            };
          }
        }).then((result) => {
          if (result.isConfirmed && result.value) {
            const { factureDate, partId } = result.value;
            
            // Afficher un loader
            Swal.fire({
              title: 'Transfert en cours...',
              allowOutsideClick: false,
              didOpen: () => {
                Swal.showLoading();
              }
            });
            
            this.ventesService.transfererLivraisonVersFacturation(stockId, factureDate, partId).subscribe({
              next: (res: any) => {
                Swal.fire({
                  icon: 'success',
                  title: 'Transfert réussi !',
                  text: `La livraison a été transférée vers la facturation avec succès. Facture: ${res.factureNum || ''}`,
                  confirmButtonText: 'OK',
                  timer: 3000,
                  timerProgressBar: true
                }).then(() => {
                  // Recharger les données
                  if (this.dataTableLivraison) {
                    // @ts-ignore
                    this.dataTableLivraison.ajax.reload();
                  } else {
                    this.loadLivraisons(this.currentPageLivraisons, this.searchTermLivraisons);
                  }
                });
              },
              error: (err: any) => {
                Swal.fire({
                  icon: 'error',
                  title: 'Erreur',
                  text: `Une erreur s'est produite lors du transfert : ${err.error?.message || err.message || 'Erreur inconnue'}`,
                  confirmButtonText: 'Fermer'
                });
              }
            });
          }
        });
      },
      error: (err: any) => {
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: `Impossible de récupérer les données de la livraison : ${err.error?.message || err.message || 'Erreur inconnue'}`,
          confirmButtonText: 'Fermer'
        });
      }
    });
  }

  OnPrintLivraison(document_id: any, printMode: string = 'normal') {
    // Afficher un loader pendant la g?n?ration du PDF
    Swal.fire({
      title: 'Génération du PDF...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Convertir le mode d'impression pour le backend
    // 'normal' -> 'normal' (BL normal)
    // 'non_valorise' -> 'non_valorise' (BL non valoris?)
    const backendPrintMode = printMode === 'non_valorise' ? 'non_valorise' : 'normal';

    // Utiliser generateDevisPDF car la route /api/pdf/generate g?re tous les types de documents (devis, commandes, livraisons)
    this.emailService.generateDevisPDF(document_id.toString(), { printMode: backendPrintMode, forceDocumentType: 'LIVRAISON' }).subscribe({
      next: (res: any) => {
        Swal.close();
        const url = res?.pdfUrl;
        if (url) {
          // Ouvrir le PDF dans un nouvel onglet
          window.open(url, '_blank');
        } else {
          Swal.fire({ 
            icon: 'error', 
            title: 'Erreur', 
            text: 'Lien PDF non reçu.' 
          });
        }
      },
      error: (err: any) => {
        Swal.close();
        Swal.fire({ 
          icon: 'error', 
          title: 'Erreur', 
          text: err.error?.message || 'Erreur lors de la génération du PDF de livraison.' 
        });
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
    this.LivraisonForm.patchValue({
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
    this.LivraisonForm.patchValue({
      commercialSearch: com.nom,
      contact_id: com.id
    });
    this.filteredCommerciaux = [];
    this.searchCommercial = com.nom;
  }

  onSubmit(): void {
    if (this.LivraisonForm.valid) {
      const formValue = {
        ...this.LivraisonForm.value,
        depot_id: this.LivraisonForm.value?.depot_id ? Number(this.LivraisonForm.value.depot_id) : null
      };
      
      this.ventesService.addLivraison(formValue).subscribe({
        next: (response: any) => {
          this.showSuccess(`OK Livraison ${response.numero || ''} créée avec succès !`);
          const modal = document.getElementById('addLivraisonModal');
          if (modal) {
            const bsModal = (window as any).bootstrap?.Modal?.getInstance(modal);
            if (bsModal) {
              bsModal.hide();
            }
          }
          this.LivraisonForm.reset();
          this.initForm();
          this.loadLivraisons(this.currentPageLivraisons, this.searchTermLivraisons);
          this.loadNextLivraisonNumero();
        },
        error: (err) => {
          this.showError(`Erreur Une erreur s'est produite lors de la cr?ation de la livraison: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    } else {
      this.showError("Le formulaire est invalide. Veuillez remplir tous les champs requis.");
    }
  }

  removeLivraison(livraison: any, index: number) {
    this.removeLivraisonById(livraison.document_id, livraison.numero);
  }

  removeLivraisonById(id: number, numero?: string) {
    Swal.fire({
      title: 'Confirmer la suppression',
      html: `Voulez-vous vraiment supprimer la livraison <strong>${numero || 'N/A'}</strong> ?<br><br><small class="text-muted">Cette action est irréversible.</small>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        const idsToDelete = [id];
        
        this.ventesService.RemoveLivraison(idsToDelete).subscribe({
          next: (res: any) => {
            Swal.fire({
              icon: 'success',
              title: 'Supprimé !',
              text: `La livraison ${numero || 'N/A'} a été supprimée avec succès.`,
              confirmButtonText: 'OK',
              timer: 2000,
              timerProgressBar: true
            }).then(() => {
              // Recharger les livraisons avec pagination au lieu de recharger toute la page
              this.loadLivraisons(this.currentPageLivraisons, this.searchTermLivraisons);
            });
          },
          error: (err: any) => {
            Swal.fire({
              icon: 'error',
              title: 'Erreur',
              text: `Une erreur s'est produite lors de la suppression : ${err.error?.message || err.message || 'Erreur inconnue'}`,
              confirmButtonText: 'Fermer'
            });
          }
        });
      }
    });
  }

  showSuccess(message: string) {
    Swal.fire({
      icon: 'success',
      title: 'Succès',
      text: message,
      confirmButtonText: 'OK'
    }).then(() => {
      // Recharger les livraisons avec pagination au lieu de recharger toute la page
      this.loadLivraisons(this.currentPageLivraisons, this.searchTermLivraisons);
    });
  }

  showError(message: string) {
    Swal.fire({
      icon: 'error',
      title: 'Erreur',
      text: message,
      confirmButtonText: 'Fermer'
    });
  }

  get clientSearchControl() {
    return this.LivraisonForm.get('clientSearch') as FormControl;
  }

  get commercialSearchControl() {
    return this.LivraisonForm.get('commercialSearch') as FormControl;
  }

  // M?thodes de pagination pour les livraisons
  onPageChangeLivraisons(page: number): void {
    if (page >= 1 && page <= this.totalPagesLivraisons && page !== this.currentPageLivraisons) {
      this.loadLivraisons(page, this.searchTermLivraisons);
    }
  }

  onPageSizeChangeLivraisons(event: any): void {
    const newPageSize = parseInt(event.target.value);
    if (newPageSize > 0) {
      this.pageSizeLivraisons = newPageSize;
      this.loadLivraisons(1, this.searchTermLivraisons);
    }
  }

  onSearchLivraisons(): void {
    this.loadLivraisons(1, this.searchTermLivraisons);
  }

  onSearchKeyPressLivraisons(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearchLivraisons();
    }
  }

  getPageNumbersLivraisons(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.currentPageLivraisons - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPagesLivraisons, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  getDisplayRangeLivraisons(): string {
    const start = ((this.currentPageLivraisons - 1) * this.pageSizeLivraisons) + 1;
    const end = Math.min(this.currentPageLivraisons * this.pageSizeLivraisons, this.totalRecordsLivraisons);
    return `${start} ? ${end}`;
  }

  // Tri par colonne pour les livraisons
  onSortLivraisons(column: string): void {
    if (this.sortColumnLivraisons === column) {
      this.sortDirectionLivraisons = this.sortDirectionLivraisons === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumnLivraisons = column;
      this.sortDirectionLivraisons = 'DESC';
    }
    this.loadLivraisons(1, this.searchTermLivraisons);
  }

  getSortIconLivraisons(column: string): string {
    if (this.sortColumnLivraisons !== column) {
      return 'fa-sort';
    }
    return this.sortDirectionLivraisons === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // Filtres avanc?s pour les livraisons
  toggleAdvancedFiltersLivraisons(): void {
    this.showAdvancedFiltersLivraisons = !this.showAdvancedFiltersLivraisons;
  }

  applyAdvancedFiltersLivraisons(livraisons: any[]): any[] {
    let filtered = [...livraisons];
    
    if (this.filterDateFromLivraisons) {
      const fromDate = new Date(this.filterDateFromLivraisons);
      filtered = filtered.filter(l => {
        if (!l.date) return false;
        const livraisonDate = new Date(l.date);
        return livraisonDate >= fromDate;
      });
    }
    
    if (this.filterDateToLivraisons) {
      const toDate = new Date(this.filterDateToLivraisons);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(l => {
        if (!l.date) return false;
        const livraisonDate = new Date(l.date);
        return livraisonDate <= toDate;
      });
    }
    
    if (this.filterClientLivraisons) {
      filtered = filtered.filter(l => 
        l.client?.toLowerCase().includes(this.filterClientLivraisons.toLowerCase())
      );
    }
    
    return filtered;
  }

  onFilterChangeLivraisons(): void {
    this.loadLivraisons(this.currentPageLivraisons, this.searchTermLivraisons);
  }

  resetFiltersLivraisons(): void {
    this.filterDateFromLivraisons = '';
    this.filterDateToLivraisons = '';
    this.filterClientLivraisons = '';
    this.loadLivraisons(1, this.searchTermLivraisons, true);
  }

  extractClientsListLivraisons(livraisons: any[]): void {
    const clients = new Set<string>();
    livraisons.forEach(l => {
      if (l.client) {
        clients.add(l.client);
      }
    });
    this.clientsListLivraisons = Array.from(clients).sort();
  }

  isFacturee(livraison: any): boolean {
    if (!livraison || !livraison.facture) {
      return false;
    }
    return livraison.facture.toUpperCase().trim() === 'FACTURE';
  }

  // Export des données pour les livraisons
  exportToCSVLivraisons(): void {
    const headers = ['Numéro', 'Date', 'Client', 'Commercial', 'HT', 'TVA', 'TTC'];
    headers.splice(1, 0, 'Commande');
    const rows = this.livraisons.map(l => [
      l.numero || '',
      l.commande_numero || '',
      this.formatTableDate(l.date),
      l.client || '',
      l.commercial || '',
      (l.total_ht || 0).toFixed(2),
      (l.total_tva || 0).toFixed(2),
      (l.total_ttc || 0).toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `livraisons_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    this.showNotification('OK Export CSV réussi !', false);
  }

  showNotification(message: string, typeOrIsError: boolean | 'success' | 'error' | 'warning' = false): void {
    this.successMessage = message;

    if (typeof typeOrIsError === 'boolean') {
      this.isError = typeOrIsError;
      this.isWarning = false;
    } else {
      this.isError = typeOrIsError === 'error';
      this.isWarning = typeOrIsError === 'warning';
    }

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
    this.livraisons = this.allLivraisons.filter(item => {
      return Object.keys(this.columnFilters).every(key => {
        const filterValue = this.columnFilters[key];
        if (!filterValue) return true;
        
        const itemValue = item[key];
        if (itemValue === null || itemValue === undefined) return false;
        
        return itemValue.toString().toLowerCase().includes(filterValue.toLowerCase());
      });
    });
    
    this.totalRecordsLivraisons = this.livraisons.length;
    this.cdr.detectChanges();
  }

  clearColumnFilters(): void {
    this.columnFilters = {
      numero: '',
      commande_numero: '',
      date: '',
      client: '',
      total_ht: '',
      total_tva: '',
      total_ttc: ''
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
    this.columnWidths[column] = 'auto';
    this.hideColumnContextMenu();
  }

  autoSizeAllColumns(): void {
    Object.keys(this.columnVisibility).forEach(column => {
      this.columnWidths[column] = 'auto';
    });
    this.hideColumnContextMenu();
  }

  resetColumns(): void {
    this.columnVisibility = {
      numero: true,
      commande_numero: true,
      date: true,
      client: true,
      total_ht: true,
      total_tva: true,
      total_ttc: true
    };
    this.pinnedColumns = [];
    this.columnWidths = {};
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
      numero: 80,
      commande_numero: 110,
      date: 150,
      client: 120,
      total_ht: 110,
      total_tva: 110,
      total_ttc: 110
    };
    const maxByColumn: any = {
      numero: 180,
      commande_numero: 260,
      date: 220,
      client: 500,
      total_ht: 180,
      total_tva: 180,
      total_ttc: 180
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

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onViewportChanged(): void {
    if (this.commandePopoverVisible) {
      this.hideCommandeProgressPopover(true);
    }
  }

  getColumnIndex(column: string): number {
    const columns = Object.keys(this.columnVisibility);
    return columns.indexOf(column);
  }

  getColumnDisplayName(column: string): string {
    const names: any = {
      numero: 'Numéro',
      date: 'Date',
      client: 'Client',
      total_ht: 'Total HT',
      total_tva: 'Total TVA',
      total_ttc: 'Total TTC'
    };
    names.commande_numero = 'Commande';
    return names[column] || column;
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

  openEmailModal(livraison: any): void {
    this.selectedLivraisonForEmail = livraison;
    // Réinitialiser le formulaire avec les valeurs par défaut
    this.emailForm.reset({
      to: '',
      cc: '',
      subject: 'Livraison à votre attention',
      body: 'Bonjour,\n\nVeuillez trouver ci-joint le bon de livraison demandé.\n\nCordialement,'
    });
    // Ouvrir le modal Bootstrap
    const modalElement = document.getElementById('emailModalLivraison');
    if (modalElement) {
      const modal = new (window as any).bootstrap.Modal(modalElement);
      modal.show();
    }
  }

  envoyerEmail(): void {
    if (this.emailForm.invalid || !this.selectedLivraisonForEmail) return;

    this.isSending = true;

    const formData = {
      ...this.emailForm.value,
      document_id: this.selectedLivraisonForEmail.document_id
    };

    // Afficher le spinner
    Swal.fire({
      title: 'Envoi en cours...',
      html: '<div class="loading-spinner"></div><p>Veuillez patienter</p>',
      showConfirmButton: false,
      allowOutsideClick: false
    });

    this.emailService.envoyerDevis(formData).subscribe({
      next: res => {
        Swal.fire({
          icon: 'success',
          title: 'E-mail envoyé !',
          text: 'La livraison a été envoyée avec succès.',
          timer: 3000,
          showConfirmButton: false
        });

        // Fermer la modale Bootstrap
        const modalElement = document.getElementById('emailModalLivraison');
        if (modalElement) {
          const modalInstance = (window as any).bootstrap.Modal.getInstance(modalElement);
          if (modalInstance) {
            modalInstance.hide();
          }
        }
        this.isSending = false;
      },
      error: err => {
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: "Échec de l'envoi de l'e-mail."
        });
        this.isSending = false;
      }
    });
  }

  // Dashboard Methods
  toggleDashboard(): void {
    this.showDashboard = !this.showDashboard;
    if (this.showDashboard) {
      this.loadDashboardStats();
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

  loadDashboardStats(): void {
    this.dashboardLoading = true;
    
    // Charger toutes les livraisons pour calculer les statistiques
    this.ventesService.getLivraisons({
      page: 1,
      pageSize: 10000, // Charger toutes les livraisons
      orderBy: 'date',
      orderDirection: 'DESC',
      search: ''
    }).subscribe({
      next: (response: any) => {
        // G?rer différents formats de r?ponse
        let allLivraisons = [];
        if (response && response.data && Array.isArray(response.data)) {
          allLivraisons = response.data;
        } else if (response && response.success && Array.isArray(response.data)) {
          allLivraisons = response.data;
        } else if (Array.isArray(response)) {
          allLivraisons = response;
        }
        
        // Charger les d?tails de chaque livraison pour les statistiques par article
        this.loadLivraisonsDetails(allLivraisons);
      },
      error: (err: any) => {
        console.error('Erreur lors du chargement des statistiques:', err);
        this.dashboardLoading = false;
        this.showError("Erreur Impossible de charger les statistiques du dashboard.");
      }
    });
  }

  loadLivraisonsDetails(livraisons: any[]): void {
    // Charger les d?tails de chaque livraison
    const detailPromises = livraisons.map((livraison: any) => {
      const livraisonId = livraison.document_id || livraison.id;
      if (!livraisonId) {
        return Promise.resolve({ ...livraison, details: [] });
      }
      
      return this.ventesService.getLivraisonById(livraisonId).toPromise().then(
        (response: any) => {
          const details = response?.details || response?.data?.details || [];
          return { ...livraison, details: Array.isArray(details) ? details : [] };
        },
        () => ({ ...livraison, details: [] })
      );
    });

    Promise.all(detailPromises).then((livraisonsWithDetails: any[]) => {
      this.calculateDashboardStats(livraisonsWithDetails);
      this.dashboardLoading = false;
    }).catch((err: any) => {
      console.error('Erreur lors du chargement des d?tails:', err);
      // Calculer les stats m?me sans d?tails
      this.calculateDashboardStats(livraisons);
      this.dashboardLoading = false;
    });
  }

  calculateDashboardStats(livraisons: any[]): void {
    // Calculer le total des livraisons
    this.dashboardStats.totalLivraisons = livraisons.length;

    // Calculer les totaux
    this.dashboardStats.totalMontantHT = livraisons.reduce((sum, l) => {
      return sum + (parseFloat(l.total_ht) || 0);
    }, 0);

    this.dashboardStats.totalMontantTTC = livraisons.reduce((sum, l) => {
      return sum + (parseFloat(l.total_ttc) || 0);
    }, 0);

    this.dashboardStats.totalTVA = livraisons.reduce((sum, l) => {
      return sum + (parseFloat(l.total_tva) || 0);
    }, 0);

    // Calculer le prix moyen des ventes
    const totalTTC = this.dashboardStats.totalMontantTTC;
    this.dashboardStats.prixMoyenVente = livraisons.length > 0 ? totalTTC / livraisons.length : 0;

    // Calculer le chiffre d'affaire par client
    const clientStats: { [key: string]: { client: string; chiffreAffaire: number; totalLivraisons: number } } = {};
    
    livraisons.forEach(l => {
      const clientName = l.client || 'Non sp?cifi?';
      if (!clientStats[clientName]) {
        clientStats[clientName] = {
          client: clientName,
          chiffreAffaire: 0,
          totalLivraisons: 0
        };
      }
      clientStats[clientName].chiffreAffaire += parseFloat(l.total_ttc) || 0;
      clientStats[clientName].totalLivraisons += 1;
    });

    // Convertir en tableau et trier par chiffre d'affaire d?croissant
    this.dashboardStats.chiffreAffaireParClient = Object.values(clientStats)
      .sort((a, b) => b.chiffreAffaire - a.chiffreAffaire);

    // Calculer le chiffre d'affaire par article
    const articleStats: { [key: string]: { article: string; chiffreAffaire: number; quantite: number; prixMoyen: number } } = {};
    
    livraisons.forEach(l => {
      const details = l.details || [];
      details.forEach((detail: any) => {
        const articleName = detail.article_nom || detail.designation || detail.description || 'Article sans nom';
        const quantite = parseFloat(detail.quantite || detail.qte) || 0;
        const prix = parseFloat(detail.prix || detail.pu) || 0;
        const totalLigne = parseFloat(detail.total || detail.ttc) || (prix * quantite);
        
        if (!articleStats[articleName]) {
          articleStats[articleName] = {
            article: articleName,
            chiffreAffaire: 0,
            quantite: 0,
            prixMoyen: 0
          };
        }
        articleStats[articleName].chiffreAffaire += totalLigne;
        articleStats[articleName].quantite += quantite;
      });
    });

    // Calculer le prix moyen par article
    Object.keys(articleStats).forEach(articleName => {
      const stat = articleStats[articleName];
      stat.prixMoyen = stat.quantite > 0 ? stat.chiffreAffaire / stat.quantite : 0;
    });

    // Convertir en tableau et trier par chiffre d'affaire d?croissant
    this.dashboardStats.chiffreAffaireParArticle = Object.values(articleStats)
      .sort((a, b) => b.chiffreAffaire - a.chiffreAffaire);

    // Initialiser les graphiques apr?s un court d?lai pour s'assurer que les canvas sont rendus
    setTimeout(() => {
      this.initCharts(livraisons);
    }, 100);
  }

  initCharts(livraisons: any[]): void {
    this.createEvolutionChart(livraisons);
    this.createClientChart(livraisons);
    this.createTopClientsChart(livraisons);
    this.createArticleChart(livraisons);
  }

  createEvolutionChart(livraisons: any[]): void {
    const canvas = document.getElementById('evolutionChartLivraison') as HTMLCanvasElement;
    if (!canvas) return;

    // D?truire le graphique existant s'il existe
    if (this.evolutionChart) {
      this.evolutionChart.destroy();
    }

    // Grouper les livraisons par mois
    const monthlyData: { [key: string]: number } = {};
    livraisons.forEach(l => {
      if (l.date) {
        const date = new Date(l.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[monthKey] = (monthlyData[monthKey] || 0) + (parseFloat(l.total_ttc) || 0);
      }
    });

    // Trier les mois et pr?parer les données
    const sortedMonths = Object.keys(monthlyData).sort();
    const labels = sortedMonths.map(m => {
      const [year, month] = m.split('-');
      const monthNames = ['Jan', 'F?v', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Ao?', 'Sep', 'Oct', 'Nov', 'D?c'];
      return `${monthNames[parseInt(month) - 1]} ${year}`;
    });
    const data = sortedMonths.map(m => monthlyData[m]);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const Chart = (window as any).Chart;
    if (!Chart) return;

    this.evolutionChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Montant TTC (DH)',
          data: data,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          title: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value: any) {
                return value.toFixed(2) + ' DH';
              }
            }
          }
        }
      }
    });
  }

  createClientChart(livraisons: any[]): void {
    const canvas = document.getElementById('clientChartLivraison') as HTMLCanvasElement;
    if (!canvas) return;

    // D?truire le graphique existant s'il existe
    if (this.clientChart) {
      this.clientChart.destroy();
    }

    // Utiliser les données calcul?es dans dashboardStats
    const topClients = this.dashboardStats.chiffreAffaireParClient.slice(0, 10);
    
    if (topClients.length === 0) {
      return;
    }

    const labels = topClients.map((c: any) => c.client);
    const data = topClients.map((c: any) => c.chiffreAffaire);
    const colors = [
      'rgba(255, 99, 132, 0.8)',
      'rgba(54, 162, 235, 0.8)',
      'rgba(255, 206, 86, 0.8)',
      'rgba(75, 192, 192, 0.8)',
      'rgba(153, 102, 255, 0.8)',
      'rgba(255, 159, 64, 0.8)',
      'rgba(199, 199, 199, 0.8)',
      'rgba(83, 102, 255, 0.8)',
      'rgba(255, 99, 255, 0.8)',
      'rgba(99, 255, 132, 0.8)'
    ];

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const Chart = (window as any).Chart;
    if (!Chart) return;

    this.clientChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          label: 'Chiffre d\'affaire (DH)',
          data: data,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'right'
          },
          tooltip: {
            callbacks: {
              label: function(context: any) {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${value.toFixed(2)} DH (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  }

  createArticleChart(livraisons: any[]): void {
    const canvas = document.getElementById('articleChartLivraison') as HTMLCanvasElement;
    if (!canvas) return;

    // D?truire le graphique existant s'il existe
    if (this.articleChart) {
      this.articleChart.destroy();
    }

    // Prendre les top 10 articles
    const topArticles = this.dashboardStats.chiffreAffaireParArticle.slice(0, 10);
    
    if (topArticles.length === 0) {
      return;
    }

    const labels = topArticles.map((a: any) => a.article.length > 30 ? a.article.substring(0, 30) + '...' : a.article);
    const data = topArticles.map((a: any) => a.chiffreAffaire);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const Chart = (window as any).Chart;
    if (!Chart) return;

    this.articleChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Chiffre d\'affaire (DH)',
          data: data,
          backgroundColor: 'rgba(153, 102, 255, 0.8)',
          borderColor: 'rgba(153, 102, 255, 1)',
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: function(context: any) {
                return `Chiffre d'affaire: ${context.parsed.x.toFixed(2)} DH`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: function(value: any) {
                return value.toFixed(2) + ' DH';
              }
            }
          }
        }
      }
    });
  }

  createTopClientsChart(livraisons: any[]): void {
    const canvas = document.getElementById('topClientsChartLivraison') as HTMLCanvasElement;
    if (!canvas) return;

    // D?truire le graphique existant s'il existe
    if (this.topClientsChart) {
      this.topClientsChart.destroy();
    }

    // Prendre les top 10 clients
    const topClients = this.dashboardStats.chiffreAffaireParClient.slice(0, 10);
    
    if (topClients.length === 0) {
      return;
    }

    const labels = topClients.map((c: any) => c.client);
    const data = topClients.map((c: any) => c.chiffreAffaire);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const Chart = (window as any).Chart;
    if (!Chart) return;

    this.topClientsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Chiffre d\'affaire (DH)',
          data: data,
          backgroundColor: 'rgba(54, 162, 235, 0.8)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: function(context: any) {
                return `Chiffre d'affaire: ${context.parsed.x.toFixed(2)} DH`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: function(value: any) {
                return value.toFixed(2) + ' DH';
              }
            }
          }
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.clientSearchSub?.unsubscribe();
    this.commercialSearchSub?.unsubscribe();
    this.clearCommandePopoverHideTimer();
    this.sidebarObserver?.disconnect();
    this.sidebarObserver = null;
    if (this.detailMode && this.sidebarStateBeforeDetailMode === false) {
      this.setSidebarHidden(false);
    }
    // D?truire les graphiques
    if (this.evolutionChart) {
      this.evolutionChart.destroy();
    }
    if (this.clientChart) {
      this.clientChart.destroy();
    }
    if (this.topClientsChart) {
      this.topClientsChart.destroy();
    }
    if (this.articleChart) {
      this.articleChart.destroy();
    }
  }
}




