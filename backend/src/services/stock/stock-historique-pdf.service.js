const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { renderFormattedText } = require('../pdf-format-helper');

/**
 * Service dédié à la génération de PDF pour l'historique des mouvements de stock
 */

function stripHtmlTags(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function htmlToPlainText(html) {
  if (!html) return '';
  return stripHtmlTags(html).replace(/[ \t]+/g, ' ').trim();
}

function genererPDF(historiqueData, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      if (!historiqueData || historiqueData.length === 0) {
        throw new Error('Aucune donnée d\'historique fournie');
      }

      // Créer le dossier pour les PDFs d'historique
      const historiqueDir = path.join(__dirname, '..', '..', 'public', 'stock-historique');
      if (!fs.existsSync(historiqueDir)) {
        fs.mkdirSync(historiqueDir, { recursive: true });
      }

      // Nom du fichier avec date
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `historique_stock_${dateStr}.pdf`;
      const pdfPath = path.join(historiqueDir, fileName);

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const writeStream = fs.createWriteStream(pdfPath);

      writeStream.on('finish', () => {
        resolve(pdfPath);
      });

      writeStream.on('error', (err) => {
        console.error('❌ Erreur écriture PDF historique stock :', err);
        reject(err);
      });

      doc.pipe(writeStream);

      // === CONSTANTES POUR LA PAGINATION ===
      const tableBorderRadius = 5;
      const articlesTableHeaderHeight = 20;
      const maxYBeforeNewPage = 700;
      const pageHeight = 842;

      // === FONCTION: Dessiner l'en-tête du document (logo, titre) ===
      const drawDocumentHeader = (isFirstPage = false) => {
        // Récupérer la taille du logo depuis la configuration
        const logoSize = options.documentSociete?.logoSize || { width: 100, height: null };
        const imageOptions = { width: logoSize.width };
        if (logoSize.height) {
          imageOptions.height = logoSize.height;
        }
        
        // Logo
        if (options.documentSociete && options.documentSociete.logo) {
          try {
            const logoBuffer = Buffer.from(options.documentSociete.logo, 'base64');
            doc.image(logoBuffer, 50, 20, imageOptions);
          } catch (error) {
            const logoPath = path.join(__dirname, '..', '..', 'public', 'logo-bascule.jpg');
            if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, imageOptions);
          }
        } else {
          const logoPath = path.join(__dirname, '..', '..', 'public', 'logo-bascule.jpg');
          if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, imageOptions);
        }

        // En-tête entreprise
        if (options.documentSociete && options.documentSociete.entete && options.documentSociete.entete.trim()) {
          const enteteText = htmlToPlainText(options.documentSociete.entete);
          const enteteLines = enteteText.split('\n').filter(line => line.trim());
          if (enteteLines.length > 0) {
            let yPos = 20; // Aligné avec le haut du logo
            enteteLines.forEach(line => {
              if (line.trim()) {
                doc.fontSize(10).font('Helvetica-Bold').fillColor('#046ba7').text(line.trim(), 160, yPos);
                yPos += 12;
              }
            });
          }
        }

        // Ligne de séparation
        doc.rect(40, 100, 520, 1).fill('#000');

        // Titre du document
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#000').text('HISTORIQUE DES MOUVEMENTS DE STOCK', 50, 120);

        // Informations de filtrage si disponibles
        if (isFirstPage) {
          let infoY = 160;
          if (options.dateFrom || options.dateTo) {
            doc.fontSize(10).font('Helvetica').fillColor('#000');
            const dateRange = `Du ${options.dateFrom || '...'} au ${options.dateTo || '...'}`;
            doc.text(`Période : ${dateRange}`, 50, infoY);
            infoY += 15;
          }
          if (options.status) {
            doc.text(`Status : ${options.status}`, 50, infoY);
            infoY += 15;
          }
          return infoY + 10;
        } else {
          return 140;
        }
      };

      // === FONCTION: Dessiner l'en-tête du tableau ===
      const drawTableHeader = (y) => {
        const lightGrayColor = '#E0E0E0';
        const tableStartX = 40;
        const tableWidth = 525;
        doc.roundedRect(tableStartX, y, tableWidth, articlesTableHeaderHeight, tableBorderRadius).fill(lightGrayColor).stroke('#000');
        doc.lineWidth(1).roundedRect(tableStartX, y, tableWidth, articlesTableHeaderHeight, tableBorderRadius).stroke('#000');
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');

        // Colonnes
        const colCodX = 40;
        const colCodWidth = 70;
        const colNomX = 110;
        const colNomWidth = 200;
        const colDateX = 310;
        const colDateWidth = 70;
        const colQteX = 380;
        const colQteWidth = 60;
        const colMouvX = 440;
        const colMouvWidth = 60;
        const colStatusX = 500;
        const colStatusWidth = 65;

        doc.text('Code', colCodX + 5, y + 6, { width: colCodWidth - 10, align: 'center' });
        doc.text('Nom Article', colNomX + 5, y + 6, { width: colNomWidth - 10, align: 'left' });
        doc.text('Date', colDateX + 5, y + 6, { width: colDateWidth - 10, align: 'center' });
        doc.text('Quantité', colQteX + 5, y + 6, { width: colQteWidth - 10, align: 'center' });
        doc.text('Mouvement', colMouvX + 5, y + 6, { width: colMouvWidth - 10, align: 'center' });
        doc.text('Status', colStatusX + 5, y + 6, { width: colStatusWidth - 10, align: 'center' });

        return y + articlesTableHeaderHeight;
      };

      // === FONCTION: Dessiner le pied de page ===
      const drawPageFooter = () => {
        const footerBgColor = '#E8F4F8';
        const footerPageHeight = 842;
        const bottomMargin = 40;
        const footerHeight = 32;
        const footerY = footerPageHeight - bottomMargin - footerHeight;
        const footerLineSpacing = 5;
        const footerStartY = footerY + 2;

        doc.save();
        doc.rect(0, footerY, 595, footerHeight).fill(footerBgColor);
        doc.restore();

        if (options.documentSociete && options.documentSociete.pied_page) {
          const piedPage = options.documentSociete.pied_page;
          // Vérifier si c'est un objet JSON ou du texte brut
          if (typeof piedPage === 'object' || (typeof piedPage === 'string' && piedPage.trim())) {
            renderFormattedText(doc, piedPage, {
              startX: 50,
              startY: footerStartY,
              defaultFontSize: 7,
              defaultColor: '#000000',
              defaultFont: 'Helvetica',
              defaultAlign: 'center',
              defaultLineSpacing: 5,
              width: 495
            });
          }
        }
      };

      // === DESSINER L'EN-TÊTE DE LA PREMIÈRE PAGE ===
      let y = drawDocumentHeader(true);
      drawPageFooter();
      y = drawTableHeader(y);

      // Positions des colonnes
      const colCodX = 40;
      const colCodWidth = 70;
      const colNomX = 110;
      const colNomWidth = 200;
      const colDateX = 310;
      const colDateWidth = 70;
      const colQteX = 380;
      const colQteWidth = 60;
      const colMouvX = 440;
      const colMouvWidth = 60;
      const colStatusX = 500;
      const colStatusWidth = 65;

      const rowHeight = 18;
      const inventoryColor = '#fff3cd';
      const entreeColor = '#d1e7dd';
      const sortieColor = '#f8d7da';
      const entreeTextColor = '#198754';
      const sortieTextColor = '#dc3545';

      // === RENDU DES LIGNES DU TABLEAU AVEC PAGINATION ===
      historiqueData.forEach((item, index) => {
        // Nouvelle page si nécessaire
        if (y + rowHeight > maxYBeforeNewPage) {
          doc.addPage();
          drawPageFooter();
          y = drawDocumentHeader(false);
          y = drawTableHeader(y);
        }

        // Déterminer si c'est un inventaire
        const isInventory = item.status && item.status.toString().toLowerCase().includes('inventory');
        const quantite = parseFloat(item.quantite) || 0;
        const isEntree = quantite > 0;

        // Couleur de fond selon le type
        let rowBgColor = '#ffffff';
        if (isInventory) {
          rowBgColor = inventoryColor;
        } else if (isEntree) {
          rowBgColor = entreeColor;
        } else {
          rowBgColor = sortieColor;
        }

        // Dessiner le fond de la ligne
        doc.roundedRect(40, y, 525, rowHeight, 0).fill(rowBgColor).stroke('#ddd');
        doc.lineWidth(0.5).strokeColor('#ddd');

        // Données de la ligne
        const code = item.article_cod || '-';
        const nom = item.article_nom || '-';
        let date = '-';
        if (item.date) {
          const dateObj = new Date(item.date);
          const day = String(dateObj.getDate()).padStart(2, '0');
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const year = dateObj.getFullYear();
          const hours = String(dateObj.getHours()).padStart(2, '0');
          const minutes = String(dateObj.getMinutes()).padStart(2, '0');
          date = `${day}/${month}/${year} à ${hours}:${minutes}`;
        }
        const quantiteStr = quantite > 0 ? `+${quantite}` : quantite.toString();
        const mouvement = item.mouvement || (isEntree ? 'Entrée' : 'Sortie');
        const status = item.status || '-';

        // Code
        doc.fontSize(8).font('Helvetica').fillColor('#000');
        doc.text(code.substring(0, 15), colCodX + 5, y + 4, { width: colCodWidth - 10, align: 'left' });

        // Nom
        doc.text(nom.substring(0, 35), colNomX + 5, y + 4, { width: colNomWidth - 10, align: 'left' });

        // Date
        doc.text(date, colDateX + 5, y + 4, { width: colDateWidth - 10, align: 'center' });

        // Quantité en gras avec couleur
        if (isEntree) {
          doc.fillColor(entreeTextColor);
        } else {
          doc.fillColor(sortieTextColor);
        }
        doc.font('Helvetica-Bold');
        doc.text(quantiteStr, colQteX + 5, y + 4, { width: colQteWidth - 10, align: 'center' });
        doc.font('Helvetica');
        doc.fillColor('#000');

        // Mouvement
        doc.text(mouvement.substring(0, 10), colMouvX + 5, y + 4, { width: colMouvWidth - 10, align: 'center' });

        // Status
        doc.text(status.substring(0, 12), colStatusX + 5, y + 4, { width: colStatusWidth - 10, align: 'center' });

        y += rowHeight;
      });

      // Total
      doc.fontSize(9).fillColor('#000').font('Helvetica-Bold');
      doc.text(`Total: ${historiqueData.length} mouvement(s)`, 50, y + 10);
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 400, y + 10, { align: 'right' });

      doc.end();
    } catch (err) {
      console.error('[genererPDF historique] Erreur:', err);
      reject(err);
    }
  });
}

module.exports = {
  genererPDF
};
