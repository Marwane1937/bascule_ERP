import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import { AuthService } from 'src/app/service/auth.service';
import { BaseService } from 'src/app/service/base.service';
import { CaisseModeService } from 'src/app/service/caisse-mode.service';
import { CaisseService } from 'src/app/service/caisse.service';

declare const $: any;

@Component({
  selector: 'app-caisse-recette-depense',
  templateUrl: './caisse-recette-depense.component.html',
  styleUrls: ['./caisse-recette-depense.component.css', './caisse-recettes.component.css']
})
export class CaisseRecetteDepenseComponent implements OnInit, OnDestroy {
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

  showAdvancedFilters = false;
  filterDateFrom = '';
  filterDateTo = '';
  filterSoldeMin: number | null = null;
  filterSoldeMax: number | null = null;

  journeeForm!: FormGroup;
  nextNumero = '';

  selectedDocument: any = null;
  recetteDetails: any[] = [];
  depenseDetails: any[] = [];
  editModalVisible = false;
  detailMode = false;

  rubriquesRecettes: any[] = [];
  rubriquesDepenses: any[] = [];
  employes: any[] = [];
  currentUserName = '';

  caisseMode: 'declaree' | 'black' = 'declaree';
  isBlackMode = false;
  private caisseModeSubscription?: Subscription;
  private currentUserSubscription?: Subscription;
  private sidebarStateBeforeDetailMode: boolean | null = null;

  constructor(
    private caisseService: CaisseService,
    private baseService: BaseService,
    private authService: AuthService,
    private fb: FormBuilder,
    private caisseModeService: CaisseModeService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.caisseModeSubscription = this.caisseModeService.caisseMode$.subscribe((mode) => {
      this.caisseMode = mode === 'black' ? 'black' : 'declaree';
      this.isBlackMode = mode === 'black';
      this.currentPage = 1;
      this.loadNextNumero();
      this.loadDocuments();
    });

    const currentMode = this.caisseModeService.getCurrentMode();
    this.caisseMode = currentMode === 'black' ? 'black' : 'declaree';
    this.isBlackMode = currentMode === 'black';

    this.initForm();
    this.loadCurrentUser();
    this.loadLookups();
    this.loadNextNumero();
    this.loadDocuments();
  }

  ngOnDestroy(): void {
    this.caisseModeSubscription?.unsubscribe();
    this.currentUserSubscription?.unsubscribe();
    this.restoreSidebarAfterDetail();
  }

  private initForm(): void {
    this.journeeForm = this.fb.group({
      date: [this.getTodayInputDate(), Validators.required],
      description: [this.buildJourneeDescription(this.getTodayInputDate()), Validators.required],
      fond: [0, [Validators.required, Validators.min(0)]],
      affectation: [this.currentUserName || '', Validators.required]
    });
  }

