import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import Swal from 'sweetalert2';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-banque',
  templateUrl: './banque.component.html',
  styleUrls: ['./banque.component.css']
})
export class BanqueComponent implements OnInit {
  private readonly apiUrl = environment.apiUrl;
  banques: any[] = [];
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

  // Variables pour le formulaire
  currentBanque: any = {
    code: '',
    nom: '',
    nom_court: '',
    swift: '',
    type: null,
    etat: 1
  };
  isEditMode: boolean = false;

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.getBanques();
  }

  getBanques(): void {
    this.loading = true;

    const params = {
      page: this.currentPage.toString(),
      pageSize: this.pageSize.toString(),
      search: this.searchTerm,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection
    };

    this.http.get(`${this.apiUrl}/banques`, { params }).subscribe({
      next: (response: any) => {
        this.banques = response?.data || [];
        this.totalRecords = response?.pagination?.total || 0;
        this.totalPages = response?.pagination?.totalPages || 0;
        this.loading = false;
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors du chargement des banques', 'error');
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
    this.getBanques();
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
    this.getBanques();
  }

  // Méthodes de pagination
  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.getBanques();
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
    if (this.banques.length === 0) return '0 - 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(start + this.banques.length - 1, this.totalRecords);
    return `${start} - ${end}`;
  }

  openModal(banque?: any): void {
    if (banque) {
      // Mode édition
      this.isEditMode = true;
      this.currentBanque = { ...banque };
    } else {
      // Mode création
      this.isEditMode = false;
      this.currentBanque = {
        code: '',
        nom: '',
        nom_court: '',
        swift: '',
        type: null,
        etat: 1
      };
    }

    // Ouvrir la modal
    const modal = new (window as any).bootstrap.Modal(document.getElementById('banqueModal'));
    modal.show();
  }

  saveBanque(): void {
    if (!this.currentBanque.code || !this.currentBanque.nom) {
      Swal.fire('Erreur', 'Code et nom sont requis', 'error');
      return;
    }

    const url = this.isEditMode
      ? `${this.apiUrl}/banques/${this.currentBanque.id}`
      : `${this.apiUrl}/banques`;

    const method = this.isEditMode ? 'put' : 'post';

    this.http[method](url, this.currentBanque).subscribe({
      next: (response: any) => {
        const message = this.isEditMode ? 'Banque modifiée avec succès' : 'Banque créée avec succès';
        Swal.fire('Succès', message, 'success');

        const modal = (window as any).bootstrap.Modal.getInstance(document.getElementById('banqueModal'));
        modal.hide();

        this.getBanques();
      },
      error: (error) => {
        const message = error.error?.message || 'Erreur lors de la sauvegarde';
        Swal.fire('Erreur', message, 'error');
      }
    });
  }

  deleteBanque(banque: any): void {
    Swal.fire({
      title: 'Confirmation',
      text: `Êtes-vous sûr de vouloir supprimer la banque "${banque.nom}" ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.http.delete(`${this.apiUrl}/banques/${banque.id}`).subscribe({
          next: () => {
            Swal.fire('Succès', 'Banque supprimée avec succès', 'success');
            this.getBanques();
          },
          error: (error) => {
            const message = error.error?.message || 'Erreur lors de la suppression';
            Swal.fire('Erreur', message, 'error');
          }
        });
      }
    });
  }

  validateSwift(): void {
    if (this.currentBanque.swift) {
      const swiftRegex = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
      if (!swiftRegex.test(this.currentBanque.swift.toUpperCase())) {
        Swal.fire('Erreur', 'Format SWIFT invalide', 'error');
        this.currentBanque.swift = '';
      }
    }
  }
}
