import { Component, OnInit } from '@angular/core';
import { BaseService } from 'src/app/service/base.service';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-client',
  templateUrl: './client.component.html',
  styleUrls: ['./client.component.css']
})
export class ClientComponent implements OnInit {
  clients: any[] = [];
  loading: boolean = true;

  // Formulaire ajout client
  clientForm!: FormGroup;

  // Pagination
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 0;

  // Recherche / tri
  searchTerm: string = '';
  sortColumn: string = 'nom';
  sortDirection: 'ASC' | 'DESC' = 'ASC';

  constructor(
    private baseService: BaseService,
    private router: Router,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadClients(1);
  }

  initForm(): void {
    this.clientForm = this.fb.group({
      code: ['', Validators.required],
      nom: ['', Validators.required]
    });
  }

  loadClients(page: number = 1): void {
    this.loading = true;
    this.currentPage = page;

    const requestOptions = {
      page: this.currentPage,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: this.searchTerm
    };

    this.baseService.getClientsPaged(requestOptions).subscribe({
      next: (response: any) => {
        const result = response?.data || [];
        const pagination = response?.pagination || {};

        this.clients = Array.isArray(result) ? result : [];
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;

        this.loading = false;
      },
      error: (err) => {
        this.clients = [];
        this.totalRecords = 0;
        this.totalPages = 1;
        this.loading = false;
        this.showError(`❌ Erreur lors du chargement des clients: ${err.error?.message || err.message || 'Erreur inconnue'}`);
      }
    });
  }

OnEdit(part_id : any){
  this.router.navigate(['/Edit-Client/'+ part_id]);
}

  onSubmit(): void {
    if (this.clientForm.invalid) {
      this.showError('❗ Le formulaire est invalide.');
      return;
    }

    this.baseService.createClient(this.clientForm.value).subscribe({
      next: () => {
        this.closeAddClientModal();
        this.clientForm.reset();
        this.initForm();
        this.showSuccess('✅ Client ajouté avec succès !');
        // Recharger la première page pour voir le dernier ajout (tri configurable)
        this.loadClients(1);
      },
      error: (err) => {
        this.showError(`❌ Erreur lors de l'ajout du client: ${err.error?.message || err.message || 'Erreur inconnue'}`);
      }
    });
  }

  removeClient(client: any): void {
    const partId = client?.part_id;
    if (!partId) {
      this.showError('❌ Identifiant client introuvable.');
      return;
    }

    Swal.fire({
      icon: 'warning',
      title: 'Supprimer ce client ?',
      text: `Client: ${client?.nom || ''}`,
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
          const message = res?.message || 'Client supprimé avec succès';
          this.showSuccess(`✅ ${message}`);
          // Recharger la page courante
          this.loadClients(this.currentPage);
        },
        error: (err) => {
          this.showError(`❌ Erreur lors de la suppression: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    });
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.loadClients(page);
    }
  }

  onPageSizeChange(event: any): void {
    const newPageSize = parseInt(event.target.value, 10);
    if (newPageSize > 0) {
      this.pageSize = newPageSize;
      this.loadClients(1);
    }
  }

  onSearch(): void {
    this.loadClients(1);
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'ASC';
    }
    this.loadClients(1);
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
    if (this.totalRecords === 0) return '0 à 0';
    const start = ((this.currentPage - 1) * this.pageSize) + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `${start} à ${end}`;
  }

  private closeAddClientModal(): void {
    const modalElement = document.getElementById('addClientModal');
    if (!modalElement) return;

    // jQuery bootstrap si dispo
    // @ts-ignore
    if (typeof ($) !== 'undefined') {
      // @ts-ignore
      $('#addClientModal').modal('hide');
      return;
    }

    // Fallback bootstrap 5
    const modal = (window as any).bootstrap?.Modal?.getInstance(modalElement);
    if (modal) {
      modal.hide();
      return;
    }

    // Dernier fallback
    modalElement.classList.remove('show');
    document.body.classList.remove('modal-open');
    const backdrop = document.querySelector('.modal-backdrop');
    if (backdrop) backdrop.remove();
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
