import { HttpClient, HttpHeaders } from '@angular/common/http';
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
  getFournisseur(): Observable<any> {
    const url = `${this.apiUrl}/clients/fournisseur`;
    return this.http.get(url);
  }
  getCommercial(): Observable<any> {
    const url = `${this.apiUrl}/clients/contact`;
    return this.http.get(url);
  }

  getIdentifiants(): Observable<any> {
    const url = `${this.apiUrl}/clients/identifiant`;
    return this.http.get(url);
  }
  getProduit(): Observable<any> {
    const url = `${this.apiUrl}/articles/article`;
    return this.http.get(url);
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
  saveClientDetails(part_id: string, data: any) {
    return this.http.post(`${this.apiUrl}/clients/${part_id}/details`, data);
  }

  ///////////////////// METHOD DELETE
  deleteClientDetails(data: {
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

}  
