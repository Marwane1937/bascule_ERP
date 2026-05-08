import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';
import { AchatsService } from 'src/app/service/achats.service';

interface FactureFournisseurScanArticle {
  designation: string | null;
  quantite: number | null;
  prix_unitaire: number | null;
  total_ligne: number | null;
}

interface FactureFournisseurScanResult {
  fournisseur: string | null;
  ice: string | null;
  if: string | null;
  numero_facture: string | null;
  date_facture: string | null;
  total_ht: number | null;
  tva: number | null;
  total_ttc: number | null;
  devise: string | null;
  articles: FactureFournisseurScanArticle[];
}

interface ScanFileItem {
  file: File;
  previewUrl: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  message: string | null;
}

@Component({
  selector: 'app-facture-fournisseur',
  templateUrl: './facture-fournisseur.component.html',
  styleUrls: ['./facture-fournisseur.component.css']
})
export class FactureFournisseurComponent implements OnInit, OnDestroy {
  factures: any[] = [];
  loading = true;
  successMessage: string | null = null;
  isError = false;
  openActionMenuId: number | null = null;

  currentPage = 1;
  pageSize = 25;
  totalRecords = 0;
  totalPages = 0;
  searchTerm = '';

  sortColumn = 'facture_dat';
  sortDirection: 'ASC' | 'DESC' = 'DESC';

  showAdvancedFilters = false;
  filterDateFrom = '';
  filterDateTo = '';
  filterFournisseur = '';
  filterMontantMin: number | null = null;
  filterMontantMax: number | null = null;

  showTransfertModal = false;
  commandesNonFacturees: any[] = [];
  commandesNonFactureesFiltered: any[] = [];
  loadingCommandes = false;

  modalCurrentPage = 1;
  modalPageSize = 10;
  modalTotalPages = 1;
  modalSortColumn = 'date';
  modalSortDirection: 'ASC' | 'DESC' = 'DESC';
  modalSearchTerm = '';

  showScanModal = false;
  loadingScanAnalysis = false;
  savingScanToDatabase = false;
  selectedScanError: string | null = null;
  scanFiles: ScanFileItem[] = [];
  scanProgressCurrent = 0;
  scanProgressTotal = 0;
  scanProgressPercent = 0;
  scanProgressLabel = '';
  scanAnalysisResult: FactureFournisseurScanResult | null = null;
  scanAnalysisRawJson = '';

  constructor(
    private achatsService: AchatsService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadFactures(1, '', false);
  }

  ngOnDestroy(): void {
    this.revokeScanPreviewUrls();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeActionMenu();
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    this.closeActionMenu();
  }

