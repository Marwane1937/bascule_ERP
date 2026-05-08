import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class StockService {
  public apiUrl = environment.apiUrl;
  private stockBaseUrl = `${this.apiUrl}/stock`;
  httpHeaders = new HttpHeaders().set('Content-Type', 'application/json');

  constructor(public http: HttpClient) { }

  // Force recompilation - timestamp: 2026-01-02

  // ============= ACHATS NON ENTRÃ‰S EN STOCK =============

  /**
   * RÃ©cupÃ©rer les achats non encore entrÃ©s en stock
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
   * RÃ©cupÃ©rer les dÃ©tails d'un achat pour entrÃ©e en stock
   */
  getAchatDetailsForStock(achatDocumentId: number): Observable<any> {
    const url = `${this.stockBaseUrl}/achat-details/${achatDocumentId}`;
    return this.http.get(url);
  }

  // ============= VENTES NON SORTIES DU STOCK =============

  /**
   * RÃ©cupÃ©rer les ventes facturÃ©es non encore sorties du stock
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
   * RÃ©cupÃ©rer les dÃ©tails d'une vente pour sortie de stock
   */
  getVenteDetailsForStock(venteDocumentId: number): Observable<any> {
    const url = `${this.stockBaseUrl}/vente-details/${venteDocumentId}`;
    return this.http.get(url);
  }

  // ============= ARTICLES AVEC STOCK =============

  /**
   * RÃ©cupÃ©rer les articles avec leur stock
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
   * RÃ©cupÃ©rer tous les documents de stock
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
   * RÃ©cupÃ©rer un document de stock par ID
   */
  getStockDocumentById(id: number): Observable<any> {
    const url = `${this.stockBaseUrl}/documents/${id}`;
    return this.http.get(url);
  }

  // ============= CRÃ‰ATION DE MOUVEMENTS DE STOCK =============

  /**
   * CrÃ©er une entrÃ©e de stock depuis un achat
   */
  createEntreeStockFromAchat(achatDocumentId: number, details: any[]): Observable<any> {
    const data = { achatDocumentId, details };
    return this.http.post(`${this.stockBaseUrl}/entree-achat`, data);
  }

  /**
   * Obtenir le prochain numÃ©ro d'entrÃ©e de stock
   */
  getNextEntreeStockNumero(): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/next-entree-stock-numero`);
  }

  /**
   * RÃ©cupÃ©rer toutes les entrÃ©es de stock avec pagination
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
   * CrÃ©er une nouvelle entrÃ©e de stock
   */
  createEntreeStock(data: any): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/entree-stock`, data);
  }

  /**
   * RÃ©cupÃ©rer une entrÃ©e de stock par ID
   */
  getEntreeStockById(id: number): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/entree-stock/${id}`);
  }

  /**
   * CrÃ©er une sortie de stock depuis une vente
   */
  createSortieStockFromVente(venteDocumentId: number, details: any[]): Observable<any> {
    const data = { venteDocumentId, details };
    return this.http.post(`${this.stockBaseUrl}/sortie-vente`, data);
  }

  /**
   * CrÃ©er un inventaire
   */
  createInventaire(inventaireData: any[], description: string): Observable<any> {
    const data = { inventaireData, description };
    return this.http.post(`${this.stockBaseUrl}/inventaire`, data);
  }

  /**
   * CrÃ©er un en-tÃªte d'inventaire (type=10)
   */
  createInventaireHeader(description: string): Observable<any> {
    const data = { description, type: 10 };
    return this.http.post(`${this.stockBaseUrl}/inventaire-header`, data);
  }

  /**
   * RÃ©cupÃ©rer un inventaire par ID
   */
  getInventaireById(id: number): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/inventaire/${id}`);
  }

  /**
   * RÃ©cupÃ©rer les donnÃ©es de v_stock_calcul pour export Excel
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
   * Mettre Ã  jour la date d'un inventaire
   */
  updateInventaireDate(inventaireId: number, date: string): Observable<any> {
    return this.http.put(`${this.stockBaseUrl}/inventaire/${inventaireId}/date`, { date });
  }
 
  /**
   * Valider l'inventaire et comparer avec le stock rÃ©el
   */
  validerInventaire(inventaireId: number): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/inventaire/${inventaireId}/valider`, {});
  }

  /**
   * Exporter le rÃ©sultat de comparaison en Excel
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
   * RÃ©cupÃ©rer l'Ã©tat dÃ©taillÃ© du stock
   */
  getEtatStock(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    if (options.article) params.append('article', options.article);
    if (options.articleId) params.append('articleId', options.articleId.toString());
    if (options.articleCode) params.append('articleCode', options.articleCode);
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    if (options.depotId) params.append('depotId', options.depotId.toString());
    if (options.stockMinimum) params.append('stockMinimum', options.stockMinimum.toString());
    const url = `${this.stockBaseUrl}/etat-stock${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  /**
   * RÃ©cupÃ©rer la fiche de stock pour un article
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
   * RÃ©cupÃ©rer le chiffre d'affaires par article
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

  getEntrepotResume(): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/entrepots`);
  }

  getEntrepotDetails(depotId: number): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/entrepots/${depotId}/details`);
  }

  getPreparations(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.search) params.append('search', options.search);
    const url = `${this.stockBaseUrl}/preparations${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  getNextPreparationNumero(): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/preparations/next-numero`);
  }

  getCommandesDisponiblesPourPreparation(): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/preparations/commandes-disponibles`);
  }

  createPreparation(data: {
    description?: string;
    sourceCommandeId?: number | null;
    date?: string | null;
    part_id?: number | null;
    contact_id?: number | null;
    depot_id?: number | null;
    date_fin?: string | null;
  }): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/preparations`, data);
  }

  getPreparationById(id: number): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/preparations/${id}`);
  }

  searchPreparationArticles(term: string): Observable<any> {
    const params = new URLSearchParams();
    if (term != null) params.append('term', term);
    const url = `${this.stockBaseUrl}/preparations/article-search${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  updatePreparation(id: number, data: any): Observable<any> {
    return this.http.put(`${this.stockBaseUrl}/preparations/${id}`, data);
  }

  savePreparationLines(id: number, lignes: any[]): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/preparations/${id}/lignes`, { lignes });
  }

  transfererPreparationVersLivraison(id: number): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/preparations/${id}/transfer-to-livraison`, {});
  }

  exportPreparationPdf(id: number): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.stockBaseUrl}/preparations/${id}/pdf`, {
      responseType: 'blob',
      observe: 'response'
    });
  }

  getPreparationPdfUrl(id: number): string {
    return `${this.stockBaseUrl}/preparations/${id}/pdf`;
  }

  /**
   * Mettre Ã  jour une entrÃ©e de stock
   */
  updateEntreeStock(id: number, data: any): Observable<any> {
    return this.http.put(`${this.stockBaseUrl}/entree-stock/${id}`, data);
  }

  /**
   * Sauvegarder les lignes de dÃ©tail d'une entrÃ©e de stock
   */
  saveLignesDetailEntreeStock(lignes: any[]): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/entree-stock/save`, { lignes });
  }

  /**
   * Sauvegarder les informations d'une entrÃ©e de stock
   */
  saveLignesInfoEntreeStock(info: any): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/entree-stock/info`, info);
  }

  /**
   * Supprimer des lignes de dÃ©tail d'une entrÃ©e de stock
   */
  removeDetailLigneEntreeStock(ligneIds: number[]): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/entree-stock/delete-lignes`, { ligneIds });
  }

  // ============= SORTIES DE STOCK =============

  /**
   * Obtenir le prochain numÃ©ro de sortie de stock
   */
  getNextSortieStockNumero(): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/next-sortie-stock-numero`);
  }

  /**
   * RÃ©cupÃ©rer toutes les sorties de stock avec pagination
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
   * CrÃ©er une nouvelle sortie de stock
   */
  createSortieStock(data: any): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/sortie-stock`, data);
  }

  /**
   * RÃ©cupÃ©rer une sortie de stock par ID
   */
  getSortieStockById(id: number): Observable<any> {
    return this.http.get(`${this.stockBaseUrl}/sortie-stock/${id}`);
  }

  /**
   * Mettre Ã  jour une sortie de stock
   */
  updateSortieStock(id: number, data: any): Observable<any> {
    return this.http.put(`${this.stockBaseUrl}/sortie-stock/${id}`, data);
  }

  /**
   * Transferer une sortie de stock vers un bon de livraison
   */
  transferSortieStockToLivraison(sortieStockId: number): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/sortie-stock/transfer-to-livraison`, { sortieStockId });
  }

  /**
   * Sauvegarder les lignes de dÃ©tail d'une sortie de stock
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
   * Supprimer des lignes de dÃ©tail d'une sortie de stock
   */
  removeDetailLigneSortieStock(ligneIds: number[]): Observable<any> {
    return this.http.post(`${this.stockBaseUrl}/sortie-stock/delete-lignes`, { ligneIds });
  }

  /**
   * RÃ©cupÃ©rer l'historique depuis v_stock_final
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
   * Exporter l'Ã©tat de stock en PDF
   */
  exportEtatStockPDF(options: any = {}): Observable<Blob> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    if (options.article) params.append('article', options.article);
    if (options.articleId) params.append('articleId', options.articleId.toString());
    if (options.articleCode) params.append('articleCode', options.articleCode);
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    if (options.depotId) params.append('depotId', options.depotId.toString());
    if (options.stockMinimum) params.append('stockMinimum', options.stockMinimum.toString());
    const url = `${this.stockBaseUrl}/etat-stock/export/pdf${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url, { responseType: 'blob' });
  }

  /**
   * Exporter l'Ã©tat de stock en Excel
   */
  exportEtatStockExcel(options: any = {}): Observable<Blob> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    if (options.article) params.append('article', options.article);
    if (options.articleId) params.append('articleId', options.articleId.toString());
    if (options.articleCode) params.append('articleCode', options.articleCode);
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    if (options.depotId) params.append('depotId', options.depotId.toString());
    if (options.stockMinimum) params.append('stockMinimum', options.stockMinimum.toString());
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
