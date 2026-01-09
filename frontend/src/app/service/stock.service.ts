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
   * Créer une sortie de stock
   */
  createSortieStock(details: any[], description: string): Observable<any> {
    const data = { details, description };
    return this.http.post(`${this.stockBaseUrl}/sortie-stock`, data);
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
  getFicheStock(articleId: number, options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    const url = `${this.stockBaseUrl}/fiche-stock/${articleId}${params.toString() ? '?' + params.toString() : ''}`;
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
}
