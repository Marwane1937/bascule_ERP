import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-unite',
  templateUrl: './unite.component.html',
  styleUrls: ['./unite.component.css']
})
export class UniteComponent implements OnInit {
  unites: any[] = [];
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

  currentUnite: any = {
    code: '',
    nom: '',
    base: 0,
    fact: 0,
    type: null,
    etat: 1
  };
  isEditMode: boolean = false;

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.getUnites();
  }

  getUnites(): void {
    this.loading = true;

    const params = {
      page: this.currentPage.toString(),
      pageSize: this.pageSize.toString(),
      search: this.searchTerm,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection
    };

    this.http.get('http://localhost:3500/api/unites', { params }).subscribe({
      next: (response: any) => {
        this.unites = response?.data || [];
        this.totalRecords = response?.pagination?.total || 0;
        this.totalPages = response?.pagination?.totalPages || 0;
        this.loading = false;
      },
      error: (error) => {
        console.error('Erreur chargement unités:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement des unités', 'error');
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
    this.getUnites();
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
    this.getUnites();
  }

  // Méthodes de pagination
  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.getUnites();
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
    if (this.unites.length === 0) return '0 - 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(start + this.unites.length - 1, this.totalRecords);
    return `${start} - ${end}`;
  }

  openModal(unite?: any): void {
    if (unite) {
      // Mode édition
      this.isEditMode = true;
      this.currentUnite = { ...unite };
    } else {
      // Mode création
      this.isEditMode = false;
      this.currentUnite = {
        code: '',
        nom: '',
        base: 0,
        fact: 0,
        type: null,
        etat: 1
      };
    }

    // Ouvrir la modal
    const modal = new (window as any).bootstrap.Modal(document.getElementById('uniteModal'));
    modal.show();
  }

  saveUnite(): void {
    if (!this.currentUnite.code || !this.currentUnite.nom) {
      Swal.fire('Erreur', 'Code et nom sont requis', 'error');
      return;
    }

    const url = this.isEditMode
      ? `http://localhost:3500/api/unites/${this.currentUnite.id}`
      : 'http://localhost:3500/api/unites';
    const method = this.isEditMode ? 'put' : 'post';

    this.http[method](url, this.currentUnite).subscribe({
      next: () => {
        Swal.fire('Succès', this.isEditMode ? 'Unité modifiée' : 'Unité créée', 'success');
        const modal = (window as any).bootstrap.Modal.getInstance(document.getElementById('uniteModal'));
        modal.hide();
        this.getUnites();
      },
      error: (error) => {
        Swal.fire('Erreur', error.error?.message || 'Erreur lors de la sauvegarde', 'error');
      }
    });
  }

  deleteUnite(unite: any): void {
    Swal.fire({
      title: 'Confirmation',
      text: `Supprimer "${unite.nom}" ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui'
    }).then((result) => {
      if (result.isConfirmed) {
        this.http.delete(`http://localhost:3500/api/unites/${unite.id}`).subscribe({
          next: () => {
            Swal.fire('Succès', 'Unité supprimée', 'success');
            this.getUnites();
          },
          error: (error) => Swal.fire('Erreur', 'Erreur lors de la suppression', 'error')
        });
      }
    });
  }
}
