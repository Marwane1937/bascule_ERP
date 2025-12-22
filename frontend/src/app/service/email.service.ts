import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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
  private apiUrl = 'http://localhost:3500/api/email';

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

  generateDevisPDF(document_id: string) {
    return this.http.post<any>('http://localhost:3500/api/pdf/generate', { document_id });
  }

  sendDevisWhatsAppPDF(document_id: string, phone: string, message?: string) {
    return this.http.post<any>('http://localhost:3500/api/pdf/send-whatsapp', {
      document_id,
      phone,
      message
    });
  }

  // Méthodes pour les commandes (utilisant le service commande-pdf séparé)
  generateCommandePDF(document_id: string) {
    return this.http.post<any>('http://localhost:3500/api/commande-pdf/generate', { document_id });
  }

  sendCommandeWhatsAppPDF(document_id: string, phone: string, message?: string) {
    return this.http.post<any>('http://localhost:3500/api/commande-pdf/send-whatsapp', {
      document_id,
      phone,
      message
    });
  }

  // Méthode pour générer le PDF de facturation
  generateFacturePDF(facture_id: string) {
    return this.http.post<any>('http://localhost:3500/api/facturation-pdf/generate', { facture_id });
  }

  // Méthodes pour les retours
  generateRetourPDF(document_id: string) {
    return this.http.post<any>('http://localhost:3500/api/retour-pdf/generate', { document_id });
  }

  sendRetourWhatsAppPDF(document_id: string, phone: string, message?: string) {
    return this.http.post<any>('http://localhost:3500/api/retour-pdf/send-whatsapp', {
      document_id,
      phone,
      message
    });
  }

  // Méthode pour générer le PDF des avoirs
  generateAvoirPDF(document_id: string) {
    return this.http.post<any>('http://localhost:3500/api/avoir-pdf/generate', { document_id });
  }

}
