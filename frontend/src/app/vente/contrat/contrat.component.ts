import { Component, OnInit } from '@angular/core';
import { VentesService } from 'src/app/service/ventes.service';
import { BaseService } from 'src/app/service/base.service';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-contrat',
  templateUrl: './contrat.component.html',
  styleUrls: ['./contrat.component.css']
})
export class ContratComponent implements OnInit {
  contrats: any[] = [];
  loading: boolean = true;
  clients: any[] = [];
  filteredClients: any[] = [];
  conditionsPaiement: any[] = [];

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
  sortColumn: string = 'date';
  sortDirection: 'ASC' | 'DESC' = 'DESC';

  // Filtres avancés
  showAdvancedFilters: boolean = false;
  filterDateFrom: string = '';
  filterDateTo: string = '';

  constructor(
    private ventesService: VentesService,
    private baseService: BaseService,
    private router: Router,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadClients();
    this.loadConditionsPaiement();
    this.loadContrats(1);
  }

  loadConditionsPaiement(): void {
    this.ventesService.getConditionsPaiement().subscribe({
      next: (response: any) => {
        const result = response?.data || response || [];
        this.conditionsPaiement = Array.isArray(result) ? result : [];
      },
      error: (err: any) => {
        console.error('[ContratComponent] Erreur chargement conditions:', err);
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

  loadClients(): void {
    this.baseService.getClient().subscribe({
      next: (response: any) => {
        const result = response?.data || response || [];
        this.clients = Array.isArray(result) ? result : [];
        this.filteredClients = [...this.clients];
      },
      error: (err: any) => {
        console.error('[ContratComponent] Erreur chargement clients:', err);
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

        this.loading = false;
      },
      error: (err) => {
        console.error('[ContratComponent] ❌ Erreur chargement contrats:', err);
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
          console.error('[ContratComponent] ❌ Erreur modification contrat:', err);
          this.showError(`❌ Erreur lors de la modification: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    } else {
      // Création
      this.ventesService.createContrat(formData).subscribe({
        next: () => {
          this.closeModal();
          this.resetForm();
          this.showSuccess('✅ Contrat créé avec succès !');
          this.loadContrats(1);
        },
        error: (err) => {
          console.error('[ContratComponent] ❌ Erreur création contrat:', err);
          this.showError(`❌ Erreur lors de la création: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    }
  }

  editContrat(contrat: any): void {
    this.router.navigate(['/Edit-Contrat/' + contrat.id]);
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
          console.error('[ContratComponent] ❌ Erreur suppression contrat:', err);
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
      this.sortDirection = 'ASC';
    }
    this.loadContrats(this.currentPage);
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

  showSuccess(message: string): void {
    Swal.fire({
      icon: 'success',
      title: 'Succès',
      text: message,
      timer: 3000,
      showConfirmButton: false,
      toast: true,
      position: 'top-end'
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
}