  loadFactures(page: number = 1, search: string = '', resetFilters: boolean = false): void {
    this.loading = true;
    this.currentPage = page;
    this.searchTerm = search;

    if (resetFilters) {
      this.filterDateFrom = '';
      this.filterDateTo = '';
      this.filterFournisseur = '';
      this.filterMontantMin = null;
      this.filterMontantMax = null;
    }

    this.achatsService.getFacturesFournisseur({
      page,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search
    }).subscribe({
      next: (response: any) => {
        const result = response.data || [];
        const pagination = response.pagination || {};

        this.factures = Array.isArray(result) ? result : [];
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.showError("Erreur lors du chargement des factures fournisseur.");
        this.loading = false;
        this.factures = [];
        this.cdr.detectChanges();
      }
    });
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.loadFactures(page, this.searchTerm);
    }
  }

  onPageSizeChange(event: any): void {
    const newPageSize = parseInt(event.target.value, 10);
    if (newPageSize > 0) {
      this.pageSize = newPageSize;
      this.loadFactures(1, this.searchTerm);
    }
  }

  onSearch(): void {
    this.loadFactures(1, this.searchTerm);
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i += 1) {
      pages.push(i);
    }

    return pages;
  }

  getDisplayRange(): string {
    const start = ((this.currentPage - 1) * this.pageSize) + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `${start} à ${end}`;
  }

  showError(message: string): void {
    this.showNotification(message, true);
  }

  showNotification(message: string, isError: boolean = false): void {
    this.successMessage = message;
    this.isError = isError;
    setTimeout(() => { this.successMessage = null; }, 5000);
  }

  private getApiErrorMessage(err: any, fallbackMessage: string): string {
    if (typeof err?.error === 'string' && err.error.trim()) {
      return err.error.trim();
    }

    if (typeof err?.error?.message === 'string' && err.error.message.trim()) {
      return err.error.message.trim();
    }

    if (typeof err?.message === 'string' && err.message.trim()) {
      return err.message.trim();
    }

    return fallbackMessage;
  }

  private async getPdfErrorMessage(err: any, fallbackMessage: string): Promise<string> {
    if (err?.error instanceof Blob) {
      try {
        const text = await err.error.text();
        if (text) {
          const parsed = JSON.parse(text);
          if (typeof parsed?.message === 'string' && parsed.message.trim()) {
            return parsed.message.trim();
          }
          if (typeof parsed?.error === 'string' && parsed.error.trim()) {
            return parsed.error.trim();
          }
        }
      } catch {
        return fallbackMessage;
      }
    }

    return this.getApiErrorMessage(err, fallbackMessage);
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
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

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  onFilterChange(): void {
    this.loadFactures(this.currentPage, this.searchTerm);
  }

  resetFilters(): void {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterFournisseur = '';
    this.filterMontantMin = null;
    this.filterMontantMax = null;
    this.loadFactures(1, this.searchTerm, true);
  }

  exportToCSV(): void {
    const headers = ['Numéro', 'Date', 'Fournisseur', 'HT', 'TVA', 'TTC'];
    const rows = this.factures.map((f) => [
      f.facture_num || '',
      f.facture_dat ? new Date(f.facture_dat).toLocaleDateString('fr-FR') : '',
      f.fournisseur || '',
      (f.facture_ht || 0).toFixed(2),
      (f.facture_tva || 0).toFixed(2),
      ((f.facture_ht || 0) + (f.facture_tva || 0)).toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `factures_fournisseur_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.showNotification('Export CSV reussi.');
  }

  addFacture(): void {
    this.closeActionMenu();
    this.router.navigate(['/Ajout-Facture-Fournisseur']);
  }

  toggleActionMenu(factureId: number, event: MouseEvent): void {
    event.stopPropagation();
    this.openActionMenuId = this.openActionMenuId === factureId ? null : factureId;
  }

  closeActionMenu(): void {
    this.openActionMenuId = null;
  }

  editFacture(factureId: number): void {
    if (!factureId) {
      return;
    }
    this.closeActionMenu();
    this.router.navigate(['/Edit-Facture-Fournisseur', factureId]);
  }

  onPrintFacture(factureId: number): void {
    this.closeActionMenu();

    if (!factureId) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'ID de facture introuvable.' });
      return;
    }

    Swal.fire({
      title: 'Génération du PDF...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    this.achatsService.telechargerPDFFactureFournisseur(factureId).subscribe({
      next: (response: Blob) => {
        Swal.close();
        const file = new Blob([response], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(file);
        window.open(fileURL, '_blank');
      },
      error: async (err) => {
        Swal.close();
        const message = await this.getPdfErrorMessage(err, 'Erreur lors de la génération du PDF.');
        Swal.fire({ icon: 'error', title: 'Erreur', text: message });
      }
    });
  }

  deleteFacture(factureId: number): void {
    this.closeActionMenu();

    Swal.fire({
      title: 'Êtes-vous sûr ?',
      text: "Cette action est irréversible.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (!result.isConfirmed) {
        return;
      }

      this.achatsService.deleteFactureFournisseur(factureId).subscribe({
        next: () => {
          Swal.fire('Supprimé', 'La facture a été supprimée.', 'success');
          this.loadFactures(this.currentPage, this.searchTerm);
        },
        error: (err) => {
          Swal.fire('Erreur', this.getApiErrorMessage(err, 'Impossible de supprimer la facture.'), 'error');
        }
      });
    });
  }

  openScanModal(): void {
    this.showScanModal = true;
    this.resetScanState();
  }

  closeScanModal(): void {
    this.showScanModal = false;
    this.resetScanState();
  }

  onScanFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const files = Array.from(input?.files || []);

    this.selectedScanError = null;
    this.scanAnalysisResult = null;
    this.scanAnalysisRawJson = '';
    this.revokeScanPreviewUrls();
    this.scanFiles = [];

    if (!files.length) {
      return;
    }

    const invalidFile = files.find((file) => !file.type.startsWith('image/'));
    if (invalidFile) {
      this.selectedScanError = `Le fichier ${invalidFile.name} n'est pas une image valide.`;
      if (input) {
        input.value = '';
      }
      return;
    }

    this.scanFiles = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending',
      message: 'En attente'
    }));
  }

  async analyzeSelectedScan(): Promise<void> {
    if (!this.scanFiles.length) {
      this.selectedScanError = 'Aucune image selectionnee.';
      return;
    }

    this.loadingScanAnalysis = true;
    this.selectedScanError = null;
    this.scanAnalysisResult = null;
    this.scanAnalysisRawJson = '';
    this.scanProgressCurrent = 0;
    this.scanProgressTotal = this.scanFiles.length;
    this.scanProgressPercent = 0;
    this.scanProgressLabel = `0 / ${this.scanProgressTotal} image traitée`;

    this.scanFiles = this.scanFiles.map((item) => ({
      ...item,
      status: 'pending',
      message: 'En attente'
    }));

    const partialResults: FactureFournisseurScanResult[] = [];

    for (let index = 0; index < this.scanFiles.length; index += 1) {
      const currentItem = this.scanFiles[index];
      currentItem.status = 'processing';
      currentItem.message = 'Analyse en cours...';
      this.scanProgressLabel = `Analyse de ${currentItem.file.name}`;
      this.cdr.detectChanges();

      try {
        const response = await firstValueFrom(
          this.achatsService.analyzeFactureFournisseurScan(currentItem.file)
        );

        const result = response?.data || null;
        if (!result) {
          throw new Error("Aucun resultat d'analyse retourne.");
        }

        partialResults.push(result as FactureFournisseurScanResult);
        currentItem.status = 'success';
        currentItem.message = 'Analyse terminee';
        this.scanProgressCurrent = index + 1;
        this.scanProgressPercent = Math.round((this.scanProgressCurrent / this.scanProgressTotal) * 100);
        this.scanProgressLabel = `${this.scanProgressCurrent} / ${this.scanProgressTotal} image(s) traitée(s)`;
      } catch (err: any) {
        currentItem.status = 'error';
        currentItem.message = this.getApiErrorMessage(err, "Erreur lors de l'analyse.");
        this.selectedScanError = `Analyse interrompue sur ${currentItem.file.name}: ${currentItem.message}`;
        this.loadingScanAnalysis = false;
        this.cdr.detectChanges();
        return;
      }
    }

    const mergedResult = this.mergeScanResults(partialResults);
    this.scanAnalysisResult = mergedResult;
    this.scanAnalysisRawJson = JSON.stringify(mergedResult, null, 2);
    this.loadingScanAnalysis = false;
    this.scanProgressLabel = `Analyse terminée: ${this.scanProgressTotal} / ${this.scanProgressTotal}`;
    this.cdr.detectChanges();
  }

  saveScanResultToDatabase(): void {
    if (!this.scanAnalysisResult) {
      this.selectedScanError = "Aucun resultat d'analyse a enregistrer.";
      return;
    }

    this.savingScanToDatabase = true;
    this.selectedScanError = null;

    this.achatsService.createFactureFournisseurFromScan(this.scanAnalysisResult).subscribe({
      next: (response: any) => {
        this.savingScanToDatabase = false;
        this.showNotification(
          `Facture ${response?.data?.facture_num || ''} enregistree avec succes.`
        );
        this.closeScanModal();
        this.loadFactures(1, this.searchTerm);
      },
      error: (err) => {
        this.savingScanToDatabase = false;
        this.selectedScanError = this.getApiErrorMessage(err, "Erreur lors de l'enregistrement de la facture.");
        this.cdr.detectChanges();
      }
    });
  }

  copyScanJson(): void {
    if (!this.scanAnalysisRawJson) {
      return;
    }

    if (!navigator.clipboard?.writeText) {
      this.showNotification('Copie indisponible sur ce navigateur.', true);
      return;
    }

    navigator.clipboard.writeText(this.scanAnalysisRawJson).then(() => {
      this.showNotification('JSON copié dans le presse-papiers.');
    }).catch(() => {
      this.showNotification('Impossible de copier le JSON.', true);
    });
  }

  formatFileSize(size: number): string {
    if (size >= 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(2)} Mo`;
    }
    if (size >= 1024) {
      return `${(size / 1024).toFixed(0)} Ko`;
    }
    return `${size} o`;
  }

  getScanStatusClass(status: ScanFileItem['status']): string {
    switch (status) {
      case 'processing':
        return 'badge bg-info';
      case 'success':
        return 'badge bg-success';
      case 'error':
        return 'badge bg-danger';
      default:
        return 'badge bg-secondary';
    }
  }

  private mergeScanResults(results: FactureFournisseurScanResult[]): FactureFournisseurScanResult {
    const pickFirstText = (values: Array<string | null | undefined>): string | null => {
      const found = values.find((value) => typeof value === 'string' && value.trim().length > 0);
      return found ? String(found).trim() : null;
    };

    const pickLongestText = (values: Array<string | null | undefined>): string | null => {
      const filtered = values
        .filter((value) => typeof value === 'string' && value.trim().length > 0)
        .map((value) => String(value).trim());

      if (!filtered.length) {
        return null;
      }

      return filtered.sort((left, right) => right.length - left.length)[0];
    };

    const pickBestNumber = (values: Array<number | null | undefined>): number | null => {
      const numericValues = values
        .map((value) => typeof value === 'number' ? value : Number(value))
        .filter((value) => Number.isFinite(value));

      if (!numericValues.length) {
        return null;
      }

      return numericValues.sort((left, right) => right - left)[0];
    };

    const mergedArticlesMap = new Map<string, FactureFournisseurScanArticle>();

    results.forEach((result) => {
      (result.articles || []).forEach((article) => {
        const designation = String(article?.designation || '').trim();
        const quantite = typeof article?.quantite === 'number' ? article.quantite : Number(article?.quantite);
        const prix = typeof article?.prix_unitaire === 'number' ? article.prix_unitaire : Number(article?.prix_unitaire);
        const total = typeof article?.total_ligne === 'number' ? article.total_ligne : Number(article?.total_ligne);

        if (!designation && !Number.isFinite(quantite) && !Number.isFinite(prix) && !Number.isFinite(total)) {
          return;
        }

        const key = `${designation.toUpperCase()}|${Number.isFinite(quantite) ? quantite : ''}|${Number.isFinite(prix) ? prix : ''}|${Number.isFinite(total) ? total : ''}`;
        if (!mergedArticlesMap.has(key)) {
          mergedArticlesMap.set(key, {
            designation: designation || null,
            quantite: Number.isFinite(quantite) ? quantite : null,
            prix_unitaire: Number.isFinite(prix) ? prix : null,
            total_ligne: Number.isFinite(total) ? total : null
          });
        }
      });
    });

    return {
      fournisseur: pickLongestText(results.map((result) => result.fournisseur)),
      ice: pickFirstText(results.map((result) => result.ice)),
      if: pickFirstText(results.map((result) => result.if)),
      numero_facture: pickLongestText(results.map((result) => result.numero_facture)),
      date_facture: pickFirstText(results.map((result) => result.date_facture)),
      total_ht: pickBestNumber(results.map((result) => result.total_ht)),
      tva: pickBestNumber(results.map((result) => result.tva)),
      total_ttc: pickBestNumber(results.map((result) => result.total_ttc)),
      devise: pickFirstText(results.map((result) => result.devise)),
      articles: Array.from(mergedArticlesMap.values())
    };
  }

  private resetScanState(): void {
    this.loadingScanAnalysis = false;
    this.savingScanToDatabase = false;
    this.selectedScanError = null;
    this.scanAnalysisResult = null;
    this.scanAnalysisRawJson = '';
    this.scanProgressCurrent = 0;
    this.scanProgressTotal = 0;
    this.scanProgressPercent = 0;
    this.scanProgressLabel = '';
    this.revokeScanPreviewUrls();
    this.scanFiles = [];
  }

  private revokeScanPreviewUrls(): void {
    this.scanFiles.forEach((item) => {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
  }

  openTransfertModal(): void {
    this.showTransfertModal = true;
    this.loadingCommandes = true;
    this.modalCurrentPage = 1;
    this.modalSearchTerm = '';

    this.achatsService.getCommandesNonFacturees().subscribe({
      next: (response: any) => {
        this.commandesNonFacturees = response.data || [];
        this.applyModalFiltersAndSort();
        this.loadingCommandes = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.commandesNonFacturees = [];
        this.commandesNonFactureesFiltered = [];
        this.loadingCommandes = false;
        Swal.fire('Erreur', 'Impossible de charger les commandes non facturées.', 'error');
      }
    });
  }

  closeTransfertModal(): void {
    this.showTransfertModal = false;
    this.commandesNonFacturees = [];
    this.commandesNonFactureesFiltered = [];
    this.modalSearchTerm = '';
  }

  applyModalFiltersAndSort(): void {
    let filtered = [...this.commandesNonFacturees];

    if (this.modalSearchTerm.trim()) {
      const search = this.modalSearchTerm.toLowerCase();
      filtered = filtered.filter((cmd) =>
        (cmd.numero?.toLowerCase().includes(search)) ||
        (cmd.fournisseur?.toLowerCase().includes(search)) ||
        (cmd.description?.toLowerCase().includes(search))
      );
    }

    filtered.sort((a, b) => {
      let valA = a[this.modalSortColumn];
      let valB = b[this.modalSortColumn];

      if (this.modalSortColumn === 'date') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else if (this.modalSortColumn === 'total_ht') {
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
      } else {
        valA = (valA || '').toString().toLowerCase();
        valB = (valB || '').toString().toLowerCase();
      }

      return this.modalSortDirection === 'ASC'
        ? (valA > valB ? 1 : valA < valB ? -1 : 0)
        : (valA < valB ? 1 : valA > valB ? -1 : 0);
    });

    this.modalTotalPages = Math.ceil(filtered.length / this.modalPageSize) || 1;
    if (this.modalCurrentPage > this.modalTotalPages) {
      this.modalCurrentPage = 1;
    }

    const start = (this.modalCurrentPage - 1) * this.modalPageSize;
    const end = start + this.modalPageSize;
    this.commandesNonFactureesFiltered = filtered.slice(start, end);
  }

  onModalSort(column: string): void {
    if (this.modalSortColumn === column) {
      this.modalSortDirection = this.modalSortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.modalSortColumn = column;
      this.modalSortDirection = 'DESC';
    }
    this.applyModalFiltersAndSort();
  }

  getModalSortIcon(column: string): string {
    if (this.modalSortColumn !== column) {
      return 'fa-sort';
    }
    return this.modalSortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  onModalPageChange(page: number): void {
    if (page >= 1 && page <= this.modalTotalPages) {
      this.modalCurrentPage = page;
      this.applyModalFiltersAndSort();
    }
  }

  onModalSearch(): void {
    this.modalCurrentPage = 1;
    this.applyModalFiltersAndSort();
  }

  getModalPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPages = 5;
    let start = Math.max(1, this.modalCurrentPage - Math.floor(maxPages / 2));
    let end = Math.min(this.modalTotalPages, start + maxPages - 1);
    if (end - start < maxPages - 1) {
      start = Math.max(1, end - maxPages + 1);
    }
    for (let i = start; i <= end; i += 1) {
      pages.push(i);
    }
    return pages;
  }

  getTotalCommandesCount(): number {
    return this.commandesNonFacturees.length;
  }

  transfererCommande(commandeId: number): void {
    Swal.fire({
      title: 'Créer une facture ?',
      text: 'Cette commande sera transformée en facture fournisseur.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#28a745',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Oui, créer la facture',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (!result.isConfirmed) {
        return;
      }

      Swal.fire({
        title: 'Création en cours...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      this.achatsService.createFactureFournisseurFromCommande(commandeId).subscribe({
        next: (response: any) => {
          Swal.fire({
            icon: 'success',
            title: 'Facture créée',
            text: `Facture ${response.data?.numero || ''} créée avec succès.`
          });
          this.closeTransfertModal();
          this.loadFactures(1, '');
        },
        error: (err) => {
          Swal.fire('Erreur', this.getApiErrorMessage(err, 'Impossible de créer la facture.'), 'error');
        }
      });
    });
  }
}
