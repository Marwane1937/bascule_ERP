const axios = require('axios');
const FormData = require('form-data');

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
    formData.append('document', pdfBuffer, {
      filename: fileName,
      contentType: 'application/pdf'
    });

    const response = await axios.post(telegramApiUrl, formData, {
      headers: {
        ...formData.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    console.log('[TelegramService] PDF envoyé à Telegram avec succès:', response.data);
    return response.data;
  } catch (error) {
    console.error('[TelegramService] Erreur lors de l\'envoi du PDF à Telegram:', error.response ? error.response.data : error.message);
    if (error.response) {
      console.error('[TelegramService] Détails de l\'erreur Telegram:', JSON.stringify(error.response.data, null, 2));
    }
    throw new Error('Échec de l\'envoi du PDF à Telegram.');
  }
}

module.exports = {
  sendPdfToTechnician
};













