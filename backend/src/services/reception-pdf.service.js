const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { renderFormattedText } = require('./pdf-format-helper');

/**
 * Service dédié à la génération de PDF pour les BONS DE RÉCEPTION
 */

function stripHtmlTags(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function parseColor(value) {
  if (!value) return '#000000';
  value = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) return value;
  const rgb = value.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgb) {
    const r = Math.max(0, Math.min(255, parseInt(rgb[1], 10)));
    const g = Math.max(0, Math.min(255, parseInt(rgb[2], 10)));
    const b = Math.max(0, Math.min(255, parseInt(rgb[3], 10)));
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  }
  return '#000000';
}

function setFont(doc, bold, italic) {
  if (bold && italic) doc.font('Helvetica-BoldOblique');
  else if (bold) doc.font('Helvetica-Bold');
  else if (italic) doc.font('Helvetica-Oblique');
  else doc.font('Helvetica');
}

function renderInlineHtml(doc, html, x, y, width, maxHeight) {
  if (!html) return;

  let processedHtml = html
    .replace(/<h[1-6][^>]*>/gi, '<br><b>').replace(/<\/h[1-6]>/gi, '</b><br>')
    .replace(/<ul[^>]*>/gi, '<br>').replace(/<\/ul>/gi, '<br>')
    .replace(/<li[^>]*>/gi, '<br>  • ').replace(/<\/li>/gi, '')
    .replace(/<p[^>]*>/gi, '<br>').replace(/<\/p>/gi, '<br>')
    .replace(/(<br\s*\/?>\s*)+/gi, '<br>')
    .trim();

  const tokens = processedHtml.split(/(<[^>]+>)/g).filter(t => t !== '');
  const state = { bold: false, italic: false, color: '#000000' };

  doc.save();

  const padding = 8;
  const drawX = x + padding;
  const drawY = y + padding;
  const drawWidth = width - (padding * 2);

  if (maxHeight) doc.rect(x, y, width, maxHeight).clip();

  let lastTextIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (!tokens[i].startsWith('<')) {
      lastTextIdx = i;
      break;
    }
  }

  let firstText = true;
  tokens.forEach((tok, idx) => {
    if (tok.startsWith('<')) {
      const tag = tok.toLowerCase();
      if (tag === '<br>') {
        if (firstText) {
          doc.text(' ', drawX, drawY, { width: drawWidth, continued: true });
          doc.text('\n', { width: drawWidth, continued: idx < lastTextIdx });
          firstText = false;
        } else {
          doc.text('\n', { width: drawWidth, continued: idx < lastTextIdx });
        }
        return;
      }
      if (tag.startsWith('<strong') || tag.startsWith('<b')) state.bold = true;
      else if (tag.startsWith('</strong') || tag.startsWith('</b')) state.bold = false;
      else if (tag.startsWith('<em') || tag.startsWith('<i')) state.italic = true;
      else if (tag.startsWith('</em') || tag.startsWith('</i')) state.italic = false;
      else if (tag.startsWith('<span')) {
        const m = tag.match(/style=["'][^"']*color\s*:\s*([^;"']+)/);
        if (m) state.color = parseColor(m[1]);
      } else if (tag.startsWith('</span')) {
        state.color = '#000000';
      }
      return;
    }

    setFont(doc, state.bold, state.italic);
    doc.fillColor(state.color);
    const isLastText = (idx === lastTextIdx);

    if (firstText) {
      doc.text(tok, drawX, drawY, { width: drawWidth, continued: !isLastText, align: 'left' });
      firstText = false;
    } else {
      doc.text(tok, { width: drawWidth, continued: !isLastText, align: 'left' });
    }
  });

  doc.restore();
}

