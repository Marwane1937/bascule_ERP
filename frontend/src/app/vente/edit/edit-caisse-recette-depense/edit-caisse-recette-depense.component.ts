import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import { BaseService } from 'src/app/service/base.service';
import { CaisseModeService } from 'src/app/service/caisse-mode.service';
import { CaisseService } from 'src/app/service/caisse.service';

@Component({
  selector: 'app-edit-caisse-recette-depense',
  templateUrl: './edit-caisse-recette-depense.component.html',
  styleUrls: [
    './edit-caisse-recette-depense.component.css',
    '../../caisse/caisse-recette-depense.component.css',
    '../../caisse/caisse-recettes.component.css'
  ]
})
export class EditCaisseRecetteDepenseComponent implements OnInit, OnDestroy {
  activePanel: 'recette' | 'depense' | null = null;
  documents: any[] = [];
  filteredDocuments: any[] = [];
  loading = true;
  loadingDetail = false;

  currentPage = 1;
  pageSize = 25;
  totalRecords = 0;
  totalPages = 0;
  searchTerm = '';

  sortColumn = 'date';
  sortDirection: 'ASC' | 'DESC' = 'DESC';

  selectedDocument: any = null;
  selectedDocumentId: number | null = null;
  recetteDetails: any[] = [];
  depenseDetails: any[] = [];
  private recetteSnapshot = '[]';
  private depenseSnapshot = '[]';
  savingAll = false;
  savingPanel: 'recette' | 'depense' | null = null;

  rubriquesRecettes: any[] = [];
  rubriquesDepenses: any[] = [];
  employes: any[] = [];

  caisseMode: 'declaree' | 'black' = 'declaree';
  isBlackMode = false;

  private caisseModeSubscription?: Subscription;
  private routeSubscription?: Subscription;
  private sidebarStateBeforeDetailMode: boolean | null = null;
  private detailLoadVersion = 0;

