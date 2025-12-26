import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class BaseService {
  public apiUrl = 'http://localhost:3500/api';
  httpHeaders = new HttpHeaders().set('Content-Type', 'application/json');
  constructor(public http: HttpClient) { }

  getClient(): Observable<any> {
    const url = `${this.apiUrl}/clients/client`;
    return this.http.get(url);
  }

  getClientsPaged(options: {
    page?: number;
    pageSize?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC' | string;
    search?: string;
  }): Observable<any> {
    const url = `${this.apiUrl}/clients/client/paged`;
    let params = new HttpParams();

    if (options?.page != null) params = params.set('page', String(options.page));
    if (options?.pageSize != null) params = params.set('pageSize', String(options.pageSize));
    if (options?.orderBy) params = params.set('orderBy', options.orderBy);
    if (options?.orderDirection) params = params.set('orderDirection', String(options.orderDirection));
    if (options?.search != null) params = params.set('search', options.search);

    return this.http.get(url, { params });
  }

  createClient(data: { code: string | number; nom: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/clients`, data, { headers: this.httpHeaders });
  }

  getClientById(id: string | number): Observable<any> {
    return this.http.get(`${this.apiUrl}/clients/${id}`);
  }

  updateClient(id: string | number, data: { code: string | number; nom: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/clients/${id}`, data, { headers: this.httpHeaders });
  }

  deleteClient(id: string | number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/clients/${id}`);
  }
  getFournisseur(): Observable<any> {
    const url = `${this.apiUrl}/clients/fournisseur`;
    return this.http.get(url);
  }

  getFournisseursPaged(options: {
    page?: number;
    pageSize?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC' | string;
    search?: string;
  }): Observable<any> {
    const url = `${this.apiUrl}/clients/fournisseur/paged`;
    let params = new HttpParams();

    if (options?.page != null) params = params.set('page', String(options.page));
    if (options?.pageSize != null) params = params.set('pageSize', String(options.pageSize));
    if (options?.orderBy) params = params.set('orderBy', options.orderBy);
    if (options?.orderDirection) params = params.set('orderDirection', String(options.orderDirection));
    if (options?.search != null) params = params.set('search', options.search);

    return this.http.get(url, { params });
  }

  createFournisseur(data: { code: string | number; nom: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/clients/fournisseur`, data, { headers: this.httpHeaders });
  }
  getCommercial(): Observable<any> {
    const url = `${this.apiUrl}/clients/contact`;
    return this.http.get(url);
  }

  getCommercialsPaged(options: {
    page?: number;
    pageSize?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC' | string;
    search?: string;
  }): Observable<any> {
    const url = `${this.apiUrl}/clients/contact/paged`;
    let params = new HttpParams();

    if (options?.page != null) params = params.set('page', String(options.page));
    if (options?.pageSize != null) params = params.set('pageSize', String(options.pageSize));
    if (options?.orderBy) params = params.set('orderBy', options.orderBy);
    if (options?.orderDirection) params = params.set('orderDirection', String(options.orderDirection));
    if (options?.search != null) params = params.set('search', options.search);

    return this.http.get(url, { params });
  }

  createCommercial(data: { code?: string; nom: string; prenom?: string; mobile?: string; phone?: string; email?: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/clients/contact`, data, { headers: this.httpHeaders });
  }

  updateCommercial(id: string, data: { code?: string; nom: string; prenom?: string; mobile?: string; phone?: string; email?: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/clients/contact/${id}`, data, { headers: this.httpHeaders });
  }

  deleteCommercial(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/clients/contact/${id}`);
  }

  archiveCommercial(id: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/clients/contact/${id}/archive`, {}, { headers: this.httpHeaders });
  }

  getIdentifiants(): Observable<any> {
    const url = `${this.apiUrl}/clients/identifiant`;
    return this.http.get(url);
  }
  getProduit(): Observable<any> {
    const url = `${this.apiUrl}/articles/article`;
    return this.http.get(url);
  }

  getProduitsPaged(options: {
    page?: number;
    pageSize?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC' | string;
    search?: string;
  }): Observable<any> {
    const url = `${this.apiUrl}/articles/article/paged`;
    let params = new HttpParams();

    if (options?.page != null) params = params.set('page', String(options.page));
    if (options?.pageSize != null) params = params.set('pageSize', String(options.pageSize));
    if (options?.orderBy) params = params.set('orderBy', options.orderBy);
    if (options?.orderDirection) params = params.set('orderDirection', String(options.orderDirection));
    if (options?.search != null) params = params.set('search', options.search);

    return this.http.get(url, { params });
  }

  getFamille(): Observable<any> {
    const url = `${this.apiUrl}/familles/famille`;
    return this.http.get(url);
  }

  getUnite(): Observable<any> {
    const url = `${this.apiUrl}/familles/unite`;
    return this.http.get(url);
  }

  addFamille(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/familles`, data);
  }

  updateFamille(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/familles/${id}`, data, {
      headers: this.httpHeaders,
    });
  }

  deleteFamille(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/familles/${id}`);
  }

  getVille(): Observable<any> {
    const url = `${this.apiUrl}/clients/ville`;
    return this.http.get(url);
  }

  getListesByGroupId(group_id: number): Observable<any> {
    const url = `${this.apiUrl}/clients/listes/${group_id}`;
    return this.http.get(url);
  }

  getClientComplement(part_id: string) {
    const url = `${this.apiUrl}/clients/complement/${part_id}`;
    return this.http.get(url);
  }

  /////////////////////// METHOD POST
  addProduit(data: any) {
    return this.http.post(`${this.apiUrl}/articles`, data);
  }
  updateProduit(id: string, data: any) {
    return this.http.put(`${this.apiUrl}/articles/${id}`, data, {
      headers: this.httpHeaders,
    });
  }
  deleteProduit(id: string) {
    return this.http.delete(`${this.apiUrl}/articles/${id}`);
  }

  archiveProduit(id: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/articles/${id}/archive`, {}, { headers: this.httpHeaders });
  }
  saveClientDetails(part_id: string, data: any) {
    return this.http.post(`${this.apiUrl}/clients/${part_id}/details`, data);
  }

  ///////////////////// METHOD DELETE
  deleteClientDetails(data: {
    part_id?: string | number,
    identifiants: { id: number }[],
    adresses: { id: number }[],
    contacts: { id: number }[]
  }): Observable<any> {
    const url = `${this.apiUrl}/clients/details/delete`; // sans id dans l'URL
    return this.http.post(url, data, { headers: this.httpHeaders });
  }
  //////////////////// METHOD PUT
  updateClientDetails(part_id: string, data: any) {
    return this.http.put(`${this.apiUrl}/clients/${part_id}/details`, data, {
      headers: this.httpHeaders,
    });
  }

  /////////////////////// EMPLOYE METHODS
  getEmploye(): Observable<any> {
    const url = `${this.apiUrl}/employes`;
    return this.http.get(url);
  }

  getEmployeById(id: string): Observable<any> {
    const url = `${this.apiUrl}/employes/${id}`;
    return this.http.get(url);
  }

  addEmploye(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/employes`, data);
  }

  updateEmploye(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/employes/${id}`, data, {
      headers: this.httpHeaders,
    });
  }

  deleteEmploye(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/employes/${id}`);
  }

  getEmployesActifs(): Observable<any> {
    const url = `${this.apiUrl}/employes/actifs`;
    return this.http.get(url);
  }

  /////////////////////// VEHICULE METHODS
  getVehicule(): Observable<any> {
    const url = `${this.apiUrl}/vehicules`;
    return this.http.get(url);
  }

  getVehiculesWithUrgentCharges(thresholdDays: number = 10): Observable<any> {
    const url = `${this.apiUrl}/vehicules/with-urgent?threshold=${thresholdDays}`;
    return this.http.get(url);
  }

  addVehicule(data: any): Observable<any> {
    const url = `${this.apiUrl}/vehicules`;
    return this.http.post(url, data, { headers: this.httpHeaders });
  }

  getVehiculeById(id: string): Observable<any> {
    const url = `${this.apiUrl}/vehicules/${id}`;
    return this.http.get(url);
  }

  getVehiculeCharges(vehicule_id: string): Observable<any> {
    const url = `${this.apiUrl}/vehicules/${vehicule_id}/charges`;
    return this.http.get(url);
  }

  saveVehiculeCharge(vehicule_id: string, data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/vehicules/${vehicule_id}/charges`, data);
  }

  updateVehiculeCharge(vehicule_id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/vehicules/${vehicule_id}/charges`, data, {
      headers: this.httpHeaders,
    });
  }

  deleteVehiculeCharges(ids: number[]): Observable<any> {
    const url = `${this.apiUrl}/vehicules/charges/delete`;
    return this.http.post(url, { ids }, { headers: this.httpHeaders });
  }

  deleteVehiculeCharge(id: number | string): Observable<any> {
    const url = `${this.apiUrl}/vehicules/charges/${id}`;
    return this.http.delete(url);
  }

  /////////////////////// EXONERATION METHODS
  getExoneration(part_id: string | number): Observable<any> {
    const url = `${this.apiUrl}/clients/${part_id}/exoneration`;
    return this.http.get(url);
  }

  getAllExonerations(part_id: string | number): Observable<any> {
    const url = `${this.apiUrl}/clients/${part_id}/exonerations`;
    return this.http.get(url);
  }

  saveOrUpdateExoneration(part_id: string | number, data: any): Observable<any> {
    const url = `${this.apiUrl}/clients/${part_id}/exoneration`;
    return this.http.put(url, data, { headers: this.httpHeaders });
  }

  deleteExoneration(part_id: string | number): Observable<any> {
    const url = `${this.apiUrl}/clients/${part_id}/exoneration`;
    return this.http.delete(url);
  }

}  
