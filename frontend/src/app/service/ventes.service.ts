import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class VentesService {
  public apiUrl = environment.apiUrl;
  httpHeaders = new HttpHeaders().set('Content-Type', 'application/json');

  constructor(public http: HttpClient) { }

  ///////////////// METHOD GET
  getDevis(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    const url = `${this.apiUrl}/devis/devis${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  getDevisNonTransferes(): Observable<any> {
    const url = `${this.apiUrl}/devis/devis-non-transferes`;
    return this.http.get(url);
  }

  getCommande(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    const url = `${this.apiUrl}/devis/commande${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }
  ////////////////// METHOD GET BY ID
  getDevisById(id: number): Observable<any> {
    const url = `${this.apiUrl}/devis/${id}`;
    return this.http.get(url);
  }

  getCommandeById(id: number): Observable<any> {
    const url = `${this.apiUrl}/devis/${id}`;
    return this.http.get(url);
  }
  //////////////// METHOD POST

  addDevis(data: any) {
    return this.http.post(`${this.apiUrl}/devis`, data);
  }

  // Obtenir le prochain numéro de commande avec le compteur BLC
  getNextCommandeNumero(): Observable<any> {
    const url = `${this.apiUrl}/devis/next-commande-numero`;
    return this.http.get(url);
  }

  getNextDevisNumero(): Observable<any> {
    const url = `${this.apiUrl}/devis/next-devis-numero`;
    return this.http.get(url);
  }

  // Créer une nouvelle commande (avec etat=2)
  addCommande(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/devis/commande`, data);
  }

  SaveLignesDetailDevis(lignes: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/devis/save`, { lignes });
  }

  SaveLignesInfoDevis(lignes: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/devis/info`,  lignes ,{
    headers: { 'Content-Type': 'application/json' }
  });
  }

RemoveDetailLigne(ids: any[]): Observable<any> {
  return this.http.post(`${this.apiUrl}/devis/delete-lignes`, { ids }, {
    headers: { 'Content-Type': 'application/json' }
  });
}
RemoveDevis(ids: any[]): Observable<any> {
  return this.http.post(`${this.apiUrl}/devis/delete`, { ids }, {
    headers: { 'Content-Type': 'application/json' }
  });
}

////////////////////////// METHOD PUT
  // 🔁 Méthode pour modifier un devis
  updateDevis(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/devis/${id}`, data);
  }

  // 🔁 Méthode pour modifier une commande
  updateCommande(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/devis/${id}`, data);
  }

  // 🔄 Méthode pour transférer un devis vers une commande
  transfererDevisVersCommande(devisId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/devis/transfer`, { devisId });
  }

  // ============ LIVRAISONS ============
  
  // Obtenir toutes les livraisons avec pagination
  getLivraisons(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    const url = `${this.apiUrl}/livraisons/livraisons${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  // Obtenir les commandes non livrées
  getCommandesNonLivrees(): Observable<any> {
    const url = `${this.apiUrl}/livraisons/commandes-non-livrees`;
    return this.http.get(url);
  }

  // Obtenir une livraison par ID
  getLivraisonById(id: number): Observable<any> {
    const url = `${this.apiUrl}/livraisons/${id}`;
    return this.http.get(url);
  }

  // Obtenir le prochain numéro de livraison
  getNextLivraisonNumero(): Observable<any> {
    const url = `${this.apiUrl}/livraisons/next-livraison-numero`;
    return this.http.get(url);
  }

  // Créer une nouvelle livraison
  addLivraison(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/livraisons/livraison`, data);
  }

  // Sauvegarder les lignes de détail d'une livraison
  SaveLignesDetailLivraison(lignes: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/livraisons/save`, { lignes });
  }

  // Sauvegarder les informations d'une livraison
  SaveLignesInfoLivraison(lignes: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/livraisons/info`, lignes, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Supprimer des lignes de détail
  RemoveDetailLigneLivraison(ids: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/livraisons/delete-lignes`, { ligneIds: ids }, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Supprimer une livraison
  RemoveLivraison(ids: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/livraisons/delete`, { ids }, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Mettre à jour une livraison
  updateLivraison(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/livraisons/${id}`, data);
  }

  // Transférer une commande vers une livraison
  transfererCommandeVersLivraison(commandeId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/livraisons/transfer`, { commandeId });
  }

  // Récupérer les données de la livraison pour la popup
  getLivraisonDataForTransfer(stockId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/livraisons/transfer-data/${stockId}`);
  }

  // Transférer une livraison vers la facturation
  transfererLivraisonVersFacturation(stockId: number, factureDate: string, partId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/livraisons/transfer-to-facturation`, { stockId, factureDate, partId });
  }

  // Transférer une commande vers la facturation (crée deux fois dans stock/stock_detail ET dans facture/facture_souche)
  transfererCommandeVersFacturation(commandeId: number, factureDate: string, partId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/livraisons/commande-to-facturation`, { commandeId, factureDate, partId });
  }

  // ============ RETOURS ============
  
  // Obtenir tous les retours avec pagination
  getRetours(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    const url = `${this.apiUrl}/retours/retours${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  // Obtenir un retour par ID
  getRetourById(id: number): Observable<any> {
    const url = `${this.apiUrl}/retours/${id}`;
    return this.http.get(url);
  }

  // Obtenir le prochain numéro de retour
  getNextRetourNumero(): Observable<any> {
    const url = `${this.apiUrl}/retours/next-retour-numero`;
    return this.http.get(url);
  }

  // Créer un nouveau retour
  addRetour(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/retours/retour`, data);
  }

  // Sauvegarder les lignes de détail d'un retour
  SaveLignesDetailRetour(lignes: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/retours/save`, { lignes });
  }

  // Sauvegarder les informations d'un retour
  SaveLignesInfoRetour(lignes: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/retours/info`, lignes, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Supprimer des lignes de détail
  RemoveDetailLigneRetour(ids: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/retours/delete-lignes`, { ligneIds: ids }, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Supprimer un retour
  RemoveRetour(ids: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/retours/delete`, { ids }, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Mettre à jour un retour
  updateRetour(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/retours/${id}`, data);
  }

  // ============ RÈGLEMENTS ============
  getReglements(options?: {
    page?: number;
    pageSize?: number;
    orderBy?: string;
    orderDirection?: string;
    search?: string;
  }): Observable<any> {
    let url = `${this.apiUrl}/reglements/`;
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options?.orderBy) params.append('orderBy', options.orderBy);
    if (options?.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options?.search) params.append('search', options.search);
    if (params.toString()) url += '?' + params.toString();
    return this.http.get(url);
  }

  getReglementById(regle_id: number): Observable<any> {
    const url = `${this.apiUrl}/reglements/${regle_id}`;
    return this.http.get(url);
  }

  addReglement(data: any): Observable<any> {
    const url = `${this.apiUrl}/reglements/`;
    return this.http.post(url, data);
  }

  updateReglement(regle_id: number, data: any): Observable<any> {
    const url = `${this.apiUrl}/reglements/${regle_id}`;
    return this.http.put(url, data);
  }

  deleteReglement(regle_id: number): Observable<any> {
    const url = `${this.apiUrl}/reglements/${regle_id}`;
    return this.http.delete(url);
  }

  getModeReglements(): Observable<any> {
    const url = `${this.apiUrl}/reglements/modes`;
    return this.http.get(url);
  }

  getNextReglementNumero(): Observable<any> {
    const url = `${this.apiUrl}/reglements/next-numero`;
    return this.http.get(url);
  }

  // Récupérer les factures d'un client pour le lettrage
  getFacturesForLettrage(part_id: number): Observable<any> {
    const url = `${this.apiUrl}/reglements/factures/${part_id}`;
    return this.http.get(url);
  }

  // Enregistrer le lettrage des factures
  saveLettrageFactures(regle_id: number, lettrages: any[]): Observable<any> {
    const url = `${this.apiUrl}/reglements/${regle_id}/lettrage`;
    return this.http.post(url, { lettrages });
  }

  // ============ FACTURATIONS ============
  
  // Obtenir toutes les factures avec pagination
  getFactures(options?: {
    page?: number;
    pageSize?: number;
    orderBy?: string;
    orderDirection?: string;
    search?: string;
  }): Observable<any> {
    let url = `${this.apiUrl}/facturations/`;
    
    if (options) {
      const params = new URLSearchParams();
      if (options.page) params.append('page', options.page.toString());
      if (options.pageSize) params.append('pageSize', options.pageSize.toString());
      if (options.orderBy) params.append('orderBy', options.orderBy);
      if (options.orderDirection) params.append('orderDirection', options.orderDirection);
      if (options.search) params.append('search', options.search);
      
      const queryString = params.toString();
      if (queryString) {
        url += '?' + queryString;
      }
    }
    
    return this.http.get(url);
  }

  // Obtenir une facture par ID
  getFactureById(id: number): Observable<any> {
    const url = `${this.apiUrl}/facturations/${id}`;
    return this.http.get(url);
  }

  // Obtenir les montants HT et TVA d'une facture depuis v_facture_montant
  getFactureMontant(factureId: number): Observable<any> {
    const url = `${this.apiUrl}/facturations/${factureId}/montant`;
    return this.http.get(url);
  }

  // ============ AVOIRS ============
  
  // Obtenir tous les avoirs avec pagination
  getAvoirs(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    const url = `${this.apiUrl}/avoirs/avoirs${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  // Obtenir un avoir par ID
  getAvoirById(id: number): Observable<any> {
    const url = `${this.apiUrl}/avoirs/${id}`;
    return this.http.get(url);
  }

  // Obtenir le prochain numéro d'avoir
  getNextAvoirNumero(): Observable<any> {
    const url = `${this.apiUrl}/avoirs/next-avoir-numero`;
    return this.http.get(url);
  }

  // Créer un avoir financier
  addAvoirFinancier(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/avoirs/financier`, data);
  }

  // Créer un avoir marchandise
  addAvoirMarchandise(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/avoirs/marchandise`, data);
  }

  // Mettre à jour un avoir
  updateAvoir(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/avoirs/${id}`, data);
  }

  // Supprimer un avoir
  RemoveAvoir(ids: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/avoirs/delete`, { ids }, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ========== CONTRATS ==========
  
  // Récupérer tous les contrats
  getContrats(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    if (options.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options.dateTo) params.append('dateTo', options.dateTo);
    
    return this.http.get(`${this.apiUrl}/contrats?${params.toString()}`, {
      headers: this.httpHeaders
    });
  }

  // Récupérer un contrat par ID
  getContrat(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/contrats/${id}`, {
      headers: this.httpHeaders
    });
  }

  // Créer un nouveau contrat
  createContrat(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/contrats`, data, {
      headers: this.httpHeaders
    });
  }

  // Mettre à jour un contrat
  updateContrat(id: number, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/contrats/${id}`, data, {
      headers: this.httpHeaders
    });
  }

  // Supprimer un contrat
  deleteContrat(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/contrats/${id}`, {
      headers: this.httpHeaders
    });
  }

  // Récupérer les conditions de paiement
  getConditionsPaiement(): Observable<any> {
    return this.http.get(`${this.apiUrl}/contrats/conditions-paiement`, {
      headers: this.httpHeaders
    });
  }

  // Récupérer les données d'un contrat pour transfert vers facturation
  getContratDataForTransfer(contratId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/contrats/${contratId}`, {
      headers: this.httpHeaders
    });
  }

  // Transférer un contrat vers facturation
  transfererContratVersFacturation(contratId: number, factureDate: string, partId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/contrats/${contratId}/facturer`, {
      factureDate,
      partId
    }, {
      headers: this.httpHeaders
    });
  }

  // Sauvegarder les lignes de détails d'un contrat
  SaveLignesDetailContrat(lignes: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/contrats/save-detail`, { lignes }, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Supprimer des lignes de détail d'un contrat
  RemoveDetailLigneContrat(ids: any[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/contrats/delete-lignes`, { ligneIds: ids }, {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
