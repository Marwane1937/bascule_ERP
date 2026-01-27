import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import Swal from 'sweetalert2';

declare var $: any;

@Component({
  selector: 'app-ville',
  templateUrl: './ville.component.html',
  styleUrls: ['./ville.component.css']
})
export class VilleComponent implements OnInit {
  villes: any[] = [];
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
  currentVille: any = {
    code: '',
    nom: '',
    longitude: null,
    latitude: null,
    type: null,
    etat: 1
  };
  isEditMode: boolean = false;

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.getVilles();
  }

  getVilles(): void {
    this.loading = true;

    const params = {
      page: this.currentPage.toString(),
      pageSize: this.pageSize.toString(),
      search: this.searchTerm,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection
    };

    this.http.get('http://localhost:3500/api/villes', { params }).subscribe({
      next: (response: any) => {
        this.villes = response?.data || [];
        this.totalRecords = response?.pagination?.total || 0;
        this.totalPages = response?.pagination?.totalPages || 0;
        this.loading = false;
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors du chargement des villes', 'error');
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
    this.getVilles();
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
    this.getVilles();
  }

  // Méthodes de pagination
  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.getVilles();
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
    if (this.villes.length === 0) return '0 - 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(start + this.villes.length - 1, this.totalRecords);
    return `${start} - ${end}`;
  }

  openModal(ville?: any): void {
    if (ville) {
      // Mode édition
      this.isEditMode = true;
      this.currentVille = { ...ville };
    } else {
      // Mode création
      this.isEditMode = false;
      this.currentVille = {
        code: '',
        nom: '',
        longitude: null,
        latitude: null,
        type: null,
        etat: 1
      };
    }

    // Ouvrir la modal
    const modal = new (window as any).bootstrap.Modal(document.getElementById('villeModal'));
    modal.show();
  }

  saveVille(): void {
    if (!this.currentVille.code || !this.currentVille.nom) {
      Swal.fire('Erreur', 'Code et nom sont requis', 'error');
      return;
    }

    const url = this.isEditMode
      ? `http://localhost:3500/api/villes/${this.currentVille.id}`
      : 'http://localhost:3500/api/villes';

    const method = this.isEditMode ? 'put' : 'post';

    this.http[method](url, this.currentVille).subscribe({
      next: (response: any) => {
        const message = this.isEditMode ? 'Ville modifiée avec succès' : 'Ville créée avec succès';
        Swal.fire('Succès', message, 'success');

        // Fermer la modal
        const modal = (window as any).bootstrap.Modal.getInstance(document.getElementById('villeModal'));
        modal.hide();

        // Recharger les données
        this.getVilles();
      },
      error: (error) => {
        const message = error.error?.message || 'Erreur lors de la sauvegarde';
        Swal.fire('Erreur', message, 'error');
      }
    });
  }

  deleteVille(ville: any): void {
    Swal.fire({
      title: 'Confirmation',
      text: `Êtes-vous sûr de vouloir supprimer la ville "${ville.nom}" ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.http.delete(`http://localhost:3500/api/villes/${ville.id}`).subscribe({
          next: () => {
            Swal.fire('Succès', 'Ville supprimée avec succès', 'success');
            this.getVilles();
          },
          error: (error) => {
            const message = error.error?.message || 'Erreur lors de la suppression';
            Swal.fire('Erreur', message, 'error');
          }
        });
      }
    });
  }

}
