import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class StockService {
  public apiUrl = 'http://localhost:3500/api';
  private stockBaseUrl = `${this.apiUrl}/stock`;
  httpHeaders = new HttpHeaders().set('Content-Type', 'application/json');

  constructor(public http: HttpClient) { }

  // Force recompilation - timestamp: 2026-01-02

  // ============= ACHATS NON ENTRÉS EN STOCK =============

  /**
   * Récupérer les achats non encore entrés en stock
   */
  getAchatsNonEntresStock(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    if (options.fournisseur) params.append('fournisseur', options.fournisseur);
    const url = `${this.stockBaseUrl}/achats-non-entres${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  /**
   * Récupérer les détails d'un achat pour entrée en stock
   */
  getAchatDetailsForStock(achatDocumentId: number): Observable<any> {
    const url = `${this.stockBaseUrl}/achat-details/${achatDocumentId}`;
    return this.http.get(url);
  }

  // ============= VENTES NON SORTIES DU STOCK =============

  /**
   * Récupérer les ventes facturées non encore sorties du stock
   */
  getVentesNonSortiesStock(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    if (options.client) params.append('client', options.client);
    const url = `${this.stockBaseUrl}/ventes-non-sorties${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  /**
   * Récupérer les détails d'une vente pour sortie de stock
   */
  getVenteDetailsForStock(venteDocumentId: number): Observable<any> {
    const url = `${this.stockBaseUrl}/vente-details/${venteDocumentId}`;
    return this.http.get(url);
  }

  // ============= ARTICLES AVEC STOCK =============

  /**
   * Récupérer les articles avec leur stock
   */
  getArticlesStock(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    const url = `${this.stockBaseUrl}/articles-stock${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  // ============= DOCUMENTS DE STOCK =============

  /**
   * Récupérer tous les documents de stock
   */
  getAllStockDocuments(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    if (options.type) params.append('type', options.type);
    const url = `${this.stockBaseUrl}/documents${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  /**
   * Récupérer un document de stock par ID
   */
  getStockDocumentById(id: number): Observable<any> {
    const url = `${this.stockBaseUrl}/documents/${id}`;
    return this.http.get(url);
  }

  // ============= CRÉATION DE MOUVEMENTS DE STOCK =============

  /**
   * Créer une entrée de stock depuis un achat
   */
  createEntreeStockFromAchat(achatDocumentId: number, details: any[]): Observable<any> {
    const data = { achatDocumentId, details };
    return this.http.post(`${this.stockBaseUrl}/entree-achat`, data);
  }

  /**
   * Obtenir le prochain numéro d'entrée de stock
   */
  getNextEntreeStockNumero(): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/next-entree-stock-numero`);
  }

  /**
   * Récupérer toutes les entrées de stock avec pagination
   */
  getEntreesStock(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    if (options.fournisseur) params.append('fournisseur', options.fournisseur);
    const url = `${this.stockBaseUrl}/entrees-stock${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  /**
   * Créer une nouvelle entrée de stock
   */
  createEntreeStock(data: any): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/entree-stock`, data);
  }

  /**
   * Récupérer une entrée de stock par ID
   */
  getEntreeStockById(id: number): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/entree-stock/${id}`);
  }

  /**
   * Créer une sortie de stock depuis une vente
   */
  createSortieStockFromVente(venteDocumentId: number, details: any[]): Observable<any> {
    const data = { venteDocumentId, details };
    return this.http.post(`${this.stockBaseUrl}/sortie-vente`, data);
  }

  /**
   * Créer un inventaire
   */
  createInventaire(inventaireData: any[], description: string): Observable<any> {
    const data = { inventaireData, description };
    return this.http.post(`${this.stockBaseUrl}/inventaire`, data);
  }

  /**
   * Créer un en-tête d'inventaire (type=10)
   */
  createInventaireHeader(description: string): Observable<any> {
    const data = { description, type: 10 };
    return this.http.post(`${this.stockBaseUrl}/inventaire-header`, data);
  }

  /**
   * Récupérer un inventaire par ID
   */
  getInventaireById(id: number): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/inventaire/${id}`);
  }

  /**
   * Récupérer les données de v_stock_calcul pour export Excel
   */
  getStockCalculData(): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/stock-calcul`);
  }

  /**
   * Enregistrer les lignes d'inventaire
   */
  saveInventaireLignes(inventaireId: number, lignes: any[]): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/inventaire/${inventaireId}/lignes`, { lignes });
  }

  /**
   * Mettre à jour la date d'un inventaire
   */
  updateInventaireDate(inventaireId: number, date: string): Observable<any> {
    return this.http.put(`${this.stockBaseUrl}/inventaire/${inventaireId}/date`, { date });
  }
 
  /**
   * Valider l'inventaire et comparer avec le stock réel
   */
  validerInventaire(inventaireId: number): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/inventaire/${inventaireId}/valider`, {});
  }

  /**
   * Exporter le résultat de comparaison en Excel
   */
  exportInventaireComparaison(inventaireId: number): Observable<Blob> {
    return this.http.get(`${this.stockBaseUrl}/inventaire/${inventaireId}/export-excel`, {
      responseType: 'blob'
    });
  }

  /**
   * Vider toutes les lignes d'inventaire
   */
  viderInventaireLignes(inventaireId: number): Observable<any> {
    return this.http.delete(`${this.stockBaseUrl}/inventaire/${inventaireId}/lignes`);
  }

  /**
   * Validation finale de l'inventaire (transfert vers stock et stock_detail)
   */
  validationFinaleInventaire(inventaireId: number): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/inventaire/${inventaireId}/validation-finale`, {});
  }

  // ============= REPORTING STOCK =============

  /**
   * Récupérer l'état détaillé du stock
   */
  getEtatStock(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    if (options.depotId) params.append('depotId', options.depotId.toString());
    if (options.stockMinimum) params.append('stockMinimum', options.stockMinimum.toString());
    const url = `${this.stockBaseUrl}/etat-stock${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  /**
   * Récupérer la fiche de stock pour un article
   */
  getFicheStock(articleId: number | null, options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    if (options.article_nom) params.append('article_nom', options.article_nom);
    if (options.article) params.append('article', options.article);
    if (options.article_id) params.append('article_id', options.article_id.toString()); // Filtre par ID article
    const articleIdParam = articleId ? `/${articleId}` : '/0';
    const url = `${this.stockBaseUrl}/fiche-stock${articleIdParam}${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  /**
   * Récupérer le chiffre d'affaires par article
   */
  getChiffreAffairesArticles(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    const url = `${this.stockBaseUrl}/chiffre-affaires-articles${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  /**
   * Mettre à jour une entrée de stock
   */
  updateEntreeStock(id: number, data: any): Observable<any> {
    return this.http.put(`${this.stockBaseUrl}/entree-stock/${id}`, data);
  }

  /**
   * Sauvegarder les lignes de détail d'une entrée de stock
   */
  saveLignesDetailEntreeStock(lignes: any[]): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/entree-stock/save`, { lignes });
  }

  /**
   * Sauvegarder les informations d'une entrée de stock
   */
  saveLignesInfoEntreeStock(info: any): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/entree-stock/info`, info);
  }

  /**
   * Supprimer des lignes de détail d'une entrée de stock
   */
  removeDetailLigneEntreeStock(ligneIds: number[]): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/entree-stock/delete-lignes`, { ligneIds });
  }

  // ============= SORTIES DE STOCK =============

  /**
   * Obtenir le prochain numéro de sortie de stock
   */
  getNextSortieStockNumero(): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/next-sortie-stock-numero`);
  }

  /**
   * Récupérer toutes les sorties de stock avec pagination
   */
  getSortiesStock(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    if (options.client) params.append('client', options.client);
    if (options.type) params.append('type', options.type.toString());
    const url = `${this.stockBaseUrl}/sorties-stock${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  /**
   * Créer une nouvelle sortie de stock
   */
  createSortieStock(data: any): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/sortie-stock`, data);
  }

  /**
   * Récupérer une sortie de stock par ID
   */
  getSortieStockById(id: number): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/sortie-stock/${id}`);
  }

  /**
   * Mettre à jour une sortie de stock
   */
  updateSortieStock(id: number, data: any): Observable<any> {
    return this.http.put(`${this.stockBaseUrl}/sortie-stock/${id}`, data);
  }

  /**
   * Sauvegarder les lignes de détail d'une sortie de stock
   */
  saveLignesDetailSortieStock(lignes: any[]): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/sortie-stock/save`, { lignes });
  }

  /**
   * Sauvegarder les informations d'une sortie de stock
   */
  saveLignesInfoSortieStock(info: any): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/sortie-stock/info`, info);
  }

  /**
   * Supprimer des lignes de détail d'une sortie de stock
   */
  removeDetailLigneSortieStock(ligneIds: number[]): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/sortie-stock/delete-lignes`, { ligneIds });
  }

  /**
   * Récupérer l'historique depuis v_stock_final
   */
  getStockHistorique(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.article_nom) params.append('article_nom', options.article_nom);
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    const url = `${this.stockBaseUrl}/historique${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  /**
   * Exporter l'historique en PDF
   */
  exportStockHistoriquePDF(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.article_nom) params.append('article_nom', options.article_nom);
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    if (options.status) params.append('status', options.status);
    const url = `${this.stockBaseUrl}/historique/export-pdf${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  /**
   * Exporter l'historique en Excel
   */
  exportStockHistoriqueExcel(options: any = {}): Observable<Blob> {
    const params = new URLSearchParams();
    if (options.article_nom) params.append('article_nom', options.article_nom);
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    if (options.status) params.append('status', options.status);
    const url = `${this.stockBaseUrl}/historique/export-excel${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url, { responseType: 'blob' });
  }

  /**
   * Exporter l'état de stock en PDF
   */
  exportEtatStockPDF(options: any = {}): Observable<Blob> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    const url = `${this.stockBaseUrl}/etat-stock/export/pdf${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url, { responseType: 'blob' });
  }

  /**
   * Exporter l'état de stock en Excel
   */
  exportEtatStockExcel(options: any = {}): Observable<Blob> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    const url = `${this.stockBaseUrl}/etat-stock/export/excel${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url, { responseType: 'blob' });
  }

  /**
   * Exporter la fiche de stock en PDF
   */
  exportFicheStockPDF(articleId: number | null, options: any = {}): Observable<Blob> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    if (options.article_nom) params.append('article_nom', options.article_nom);
    const articleIdParam = articleId ? `/${articleId}` : '/0';
    const url = `${this.stockBaseUrl}/fiche-stock${articleIdParam}/export/pdf${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url, { responseType: 'blob' });
  }

  /**
   * Exporter la fiche de stock en Excel
   */
  exportFicheStockExcel(articleId: number | null, options: any = {}): Observable<Blob> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    if (options.article_nom) params.append('article_nom', options.article_nom);
    const articleIdParam = articleId ? `/${articleId}` : '/0';
    const url = `${this.stockBaseUrl}/fiche-stock${articleIdParam}/export/excel${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url, { responseType: 'blob' });
  }

  /**
   * Exporter le chiffre d'affaires en PDF
   */
  exportChiffreAffairesPDF(options: any = {}): Observable<Blob> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    const url = `${this.stockBaseUrl}/chiffre-affaires-articles/export/pdf${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url, { responseType: 'blob' });
  }

  /**
   * Exporter le chiffre d'affaires en Excel
   */
  exportChiffreAffairesExcel(options: any = {}): Observable<Blob> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    const url = `${this.stockBaseUrl}/chiffre-affaires-articles/export/excel${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url, { responseType: 'blob' });
  }
}
