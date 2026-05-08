import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-compteur',
  templateUrl: './compteur.component.html',
  styleUrls: ['./compteur.component.css']
})
export class CompteurComponent implements OnInit {
  compteurs: any[] = [];
  loading: boolean = true;

  // Pagination et recherche
  searchTerm: string = '';
  pageSize: number = 10;
  currentPage: number = 1;
  totalRecords: number = 0;
  totalPages: number = 0;

  // Tri
  sortColumn: string = 'nom';
  sortDirection: string = 'asc';

  currentCompteur: any = {
    code: '',
    nom: '',
    compteur: 0
  };
  isEditMode: boolean = false;

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.getCompteurs();
  }

  getCompteurs(): void {
    this.loading = true;

    const params = {
      page: this.currentPage.toString(),
      pageSize: this.pageSize.toString(),
      search: this.searchTerm,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection
    };

    this.http.get('http://localhost:3500/api/compteurs', { params }).subscribe({
      next: (response: any) => {
        this.compteurs = response?.data || [];
        this.totalRecords = response?.pagination?.total || 0;
        this.totalPages = response?.pagination?.totalPages || 0;
        this.loading = false;
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors du chargement des compteurs', 'error');
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
    this.getCompteurs();
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
    this.getCompteurs();
  }

  // Méthodes de pagination
  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.getCompteurs();
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
    if (this.compteurs.length === 0) return '0 - 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(start + this.compteurs.length - 1, this.totalRecords);
    return `${start} - ${end}`;
  }

  openModal(compteur: any): void {
    if (compteur) {
      // Mode édition
      this.isEditMode = true;
      this.currentCompteur = { ...compteur };
    } else {
      // Mode création
      this.isEditMode = false;
      this.currentCompteur = {
        code: '',
        nom: '',
        compteur: 0
      };
    }

    // Ouvrir la modal
    const modal = new (window as any).bootstrap.Modal(document.getElementById('compteurModal'));
    modal.show();
  }

  saveCompteur(): void {
    if (!this.currentCompteur.code || !this.currentCompteur.nom) {
      Swal.fire('Erreur', 'Code et nom sont requis', 'error');
      return;
    }

    if (this.currentCompteur.compteur === undefined || this.currentCompteur.compteur === null) {
      Swal.fire('Erreur', 'La valeur du compteur est requise', 'error');
      return;
    }

    const url = `http://localhost:3500/api/compteurs/${this.currentCompteur.code}`;
    const method = 'put';

    this.http[method](url, this.currentCompteur).subscribe({
      next: (response: any) => {
        const message = 'Compteur modifié avec succès';
        Swal.fire('Succès', message, 'success');

        // Fermer la modal
        const modal = (window as any).bootstrap.Modal.getInstance(document.getElementById('compteurModal'));
        modal.hide();

        // Recharger les données
        this.getCompteurs();
      },
      error: (error) => {
        const message = error.error?.message || 'Erreur lors de la sauvegarde';
        Swal.fire('Erreur', message, 'error');
      }
    });
  }
}

