// Fonction helper pour calculer la hauteur nécessaire pour une désignation
function calculateTextHeight(text, width, fontSize = 9) {
  if (!text || !width) return 25;

  const plainText = text
    .replace(/<h[1-6][^>]*>/gi, '\n').replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<ul[^>]*>/gi, '\n').replace(/<\/ul>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ').replace(/<\/li>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();

  const lines = plainText.split('\n');
  const charsPerLine = Math.floor(width / (fontSize * 0.5));
  let totalLines = 0;

  lines.forEach(line => {
    if (line.trim()) {
      totalLines += Math.ceil(line.length / Math.max(1, charsPerLine));
    }
  });

  return Math.max(25, totalLines * (fontSize * 1.4) + 15);
}

class ReceptionPdfService {
  /**
   * Génère un PDF professionnel pour un BON DE RÉCEPTION
   * @param {Array} receptionData - Données de la réception
   * @param {Object} options - Options de génération (documentSociete, withStamp, etc.)
   * @returns {Promise<string>} - Chemin du fichier PDF généré
   */
  async genererPDF(receptionData, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        const receptionDir = path.join(__dirname, '..', 'public', 'receptions');
        if (!fs.existsSync(receptionDir)) {
          fs.mkdirSync(receptionDir, { recursive: true });
        }

        const firstLine = receptionData[0];
        const fournisseurName = (firstLine.fournisseur || firstLine.client || 'fournisseur').trim();
        const receptionNum = (firstLine.numero || 'numero');
        const cleanFournisseurName = fournisseurName.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
        const fileName = `reception_${receptionNum}_${cleanFournisseurName}.pdf`;
        const pdfPath = path.join(receptionDir, fileName);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const writeStream = fs.createWriteStream(pdfPath);

        writeStream.on('finish', () => {
          resolve(pdfPath);
        });
        writeStream.on('error', (err) => {
          console.error('❌ Erreur écriture PDF réception :', err);
          reject(err);
        });

        doc.pipe(writeStream);

        // === ENTÊTE ENTREPRISE ===
        // Récupérer la taille du logo depuis la configuration
        const logoSize = options.documentSociete?.logoSize || { width: 100, height: null };
        const imageOptions = { width: logoSize.width };
        if (logoSize.height) {
          imageOptions.height = logoSize.height;
        }
        
        if (options.documentSociete && options.documentSociete.logo) {
          try {
            const logoBuffer = Buffer.from(options.documentSociete.logo, 'base64');
            doc.image(logoBuffer, 50, 20, imageOptions);
          } catch (error) {
            console.warn('Erreur affichage logo personnalisé, utilisation du logo par défaut:', error);
            const logoPath = path.join(__dirname, '..', 'public', 'Cactus.png');
            if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, imageOptions);
          }
        } else {
          const logoPath = path.join(__dirname, '..', 'public', 'Cactus.png');
          if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, imageOptions);
        }

        if (options.documentSociete && options.documentSociete.entete) {
          const htmlToPlainText = (html) => {
            if (!html) return '';
            return html.replace(/<[^>]*>/g, '').replace(/[ \t]+/g, ' ').trim();
          };
          const enteteText = htmlToPlainText(options.documentSociete.entete);
          const enteteLines = enteteText.split('\n');
          let yPos = 30;
          enteteLines.forEach(line => {
            if (line.trim()) {
              doc.fontSize(10).font('Helvetica-Bold').text(line.trim(), 160, yPos);
              yPos += 12;
            }
          });
        } else {
          doc.fontSize(11).fillColor('#bccbaa').font('Helvetica-Bold').text('Cactus Informatique', 160, 30);
          doc.font('Helvetica').fontSize(10).fillColor('#000')
            .text('LOTISSEMENT HLIWA RUE 8 N°69', 160, 45)
            .text('AIN SEBAA 20250 CASABLANCA', 160, 58)
            .text('TEL : 05 22 34 35 45', 160, 71)
            .text('FAX : 05 22 67 38 09', 160, 84);
        }

        doc.rect(40, 100, 520, 1).fill('#000');

        // === TITRE BON DE RÉCEPTION ===
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#000').text('BON DE RÉCEPTION', 50, 120);

        // === BLOC FOURNISSEUR ===
        const fournisseurTop = 110;
        const fournisseurBoxWidth = 260;
        const fournisseurBoxX = 300;
        const borderRadius = 5;
        const fournisseurPadding = 10;
        const fournisseurTextWidth = fournisseurBoxWidth - (fournisseurPadding * 2);
        const fournisseurLineHeight = 15;
        const fournisseurFontSize = 10;

        // Calculer la hauteur nécessaire pour le bloc fournisseur
        const fournisseurNom = receptionData[0].fournisseur || receptionData[0].client || '';
        const fournisseurAdresse = receptionData[0].adresse || '';
        const fournisseurVille = receptionData[0].ville || '';

        doc.fontSize(fournisseurFontSize).font('Helvetica');
        
        // Calculer le nombre de lignes nécessaires pour chaque texte
        const calculateLines = (text, width) => {
          if (!text) return 0;
          const words = text.split(' ');
          let lines = 1;
          let currentLine = '';
          words.forEach(word => {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            // widthOfString retourne la largeur avec la taille de police actuelle
            const textWidth = doc.widthOfString(testLine);
            if (textWidth > width) {
              lines++;
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          });
          return lines;
        };

        const fournisseurLabel = 'Fournisseur : ';
        const fournisseurFullText = `${fournisseurLabel}${fournisseurNom}`;
        const fournisseurLines = calculateLines(fournisseurFullText, fournisseurTextWidth);
        
        const adresseLabel = 'Adresse : ';
        const adresseFullText = `${adresseLabel}${fournisseurAdresse}`;
        const adresseLines = calculateLines(adresseFullText, fournisseurTextWidth);
        
        const villeLines = calculateLines(fournisseurVille, fournisseurTextWidth);

        // Calculer la hauteur totale nécessaire
        const totalLines = Math.max(1, fournisseurLines) + Math.max(1, adresseLines) + (villeLines > 0 ? Math.max(1, villeLines) : 0);
        const fournisseurBoxHeight = Math.max(60, (totalLines * fournisseurLineHeight) + (fournisseurPadding * 2));

        // Dessiner le bloc fournisseur avec la hauteur calculée
        doc.roundedRect(fournisseurBoxX, fournisseurTop, fournisseurBoxWidth, fournisseurBoxHeight, borderRadius).stroke('#000');

        // Afficher le texte du fournisseur avec gestion du retour à la ligne automatique
        let currentY = fournisseurTop + fournisseurPadding;
        
        doc.fontSize(fournisseurFontSize).font('Helvetica');
        
        // Calculer la hauteur réelle du texte avec heightOfString
        let fournisseurTextHeight = fournisseurLines * fournisseurLineHeight;
        try {
          const calculatedHeight = doc.heightOfString(fournisseurFullText, { width: fournisseurTextWidth, align: 'left' });
          if (typeof calculatedHeight === 'number' && !isNaN(calculatedHeight) && calculatedHeight > 0) {
            fournisseurTextHeight = calculatedHeight;
          }
        } catch (e) {
          // Utiliser la hauteur calculée manuellement en cas d'erreur
        }
        
        doc.text(fournisseurFullText, fournisseurBoxX + fournisseurPadding, currentY, { 
          width: fournisseurTextWidth, 
          align: 'left' 
        });
        currentY += Math.max(fournisseurLines * fournisseurLineHeight, fournisseurTextHeight + 2);

        let adresseTextHeight = adresseLines * fournisseurLineHeight;
        try {
          const calculatedHeight = doc.heightOfString(adresseFullText, { width: fournisseurTextWidth, align: 'left' });
          if (typeof calculatedHeight === 'number' && !isNaN(calculatedHeight) && calculatedHeight > 0) {
            adresseTextHeight = calculatedHeight;
          }
        } catch (e) {
          // Utiliser la hauteur calculée manuellement en cas d'erreur
        }
        
        doc.text(adresseFullText, fournisseurBoxX + fournisseurPadding, currentY, { 
          width: fournisseurTextWidth, 
          align: 'left' 
        });
        currentY += Math.max(adresseLines * fournisseurLineHeight, adresseTextHeight + 2);

        if (fournisseurVille) {
          doc.text(fournisseurVille, fournisseurBoxX + fournisseurPadding, currentY, { 
            width: fournisseurTextWidth, 
            align: 'left' 
          });
        }

        // === TABLEAU D'EN-TÊTE ===
        // Ajuster la position du tableau d'en-tête en fonction de la hauteur du bloc fournisseur
        const infoTableY = Math.max(210, fournisseurTop + fournisseurBoxHeight + 20);
        const infoTableHeaderHeight = 25;
        const infoTableRowHeight = 20;
        const infoTableTotalHeight = infoTableHeaderHeight + infoTableRowHeight;
        const tableBorderRadius = 5;

        doc.roundedRect(50, infoTableY, 510, infoTableTotalHeight, tableBorderRadius).stroke('#000');
        doc.moveTo(50, infoTableY + infoTableHeaderHeight).lineTo(560, infoTableY + infoTableHeaderHeight).stroke('#000');
        doc.moveTo(230, infoTableY).lineTo(230, infoTableY + infoTableTotalHeight).stroke('#000');
        doc.moveTo(410, infoTableY).lineTo(410, infoTableY + infoTableTotalHeight).stroke('#000');

        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
        doc.text('Bon de Réception N°', 55, infoTableY + 8, { width: 180, align: 'center' });
        doc.text('Date', 235, infoTableY + 8, { width: 180, align: 'center' });
        doc.text('Vos Réf', 415, infoTableY + 8, { width: 145, align: 'center' });

        doc.font('Helvetica').fontSize(9);
        doc.text(`${receptionData[0].numero}`, 55, infoTableY + infoTableHeaderHeight + 6, { width: 180, align: 'center' });
        doc.text(`${new Date(receptionData[0].date).toLocaleDateString('fr-FR')}`, 235, infoTableY + infoTableHeaderHeight + 6, { width: 180, align: 'center' });
        doc.text(`${receptionData[0].client_ref || ''}`, 415, infoTableY + infoTableHeaderHeight + 6, { width: 145, align: 'center' });

        // === TABLEAU DES ARTICLES ===
        let y = infoTableY + infoTableTotalHeight + 10;
        const tableStartY = y;
        const articlesTableHeaderHeight = 20;

        const lightGrayColor = '#E0E0E0';
        doc.roundedRect(50, y, 510, articlesTableHeaderHeight, tableBorderRadius).fill(lightGrayColor).stroke('#000');
        doc.lineWidth(1).roundedRect(50, y, 510, articlesTableHeaderHeight, tableBorderRadius).stroke('#000');
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');

        const colRefX = 50;
        const colDesignationX = 100;
        const colQteX = 350;
        const colPUX = 410;
        const colRX = 460;
        const colHTX = 510;

        const colRefWidth = 50;
        const colDesignationWidth = 250;
        const colDesignationPadding = 8;
        const colQteWidth = 60;
        const colPUWidth = 50;
        const colRWidth = 50;
        const colHTWidth = 50;

        doc.text('Réf', colRefX, y + 6, { width: colRefWidth, align: 'center' });
        doc.text('Désignation', colDesignationX, y + 6, { width: colDesignationWidth, align: 'center' });
        doc.text('Qté', colQteX, y + 6, { width: colQteWidth, align: 'center' });
        doc.text('P.U.', colPUX, y + 6, { width: colPUWidth, align: 'center' });
        doc.text('R.', colRX, y + 6, { width: colRWidth, align: 'center' });
        doc.text('H.T.', colHTX, y + 6, { width: colHTWidth, align: 'center' });

        y += articlesTableHeaderHeight;

        doc.font('Helvetica').fillColor('#000000').stroke('#000');

        if (receptionData && receptionData.length > 0) {
          receptionData.forEach(line => {
            const ref = line.article_cod || '';
            const designationHtml = line.article || line.designation || '';
            const pu = isNaN(Number(line.prix)) ? 0 : Number(line.prix);
            const qte = isNaN(Number(line.quantite)) ? 0 : Number(line.quantite);
            const htAfterRemise = isNaN(Number(line.remise)) ? 0 : Number(line.remise);
            const taux_tva = isNaN(Number(line.taux_tva)) ? 0 : Number(line.taux_tva);

            const totalAvantRemise = pu * qte;
            const montantRemise = isNaN(totalAvantRemise - htAfterRemise) ? 0 : (totalAvantRemise - htAfterRemise);
            const ht = htAfterRemise;

            const effectiveDesignationWidth = Math.max(0, colDesignationWidth - (colDesignationPadding * 2));

            const designationPlain = (designationHtml || '')
              .replace(/<h[1-6][^>]*>/gi, '\n').replace(/<\/h[1-6]>/gi, '\n')
              .replace(/<ul[^>]*>/gi, '\n').replace(/<\/ul>/gi, '\n')
              .replace(/<li[^>]*>/gi, '\n• ').replace(/<\/li>/gi, '')
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<p[^>]*>/gi, '\n').replace(/<\/p>/gi, '\n')
              .replace(/<[^>]*>/g, '')
              .replace(/[ \t]+/g, ' ')
              .trim();

            const baseRowHeight = 25; // Augmenté pour mieux afficher les désignations
            const maxRowHeight = 600; // Augmenté pour permettre plus d'espace

            // Calculer la hauteur nécessaire pour la désignation
            let textHeight = calculateTextHeight(designationHtml, effectiveDesignationWidth);

            const validRowHeight = Math.max(baseRowHeight, Math.min(textHeight, maxRowHeight));
            const validY = y;
            const centerY = validY + (validRowHeight / 2);

            // Ne pas dessiner les bordures individuelles - elles seront gérées plus tard
            // doc.rect(50, validY, 510, validRowHeight).stroke('#000');

            doc.font('Helvetica').fontSize(9).fillColor('#000000');
            doc.text(ref, colRefX, centerY, { width: colRefWidth, align: 'center' });
            doc.text(qte.toString(), colQteX, centerY, { width: colQteWidth, align: 'center' });
            doc.text(pu.toFixed(2).replace('.', ','), colPUX, centerY, { width: colPUWidth, align: 'center' });

            const remiseValue = (typeof montantRemise === 'number' && montantRemise !== null && montantRemise !== undefined)
              ? montantRemise.toFixed(2).replace('.', ',')
              : '0,00';
            doc.text(remiseValue, colRX, centerY, { width: colRWidth, align: 'center' });

            const htValue = (typeof ht === 'number' && ht !== null && ht !== undefined)
              ? ht.toFixed(2).replace('.', ',')
              : '0,00';
            doc.text(htValue, colHTX, centerY, { width: colHTWidth, align: 'center' });

            renderInlineHtml(doc, designationHtml, colDesignationX, validY + 6, effectiveDesignationWidth, validRowHeight - 8);
            doc.font('Helvetica').fontSize(9).fillColor('#000000');

            // Ne pas dessiner les séparations verticales individuelles non plus
            // const xPositions = [100, colQteX, colPUX, colRX, colHTX, 560];
            // xPositions.forEach(x => doc.moveTo(x, validY).lineTo(x, validY + validRowHeight).stroke('#000'));

            y = validY + validRowHeight;
          });
        } else {
          doc.text('Aucune ligne disponible.', 60, y + 10);
          y += 30;
        }

        // === CALCUL DES POSITIONS AVEC PIED DE PAGE EN BAS ===
        const pageHeight = 842; // Hauteur A4 en points
        const bottomMargin = 40;
        const footerHeight = 55; // Hauteur du pied de page
        const footerY = pageHeight - bottomMargin - footerHeight; // Pied de page toujours en bas
        const signaturesHeight = 70; // Hauteur estimée pour les signatures
        const signatureSpacing = 10; // Espacement après les signatures
        
        // Zone disponible pour le contenu (tableau + signatures) avant le pied de page
        const maxContentY = footerY - signatureSpacing;

        // === ÉTENDRE LE TABLEAU POUR QU'IL REMPLISSE TOUTE LA PAGE ===
        // Calculer la hauteur totale du tableau (depuis le début jusqu'à la fin souhaitée)
        const articlesTableStartY = tableStartY; // Utiliser la variable déjà définie
        // Zone maximale disponible pour le tableau (avant les signatures et le pied de page)
        const maxTableEndY = maxContentY - signaturesHeight - signatureSpacing;
        
        // Toujours étendre le tableau jusqu'à la zone maximale disponible pour occuper toute la page
        const tableEndY = Math.max(y, maxTableEndY);

        // Redessiner le rectangle externe du tableau étendu pour couvrir toute la hauteur
        const tableHeight = tableEndY - articlesTableStartY;
        doc.rect(50, articlesTableStartY, 510, tableHeight).stroke('#000');

        // Dessiner la ligne horizontale de séparation entre l'en-tête et le corps du tableau
        const headerBottomY = articlesTableStartY + articlesTableHeaderHeight;
        doc.moveTo(50, headerBottomY).lineTo(560, headerBottomY).stroke('#000');

        // Dessiner les séparations verticales pour toute la hauteur du tableau
        const xPositions = [100, colQteX, colPUX, colRX, colHTX, 560];
        xPositions.forEach(x => doc.moveTo(x, articlesTableStartY).lineTo(x, tableEndY).stroke('#000'));

        // Mettre à jour y pour la position après le tableau étendu
        y = tableEndY;

        // === SIGNATURES ===
        const signatureBoxHeight = 60;
        const signatureBoxWidth = 250;
        const signatureBoxGap = 10;
        const signatureBox1X = 50;
        const signatureBox2X = signatureBox1X + signatureBoxWidth + signatureBoxGap;

        // Placer les signatures après le tableau, mais s'assurer qu'elles ne chevauchent pas le pied de page
        let signatureBoxY = y + 10;
        
        // Vérifier que les signatures ne dépassent pas la zone disponible
        if (signatureBoxY + signatureBoxHeight > maxContentY) {
          signatureBoxY = maxContentY - signatureBoxHeight;
        }

        doc.roundedRect(signatureBox1X, signatureBoxY, signatureBoxWidth, signatureBoxHeight, tableBorderRadius).stroke('#000');
        doc.roundedRect(signatureBox2X, signatureBoxY, signatureBoxWidth, signatureBoxHeight, tableBorderRadius).stroke('#000');

        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
        doc.text('Réceptionné par', signatureBox1X, signatureBoxY + 10, { width: signatureBoxWidth, align: 'center' });
        doc.text('Bon Pour Accord', signatureBox2X, signatureBoxY + 10, { width: signatureBoxWidth, align: 'center' });

        // === PIED DE PAGE ===
        // Toujours afficher le pied de page en bas de la page
        const footerLineSpacing = 8;
        const footerStartY = footerY + 5;

        const htmlToPlainText = (html) => {
          if (!html) return '';
          return html.replace(/<[^>]*>/g, '').replace(/[ \t]+/g, ' ').trim();
        };

        // Toujours dessiner le pied de page sur la première page
        doc.rect(0, footerY, 595, footerHeight).fill('#f3f5ef');

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
              defaultLineSpacing: footerLineSpacing,
              width: 495
            });
          }
        }

        const withStamp = !!options.withStamp;
        if (withStamp) {
          const stampX = 470;
          const stampY = 760;
          doc.save();
          doc.rotate(-12, { origin: [stampX, stampY] });
          doc.lineWidth(3).strokeColor('#c0392b').fillColor('rgba(0,0,0,0)');
          doc.circle(stampX, stampY, 60).stroke();
          doc.font('Helvetica-Bold').fontSize(14).fillColor('#c0392b');
          doc.text('VALIDÉ', stampX - 50, stampY - 10, { width: 100, align: 'center' });
          doc.restore();
        }

        doc.end();

      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = new ReceptionPdfService();

