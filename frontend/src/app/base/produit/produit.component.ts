import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { BaseService } from 'src/app/service/base.service';
import Swal from 'sweetalert2';

interface ProduitNomenclatureNode {
  article_id: number;
  code: string;
  designation: string;
  quantite: number;
  quantiteTotale: number;
  prix: number;
  total: number;
  unite: string;
  famille: string;
  poidsStandard: number | null;
  poidsReel: number | null;
  children: ProduitNomenclatureNode[];
}

interface ProduitNomenclatureRow {
  article_id: number;
  code: string;
  designation: string;
  prix: number;
  composants: ProduitNomenclatureNode[];
  composantsCount: number;
  total: number;
}

@Component({
  selector: 'app-produit',
  templateUrl: './produit.component.html',
  styleUrls: ['./produit.component.css']
})
export class ProduitComponent implements OnInit, OnDestroy {
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
  produitSearchSuggestions: string[] = [];
  sortColumn: string = 'article_nom';
  sortDirection: 'ASC' | 'DESC' = 'ASC';
  showStatsModal = false;
  statsLoading = false;
  statsData: any = null;
  selectedStatsArticle: any = null;
  showNomenclatureModal = false;
  nomenclatureLoading = false;
  nomenclatureError = '';
  nomenclatureRows: ProduitNomenclatureRow[] = [];
  private revenueChart: any = null;
  private supplierChart: any = null;
  private previousBodyOverflow = '';
  private articleLookup = new Map<number, any>();
  private nomenclatureArticleIds = new Set<number>();
  private nomenclatureLoaded = false;

  constructor(private baseService: BaseService, private fb: FormBuilder, private router: Router) { }

