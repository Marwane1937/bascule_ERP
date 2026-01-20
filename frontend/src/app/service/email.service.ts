import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

interface EmailData {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  document_id: number;
}

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private apiUrl = `${environment.apiUrl}/email`;

  constructor(private http: HttpClient) { }

  envoyerDevis(emailData: EmailData): Observable<any> {
    return this.http.post(`${this.apiUrl}/send`, emailData);
  }

  envoyerDevisWhatsApp(numero: string, pdfUrl: string): void {
    if (!numero || !pdfUrl) {
      alert('Numéro ou lien PDF manquant.');
      return;
    }

    const message = encodeURIComponent(`Bonjour, voici votre devis : ${pdfUrl}`);
    const whatsappUrl = `https://wa.me/${numero}?text=${message}`;
    window.open(whatsappUrl, '_blank');
  }

  generateDevisPDF(document_id: string, options?: { withStamp?: boolean; printMode?: 'normal' | 'nomenclature'; composeArticle?: any }) {
    return this.http.post<any>(`${environment.apiUrl}/pdf/generate`, {
      document_id,
      withStamp: !!options?.withStamp,
      printMode: options?.printMode || 'normal',
      composeArticle: options?.composeArticle || null
    });
  }

  sendDevisWhatsAppPDF(document_id: string, phone: string, message?: string) {
    return this.http.post<any>(`${environment.apiUrl}/pdf/send-whatsapp`, {
      document_id,
      phone,
      message
    });
  }

  // Méthodes pour les entrées de stock
  generateEntreeStockPDF(document_id: string, withStamp: boolean = false) {
    return this.http.post<any>(`${environment.apiUrl}/stock/entree-stock/generate-pdf`, {
      document_id,
      withStamp
    });
  }

  generateSortieStockPDF(document_id: string, withStamp: boolean = false) {
    return this.http.post<any>(`${environment.apiUrl}/stock/sortie-stock/generate-pdf`, {
      document_id,
      withStamp
    });
  }

  // Méthodes pour les commandes (utilisant le service commande-pdf séparé)
  generateCommandePDF(document_id: string) {
    return this.http.post<any>(`${environment.apiUrl}/commande-pdf/generate`, { document_id });
  }

  sendCommandeWhatsAppPDF(document_id: string, phone: string, message?: string) {
    return this.http.post<any>(`${environment.apiUrl}/commande-pdf/send-whatsapp`, {
      document_id,
      phone,
      message
    });
  }

  // Méthode pour générer le PDF de facturation
  generateFacturePDF(facture_id: string) {
    return this.http.post<any>(`${environment.apiUrl}/facturation-pdf/generate`, { facture_id });
  }

  // Méthode pour générer le PDF de facture contrat
  generateFactureContratPDF(facture_id: string) {
    return this.http.post<any>(`${environment.apiUrl}/facturation-pdf/generate-contrat`, { facture_id });
  }

  // Méthodes pour les retours
  generateRetourPDF(document_id: string) {
    return this.http.post<any>(`${environment.apiUrl}/retour-pdf/generate`, { document_id });
  }

  sendRetourWhatsAppPDF(document_id: string, phone: string, message?: string) {
    return this.http.post<any>(`${environment.apiUrl}/retour-pdf/send-whatsapp`, {
      document_id,
      phone,
      message
    });
  }

  // Méthode pour générer le PDF des avoirs
  generateAvoirPDF(document_id: string) {
    return this.http.post<any>(`${environment.apiUrl}/avoir-pdf/generate`, { document_id });
  }

}
