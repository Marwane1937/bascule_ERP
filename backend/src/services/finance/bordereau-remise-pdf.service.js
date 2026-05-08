const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { renderFormattedText } = require('../pdf-format-helper');
const pdfConfigService = require('../pdf-config.service');

class BordereauRemisePdfService {
  /**
   * Génère un PDF professionnel pour un BORDEREAU DE REMISE
   * @param {Array} bordereauData - Données du bordereau depuis getBordereauForPDF
   * @param {Object} options - Options de génération (documentSociete, etc.)
   * @returns {Promise<string>} - Chemin du fichier PDF généré
   */
  async genererPDF(bordereauData, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        // Sauvegarder dans src/public/bordereaux-remise
        const bordereauDir = path.join(__dirname, '..', '..', 'public', 'bordereaux-remise');
        if (!fs.existsSync(bordereauDir)) {
          fs.mkdirSync(bordereauDir, { recursive: true });
        }

        const bordereau = bordereauData[0];
        const numeroDoc = bordereau?.numero || 'BORDEREAU';
        const fileName = `bordereau-${numeroDoc}-${Date.now()}.pdf`;
        const pdfPath = path.join(bordereauDir, fileName);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const writeStream = fs.createWriteStream(pdfPath);

        writeStream.on('finish', () => {
          resolve(pdfPath);
        });
        writeStream.on('error', (err) => {
          console.error('❌ Erreur écriture PDF bordereau :', err);
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
              
              if (typeof piedPage === 'string' && piedPage.includes('.json')) {
                const piedPagePath = path.join(__dirname, '..', '..', piedPage.replace('src/', ''));
                if (fs.existsSync(piedPagePath)) {
                  piedPage = JSON.parse(fs.readFileSync(piedPagePath, 'utf8'));
                }
              } else if (typeof piedPage === 'string') {
                piedPage = JSON.parse(piedPage);
              }
              
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

        // Utiliser l'en-tête personnalisé si disponible - à côté du logo
        if (documentSociete && documentSociete.entete) {
          const entete = documentSociete.entete;
          if (typeof entete === 'object' || (typeof entete === 'string' && entete.trim())) {
            renderFormattedText(doc, entete, {
              startX: 160,
              startY: 20,
              defaultFontSize: 10,
              defaultColor: '#046ba7',
              defaultFont: 'Helvetica-Bold',
              defaultAlign: 'left',
              defaultLineSpacing: 12,
              width: 435
            });
          }
        }

        // === LIGNE DE SÉPARATION ===
        const separatorY = Math.max(logoY + 10, 100);
        doc.rect(40, separatorY, 520, 1).fill('#000');

        // === TITRE ===
        let yPos = separatorY + 20;
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#000000');
        doc.text('BORDEREAU DE REMISE', 50, yPos, { align: 'left' });
        
        if (bordereau) {
          // Numéro du bordereau
          doc.fontSize(14).font('Helvetica-Bold');
          doc.text(`N°: ${bordereau.numero || ''}`, 410, yPos, { align: 'right' });
          
          yPos += 40;
          
          // === BLOC INFORMATIONS ===
          const infoBoxY = yPos;
          const infoBoxWidth = 510;
          const infoBoxHeight = 100;
          const tableBorderRadius = 5;
          
          // Fond légèrement grisé pour le bloc d'informations
          doc.roundedRect(50, infoBoxY, infoBoxWidth, infoBoxHeight, tableBorderRadius)
            .fill('#F8F9FA')
            .stroke('#DEE2E6');
          
          // Ligne de séparation verticale
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
          doc.text(bordereau.date ? new Date(bordereau.date).toLocaleDateString('fr-FR') : '', infoLeftX + labelWidth, currentInfoY);
          currentInfoY += lineSpacing;
          
          // Compte Cible
          if (bordereau.compte_cible) {
            doc.font('Helvetica-Bold').fillColor('#495057');
            doc.text('Compte :', infoLeftX, currentInfoY);
            doc.font('Helvetica').fillColor('#000000');
            doc.text(bordereau.compte_cible, infoLeftX + labelWidth, currentInfoY);
            currentInfoY += lineSpacing;
          }
          
          // Type
          if (bordereau.type) {
            doc.font('Helvetica-Bold').fillColor('#495057');
            doc.text('Type :', infoLeftX, currentInfoY);
            doc.font('Helvetica').fillColor('#000000');
            doc.text(bordereau.type, infoLeftX + labelWidth, currentInfoY);
            currentInfoY += lineSpacing;
          }
          
          // État
          if (bordereau.etat) {
            doc.font('Helvetica-Bold').fillColor('#495057');
            doc.text('Status :', infoLeftX, currentInfoY);
            doc.font('Helvetica').fillColor('#000000');
            doc.text(bordereau.etat, infoLeftX + labelWidth, currentInfoY);
          }
          
          // === SECTION DROITE : Total en évidence ===
          const totalBoxX = separatorX + 20;
          const totalBoxY = infoBoxY + 20;
          const totalBoxWidth = infoBoxWidth - (totalBoxX - 50) - 20;
          const totalBoxHeight = infoBoxHeight - 40;
          
          // Calculer le total des chèques
          const cheques = bordereau.cheques || [];
          const totalMontant = cheques.reduce((sum, cheque) => sum + (parseFloat(cheque.montant) || 0), 0);
          const nombreCheques = cheques.length;
          
          // Cadre arrondi pour le total
          doc.roundedRect(totalBoxX, totalBoxY, totalBoxWidth, totalBoxHeight, tableBorderRadius)
            .fill('#E7F3FF')
            .stroke('#0D6EFD');
          
          // Label "Total"
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#0D6EFD');
          const totalLabel = 'Total des chèques';
          const totalLabelWidth = doc.widthOfString(totalLabel);
          doc.text(totalLabel, totalBoxX + (totalBoxWidth - totalLabelWidth) / 2, totalBoxY + 10, { align: 'center' });
          
          // Nombre de chèques
          doc.font('Helvetica').fontSize(9).fillColor('#666666');
          const nombreText = `${nombreCheques} chèque(s)`;
          const nombreTextWidth = doc.widthOfString(nombreText);
          doc.text(nombreText, totalBoxX + (totalBoxWidth - nombreTextWidth) / 2, totalBoxY + 30, { align: 'center' });
          
          // Valeur du total en grand
          const totalValue = `${totalMontant.toFixed(2)} DH`;
          doc.font('Helvetica-Bold').fontSize(18).fillColor('#000000');
          const totalValueWidth = doc.widthOfString(totalValue);
          doc.text(totalValue, totalBoxX + (totalBoxWidth - totalValueWidth) / 2, totalBoxY + 45, { align: 'center' });
          
          yPos = infoBoxY + infoBoxHeight + 20;
          
          // === TABLEAU DES CHÈQUES (style livraison/facturation) ===
          if (bordereau.cheques && bordereau.cheques.length > 0) {
            // Position et dimensions du tableau (identique au bon de commande)
            const tableStartY = yPos;
            const articlesTableHeaderHeight = 20;
            const lightGrayColor = '#E0E0E0';
            const tableStartX = 50; // Tableau commence à X=50 (marge gauche) - COMME BON DE COMMANDE
            const tableWidth = 510; // Largeur totale du tableau - COMME BON DE COMMANDE
            const tableRightX = tableStartX + tableWidth;
            const baseRowHeight = 20;
            
            // Calculer l'espace disponible jusqu'au pied de page
            const pageHeight = 842;
            const bottomMargin = 40;
            const footerHeight = 55;
            const footerY = pageHeight - bottomMargin - footerHeight;
            const spaceForTotal = 50;
            const maxYBeforeFooter = footerY - spaceForTotal;
            const availableHeight = maxYBeforeFooter - (tableStartY + articlesTableHeaderHeight);
            
            // En-tête du tableau (identique à livraison/facturation)
            doc.roundedRect(tableStartX, tableStartY, tableWidth, articlesTableHeaderHeight, tableBorderRadius)
              .fill(lightGrayColor)
              .stroke('#000');
            doc.lineWidth(1).roundedRect(tableStartX, tableStartY, tableWidth, articlesTableHeaderHeight, tableBorderRadius)
              .stroke('#000');
            
            // Définir les colonnes (positions X et largeurs) - style bon de commande
            const colNumeroX = 50;
            const colNumeroWidth = 100;
            const colDateX = 150; // 50 + 100
            const colDateWidth = 100;
            const colClientX = 250; // 150 + 100
            const colClientWidth = 200; // Colonne client large
            const colModeX = 450; // 250 + 200
            const colModeWidth = 60;
            const colMontantX = 510; // 450 + 60
            const colMontantWidth = 50;
            
            // Positions des lignes verticales de séparation
            const xPositions = [colDateX, colClientX, colModeX, colMontantX, tableRightX];
            
            // Dessiner les lignes verticales dans l'en-tête
            xPositions.forEach(x => {
              doc.moveTo(x, tableStartY).lineTo(x, tableStartY + articlesTableHeaderHeight).stroke('#000');
            });
            
            // Texte des en-têtes (centré comme bon de commande)
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
            doc.text('Numéro', colNumeroX, tableStartY + 6, { width: colNumeroWidth, align: 'center' });
            doc.text('Date', colDateX, tableStartY + 6, { width: colDateWidth, align: 'center' });
            doc.text('Client', colClientX, tableStartY + 6, { width: colClientWidth, align: 'center' });
            doc.text('Mode', colModeX, tableStartY + 6, { width: colModeWidth, align: 'center' });
            doc.text('Montant', colMontantX, tableStartY + 6, { width: colMontantWidth, align: 'center' });
            
            let currentY = tableStartY + articlesTableHeaderHeight;
            let currentPageTableStartY = currentY;
            let currentMaxYBeforeFooter = maxYBeforeFooter;
            
            doc.font('Helvetica').fillColor('#000000').stroke('#000');
            
            let totalMontant = 0;
            
            // Dessiner chaque ligne de chèque
            bordereau.cheques.forEach((cheque, index) => {
              // Vérifier si on dépasse la page
              if (currentY + baseRowHeight > currentMaxYBeforeFooter) {
                drawPageFooter();
                doc.addPage();
                currentY = 80;
                currentPageTableStartY = currentY;
                currentMaxYBeforeFooter = pageHeight - bottomMargin - footerHeight - spaceForTotal;
                
                // Redessiner l'en-tête sur la nouvelle page
                doc.roundedRect(tableStartX, currentY, tableWidth, articlesTableHeaderHeight, tableBorderRadius)
                  .fill(lightGrayColor)
                  .stroke('#000');
                doc.lineWidth(1).roundedRect(tableStartX, currentY, tableWidth, articlesTableHeaderHeight, tableBorderRadius)
                  .stroke('#000');
                
                // Lignes verticales
                xPositions.forEach(x => {
                  doc.moveTo(x, currentY).lineTo(x, currentY + articlesTableHeaderHeight).stroke('#000');
                });
                
                // Texte des en-têtes
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
                doc.text('Numéro', colNumeroX, currentY + 6, { width: colNumeroWidth, align: 'center' });
                doc.text('Date', colDateX, currentY + 6, { width: colDateWidth, align: 'center' });
                doc.text('Client', colClientX, currentY + 6, { width: colClientWidth, align: 'center' });
                doc.text('Mode', colModeX, currentY + 6, { width: colModeWidth, align: 'center' });
                doc.text('Montant', colMontantX, currentY + 6, { width: colMontantWidth, align: 'center' });
                
                currentY += articlesTableHeaderHeight;
                doc.font('Helvetica').fillColor('#000000');
              }
              
              // Fond alterné pour les lignes (comme livraison/facturation)
              if (index % 2 === 0) {
                doc.rect(tableStartX, currentY, tableWidth, baseRowHeight).fill('#F5F5F5');
              }
              
              // Dessiner les lignes verticales pour cette ligne
              xPositions.forEach(x => {
                doc.moveTo(x, currentY).lineTo(x, currentY + baseRowHeight).stroke('#000');
              });
              
              // Contenu de la ligne
              doc.fontSize(9).font('Helvetica').fillColor('#000000');
              const montant = parseFloat(cheque.montant) || 0;
              totalMontant += montant;
              
              doc.text(cheque.numero || '-', colNumeroX, currentY + 6, { width: colNumeroWidth, align: 'center' });
              doc.text(cheque.date ? new Date(cheque.date).toLocaleDateString('fr-FR') : '-', colDateX, currentY + 6, { width: colDateWidth, align: 'center' });
              doc.text(cheque.client || '-', colClientX, currentY + 6, { width: colClientWidth, align: 'left' });
              doc.text(cheque.mode || '-', colModeX, currentY + 6, { width: colModeWidth, align: 'center' });
              doc.text(`${montant.toFixed(2)}`, colMontantX, currentY + 6, { width: colMontantWidth, align: 'center' });
              
              currentY += baseRowHeight;
            });
            
            // Ligne de séparation avant le total
            currentY += 5;
            doc.moveTo(tableStartX, currentY).lineTo(tableRightX, currentY).stroke('#000');
            currentY += 10;
            
            // Total en bas du tableau (aligné à droite comme livraison/facturation)
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
            const totalLabelText = 'TOTAL :';
            const totalLabelTextWidth = doc.widthOfString(totalLabelText);
            doc.text(totalLabelText, colMontantX - totalLabelTextWidth - 10, currentY);
            doc.text(`${totalMontant.toFixed(2)} DH`, colMontantX, currentY, { width: colMontantWidth, align: 'center' });
          }
        }
        
        // Dessiner le pied de page sur chaque page
        doc.on('pageAdded', () => {
          drawPageFooter();
        });
        
        // Dessiner le pied de page sur la dernière page
        drawPageFooter();
        
        doc.end();
      } catch (error) {
        console.error('❌ Erreur génération PDF bordereau :', error);
        reject(error);
      }
    });
  }
}

module.exports = new BordereauRemisePdfService();