  ngOnInit(): void {
    this.initForm();
    this.loadProduitSearchSuggestions();
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
        this.produits = [];
        this.totalRecords = 0;
        this.totalPages = 1;
        this.loading = false;
        this.showError(`❌ Erreur lors du chargement des produits: ${err.error?.message || err.message || 'Erreur inconnue'}`);
      }
    });
  }

  private loadProduitSearchSuggestions(): void {
    this.baseService.getProduit().subscribe({
      next: (response: any) => {
        const result = response?.data || response || [];
        const safeResult = Array.isArray(result) ? result : [];
        this.articleLookup = new Map(
          safeResult
            .filter((produit: any) => Number(produit?.article_id || 0) > 0)
            .map((produit: any) => [Number(produit.article_id), produit])
        );

        const names = safeResult
          .map((produit: any) => String(produit?.article_nom || '').trim())
          .filter((name: string) => !!name);

        this.produitSearchSuggestions = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'fr'));
      },
      error: () => {
        this.produitSearchSuggestions = [];
      }
    });
  }

  openNomenclaturePopup(): void {
    this.showNomenclatureModal = true;
    this.lockBodyScroll();

    if (!this.nomenclatureLoaded) {
      this.loadNomenclatureProducts();
    }
  }

  closeNomenclaturePopup(): void {
    this.showNomenclatureModal = false;
    this.nomenclatureLoading = false;
    this.unlockBodyScroll();
  }

  editNomenclatureProduct(row: ProduitNomenclatureRow): void {
    const articleId = Number(row?.article_id || 0);
    if (!articleId) {
      this.showError('❌ Identifiant produit introuvable.');
      return;
    }

    this.closeNomenclaturePopup();
    this.goToEditProduit(articleId);
  }

  reloadNomenclatureProducts(): void {
    this.nomenclatureLoaded = false;
    this.loadNomenclatureProducts();
  }

  private loadNomenclatureProducts(): void {
    this.nomenclatureLoading = true;
    this.nomenclatureError = '';

    const articles$ = this.articleLookup.size > 0
      ? of(Array.from(this.articleLookup.values()))
      : this.baseService.getProduit().pipe(
          map((response: any) => this.extractRows(response)),
          catchError(() => of([]))
        );

    forkJoin({
      articles: articles$,
      produitsNomenclature: this.baseService.getProduitsNomenclature().pipe(catchError(() => of({ data: [] })))
    }).pipe(
      switchMap((response: any) => {
        this.refreshArticleLookup(response?.articles || []);

        const composedProducts = this.extractRows(response?.produitsNomenclature);
        this.nomenclatureArticleIds = new Set(
          composedProducts
            .map((produit: any) => Number(produit?.article_id || 0))
            .filter((articleId: number) => articleId > 0)
        );

        if (composedProducts.length === 0) {
          return of([]);
        }

        return forkJoin(
          composedProducts.map((produit: any) =>
            this.buildProduitNomenclatureRow(produit).pipe(
              catchError(() => of(this.createEmptyNomenclatureRow(produit)))
            )
          )
        );
      })
    ).subscribe({
      next: (rows: ProduitNomenclatureRow[]) => {
        this.nomenclatureRows = rows;
        this.nomenclatureLoaded = true;
        this.nomenclatureLoading = false;
      },
      error: (err) => {
        this.nomenclatureRows = [];
        this.nomenclatureLoading = false;
        this.nomenclatureError = err?.error?.message || err?.message || 'Impossible de charger les produits nomenclature.';
      }
    });
  }

  private buildProduitNomenclatureRow(produit: any): any {
    const articleId = Number(produit?.article_id || 0);
    const article = this.getArticleById(articleId) || produit;

    return this.buildProduitNomenclatureNodes(articleId, 1).pipe(
      map((composants: ProduitNomenclatureNode[]) => ({
        article_id: articleId,
        code: article?.article_cod || produit?.article_cod || '',
        designation: article?.article_nom || produit?.article_nom || '',
        prix: this.getArticlePrice(article, produit),
        composants,
        composantsCount: this.flattenNomenclatureNodes(composants).length,
        total: this.sumNomenclatureTotal(composants)
      }))
    );
  }

  private buildProduitNomenclatureNodes(
    composeId: any,
    parentQuantity: number,
    depth: number = 0,
    visited: Set<number> = new Set<number>()
  ): any {
    const articleId = Number(composeId || 0);
    if (!articleId || depth > 4 || visited.has(articleId)) {
      return of([]);
    }

    const nextVisited = new Set(visited);
    nextVisited.add(articleId);

    return this.baseService.getArticleNomenclature(articleId).pipe(
      catchError(() => of({ data: [] })),
      switchMap((response: any) => {
        const rows = this.extractRows(response);
        if (rows.length === 0) {
          return of([]);
        }

        return forkJoin(rows.map((line: any) => {
          const node = this.buildProduitNomenclatureNode(line, parentQuantity);
          if (!node.article_id || depth >= 4 || nextVisited.has(node.article_id) || !this.nomenclatureArticleIds.has(node.article_id)) {
            return of(node);
          }

          return this.buildProduitNomenclatureNodes(node.article_id, node.quantiteTotale, depth + 1, nextVisited).pipe(
            map((children: ProduitNomenclatureNode[]) => ({ ...node, children }))
          );
        }));
      })
    );
  }

  private buildProduitNomenclatureNode(line: any, parentQuantity: number): ProduitNomenclatureNode {
    const articleId = Number(line?.Composant_id || line?.composant_id || line?.article_id || 0) || 0;
    const article = this.getArticleById(articleId);
    const unitQuantity = this.toNumber(line?.Quantite ?? line?.quantite, 0);
    const totalQuantity = unitQuantity * this.toNumber(parentQuantity, 1);
    const price = this.getArticlePrice(article, line);

    return {
      article_id: articleId,
      code: article?.article_cod || line?.composant_cod || line?.article_cod || '',
      designation: article?.article_nom || line?.composant_nom || line?.article_nom || '',
      quantite: unitQuantity,
      quantiteTotale: totalQuantity,
      prix: price,
      total: price * totalQuantity,
      unite: line?.unite_nom || article?.unite_nom || '',
      famille: line?.famille_nom || article?.famille_nom || article?.famille || '',
      poidsStandard: line?.Poids_Standard != null ? this.toNumber(line.Poids_Standard, 0) : null,
      poidsReel: line?.Poids_reel != null ? this.toNumber(line.Poids_reel, 0) : null,
      children: []
    };
  }

  private createEmptyNomenclatureRow(produit: any): ProduitNomenclatureRow {
    const articleId = Number(produit?.article_id || 0);
    const article = this.getArticleById(articleId) || produit;

    return {
      article_id: articleId,
      code: article?.article_cod || produit?.article_cod || '',
      designation: article?.article_nom || produit?.article_nom || '',
      prix: this.getArticlePrice(article, produit),
      composants: [],
      composantsCount: 0,
      total: 0
    };
  }

  private refreshArticleLookup(articles: any[]): void {
    if (!Array.isArray(articles) || articles.length === 0) {
      return;
    }

    this.articleLookup = new Map(
      articles
        .filter((article: any) => Number(article?.article_id || 0) > 0)
        .map((article: any) => [Number(article.article_id), article])
    );
  }

  private extractRows(response: any): any[] {
    const rows = response?.data || response || [];
    return Array.isArray(rows) ? rows : [];
  }

  private getArticleById(articleId: any): any {
    const id = Number(articleId || 0);
    if (!id) {
      return null;
    }

    return this.articleLookup.get(id)
      || (this.produits || []).find((produit: any) => Number(produit?.article_id || 0) === id)
      || null;
  }

  private getArticlePrice(article: any, fallback: any = null): number {
    return this.toNumber(
      article?.prix_vente
        ?? article?.pu
        ?? article?.prix_quantite
        ?? article?.prix
        ?? fallback?.prix_vente
        ?? fallback?.composant_prix
        ?? fallback?.pu
        ?? fallback?.prix_quantite
        ?? fallback?.prix,
      0
    );
  }

  private toNumber(value: any, fallback: number = 0): number {
    const numeric = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  private flattenNomenclatureNodes(nodes: ProduitNomenclatureNode[]): ProduitNomenclatureNode[] {
    return (Array.isArray(nodes) ? nodes : []).reduce((result: ProduitNomenclatureNode[], node: ProduitNomenclatureNode) => {
      result.push(node);
      if (Array.isArray(node.children) && node.children.length > 0) {
        result.push(...this.flattenNomenclatureNodes(node.children));
      }
      return result;
    }, []);
  }

  private sumNomenclatureTotal(nodes: ProduitNomenclatureNode[]): number {
    return (Array.isArray(nodes) ? nodes : []).reduce((sum: number, node: ProduitNomenclatureNode) => {
      const childrenTotal = Array.isArray(node.children) && node.children.length > 0
        ? this.sumNomenclatureTotal(node.children)
        : 0;
      return sum + this.toNumber(node.total, 0) + childrenTotal;
    }, 0);
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
          this.showError(`❌ Erreur lors de l'archivage: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    });
  }

  openStatsModal(produit: any): void {
    const articleId = produit?.article_id;
    if (!articleId) {
      this.showError('Identifiant produit introuvable.');
      return;
    }

    this.selectedStatsArticle = produit;
    this.statsData = null;
    this.statsLoading = true;
    this.showStatsModal = true;
    this.lockBodyScroll();
    this.destroyStatsCharts();

    this.baseService.getArticleStatistics(articleId).subscribe({
      next: (response: any) => {
        this.statsData = response?.data || response || null;
        this.statsLoading = false;
        setTimeout(() => this.renderStatsCharts(), 0);
      },
      error: (err) => {
        this.statsLoading = false;
        this.showError(`Impossible de charger les statistiques de cet article: ${err.error?.message || err.message || 'Erreur inconnue'}`);
      }
    });
  }

  closeStatsModal(): void {
    this.showStatsModal = false;
    this.statsLoading = false;
    this.selectedStatsArticle = null;
    this.statsData = null;
    this.destroyStatsCharts();
    this.unlockBodyScroll();
  }

  getRecommendationIcon(tone: string): string {
    switch (tone) {
      case 'positive':
        return 'fas fa-arrow-trend-up';
      case 'warning':
        return 'fas fa-triangle-exclamation';
      case 'alert':
        return 'fas fa-bullseye';
      default:
        return 'fas fa-lightbulb';
    }
  }

  private renderStatsCharts(): void {
    if (!this.showStatsModal || !this.statsData) {
      return;
    }

    const Chart = (window as any).Chart;
    if (!Chart) {
      return;
    }

    this.destroyStatsCharts();

    const monthlySales = Array.isArray(this.statsData?.charts?.monthly_sales) ? this.statsData.charts.monthly_sales : [];
    const supplierBreakdown = Array.isArray(this.statsData?.charts?.supplier_breakdown) ? this.statsData.charts.supplier_breakdown : [];

    const revenueCanvas = document.getElementById('articleStatsRevenueChart') as HTMLCanvasElement | null;
    if (revenueCanvas && monthlySales.length > 0) {
      const revenueCtx = revenueCanvas.getContext('2d');
      if (revenueCtx) {
        this.revenueChart = new Chart(revenueCtx, {
          type: 'line',
          data: {
            labels: monthlySales.map((row: any) => row.month_key),
            datasets: [
              {
                label: 'CA HT (DH)',
                data: monthlySales.map((row: any) => Number(row.revenue_ht || 0)),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.16)',
                fill: true,
                tension: 0.35,
                borderWidth: 2
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'top'
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  callback: function(value: any) {
                    return `${Number(value || 0).toFixed(0)} DH`;
                  }
                }
              }
            }
          }
        });
      }
    }

    const supplierCanvas = document.getElementById('articleStatsSupplierChart') as HTMLCanvasElement | null;
    if (supplierCanvas && supplierBreakdown.length > 0) {
      const supplierCtx = supplierCanvas.getContext('2d');
      if (supplierCtx) {
        this.supplierChart = new Chart(supplierCtx, {
          type: 'doughnut',
          data: {
            labels: supplierBreakdown.map((row: any) => row.label),
            datasets: [
              {
                data: supplierBreakdown.map((row: any) => Number(row.value || 0)),
                backgroundColor: ['#0f766e', '#f97316', '#7c3aed', '#2563eb', '#dc2626', '#14b8a6'],
                borderWidth: 2,
                borderColor: '#ffffff'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: 'right'
              }
            }
          }
        });
      }
    }
  }

  private destroyStatsCharts(): void {
    if (this.revenueChart) {
      this.revenueChart.destroy();
      this.revenueChart = null;
    }
    if (this.supplierChart) {
      this.supplierChart.destroy();
      this.supplierChart = null;
    }
  }

  private lockBodyScroll(): void {
    this.previousBodyOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
  }

  private unlockBodyScroll(): void {
    document.body.style.overflow = this.previousBodyOverflow;
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

  ngOnDestroy(): void {
    this.destroyStatsCharts();
    this.unlockBodyScroll();
  }
}
