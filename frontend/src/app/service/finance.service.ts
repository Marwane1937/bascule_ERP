import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FinanceService {
  private apiUrl = 'http://localhost:3500/api/finance';

  constructor(private http: HttpClient) { }

  // ============= REPORTING FINANCE =============

  /**
   * Récupérer les comptes clients
   */
  getCompteClient(options: any = {}): Observable<any> {
    let params = new HttpParams();
    if (options.page) params = params.set('page', options.page.toString());
    if (options.pageSize) params = params.set('pageSize', options.pageSize.toString());
    if (options.orderBy) params = params.set('orderBy', options.orderBy);
    if (options.orderDirection) params = params.set('orderDirection', options.orderDirection);
    if (options.search) params = params.set('search', options.search);

    return this.http.get(`${this.apiUrl}/reporting/compte-client`, { params });
  }

  /**
   * Récupérer la balance client
   */
  getBalanceClient(options: any = {}): Observable<any> {
    let params = new HttpParams();
    if (options.page) params = params.set('page', options.page.toString());
    if (options.pageSize) params = params.set('pageSize', options.pageSize.toString());
    if (options.orderBy) params = params.set('orderBy', options.orderBy);
    if (options.orderDirection) params = params.set('orderDirection', options.orderDirection);
    if (options.search) params = params.set('search', options.search);
    if (options.dateFrom) params = params.set('dateFrom', options.dateFrom);
    if (options.dateTo) params = params.set('dateTo', options.dateTo);

    return this.http.get(`${this.apiUrl}/reporting/balance-client`, { params });
  }

  /**
   * Récupérer les soldes clients
   */
  getSoldeClient(options: any = {}): Observable<any> {
    let params = new HttpParams();
    if (options.page) params = params.set('page', options.page.toString());
    if (options.pageSize) params = params.set('pageSize', options.pageSize.toString());
    if (options.orderBy) params = params.set('orderBy', options.orderBy);
    if (options.orderDirection) params = params.set('orderDirection', options.orderDirection);
    if (options.search) params = params.set('search', options.search);

    return this.http.get(`${this.apiUrl}/reporting/solde-client`, { params });
  }

  /**
   * Récupérer la vue globale
   */
  getVueGlobale(options: any = {}): Observable<any> {
    let params = new HttpParams();
    if (options.dateFrom) params = params.set('dateFrom', options.dateFrom);
    if (options.dateTo) params = params.set('dateTo', options.dateTo);

    return this.http.get(`${this.apiUrl}/reporting/vue-globale`, { params });
  }
}

