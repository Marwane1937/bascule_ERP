import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AchatsService } from 'src/app/service/achats.service';
import { BaseService } from 'src/app/service/base.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-reception',
  templateUrl: './reception.component.html',
  styleUrls: ['./reception.component.css']
})
export class ReceptionComponent implements OnInit, OnDestroy {
  // Liste réceptions (stock.type = 1)
  receptions: any[] = [];
  allReceptions: any[] = [];
  loadingReceptions = true;

  // Pagination / recherche
  currentPage = 1;
  pageSize = 25;
  totalRecords = 0;
  totalPages = 1;
  searchTerm = '';
  sortColumn = 'date';
  sortDirection: 'ASC' | 'DESC' = 'DESC';
  fournisseurColumnWidth = 140;
  showFilterRow = false;
  columnFilters: any = {
    numero: '',
    date: '',
    fournisseur: '',
    total_ht: '',
    total_tva: '',
    total_ttc: '',
    statut: ''
  };

  loadingCommandes = false;
  showTransfertModal = false;

  commandesNonReceptionnees: any[] = [];
  commandesNonReceptionneesFiltered: any[] = [];
  modalSearchTerm = '';
  modalCurrentPage = 1;
  modalPageSize = 10;
  modalTotalPages = 1;
  commandesNonReceptionneesPaged: any[] = [];

  // Edition commande dans le popup
  selectedCommande: any | null = null;
  commandeDetails: any[] = [];
  loadingDetails = false;
  depots: any[] = [];
  detailSearchTerm = '';
  detailSortColumn: 'article' | 'depot' | 'lot' | 'quantite' | 'prix' = 'article';
  detailSortDirection: 'asc' | 'desc' = 'asc';

  // Dashboard
  showDashboard: boolean = false;
  dashboardLoading: boolean = false;
  dashboardStats: any = {
    totalReceptions: 0,
    totalFournisseurs: 0,
    totalMontantHT: 0,
    totalMontantTTC: 0,
    totalTVA: 0,
    prixMoyenAchat: 0,
    chiffreAffaireParFournisseur: [],
    chiffreAffaireParArticle: []
  };
  showReceptionHistoryModal = false;
  receptionHistoryLoading = false;
  receptionHistoryError = '';
  selectedReceptionHistory: any | null = null;
  
  // Charts
  evolutionChart: any = null;
  fournisseurChart: any = null;
  topFournisseursChart: any = null;
  articleChart: any = null;
  private resizingFournisseur = false;
  private fournisseurResizeStartX = 0;
  private fournisseurResizeStartWidth = 140;

  constructor(
    private achatsService: AchatsService,
    private baseService: BaseService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loadReceptions(1, '');
    this.loadDepots();
  }

  loadDepots(): void {
    this.baseService.getDepots().subscribe({
      next: (response: any) => {
        const data = response?.data || (Array.isArray(response) ? response : []);
        this.depots = Array.isArray(data) ? data : [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.depots = [];
        this.cdr.detectChanges();
      }
    });
  }

  loadReceptions(page: number = 1, search: string = ''): void {
    this.loadingReceptions = true;
    this.currentPage = page;
    this.searchTerm = search;

    this.achatsService.getReceptions({
      page,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search
    }).subscribe({
      next: (response: any) => {
        const data = response?.data || [];
        const pagination = response?.pagination || {};
        this.allReceptions = Array.isArray(data) ? data : [];
        this.receptions = [...this.allReceptions];
        this.applyReceptionColumnFilters(false);
        this.totalRecords = pagination.total || this.receptions.length || 0;
        this.totalPages = pagination.totalPages || 1;
        this.loadingReceptions = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loadingReceptions = false;
        this.allReceptions = [];
        this.receptions = [];
        this.totalRecords = 0;
        this.totalPages = 1;
        this.cdr.detectChanges();
        Swal.fire('Erreur', err.error?.message || 'Erreur lors du chargement des réceptions.', 'error');
      }
    });
  }

  onSearch(): void {
    this.loadReceptions(1, this.searchTerm);
  }

  setReceptionSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'ASC';
    }

