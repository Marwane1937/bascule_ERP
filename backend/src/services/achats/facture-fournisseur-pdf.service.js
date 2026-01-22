const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { renderFormattedText } = require('../pdf-format-helper');

/**
 * Service dédié à la génération de PDF pour les FACTURES FOURNISSEUR
 * Format identique à celui des factures client
 */

function htmlToPlainText(html) {
  if (!html) return '';
  let text = html.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<p[^>]*>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/[ \t]+/g, ' ').trim();
  return text;
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
  if (n < 20) return 'dix-' + units[n - 10];
  if (n < 70) {
    const ten = Math.floor(n / 10);
    const unit = n % 10;
    if (unit === 0) return tens[ten];
    if (unit === 1 && [2, 3, 4, 5, 6].includes(ten)) {
      return tens[ten] + '-et-un';
    }
    return tens[ten] + '-' + underHundredFR(unit);
  }
  if (n < 80) {
    return 'soixante-' + underHundredFR(n - 60);
  }
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
  if (hundred > 1 && rest === 0) {
    words += 's';
  }
  if (rest > 0) {
    words += (rest < 100 ? ' ' : '') + underHundredFR(rest);
  }
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
    words += numberToWordsFR(billions) + ' milliard';
    if (billions > 1) words += 's';
  }
  if (millions > 0) {
    if (words) words += ' ';
    words += numberToWordsFR(millions) + ' million';
    if (millions > 1) words += 's';
  }
  if (thousands > 0) {
    if (words) words += ' ';
    if (thousands === 1) {
      words += 'mille';
    } else {
      words += numberToWordsFR(thousands) + ' mille';
    }
  }
  if (rest > 0) {
    if (words) words += ' ';
    words += underThousandFR(rest);
  }

  return words.trim();
}

function convertAmountToWordsFR(amount) {
  const absAmount = Math.abs(amount);
  const dirhams = Math.floor(absAmount);
  const centimes = Math.round((absAmount - dirhams) * 100);

  let words = numberToWordsFR(dirhams) + (dirhams > 1 ? ' dirhams' : ' dirham');
  if (centimes > 0) {
    words += ' et ' + numberToWordsFR(centimes) + (centimes > 1 ? ' centimes' : ' centime');
  }

  if (amount < 0) {
    words = 'moins ' + words;
  }

  return words.charAt(0).toUpperCase() + words.slice(1);
}

