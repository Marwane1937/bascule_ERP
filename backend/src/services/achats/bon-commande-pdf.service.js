const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { renderFormattedText } = require('../pdf-format-helper');

/**
 * Service dédié à la génération de PDF pour les BONS DE COMMANDE ACHAT
 * Ce service est basé sur le même format que les devis
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

// Fonctions pour convertir les nombres en lettres (français)
const units = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const tens = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function underHundredFR(n) {
  if (n < 17) return units[n];
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  if (n < 70) {
    if (unit === 0) return tens[ten];
    if (unit === 1 && ten < 8) return tens[ten] + '-et-un';
    return tens[ten] + '-' + underHundredFR(unit);
  }
  if (n < 80) return 'soixante-' + underHundredFR(n - 60);
  if (n < 100) {
    const base = 'quatre-vingt';
    if (n === 80) return base + 's';
    return base + '-' + underHundredFR(n - 80);
  }
  return '';
}

function underThousandFR(n) {
  if (n === 0) return '';
  if (n < 100) return underHundredFR(n);
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  let words = '';
  if (hundred === 1) {
    words = 'cent';
  } else {
    words = units[hundred] + ' cent';
  }
  if (hundred > 1 && rest === 0) words += 's';
  if (rest > 0) words += (rest < 100 ? ' ' : '') + underHundredFR(rest);
  return words.trim();
}

function numberToWordsFR(n) {
  if (n === 0) return 'zéro';
  if (n < 0) return 'moins ' + numberToWordsFR(-n);

  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  let words = '';

  if (billions > 0) {
    words += underThousandFR(billions) + ' milliard';
    if (billions > 1) words += 's';
    words += ' ';
  }
  if (millions > 0) {
    words += underThousandFR(millions) + ' million';
    if (millions > 1) words += 's';
    words += ' ';
  }
  if (thousands > 0) {
    if (thousands === 1) words += 'mille ';
    else words += underThousandFR(thousands) + ' mille ';
  }
  if (rest > 0) words += underThousandFR(rest);

  return words.trim();
}

function amountToWordsFR(amount) {
  const intPart = Math.floor(amount);
  const decPart = Math.round((amount - intPart) * 100);
  let result = numberToWordsFR(intPart) + ' dirhams';
  if (decPart > 0) result += ' et ' + numberToWordsFR(decPart) + ' centimes';
  return result;
}

class BonCommandeAchatPdfService {
  /**
   * Génère un PDF professionnel pour un BON DE COMMANDE ACHAT
   * @param {Array} commandeData - Données de la commande
   * @param {Object} options - Options de génération (documentSociete, withStamp, etc.)
   * @returns {Promise<string>} - Chemin du fichier PDF généré
   */
  async genererPDF(commandeData, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        // Sauvegarder dans src/public/commandes-achat
        const commandeDir = path.join(__dirname, '..', '..', 'public', 'commandes-achat');
        if (!fs.existsSync(commandeDir)) {
          fs.mkdirSync(commandeDir, { recursive: true });
        }

        const fileName = `bon-commande-achat-${Date.now()}.pdf`;
        const pdfPath = path.join(commandeDir, fileName);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const writeStream = fs.createWriteStream(pdfPath);

        writeStream.on('finish', () => {
          resolve(pdfPath);
        });
        writeStream.on('error', (err) => {
          console.error('❌ Erreur écriture PDF bon commande achat :', err);
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

        // === TITRE BON DE COMMANDE ACHAT ===
        doc.fontSize(18).font('Helvetica-Bold').fillColor('#046ba7').text('BON DE COMMANDE', 50, 120);

        // === BLOC FOURNISSEUR ===
        const fournisseurTop = 110;
        const fournisseurBoxWidth = 250;
        const fournisseurBoxHeight = 60;
        const fournisseurBoxX = 310;
        const borderRadius = 5;

        doc.roundedRect(fournisseurBoxX, fournisseurTop, fournisseurBoxWidth, fournisseurBoxHeight, borderRadius).stroke('#000');

        doc.fontSize(10).font('Helvetica').fillColor('#000');
        doc.text(`Fournisseur : ${commandeData[0]?.fournisseur || ''}`, fournisseurBoxX + 10, fournisseurTop + 10);
        doc.text(`Adresse : ${commandeData[0]?.adresse || ''}`, fournisseurBoxX + 10, fournisseurTop + 25);
        doc.text(`ICE : ${commandeData[0]?.ice || ''}`, fournisseurBoxX + 10, fournisseurTop + 40);

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
        doc.text('Bon de Commande N°', 55, infoTableY + 8, { width: 180, align: 'center' });
        doc.text('Date', 235, infoTableY + 8, { width: 180, align: 'center' });
        doc.text('Description', 415, infoTableY + 8, { width: 145, align: 'center' });

        doc.font('Helvetica').fontSize(9);
        doc.text(`${commandeData[0]?.numero || ''}`, 55, infoTableY + infoTableHeaderHeight + 6, { width: 180, align: 'center' });
        doc.text(`${commandeData[0]?.date ? new Date(commandeData[0].date).toLocaleDateString('fr-FR') : ''}`, 235, infoTableY + infoTableHeaderHeight + 6, { width: 180, align: 'center' });
        doc.text(`${commandeData[0]?.description || ''}`, 415, infoTableY + infoTableHeaderHeight + 6, { width: 145, align: 'center' });

        // === TABLEAU DES ARTICLES ===
        const tableStartY = infoTableY + infoTableTotalHeight + 10;
        let y = tableStartY;
        const articlesTableHeaderHeight = 20;
        const lightGrayColor = '#E0E0E0';
        const tableX = 50;
        const tableWidth = 510;
        const tableRightX = tableX + tableWidth;

        // Calculer l'espace disponible jusqu'aux signatures
        // Les totaux prennent environ 3 lignes de 20px + 5px = 65px
        // Le montant en lettres prend environ 20px
        // Les signatures commencent après avec un espace de 10px
        const totalsBoxHeight = 65; // 3 lignes de 20px + 5px
        const montantEnLettresHeight = 20;
        const signatureBoxHeight = 60;
        const signatureBoxGap = 10;
        const pageHeight = 842;
        const bottomMargin = 40;
        const footerHeight = 55;
        const footerY = pageHeight - bottomMargin - footerHeight;
        const signatureBoxY = footerY - signatureBoxHeight - signatureBoxGap - montantEnLettresHeight - totalsBoxHeight - 10;
        const maxYBeforeSignatures = signatureBoxY - 10;
        const availableHeight = maxYBeforeSignatures - (tableStartY + articlesTableHeaderHeight);

        doc.roundedRect(tableX, y, tableWidth, articlesTableHeaderHeight, tableBorderRadius).fill(lightGrayColor).stroke('#000');
        doc.lineWidth(1).roundedRect(tableX, y, tableWidth, articlesTableHeaderHeight, tableBorderRadius).stroke('#000');
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

        let totalHT = 0;
        let totalTVA = 0;

        if (commandeData && commandeData.length > 0) {
          // Calculer d'abord toutes les hauteurs nécessaires
          const baseRowHeight = 20;
          const maxRowHeight = 500;
          const rowHeights = [];
          let totalNeededHeight = 0;

          commandeData.forEach((line) => {
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

          // Positions des lignes verticales de séparation
          const xPositions = [colDesignationX, colQteX, colPUX, colRX, colHTX, tableRightX];

          // Dessiner chaque ligne
          let currentY = tableStartY + articlesTableHeaderHeight;
          let currentPageTableStartY = currentY;
          let currentMaxYBeforeSignatures = maxYBeforeSignatures;
          
          commandeData.forEach((line, index) => {
            const ref = line.article_cod || '';
            const designationHtml = line.article || line.designation || '';
            const pu = isNaN(Number(line.prix)) ? 0 : Number(line.prix);
            const qte = isNaN(Number(line.quantite)) ? 0 : Number(line.quantite);
            const taux_tva = isNaN(Number(line.taux_tva)) ? 0.2 : Number(line.taux_tva);
            
            // Calcul remise
            const totalAvantRemise = pu * qte;
            let montantRemise = 0;
            if (line.remise_montant) {
              montantRemise = Number(line.remise_montant) || 0;
            } else if (line.remise) {
              montantRemise = totalAvantRemise * (Number(line.remise) || 0);
            }
            
            const ht = totalAvantRemise - montantRemise;
            const tva = ht * taux_tva;
            
            totalHT += ht;
            totalTVA += tva;

            let rowHeight = adjustedRowHeights[index] || baseRowHeight;

            // Vérifier si on dépasse la page - créer une nouvelle page seulement s'il reste des lignes
            if (currentY + rowHeight > currentMaxYBeforeSignatures && index < commandeData.length - 1) {
              // Fermer le tableau sur la page actuelle
              const pageTableHeight = currentY - currentPageTableStartY;
              if (pageTableHeight > 0) {
                doc.roundedRect(tableX, currentPageTableStartY, tableWidth, pageTableHeight, tableBorderRadius).stroke('#000');
                xPositions.forEach(x => doc.moveTo(x, currentPageTableStartY).lineTo(x, currentY).stroke('#000'));
              }

              // Dessiner le pied de page avant d'ajouter une nouvelle page
              doc.rect(0, footerY, 595, footerHeight).fill('#E8F4F8');
              if (options.documentSociete && options.documentSociete.pied_page) {
                const piedPage = options.documentSociete.pied_page;
                if (typeof piedPage === 'object' || (typeof piedPage === 'string' && piedPage.trim())) {
                  renderFormattedText(doc, piedPage, {
                    startX: 50,
                    startY: footerY + 5,
                    defaultFontSize: 7,
                    defaultColor: '#000000',
                    defaultFont: 'Helvetica',
                    defaultAlign: 'center',
                    defaultLineSpacing: 8,
                    width: 495
                  });
                }
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
              doc.text('P.U.', colPUX, currentY + 6, { width: colPUWidth, align: 'center' });
              doc.text('R.', colRX, currentY + 6, { width: colRWidth, align: 'center' });
              doc.text('H.T.', colHTX, currentY + 6, { width: colHTWidth, align: 'center' });
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
            }

            // Tous les éléments sur la même ligne horizontale
            // Espacement vertical minimal pour un rendu compact
            const textY = currentY + 3;

            doc.font('Helvetica').fontSize(9).fillColor('#000000');
            // Réf aligné à gauche
            doc.text(ref || '', colRefX + 8, textY, { width: colRefWidth - 16, align: 'left' });

            // Désignation (avec HTML support) - même ligne
            // La fonction renderInlineHtml ajoute un padding de 8px de chaque côté (total 16px)
            renderInlineHtml(doc, designationHtml, colDesignationX, textY - 8, colDesignationWidth, rowHeight - 6);

            // Quantité, P.U., Remise, H.T. alignés à droite - même ligne
            const qteText = qte.toFixed(2).replace('.', ',');
            doc.text(qteText, colQteX, textY, { width: colQteWidth, align: 'right' });

            const puText = pu.toFixed(2).replace('.', ',');
            doc.text(puText, colPUX, textY, { width: colPUWidth, align: 'right' });

            const remiseValue = montantRemise.toFixed(2).replace('.', ',');
            doc.text(remiseValue, colRX, textY, { width: colRWidth, align: 'right' });

            const htValue = ht.toFixed(2).replace('.', ',');
            doc.text(htValue, colHTX, textY, { width: colHTWidth, align: 'right' });

            currentY += rowHeight;
          });

          // Fermer le tableau sur la dernière page avec la hauteur exacte jusqu'aux signatures
          const targetHeight = currentMaxYBeforeSignatures - currentPageTableStartY;
          if (targetHeight > 0) {
            doc.roundedRect(tableX, currentPageTableStartY, tableWidth, targetHeight, tableBorderRadius).stroke('#000');
            xPositions.forEach(x => doc.moveTo(x, currentPageTableStartY).lineTo(x, currentPageTableStartY + targetHeight).stroke('#000'));
          }

          y = currentPageTableStartY + targetHeight;
        } else {
          doc.text('Aucune ligne disponible.', 60, y + 10);
          y += 30;
        }

        // === TOTAUX ===
        y += 10;
        const totalTTC = totalHT + totalTVA;

        const totalsBoxX = 350;
        const totalsBoxWidth = 210;
        const totalsRowHeight = 20;

        // Total HT
        doc.roundedRect(totalsBoxX, y, totalsBoxWidth, totalsRowHeight, 3).stroke('#000');
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
        doc.text('Total HT', totalsBoxX + 10, y + 6, { width: 100, align: 'left' });
        doc.text(totalHT.toFixed(2).replace('.', ',') + ' DH', totalsBoxX + 110, y + 6, { width: 90, align: 'right' });
        y += totalsRowHeight;

        // TVA
        doc.roundedRect(totalsBoxX, y, totalsBoxWidth, totalsRowHeight, 3).stroke('#000');
        doc.font('Helvetica').fontSize(9);
        doc.text('TVA 20%', totalsBoxX + 10, y + 6, { width: 100, align: 'left' });
        doc.text(totalTVA.toFixed(2).replace('.', ',') + ' DH', totalsBoxX + 110, y + 6, { width: 90, align: 'right' });
        y += totalsRowHeight;

        // Total TTC
        doc.roundedRect(totalsBoxX, y, totalsBoxWidth, totalsRowHeight, 3).fill('#046ba7').stroke('#000');
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFF');
        doc.text('Total TTC', totalsBoxX + 10, y + 5, { width: 100, align: 'left' });
        doc.text(totalTTC.toFixed(2).replace('.', ',') + ' DH', totalsBoxX + 110, y + 5, { width: 90, align: 'right' });
        y += totalsRowHeight + 5;

        // Montant en lettres
        doc.fillColor('#000').font('Helvetica-Oblique').fontSize(8);
        doc.text(`Arrêté le présent bon de commande à la somme de : ${amountToWordsFR(totalTTC)}`, 50, y, { width: 510 });
        y += 20;

        // === SIGNATURES ===
        y += 10;
        // signatureBoxHeight, signatureBoxGap et signatureBoxY sont déjà déclarés plus haut
        const signatureBoxWidth = 250;
        const currentSignatureBoxY = y; // Position actuelle pour les signatures
        const signatureBox1X = 50;
        const signatureBox2X = signatureBox1X + signatureBoxWidth + signatureBoxGap;

        doc.roundedRect(signatureBox1X, currentSignatureBoxY, signatureBoxWidth, signatureBoxHeight, tableBorderRadius).stroke('#000');
        doc.roundedRect(signatureBox2X, currentSignatureBoxY, signatureBoxWidth, signatureBoxHeight, tableBorderRadius).stroke('#000');

        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
        doc.text('Direction', signatureBox1X, currentSignatureBoxY + 10, { width: signatureBoxWidth, align: 'center' });
        doc.text('Bon Pour Accord', signatureBox2X, currentSignatureBoxY + 10, { width: signatureBoxWidth, align: 'center' });

        y = currentSignatureBoxY + signatureBoxHeight + 20;

        // === PIED DE PAGE ===
        const footerBgColor = '#E8F4F8'; // Bleu ciel comme le logo
        // pageHeight, bottomMargin, footerHeight et footerY sont déjà déclarés plus haut
        const footerLineSpacing = 8;
        const footerStartY = footerY + 5;

        // Toujours dessiner le footer sur la page actuelle, ne jamais créer de page vide
        doc.rect(0, footerY, 595, footerHeight).fill(footerBgColor);

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

  renderDefaultFooter(doc, startY, lineSpacing) {
    doc.font('Helvetica').fontSize(7).fillColor('#000');
    doc.text(
      'SARL au capital 500 000.00 DHS - allée des orangers Derb Najat Rue 4 N°67 RDC Ain Sebaa Casablanca',
      50, startY, { width: 495, align: 'center' }
    );
    doc.text(
      'Tel : 0522672135 - Fax 0522672143 - RC120431TP37951465 IF : 1680027 Email : info@lesbasculesmondial.com',
      50, startY + lineSpacing, { width: 495, align: 'center' }
    );
    doc.text(
      'RIB 007 780 000368400000157019 - CNSS : 6463814 ICE : 000079494000078',
      50, startY + (lineSpacing * 2), { width: 495, align: 'center' }
    );
  }
}

module.exports = new BonCommandeAchatPdfService();

