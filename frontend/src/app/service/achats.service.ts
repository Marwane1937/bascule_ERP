import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AchatsService {
  public apiUrl = 'http://localhost:3500/api';
  // Route backend pour les achats (bon de commande)
  private achatsBaseUrl = `${this.apiUrl}/achats`;
  httpHeaders = new HttpHeaders().set('Content-Type', 'application/json');

  constructor(public http: HttpClient) { }

  // Sauvegarder un détail (accepte un objet ou un tableau)
  saveDetail(data: any): Observable<any> {
    return this.http.post(`${this.achatsBaseUrl}/save`, data);
  }

  // Sauvegarder plusieurs lignes de détail
  saveDetails(lignes: any[]): Observable<any> {
    return this.http.post(`${this.achatsBaseUrl}/save`, lignes);
  }

  // Sauvegarder les infos
  saveInfo(data: any): Observable<any> {
    return this.http.post(`${this.achatsBaseUrl}/info`, data);
  }

  // Supprimer des lignes par IDs
  deleteLignesParIds(ids: number[]): Observable<any> {
    return this.http.post(`${this.achatsBaseUrl}/delete-lignes`, { ids });
  }

  ///////////////// METHOD GET - BON DE COMMANDE
  getBonCommande(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    const url = `${this.achatsBaseUrl}/bon-commande${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  ////////////////// METHOD GET BY ID - BON DE COMMANDE
  getBonCommandeById(id: number): Observable<any> {
    const url = `${this.achatsBaseUrl}/${id}`;
    return this.http.get(url);
  }

  //////////////// METHOD POST - BON DE COMMANDE
  addBonCommande(data: any): Observable<any> {
    return this.http.post(`${this.achatsBaseUrl}`, data);
  }

  // Obtenir le prochain numéro de bon de commande
  getNextBonCommandeNumero(): Observable<any> {
    const url = `${this.achatsBaseUrl}/next-bon-commande-numero`;
    return this.http.get(url);
  }

  //////////////// METHOD PUT - BON DE COMMANDE
  updateBonCommande(id: number, data: any): Observable<any> {
    return this.http.put(`${this.achatsBaseUrl}/${id}`, data);
  }

  //////////////// METHOD DELETE - BON DE COMMANDE
  deleteBonCommande(id: number): Observable<any> {
    return this.http.post(`${this.achatsBaseUrl}/delete`, { id });
  }

  //////////////// TÉLÉCHARGER PDF - BON DE COMMANDE
  telechargerPDF(id: number, withStamp: boolean = false): Observable<Blob> {
    const url = `${this.achatsBaseUrl}/pdf/${id}${withStamp ? '?withStamp=true' : ''}`;
    return this.http.get(url, { responseType: 'blob' });
  }

  // ================= FACTURES FOURNISSEUR =================
  
  private facturesFournisseurUrl = `${this.apiUrl}/factures-fournisseur`;

  // Liste des factures fournisseur avec pagination
  getFacturesFournisseur(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    const url = `${this.facturesFournisseurUrl}${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  // Récupérer une facture fournisseur par ID
  getFactureFournisseurById(id: number): Observable<any> {
    return this.http.get(`${this.facturesFournisseurUrl}/${id}`);
  }

  // Récupérer les commandes non facturées
  getCommandesNonFacturees(): Observable<any> {
    return this.http.get(`${this.facturesFournisseurUrl}/commandes-non-facturees`);
  }

  // Créer une facture depuis une commande
  createFactureFournisseurFromCommande(commandeId: number): Observable<any> {
    return this.http.post(`${this.facturesFournisseurUrl}/from-commande`, { commandeId });
  }

  // Supprimer une facture fournisseur
  deleteFactureFournisseur(id: number): Observable<any> {
    return this.http.post(`${this.facturesFournisseurUrl}/delete`, { id });
  }

  // Télécharger le PDF de facture fournisseur
  telechargerPDFFactureFournisseur(id: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/facture-fournisseur-pdf/${id}`, { responseType: 'blob' });
  }
}