    this.loadReceptions(1, this.searchTerm);
  }

  getReceptionSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort text-muted';
    }
    return this.sortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  onReceptionColumnFilterChange(column: string, value: string): void {
    this.columnFilters[column] = value;
    this.applyReceptionColumnFilters();
  }

  applyReceptionColumnFilters(updateTotal: boolean = true): void {
    const filtered = this.allReceptions.filter((item: any) => {
      return Object.keys(this.columnFilters).every((key) => {
        const filterValue = String(this.columnFilters[key] || '').trim().toLowerCase();
        if (!filterValue) {
          return true;
        }

        const itemValue = this.getReceptionFilterValue(item, key);
        return String(itemValue || '').toLowerCase().includes(filterValue);
      });
    });

    this.receptions = filtered;
    if (updateTotal) {
      this.totalRecords = filtered.length;
    }
  }

  clearReceptionColumnFilters(): void {
    this.columnFilters = {
      numero: '',
      date: '',
      fournisseur: '',
      total_ht: '',
      total_tva: '',
      total_ttc: '',
      statut: ''
    };
    this.applyReceptionColumnFilters();
  }

  getReceptionStatus(reception: any): string {
    const rawStatus = reception?.statut ?? reception?.status ?? reception?.etat;
    if (rawStatus === 0 || rawStatus === '0') {
      return 'Archivé';
    }
    return 'Réceptionné';
  }

  private getReceptionFilterValue(item: any, key: string): string | number {
    switch (key) {
      case 'date':
        return item?.date ? new Date(item.date).toISOString().slice(0, 10) : '';
      case 'statut':
        return this.getReceptionStatus(item);
      default:
        return item?.[key] ?? '';
    }
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.loadReceptions(page, this.searchTerm);
    }
  }

  onPageSizeChange(event: any): void {
    const newSize = parseInt(event?.target?.value, 10);
    if (newSize > 0) {
      this.pageSize = newSize;
      this.loadReceptions(1, this.searchTerm);
    }
  }

  startFournisseurResize(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.resizingFournisseur = true;
    this.fournisseurResizeStartX = event.clientX;
    this.fournisseurResizeStartWidth = this.fournisseurColumnWidth;
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent): void {
    if (!this.resizingFournisseur) return;
    const delta = event.clientX - this.fournisseurResizeStartX;
    this.fournisseurColumnWidth = Math.min(320, Math.max(110, this.fournisseurResizeStartWidth + delta));
    this.cdr.detectChanges();
  }

  @HostListener('window:mouseup')
  onWindowMouseUp(): void {
    this.resizingFournisseur = false;
  }

  openTransfertModal(): void {
    this.showTransfertModal = true;
    this.modalSearchTerm = '';
    this.modalCurrentPage = 1;
    this.selectedCommande = null;
    this.commandeDetails = [];
    this.loadCommandesNonReceptionnees();
  }

  closeTransfertModal(): void {
    this.showTransfertModal = false;
    this.commandesNonReceptionnees = [];
    this.commandesNonReceptionneesFiltered = [];
    this.commandesNonReceptionneesPaged = [];
    this.modalCurrentPage = 1;
    this.modalTotalPages = 1;
    this.selectedCommande = null;
    this.commandeDetails = [];
    this.cdr.detectChanges();
  }

  loadCommandesNonReceptionnees(): void {
    this.loadingCommandes = true;
    this.achatsService.getCommandesNonReceptionnees().subscribe({
      next: (response: any) => {
        const data = response?.data || [];
        this.commandesNonReceptionnees = Array.isArray(data) ? data : [];
        this.modalCurrentPage = 1;
        this.applyModalFilter();
        this.loadingCommandes = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loadingCommandes = false;
        this.commandesNonReceptionnees = [];
        this.commandesNonReceptionneesFiltered = [];
        Swal.fire('Erreur', err.error?.message || 'Erreur lors du chargement des commandes.', 'error');
        this.cdr.detectChanges();
      }
    });
  }

  applyModalFilter(): void {
    const term = (this.modalSearchTerm || '').trim().toLowerCase();
    if (!term) {
      this.commandesNonReceptionneesFiltered = [...this.commandesNonReceptionnees];
      this.applyModalPagination();
      return;
    }
    this.commandesNonReceptionneesFiltered = this.commandesNonReceptionnees.filter((c: any) => {
      const numero = String(c.numero || '').toLowerCase();
      const fournisseur = String(c.fournisseur || '').toLowerCase();
      return numero.includes(term) || fournisseur.includes(term);
    });
    this.applyModalPagination();
  }

  applyModalPagination(): void {
    const total = this.commandesNonReceptionneesFiltered.length || 0;
    this.modalTotalPages = Math.max(1, Math.ceil(total / this.modalPageSize));
    if (this.modalCurrentPage > this.modalTotalPages) {
      this.modalCurrentPage = this.modalTotalPages;
    }
    const start = (this.modalCurrentPage - 1) * this.modalPageSize;
    const end = start + this.modalPageSize;
    this.commandesNonReceptionneesPaged = this.commandesNonReceptionneesFiltered.slice(start, end);
  }

  // Pagination UI (comme Client)
  getModalPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.modalCurrentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.modalTotalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) pages.push(i);
    return pages;
  }

  getModalDisplayRange(): string {
    const total = this.commandesNonReceptionneesFiltered.length || 0;
    if (total === 0) return '0 à 0';
    const start = ((this.modalCurrentPage - 1) * this.modalPageSize) + 1;
    const end = Math.min(this.modalCurrentPage * this.modalPageSize, total);
    return `${start} à ${end}`;
  }

  onModalPageChange(page: number): void {
    if (page >= 1 && page <= this.modalTotalPages && page !== this.modalCurrentPage) {
      this.modalCurrentPage = page;
      this.applyModalPagination();
    }
  }

  onModalPageSizeChange(event: any): void {
    const newSize = parseInt(event?.target?.value, 10);
    if (newSize > 0) {
      this.modalPageSize = newSize;
      this.modalCurrentPage = 1;
      this.applyModalPagination();
    }
  }

  selectCommandeForEdit(commande: any): void {
    this.selectedCommande = commande;
    this.commandeDetails = [];
    this.detailSearchTerm = '';
    this.detailSortColumn = 'article';
    this.detailSortDirection = 'asc';
    this.loadingDetails = true;
    this.cdr.detectChanges();

    this.achatsService.getBonCommandeById(commande.document_id).subscribe({
      next: (response: any) => {
        const data = response?.data || response;
        const details = data?.details || [];
        this.commandeDetails = Array.isArray(details) ? details.map((d: any) => ({
          source_detail_id: d.id,
          article_nom: d.article_nom || '',
          article_cod: d.article_cod || '',
          article_id: d.article_id,
          quantite_commandee: +(d.quantite_commandee ?? d.quantite ?? 0),
          quantite_receptionnee: +(d.quantite_receptionnee ?? 0),
          quantite_restante: +(d.quantite_restante ?? d.quantite ?? 0),
          quantite: +(d.quantite_restante ?? d.quantite ?? 0),
          prix: +d.prix,
          taux_tva: d.taux_tva != null ? +d.taux_tva : 0,
          // Désignation: bon-commande backend normalise `designation` (depuis quill ou description)
          // fallback sur description si nécessaire
          description: d.designation || d.description || '',
          remise: d.remise != null ? +d.remise : 0,
          remise_montant: d.remise_montant != null ? +d.remise_montant : 0,
          etat: Number(d?.etat || 0),
          depot_id: this.normalizeDepotId(d?.depot_id ?? d?.adresse_id),
          numero_lot: d.numero_lot || d.serie || ''
        })) : [];

        this.loadingDetails = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loadingDetails = false;
        this.commandeDetails = [];
        this.cdr.detectChanges();
        Swal.fire('Erreur', err.error?.message || 'Impossible de charger les détails de la commande.', 'error');
      }
    });
  }

  validateReceptionFromEditedCommande(): void {
    if (!this.selectedCommande) {
      Swal.fire('Info', 'Veuillez sélectionner une commande à réceptionner.', 'info');
      return;
    }
    if (!this.commandeDetails || this.commandeDetails.length === 0) {
      Swal.fire('Info', 'Aucune ligne à réceptionner.', 'info');
      return;
    }
    const linesToReceive = this.commandeDetails.filter((line: any) => {
      if (this.isReceptionCompleteLine(line)) return false;
      if (Number(line?.quantite || 0) <= 0) return false;
      return !!this.normalizeDepotId(line?.depot_id);
    });

    if (!linesToReceive.length) {
      Swal.fire('Info', 'Aucune ligne valide a receptionner.', 'info');
      return;
    }

    for (let i = 0; i < linesToReceive.length; i++) {
      const line = linesToReceive[i];
      const lineDepotId = this.normalizeDepotId(line?.depot_id);
      if (Number(line?.quantite || 0) > Number(line?.quantite_restante || 0)) {
        Swal.fire('Quantite invalide', `La ligne ${i + 1} depasse la quantite restante a receptionner.`, 'warning');
        return;
      }
      line.depot_id = lineDepotId;
    }

    Swal.fire({
      title: 'Valider la réception ?',
      text: 'Les lignes modifiées seront utilisées pour créer la réception (sans modifier la commande).',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Oui, valider',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (!result.isConfirmed) return;

      Swal.fire({
        title: 'Création en cours...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      this.achatsService.createReceptionFromCommande(this.selectedCommande.document_id, linesToReceive).subscribe({
        next: (response: any) => {
          Swal.fire({
            icon: 'success',
            title: 'Réception créée !',
            text: `Réception ${response?.data?.numero || ''} créée avec succès.`
          });
          this.loadReceptions(1, this.searchTerm);
          this.loadCommandesNonReceptionnees();
          this.selectedCommande = null;
          this.commandeDetails = [];
          this.cdr.detectChanges();
        },
        error: (err) => {
          Swal.fire('Erreur', err.error?.message || 'Impossible de créer la réception.', 'error');
        }
      });
    });
  }

  private normalizeDepotId(value: any): number | null {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  isReceptionCompleteLine(line: any): boolean {
    return Number(line?.quantite_restante || 0) <= 0 || Number(line?.etat || 0) === 1;
  }

  isReceptionPartialLine(line: any): boolean {
    return Number(line?.quantite_receptionnee || 0) > 0 && !this.isReceptionCompleteLine(line);
  }

  get filteredCommandeDetails(): any[] {
    const term = this.normalizeText(this.detailSearchTerm);
    const filtered = !term
      ? [...this.commandeDetails]
      : this.commandeDetails.filter((line: any) => {
          const depotName = this.getDepotName(line?.depot_id);
          const haystacks = [
            line?.article_cod,
            line?.article_nom,
            line?.description,
            line?.numero_lot,
            depotName
          ];
          return haystacks.some(value => this.normalizeText(value).includes(term));
        });

    return filtered.sort((a: any, b: any) => {
      const left = this.getDetailSortValue(a, this.detailSortColumn);
      const right = this.getDetailSortValue(b, this.detailSortColumn);

      if (typeof left === 'number' || typeof right === 'number') {
        const leftNum = Number(left) || 0;
        const rightNum = Number(right) || 0;
        return this.detailSortDirection === 'asc' ? leftNum - rightNum : rightNum - leftNum;
      }

      const compare = String(left).localeCompare(String(right), 'fr', { sensitivity: 'base' });
      return this.detailSortDirection === 'asc' ? compare : -compare;
    });
  }

  setDetailSort(column: 'article' | 'depot' | 'lot' | 'quantite' | 'prix'): void {
    if (this.detailSortColumn === column) {
      this.detailSortDirection = this.detailSortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }

    this.detailSortColumn = column;
    this.detailSortDirection = 'asc';
  }

  getDetailSortIcon(column: 'article' | 'depot' | 'lot' | 'quantite' | 'prix'): string {
    if (this.detailSortColumn !== column) {
      return 'fa-sort text-muted';
    }
    return this.detailSortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
  }

  getDepotName(depotId: any): string {
    const normalizedId = this.normalizeDepotId(depotId);
    if (!normalizedId) {
      return '';
    }
    const depot = this.depots.find((item: any) => Number(item?.id) === normalizedId);
    return String(depot?.nom || '');
  }

  private getDetailSortValue(line: any, column: 'article' | 'depot' | 'lot' | 'quantite' | 'prix'): string | number {
    switch (column) {
      case 'depot':
        return this.getDepotName(line?.depot_id);
      case 'lot':
        return line?.numero_lot || '';
      case 'quantite':
        return Number(line?.quantite) || 0;
      case 'prix':
        return Number(line?.prix) || 0;
      case 'article':
      default:
        return `${line?.article_cod || ''} ${line?.article_nom || ''} ${line?.description || ''}`.trim();
    }
  }

  private normalizeText(value: any): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  transfererCommandeVersReception(commandeId: number, numero?: string): void {
    Swal.fire({
      title: 'Créer une réception ?',
      text: `Cette commande sera transformée en réception (entrée stock).`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Oui, créer la réception',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (!result.isConfirmed) return;

      Swal.fire({
        title: 'Création en cours...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      this.achatsService.createReceptionFromCommande(commandeId).subscribe({
        next: (response: any) => {
          Swal.fire({
            icon: 'success',
            title: 'Réception créée !',
            text: `Réception ${response?.data?.numero || ''} créée avec succès.`
          });
          this.loadCommandesNonReceptionnees();
          this.loadReceptions(1, this.searchTerm);
        },
        error: (err) => {
          Swal.fire('Erreur', err.error?.message || `Impossible de créer la réception pour ${numero || 'cette commande'}.`, 'error');
        }
      });
    });
  }

  editReception(documentId: number): void {
    this.router.navigate(['/Edit-Reception', documentId]);
  }

  openReceptionHistory(reception: any): void {
    const documentId = Number(reception?.document_id || reception?.id || 0);
    if (!documentId) {
      return;
    }

    this.showReceptionHistoryModal = true;
    this.receptionHistoryLoading = true;
    this.receptionHistoryError = '';
    this.selectedReceptionHistory = null;

    this.achatsService.getReceptionById(documentId).subscribe({
      next: (response: any) => {
        this.selectedReceptionHistory = response?.data || response || null;
        this.receptionHistoryLoading = false;
        this.cdr.detectChanges();
      },
      error: (error: any) => {
        this.receptionHistoryLoading = false;
        this.receptionHistoryError = error?.error?.message || 'Impossible de charger l historique de cette reception.';
        this.cdr.detectChanges();
      }
    });
  }

  closeReceptionHistory(): void {
    this.showReceptionHistoryModal = false;
    this.receptionHistoryLoading = false;
    this.receptionHistoryError = '';
    this.selectedReceptionHistory = null;
  }

  getReceptionHistorySourceLabel(history: any): string {
    const sourceType = String(history?.source_document_type || '').toUpperCase();
    if (sourceType === 'BON_COMMANDE') {
      return 'Bon de commande';
    }
    if (sourceType === 'ENTREE_STOCK') {
      return 'Entree de stock';
    }
    return 'Source';
  }

  openReceptionHistorySource(): void {
    const history = this.selectedReceptionHistory;
    const sourceId = Number(history?.source_document_id || 0);
    const sourceType = String(history?.source_document_type || '').toUpperCase();

    if (!sourceId) {
      return;
    }

    this.closeReceptionHistory();

    if (sourceType === 'BON_COMMANDE') {
      this.router.navigate(['/Edit-Bon-Commande-Achat', sourceId]);
      return;
    }

    if (sourceType === 'ENTREE_STOCK') {
      this.router.navigate(['/Edit-EntreeStock', sourceId]);
    }
  }

  deleteReception(documentId: number, numero: string): void {
    Swal.fire({
      title: 'Supprimer la réception ?',
      text: `Êtes-vous sûr de vouloir supprimer la réception ${numero} ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (!result.isConfirmed) return;

      Swal.fire({
        title: 'Suppression en cours...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      this.achatsService.deleteReception(documentId).subscribe({
        next: (response: any) => {
          Swal.fire({
            icon: 'success',
            title: 'Réception supprimée !',
            text: response?.message || 'La réception a été supprimée avec succès.'
          });
          this.loadReceptions(this.currentPage, this.searchTerm);
        },
        error: (err) => {
          Swal.fire('Erreur', err.error?.message || 'Impossible de supprimer la réception.', 'error');
        }
      });
    });
  }

  imprimerReceptionPDF(documentId: number): void {
    Swal.fire({
      title: 'Génération du PDF...',
      html: '<div class="spinner-border text-primary" role="status"></div><p>Veuillez patienter</p>',
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading()
    });

    this.achatsService.generateReceptionPDF(documentId).subscribe({
      next: (res) => {
        Swal.close();
        const url = res?.pdfUrl;
        if (url) {
          window.open(url, '_blank');
        } else {
          Swal.fire({ icon: 'error', title: 'Erreur', text: 'Lien PDF non reçu.' });
        }
      },
      error: (err) => {
        Swal.close();
        console.error('Erreur génération PDF réception:', err);
        const errorMessage = err.error?.message || err.message || "Erreur lors de la génération du PDF.";
        
        // Si c'est une erreur d'authentification, suggérer de se reconnecter
        if (errorMessage.includes('Token') || errorMessage.includes('accès') || err.status === 401) {
          Swal.fire({
            icon: 'error',
            title: 'Erreur d\'authentification',
            text: 'Votre session a peut-être expiré. Veuillez vous reconnecter.',
            confirmButtonText: 'OK'
          });
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Erreur',
            text: errorMessage
          });
        }
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

  loadDashboardStats(): void {
    this.dashboardLoading = true;
    
    // Charger toutes les réceptions pour calculer les statistiques
    this.achatsService.getReceptions({
      page: 1,
      pageSize: 10000, // Charger toutes les réceptions
      orderBy: 'date',
      orderDirection: 'DESC',
      search: ''
    }).subscribe({
      next: (response: any) => {
        // Gérer différents formats de réponse
        let allReceptions = [];
        if (response && response.data && Array.isArray(response.data)) {
          allReceptions = response.data;
        } else if (response && response.success && Array.isArray(response.data)) {
          allReceptions = response.data;
        } else if (Array.isArray(response)) {
          allReceptions = response;
        }
        
        // Charger les détails de chaque réception pour les statistiques par article
        this.loadReceptionsDetails(allReceptions);
      },
      error: (err: any) => {
        console.error('Erreur lors du chargement des statistiques:', err);
        this.dashboardLoading = false;
        Swal.fire('Erreur', 'Impossible de charger les statistiques du dashboard.', 'error');
      }
    });
  }

  loadReceptionsDetails(receptions: any[]): void {
    // Charger les détails de chaque réception
    const detailPromises = receptions.map((reception: any) => {
      const receptionId = reception.document_id || reception.id;
      if (!receptionId) {
        return Promise.resolve({ ...reception, details: [] });
      }
      
      return this.achatsService.getReceptionById(receptionId).toPromise().then(
        (response: any) => {
          const details = response?.details || response?.data?.details || [];
          return { ...reception, details: Array.isArray(details) ? details : [] };
        },
        () => ({ ...reception, details: [] })
      );
    });

    Promise.all(detailPromises).then((receptionsWithDetails: any[]) => {
      this.calculateDashboardStats(receptionsWithDetails);
      this.dashboardLoading = false;
    }).catch((err: any) => {
      console.error('Erreur lors du chargement des détails:', err);
      // Calculer les stats même sans détails
      this.calculateDashboardStats(receptions);
      this.dashboardLoading = false;
    });
  }

  calculateDashboardStats(receptions: any[]): void {
    // Calculer le total des réceptions
    this.dashboardStats.totalReceptions = receptions.length;

    // Calculer les totaux
    this.dashboardStats.totalMontantHT = receptions.reduce((sum, r) => {
      return sum + (parseFloat(r.total_ht) || 0);
    }, 0);

    this.dashboardStats.totalMontantTTC = receptions.reduce((sum, r) => {
      return sum + (parseFloat(r.total_ttc) || 0);
    }, 0);

    this.dashboardStats.totalTVA = receptions.reduce((sum, r) => {
      return sum + (parseFloat(r.total_tva) || 0);
    }, 0);

    // Calculer le prix moyen des achats
    const totalTTC = this.dashboardStats.totalMontantTTC;
    this.dashboardStats.prixMoyenAchat = receptions.length > 0 ? totalTTC / receptions.length : 0;

    // Calculer le chiffre d'affaire par fournisseur
    const fournisseurStats: { [key: string]: { fournisseur: string; chiffreAffaire: number; totalReceptions: number } } = {};
    
    receptions.forEach(r => {
      const fournisseurName = r.fournisseur || 'Non spécifié';
      if (!fournisseurStats[fournisseurName]) {
        fournisseurStats[fournisseurName] = {
          fournisseur: fournisseurName,
          chiffreAffaire: 0,
          totalReceptions: 0
        };
      }
      fournisseurStats[fournisseurName].chiffreAffaire += parseFloat(r.total_ttc) || 0;
      fournisseurStats[fournisseurName].totalReceptions += 1;
    });

    // Convertir en tableau et trier par chiffre d'affaire décroissant
    this.dashboardStats.chiffreAffaireParFournisseur = Object.values(fournisseurStats)
      .sort((a, b) => b.chiffreAffaire - a.chiffreAffaire);

    // Calculer le chiffre d'affaire par article
    const articleStats: { [key: string]: { article: string; chiffreAffaire: number; quantite: number; prixMoyen: number } } = {};
    
    receptions.forEach(r => {
      const details = r.details || [];
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

    // Convertir en tableau et trier par chiffre d'affaire décroissant
    this.dashboardStats.chiffreAffaireParArticle = Object.values(articleStats)
      .sort((a, b) => b.chiffreAffaire - a.chiffreAffaire);

    // Initialiser les graphiques après un court délai pour s'assurer que les canvas sont rendus
    setTimeout(() => {
      this.initCharts(receptions);
    }, 100);
  }

  initCharts(receptions: any[]): void {
    this.createEvolutionChart(receptions);
    this.createFournisseurChart(receptions);
    this.createTopFournisseursChart(receptions);
    this.createArticleChart(receptions);
  }

  createEvolutionChart(receptions: any[]): void {
    const canvas = document.getElementById('evolutionChartReception') as HTMLCanvasElement;
    if (!canvas) return;

    if (this.evolutionChart) {
      this.evolutionChart.destroy();
    }

    const monthlyData: { [key: string]: number } = {};
    receptions.forEach(r => {
      if (r.date) {
        const date = new Date(r.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[monthKey] = (monthlyData[monthKey] || 0) + (parseFloat(r.total_ttc) || 0);
      }
    });

    const sortedMonths = Object.keys(monthlyData).sort();
    const labels = sortedMonths.map(m => {
      const [year, month] = m.split('-');
      const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
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
          legend: { display: true, position: 'top' }
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

  createFournisseurChart(receptions: any[]): void {
    const canvas = document.getElementById('fournisseurChartReception') as HTMLCanvasElement;
    if (!canvas) return;

    if (this.fournisseurChart) {
      this.fournisseurChart.destroy();
    }

    const topFournisseurs = this.dashboardStats.chiffreAffaireParFournisseur.slice(0, 10);
    
    if (topFournisseurs.length === 0) {
      return;
    }

    const labels = topFournisseurs.map((f: any) => f.fournisseur);
    const data = topFournisseurs.map((f: any) => f.chiffreAffaire);
    const colors = [
      'rgba(255, 99, 132, 0.8)', 'rgba(54, 162, 235, 0.8)', 'rgba(255, 206, 86, 0.8)',
      'rgba(75, 192, 192, 0.8)', 'rgba(153, 102, 255, 0.8)', 'rgba(255, 159, 64, 0.8)',
      'rgba(199, 199, 199, 0.8)', 'rgba(83, 102, 255, 0.8)', 'rgba(255, 99, 255, 0.8)',
      'rgba(99, 255, 132, 0.8)'
    ];

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const Chart = (window as any).Chart;
    if (!Chart) return;

    this.fournisseurChart = new Chart(ctx, {
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
          legend: { display: true, position: 'right' },
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

  createTopFournisseursChart(receptions: any[]): void {
    const canvas = document.getElementById('topFournisseursChartReception') as HTMLCanvasElement;
    if (!canvas) return;

    if (this.topFournisseursChart) {
      this.topFournisseursChart.destroy();
    }

    const topFournisseurs = this.dashboardStats.chiffreAffaireParFournisseur.slice(0, 10);
    
    if (topFournisseurs.length === 0) {
      return;
    }

    const labels = topFournisseurs.map((f: any) => f.fournisseur);
    const data = topFournisseurs.map((f: any) => f.chiffreAffaire);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const Chart = (window as any).Chart;
    if (!Chart) return;

    this.topFournisseursChart = new Chart(ctx, {
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
          legend: { display: true, position: 'top' },
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

  createArticleChart(receptions: any[]): void {
    const canvas = document.getElementById('articleChartReception') as HTMLCanvasElement;
    if (!canvas) return;

    if (this.articleChart) {
      this.articleChart.destroy();
    }

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
          legend: { display: true, position: 'top' },
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
    // Détruire les graphiques
    if (this.evolutionChart) {
      this.evolutionChart.destroy();
    }
    if (this.fournisseurChart) {
      this.fournisseurChart.destroy();
    }
    if (this.topFournisseursChart) {
      this.topFournisseursChart.destroy();
    }
    if (this.articleChart) {
      this.articleChart.destroy();
    }
  }
}
