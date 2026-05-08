import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import Swal from 'sweetalert2';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-beneficiaire',
  templateUrl: './beneficiaire.component.html',
  styleUrls: ['./beneficiaire.component.css']
})
export class BeneficiaireComponent implements OnInit {
  private readonly apiUrl = environment.apiUrl;
  beneficiaires: any[] = [];
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

  currentBeneficiaire: any = {
    code: '',
    nom: '',
    departement_id: null
  };
  isEditMode: boolean = false;

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.getBeneficiaires();
  }

  getBeneficiaires(): void {
    this.loading = true;

    const params = {
      page: this.currentPage.toString(),
      pageSize: this.pageSize.toString(),
      search: this.searchTerm,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection
    };

    this.http.get(`${this.apiUrl}/beneficiaires`, { params }).subscribe({
      next: (response: any) => {
        this.beneficiaires = response?.data || [];
        this.totalRecords = response?.pagination?.total || 0;
        this.totalPages = response?.pagination?.totalPages || 0;
        this.loading = false;
      },
      error: (error) => {
        Swal.fire('Erreur', 'Erreur lors du chargement des bénéficiaires', 'error');
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
    this.getBeneficiaires();
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
    this.getBeneficiaires();
  }

  // Méthodes de pagination
  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.getBeneficiaires();
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
    if (this.beneficiaires.length === 0) return '0 - 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(start + this.beneficiaires.length - 1, this.totalRecords);
    return `${start} - ${end}`;
  }

  openModal(beneficiaire?: any): void {
    if (beneficiaire) {
      // Mode édition
      this.isEditMode = true;
      this.currentBeneficiaire = { ...beneficiaire };
    } else {
      // Mode création
      this.isEditMode = false;
      this.currentBeneficiaire = {
        code: '',
        nom: '',
        departement_id: null
      };
    }

    // Ouvrir la modal
    const modal = new (window as any).bootstrap.Modal(document.getElementById('beneficiaireModal'));
    modal.show();
  }

  saveBeneficiaire(): void {
    if (!this.currentBeneficiaire.code || !this.currentBeneficiaire.nom) {
      Swal.fire('Erreur', 'Code et nom sont requis', 'error');
      return;
    }

    const url = this.isEditMode
      ? `${this.apiUrl}/beneficiaires/${this.currentBeneficiaire.id}`
      : `${this.apiUrl}/beneficiaires`;
    const method = this.isEditMode ? 'put' : 'post';

    this.http[method](url, this.currentBeneficiaire).subscribe({
      next: () => {
        Swal.fire('Succès', this.isEditMode ? 'Bénéficiaire modifié' : 'Bénéficiaire créé', 'success');
        const modal = (window as any).bootstrap.Modal.getInstance(document.getElementById('beneficiaireModal'));
        modal.hide();
        this.getBeneficiaires();
      },
      error: (error) => {
        Swal.fire('Erreur', error.error?.message || 'Erreur lors de la sauvegarde', 'error');
      }
    });
  }

  deleteBeneficiaire(beneficiaire: any): void {
    Swal.fire({
      title: 'Confirmation',
      text: `Supprimer "${beneficiaire.nom}" ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui'
    }).then((result) => {
      if (result.isConfirmed) {
        this.http.delete(`${this.apiUrl}/beneficiaires/${beneficiaire.id}`).subscribe({
          next: () => {
            Swal.fire('Succès', 'Bénéficiaire supprimé', 'success');
            this.getBeneficiaires();
          },
          error: (error) => Swal.fire('Erreur', 'Erreur lors de la suppression', 'error')
        });
      }
    });
  }
}
