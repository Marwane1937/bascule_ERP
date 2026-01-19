const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Service dédié à la génération de PDF pour les ENTRÉES DE STOCK
 */

function stripHtmlTags(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function genererPDF(entreeStockData, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      if (!entreeStockData || entreeStockData.length === 0) {
        throw new Error('Aucune donnée d\'entrée de stock fournie');
      }

      const firstLine = entreeStockData[0];

      // Créer le dossier pour les PDFs d'entrée de stock
      const entreesStockDir = path.join(__dirname, '..', '..', 'public', 'entrees-stock');
      if (!fs.existsSync(entreesStockDir)) {
        fs.mkdirSync(entreesStockDir, { recursive: true });
      }

      // Nettoyer le nom du fournisseur pour qu'il soit valide comme nom de fichier
      const fournisseurName = firstLine.fournisseur || 'fournisseur';
      const cleanFournisseurName = fournisseurName.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();

      const entreeStockNum = firstLine.numero || `ES-${Date.now()}`;
      const fileName = `entree_stock_${entreeStockNum}_${cleanFournisseurName}.pdf`;
      const pdfPath = path.join(entreesStockDir, fileName);

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const writeStream = fs.createWriteStream(pdfPath);

      writeStream.on('finish', () => {
        resolve(pdfPath);
      });

      writeStream.on('error', (err) => {
        console.error('❌ Erreur écriture PDF entrée de stock :', err);
        reject(err);
      });

      doc.pipe(writeStream);

      // Configuration des polices et couleurs
      const primaryColor = '#2c3e50';
      const secondaryColor = '#34495e';
      const headerBgColor = '#34495e';
      const headerTextColor = '#ffffff';
      const borderColor = '#dee2e6';
      const zebraColor = '#f8f9fa';

      // En-tête
      const headerY = 50;
      doc.fontSize(20).fillColor(primaryColor).text('ENTRÉE DE STOCK', 0, headerY, { align: 'center' });
      doc.moveDown(0.5);

      // Numéro et date
      doc.fontSize(12).fillColor(secondaryColor);
      doc.text(`N°: ${firstLine.numero || 'N/A'}`, 50, doc.y);
      doc.text(`Date: ${firstLine.date ? new Date(firstLine.date).toLocaleDateString('fr-FR') : 'N/A'}`, 300, doc.y - 15);

      doc.moveDown(2);

      // Informations fournisseur
      doc.fontSize(14).fillColor(primaryColor).text('FOURNISSEUR', 50, doc.y);
      doc.moveDown(0.5);

      doc.fontSize(10).fillColor(secondaryColor);
      doc.text(`Nom: ${firstLine.fournisseur || 'N/A'}`, 50, doc.y);
      doc.text(`Adresse: ${firstLine.adresse || 'N/A'}`, 50, doc.y + 15);

      doc.moveDown(3);

      // Tableau des articles avec rubrique - Style amélioré
      const tableTop = doc.y + 10;
      const tableHeaders = ['Code', 'Désignation', 'Quantité', 'Rubrique'];
      const colWidths = [80, 220, 80, 130]; // Largeurs des colonnes ajustées
      const rowHeight = 25; // Hauteur des lignes
      const headerHeight = 30; // Hauteur de l'en-tête

      // Fond de l'en-tête du tableau
      doc.rect(50, tableTop, 480, headerHeight)
        .fillColor(headerBgColor)
        .fill()
        .fillColor(headerTextColor);

      // En-têtes du tableau avec style
      doc.fontSize(11).font('Helvetica-Bold').fillColor(headerTextColor);
      let xPos = 55;
      tableHeaders.forEach((header, index) => {
        const align = index === 2 ? 'center' : 'left'; // Centrer la quantité
        doc.text(header, xPos, tableTop + 8, { width: colWidths[index] - 10, align: align });
        xPos += colWidths[index];
      });

      // Ligne de séparation sous l'en-tête
      doc.strokeColor(headerBgColor)
        .lineWidth(1)
        .moveTo(50, tableTop + headerHeight)
        .lineTo(530, tableTop + headerHeight)
        .stroke();

      // Données du tableau avec bordures
      let yPos = tableTop + headerHeight;
      doc.fontSize(9).font('Helvetica').fillColor(primaryColor);

      entreeStockData.forEach((item, index) => {
        if (yPos > 700) { // Nouvelle page si nécessaire
          doc.addPage();
          yPos = 50;
          // Réafficher l'en-tête sur la nouvelle page
          doc.rect(50, yPos, 480, headerHeight)
            .fillColor(headerBgColor)
            .fill()
            .fillColor(headerTextColor);
          doc.fontSize(11).font('Helvetica-Bold').fillColor(headerTextColor);
          xPos = 55;
          tableHeaders.forEach((header, idx) => {
            const align = idx === 2 ? 'center' : 'left';
            doc.text(header, xPos, yPos + 8, { width: colWidths[idx] - 10, align: align });
            xPos += colWidths[idx];
          });
          doc.strokeColor(headerBgColor)
            .lineWidth(1)
            .moveTo(50, yPos + headerHeight)
            .lineTo(530, yPos + headerHeight)
            .stroke();
          yPos += headerHeight;
          doc.fontSize(9).font('Helvetica').fillColor(primaryColor);
        }

        // Fond alterné pour les lignes (zebra striping)
        if (index % 2 === 0) {
          doc.rect(50, yPos, 480, rowHeight)
            .fillColor(zebraColor)
            .fill();
        }

        const code = item.article_cod || '';
        const designation = stripHtmlTags(item.article || item.designation || '');
        const quantite = item.quantite || 0;
        const rubrique = item.rubrique_nom || 'N/A';

        // Bordures verticales et horizontales
        doc.strokeColor(borderColor)
          .lineWidth(0.5);

        // Lignes verticales
        xPos = 50;
        for (let i = 0; i <= colWidths.length; i++) {
          doc.moveTo(xPos, yPos).lineTo(xPos, yPos + rowHeight).stroke();
          if (i < colWidths.length) xPos += colWidths[i];
        }

        // Ligne horizontale en bas
        doc.moveTo(50, yPos + rowHeight).lineTo(530, yPos + rowHeight).stroke();

        // Contenu des cellules
        doc.fillColor(primaryColor);
        xPos = 55;
        doc.text(code, xPos, yPos + 6, { width: colWidths[0] - 10, align: 'left' });
        doc.text(designation.substring(0, 40), xPos + colWidths[0], yPos + 6, { width: colWidths[1] - 10, align: 'left' });
        doc.text(quantite.toString(), xPos + colWidths[0] + colWidths[1], yPos + 6, { width: colWidths[2] - 10, align: 'center' });
        doc.text(rubrique, xPos + colWidths[0] + colWidths[1] + colWidths[2], yPos + 6, { width: colWidths[3] - 10, align: 'left' });

        yPos += rowHeight;
      });

      // Pied de page avec cachet si demandé
      if (options.withStamp) {
        doc.moveDown(3);
        doc.fontSize(8).fillColor('#666');
        doc.text('Document validé et cacheté', 50, doc.y, { align: 'center' });
      }

      doc.end();

    } catch (error) {
      console.error('❌ Erreur génération PDF entrée de stock :', error);
      reject(error);
    }
  });
}

module.exports = {
  genererPDF
};
