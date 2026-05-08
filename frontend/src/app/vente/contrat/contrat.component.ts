import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { VentesService } from 'src/app/service/ventes.service';
import { BaseService } from 'src/app/service/base.service';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom, Subscription } from 'rxjs';
import Swal from 'sweetalert2';

const CONTRAT_NOTIFICATION_FOCUS_STORAGE_KEY = 'contrat-notification-focus';
const CONTRAT_NOTIFICATION_FOCUS_EVENT = 'contrat-notification-focus';

interface ContratNotificationFocusPayload {
  contratId: number | null;
  numero: string;
  requestedAt?: number;
}

type ContratTableColumnKey =
  | 'numero'
  | 'date'
  | 'client'
  | 'date_planif'
  | 'date_expire'
  | 'jours_restants'
  | 'statut'
  | 'actions';

interface ContratTableResizeState {
  columnKey: ContratTableColumnKey;
  startX: number;
  startWidth: number;
}

@Component({
  selector: 'app-contrat',
  templateUrl: './contrat.component.html',
  styleUrls: ['./contrat.component.css']
})
export class ContratComponent implements OnInit, OnDestroy {
  contrats: any[] = [];
  loading: boolean = true;
  clients: any[] = [];
  filteredClients: any[] = [];
  conditionsPaiement: any[] = [];
  detailMode: boolean = false;
  highlightedContratId: number | null = null;
  highlightedContratNumero: string = '';
  openActionMenuContratId: number | null = null;

  // Formulaire ajout/modification contrat
  contratForm!: FormGroup;
  isEditMode: boolean = false;
  currentContratId: number | null = null;

  // Pagination
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 0;

  // Recherche / tri
  searchTerm: string = '';
  sortColumn: string = 'numero';
  sortDirection: 'ASC' | 'DESC' = 'DESC';

  // Filtres avancés
  showAdvancedFilters: boolean = false;
  filterDateFrom: string = '';
  filterDateTo: string = '';
  readonly columnOrder: ContratTableColumnKey[] = [
    'numero',
    'date',
    'client',
    'date_planif',
    'date_expire',
    'jours_restants',
    'statut',
    'actions'
  ];
  readonly columnMinWidths: Record<ContratTableColumnKey, number> = {
    numero: 132,
    date: 112,
    client: 160,
    date_planif: 118,
    date_expire: 118,
    jours_restants: 124,
    statut: 96,
    actions: 110
  };
  columnWidths: Record<ContratTableColumnKey, number> = {
    numero: 148,
    date: 120,
    client: 182,
    date_planif: 128,
    date_expire: 128,
    jours_restants: 138,
    statut: 102,
    actions: 118
  };
  private notificationFocusSequence: number = 0;
  private columnResizeState: ContratTableResizeState | null = null;
  private previousBodyCursor: string = '';
  private previousBodyUserSelect: string = '';
  private sidebarStateBeforeDetailMode: boolean | null = null;
  private sidebarObserver: MutationObserver | null = null;
  private preservedContractDurationDays: number | null = null;
  private isAdjustingContractDates = false;
  private contractDateSubscriptions: Subscription[] = [];
  private readonly notificationFocusListener = (event: Event) => {
    const customEvent = event as CustomEvent<ContratNotificationFocusPayload>;
    void this.applyNotificationFocus(customEvent.detail);
  };

  constructor(
    private ventesService: VentesService,
    private baseService: BaseService,
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.setupContractDurationPreservation();
    this.loadClients();
    this.loadConditionsPaiement();
    this.startSidebarObserver();
    window.addEventListener(CONTRAT_NOTIFICATION_FOCUS_EVENT, this.notificationFocusListener as EventListener);

    const legacyFocus = this.getLegacyNotificationFocus();
    if (legacyFocus) {
      this.clearLegacyNotificationQueryParams();
      void this.applyNotificationFocus(legacyFocus);
      return;
    }

    const storedFocus = this.consumeStoredNotificationFocus();
    if (storedFocus) {
      void this.applyNotificationFocus(storedFocus);
      return;
    }

    this.loadContrats(1);
  }