class FactureFournisseurPdfService {
  /**
   * Génère un PDF professionnel pour une FACTURE FOURNISSEUR
   * @param {Array} factureData - Tableau de lignes de facture depuis achat_document_detail
   * @param {Object} options - Options de génération (documentSociete, withStamp, etc.)
   * @returns {Promise<string>} - Chemin du fichier PDF généré
   */
  async genererPDF(factureData, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('[genererPDF Facture Fournisseur] 📊 Données facture reçues:', {
          isArray: Array.isArray(factureData),
          length: Array.isArray(factureData) ? factureData.length : 0,
          type: typeof factureData,
          firstElement: Array.isArray(factureData) && factureData.length > 0 ? factureData[0] : null
        });

        if (!Array.isArray(factureData) || factureData.length === 0) {
          console.error('[genererPDF Facture Fournisseur] ❌ Aucune donnée de facture disponible');
          reject(new Error('Aucune donnée de facture disponible pour la génération PDF.'));
          return;
        }

        // === EXONÉRATION TVA (FACTURE FOURNISSEUR) - Désactivée ===
        // Note: Vérification d'exonération TVA supprimée pour éviter les erreurs de module manquant
        let isFournisseurExonerated = false;

        // Créer le dossier factures-fournisseur s'il n'existe pas
        const facturesDir = path.join(__dirname, '..', 'public', 'factures-fournisseur');
        if (!fs.existsSync(facturesDir)) {
          fs.mkdirSync(facturesDir, { recursive: true });
        }

        const fileName = `facture-fournisseur-${Date.now()}.pdf`;
        const pdfPath = path.join(facturesDir, fileName);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const writeStream = fs.createWriteStream(pdfPath);

        writeStream.on('finish', () => {
          resolve(pdfPath);
        });
        writeStream.on('error', (err) => {
          console.error('❌ Erreur écriture PDF facture fournisseur :', err);
          reject(err);
        });

        doc.pipe(writeStream);

        // === CONSTANTES POUR LA PAGINATION ===
        const tableBorderRadius = 5;
        const articlesTableHeaderHeight = 20;
        const firstLine = factureData[0];

        // === FONCTION: Dessiner l'en-tête du document (logo, titre, fournisseur) ===
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
              const logoPath = path.join(__dirname, '..', 'public', 'logo-bascule.jpg');
              if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, imageOptions);
            }
          } else {
            const logoPath = path.join(__dirname, '..', 'public', 'logo-bascule.jpg');
            if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, imageOptions);
          }

          // En-tête entreprise - à côté du logo (x=160, y aligné avec le logo)
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

          // Ligne de séparation
          doc.rect(40, 100, 520, 1).fill('#000');

          // Titre du document
          doc.fontSize(16).font('Helvetica-Bold').fillColor('#000').text('FACTURE FOURNISSEUR', 50, 140);

          // Bloc fournisseur
          const fournisseurTop = 110;
          const fournisseurBoxWidth = 260;
          const fournisseurBoxHeight = 60;
          const fournisseurBoxX = 300;

          doc.roundedRect(fournisseurBoxX, fournisseurTop, fournisseurBoxWidth, fournisseurBoxHeight, tableBorderRadius).stroke('#000');
          doc.fontSize(10).font('Helvetica').fillColor('#000');
          
          // Nom du fournisseur avec gestion du retour à la ligne
          const fournisseurNom = firstLine.fournisseur || firstLine.nom_fournisseur || '';
          const fournisseurText = `Fournisseur : ${fournisseurNom}`;
          doc.text(fournisseurText, fournisseurBoxX + 10, fournisseurTop + 10, { width: fournisseurBoxWidth - 20, align: 'left' });
          
          // Adresse
          doc.text(`Adresse : ${firstLine.adresse || ''}`, fournisseurBoxX + 10, fournisseurTop + 28, { width: fournisseurBoxWidth - 20, align: 'left' });
          doc.text(`${firstLine.ville || ''}`, fournisseurBoxX + 10, fournisseurTop + 46, { width: fournisseurBoxWidth - 20, align: 'left' });

          // Tableau d'info (Numéro, Date, Commande) - uniquement sur la première page
          if (isFirstPage) {
            const infoTableY = 210;
            const infoTableHeaderHeight = 25;
            const infoTableRowHeight = 20;
            const infoTableTotalHeight = infoTableHeaderHeight + infoTableRowHeight;

            doc.roundedRect(50, infoTableY, 510, infoTableTotalHeight, tableBorderRadius).stroke('#000');
            doc.moveTo(50, infoTableY + infoTableHeaderHeight).lineTo(560, infoTableY + infoTableHeaderHeight).stroke('#000');
            doc.moveTo(230, infoTableY).lineTo(230, infoTableY + infoTableTotalHeight).stroke('#000');
            doc.moveTo(410, infoTableY).lineTo(410, infoTableY + infoTableTotalHeight).stroke('#000');

            doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
            doc.text('Facture N°', 55, infoTableY + 8, { width: 180, align: 'center' });
            doc.text('Date', 235, infoTableY + 8, { width: 180, align: 'center' });
            doc.text('Bon de Commande', 415, infoTableY + 8, { width: 145, align: 'center' });

            doc.font('Helvetica').fontSize(9);
            doc.text(`${firstLine.numero || ''}`, 55, infoTableY + infoTableHeaderHeight + 6, { width: 180, align: 'center' });
            const formattedDate = firstLine.date ? new Date(firstLine.date).toLocaleDateString('fr-FR') : '';
            doc.text(formattedDate, 235, infoTableY + infoTableHeaderHeight + 6, { width: 180, align: 'center' });
            doc.text(`${firstLine.numero_commande || ''}`, 415, infoTableY + infoTableHeaderHeight + 6, { width: 145, align: 'center' });

            return infoTableY + infoTableTotalHeight + 10;
          } else {
            return 180;
          }
        };

        // === FONCTION: Dessiner l'en-tête du tableau des articles ===
        const drawTableHeader = (y) => {
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
        y = drawTableHeader(y);

        // Positions des colonnes
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

        doc.font('Helvetica').fillColor('#000').stroke('#000');
        let totalHT = 0, totalTVA = 0, totalTTC = 0, totalReduction = 0;

        // === RENDU DES LIGNES DU TABLEAU AVEC PAGINATION ===
        if (factureData && factureData.length > 0) {
          factureData.forEach((line, index) => {
            const ref = line.article_cod || '';
            const designation = line.article_nom || line.article || line.designation || '';
            const qte = parseFloat(line.quantite) || 0;
            const pu = parseFloat(line.prix) || 0;
            const remise = parseFloat(line.remise) || 0;
            const remiseMontant = parseFloat(line.remise_montant) || 0;

            let ht = qte * pu;

            if (remiseMontant > 0) {
              ht = ht - remiseMontant;
            } else if (remise > 0 && remise <= 1) {
              ht = ht * (1 - remise);
            } else if (remise > 1) {
              ht = ht * (1 - remise / 100);
            }

            if (ht < 0) ht = 0;

            const totalAvantRemise = qte * pu;
            const montantReduction = totalAvantRemise - ht;
            const tva = ht * (parseFloat(line.taux_tva) || 0);
            const ttc = ht + tva;

            totalHT += ht;
            totalReduction += montantReduction;
            totalTVA += tva;
            totalTTC += ttc;

            let remiseValueText = '0,00';
            let remiseSymbol = '';

            if (remiseMontant > 0) {
              remiseValueText = remiseMontant.toFixed(2).replace('.', ',');
              remiseSymbol = '';
            } else if (remise > 0 && remise <= 1) {
              remiseValueText = (remise * 100).toFixed(2).replace('.', ',');
              remiseSymbol = '%';
            } else if (remise > 1) {
              remiseValueText = remise.toFixed(2).replace('.', ',');
              remiseSymbol = '%';
            }

            const designationPlain = designation
              .replace(/<h[1-6][^>]*>/gi, '\n').replace(/<\/h[1-6]>/gi, '\n')
              .replace(/<ul[^>]*>/gi, '\n').replace(/<\/ul>/gi, '\n')
              .replace(/<li[^>]*>/gi, '\n• ').replace(/<\/li>/gi, '')
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<p[^>]*>/gi, '\n').replace(/<\/p>/gi, '\n')
              .replace(/<[^>]*>/g, '')
              .replace(/[ \t]+/g, ' ')
              .trim();

            const effectiveDesignationWidth = Math.max(0, colDesignationWidth - (colDesignationPadding * 2));
            const baseRowHeight = 20;
            const maxRowHeight = 500;
            doc.fontSize(9).font('Helvetica');
            const textHeight = doc.heightOfString(designationPlain || ' ', { width: effectiveDesignationWidth, align: 'left' });
            const naturalHeight = Math.max(baseRowHeight, Math.ceil(textHeight) + (colDesignationPadding * 2) + 10);
            const rowHeight = Math.min(maxRowHeight, naturalHeight);

            const currentY = isNaN(y) || y < 0 ? 0 : y;
            const estimatedNextY = currentY + rowHeight;
            const pageLimit = 700;

            if (estimatedNextY > pageLimit && !isNaN(estimatedNextY)) {
              drawPageFooter();
              doc.addPage();
              y = drawDocumentHeader(false);
              y = drawTableHeader(y);
            }

            const validY = isNaN(y) || y < 0 ? 0 : y;
            const centerY = validY + (rowHeight / 2) - 3;

            doc.roundedRect(50, validY, 510, rowHeight, tableBorderRadius).stroke('#000');
            doc.moveTo(100, validY).lineTo(100, validY + rowHeight).stroke('#000');
            doc.moveTo(350, validY).lineTo(350, validY + rowHeight).stroke('#000');
            doc.moveTo(410, validY).lineTo(410, validY + rowHeight).stroke('#000');
            doc.moveTo(460, validY).lineTo(460, validY + rowHeight).stroke('#000');
            doc.moveTo(510, validY).lineTo(510, validY + rowHeight).stroke('#000');

            doc.font('Helvetica').fontSize(9).fillColor('#000');
            doc.text(ref, colRefX, centerY, { width: colRefWidth, align: 'center' });
            renderInlineHtml(doc, line.article_nom || line.article || line.designation || '', colDesignationX + colDesignationPadding, validY + colDesignationPadding, effectiveDesignationWidth, rowHeight - colDesignationPadding * 2);
            doc.text(qte.toFixed(2).replace('.', ','), colQteX, centerY, { width: colQteWidth, align: 'center' });
            doc.text(pu.toFixed(2).replace('.', ','), colPUX, centerY, { width: colPUWidth, align: 'center' });
            const remiseText = remiseValueText + (remiseSymbol === '%' ? '%' : '');
            doc.text(remiseText, colRX, centerY, { width: colRWidth, align: 'center' });
            doc.text(ht.toFixed(2).replace('.', ','), colHTX, centerY, { width: colHTWidth, align: 'center' });

            y = validY + rowHeight;
          });
        } else {
          doc.text('Aucune ligne de facture disponible.', 60, y + 10);
          y += 30;
        }

        // === VÉRIFICATION SAUT DE PAGE AVANT BLOC RÉCAPITULATIF ===
        const maxYBeforeFooter = 550;
        if (y > maxYBeforeFooter) {
          drawPageFooter();
          doc.addPage();
          y = drawDocumentHeader(false);
        }

        // === TOTAUX (4 colonnes : Total HT, Réduction, Total TVA, Total TTC) ===
        y += 10;
        const totalsStartX = 305;
        const totalsStartY = y;
        const totalsWidth = 255;
        const totalsHeight = 45;
        const totalsRadius = 5;
        const totalsColWidth = totalsWidth / 4;

        doc.roundedRect(totalsStartX, totalsStartY, totalsWidth, totalsHeight, totalsRadius).stroke('#000');
        doc.moveTo(totalsStartX, totalsStartY + totalsHeight / 2).lineTo(totalsStartX + totalsWidth, totalsStartY + totalsHeight / 2).stroke('#000');
        doc.moveTo(totalsStartX + totalsColWidth, totalsStartY).lineTo(totalsStartX + totalsColWidth, totalsStartY + totalsHeight).stroke('#000');
        doc.moveTo(totalsStartX + totalsColWidth * 2, totalsStartY).lineTo(totalsStartX + totalsColWidth * 2, totalsStartY + totalsHeight).stroke('#000');
        doc.moveTo(totalsStartX + totalsColWidth * 3, totalsStartY).lineTo(totalsStartX + totalsColWidth * 3, totalsStartY + totalsHeight).stroke('#000');

        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
        doc.text('Total HT', totalsStartX, totalsStartY + 8, { width: totalsColWidth, align: 'center' });
        doc.text('Réduction', totalsStartX + totalsColWidth, totalsStartY + 8, { width: totalsColWidth, align: 'center' });
        doc.text('Total TVA', totalsStartX + totalsColWidth * 2, totalsStartY + 8, { width: totalsColWidth, align: 'center' });
        doc.text('Total TTC', totalsStartX + totalsColWidth * 3, totalsStartY + 8, { width: totalsColWidth, align: 'center' });

        doc.font('Helvetica').fontSize(9).fillColor('#000');
        doc.text(totalHT.toFixed(2).replace('.', ','), totalsStartX, totalsStartY + totalsHeight / 2 + 6, { width: totalsColWidth, align: 'center' });
        doc.text(totalReduction.toFixed(2).replace('.', ','), totalsStartX + totalsColWidth, totalsStartY + totalsHeight / 2 + 6, { width: totalsColWidth, align: 'center' });
        doc.text(totalTVA.toFixed(2).replace('.', ','), totalsStartX + totalsColWidth * 2, totalsStartY + totalsHeight / 2 + 6, { width: totalsColWidth, align: 'center' });
        doc.text(totalTTC.toFixed(2).replace('.', ','), totalsStartX + totalsColWidth * 3, totalsStartY + totalsHeight / 2 + 6, { width: totalsColWidth, align: 'center' });

        y += totalsHeight + 20;

        // === ARRÊTÉ ===
        const totalTTCWords = convertAmountToWordsFR(totalTTC);
        y += 5;
        doc.font('Helvetica-Oblique').fontSize(12).fillColor('#2c3e50');
        const phraseText = 'Arrêté la présente facture à la somme de :';
        doc.text(phraseText, 50, y, { continued: true });
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000');
        doc.text(' ' + totalTTCWords, { continued: false });
        y = doc.y + 10;

        // Mention sur PDF facture si exonération valide
        if (isFournisseurExonerated) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
          doc.text('TVA non applicable – Fournisseur exonéré conformément à la lettre d\'exonération en vigueur', 50, y, {
            width: 500,
            align: 'center'
          });
          y = doc.y + 10;
        }

        // === PIED DE PAGE ===
        drawPageFooter();

        // Cachet optionnel
        const withStamp = !!options.withStamp;
        if (withStamp) {
          const stampX = 470;
          const stampY = 730;
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
        console.error('[genererPDF Facture Fournisseur] ❌ Erreur lors de la génération du PDF:', error);
        reject(error);
      }
    });
  }
}

module.exports = new FactureFournisseurPdfService();

