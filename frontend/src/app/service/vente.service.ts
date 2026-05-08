import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class VenteService {
  private apiUrl = `${environment.apiUrl}/vente`;

  constructor(private http: HttpClient) { }

  getClientSuggestions(options: any = {}): Observable<any> {
    let params = new HttpParams();
    if (options.search !== undefined) params = params.set('search', options.search || '');
    if (options.limit) params = params.set('limit', options.limit.toString());
    return this.http.get(`${this.apiUrl}/reporting/client-suggestions`, { params });
  }

  getArticleSuggestions(options: any = {}): Observable<any> {
    let params = new HttpParams();
    if (options.search !== undefined) params = params.set('search', options.search || '');
    if (options.limit) params = params.set('limit', options.limit.toString());
    return this.http.get(`${this.apiUrl}/reporting/article-suggestions`, { params });
  }

  // ============= REPORTING VENTE =============

  /**
   * Récupérer le grand livre
   */
  getGrandLivre(options: any = {}): Observable<any> {
    let params = new HttpParams();
    if (options.page) params = params.set('page', options.page.toString());
    if (options.pageSize) params = params.set('pageSize', options.pageSize.toString());
    if (options.orderBy) params = params.set('orderBy', options.orderBy);
    if (options.orderDirection) params = params.set('orderDirection', options.orderDirection);
    if (options.search) params = params.set('search', options.search);
    if (options.dateFrom) params = params.set('dateFrom', options.dateFrom);
    if (options.dateTo) params = params.set('dateTo', options.dateTo);

    return this.http.get(`${this.apiUrl}/reporting/grand-livre`, { params });
  }

  /**
   * Récupérer les factures par client
   */
  getFacturesByClient(options: any = {}): Observable<any> {
    let params = new HttpParams();
    if (options.page) params = params.set('page', options.page.toString());
    if (options.pageSize) params = params.set('pageSize', options.pageSize.toString());
    if (options.orderBy) params = params.set('orderBy', options.orderBy);
    if (options.orderDirection) params = params.set('orderDirection', options.orderDirection);
    if (options.search) params = params.set('search', options.search);
    if (options.dateFrom) params = params.set('dateFrom', options.dateFrom);
    if (options.dateTo) params = params.set('dateTo', options.dateTo);

    return this.http.get(`${this.apiUrl}/reporting/factures-client`, { params });
  }

  /**
   * Récupérer le chiffre d'affaires par article
   */
  getChiffreAffairesArticles(options: any = {}): Observable<any> {
    let params = new HttpParams();
    if (options.page) params = params.set('page', options.page.toString());
    if (options.pageSize) params = params.set('pageSize', options.pageSize.toString());
    if (options.orderBy) params = params.set('orderBy', options.orderBy);
    if (options.orderDirection) params = params.set('orderDirection', options.orderDirection);
    if (options.search) params = params.set('search', options.search);
    if (options.dateFrom) params = params.set('dateFrom', options.dateFrom);
    if (options.dateTo) params = params.set('dateTo', options.dateTo);

    return this.http.get(`${this.apiUrl}/reporting/ca-articles`, { params });
  }

  /**
   * Récupérer le chiffre d'affaires par client
   */
  getChiffreAffairesClients(options: any = {}): Observable<any> {
    let params = new HttpParams();
    if (options.page) params = params.set('page', options.page.toString());
    if (options.pageSize) params = params.set('pageSize', options.pageSize.toString());
    if (options.orderBy) params = params.set('orderBy', options.orderBy);
    if (options.orderDirection) params = params.set('orderDirection', options.orderDirection);
    if (options.search) params = params.set('search', options.search);
    if (options.dateFrom) params = params.set('dateFrom', options.dateFrom);
    if (options.dateTo) params = params.set('dateTo', options.dateTo);

    return this.http.get(`${this.apiUrl}/reporting/ca-clients`, { params });
  }
}
