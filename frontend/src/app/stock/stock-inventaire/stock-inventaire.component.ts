import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { StockService } from '../../service/stock.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-stock-inventaire',
  templateUrl: './stock-inventaire.component.html',
  styleUrls: ['./stock-inventaire.component.css']
})
export class StockInventaireComponent implements OnInit {

  // Données
  inventaires: any[] = [];

  // État
  loading: boolean = false;

  // Pagination
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 1;

  // Recherche et tri
  searchTerm: string = '';
  sortColumn: string = 'date';
  sortDirection: 'ASC' | 'DESC' = 'DESC';

  constructor(
    private stockService: StockService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.getInventaires();
  }

  // Récupération des inventaires (type=20)
  getInventaires(): void {
    this.loading = true;

    const options: any = {
      page: this.currentPage,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: this.searchTerm,
      type: 20 // Type 20 pour inventaire
    };

    this.stockService.getAllStockDocuments(options).subscribe({
      next: (response: any) => {
        this.inventaires = response.data || [];
        this.totalRecords = response.pagination?.total || 0;
        this.totalPages = response.pagination?.totalPages || 1;
        this.loading = false;
      },
      error: (error) => {
        console.error('Erreur chargement inventaires:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement des inventaires', 'error');
        this.loading = false;
      }
    });
  }

  // Recherche
  onSearch(): void {
    this.currentPage = 1;
    this.getInventaires();
  }

  // Tri
  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'DESC';
    }
    this.currentPage = 1;
    this.getInventaires();
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort';
    }
    return this.sortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // Pagination
  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.getInventaires();
    }
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
    return `${start}-${end}`;
  }

  // Navigation vers l'édition
  editInventaire(id: number): void {
    this.router.navigate(['/Edit-Inventaire', id]);
  }

  // Créer un nouvel inventaire (en-tête avec type=20)
  creerInventaire(): void {
    Swal.fire({
      title: 'Créer un Inventaire',
      text: 'Voulez-vous créer un nouvel inventaire ?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Oui, créer',
      cancelButtonText: 'Annuler',
      input: 'text',
      inputPlaceholder: 'Description de l\'inventaire (optionnel)',
      inputValidator: (value) => {
        return null; // Description optionnelle
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const description = result.value || 'Inventaire de stock';
        this.stockService.createInventaireHeader(description).subscribe({
          next: (response: any) => {
            Swal.fire({
              icon: 'success',
              title: 'Succès',
              text: `Inventaire ${response.numero || ''} créé avec succès !`,
              timer: 2000,
              showConfirmButton: false
            });
            
            // Recharger la liste
            this.getInventaires();
            
            // Rediriger vers la page d'édition
            if (response.id || response.document_id) {
              this.router.navigate(['/Edit-Inventaire', response.id || response.document_id]);
            }
          },
          error: (err) => {
            Swal.fire({
              icon: 'error',
              title: 'Erreur',
              text: `Une erreur s'est produite lors de la création de l'inventaire: ${err.error?.message || err.message || 'Erreur inconnue'}`
            });
          }
        });
      }
    });
  }
}

