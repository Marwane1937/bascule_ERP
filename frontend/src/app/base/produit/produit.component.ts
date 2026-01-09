import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-produit',
  templateUrl: './produit.component.html',
  styleUrls: ['./produit.component.css']
})
export class ProduitComponent implements OnInit {
  produits: any[] = [];
  unites: any;
  familles: any;
  loading: boolean = true;
  produitForm!: FormGroup;
  successMessage: string = '';
  isEditMode: boolean = false;
  currentProduitId: string | null = null;

  // Pagination
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 0;

  // Recherche / tri
  searchTerm: string = '';
  sortColumn: string = 'article_nom';
  sortDirection: 'ASC' | 'DESC' = 'ASC';

  constructor(private baseService: BaseService, private fb: FormBuilder, private router: Router) { }

  ngOnInit(): void {
    this.initForm();
    this.loadProduits(1);
    this.AllUnite();
    this.AllFamille();
  }

  initForm(): void {
    this.produitForm = this.fb.group({
      article_cod: ['', Validators.required],
      article_nom: ['', Validators.required],
      prix_achat: [0],
      prix_vente: [0],
      famille: [0],
      unite_id: [null, Validators.required],
      prix_quantite: [1],
      etat: [1],
    });
  }

  loadProduits(page: number = 1, search: string = '', resetFilters: boolean = false): void {
    this.loading = true;
    this.currentPage = page;

    if (resetFilters) {
      this.searchTerm = '';
      this.sortColumn = 'article_nom';
      this.sortDirection = 'ASC';
    }

    const requestOptions = {
      page: this.currentPage,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: search || this.searchTerm
    };

    this.baseService.getProduitsPaged(requestOptions).subscribe({
      next: (response: any) => {
        const result = response?.data || [];
        const pagination = response?.pagination || {};

        this.produits = Array.isArray(result) ? result : [];
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;

        this.loading = false;
      },
      error: (err) => {
        console.error('[ProduitComponent] ❌ Erreur chargement produits:', err);
        this.produits = [];
        this.totalRecords = 0;
        this.totalPages = 1;
        this.loading = false;
        this.showError(`❌ Erreur lors du chargement des produits: ${err.error?.message || err.message || 'Erreur inconnue'}`);
      }
    });
  }

  AllUnite() {
    this.baseService.getUnite().subscribe((response: any) => {
      this.unites = response?.data || (Array.isArray(response) ? response : []);
    })
  }

  AllFamille() {
    this.baseService.getFamille().subscribe((response: any) => {
      this.familles = response?.data || (Array.isArray(response) ? response : []);
    })
  }

  onSubmit(): void {
    if (this.produitForm.valid) {
      if (this.isEditMode && this.currentProduitId) {
        this.baseService.updateProduit(this.currentProduitId, this.produitForm.value).subscribe({
          next: () => {
            this.closeAddProduitModal();
            this.resetForm();
            this.showSuccess('✅ Produit modifié avec succès !');
            this.loadProduits(this.currentPage);
          },
          error: (err) => {
            console.error(err);
            this.showError("❌ Une erreur s'est produite lors de la modification du produit.");
          }
        });
      } else {
        this.baseService.addProduit(this.produitForm.value).subscribe({
          next: () => {
            this.closeAddProduitModal();
            this.resetForm();
            this.showSuccess('✅ Produit ajouté avec succès !');
            this.loadProduits(1);
          },
          error: (err) => {
            console.error(err);
            this.showError("❌ Une erreur s'est produite lors de l'ajout du produit.");
          }
        });
      }
    } else {
      this.showError("❗ Le formulaire est invalide.");
    }
  }

  onEdit(produit: any): void {
    this.isEditMode = true;
    this.currentProduitId = produit.article_id;
    this.produitForm.patchValue({
      article_cod: produit.article_cod,
      article_nom: produit.article_nom,
      prix_achat: produit.prix_achat,
      prix_vente: produit.prix_vente,
      famille: produit.famille,
      unite_id: produit.unite_id,
      prix_quantite: produit.prix_quantite,
      etat: produit.etat
    });
    // Ouvrir le modal (Bootstrap 5)
    const modalElement = document.getElementById('addClientModal');
    if (modalElement) {
      const modal = new (window as any).bootstrap.Modal(modalElement);
      modal.show();
    }
  }

  // Ouvrir l'interface dédiée d'édition produit (avec onglet article_nomenclature)
  goToEditProduit(article_id: number): void {
    if (!article_id) {
      this.showError('❌ Identifiant produit introuvable.');
      return;
    }
    this.router.navigate(['/Edit-Produit', article_id]);
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
        this.baseService.deleteProduit(id).subscribe({
          next: () => {
            this.showSuccess('✅ Produit supprimé avec succès !');
            this.loadProduits(this.currentPage);
          },
          error: (err) => {
            console.error(err);
            this.showError("❌ Une erreur s'est produite lors de la suppression.");
          }
        });
      }
    });
  }

  onArchive(produit: any): void {
    const articleId = produit?.article_id;
    if (!articleId) {
      this.showError('❌ Identifiant produit introuvable.');
      return;
    }

    Swal.fire({
      icon: 'warning',
      title: 'Archiver ce produit ?',
      text: `Produit: ${produit?.article_nom || ''}`,
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

      this.baseService.archiveProduit(articleId).subscribe({
        next: (res: any) => {
          const message = res?.message || 'Produit archivé avec succès';
          this.showSuccess(`✅ ${message}`);
          this.loadProduits(this.currentPage);
        },
        error: (err) => {
          console.error('[ProduitComponent] ❌ Erreur archivage produit:', err);
          this.showError(`❌ Erreur lors de l'archivage: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    });
  }

  resetForm(): void {
    this.isEditMode = false;
    this.currentProduitId = null;
    this.produitForm.reset({
      prix_achat: 0,
      prix_vente: 0,
      prix_quantite: 1,
      etat: 1
    });
  }

  closeAddProduitModal(): void {
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
      this.loadProduits(page);
    }
  }

  onPageSizeChange(event: any): void {
    const newSize = parseInt(event.target.value, 10);
    if (newSize > 0 && newSize !== this.pageSize) {
      this.pageSize = newSize;
      this.loadProduits(1);
    }
  }

  onSearch(): void {
    this.loadProduits(1, this.searchTerm);
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'ASC';
    }
    this.loadProduits(this.currentPage);
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