  ngOnDestroy(): void {
    window.removeEventListener(CONTRAT_NOTIFICATION_FOCUS_EVENT, this.notificationFocusListener as EventListener);
    this.stopColumnResize();
    this.sidebarObserver?.disconnect();
    this.sidebarObserver = null;
    this.contractDateSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.contractDateSubscriptions = [];
    if (this.detailMode && this.sidebarStateBeforeDetailMode === false) {
      this.setSidebarHidden(false);
    }
  }

  loadConditionsPaiement(): void {
    this.ventesService.getConditionsPaiement().subscribe({
      next: (response: any) => {
        const result = response?.data || response || [];
        this.conditionsPaiement = Array.isArray(result) ? result : [];
      },
      error: (err: any) => {
        this.conditionsPaiement = [];
      }
    });
  }

  initForm(): void {
    this.contratForm = this.fb.group({
      numero: [''], // Sera généré automatiquement
      date: [new Date().toISOString().split('T')[0], Validators.required],
      description: [''],
      part_id: [null, Validators.required],
      clientSearch: [''],
      date_planif: [''],
      date_expire: [''],
      condition_id: [null]
    });
  }

  private setupContractDurationPreservation(): void {
    const datePlanifControl = this.contratForm.get('date_planif');
    const dateExpireControl = this.contratForm.get('date_expire');

    if (!datePlanifControl || !dateExpireControl) {
      return;
    }

    this.contractDateSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.contractDateSubscriptions = [
      datePlanifControl.valueChanges.subscribe(() => this.handleContractDateChange('date_planif')),
      dateExpireControl.valueChanges.subscribe(() => this.handleContractDateChange('date_expire'))
    ];
  }

  private handleContractDateChange(changedField: 'date_planif' | 'date_expire'): void {
    if (this.isAdjustingContractDates) {
      return;
    }

    const datePlanifControl = this.contratForm.get('date_planif');
    const dateExpireControl = this.contratForm.get('date_expire');
    const planif = this.parseDateOnly(datePlanifControl?.value);
    const expire = this.parseDateOnly(dateExpireControl?.value);

    if (!planif || !expire) {
      if (!planif && !expire) {
        this.preservedContractDurationDays = null;
      }
      return;
    }

    const currentDurationDays = this.getDateDiffDays(planif, expire);
    if (currentDurationDays === null || currentDurationDays < 0) {
      return;
    }

    if (this.preservedContractDurationDays === null) {
      this.preservedContractDurationDays = currentDurationDays;
      return;
    }

    if (currentDurationDays === this.preservedContractDurationDays) {
      return;
    }

    const targetControlName = changedField === 'date_planif' ? 'date_expire' : 'date_planif';
    const anchorDate = changedField === 'date_planif' ? planif : expire;
    const targetDate = changedField === 'date_planif'
      ? this.addDays(anchorDate, this.preservedContractDurationDays)
      : this.addDays(anchorDate, -this.preservedContractDurationDays);

    this.isAdjustingContractDates = true;
    this.contratForm.patchValue({
      [targetControlName]: this.formatDateOnly(targetDate)
    }, { emitEvent: false });
    this.isAdjustingContractDates = false;
  }

  private syncPreservedContractDuration(): void {
    const planif = this.parseDateOnly(this.contratForm.get('date_planif')?.value);
    const expire = this.parseDateOnly(this.contratForm.get('date_expire')?.value);
    const durationDays = this.getDateDiffDays(planif, expire);
    this.preservedContractDurationDays = durationDays !== null && durationDays >= 0 ? durationDays : null;
  }

  private parseDateOnly(value: any): Date | null {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) {
      return null;
    }

