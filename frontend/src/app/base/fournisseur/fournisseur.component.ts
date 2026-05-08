import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import Swal from 'sweetalert2';
import { merge, of, Subject } from 'rxjs';
import { catchError, debounceTime, map, switchMap, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-fournisseur',
  templateUrl: './fournisseur.component.html',
  styleUrls: ['./fournisseur.component.css']
})
export class FournisseurComponent implements OnInit, OnDestroy {
  fournisseurs: any[] = [];
  loading = true;
  fournisseurForm!: FormGroup;

  currentPage = 1;
  pageSize = 25;
  totalRecords = 0;
  totalPages = 0;

  searchTerm = '';
  fournisseurSearchSuggestions: string[] = [];
  sortColumn = 'nom';
  sortDirection: 'ASC' | 'DESC' = 'ASC';
  checkingUnique = false;

  showStatsModal = false;
  statsLoading = false;
  statsData: any = null;
  selectedStatsFournisseur: any = null;
  statsLoadingFournisseurId: number | null = null;

  private destroy$ = new Subject<void>();
  private activityChart: any = null;
  private breakdownChart: any = null;
  private previousBodyOverflow = '';

  constructor(
    private baseService: BaseService,
    private router: Router,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.setupUniquenessValidation();
    this.loadFournisseurSearchSuggestions();
    this.loadFournisseurs(1);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.destroyStatsCharts();
    this.unlockBodyScroll();
  }

  initForm(): void {
    this.fournisseurForm = this.fb.group({
      code: ['', Validators.required],
      nom: ['', Validators.required]
    });
  }