  private loadCurrentUser(): void {
    this.currentUserSubscription = this.authService.currentUser$.subscribe((user) => {
      if (user?.nom) {
        this.currentUserName = user.nom;
        this.journeeForm?.patchValue({ affectation: this.currentUserName });
      }
    });
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
        this.totalRecords = response?.pagination?.total || 0;
        this.totalPages = response?.pagination?.totalPages || 0;
        this.applyClientFilters();
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

  loadNextNumero(): void {
    const prefix = this.isBlackMode ? 'JCB' : 'JC';
    this.caisseService.getNextCaisseNumero(prefix).subscribe({
      next: (response: any) => {
        this.nextNumero = response?.numero || '';
      },
      error: () => {
        const anneeCourte = new Date().getFullYear().toString().slice(2);
        this.nextNumero = `${prefix}${anneeCourte}-0001`;
      }
    });
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

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  onFilterChange(): void {
    this.applyClientFilters();
  }

  resetFilters(): void {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterSoldeMin = null;
    this.filterSoldeMax = null;
    this.searchTerm = '';
    this.currentPage = 1;
    this.loadDocuments();
  }

  applyClientFilters(): void {
    let filtered = [...this.documents];

    if (this.filterDateFrom) {
      filtered = filtered.filter((doc) => this.toDateOnly(doc.date) >= this.filterDateFrom);
    }

    if (this.filterDateTo) {
      filtered = filtered.filter((doc) => this.toDateOnly(doc.date) <= this.filterDateTo);
    }

    if (this.filterSoldeMin !== null && this.filterSoldeMin !== undefined) {
      filtered = filtered.filter((doc) => this.getDocumentSolde(doc) >= this.filterSoldeMin!);
    }

    if (this.filterSoldeMax !== null && this.filterSoldeMax !== undefined) {
      filtered = filtered.filter((doc) => this.getDocumentSolde(doc) <= this.filterSoldeMax!);
    }

    this.filteredDocuments = filtered;
  }

  getPaginatedDocuments(): any[] {
    return this.filteredDocuments;
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPages = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPages / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPages - 1);

    if (endPage - startPage < maxPages - 1) {
      startPage = Math.max(1, endPage - maxPages + 1);
    }

    for (let page = startPage; page <= endPage; page++) {
      pages.push(page);
    }

    return pages;
  }

  getDisplayRange(): string {
    if (this.filteredDocuments.length === 0) {
      return '0';
    }

    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = start + this.filteredDocuments.length - 1;
    return `${start} - ${end}`;
  }

  exportToCSV(): void {
    const headers = ['Numero', 'Date', 'Description', 'Fond de caisse', 'Recettes', 'Depenses', 'Solde net', 'Etat'];
    const rows = this.filteredDocuments.map((doc) => [
      doc.numero || '',
      doc.date ? new Date(doc.date).toLocaleDateString('fr-FR') : '',
      doc.description || '',
      this.getDocumentFond(doc),
      this.getDocumentRecettes(doc),
      this.getDocumentDepenses(doc),
      this.getDocumentSolde(doc),
      this.getEtatLabel(doc)
    ]);

    let csvContent = `${headers.join(';')}\n`;
    rows.forEach((row) => {
      csvContent += `${row.join(';')}\n`;
    });

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `recette_depense_${this.getTodayInputDate()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  onSubmitJournee(): void {
    if (!this.journeeForm.valid) {
      Swal.fire('Erreur de validation', 'Veuillez remplir tous les champs requis.', 'error');
      return;
    }

    const formValue = this.journeeForm.value;
    const documentData = {
      date: formValue.date,
      description: this.buildJourneeDescription(formValue.date),
      fond: Number(formValue.fond) || 0,
      affectation: formValue.affectation || this.currentUserName,
      etat: null,
      type: this.caisseMode === 'black' ? 2 : null
    };

    this.caisseService.createCaisseDocument(documentData, []).subscribe({
      next: (response: any) => {
        if (response?.success) {
          Swal.fire('Succes', 'La journee a ete creee avec succes.', 'success');
          this.closeCreateModal();
          this.resetJourneeForm();
          this.loadNextNumero();
          this.loadDocuments();
        } else {
          Swal.fire('Attention', response?.message || 'Reponse inattendue lors de la creation.', 'warning');
        }
      },
      error: (error) => {
        const message = error.error?.message || error.message || 'Erreur lors de la creation de la journee';
        Swal.fire('Erreur', message, 'error');
      }
    });
  }

  openDocument(doc: any): void {
    if (!doc?.id) {
      return;
    }

    this.router.navigate(['/Edit-Depense-Recette', doc.id]);
  }

  toggleDetailMode(): void {
    if (this.detailMode) {
      this.closeDetailView();
      return;
    }

    const fallbackDocument = this.selectedDocument || this.filteredDocuments[0] || this.documents[0];
    if (fallbackDocument?.id) {
      this.openDocument(fallbackDocument);
      return;
    }

    this.enterDetailMode();
  }

  loadDocumentDetails(id: number): void {
    this.caisseService.getCaisseDocumentById(id).subscribe({
      next: (response: any) => {
        this.loadingDetail = false;

        if (response?.success && response.data) {
          this.selectedDocument = this.normalizeDocument(response.data);
          const details = Array.isArray(response.data.details) ? response.data.details : [];
          const normalizedDetails = details.map((detail: any) => this.normalizeDetail(detail));

          this.recetteDetails = normalizedDetails.filter((detail: any) => detail.sens === 1);
          this.depenseDetails = normalizedDetails.filter((detail: any) => detail.sens === -1);
        } else {
          this.recetteDetails = [];
          this.depenseDetails = [];
        }
      },
      error: (error) => {
        this.loadingDetail = false;
        this.recetteDetails = [];
        this.depenseDetails = [];
        Swal.fire('Erreur', error.error?.message || 'Erreur lors du chargement de la journee', 'error');
      }
    });
  }

  closeDetailView(): void {
    this.detailMode = false;
    this.loadingDetail = false;
    this.restoreSidebarAfterDetail();
  }

  closeEditModal(): void {
    this.editModalVisible = false;
    this.closeDetailView();
  }

  addRecetteLine(): void {
    this.recetteDetails.push(this.createEmptyDetail(1));
  }

  addDepenseLine(): void {
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
    const rubriques = detail.sens === 1 ? this.rubriquesRecettes : this.rubriquesDepenses;
    const rubrique = rubriques.find((item) => Number(item.id) === Number(detail.rubrique_id));
    if (rubrique && !detail.description) {
      detail.description = rubrique.nom;
    }
  }

  saveCaisseDetails(): void {
    if (!this.selectedDocument) {
      return;
    }

    const validDetails = [...this.recetteDetails, ...this.depenseDetails]
      .filter((detail) => this.isDetailMeaningful(detail))
      .map((detail) => ({
        ...detail,
        rubrique_id: detail.rubrique_id ? Number(detail.rubrique_id) : null,
        employe_id: detail.employe_id ? Number(detail.employe_id) : null,
        quantite: Number(detail.quantite) || 0,
        montant: Number(detail.montant) || 0,
        sens: detail.sens === -1 ? -1 : 1
      }));

    const documentData = {
      description: this.selectedDocument.description,
      affectation: this.selectedDocument.affectation,
      fond: Number(this.selectedDocument.fond) || 0
    };

    this.caisseService.updateCaisseDocument(this.selectedDocument.id, documentData, validDetails).subscribe({
      next: (response: any) => {
        if (response?.success) {
          Swal.fire('Succes', 'La journee a ete mise a jour avec succes.', 'success');
          this.loadDocumentDetails(this.selectedDocument.id);
          this.loadDocuments();
        } else {
          Swal.fire('Erreur', response?.message || 'Erreur lors de la sauvegarde.', 'error');
        }
      },
      error: (error) => {
        Swal.fire('Erreur', error.error?.message || 'Erreur lors de la modification', 'error');
      }
    });
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
            if (this.selectedDocument?.id === doc.id) {
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
          window.open(response.pdfUrl, '_blank');
        } else {
          Swal.fire('Erreur', 'Erreur lors de la generation du PDF.', 'error');
        }
      },
      error: (error) => {
        Swal.fire('Erreur', error.error?.message || 'Erreur lors de la generation du PDF', 'error');
      }
    });
  }

  printCaisseByEmploye(employeId: number | null, sens: number): void {
    if (!this.selectedDocument) {
      Swal.fire('Erreur', 'Aucune journee selectionnee.', 'error');
      return;
    }

    if (!employeId) {
      Swal.fire('Erreur', 'Veuillez selectionner un employe avant d imprimer.', 'error');
      return;
    }

    Swal.fire({
      title: 'Generation du PDF...',
      text: 'Veuillez patienter',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    this.caisseService.generateCaissePDFByEmploye(this.selectedDocument.id, employeId, sens).subscribe({
      next: (response: any) => {
        Swal.close();
        if (response?.success && response.pdfUrl) {
          window.open(response.pdfUrl, '_blank');
        } else {
          Swal.fire('Erreur', 'Erreur lors de la generation du PDF.', 'error');
        }
      },
      error: (error) => {
        Swal.fire('Erreur', error.error?.message || 'Erreur lors de la generation du PDF', 'error');
      }
    });
  }

  sendTelegramByEmploye(employeId: number | null, sens: number): void {
    if (!this.selectedDocument) {
      Swal.fire('Erreur', 'Aucune journee selectionnee.', 'error');
      return;
    }

    if (!employeId) {
      Swal.fire('Erreur', 'Veuillez selectionner un employe avant l envoi.', 'error');
      return;
    }

    const employe = this.employes.find((item) => Number(item.id) === Number(employeId));
    const telegramId = employe?.telegram_id;

    if (telegramId) {
      this.sendTelegramWithChatId(employeId, telegramId, sens);
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
        if (!/^-?\\d+$/.test(value)) {
          return 'Le Chat ID doit etre un nombre.';
        }
        return null;
      }
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        this.sendTelegramWithChatId(employeId, result.value, sens);
      }
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

  isCaisseOuverte(doc: any): boolean {
    return doc?.etat === null || doc?.etat === undefined || doc?.etat === '' || doc?.etat === 'OUVERT';
  }

  isSelectedDocumentEditable(): boolean {
    return this.isCaisseOuverte(this.selectedDocument);
  }

  isActiveDocument(doc: any): boolean {
    return Number(this.selectedDocument?.id || 0) === Number(doc?.id || -1);
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

  getDocumentRecettes(doc: any): number {
    return Number(doc?.total_recettes || 0);
  }

  getDocumentDepenses(doc: any): number {
    return Number(doc?.total_depenses || 0);
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

  getTodayInputDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  toInputDate(value: any): string {
    if (!value) {
      return '';
    }
    const text = String(value);
    return text.includes('T') ? text.split('T')[0] : text;
  }

  onCreateModalShow(): void {
    this.loadNextNumero();
    this.resetJourneeForm();
  }

  closeCreateModal(): void {
    const modalElement = document.getElementById('addJourneeModal');
    if (modalElement) {
      const anyWindow = window as any;
      if (typeof $ !== 'undefined' && typeof ($.fn as any).modal !== 'undefined') {
        $('#addJourneeModal').modal('hide');
      } else if (anyWindow.bootstrap) {
        const modal = anyWindow.bootstrap.Modal.getInstance(modalElement);
        modal?.hide();
      }
    }
    this.nextNumero = '';
    this.resetJourneeForm();
  }

  onJourneeDateChange(): void {
    const dateValue = this.journeeForm?.get('date')?.value;
    this.journeeForm?.patchValue({
      description: this.buildJourneeDescription(dateValue)
    }, { emitEvent: false });
  }

  private enterDetailMode(): void {
    if (!this.detailMode) {
      this.sidebarStateBeforeDetailMode = this.isSidebarHidden();
    }
    this.detailMode = true;
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
      sens: detail?.sens === -1 ? -1 : 1,
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
      detail?.description ||
      ((Number(detail?.quantite) || 0) > 0 && (Number(detail?.montant) || 0) > 0)
    );
  }

  private toDateOnly(value: any): string {
    const text = this.toInputDate(value);
    return text || '';
  }

  private resetJourneeForm(): void {
    if (!this.journeeForm) {
      return;
    }

    const date = this.getTodayInputDate();
    this.journeeForm.reset({
      date,
      description: this.buildJourneeDescription(date),
      fond: 0,
      affectation: this.currentUserName || ''
    });
  }

  private buildJourneeDescription(dateValue: string | null | undefined): string {
    const descriptionDate = this.buildJourneeDateTime(dateValue);
    const formatted = new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(descriptionDate);

    return `Journee de la date ${formatted}`;
  }

  private buildJourneeDateTime(dateValue: string | null | undefined): Date {
    const now = new Date();
    const result = new Date(now);

    if (dateValue) {
      const [year, month, day] = String(dateValue).split('-').map((value) => Number(value));
      if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
        result.setFullYear(year, month - 1, day);
      }
    }

    return result;
  }
}
