import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-departement',
  templateUrl: './departement.component.html',
  styleUrls: ['./departement.component.css']
})
export class DepartementComponent implements OnInit {
  departements: any[] = [];
  loading: boolean = true;

  // Pagination et recherche
  searchTerm: string = '';
  pageSize: number = 10;
  currentPage: number = 1;
  totalRecords: number = 0;
  totalPages: number = 0;

  // Tri
  sortColumn: string = 'code';
  sortDirection: string = 'asc';

  currentDepartement: any = {
    code: '',
    nom: '',
    manager: '',
    parent: null,
    compte: '',
    typ: null,
    etat: 1
  };
  isEditMode: boolean = false;

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.getDepartements();
  }

  getDepartements(): void {
    this.loading = true;

    const params = {
      page: this.currentPage.toString(),
      pageSize: this.pageSize.toString(),
      search: this.searchTerm,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection
    };

    this.http.get('http://localhost:3500/api/departements', { params }).subscribe({
      next: (response: any) => {
        this.departements = response?.data || [];
        this.totalRecords = response?.pagination?.total || 0;
        this.totalPages = response?.pagination?.totalPages || 0;
        this.loading = false;
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors du chargement des départements', 'error');
        this.loading = false;
      }
    });
  }

  // Méthodes de tri
  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.currentPage = 1;
    this.getDepartements();
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort';
    }
    return this.sortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // Méthodes de recherche
  onSearch(): void {
    this.currentPage = 1;
    this.getDepartements();
  }

  // Méthodes de pagination
  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.getDepartements();
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    const half = Math.floor(maxPagesToShow / 2);

    let start = Math.max(1, this.currentPage - half);
    let end = Math.min(this.totalPages, start + maxPagesToShow - 1);

    if (end - start + 1 < maxPagesToShow) {
      start = Math.max(1, end - maxPagesToShow + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  }

  getDisplayRange(): string {
    if (this.departements.length === 0) return '0 - 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(start + this.departements.length - 1, this.totalRecords);
    return `${start} - ${end}`;
  }

  openModal(departement?: any): void {
    if (departement) {
      // Mode édition
      this.isEditMode = true;
      this.currentDepartement = { ...departement };
    } else {
      // Mode création
      this.isEditMode = false;
      this.currentDepartement = {
        code: '',
        nom: '',
        manager: '',
        parent: null,
        compte: '',
        typ: null,
        etat: 1
      };
    }

    // Ouvrir la modal
    const modal = new (window as any).bootstrap.Modal(document.getElementById('departementModal'));
    modal.show();
  }

  saveDepartement(): void {
    if (!this.currentDepartement.code || !this.currentDepartement.nom) {
      Swal.fire('Erreur', 'Code et nom sont requis', 'error');
      return;
    }

    const url = this.isEditMode
      ? `http://localhost:3500/api/departements/${this.currentDepartement.id}`
      : 'http://localhost:3500/api/departements';
    const method = this.isEditMode ? 'put' : 'post';

    this.http[method](url, this.currentDepartement).subscribe({
      next: () => {
        Swal.fire('Succès', this.isEditMode ? 'Département modifié' : 'Département créé', 'success');
        const modal = (window as any).bootstrap.Modal.getInstance(document.getElementById('departementModal'));
        modal.hide();
        this.getDepartements();
      },
      error: (error) => {
        Swal.fire('Erreur', error.error?.message || 'Erreur lors de la sauvegarde', 'error');
      }
    });
  }

  deleteDepartement(departement: any): void {
    Swal.fire({
      title: 'Confirmation',
      text: `Supprimer "${departement.nom}" ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui'
    }).then((result) => {
      if (result.isConfirmed) {
        this.http.delete(`http://localhost:3500/api/departements/${departement.id}`).subscribe({
          next: () => {
            Swal.fire('Succès', 'Département supprimé', 'success');
            this.getDepartements();
          },
          error: (error) => Swal.fire('Erreur', 'Erreur lors de la suppression', 'error')
        });
      }
    });
  }
}
