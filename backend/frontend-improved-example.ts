// Version améliorée de votre code pour WhatsApp Web

// Dans votre service Angular, gardez cette méthode :
generateDevisPDF(document_id: string) {
  return this.http.post<any>('http://localhost:3500/api/pdf/generate', { document_id });
}

// Dans votre composant TypeScript, version améliorée :
envoyerWhatsApp(devis: any) {
  const numero = prompt('Entrez le numéro WhatsApp du client (ex: 212612345678):');
  if (!numero) return;

  // Validation basique du numéro
  const numeroNettoye = numero.replace(/\D/g, ''); // Garde seulement les chiffres
  if (numeroNettoye.length < 10) {
    alert('Numéro de téléphone invalide');
    return;
  }

  // Message personnalisable
  const messagePersonnalise = prompt('Message personnalisé (optionnel):') || 
    'Bonjour,\n\nVotre devis est prêt ! Vous pouvez le télécharger via le lien ci-dessous.\n\nCordialement,\nCactus Informatique';

  // Afficher un loader pendant la génération
  const loadingElement = document.createElement('div');
  loadingElement.innerHTML = '🔄 Génération du PDF en cours...';
  loadingElement.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:1px solid #ccc;border-radius:5px;z-index:9999;';
  document.body.appendChild(loadingElement);

  this.emailService.generateDevisPDF(this.route.snapshot.paramMap.get('document_id')!).subscribe({
    next: (res) => {
      // Supprimer le loader
      document.body.removeChild(loadingElement);
      
      if (res.success && res.pdfUrl) {
        // Construire le message avec le lien PDF
        const messageComplet = `${messagePersonnalise}\n\n📄 Télécharger le devis : ${res.pdfUrl}`;
        const messageEncode = encodeURIComponent(messageComplet);
        const whatsappUrl = `https://wa.me/${numeroNettoye}?text=${messageEncode}`;
        
        // Ouvrir WhatsApp Web
        window.open(whatsappUrl, '_blank');
        
        // Optionnel : Afficher une confirmation
        alert('WhatsApp Web ouvert ! Le message est prêt à être envoyé.');
      } else {
        alert('❌ Impossible de générer le PDF. Vérifiez que le devis existe.');
      }
    },
    error: (err) => {
      // Supprimer le loader en cas d'erreur
      document.body.removeChild(loadingElement);
      
      console.error('Erreur PDF :', err);
      alert('❌ Erreur lors de la génération du devis : ' + (err.error?.message || err.message));
    }
  });
}

// Version alternative avec bouton de confirmation
envoyerWhatsAppAvecConfirmation(devis: any) {
  const numero = prompt('Entrez le numéro WhatsApp du client (ex: 212612345678):');
  if (!numero) return;

  const numeroNettoye = numero.replace(/\D/g, '');
  if (numeroNettoye.length < 10) {
    alert('Numéro de téléphone invalide');
    return;
  }

  const messagePersonnalise = prompt('Message personnalisé (optionnel):') || 
    'Bonjour,\n\nVotre devis est prêt ! Vous pouvez le télécharger via le lien ci-dessous.\n\nCordialement,\nCactus Informatique';

  // Confirmation avant envoi
  const confirmer = confirm(`Envoyer le devis à ${numeroNettoye} ?\n\nMessage : "${messagePersonnalise}"`);
  if (!confirmer) return;

  // Génération et envoi...
  this.emailService.generateDevisPDF(this.route.snapshot.paramMap.get('document_id')!).subscribe({
    next: (res) => {
      if (res.success && res.pdfUrl) {
        const messageComplet = `${messagePersonnalise}\n\n📄 Télécharger le devis : ${res.pdfUrl}`;
        const messageEncode = encodeURIComponent(messageComplet);
        const whatsappUrl = `https://wa.me/${numeroNettoye}?text=${messageEncode}`;
        
        window.open(whatsappUrl, '_blank');
      } else {
        alert('❌ Impossible de générer le PDF.');
      }
    },
    error: (err) => {
      console.error('Erreur PDF :', err);
      alert('❌ Erreur lors de la génération du devis.');
    }
  });
}

