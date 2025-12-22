// Dans votre service Angular, ajoutez cette méthode :
sendDevisWhatsApp(document_id: string, phone: string, message?: string) {
  return this.http.post<any>('http://localhost:3500/api/pdf/send-whatsapp', { 
    document_id, 
    phone, 
    message 
  });
}

// Dans votre composant TypeScript, remplacez envoyerWhatsApp par :
envoyerWhatsApp(devis: any) {
  const numero = prompt('Entrez le numéro WhatsApp du client (ex: 212612345678):');
  if (!numero) return;

  const message = prompt('Message personnalisé (optionnel):') || 'Votre devis est prêt';

  this.emailService.sendDevisWhatsApp(
    this.route.snapshot.paramMap.get('document_id')!, 
    numero, 
    message
  ).subscribe({
    next: (res) => {
      if (res.success) {
        alert('Message WhatsApp envoyé avec succès !');
        console.log('Réponse:', res);
      } else {
        alert('Erreur: ' + res.message);
      }
    },
    error: (err) => {
      console.error('Erreur WhatsApp :', err);
      alert('Erreur lors de l\'envoi WhatsApp: ' + err.error?.message || err.message);
    }
  });
}

// Alternative : Garder l'ancienne méthode (WhatsApp Web) si vous préférez
envoyerWhatsAppWeb(devis: any) {
  const numero = prompt('Entrez le numéro WhatsApp du client (ex: 212612345678):');
  if (!numero) return;

  this.emailService.generateDevisPDF(this.route.snapshot.paramMap.get('document_id')!).subscribe({
    next: (res) => {
      if (res.success && res.pdfUrl) {
        const message = encodeURIComponent(`Bonjour, voici votre devis : ${res.pdfUrl}`);
        const whatsappUrl = `https://wa.me/${numero}?text=${message}`;
        window.open(whatsappUrl, '_blank');
      } else {
        alert('Impossible de générer le PDF.');
      }
    },
    error: (err) => {
      console.error('Erreur PDF :', err);
      alert('Erreur lors de la génération du devis.');
    }
  });
}