    const parsed = new Date(`${normalizedValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  private getDateDiffDays(startDate: Date | null, endDate: Date | null): number | null {
    if (!startDate || !endDate) {
      return null;
    }

    return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  private addDays(date: Date | null, days: number): Date | null {
    if (!date) {
      return null;
    }

    const nextDate = new Date(date.getTime());
    nextDate.setDate(nextDate.getDate() + Number(days || 0));
    return nextDate;
  }

  private formatDateOnly(value: Date | null): string {
    if (!value || Number.isNaN(value.getTime())) {
      return '';
    }

    const pad = (part: number) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  private keepOnlyClients(partners: any[]): any[] {
    return (Array.isArray(partners) ? partners : []).filter((partner: any) => {
      const typeValue = Number(partner?.type);
      return !Number.isFinite(typeValue) || typeValue === 1;
    });
  }

  loadClients(): void {
    this.baseService.getClient().subscribe({
      next: (response: any) => {
        const result = response?.data || response || [];
        this.clients = this.keepOnlyClients(result);
        this.filteredClients = [...this.clients];
      },
      error: (err: any) => {
        this.clients = [];
        this.filteredClients = [];
      }
    });
  }

  onClientSearch(event: any): void {
    const searchValue = event.target.value.toLowerCase();
    this.filteredClients = this.clients.filter(client =>
      client.nom?.toLowerCase().includes(searchValue) ||
      client.code?.toLowerCase().includes(searchValue)
    );
  }

  selectClient(client: any): void {
    this.contratForm.patchValue({
      part_id: client.part_id,
      clientSearch: client.nom
    });
    this.filteredClients = [];
  }

  loadContrats(page: number = 1): void {
    this.loading = true;
    this.currentPage = page;

    const requestOptions: any = {
      page: this.currentPage,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: this.searchTerm
    };

    if (this.filterDateFrom) {
      requestOptions.dateFrom = this.filterDateFrom;
    }
    if (this.filterDateTo) {
      requestOptions.dateTo = this.filterDateTo;
    }

    this.ventesService.getContrats(requestOptions).subscribe({
      next: (response: any) => {
        const result = response?.data || [];
        const pagination = response?.pagination || {};

        this.contrats = Array.isArray(result) ? result : [];
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;
        this.syncHighlightedContratFromCurrentPage();

        this.loading = false;
        this.scrollToHighlightedContrat();
      },
      error: (err) => {
        this.contrats = [];
        this.totalRecords = 0;
        this.totalPages = 1;
        this.loading = false;
        this.showError(`❌ Erreur lors du chargement des contrats: ${err.error?.message || err.message || 'Erreur inconnue'}`);
      }
    });
  }

  onSubmit(): void {
    if (this.contratForm.invalid) {
      this.showError('❗ Le formulaire est invalide. Veuillez remplir tous les champs requis.');
      return;
    }

    const formData: any = {
      date: this.contratForm.value.date,
      description: this.contratForm.value.description || null,
      part_id: this.contratForm.value.part_id,
      date_planif: this.contratForm.value.date_planif || null,
      date_expire: this.contratForm.value.date_expire || null,
      condition_id: this.contratForm.value.condition_id || null
    };

    // Ne pas envoyer le numéro en création, il sera généré automatiquement
    if (this.isEditMode && this.contratForm.value.numero) {
      formData.numero = this.contratForm.value.numero;
    }

    if (this.isEditMode && this.currentContratId) {
      // Modification
      this.ventesService.updateContrat(this.currentContratId, formData).subscribe({
        next: () => {
          this.closeModal();
          this.resetForm();
          this.showSuccess('✅ Contrat modifié avec succès !');
          this.loadContrats(this.currentPage);
        },
        error: (err) => {
          this.showError(`❌ Erreur lors de la modification: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    } else {
      // Création
      this.ventesService.createContrat(formData).subscribe({
        next: async (response: any) => {
          const createdContrat = response?.data || response || {};
          const createdId = Number(createdContrat?.id || createdContrat?.stock_id || 0);
          const createdNumero = this.normalizeContratNumero(createdContrat?.numero);
          this.closeModal();
          this.resetForm();
          this.showSuccess('✅ Contrat créé avec succès !');
          if (createdId > 0 || createdNumero) {
            await this.applyNotificationFocus({
              contratId: createdId > 0 ? createdId : null,
              numero: createdNumero,
              requestedAt: Date.now()
            });
            return;
          }

          this.loadContrats(1);
        },
        error: (err) => {
          this.showError(`❌ Erreur lors de la création: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    }
  }

  editContrat(contrat: any): void {
    this.router.navigate(['/Edit-Contrat/' + contrat.id]);
  }

  isContratMarkedForRenewal(contrat: any): boolean {
    return Number(contrat?.parent) === 1;
  }

  markContratForRenewal(contrat: any): void {
    if (!contrat?.id) {
      return;
    }

    const enabled = !this.isContratMarkedForRenewal(contrat);

    this.ventesService.markContratForRenewal(contrat.id, enabled).subscribe({
      next: (response: any) => {
        contrat.parent = response?.data?.parent ?? (enabled ? 1 : null);
        this.showSuccess(enabled ? '✅ Contrat marqué pour renouvellement.' : '✅ Marquage de renouvellement désactivé.');
      },
      error: (err) => {
        this.showError(`❌ Erreur lors du marquage pour renouvellement: ${err.error?.message || err.message || 'Erreur inconnue'}`);
      }
    });
  }

  removeContrat(contrat: any): void {
    const contratId = contrat?.id;
    if (!contratId) {
      this.showError('❌ Identifiant contrat introuvable.');
      return;
    }

    Swal.fire({
      icon: 'warning',
      title: 'Supprimer ce contrat ?',
      text: `Contrat: ${contrat?.numero || ''} - ${contrat?.client || ''}`,
      showCancelButton: true,
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler',
      customClass: {
        confirmButton: 'btn btn-danger',
        cancelButton: 'btn btn-secondary'
      },
      buttonsStyling: false
    }).then((result) => {
      if (!result.isConfirmed) return;

      this.ventesService.deleteContrat(contratId).subscribe({
        next: (res: any) => {
          const message = res?.message || 'Contrat supprimé avec succès';
          this.showSuccess(`✅ ${message}`);
          this.loadContrats(this.currentPage);
        },
        error: (err) => {
          this.showError(`❌ Erreur lors de la suppression: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    });
  }

  closeModal(): void {
    const modalElement = document.getElementById('addContratModal');
    if (modalElement) {
      const modal = (window as any).bootstrap.Modal.getInstance(modalElement);
      if (modal) {
        modal.hide();
      }
    }
    this.resetForm();
  }

  resetForm(): void {
    this.isEditMode = false;
    this.currentContratId = null;
    this.contratForm.reset({
      numero: '',
      date: new Date().toISOString().split('T')[0],
      description: '',
      part_id: null,
      clientSearch: '',
      date_planif: '',
      date_expire: '',
      condition_id: null
    });
    this.filteredClients = [...this.clients];
    this.preservedContractDurationDays = null;
  }

  facturerContrat(contrat: any): void {
    if (!contrat.id) {
      this.showError('❌ Identifiant contrat introuvable.');
      return;
    }

    // Récupérer les données du contrat
    this.ventesService.getContratDataForTransfer(contrat.id).subscribe({
      next: (contratData: any) => {
        const dateValue = contratData.date;
        const partId = contratData.part_id;

        Swal.fire({
          title: 'Facturer le contrat',
          html: `
            <div class="text-start">
              <p><strong>Contrat:</strong> ${contrat.numero}</p>
              <p><strong>Client:</strong> ${contrat.client}</p>
            </div>
            <label for="factureDate" class="form-label mt-3">Date de facturation:</label>
            <input id="factureDate" type="date" class="form-control" value="${dateValue ? dateValue.split('T')[0] : new Date().toISOString().split('T')[0]}" />
          `,
          showCancelButton: true,
          confirmButtonText: 'Facturer',
          cancelButtonText: 'Annuler',
          customClass: {
            confirmButton: 'btn btn-success',
            cancelButton: 'btn btn-secondary'
          },
          buttonsStyling: false,
          preConfirm: () => {
            const factureDateInput = document.getElementById('factureDate') as HTMLInputElement;
            const factureDate = factureDateInput?.value;
            if (!factureDate) {
              Swal.showValidationMessage('La date de facturation est requise');
              return false;
            }
            return { factureDate, partId };
          }
        }).then((result) => {
          if (result.isConfirmed && result.value) {
            const { factureDate, partId } = result.value;
            
            Swal.fire({
              title: 'Facturation en cours...',
              allowOutsideClick: false,
              didOpen: () => {
                Swal.showLoading();
              }
            });
            
            this.ventesService.transfererContratVersFacturation(contrat.id, factureDate, partId).subscribe({
              next: (res: any) => {
                Swal.fire({
                  icon: 'success',
                  title: 'Facturation réussie !',
                  text: `Le contrat a été facturé avec succès. Facture: ${res.factureNum || ''}`,
                  confirmButtonText: 'OK',
                  timer: 3000,
                  timerProgressBar: true
                }).then(() => {
                  this.loadContrats(this.currentPage);
                });
              },
              error: (err: any) => {
                Swal.fire({
                  icon: 'error',
                  title: 'Erreur',
                  text: `Une erreur s'est produite lors de la facturation : ${err.error?.message || err.message || 'Erreur inconnue'}`,
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
          text: `Impossible de récupérer les données du contrat : ${err.error?.message || err.message || 'Erreur inconnue'}`,
          confirmButtonText: 'Fermer'
        });
      }
    });
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.loadContrats(page);
    }
  }

  onPageSizeChange(event: any): void {
    this.pageSize = parseInt(event.target.value);
    this.loadContrats(1);
  }

  onSearch(): void {
    this.loadContrats(1);
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = column === 'numero' ? 'DESC' : 'ASC';
    }
    this.loadContrats(this.currentPage);
  }

  getColumnWidth(column: ContratTableColumnKey): number {
    return this.columnWidths[column];
  }

  isResizableColumn(column: ContratTableColumnKey): boolean {
    return this.columnOrder.indexOf(column) < this.columnOrder.length - 1;
  }

  startColumnResize(event: MouseEvent, column: ContratTableColumnKey, headerEl: HTMLElement): void {
    event.preventDefault();
    event.stopPropagation();

    this.previousBodyCursor = document.body.style.cursor;
    this.previousBodyUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    this.columnResizeState = {
      columnKey: column,
      startX: event.clientX,
      startWidth: headerEl?.offsetWidth || this.getColumnWidth(column)
    };
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (!this.columnResizeState) {
      return;
    }

    const { columnKey, startX, startWidth } = this.columnResizeState;
    const delta = event.clientX - startX;
    const minWidth = this.columnMinWidths[columnKey];
    const maxWidthByColumn: Record<ContratTableColumnKey, number> = {
      numero: 210,
      date: 160,
      client: 300,
      date_planif: 180,
      date_expire: 180,
      jours_restants: 180,
      statut: 140,
      actions: 150
    };
    const maxWidth = maxWidthByColumn[columnKey];
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));

    this.columnWidths = {
      ...this.columnWidths,
      [columnKey]: Math.round(nextWidth)
    };
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.stopColumnResize();
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort text-muted';
    }
    return this.sortDirection === 'ASC' ? 'fa-sort-up text-primary' : 'fa-sort-down text-primary';
  }

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  applyFilters(): void {
    this.loadContrats(1);
  }

  clearFilters(): void {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.searchTerm = '';
    this.loadContrats(1);
  }

  toggleDetailMode(): void {
    if (!this.detailMode) {
      this.sidebarStateBeforeDetailMode = this.isSidebarHidden();
    }

    this.detailMode = !this.detailMode;
    this.applyDetailMode();
  }

  isDetailColumnVisible(column: ContratTableColumnKey): boolean {
    if (this.detailMode) {
      return true;
    }

    return !['date_planif', 'date_expire', 'jours_restants'].includes(column);
  }

  getVisibleColumnCount(): number {
    return this.columnOrder.filter((column) => this.isDetailColumnVisible(column)).length;
  }

  toggleActionMenu(contrat: any, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const contratId = this.getContratId(contrat);
    if (!contratId) {
      this.openActionMenuContratId = null;
      return;
    }

    this.openActionMenuContratId = this.openActionMenuContratId === contratId ? null : contratId;
  }

  closeActionMenu(): void {
    this.openActionMenuContratId = null;
  }

  isActionMenuOpen(contrat: any): boolean {
    const contratId = this.getContratId(contrat);
    return !!contratId && this.openActionMenuContratId === contratId;
  }

  canRenewContrat(contrat: any): boolean {
    const days = this.getRemainingDaysValue(contrat);

    return !!this.getContratId(contrat)
      && this.isContratMarkedForRenewal(contrat)
      && days !== null
      && days >= 0
      && days < 10;
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
    return `${start} - ${end}`;
  }

  formatDate(date: string | null): string {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleDateString('fr-FR');
    } catch {
      return date;
    }
  }

  getRemainingDaysValue(contrat: any): number | null {
    const days = Number(contrat?.jours_restants);
    return Number.isFinite(days) ? days : null;
  }

  getRemainingDaysLabel(contrat: any): string {
    const days = this.getRemainingDaysValue(contrat);

    if (days === null) {
      return '-';
    }

    if (days < 0) {
      return `Depasse de ${Math.abs(days)} jour(s)`;
    }

    if (days === 0) {
      return "Expire aujourd'hui";
    }

    if (days === 1) {
      return '1 jour restant';
    }

    return `${days} jours restants`;
  }

  getRemainingDaysBadgeClass(contrat: any): string {
    const days = this.getRemainingDaysValue(contrat);

    if (days === null) {
      return 'remaining-days-badge remaining-days-muted';
    }

    if (days < 0) {
      return 'remaining-days-badge remaining-days-overdue';
    }

    if (days <= 5) {
      return 'remaining-days-badge remaining-days-alert';
    }

    return 'remaining-days-badge remaining-days-ok';
  }

  isHighlightedContrat(contrat: any): boolean {
    return Number(contrat?.id || 0) > 0 && Number(contrat?.id) === this.highlightedContratId;
  }

  private consumeStoredNotificationFocus(): ContratNotificationFocusPayload | null {
    try {
      const rawValue = sessionStorage.getItem(CONTRAT_NOTIFICATION_FOCUS_STORAGE_KEY);
      if (!rawValue) {
        return null;
      }

      sessionStorage.removeItem(CONTRAT_NOTIFICATION_FOCUS_STORAGE_KEY);
      return this.normalizeNotificationFocusPayload(JSON.parse(rawValue));
    } catch (error) {
      return null;
    }
  }

  private getLegacyNotificationFocus(): ContratNotificationFocusPayload | null {
    const params = this.route.snapshot.queryParamMap;
    const highlightedId = Number(params.get('highlightContratId'));
    const highlightedNumero = this.normalizeContratNumero(
      params.get('highlightContratNumero') || params.get('search')
    );

    return this.normalizeNotificationFocusPayload({
      contratId: Number.isInteger(highlightedId) && highlightedId > 0 ? highlightedId : null,
      numero: highlightedNumero
    });
  }

  private clearLegacyNotificationQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const hasLegacyParams = ['focus', 'highlightContratId', 'highlightContratNumero', 'search']
      .some((key) => params.has(key));

    if (!hasLegacyParams) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        focus: null,
        highlightContratId: null,
        highlightContratNumero: null,
        search: null
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private normalizeNotificationFocusPayload(value: any): ContratNotificationFocusPayload | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const parsedId = Number(value.contratId ?? value.highlightContratId ?? 0);
    const contratId = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;
    const numero = this.normalizeContratNumero(value.numero ?? value.highlightContratNumero);

    if (!contratId && !numero) {
      return null;
    }

    return {
      contratId,
      numero,
      requestedAt: Number(value.requestedAt || 0) || undefined
    };
  }

  private async applyNotificationFocus(payload: ContratNotificationFocusPayload | null): Promise<void> {
    const normalizedPayload = this.normalizeNotificationFocusPayload(payload);
    if (!normalizedPayload) {
      this.highlightedContratId = null;
      this.highlightedContratNumero = '';
      this.loadContrats(1);
      return;
    }

    const requestId = ++this.notificationFocusSequence;

    this.searchTerm = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';

    const resolvedContrat = await this.resolveNotificationFocusContrat(normalizedPayload);
    if (requestId !== this.notificationFocusSequence) {
      return;
    }

    this.highlightedContratId = resolvedContrat.id;
    this.highlightedContratNumero = resolvedContrat.numero;

    const targetPage = resolvedContrat.id
      ? await this.resolveContratPage(resolvedContrat.id)
      : 1;

    if (requestId !== this.notificationFocusSequence) {
      return;
    }

    this.loadContrats(targetPage);
  }

  private async resolveNotificationFocusContrat(
    payload: ContratNotificationFocusPayload
  ): Promise<{ id: number | null; numero: string }> {
    let contratId = Number.isInteger(Number(payload.contratId)) && Number(payload.contratId) > 0
      ? Number(payload.contratId)
      : null;
    let numero = this.normalizeContratNumero(payload.numero);

    if (!contratId && numero) {
      try {
        const response: any = await firstValueFrom(this.ventesService.getContrats({
          page: 1,
          pageSize: 25,
          search: numero,
          orderBy: 'date',
          orderDirection: 'DESC'
        }));

        const contrats = Array.isArray(response?.data) ? response.data : [];
        const matchingContrat = contrats.find((contrat: any) =>
          this.normalizeContratNumero(contrat?.numero).toLowerCase() === numero.toLowerCase()
        ) || contrats[0];

        const resolvedId = Number(matchingContrat?.id || matchingContrat?.stock_id || 0);
        contratId = Number.isInteger(resolvedId) && resolvedId > 0 ? resolvedId : null;
        numero = this.normalizeContratNumero(matchingContrat?.numero || numero);
      } catch (error) {
        contratId = null;
      }
    }

    if (contratId && !numero) {
      try {
        const contratResponse: any = await firstValueFrom(this.ventesService.getContrat(contratId));
        const contrat = contratResponse?.data || contratResponse;
        numero = this.normalizeContratNumero(contrat?.numero);
      } catch (error) {
        numero = '';
      }
    }

    return {
      id: contratId,
      numero
    };
  }

  private async resolveContratPage(contratId: number): Promise<number> {
    try {
      const response: any = await firstValueFrom(this.ventesService.getContratLocation(contratId, {
        pageSize: this.pageSize,
        orderBy: this.sortColumn,
        orderDirection: this.sortDirection
      }));

      const page = Number(response?.data?.page || response?.page || 0);
      return Number.isInteger(page) && page > 0 ? page : 1;
    } catch (error) {
      return 1;
    }
  }

  showSuccess(message: string): void {
    Swal.fire({
      icon: 'success',
      title: 'Succès',
      text: message,
      timer: 3000,
      showConfirmButton: false,
      toast: true,
      position: 'top-end',
      customClass: {
        container: 'contrat-success-toast-container',
        popup: 'contrat-success-toast'
      }
    });
  }

  showError(message: string): void {
    Swal.fire({
      icon: 'error',
      title: 'Erreur',
      text: message,
      confirmButtonText: 'OK'
    });
  }

  private stopColumnResize(): void {
    if (!this.columnResizeState) {
      return;
    }

    this.columnResizeState = null;
    document.body.style.cursor = this.previousBodyCursor;
    document.body.style.userSelect = this.previousBodyUserSelect;
  }

  private scrollToHighlightedContrat(): void {
    if (!this.highlightedContratId) {
      return;
    }

    const tryScroll = (attempt: number = 0) => {
      const row = document.getElementById(`contrat-row-${this.highlightedContratId}`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (attempt < 8) {
        setTimeout(() => tryScroll(attempt + 1), 180);
      }
    };

    setTimeout(() => tryScroll(), 0);
  }

  private syncHighlightedContratFromCurrentPage(): void {
    if (this.highlightedContratId) {
      return;
    }

    const highlightedNumero = this.normalizeContratNumero(this.highlightedContratNumero);
    if (!highlightedNumero) {
      return;
    }

    const matchingContrat = this.contrats.find((contrat: any) =>
      this.normalizeContratNumero(contrat?.numero).toLowerCase() === highlightedNumero.toLowerCase()
    );

    const matchedId = Number(matchingContrat?.id || matchingContrat?.stock_id || 0);
    if (Number.isInteger(matchedId) && matchedId > 0) {
      this.highlightedContratId = matchedId;
    }
  }

  private normalizeContratNumero(value: unknown): string {
    return String(value || '').trim();
  }

  private getContratId(contrat: any): number | null {
    const parsedId = Number(contrat?.id || contrat?.stock_id || 0);
    return Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;
  }

  renewContratFromRow(contrat: any, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.closeActionMenu();

    const contratId = this.getContratId(contrat);
    if (!contratId) {
      this.showError('❌ Contrat introuvable pour le renouvellement.');
      return;
    }

    Swal.fire({
      icon: 'question',
      title: 'Renouveler le contrat',
      text: `Voulez-vous renouveler le contrat ${contrat?.numero || ''} ?`,
      showCancelButton: true,
      confirmButtonText: 'Oui, renouveler',
      cancelButtonText: 'Annuler',
      customClass: {
        confirmButton: 'btn btn-success',
        cancelButton: 'btn btn-secondary'
      },
      buttonsStyling: false
    }).then((result) => {
      if (!result.isConfirmed) {
        return;
      }

      Swal.fire({
        title: 'Renouvellement en cours...',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      this.ventesService.renewContrat(contratId).subscribe({
        next: async (response: any) => {
          const renewedContrat = response?.data?.contrat;
          const renewedContratId = Number(renewedContrat?.id || response?.data?.new_id || 0);
          const renewedNumero = this.normalizeContratNumero(renewedContrat?.numero || response?.data?.numero);

          await Swal.fire({
            icon: 'success',
            title: 'Contrat renouvelé',
            text: 'Le nouveau contrat a été créé avec succès.',
            confirmButtonText: 'OK'
          });

          if (renewedContratId > 0 || renewedNumero) {
            await this.applyNotificationFocus({
              contratId: renewedContratId > 0 ? renewedContratId : null,
              numero: renewedNumero,
              requestedAt: Date.now()
            });
            return;
          }

          this.loadContrats(1);
        },
        error: (error: any) => {
          this.showError(`❌ ${error?.error?.message || error?.message || 'Erreur lors du renouvellement du contrat.'}`);
        }
      });
    });
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

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.contract-action-menu')) {
      this.closeActionMenu();
    }
  }
}