  private setupUniquenessValidation(): void {
    const codeControl = this.fournisseurForm.get('code');
    const nomControl = this.fournisseurForm.get('nom');
    if (!codeControl || !nomControl) return;

    merge(codeControl.valueChanges, nomControl.valueChanges)
      .pipe(
        debounceTime(300),
        switchMap(() => {
          const code = (codeControl.value || '').toString().trim();
          const nom = (nomControl.value || '').toString().trim();

          if (!code && !nom) {
            this.checkingUnique = false;
            this.applyDuplicateState(false, false);
            return of(null);
          }

          this.checkingUnique = true;
          return this.baseService.checkFournisseurUniqueness({ code, nom }).pipe(
            map((response: any) => response?.data || response || {}),
            catchError(() => of({ codeExists: false, nomExists: false }))
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((result: any) => {
        if (result !== null) {
          this.applyDuplicateState(!!result?.codeExists, !!result?.nomExists);
        }
        this.checkingUnique = false;
      });
  }

  private applyDuplicateState(codeExists: boolean, nomExists: boolean): void {
    this.setDuplicateError('code', codeExists);
    this.setDuplicateError('nom', nomExists);
  }

  private setDuplicateError(controlName: 'code' | 'nom', exists: boolean): void {
    const control = this.fournisseurForm.get(controlName);
    if (!control) return;

    const errors = { ...(control.errors || {}) };
    if (exists) {
      errors['duplicate'] = true;
    } else {
      delete errors['duplicate'];
    }

    control.setErrors(Object.keys(errors).length ? errors : null);
  }

  private loadFournisseurSearchSuggestions(): void {
    this.baseService.getFournisseur().subscribe({
      next: (response: any) => {
        const result = response?.data || response || [];
        const names = (Array.isArray(result) ? result : [])
          .map((fournisseur: any) => String(fournisseur?.nom || '').trim())
          .filter((name: string) => !!name);

        this.fournisseurSearchSuggestions = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'fr'));
      },
      error: () => {
        this.fournisseurSearchSuggestions = [];
      }
    });
  }

  loadFournisseurs(page: number = 1): void {
    this.loading = true;
    this.currentPage = page;

    const requestOptions = {
      page: this.currentPage,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: this.searchTerm
    };

    this.baseService.getFournisseursPaged(requestOptions).subscribe({
      next: (response: any) => {
        const result = response?.data || [];
        const pagination = response?.pagination || {};

        this.fournisseurs = Array.isArray(result) ? result : [];
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;
        this.loading = false;
      },
      error: (err) => {
        this.fournisseurs = [];
        this.totalRecords = 0;
        this.totalPages = 1;
        this.loading = false;
        this.showError(`Erreur lors du chargement des fournisseurs: ${err.error?.message || err.message || 'Erreur inconnue'}`);
      }
    });
  }

  OnEdit(part_id: any): void {
    this.router.navigate(['/Edit-Fournisseur/' + part_id]);
  }

  onSubmit(): void {
    if (this.checkingUnique) {
      return;
    }

    if (this.fournisseurForm.invalid) {
      this.showError('Le formulaire est invalide.');
      return;
    }

    this.baseService.createFournisseur(this.fournisseurForm.value).subscribe({
      next: () => {
        this.closeAddFournisseurModal();
        this.fournisseurForm.reset();
        this.applyDuplicateState(false, false);
        this.showSuccess('Fournisseur ajoute avec succes.');
        this.loadFournisseurs(1);
      },
      error: (err) => {
        if (err?.status === 409) {
          this.applyDuplicateState(!!err?.error?.codeExists, !!err?.error?.nomExists);
        }
        this.showError(`Erreur ajout fournisseur: ${err.error?.message || err.message || 'Erreur inconnue'}`);
      }
    });
  }

  removeFournisseur(fournisseur: any): void {
    const partId = fournisseur?.part_id;
    if (!partId) {
      this.showError('Identifiant fournisseur introuvable.');
      return;
    }

    Swal.fire({
      icon: 'warning',
      title: 'Supprimer ce fournisseur ?',
      text: `Fournisseur: ${fournisseur?.nom || ''}`,
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

      this.baseService.deleteClient(partId).subscribe({
        next: (res: any) => {
          const message = res?.message || 'Fournisseur supprime avec succes';
          this.showSuccess(message);
          this.loadFournisseurs(this.currentPage);
        },
        error: (err) => {
          this.showError(`Erreur lors de la suppression: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    });
  }

  openStatsModal(fournisseur: any): void {
    const partnerId = Number(fournisseur?.part_id || 0);
    if (!partnerId) {
      this.showError('Identifiant fournisseur introuvable.');
      return;
    }

    this.selectedStatsFournisseur = fournisseur;
    this.statsData = null;
    this.statsLoading = true;
    this.statsLoadingFournisseurId = partnerId;
    this.showStatsModal = true;
    this.lockBodyScroll();
    this.destroyStatsCharts();

    this.baseService.getFournisseurStatistics(partnerId).subscribe({
      next: (response: any) => {
        this.statsData = response?.data || response || null;
        this.statsLoading = false;
        this.statsLoadingFournisseurId = null;
        setTimeout(() => this.renderStatsCharts(), 0);
      },
      error: (err) => {
        this.statsLoading = false;
        this.statsLoadingFournisseurId = null;
        this.showError(`Impossible de charger la situation fournisseur: ${err.error?.message || err.message || 'Erreur inconnue'}`);
      }
    });
  }

  closeStatsModal(): void {
    this.showStatsModal = false;
    this.statsLoading = false;
    this.statsLoadingFournisseurId = null;
    this.statsData = null;
    this.selectedStatsFournisseur = null;
    this.destroyStatsCharts();
    this.unlockBodyScroll();
  }

  getRecommendationIcon(tone: string): string {
    switch (tone) {
      case 'positive':
        return 'fas fa-arrow-trend-up';
      case 'warning':
        return 'fas fa-triangle-exclamation';
      case 'alert':
        return 'fas fa-bullseye';
      default:
        return 'fas fa-lightbulb';
    }
  }

  private renderStatsCharts(): void {
    if (!this.showStatsModal || !this.statsData) {
      return;
    }

    const Chart = (window as any).Chart;
    if (!Chart) {
      return;
    }

    this.destroyStatsCharts();

    const monthlyActivity = Array.isArray(this.statsData?.charts?.monthly_activity) ? this.statsData.charts.monthly_activity : [];
    const breakdown = Array.isArray(this.statsData?.charts?.breakdown) ? this.statsData.charts.breakdown : [];

    const activityCanvas = document.getElementById('supplierStatsActivityChart') as HTMLCanvasElement | null;
    if (activityCanvas && monthlyActivity.length > 0) {
      const activityCtx = activityCanvas.getContext('2d');
      if (activityCtx) {
        this.activityChart = new Chart(activityCtx, {
          type: 'bar',
          data: {
            labels: monthlyActivity.map((row: any) => row.month_key),
            datasets: [
              {
                label: 'Commandes',
                data: monthlyActivity.map((row: any) => Number(row.ordered_ht || 0)),
                backgroundColor: 'rgba(37, 99, 235, 0.68)',
                borderRadius: 8
              },
              {
                label: 'Receptions',
                data: monthlyActivity.map((row: any) => Number(row.received_ht || 0)),
                backgroundColor: 'rgba(16, 185, 129, 0.68)',
                borderRadius: 8
              },
              {
                label: 'Factures',
                data: monthlyActivity.map((row: any) => Number(row.invoiced_ht || 0)),
                backgroundColor: 'rgba(249, 115, 22, 0.68)',
                borderRadius: 8
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'top'
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: function(value: any) {
                    return `${Number(value || 0).toFixed(0)} dh`;
                  }
                }
              }
            }
          }
        });
      }
    }

    const breakdownCanvas = document.getElementById('supplierStatsBreakdownChart') as HTMLCanvasElement | null;
    if (breakdownCanvas && breakdown.length > 0) {
      const breakdownCtx = breakdownCanvas.getContext('2d');
      if (breakdownCtx) {
        this.breakdownChart = new Chart(breakdownCtx, {
          type: 'doughnut',
          data: {
            labels: breakdown.map((row: any) => row.label),
            datasets: [
              {
                data: breakdown.map((row: any) => Number(row.value || 0)),
                backgroundColor: ['#2563eb', '#10b981', '#f97316', '#7c3aed'],
                borderWidth: 2,
                borderColor: '#ffffff'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'right'
              }
            }
          }
        });
      }
    }
  }

  private destroyStatsCharts(): void {
    if (this.activityChart) {
      this.activityChart.destroy();
      this.activityChart = null;
    }
    if (this.breakdownChart) {
      this.breakdownChart.destroy();
      this.breakdownChart = null;
    }
  }

  private lockBodyScroll(): void {
    this.previousBodyOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
  }

  private unlockBodyScroll(): void {
    document.body.style.overflow = this.previousBodyOverflow;
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.loadFournisseurs(page);
    }
  }

  onPageSizeChange(event: any): void {
    const newPageSize = parseInt(event.target.value, 10);
    if (newPageSize > 0) {
      this.pageSize = newPageSize;
      this.loadFournisseurs(1);
    }
  }

  onSearch(): void {
    this.loadFournisseurs(1);
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'ASC';
    }
    this.loadFournisseurs(1);
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return 'fa-sort';
    return this.sortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) pages.push(i);
    return pages;
  }

  getDisplayRange(): string {
    if (this.totalRecords === 0) return '0 a 0';
    const start = ((this.currentPage - 1) * this.pageSize) + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `${start} a ${end}`;
  }

  private closeAddFournisseurModal(): void {
    const modalElement = document.getElementById('addClientModal');
    if (!modalElement) return;

    // @ts-ignore
    if (typeof ($) !== 'undefined') {
      // @ts-ignore
      $('#addClientModal').modal('hide');
      return;
    }

    const modal = (window as any).bootstrap?.Modal?.getInstance(modalElement);
    if (modal) {
      modal.hide();
      return;
    }

    modalElement.classList.remove('show');
    document.body.classList.remove('modal-open');
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) backdrop.remove();
  }

  showSuccess(message: string): void {
    Swal.fire({
      icon: 'success',
      title: 'Succes',
      text: message,
      confirmButtonText: 'OK',
      customClass: {
        confirmButton: 'btn btn-success'
      },
      buttonsStyling: false
    });
  }

  showError(message: string): void {
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
}
