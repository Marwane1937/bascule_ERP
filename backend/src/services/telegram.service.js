const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; // Assurez-vous de configurer cette variable d'environnement

async function sendPdfToTechnician(chatId, pdfBuffer, fileName) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('TELEGRAM_BOT_TOKEN non configuré. Impossible d\'envoyer le PDF via Telegram.');
    return;
  }

  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`;

  try {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('document', new Blob([pdfBuffer], { type: 'application/pdf' }), fileName);

    const response = await axios.post(telegramApiUrl, formData, {
      headers: {
        ...formData.getHeaders()
      }
    });
    console.log('PDF envoyé à Telegram:', response.data);
    return response.data;
  } catch (error) {
    console.error('Erreur lors de l\'envoi du PDF à Telegram:', error.response ? error.response.data : error.message);
    throw new Error('Échec de l\'envoi du PDF à Telegram.');
  }
}

module.exports = {
  sendPdfToTechnician
};













