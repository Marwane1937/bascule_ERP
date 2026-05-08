const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const pdfConfigService = require('../pdf-config.service');

class ReglementPdfService {
  /**
   * Génère un PDF professionnel pour un RÈGLEMENT
   * @param {Array} reglementData - Données du règlement depuis getReglementForPDF
   * @param {Object} options - Options de génération (documentSociete, etc.)
   * @returns {Promise<string>} - Chemin du fichier PDF généré
   */
  async genererPDF(reglementData, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        // Sauvegarder dans src/public/reglements
        const reglementDir = path.join(__dirname, '..', '..', 'public', 'reglements');
        if (!fs.existsSync(reglementDir)) {
          fs.mkdirSync(reglementDir, { recursive: true });
        }

        const fileName = `reglement-${Date.now()}.pdf`;
        const pdfPath = path.join(reglementDir, fileName);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const writeStream = fs.createWriteStream(pdfPath);

        writeStream.on('finish', () => {
          resolve(pdfPath);
        });
        writeStream.on('error', (err) => {
          console.error('❌ Erreur écriture PDF règlement :', err);
          reject(err);
        });

        doc.pipe(writeStream);

        // Récupérer la configuration depuis pdf-config.json
        const documentSociete = options.documentSociete || pdfConfigService.getDocumentSociete();
        
        // === FONCTION: Dessiner le pied de page ===
        const drawPageFooter = () => {
          const pageHeight = doc.page.height;
          const pageWidth = doc.page.width;
          const bottomMargin = 40;
          const footerHeight = 50;
          const footerY = pageHeight - bottomMargin - footerHeight;
          
          if (documentSociete && documentSociete.pied_page) {
            try {
              let piedPage = documentSociete.pied_page;
              
              // Si c'est un chemin de fichier, charger le fichier
              if (typeof piedPage === 'string' && piedPage.includes('.json')) {
                const piedPagePath = path.join(__dirname, '..', '..', piedPage.replace('src/', ''));
                if (fs.existsSync(piedPagePath)) {
                  piedPage = JSON.parse(fs.readFileSync(piedPagePath, 'utf8'));
                }
              } else if (typeof piedPage === 'string') {
                piedPage = JSON.parse(piedPage);
              }
              
              // Si piedPage est un objet avec une propriété lines ou un tableau
              let lines = [];
              if (piedPage && typeof piedPage === 'object') {
                if (Array.isArray(piedPage)) {
                  lines = piedPage;
                } else if (piedPage.lines && Array.isArray(piedPage.lines)) {
                  lines = piedPage.lines;
                } else if (piedPage.text) {
                  lines = [piedPage.text];
                }
              }
              
              if (lines.length > 0) {
                // Fond blanc pour le footer
                doc.rect(0, footerY, pageWidth, footerHeight).fill('#FFFFFF');
                doc.strokeColor('#000').lineWidth(0.5);
                doc.moveTo(50, footerY + 2).lineTo(pageWidth - 50, footerY + 2).stroke();
                
                let currentY = footerY + 10;
                lines.forEach((line) => {
                  const lineObj = typeof line === 'string' ? { text: line } : line;
                  const lineText = lineObj.text || String(lineObj);
                  const fontSize = lineObj.fontSize || 8;
                  const color = lineObj.color || '#666666';
                  const font = lineObj.font || 'Helvetica';
                  const lineSpacing = lineObj.lineSpacing || 10;
                  
                  doc.fontSize(fontSize).font(font).fillColor(color);
                  doc.text(lineText, 50, currentY, { align: 'center', width: pageWidth - 100 });
                  currentY += lineSpacing;
                });
              }
            } catch (error) {
              console.warn('⚠️ Erreur affichage pied de page:', error.message);
            }
          }
        };
        
        // === ENTÊTE ENTREPRISE ===
        const logoSize = documentSociete?.logoSize || { width: 100, height: null };
        const imageOptions = { width: logoSize.width };
        if (logoSize.height) {
          imageOptions.height = logoSize.height;
        }
        
        const configuredLogoTop = Number(documentSociete?.logoTop);
        let logoY = Number.isFinite(configuredLogoTop) ? configuredLogoTop : 14;
        if (documentSociete && documentSociete.logo) {
          try {
            const logoBuffer = Buffer.from(documentSociete.logo, 'base64');
            doc.image(logoBuffer, 50, logoY, imageOptions);
            logoY += logoSize.height || 60;
          } catch (error) {
            console.warn('⚠️ Erreur chargement logo:', error.message);
          }
        }

        // === LIGNE DE SÉPARATION ===
        const separatorY = Math.max(logoY + 10, 100);
        doc.rect(40, separatorY, 520, 1).fill('#000');

        // === TITRE ===
        let yPos = separatorY + 20;
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#000000');
        doc.text('RÈGLEMENT', 50, yPos, { align: 'left' });
        
        if (reglementData && reglementData.length > 0) {
          const reglement = reglementData[0];
          
          // Numéro du règlement
          doc.fontSize(14).font('Helvetica');
          doc.text(`N°: ${reglement.numero || ''}`, 450, yPos, { align: 'right' });
          
          yPos += 40;
          
          // === DESIGN MODERNE ET PROFESSIONNEL POUR LES INFORMATIONS ===
          const infoBoxY = yPos;
          const infoBoxWidth = 510;
          const infoBoxHeight = 120; // Hauteur ajustable selon le contenu
          const tableBorderRadius = 5;
          
          // Fond légèrement grisé pour le bloc d'informations
          doc.roundedRect(50, infoBoxY, infoBoxWidth, infoBoxHeight, tableBorderRadius)
            .fill('#F8F9FA')
            .stroke('#DEE2E6');
          
          // Ligne de séparation verticale pour séparer les infos du montant
          const separatorX = 350;
          doc.moveTo(separatorX, infoBoxY + 10).lineTo(separatorX, infoBoxY + infoBoxHeight - 10).stroke('#DEE2E6');
          
          // === SECTION GAUCHE : Informations détaillées ===
          let currentInfoY = infoBoxY + 20;
          const infoLeftX = 60;
          const labelWidth = 100;
          const valueWidth = 180;
          const lineSpacing = 18;
          
          doc.font('Helvetica').fontSize(9);
          
          // Date
          doc.font('Helvetica-Bold').fillColor('#495057');
          doc.text('Date :', infoLeftX, currentInfoY);
          doc.font('Helvetica').fillColor('#000000');
          doc.text(reglement.date ? new Date(reglement.date).toLocaleDateString('fr-FR') : '', infoLeftX + labelWidth, currentInfoY);
          currentInfoY += lineSpacing;
          
          // Client (avec gestion du texte long)
          doc.font('Helvetica-Bold').fillColor('#495057');
          doc.text('Client :', infoLeftX, currentInfoY);
          doc.font('Helvetica').fillColor('#000000');
          const clientText = reglement.client || '';
          const clientTextHeight = doc.heightOfString(clientText, { width: valueWidth });
          doc.text(clientText, infoLeftX + labelWidth, currentInfoY, { width: valueWidth, align: 'left', lineGap: 2 });
          currentInfoY += Math.max(lineSpacing, clientTextHeight + 2);
          
          // Mode de règlement
          doc.font('Helvetica-Bold').fillColor('#495057');
          doc.text('Mode :', infoLeftX, currentInfoY);
          doc.font('Helvetica').fillColor('#000000');
          doc.text(reglement.mode || '', infoLeftX + labelWidth, currentInfoY);
          currentInfoY += lineSpacing;
          
          // Échéance (si présente)
          if (reglement.echeance) {
            doc.font('Helvetica-Bold').fillColor('#495057');
            doc.text('Échéance :', infoLeftX, currentInfoY);
            doc.font('Helvetica').fillColor('#000000');
            doc.text(new Date(reglement.echeance).toLocaleDateString('fr-FR'), infoLeftX + labelWidth, currentInfoY);
            currentInfoY += lineSpacing;
          }
          
          // Référence (si présente)
          if (reglement.reference) {
            doc.font('Helvetica-Bold').fillColor('#495057');
            doc.text('Référence :', infoLeftX, currentInfoY);
            doc.font('Helvetica').fillColor('#000000');
            doc.text(reglement.reference, infoLeftX + labelWidth, currentInfoY);
            currentInfoY += lineSpacing;
          }
          
          // === SECTION DROITE : Montant en évidence ===
          const montantBoxX = separatorX + 20;
          const montantBoxY = infoBoxY + 20;
          const montantBoxWidth = infoBoxWidth - (montantBoxX - 50) - 20;
          const montantBoxHeight = infoBoxHeight - 40;
          
          // Cadre arrondi pour le montant avec fond légèrement coloré
          doc.roundedRect(montantBoxX, montantBoxY, montantBoxWidth, montantBoxHeight, tableBorderRadius)
            .fill('#E7F3FF')
            .stroke('#0D6EFD');
          
          // Label "Montant"
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#0D6EFD');
          const montantLabel = 'Montant du règlement';
          const montantLabelWidth = doc.widthOfString(montantLabel);
          doc.text(montantLabel, montantBoxX + (montantBoxWidth - montantLabelWidth) / 2, montantBoxY + 15, { align: 'center' });
          
          // Valeur du montant en grand
          const montantValue = `${(reglement.montant_reglement || 0).toFixed(2)} DH`;
          doc.font('Helvetica-Bold').fontSize(20).fillColor('#000000');
          const montantValueWidth = doc.widthOfString(montantValue);
          doc.text(montantValue, montantBoxX + (montantBoxWidth - montantValueWidth) / 2, montantBoxY + 45, { align: 'center' });
          
          yPos = infoBoxY + infoBoxHeight + 20;
          
          // Tableau des factures - Centré
          doc.fontSize(12).font('Helvetica-Bold');
          const titleWidth = doc.widthOfString('Détails des factures');
          doc.text('Détails des factures', (doc.page.width - titleWidth) / 2, yPos);
          yPos += 20;
          
          // Calculer la hauteur disponible pour le tableau
          const pageHeight = doc.page.height;
          const footerY = pageHeight - 90; // Réserver de l'espace pour le footer
          const spaceForTotal = 50; // Espace pour le total et le montant total
          const availableHeight = footerY - yPos - spaceForTotal;
          
          // Vérifier si on a des données de factures
          const facturesData = reglementData.filter(row => {
            return row.facture_num && row.facture_num !== null && row.facture_num !== '';
          });
          
          // Lignes du tableau
          doc.fontSize(9).font('Helvetica');
          let totalFacture = 0;
          let totalRegle = 0;
          
          // Dimensions du tableau - centré
          const tableWidth = 500;
          const tableX = (doc.page.width - tableWidth) / 2; // Centrer le tableau
          // tableBorderRadius est déjà déclaré plus haut (ligne 141)
          const headerHeight = 20;
          const rowHeight = 15;
          const tableStartY = yPos;
          
          if (facturesData.length > 0) {
            // Calculer la hauteur nécessaire pour toutes les lignes
            const totalRowsHeight = facturesData.length * rowHeight;
            const totalTableHeight = headerHeight + totalRowsHeight; // Hauteur nécessaire pour le tableau
            
            // Utiliser toute la hauteur disponible si elle est supérieure à la hauteur nécessaire
            // Sinon utiliser la hauteur nécessaire
            const actualTableHeight = Math.max(totalTableHeight, Math.min(availableHeight, totalTableHeight));
            const actualRowsHeight = actualTableHeight - headerHeight;
            
            // En-tête avec bordure arrondie - centré
            doc.roundedRect(tableX, tableStartY, tableWidth, headerHeight, tableBorderRadius).fill('#E0E0E0').stroke('#000');
            
            // Lignes de séparation verticales dans l'en-tête
            doc.moveTo(tableX + 140, tableStartY).lineTo(tableX + 140, tableStartY + headerHeight).stroke('#000');
            doc.moveTo(tableX + 290, tableStartY).lineTo(tableX + 290, tableStartY + headerHeight).stroke('#000');
            doc.moveTo(tableX + 390, tableStartY).lineTo(tableX + 390, tableStartY + headerHeight).stroke('#000');
            
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
            doc.text('N° Facture', tableX + 10, tableStartY + 6);
            doc.text('Montant Facture', tableX + 150, tableStartY + 6);
            doc.text('Montant Réglé', tableX + 300, tableStartY + 6);
            doc.text('Reste', tableX + 400, tableStartY + 6);
            
            yPos = tableStartY + headerHeight;
            
            // Calculer l'espacement entre les lignes pour remplir toute la hauteur
            const spacingBetweenRows = facturesData.length > 1 
              ? (actualRowsHeight - (facturesData.length * rowHeight)) / (facturesData.length - 1)
              : 0;
            
            facturesData.forEach((row, index) => {
              // Vérifier si on dépasse la page avant d'ajouter une nouvelle ligne
              if (yPos > footerY - spaceForTotal) {
                // Dessiner le footer sur la page actuelle avant d'en créer une nouvelle
                drawPageFooter();
                doc.addPage();
                yPos = 80;
                // Redessiner l'en-tête du tableau sur la nouvelle page - centré
                doc.fontSize(9).font('Helvetica-Bold');
                doc.fillColor('#333333');
                doc.roundedRect(tableX, yPos - 5, tableWidth, headerHeight, tableBorderRadius).fill('#E0E0E0').stroke('#000');
                doc.fillColor('#000000');
                doc.text('N° Facture', tableX + 10, yPos + 1);
                doc.text('Montant Facture', tableX + 150, yPos + 1);
                doc.text('Montant Réglé', tableX + 300, yPos + 1);
                doc.text('Reste', tableX + 400, yPos + 1);
                // Lignes de séparation verticales
                doc.moveTo(tableX + 140, yPos - 5).lineTo(tableX + 140, yPos - 5 + headerHeight).stroke('#000');
                doc.moveTo(tableX + 290, yPos - 5).lineTo(tableX + 290, yPos - 5 + headerHeight).stroke('#000');
                doc.moveTo(tableX + 390, yPos - 5).lineTo(tableX + 390, yPos - 5 + headerHeight).stroke('#000');
                yPos += headerHeight;
                doc.fontSize(9).font('Helvetica');
              }
              
              // Fond alterné pour les lignes
              if (index % 2 === 0) {
                doc.rect(tableX, yPos - 5, tableWidth, rowHeight).fill('#F5F5F5');
              }
              
              // Lignes de séparation verticales pour les données
              doc.moveTo(tableX + 140, yPos - 5).lineTo(tableX + 140, yPos - 5 + rowHeight).stroke('#000');
              doc.moveTo(tableX + 290, yPos - 5).lineTo(tableX + 290, yPos - 5 + rowHeight).stroke('#000');
              doc.moveTo(tableX + 390, yPos - 5).lineTo(tableX + 390, yPos - 5 + rowHeight).stroke('#000');
              
              doc.fillColor('#000000');
              doc.text(row.facture_num || '-', tableX + 10, yPos);
              doc.text(`${(row.montant_facture || 0).toFixed(2)} DH`, tableX + 150, yPos, { align: 'right', width: 140 });
              doc.text(`${(row.montant_regle || 0).toFixed(2)} DH`, tableX + 300, yPos, { align: 'right', width: 90 });
              
              const reste = (row.montant_facture || 0) - (row.montant_regle || 0);
              doc.text(`${reste.toFixed(2)} DH`, tableX + 400, yPos, { align: 'right', width: 90 });
              
              totalFacture += row.montant_facture || 0;
              totalRegle += row.montant_regle || 0;
              
              yPos += rowHeight + spacingBetweenRows;
            });
            
            // Dessiner la bordure inférieure du tableau
            doc.moveTo(tableX, yPos).lineTo(tableX + tableWidth, yPos).stroke('#000');
            
            // Ligne de séparation avant le total
            yPos += 5;
            
            // Vérifier si on a assez de place pour le total et le montant total
            if (yPos > footerY - 60) {
              drawPageFooter();
              doc.addPage();
              yPos = 80;
            }
            
            // Total avec bordure arrondie - centré
            doc.fontSize(10).font('Helvetica-Bold');
            doc.roundedRect(tableX, yPos, tableWidth, 20, tableBorderRadius).fill('#D0D0D0').stroke('#000');
            // Lignes de séparation verticales pour le total
            doc.moveTo(tableX + 140, yPos).lineTo(tableX + 140, yPos + 20).stroke('#000');
            doc.moveTo(tableX + 290, yPos).lineTo(tableX + 290, yPos + 20).stroke('#000');
            doc.moveTo(tableX + 390, yPos).lineTo(tableX + 390, yPos + 20).stroke('#000');
            doc.text('TOTAL', tableX + 10, yPos + 6);
            doc.text(`${totalFacture.toFixed(2)} DH`, tableX + 150, yPos + 6, { align: 'right', width: 140 });
            doc.text(`${totalRegle.toFixed(2)} DH`, tableX + 300, yPos + 6, { align: 'right', width: 90 });
            doc.text(`${(totalFacture - totalRegle).toFixed(2)} DH`, tableX + 400, yPos + 6, { align: 'right', width: 90 });
            
            yPos += 30;
          } else {
            // Aucune facture, afficher un message dans un cadre - centré
            const emptyTableWidth = 500;
            const emptyTableX = (doc.page.width - emptyTableWidth) / 2;
            doc.roundedRect(emptyTableX, yPos - 5, emptyTableWidth, 30, tableBorderRadius).stroke('#000');
            doc.text('Aucune facture associée', emptyTableX + 10, yPos + 5);
            yPos += 30;
          }
          
          // Montant total du règlement - centré
          doc.fontSize(12).font('Helvetica-Bold');
          const totalText = `Montant total du règlement: ${(reglement.montant_reglement || 0).toFixed(2)} DH`;
          const totalTextWidth = doc.widthOfString(totalText);
          doc.text(totalText, (doc.page.width - totalTextWidth) / 2, yPos, { align: 'left' });
        }

        // === PIED DE PAGE ===
        // Dessiner le footer sur la dernière page
        drawPageFooter();

        // Finaliser le document
        doc.end();
      } catch (error) {
        console.error('❌ Erreur génération PDF règlement:', error);
        reject(error);
      }
    });
  }
}

module.exports = new ReglementPdfService();

