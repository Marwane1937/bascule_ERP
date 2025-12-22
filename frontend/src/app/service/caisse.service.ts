import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CaisseService {
  public apiUrl = 'http://localhost:3500/api';
  httpHeaders = new HttpHeaders().set('Content-Type', 'application/json');

  constructor(public http: HttpClient) { }

  // Récupérer tous les documents de caisse
  getCaisseDocuments(options: any = {}): Observable<any> {
    const params = new URLSearchParams();
    if (options.page) params.append('page', options.page.toString());
    if (options.pageSize) params.append('pageSize', options.pageSize.toString());
    if (options.orderBy) params.append('orderBy', options.orderBy);
    if (options.orderDirection) params.append('orderDirection', options.orderDirection);
    if (options.search) params.append('search', options.search);
    if (options.sens !== null && options.sens !== undefined) params.append('sens', options.sens.toString());
    // Toujours envoyer le type, même s'il est null (pour distinguer null de undefined)
    if (options.hasOwnProperty('type')) {
      if (options.type !== null && options.type !== undefined) {
        params.append('type', options.type.toString());
      } else {
        params.append('type', 'null'); // Envoyer 'null' comme string pour indiquer explicitement null
      }
    }
    const url = `${this.apiUrl}/caisse${params.toString() ? '?' + params.toString() : ''}`;
    return this.http.get(url);
  }

  // Récupérer un document par ID
  getCaisseDocumentById(id: number): Observable<any> {
    const url = `${this.apiUrl}/caisse/${id}`;
    return this.http.get(url);
  }

  // Créer un document de caisse
  createCaisseDocument(document: any, details: any[]): Observable<any> {
    const url = `${this.apiUrl}/caisse`;
    return this.http.post(url, { document, details });
  }

  // Mettre à jour un document
  updateCaisseDocument(id: number, document: any, details: any[]): Observable<any> {
    const url = `${this.apiUrl}/caisse/${id}`;
    return this.http.put(url, { document, details });
  }

  // Clôturer un document
  cloturerCaisseDocument(id: number): Observable<any> {
    const url = `${this.apiUrl}/caisse/${id}/cloturer`;
    return this.http.put(url, {});
  }

  // Supprimer un document
  deleteCaisseDocument(id: number): Observable<any> {
    const url = `${this.apiUrl}/caisse/${id}`;
    return this.http.delete(url);
  }

  // Obtenir le solde de caisse
  // caisseType: 'declared' = caisse déclarée, 'black' = caisse black
  // onlyNonCloturees: true = uniquement les caisses non clôturées, false = toutes les caisses
  getSoldeCaisse(date?: string, caisseType?: string, onlyNonCloturees: boolean = false): Observable<any> {
    let url = `${this.apiUrl}/caisse/solde`;
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (caisseType) params.append('type', caisseType);
    params.append('onlyNonCloturees', onlyNonCloturees.toString());
    if (params.toString()) {
      url += '?' + params.toString();
    }
    return this.http.get(url);
  }

  // Créer depuis un règlement
  createCaisseFromReglement(reglement: any, lettrages: any[]): Observable<any> {
    const url = `${this.apiUrl}/caisse/from-reglement`;
    return this.http.post(url, { reglement, lettrages });
  }

  // Obtenir le prochain numéro de caisse
  getNextCaisseNumero(prefix: string): Observable<any> {
    const url = `${this.apiUrl}/caisse/next-numero/${prefix}`;
    return this.http.get(url);
  }

  // Générer le PDF de la caisse
  generateCaissePDF(caisseId: number): Observable<any> {
    const url = `${this.apiUrl}/caisse-pdf/generate`;
    return this.http.post(url, { caisse_id: caisseId });
  }

  // Générer un rapport PDF avec plage de dates
  // caisseType: 'declared' = caisse déclarée, 'black' = caisse black
  generateRapportPDF(dateFrom: string, dateTo: string, caisseType?: string): Observable<any> {
    const url = `${this.apiUrl}/caisse-pdf/rapport`;
    return this.http.post(url, { dateFrom, dateTo, caisseType });
  }

  // Générer un rapport PDF filtré par employé et plage de dates
  // caisseType: 'declared' = caisse déclarée, 'black' = caisse black
  generateRapportPDFByEmploye(dateFrom: string, dateTo: string, employeId: number, caisseType?: string): Observable<any> {
    const url = `${this.apiUrl}/caisse-pdf/rapport-by-employe`;
    return this.http.post(url, { dateFrom, dateTo, employeId, caisseType });
  }

  // Générer le PDF de la caisse filtré par employé
  generateCaissePDFByEmploye(caisseId: number, employeId: number): Observable<any> {
    const url = `${this.apiUrl}/caisse-pdf/generate-by-employe`;
    return this.http.post(url, { caisse_id: caisseId, employe_id: employeId });
  }

  // Envoyer le PDF de la caisse par employé via Telegram
  sendCaissePDFByEmployeTelegram(caisseId: number, employeId: number, chatId: string, message?: string): Observable<any> {
    const url = `${this.apiUrl}/caisse-pdf/send-telegram-by-employe`;
    return this.http.post(url, { caisse_id: caisseId, employe_id: employeId, chat_id: chatId, message });
  }

  // Envoyer le PDF de la caisse par employé via WhatsApp (méthode conservée pour compatibilité)
  sendCaissePDFByEmployeWhatsApp(caisseId: number, employeId: number, message?: string): Observable<any> {
    const url = `${this.apiUrl}/caisse-pdf/send-whatsapp-by-employe`;
    return this.http.post(url, { caisse_id: caisseId, employe_id: employeId, message });
  }
  // Générer un rapport PDF pour les rubriques 2000/3000
  generateRapportGroup2000_3000(dateFrom: string, dateTo: string, caisseType?: string, rubriqueIds?: any[]): Observable<any> {
    const url = `${this.apiUrl}/caisse-pdf/rapport-group-2000-3000`;
    return this.http.post(url, { dateFrom, dateTo, caisseType, rubriqueIds });
  }
}

