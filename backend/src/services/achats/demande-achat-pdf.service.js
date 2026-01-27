const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { renderFormattedText } = require('../pdf-format-helper');

/**
 * Service dédié à la génération de PDF pour les DEMANDES D'ACHAT
 * Ce service est basé sur le format du bon de commande mais simplifié :
 * - Seulement Réf, Désignation, Qté (pas de prix, pas de totaux)
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

class DemandeAchatPdfService {
  /**
   * Génère un PDF professionnel pour une DEMANDE D'ACHAT
   * @param {Array} demandeAchatData - Données de la demande d'achat
   * @param {Object} options - Options de génération (documentSociete, withStamp, etc.)
   * @returns {Promise<string>} - Chemin du fichier PDF généré
   */
  async genererPDF(demandeAchatData, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        // Sauvegarder dans src/public/demandes-achat
        const demandeDir = path.join(__dirname, '..', '..', 'public', 'demandes-achat');
        if (!fs.existsSync(demandeDir)) {
          fs.mkdirSync(demandeDir, { recursive: true });
        }

        const fileName = `demande-Prix-${Date.now()}.pdf`;
        const pdfPath = path.join(demandeDir, fileName);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const writeStream = fs.createWriteStream(pdfPath);

        writeStream.on('finish', () => {
          resolve(pdfPath);
        });
        writeStream.on('error', (err) => {
          console.error('❌ Erreur écriture PDF demande d\'achat :', err);
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
            const logoPath = path.join(__dirname, '..', '..', 'public', 'logo-bascule.jpg');
            if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, imageOptions);
          }
        } else {
          const logoPath = path.join(__dirname, '..', '..', 'public', 'logo-bascule.jpg');
          if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, imageOptions);
        }

        // Utiliser l'en-tête personnalisé si disponible - à côté du logo
        if (options.documentSociete && options.documentSociete.entete) {
          const entete = options.documentSociete.entete;
          // Vérifier si c'est un objet JSON ou du texte brut
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

        // Ligne de séparation horizontale
        doc.rect(40, 100, 520, 1).fill('#000');

        // === TITRE DEMANDE D'ACHAT ===
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#046ba7').text('DEMANDE D\'ACHAT', 50, 120);

        // === BLOC FOURNISSEUR ===
        const fournisseurTop = 110;
        const fournisseurBoxWidth = 250;
        const fournisseurBoxHeight = 60;
        const fournisseurBoxX = 310;
        const borderRadius = 5;

        doc.roundedRect(fournisseurBoxX, fournisseurTop, fournisseurBoxWidth, fournisseurBoxHeight, borderRadius).stroke('#000');

        doc.fontSize(10).font('Helvetica').fillColor('#000');
        doc.text(`Fournisseur : ${demandeAchatData[0]?.fournisseur || ''}`, fournisseurBoxX + 10, fournisseurTop + 10);
        doc.text(`Adresse : ${demandeAchatData[0]?.adresse || ''}`, fournisseurBoxX + 10, fournisseurTop + 25);
        doc.text(`ICE : ${demandeAchatData[0]?.ice || ''}`, fournisseurBoxX + 10, fournisseurTop + 40);

        // === TABLEAU D'EN-TÊTE ===
        const infoTableY = 190;
        const infoTableHeaderHeight = 25;
        const infoTableRowHeight = 20;
        const infoTableTotalHeight = infoTableHeaderHeight + infoTableRowHeight;
        const tableBorderRadius = 5;

        doc.roundedRect(50, infoTableY, 510, infoTableTotalHeight, tableBorderRadius).stroke('#000');
        doc.moveTo(50, infoTableY + infoTableHeaderHeight).lineTo(560, infoTableY + infoTableHeaderHeight).stroke('#000');
        doc.moveTo(230, infoTableY).lineTo(230, infoTableY + infoTableTotalHeight).stroke('#000');
        doc.moveTo(410, infoTableY).lineTo(410, infoTableY + infoTableTotalHeight).stroke('#000');

        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
        doc.text('Demande d\'Achat N°', 55, infoTableY + 8, { width: 180, align: 'center' });
        doc.text('Date', 235, infoTableY + 8, { width: 180, align: 'center' });
        doc.text('Description', 415, infoTableY + 8, { width: 145, align: 'center' });

        doc.font('Helvetica').fontSize(9);
        doc.text(`${demandeAchatData[0]?.numero || ''}`, 55, infoTableY + infoTableHeaderHeight + 6, { width: 180, align: 'center' });
        doc.text(`${demandeAchatData[0]?.date ? new Date(demandeAchatData[0].date).toLocaleDateString('fr-FR') : ''}`, 235, infoTableY + infoTableHeaderHeight + 6, { width: 180, align: 'center' });
        doc.text(`${demandeAchatData[0]?.description || ''}`, 415, infoTableY + infoTableHeaderHeight + 6, { width: 145, align: 'center' });

        // === TABLEAU DES ARTICLES (Réf, Désignation, Qté uniquement) ===
        let y = infoTableY + infoTableTotalHeight + 10;
        const articlesTableHeaderHeight = 20;
        const lightGrayColor = '#E0E0E0';

        // Calculer l'espace disponible jusqu'aux signatures
        const pageHeight = 842;
        const bottomMargin = 40;
        const footerHeight = 55;
        const footerY = pageHeight - bottomMargin - footerHeight;
        
        // Position des signatures (juste avant le footer)
        const signatureBoxHeight = 60;
        const signatureBoxY = footerY - signatureBoxHeight - 10; // 10px avant le footer
        
        const tableStartY = y + articlesTableHeaderHeight;
        const maxYBeforeSignatures = signatureBoxY - 10; // 10px de marge avant les signatures
        const availableHeight = maxYBeforeSignatures - tableStartY;

        // Largeur du tableau : occuper toute la largeur utile de la page (595 - 40*2 = 515)
        const tableX = 40; // Marge gauche
        const tableWidth = 515; // Largeur totale (595 - 40*2)
        const tableRightX = tableX + tableWidth; // 555

        // Dessiner l'en-tête du tableau
        doc.roundedRect(tableX, y, tableWidth, articlesTableHeaderHeight, tableBorderRadius).fill(lightGrayColor).stroke('#000');
        doc.lineWidth(1).roundedRect(tableX, y, tableWidth, articlesTableHeaderHeight, tableBorderRadius).stroke('#000');
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');

        const colRefX = tableX;
        const colRefWidth = 100;
        const colDesignationX = colRefX + colRefWidth;
        const colDesignationWidth = tableWidth - colRefWidth - 60; // Le reste moins la colonne Qté
        const colDesignationPadding = 6; // Réduire le padding
        const colQteX = colDesignationX + colDesignationWidth;
        const colQteWidth = 60;

        doc.text('Réf', colRefX, y + 6, { width: colRefWidth, align: 'center' });
        doc.text('Désignation', colDesignationX, y + 6, { width: colDesignationWidth, align: 'center' });
        doc.text('Qté', colQteX, y + 6, { width: colQteWidth, align: 'center' });

        y += articlesTableHeaderHeight;

        doc.font('Helvetica').fillColor('#000000').stroke('#000');

        if (demandeAchatData && demandeAchatData.length > 0) {
          // Calculer d'abord toutes les hauteurs nécessaires
            const baseRowHeight = 20; // Hauteur de base minimale pour un rendu compact
            const maxRowHeight = 500;
          const rowHeights = [];
          let totalNeededHeight = 0;

          demandeAchatData.forEach((line) => {
            const designationHtml = line.article || line.designation || '';
            // La largeur effective pour le calcul de hauteur doit tenir compte du padding interne de renderInlineHtml (16px)
            const effectiveDesignationWidth = Math.max(0, colDesignationWidth - 16);

            const designationPlain = (designationHtml || '')
              .replace(/<h[1-6][^>]*>/gi, '\n').replace(/<\/h[1-6]>/gi, '\n')
              .replace(/<ul[^>]*>/gi, '\n').replace(/<\/ul>/gi, '\n')
              .replace(/<li[^>]*>/gi, '\n• ').replace(/<\/li>/gi, '')
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<p[^>]*>/gi, '\n').replace(/<\/p>/gi, '\n')
              .replace(/<[^>]*>/g, '')
              .replace(/[ \t]+/g, ' ')
              .trim();

            let textHeight = baseRowHeight;
            if (effectiveDesignationWidth > 0 && designationPlain.length > 0) {
              try {
                const safeWidth = Math.max(1, Math.min(Math.floor(effectiveDesignationWidth), 10000));
                doc.fontSize(9).font('Helvetica');
                const calculatedHeight = doc.heightOfString(designationPlain, { width: safeWidth, align: 'left' });
                if (typeof calculatedHeight === 'number' && !isNaN(calculatedHeight) && calculatedHeight > 0) {
                  textHeight = calculatedHeight;
                }
              } catch (error) {
                textHeight = baseRowHeight;
              }
            }

            const validTextHeight = isNaN(textHeight) || textHeight <= 0 ? baseRowHeight : textHeight;
            // Espacement vertical minimal - seulement ce qui est nécessaire pour le texte
            const naturalHeight = Math.max(baseRowHeight, Math.ceil(validTextHeight) + 4);
            const rowHeight = Math.min(maxRowHeight, naturalHeight);
            const validRowHeight = isNaN(rowHeight) || rowHeight <= 0 ? baseRowHeight : rowHeight;
            
            rowHeights.push(validRowHeight);
            totalNeededHeight += validRowHeight;
          });

          // Ajuster les hauteurs pour remplir l'espace disponible jusqu'aux signatures
          // mais avec un espacement minimal entre les lignes
          let adjustedRowHeights = [...rowHeights];
          
          if (totalNeededHeight < availableHeight) {
            // Si on a moins de contenu que d'espace disponible, répartir l'espace supplémentaire
            // mais de manière minimale pour éviter les grands espaces
            const extraSpace = availableHeight - totalNeededHeight;
            // Répartir l'espace supplémentaire de manière minimale (maximum 3px par ligne)
            const maxExtraPerRow = 3;
            const extraPerRow = Math.min(maxExtraPerRow, Math.floor(extraSpace / rowHeights.length));
            adjustedRowHeights = rowHeights.map(h => h + extraPerRow);
            // Ajuster pour que la somme soit exactement égale à availableHeight
            const currentTotal = adjustedRowHeights.reduce((sum, h) => sum + h, 0);
            const diff = availableHeight - currentTotal;
            if (diff !== 0 && adjustedRowHeights.length > 0) {
              adjustedRowHeights[adjustedRowHeights.length - 1] += diff;
            }
            totalNeededHeight = availableHeight;
          } else if (totalNeededHeight > availableHeight) {
            // Si on a plus de contenu, ajuster proportionnellement pour remplir exactement l'espace
            const scaleFactor = availableHeight / totalNeededHeight;
            adjustedRowHeights = rowHeights.map(h => Math.max(baseRowHeight, Math.floor(h * scaleFactor)));
            // Ajuster pour que la somme soit exactement égale à availableHeight
            const currentTotal = adjustedRowHeights.reduce((sum, h) => sum + h, 0);
            const diff = availableHeight - currentTotal;
            if (diff !== 0 && adjustedRowHeights.length > 0) {
              adjustedRowHeights[adjustedRowHeights.length - 1] += diff;
            }
            totalNeededHeight = availableHeight;
          } else {
            // Exactement la bonne taille
            totalNeededHeight = availableHeight;
          }

          // Le tableau sera dessiné à la fin après avoir dessiné toutes les lignes
          // pour qu'il occupe exactement l'espace jusqu'aux signatures
          // Positions des lignes verticales de séparation
          const xPositions = [colDesignationX, colQteX, tableRightX];

          // Dessiner chaque ligne
          let currentY = tableStartY;
          let currentPageTableStartY = tableStartY;
          let isFirstRowOnPage = true;
          let currentMaxYBeforeSignatures = maxYBeforeSignatures;
          
          demandeAchatData.forEach((line, index) => {
            const ref = line.article_cod || '';
            const designationHtml = line.article || line.designation || '';
            const qte = isNaN(Number(line.quantite)) ? 0 : Number(line.quantite);
            let rowHeight = adjustedRowHeights[index] || baseRowHeight;

            // Vérifier si on dépasse la page - créer une nouvelle page seulement s'il reste des lignes
            if (currentY + rowHeight > currentMaxYBeforeSignatures && index < demandeAchatData.length - 1) {
              // Fermer le tableau sur la page actuelle
              const pageTableHeight = currentY - currentPageTableStartY;
              if (pageTableHeight > 0) {
                doc.roundedRect(tableX, currentPageTableStartY, tableWidth, pageTableHeight, tableBorderRadius).stroke('#000');
                xPositions.forEach(x => doc.moveTo(x, currentPageTableStartY).lineTo(x, currentY).stroke('#000'));
              }

              // Nouvelle page
              doc.addPage();
              currentY = 50;
              currentPageTableStartY = 50;
              
              // Recalculer l'espace disponible sur la nouvelle page
              currentMaxYBeforeSignatures = signatureBoxY - 10;
              const newTableStartY = currentY + articlesTableHeaderHeight;
              const newAvailableHeight = currentMaxYBeforeSignatures - newTableStartY;
              
              // Redessiner l'en-tête
              doc.roundedRect(tableX, currentY, tableWidth, articlesTableHeaderHeight, tableBorderRadius).fill(lightGrayColor).stroke('#000');
              doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
              doc.text('Réf', colRefX, currentY + 6, { width: colRefWidth, align: 'center' });
              doc.text('Désignation', colDesignationX, currentY + 6, { width: colDesignationWidth, align: 'center' });
              doc.text('Qté', colQteX, currentY + 6, { width: colQteWidth, align: 'center' });
              currentY += articlesTableHeaderHeight;
              currentPageTableStartY = currentY;
              doc.font('Helvetica').fillColor('#000000').stroke('#000');

              // Ajuster les hauteurs pour remplir l'espace disponible avec un espacement minimal
              const remainingHeights = rowHeights.slice(index);
              const remainingTotal = remainingHeights.reduce((sum, h) => sum + h, 0);
              
              if (remainingTotal < newAvailableHeight) {
                // Répartir l'espace supplémentaire de manière minimale (maximum 3px par ligne)
                const extraSpace = newAvailableHeight - remainingTotal;
                const maxExtraPerRow = 3;
                const extraPerRow = Math.min(maxExtraPerRow, Math.floor(extraSpace / remainingHeights.length));
                const adjustedRemaining = remainingHeights.map(h => h + extraPerRow);
                const currentTotal = adjustedRemaining.reduce((sum, h) => sum + h, 0);
                const diff = newAvailableHeight - currentTotal;
                if (diff !== 0 && adjustedRemaining.length > 0) {
                  adjustedRemaining[adjustedRemaining.length - 1] += diff;
                }
                adjustedRowHeights = rowHeights.slice(0, index).concat(adjustedRemaining);
              } else if (remainingTotal > newAvailableHeight) {
                const scaleFactor = newAvailableHeight / remainingTotal;
                const adjustedRemaining = remainingHeights.map(h => Math.max(baseRowHeight, Math.floor(h * scaleFactor)));
                const currentTotal = adjustedRemaining.reduce((sum, h) => sum + h, 0);
                const diff = newAvailableHeight - currentTotal;
                if (diff !== 0 && adjustedRemaining.length > 0) {
                  adjustedRemaining[adjustedRemaining.length - 1] += diff;
                }
                adjustedRowHeights = rowHeights.slice(0, index).concat(adjustedRemaining);
              } else {
                adjustedRowHeights = rowHeights.slice(0, index).concat(remainingHeights);
              }
              
              // Mettre à jour rowHeight pour cette ligne avec la nouvelle valeur
              rowHeight = adjustedRowHeights[index] || baseRowHeight;
              isFirstRowOnPage = true;
            }

            // Pas de lignes de séparation entre les détails
            
            doc.font('Helvetica').fontSize(9).fillColor('#000000');
            
            // Tous les éléments (Réf, Désignation, Qté) sur la même ligne horizontale
            // Espacement vertical minimal pour un rendu compact
            const textY = currentY + 3;
            
            // Réf aligné à gauche
            doc.text(ref || '', colRefX + 8, textY, { width: colRefWidth - 16, align: 'left' });

            // Désignation (avec HTML support) - même ligne
            // La fonction renderInlineHtml ajoute un padding de 8px de chaque côté (total 16px)
            // On passe la largeur complète de la colonne à renderInlineHtml qui gère son propre padding
            // Position X: colDesignationX pour commencer au début de la colonne
            // Largeur: colDesignationWidth complète (renderInlineHtml soustraira 16px pour son padding interne)
            renderInlineHtml(doc, designationHtml, colDesignationX, textY - 8, colDesignationWidth, rowHeight - 6);

            // Quantité alignée à droite - même ligne
            const qteText = qte.toFixed(2).replace('.', ',');
            doc.text(qteText, colQteX, textY, { width: colQteWidth, align: 'right' });

            currentY += rowHeight;
            isFirstRowOnPage = false;
          });

          // Fermer le tableau sur la dernière page avec la hauteur exacte jusqu'aux signatures
          // Le tableau doit occuper TOUT l'espace jusqu'aux signatures
          const targetHeight = currentMaxYBeforeSignatures - currentPageTableStartY;
          if (targetHeight > 0) {
            doc.roundedRect(tableX, currentPageTableStartY, tableWidth, targetHeight, tableBorderRadius).stroke('#000');
            xPositions.forEach(x => doc.moveTo(x, currentPageTableStartY).lineTo(x, currentPageTableStartY + targetHeight).stroke('#000'));
          }

          y = currentPageTableStartY + targetHeight;
        } else {
          // Si aucune ligne, dessiner un tableau de hauteur minimale
          const minTableHeight = 50;
          doc.roundedRect(tableX, tableStartY, tableWidth, minTableHeight, tableBorderRadius).stroke('#000');
          const xPositionsEmpty = [colDesignationX, colQteX, tableRightX];
          xPositionsEmpty.forEach(x => doc.moveTo(x, tableStartY).lineTo(x, tableStartY + minTableHeight).stroke('#000'));
          doc.text('Aucune ligne disponible.', 60, tableStartY + 20);
          y = tableStartY + minTableHeight;
        }

        // PAS DE TOTAUX pour la demande d'achat

        // === SIGNATURES ===
        // Positionner les signatures juste avant le footer (variables déjà définies plus haut)
        const signatureBoxWidth = 250;
        const signatureBoxGap = 10;
        const signatureBox1X = 50;
        const signatureBox2X = signatureBox1X + signatureBoxWidth + signatureBoxGap;

        // Vérifier si les signatures peuvent tenir sur la page actuelle
        // Si le tableau se termine trop bas, on ne peut pas mettre les signatures
        const spaceNeededForSignatures = signatureBoxHeight + 10;
        const canFitSignaturesOnCurrentPage = y + spaceNeededForSignatures <= footerY;

        if (canFitSignaturesOnCurrentPage) {
          // Les signatures tiennent sur la page actuelle
          doc.roundedRect(signatureBox1X, signatureBoxY, signatureBoxWidth, signatureBoxHeight, tableBorderRadius).stroke('#000');
          doc.roundedRect(signatureBox2X, signatureBoxY, signatureBoxWidth, signatureBoxHeight, tableBorderRadius).stroke('#000');

          doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
          doc.text('Direction', signatureBox1X, signatureBoxY + 10, { width: signatureBoxWidth, align: 'center' });
          doc.text('Bon Pour Accord', signatureBox2X, signatureBoxY + 10, { width: signatureBoxWidth, align: 'center' });
        } else {
          // Les signatures ne tiennent pas, mais on ne crée PAS de nouvelle page vide
          // On les met juste après le tableau si possible, sinon on les omet
          const alternativeSignatureY = y + 10;
          if (alternativeSignatureY + signatureBoxHeight <= footerY) {
            doc.roundedRect(signatureBox1X, alternativeSignatureY, signatureBoxWidth, signatureBoxHeight, tableBorderRadius).stroke('#000');
            doc.roundedRect(signatureBox2X, alternativeSignatureY, signatureBoxWidth, signatureBoxHeight, tableBorderRadius).stroke('#000');

            doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
            doc.text('Direction', signatureBox1X, alternativeSignatureY + 10, { width: signatureBoxWidth, align: 'center' });
            doc.text('Bon Pour Accord', signatureBox2X, alternativeSignatureY + 10, { width: signatureBoxWidth, align: 'center' });
          }
        }

        // === PIED DE PAGE ===
        const footerBgColor = '#E8F4F8';
        const footerLineSpacing = 8;
        const footerStartY = footerY + 5;

        // Toujours dessiner le footer sur la page actuelle, ne jamais créer de page vide
        doc.rect(0, footerY, 595, footerHeight).fill(footerBgColor);

        if (options.documentSociete && options.documentSociete.pied_page) {
          const piedPage = options.documentSociete.pied_page;
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

        // Cachet optionnel
        const withStamp = !!options.withStamp;
        if (withStamp) {
          const stampX = 470;
          const stampY = 760;
          doc.save();
          doc.rotate(-12, { origin: [stampX, stampY] });
          doc.lineWidth(3).strokeColor('#046ba7').fillColor('rgba(0,0,0,0)');
          doc.circle(stampX, stampY, 60).stroke();
          doc.font('Helvetica-Bold').fontSize(14).fillColor('#046ba7');
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

module.exports = new DemandeAchatPdfService();