  constructor(
    private caisseService: CaisseService,
    private baseService: BaseService,
    private caisseModeService: CaisseModeService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    const currentMode = this.caisseModeService.getCurrentMode();
    this.caisseMode = currentMode === 'black' ? 'black' : 'declaree';
    this.isBlackMode = currentMode === 'black';
    this.selectedDocumentId = this.parseDocumentId(this.route.snapshot.paramMap.get('document_id'));

    this.hideSidebarForEdit();
    this.loadLookups();

    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      const routeId = this.parseDocumentId(params.get('document_id'));
      if (!routeId) {
        this.goBack();
        return;
      }

      this.selectedDocumentId = routeId;
      this.loadDocumentDetails(routeId);
    });

    this.caisseModeSubscription = this.caisseModeService.caisseMode$.subscribe((mode) => {
      this.caisseMode = mode === 'black' ? 'black' : 'declaree';
      this.isBlackMode = mode === 'black';
      this.currentPage = 1;
      this.loadDocuments();

      if (this.selectedDocumentId) {
        this.loadDocumentDetails(this.selectedDocumentId);
      }
    });
  }

  ngOnDestroy(): void {
    this.caisseModeSubscription?.unsubscribe();
    this.routeSubscription?.unsubscribe();
    this.restoreSidebarAfterDetail();
  }

  private loadLookups(): void {
    forkJoin({
      recettes: this.baseService.getListesByGroupId(2000),
      depenses: this.baseService.getListesByGroupId(3000),
      employes: this.baseService.getEmployesActifs()
    }).subscribe({
      next: ({ recettes, depenses, employes }) => {
        this.rubriquesRecettes = this.extractCollection(recettes);
        this.rubriquesDepenses = this.extractCollection(depenses);
        this.employes = this.extractCollection(employes);
      },
      error: () => {
        this.rubriquesRecettes = [];
        this.rubriquesDepenses = [];
        this.employes = [];
      }
    });
  }

  private extractCollection(response: any): any[] {
    if (response?.success && Array.isArray(response.data)) {
      return response.data;
    }

    if (Array.isArray(response?.data)) {
      return response.data;
    }

    return Array.isArray(response) ? response : [];
  }

  loadDocuments(): void {
    this.loading = true;
    const options = {
      page: this.currentPage,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: this.searchTerm,
      type: this.caisseMode === 'black' ? 2 : null
    };

    this.caisseService.getCaisseDocuments(options).subscribe({
      next: (response: any) => {
        this.documents = (response?.data || []).map((doc: any) => this.normalizeDocument(doc));
        this.filteredDocuments = [...this.documents];
        this.totalRecords = response?.pagination?.total || 0;
        this.totalPages = response?.pagination?.totalPages || 0;
        this.syncSelectedDocumentIntoLists();
        this.loading = false;
      },
      error: (error) => {
        this.documents = [];
        this.filteredDocuments = [];
        this.totalRecords = 0;
        this.totalPages = 0;
        this.loading = false;

        if (error.status === 500) {
          Swal.fire('Erreur', 'Erreur serveur lors du chargement des journees de caisse.', 'error');
        } else if (error.status === 401) {
          Swal.fire('Erreur', 'Session expiree. Veuillez vous reconnecter.', 'error');
        }
      }
    });
  }

  loadDocumentDetails(id: number): void {
    const loadVersion = ++this.detailLoadVersion;
    this.loadingDetail = true;
    this.selectedDocument = null;
    this.recetteDetails = [];
    this.depenseDetails = [];
    this.activePanel = null;
    this.caisseService.getCaisseDocumentById(id).subscribe({
      next: (response: any) => {
        if (loadVersion !== this.detailLoadVersion) {
          return;
        }

        this.loadingDetail = false;

        if (!response?.success || !response.data) {
          this.selectedDocument = null;
          this.recetteDetails = [];
          this.depenseDetails = [];
          return;
        }

        this.selectedDocumentId = id;
        this.selectedDocument = this.normalizeDocument(response.data);
        const details = Array.isArray(response.data.details) ? response.data.details : [];
        const normalizedDetails = this.deduplicateDetails(
          details.map((detail: any) => this.normalizeDetail(detail))
        );

        this.recetteDetails = normalizedDetails.filter((detail: any) => detail.sens === 1);
        this.depenseDetails = normalizedDetails.filter((detail: any) => detail.sens === -1);
        this.captureSnapshots();
        this.syncSelectedDocumentIntoLists();
      },
      error: (error) => {
        if (loadVersion !== this.detailLoadVersion) {
          return;
        }

        this.loadingDetail = false;
        this.selectedDocument = null;
        this.recetteDetails = [];
        this.depenseDetails = [];
        Swal.fire('Erreur', error.error?.message || 'Erreur lors du chargement de la journee', 'error');
      }
    });
  }

  openDocument(doc: any): void {
    if (!doc?.id) {
      return;
    }

    if (Number(doc.id) === Number(this.selectedDocumentId)) {
      this.loadDocumentDetails(doc.id);
      return;
    }

    this.router.navigate(['/Edit-Depense-Recette', doc.id]);
  }

  goBack(): void {
    this.restoreSidebarAfterDetail();
    this.router.navigate(['/Caisse-Recette-Depense']);
  }

  onSearch(): void {
    this.currentPage = 1;
    this.loadDocuments();
  }

  onSearchChange(): void {
    this.currentPage = 1;
    this.loadDocuments();
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.loadDocuments();
  }

  onPageChange(page: number): void {
    if (page < 1 || page > this.totalPages) {
      return;
    }

    this.currentPage = page;
    this.loadDocuments();
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'DESC';
    }

    this.currentPage = 1;
    this.loadDocuments();
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort';
    }

    return this.sortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  getPaginatedDocuments(): any[] {
    return this.filteredDocuments;
  }

  getDisplayRange(): string {
    if (this.filteredDocuments.length === 0) {
      return '0';
    }

    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = start + this.filteredDocuments.length - 1;
    return `${start} - ${end}`;
  }

  addRecetteLine(): void {
    this.setActivePanel('recette');
    this.recetteDetails.push(this.createEmptyDetail(1));
  }

  addDepenseLine(): void {
    this.setActivePanel('depense');
    this.depenseDetails.push(this.createEmptyDetail(-1));
  }

  removeDetailLine(index: number, sens: number): void {
    if (sens === 1) {
      this.recetteDetails.splice(index, 1);
    } else {
      this.depenseDetails.splice(index, 1);
    }
  }

  onRubriqueChange(detail: any): void {
    this.setActivePanel(detail?.sens === -1 ? 'depense' : 'recette');
    const rubriques = detail.sens === 1 ? this.rubriquesRecettes : this.rubriquesDepenses;
    const rubrique = rubriques.find((item) => Number(item.id) === Number(detail.rubrique_id));
    if (rubrique && !detail.description) {
      detail.description = rubrique.nom;
    }
  }

  setActivePanel(panel: 'recette' | 'depense'): void {
    this.activePanel = panel;
  }

  getPanelColumnClass(panel: 'recette' | 'depense'): string {
    if (!this.activePanel) {
      return 'col-12 detail-panel-col detail-panel-col--balanced';
    }

    return this.activePanel === panel
      ? 'col-12 detail-panel-col detail-panel-col--wide'
      : 'col-12 detail-panel-col detail-panel-col--narrow';
  }

  isPanelActive(panel: 'recette' | 'depense'): boolean {
    return this.activePanel === panel;
  }

  trackByDetailRow(index: number, detail: any): string {
    const sens = Number(detail?.sens) === -1 ? -1 : 1;
    const rawId = detail?.id ?? detail?.detail_id ?? null;
    return rawId !== null && rawId !== undefined
      ? `${sens}-${rawId}-${index}`
      : `${sens}-${detail?.rubrique_id || 'r'}-${detail?.employe_id || 'e'}-${index}`;
  }

  saveCaisseDetails(): void {
    if (!this.selectedDocument?.id || this.isAnySaveInProgress()) {
      return;
    }

    this.savingAll = true;

    const validDetails = [...this.recetteDetails, ...this.depenseDetails]
      .filter((detail) => this.isDetailMeaningful(detail))
      .map((detail) => this.normalizeDetailForSave(detail, detail.sens === -1 ? -1 : 1));

    const documentData = {
      description: this.selectedDocument.description,
      affectation: this.selectedDocument.affectation,
      fond: Number(this.selectedDocument.fond) || 0
    };

    this.caisseService.updateCaisseDocument(this.selectedDocument.id, documentData, validDetails).subscribe({
      next: (response: any) => {
        this.savingAll = false;
        if (response?.success) {
          Swal.fire('Succes', 'La journee a ete mise a jour avec succes.', 'success');
          this.loadDocumentDetails(this.selectedDocument.id);
          this.loadDocuments();
        } else {
          Swal.fire('Erreur', response?.message || 'Erreur lors de la sauvegarde.', 'error');
        }
      },
      error: (error) => {
        this.savingAll = false;
        Swal.fire('Erreur', error.error?.message || 'Erreur lors de la modification', 'error');
      }
    });
  }

  savePanelDetails(panel: 'recette' | 'depense'): void {
    if (!this.selectedDocument?.id || this.isAnySaveInProgress()) {
      return;
    }

    this.savingPanel = panel;
    const sens = panel === 'recette' ? 1 : -1;
    const sourceDetails = panel === 'recette' ? this.recetteDetails : this.depenseDetails;
    const validDetails = sourceDetails
      .filter((detail) => this.isDetailMeaningful(detail))
      .map((detail) => this.normalizeDetailForSave(detail, sens));

    const documentData = {
      affectation: this.selectedDocument.affectation,
      fond: Number(this.selectedDocument.fond) || 0
    };

    this.caisseService.updateCaisseDocumentBySens(this.selectedDocument.id, sens, documentData, validDetails).subscribe({
      next: (response: any) => {
        this.savingPanel = null;
        if (response?.success) {
          Swal.fire('Succes', `Les lignes de ${panel === 'recette' ? 'recette' : 'depense'} ont ete enregistrees.`, 'success');
          this.loadDocumentDetails(this.selectedDocument.id);
          this.loadDocuments();
        } else {
          this.savePanelDetailsFallback(panel);
        }
      },
      error: (error) => {
        const errorMessage = error?.error?.message || error?.message || 'Erreur lors de la sauvegarde';
        this.savePanelDetailsFallback(panel, errorMessage);
      }
    });
  }

  hasPanelChanges(panel: 'recette' | 'depense'): boolean {
    const current = panel === 'recette'
      ? this.serializePanelDetails(this.recetteDetails, 1)
      : this.serializePanelDetails(this.depenseDetails, -1);

    return current !== (panel === 'recette' ? this.recetteSnapshot : this.depenseSnapshot);
  }

  canSavePanel(panel: 'recette' | 'depense'): boolean {
    return !!this.selectedDocument?.id
      && this.isSelectedDocumentEditable()
      && !this.isAnySaveInProgress()
      && this.hasPanelChanges(panel);
  }

  canSaveAll(): boolean {
    return !!this.selectedDocument?.id
      && this.isSelectedDocumentEditable()
      && !this.isAnySaveInProgress()
      && (this.hasPanelChanges('recette') || this.hasPanelChanges('depense'));
  }

  isSavingPanelActive(panel: 'recette' | 'depense'): boolean {
    return this.savingPanel === panel;
  }

  cloturerCaisse(doc: any, event?: Event): void {
    event?.stopPropagation();

    if (!this.isCaisseOuverte(doc)) {
      Swal.fire('Information', 'Cette journee est deja cloturee.', 'info');
      return;
    }

    Swal.fire({
      title: 'Cloturer la journee ?',
      text: `Voulez-vous cloturer la journee ${doc.numero} ?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Oui, cloturer',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (!result.isConfirmed) {
        return;
      }

      this.caisseService.cloturerCaisseDocument(doc.id).subscribe({
        next: (response: any) => {
          if (response?.success) {
            Swal.fire('Succes', 'La journee a ete cloturee avec succes.', 'success');
            this.loadDocuments();
            if (Number(this.selectedDocumentId) === Number(doc.id)) {
              this.loadDocumentDetails(doc.id);
            }
          } else {
            Swal.fire('Erreur', 'Erreur lors de la cloture.', 'error');
          }
        },
        error: (error) => {
          Swal.fire('Erreur', error.error?.message || 'Erreur lors de la cloture', 'error');
        }
      });
    });
  }

  printDocument(doc?: any): void {
    const targetDocument = doc || this.selectedDocument;
    if (!targetDocument?.id) {
      Swal.fire('Erreur', 'Aucune journee selectionnee.', 'error');
      return;
    }

    const pdfWindow = this.preparePdfWindow();

    Swal.fire({
      title: 'Generation du PDF...',
      text: 'Veuillez patienter',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    this.caisseService.generateCaissePDF(targetDocument.id).subscribe({
      next: (response: any) => {
        Swal.close();
        if (response?.success && response.pdfUrl) {
          this.openPdfUrl(response.pdfUrl, pdfWindow);
        } else {
          this.closePdfWindow(pdfWindow);
          Swal.fire('Erreur', 'Erreur lors de la generation du PDF.', 'error');
        }
      },
      error: (error) => {
        this.closePdfWindow(pdfWindow);
        Swal.fire('Erreur', error.error?.message || 'Erreur lors de la generation du PDF', 'error');
      }
    });
  }

  printCaisseByEmploye(employeId: number | null, sens: number): void {
    if (!this.selectedDocument?.id) {
      Swal.fire('Erreur', 'Aucune journee selectionnee.', 'error');
      return;
    }

    this.resolveEmployeIdForAction(employeId).then((resolvedEmployeId) => {
      if (!resolvedEmployeId) {
        return;
      }

      const pdfWindow = this.preparePdfWindow();

      Swal.fire({
        title: 'Generation du PDF...',
        text: 'Veuillez patienter',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      this.caisseService.generateCaissePDFByEmploye(this.selectedDocument.id, resolvedEmployeId, sens).subscribe({
        next: (response: any) => {
          Swal.close();
          if (response?.success && response.pdfUrl) {
            this.openPdfUrl(response.pdfUrl, pdfWindow);
          } else {
            this.closePdfWindow(pdfWindow);
            Swal.fire('Erreur', 'Erreur lors de la generation du PDF.', 'error');
          }
        },
        error: (error) => {
          this.closePdfWindow(pdfWindow);
          Swal.fire('Erreur', error.error?.message || 'Erreur lors de la generation du PDF', 'error');
        }
      });
    });
  }

  sendTelegramByEmploye(employeId: number | null, sens: number): void {
    if (!this.selectedDocument?.id) {
      Swal.fire('Erreur', 'Aucune journee selectionnee.', 'error');
      return;
    }

    this.resolveEmployeIdForAction(employeId).then((resolvedEmployeId) => {
      if (!resolvedEmployeId) {
        return;
      }

      const employe = this.employes.find((item) => Number(item.id) === Number(resolvedEmployeId));
      const telegramId = employe?.telegram_id;

      if (telegramId) {
        this.sendTelegramWithChatId(resolvedEmployeId, telegramId, sens);
        return;
      }

      Swal.fire({
        title: 'Envoi via Telegram',
        input: 'text',
        inputPlaceholder: 'Chat ID Telegram',
        showCancelButton: true,
        confirmButtonText: 'Envoyer',
        cancelButtonText: 'Annuler',
        inputValidator: (value) => {
          if (!value) {
            return 'Le Chat ID est requis.';
          }
          if (!/^-?\d+$/.test(value)) {
            return 'Le Chat ID doit etre un nombre.';
          }
          return null;
        }
      }).then((result) => {
        if (result.isConfirmed && result.value) {
          this.sendTelegramWithChatId(resolvedEmployeId, result.value, sens);
        }
      });
    });
  }

  private sendTelegramWithChatId(employeId: number, chatId: string, sens: number): void {
    Swal.fire({
      title: 'Envoi en cours...',
      text: 'Generation du PDF et envoi via Telegram',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    this.caisseService.sendCaissePDFByEmployeTelegram(
      this.selectedDocument.id,
      employeId,
      chatId,
      `Bon de caisse ${this.selectedDocument.numero || ''}`,
      sens
    ).subscribe({
      next: (response: any) => {
        if (response?.success) {
          Swal.fire('Succes', 'Le bon de caisse a ete envoye avec succes.', 'success');
        } else {
          Swal.fire('Erreur', response?.message || 'Erreur lors de l envoi.', 'error');
        }
      },
      error: (error) => {
        const message = error.error?.message || error.error?.error || 'Erreur lors de l envoi via Telegram';
        Swal.fire('Erreur', message, 'error');
      }
    });
  }

  private async resolveEmployeIdForAction(employeId: number | null): Promise<number | null> {
    if (employeId) {
      return employeId;
    }

    if (!this.employes.length) {
      Swal.fire('Erreur', 'Aucun employe disponible.', 'error');
      return null;
    }

    const options = this.employes.reduce((acc: Record<string, string>, employe: any) => {
      acc[String(employe.id)] = employe.nom_complet || `Employe ${employe.id}`;
      return acc;
    }, {});

    const result = await Swal.fire({
      title: 'Choisir un employe',
      input: 'select',
      inputOptions: options,
      inputPlaceholder: 'Selectionner un employe',
      showCancelButton: true,
      confirmButtonText: 'Valider',
      cancelButtonText: 'Annuler',
      inputValidator: (value) => value ? null : 'Veuillez selectionner un employe.'
    });

    if (!result.isConfirmed || !result.value) {
      return null;
    }

    return Number(result.value);
  }

  private preparePdfWindow(): Window | null {
    const pdfWindow = window.open('', '_blank');
    if (pdfWindow) {
      pdfWindow.document.write(`
        <html>
          <head><title>Generation du PDF...</title></head>
          <body style="font-family: Arial, sans-serif; padding: 24px; color: #334155;">
            Generation du PDF...
          </body>
        </html>
      `);
      pdfWindow.document.close();
    }
    return pdfWindow;
  }

  private closePdfWindow(pdfWindow: Window | null): void {
    if (pdfWindow && !pdfWindow.closed) {
      pdfWindow.close();
    }
  }

  private openPdfUrl(pdfUrl: string, pdfWindow: Window | null = null): void {
    if (pdfWindow && !pdfWindow.closed) {
      pdfWindow.location.href = pdfUrl;
      pdfWindow.focus();
      return;
    }

    const openedWindow = window.open(pdfUrl, '_blank');
    if (openedWindow) {
      openedWindow.focus();
      return;
    }

    window.location.href = pdfUrl;
  }

  isCaisseOuverte(doc: any): boolean {
    return doc?.etat === null || doc?.etat === undefined || doc?.etat === '' || doc?.etat === 'OUVERT';
  }

  isSelectedDocumentEditable(): boolean {
    return this.isCaisseOuverte(this.selectedDocument);
  }

  isAnySaveInProgress(): boolean {
    return this.savingAll || this.savingPanel !== null;
  }

  isEditingLocked(): boolean {
    return !this.isSelectedDocumentEditable() || this.isAnySaveInProgress();
  }

  isActiveDocument(doc: any): boolean {
    return Number(this.selectedDocumentId || 0) === Number(doc?.id || -1);
  }

  getEtatLabel(doc: any): string {
    const isCloture = doc?.etat === 1 || doc?.etat === '1' || doc?.etat === 'CLOTURE';
    return isCloture ? 'Cloturee' : 'Ouverte';
  }

  getEtatClass(doc: any): string {
    return this.isCaisseOuverte(doc) ? 'badge bg-success' : 'badge bg-danger';
  }

  shouldBeClotured(doc: any): boolean {
    if (!doc?.date || !this.isCaisseOuverte(doc)) {
      return false;
    }

    const docDate = new Date(doc.date);
    const now = new Date();
    const diffInHours = (now.getTime() - docDate.getTime()) / (1000 * 60 * 60);
    return diffInHours > 24;
  }

  getRowClass(doc: any): string {
    if (this.isActiveDocument(doc)) {
      return 'table-primary recette-row-active';
    }

    return this.shouldBeClotured(doc) ? 'table-danger' : '';
  }

  getDocumentFond(doc: any): number {
    return Number(doc?.fond || 0);
  }

  getDocumentSolde(doc: any): number {
    return Number(doc?.solde_net ?? doc?.montant ?? 0);
  }

  getTotalRecettes(): number {
    return this.recetteDetails.reduce((sum, detail) => sum + ((Number(detail.quantite) || 0) * (Number(detail.montant) || 0)), 0);
  }

  getTotalDepenses(): number {
    return this.depenseDetails.reduce((sum, detail) => sum + ((Number(detail.quantite) || 0) * (Number(detail.montant) || 0)), 0);
  }

  getSoldeNet(): number {
    return (Number(this.selectedDocument?.fond) || 0) + this.getTotalRecettes() - this.getTotalDepenses();
  }

  getEmployeName(employeId: number | null): string {
    if (!employeId) {
      return '';
    }

    const employe = this.employes.find((item) => Number(item.id) === Number(employeId));
    return employe?.nom_complet || '';
  }

  toInputDate(value: any): string {
    if (!value) {
      return '';
    }

    const text = String(value);
    return text.includes('T') ? text.split('T')[0] : text;
  }

  private hideSidebarForEdit(): void {
    this.sidebarStateBeforeDetailMode = this.isSidebarHidden();
    this.setSidebarHidden(true);
  }

  private restoreSidebarAfterDetail(): void {
    if (this.sidebarStateBeforeDetailMode === false && this.isSidebarHidden()) {
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

  private normalizeDocument(doc: any): any {
    return {
      ...doc,
      fond: Number(doc?.fond || 0),
      total_recettes: Number(doc?.total_recettes || 0),
      total_depenses: Number(doc?.total_depenses || 0),
      solde_net: Number(doc?.solde_net ?? doc?.montant ?? 0)
    };
  }

  private normalizeDetail(detail: any): any {
    const sens = Number(detail?.sens) === -1 ? -1 : 1;
    return {
      id: detail?.detail_id || detail?.id || null,
      rubrique_id: detail?.rubrique_id ? Number(detail.rubrique_id) : null,
      employe_id: detail?.employe_id ? Number(detail.employe_id) : null,
      employe_nom_complet: detail?.employe_nom_complet || null,
      quantite: detail?.quantite !== null && detail?.quantite !== undefined ? Number(detail.quantite) || 1 : 1,
      montant: detail?.montant !== null && detail?.montant !== undefined ? Number(detail.montant) || 0 : 0,
      description: detail?.description || '',
      unite_id: detail?.unite_id || null,
      etat: detail?.etat || 1,
      sens,
      parent: detail?.parent || null,
      type: detail?.type || null
    };
  }

  private createEmptyDetail(sens: number): any {
    return {
      rubrique_id: null,
      employe_id: null,
      employe_nom_complet: null,
      quantite: 1,
      montant: 0,
      description: '',
      unite_id: null,
      etat: 1,
      sens
    };
  }

  private isDetailMeaningful(detail: any): boolean {
    return Boolean(
      detail?.rubrique_id ||
      detail?.employe_id ||
      (Number(detail?.montant) || 0) > 0
    );
  }

  private parseDocumentId(value: string | null): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private deduplicateDetails(details: any[]): any[] {
    const uniqueMap = new Map<string, any>();

    details.forEach((detail) => {
      const key = [
        Number(detail?.sens) === -1 ? -1 : 1,
        detail?.rubrique_id || 0,
        detail?.employe_id || 0,
        Number(detail?.quantite) || 0,
        Number(detail?.montant) || 0,
        detail?.description || '',
        detail?.unite_id || 0,
        detail?.etat || 0,
        detail?.ligne || 0,
        detail?.parent || '',
        detail?.type || ''
      ].join('|');

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, detail);
      }
    });

    return Array.from(uniqueMap.values());
  }

  private syncSelectedDocumentIntoLists(): void {
    if (!this.selectedDocument?.id) {
      return;
    }

    const normalized = this.normalizeDocument(this.selectedDocument);
    const upsert = (collection: any[]) => {
      const index = collection.findIndex((doc) => Number(doc?.id) === Number(normalized.id));
      if (index >= 0) {
        collection[index] = {
          ...collection[index],
          ...normalized
        };
        return;
      }

      collection.unshift(normalized);
    };

    upsert(this.documents);
    upsert(this.filteredDocuments);
  }

  private captureSnapshots(): void {
    this.recetteSnapshot = this.serializePanelDetails(this.recetteDetails, 1);
    this.depenseSnapshot = this.serializePanelDetails(this.depenseDetails, -1);
  }

  private serializePanelDetails(details: any[], sens: number): string {
    return JSON.stringify(
      details
        .filter((detail) => this.isDetailMeaningful(detail))
        .map((detail) => this.normalizeDetailForSave(detail, sens))
    );
  }

  private normalizeDetailForSave(detail: any, sens: number): any {
    const rubrique = (sens === 1 ? this.rubriquesRecettes : this.rubriquesDepenses)
      .find((item) => Number(item.id) === Number(detail?.rubrique_id));

    return {
      rubrique_id: detail?.rubrique_id ? Number(detail.rubrique_id) : null,
      employe_id: detail?.employe_id ? Number(detail.employe_id) : null,
      quantite: Number(detail?.quantite) > 0 ? Number(detail.quantite) : 1,
      montant: Number(detail?.montant) || 0,
      description: detail?.description || rubrique?.nom || '',
      unite_id: detail?.unite_id || null,
      etat: detail?.etat || 1,
      parent: detail?.parent || null,
      type: detail?.type || null,
      sens
    };
  }

  private savePanelDetailsFallback(panel: 'recette' | 'depense', initialErrorMessage?: string): void {
    const documentData = {
      description: this.selectedDocument?.description,
      affectation: this.selectedDocument?.affectation,
      fond: Number(this.selectedDocument?.fond) || 0
    };

    const validDetails = [
      ...this.recetteDetails
        .filter((detail) => this.isDetailMeaningful(detail))
        .map((detail) => this.normalizeDetailForSave(detail, 1)),
      ...this.depenseDetails
        .filter((detail) => this.isDetailMeaningful(detail))
        .map((detail) => this.normalizeDetailForSave(detail, -1))
    ];

    this.caisseService.updateCaisseDocument(this.selectedDocument.id, documentData, validDetails).subscribe({
      next: (response: any) => {
        this.savingPanel = null;
        if (response?.success) {
          Swal.fire(
            'Succes',
            `Les lignes de ${panel === 'recette' ? 'recette' : 'depense'} ont ete enregistrees.`,
            'success'
          );
          this.loadDocumentDetails(this.selectedDocument.id);
          this.loadDocuments();
        } else {
          Swal.fire('Erreur', response?.message || initialErrorMessage || 'Erreur lors de la sauvegarde.', 'error');
        }
      },
      error: (error) => {
        this.savingPanel = null;
        Swal.fire('Erreur', error.error?.message || initialErrorMessage || 'Erreur lors de la sauvegarde', 'error');
      }
    });
  }
}
