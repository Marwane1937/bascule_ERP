import { Component, OnInit } from '@angular/core';
import { StockService } from '../../service/stock.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-stock-inventaire',
  templateUrl: './stock-inventaire.component.html',
  styleUrls: ['./stock-inventaire.component.css']
})
export class StockInventaireComponent implements OnInit {

  // Données
  articles: any[] = [];
  inventaireData: { [key: number]: number } = {}; // article_id => stock_reel

  // État
  loading: boolean = false;
  saving: boolean = false;

  // Pagination
  currentPage: number = 1;
  pageSize: number = 50;
  totalRecords: number = 0;
  totalPages: number = 1;

  // Recherche et tri
  searchTerm: string = '';
  sortColumn: string = 'article_nom';
  sortDirection: 'ASC' | 'DESC' = 'ASC';

  constructor(private stockService: StockService) { }

  ngOnInit(): void {
    this.getArticlesPourInventaire();
  }

  // Récupération des articles pour inventaire
  getArticlesPourInventaire(): void {
    this.loading = true;

    const options: any = {
      page: this.currentPage,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: this.searchTerm
    };

    this.stockService.getArticlesStock(options).subscribe({
      next: (response: any) => {
        this.articles = response.data || [];
        this.totalRecords = response.pagination?.total || 0;
        this.totalPages = response.pagination?.totalPages || 1;

        // Initialiser les champs de stock réel avec les valeurs actuelles
        this.articles.forEach(article => {
          if (!this.inventaireData[article.article_id]) {
            this.inventaireData[article.article_id] = article.stock_normal || 0;
          }
        });

        this.loading = false;
      },
      error: (error) => {
        console.error('Erreur chargement articles inventaire:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement des articles', 'error');
        this.loading = false;
      }
    });
  }

  // Recherche
  onSearch(): void {
    this.currentPage = 1;
    this.getArticlesPourInventaire();
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
    this.getArticlesPourInventaire();
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
      this.getArticlesPourInventaire();
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

  // Gestion des données d'inventaire
  onStockReelChange(articleId: number, event: any): void {
    const value = parseFloat(event.target.value) || 0;
    this.inventaireData[articleId] = Math.max(0, value);
  }

  getStockReel(articleId: number): number {
    return this.inventaireData[articleId] || 0;
  }

  getEcart(article: any): number {
    const stockReel = this.getStockReel(article.article_id);
    const stockTheorique = article.stock_normal || 0;
    return stockReel - stockTheorique;
  }

  // Validation de l'inventaire
  validerInventaire(): void {
    // Vérifier qu'il y a des données à sauvegarder
    const hasData = Object.values(this.inventaireData).some(value => value >= 0);

    if (!hasData) {
      Swal.fire('Erreur', 'Aucune donnée d\'inventaire à sauvegarder', 'error');
      return;
    }

    // Demander confirmation
    Swal.fire({
      title: 'Validation de l\'inventaire',
      text: 'Cette action va mettre à jour le stock initial avec les quantités saisies. Cette opération est irréversible.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, valider',
      cancelButtonText: 'Annuler',
      input: 'text',
      inputPlaceholder: 'Description de l\'inventaire (optionnel)',
      inputValidator: (value) => {
        if (!value) {
          return 'Veuillez saisir une description pour l\'inventaire';
        }
        return null;
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const description = result.value;
        this.executerInventaire(description);
      }
    });
  }

  private executerInventaire(description: string): void {
    this.saving = true;

    // Préparer les données d'inventaire
    const inventaireData = this.articles.map(article => ({
      article_id: article.article_id,
      stock_reel: this.getStockReel(article.article_id),
      stock_theorique: article.stock_normal || 0,
      ecart: this.getEcart(article)
    })).filter(item => item.stock_reel >= 0); // Ne garder que les articles avec des données valides

    this.stockService.createInventaire(inventaireData, description).subscribe({
      next: (response: any) => {
        Swal.fire('Succès', response.message || 'Inventaire validé avec succès', 'success');

        // Réinitialiser les données et recharger
        this.inventaireData = {};
        this.getArticlesPourInventaire();

        this.saving = false;
      },
      error: (error) => {
        console.error('Erreur validation inventaire:', error);
        Swal.fire('Erreur', error.error?.message || 'Erreur lors de la validation de l\'inventaire', 'error');
        this.saving = false;
      }
    });
  }

  // Réinitialiser l'inventaire
  reinitialiserInventaire(): void {
    Swal.fire({
      title: 'Réinitialiser',
      text: 'Voulez-vous remettre tous les champs à leur valeur actuelle ?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Oui, réinitialiser',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.inventaireData = {};
        this.articles.forEach(article => {
          this.inventaireData[article.article_id] = article.stock_normal || 0;
        });
      }
    });
  }

  // Méthodes de calcul pour le résumé
  getTotalArticles(): number {
    return this.articles.length;
  }

  getTotalStockTheorique(): number {
    return this.articles.reduce((total, article) => total + (article.stock_normal || 0), 0);
  }

  getTotalStockReel(): number {
    return this.articles.reduce((total, article) => total + this.getStockReel(article.article_id), 0);
  }

  getTotalEcart(): number {
    return this.articles.reduce((total, article) => total + this.getEcart(article), 0);
  }
}

