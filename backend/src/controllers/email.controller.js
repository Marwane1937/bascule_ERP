const emailService = require('../services/email.service'); // ⬅️ change juste le nom

const envoyerEmail = async (req, res) => {
  try {
    const { to, cc, subject, body, document_id, document_type } = req.body;

    if (!to || !document_id) {
      return res.status(400).json({ success: false, message: 'Email destinataire et document_id requis' });
    }

    // Déterminer si c'est une commande ou un devis
    const isCommande = document_type === 'commande' || document_type === 'COMMANDE';
    
    // ✅ Appel correct selon le type de document
    const result = isCommande 
      ? await emailService.envoyerCommandeEmail({ to, cc, subject, body, document_id })
      : await emailService.envoyerEmail({ to, cc, subject, body, document_id });

    return res.status(200).json(result);
    
  } catch (error) {
    console.error('Erreur envoi email :', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { envoyerEmail };
