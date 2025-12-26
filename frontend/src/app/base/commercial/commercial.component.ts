import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BaseService } from 'src/app/service/base.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-commercial',
  templateUrl: './commercial.component.html',
  styleUrls: ['./commercial.component.css']
})
export class CommercialComponent implements OnInit {
  commercials: any[] = [];
  loading: boolean = true;
  commercialForm!: FormGroup;
  isEditMode: boolean = false;
  currentCommercialId: string | null = null;

  // Pagination
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 0;

  // Recherche / tri
  searchTerm: string = '';
  sortColumn: string = 'nom';
  sortDirection: 'ASC' | 'DESC' = 'ASC';

  constructor(private baseService: BaseService, private fb: FormBuilder) {}

  ngOnInit(): void {
    this.initForm();
    this.loadCommercials(1);
  }

  initForm(): void {
    this.commercialForm = this.fb.group({
      code: [''],
      nom: ['', Validators.required],
      prenom: [''],
      mobile: [''],
      phone: [''],
      email: ['']
    });
  }

  loadCommercials(page: number = 1, search: string = '', resetFilters: boolean = false): void {
    this.loading = true;
    this.currentPage = page;

    if (resetFilters) {
      this.searchTerm = '';
      this.sortColumn = 'nom';
      this.sortDirection = 'ASC';
    }

    const requestOptions = {
      page: this.currentPage,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: search || this.searchTerm
    };

    this.baseService.getCommercialsPaged(requestOptions).subscribe({
      next: (response: any) => {
        const result = response?.data || [];
        const pagination = response?.pagination || {};

        this.commercials = Array.isArray(result) ? result : [];
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;

        this.loading = false;
      },
      error: (err) => {
        console.error('[CommercialComponent] ❌ Erreur chargement commerciaux:', err);
        this.commercials = [];
        this.totalRecords = 0;
        this.totalPages = 1;
        this.loading = false;
        this.showError(`❌ Erreur lors du chargement des commerciaux: ${err.error?.message || err.message || 'Erreur inconnue'}`);
      }
    });
  }

  onSubmit(): void {
    if (this.commercialForm.valid) {
      if (this.isEditMode && this.currentCommercialId) {
        this.baseService.updateCommercial(this.currentCommercialId, this.commercialForm.value).subscribe({
          next: () => {
            this.closeAddCommercialModal();
            this.resetForm();
            this.showSuccess('✅ Commercial modifié avec succès !');
            this.loadCommercials(this.currentPage);
          },
          error: (err) => {
            console.error(err);
            this.showError("❌ Une erreur s'est produite lors de la modification du commercial.");
          }
        });
      } else {
        this.baseService.createCommercial(this.commercialForm.value).subscribe({
          next: () => {
            this.closeAddCommercialModal();
            this.resetForm();
            this.showSuccess('✅ Commercial ajouté avec succès !');
            this.loadCommercials(1);
          },
          error: (err) => {
            console.error(err);
            this.showError("❌ Une erreur s'est produite lors de l'ajout du commercial.");
          }
        });
      }
    } else {
      this.showError("❗ Le formulaire est invalide.");
    }
  }

  onEdit(commercial: any): void {
    this.isEditMode = true;
    this.currentCommercialId = commercial.id;
    this.commercialForm.patchValue({
      code: commercial.code || '',
      nom: commercial.nom,
      prenom: commercial.prenom || '',
      mobile: commercial.mobile || '',
      phone: commercial.phone || '',
      email: commercial.email || ''
    });
    // Ouvrir le modal (Bootstrap 5)
    const modalElement = document.getElementById('addClientModal');
    if (modalElement) {
      const modal = new (window as any).bootstrap.Modal(modalElement);
      modal.show();
    }
  }

  onDelete(id: string): void {
    Swal.fire({
      title: 'Êtes-vous sûr ?',
      text: "Cette action est irréversible !",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Oui, supprimer !',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.baseService.deleteCommercial(id).subscribe({
          next: () => {
            this.showSuccess('✅ Commercial supprimé avec succès !');
            this.loadCommercials(this.currentPage);
          },
          error: (err) => {
            console.error(err);
            this.showError("❌ Une erreur s'est produite lors de la suppression.");
          }
        });
      }
    });
  }

  onArchive(commercial: any): void {
    const commercialId = commercial?.id;
    if (!commercialId) {
      this.showError('❌ Identifiant commercial introuvable.');
      return;
    }

    Swal.fire({
      icon: 'warning',
      title: 'Archiver ce commercial ?',
      text: `Commercial: ${commercial?.nom || ''} ${commercial?.prenom || ''}`,
      showCancelButton: true,
      confirmButtonText: 'Oui, archiver',
      cancelButtonText: 'Annuler',
      customClass: {
        confirmButton: 'btn btn-warning',
        cancelButton: 'btn btn-secondary'
      },
      buttonsStyling: false
    }).then((result) => {
      if (!result.isConfirmed) return;

      this.baseService.archiveCommercial(commercialId).subscribe({
        next: (res: any) => {
          const message = res?.message || 'Commercial archivé avec succès';
          this.showSuccess(`✅ ${message}`);
          this.loadCommercials(this.currentPage);
        },
        error: (err) => {
          console.error('[CommercialComponent] ❌ Erreur archivage commercial:', err);
          this.showError(`❌ Erreur lors de l'archivage: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    });
  }

  resetForm(): void {
    this.isEditMode = false;
    this.currentCommercialId = null;
    this.commercialForm.reset({
      code: '',
      nom: '',
      prenom: '',
      mobile: '',
      phone: '',
      email: ''
    });
  }

  closeAddCommercialModal(): void {
    const modalElement = document.getElementById('addClientModal');
    if (modalElement) {
      const modal = (window as any).bootstrap.Modal.getInstance(modalElement);
      if (modal) {
        modal.hide();
      }
    }
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.loadCommercials(page);
    }
  }

  onPageSizeChange(event: any): void {
    const newSize = parseInt(event.target.value, 10);
    if (newSize > 0 && newSize !== this.pageSize) {
      this.pageSize = newSize;
      this.loadCommercials(1);
    }
  }

  onSearch(): void {
    this.loadCommercials(1, this.searchTerm);
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'ASC';
    }
    this.loadCommercials(this.currentPage);
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort text-muted';
    }
    return this.sortDirection === 'ASC' ? 'fa-sort-up text-primary' : 'fa-sort-down text-primary';
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPages = Math.min(this.totalPages, 5);
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
    if (this.totalRecords === 0) return '0 - 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `${start} - ${end}`;
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
}
