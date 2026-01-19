const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Service dédié à la génération de PDF pour les FACTURES
 * Format identique à celui des devis/commandes
 */

function htmlToPlainText(html) {
  if (!html) return '';
  // Remplace les balises de saut de ligne par de vrais sauts de ligne
  let text = html.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<p[^>]*>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');

  // Supprime toutes les autres balises HTML
  text = text.replace(/<[^>]+>/g, '');

  // Supprime les espaces multiples (mais préserve les sauts de ligne) et nettoie
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

  // Pre-process HTML for lists and headers
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

function drawRoundedRectOutline(doc, x, y, width, height, radius = 6) {
  doc.moveTo(x + radius, y)
    .lineTo(x + width - radius, y)
    .quadraticCurveTo(x + width, y, x + width, y + radius)
    .lineTo(x + width, y + height - radius)
    .quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    .lineTo(x + radius, y + height)
    .quadraticCurveTo(x, y + height, x, y + height - radius)
    .lineTo(x, y + radius)
    .quadraticCurveTo(x, y, x + radius, y)
    .stroke();
}

function drawRoundedTableDivider(doc, startX, startY, endX, endY) {
  doc.save();
  doc.lineWidth(1);
  doc.strokeColor('#000');
  doc.moveTo(startX, startY).lineTo(endX, endY).stroke();
  doc.restore();
}

class FacturationPdfService {
  /**
   * Génère un PDF professionnel pour une FACTURE
   * @param {Array} factureData - Tableau de lignes de facture depuis stock_detail
   * @param {Object} options - Options de génération (documentSociete, withStamp, etc.)
   * @returns {Promise<string>} - Chemin du fichier PDF généré
   */
  async genererPDF(factureData, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('[genererPDF] 📊 Données facture reçues:', {
          isArray: Array.isArray(factureData),
          length: Array.isArray(factureData) ? factureData.length : 0,
          type: typeof factureData,
          firstElement: Array.isArray(factureData) && factureData.length > 0 ? factureData[0] : null
        });

        // Vérifier que factureData est un tableau et qu'il contient des données
        if (!Array.isArray(factureData) || factureData.length === 0) {
          console.error('[genererPDF] ❌ Aucune donnée de facture disponible');
          reject(new Error('Aucune donnée de facture disponible pour la génération PDF.'));
          return;
        }

        // === EXONÉRATION TVA (FACTURE) ===
        let isClientExonerated = false;
        const part_id = factureData?.[0]?.part_id;
        if (part_id) {
          try {
            const sequelizeConn = options.sequelize || require('../config/database');
            const exonerationModel = require('../models/base/partenaire-exoneration.model');
            const exonerations = await exonerationModel.getAllExonerationsByPartId(part_id, sequelizeConn);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const validExoneration = (Array.isArray(exonerations) ? exonerations : []).find((exon) => {
              if (!exon?.date_debut || !exon?.date_fin) return false;
              const dateDebut = new Date(exon.date_debut);
              dateDebut.setHours(0, 0, 0, 0);
              const dateFin = new Date(exon.date_fin);
              dateFin.setHours(0, 0, 0, 0);
              return today >= dateDebut && today <= dateFin;
            });

            isClientExonerated = !!validExoneration;
          } catch (e) {
            console.warn('[FacturationPdfService] ⚠️ Erreur vérification exonération TVA:', e?.message || e);
            isClientExonerated = false;
          }
        }

        // Créer le dossier factures s'il n'existe pas
        const facturesDir = path.join(__dirname, '..', 'public', 'factures');
        if (!fs.existsSync(facturesDir)) {
          fs.mkdirSync(facturesDir, { recursive: true });
        }

        const fileName = `facture-${Date.now()}.pdf`;
        const pdfPath = path.join(facturesDir, fileName);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const writeStream = fs.createWriteStream(pdfPath);

        writeStream.on('finish', () => {
          resolve(pdfPath);
        });
        writeStream.on('error', (err) => {
          console.error('❌ Erreur écriture PDF facture :', err);
          reject(err);
        });

        doc.pipe(writeStream);

        // === CONSTANTES POUR LA PAGINATION ===
        const tableBorderRadius = 5;
        const articlesTableHeaderHeight = 20;
        const firstLine = factureData[0];

        // === FONCTION: Dessiner l'en-tête du document (logo, titre, client) ===
        const drawDocumentHeader = (isFirstPage = false) => {
          // Logo
          if (options.documentSociete && options.documentSociete.logo) {
            try {
              const logoBuffer = Buffer.from(options.documentSociete.logo, 'base64');
              doc.image(logoBuffer, 50, 20, { width: 100 });
            } catch (error) {
              const logoPath = path.join(__dirname, '..', 'public', 'logo-bascule.jpg');
              if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, { width: 100 });
            }
          } else {
            const logoPath = path.join(__dirname, '..', 'public', 'logo-bascule.jpg');
            if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, { width: 100 });
          }

          // En-tête entreprise
          if (options.documentSociete && options.documentSociete.entete) {
            const enteteText = htmlToPlainText(options.documentSociete.entete);
            const enteteLines = enteteText.split('\n');
            let yPos = 30;
            enteteLines.forEach(line => {
              if (line.trim()) {
                doc.fontSize(10).font('Helvetica-Bold').fillColor('#046ba7').text(line.trim(), 130, yPos);
                yPos += 12;
              }
            });
          } else {
            doc.fontSize(11).fillColor('#046ba7').font('Helvetica-Bold').text('Balances et Bascules Pont Bascule Electronique', 160, 30);
            doc.font('Helvetica').fontSize(10)
              .text('Mecanique - Vente et Reparation - Entretien', 160, 45)
              .text('Etalonnage Logiciels de Gestion', 160, 58);
          }

          // Ligne de séparation
          doc.rect(40, 100, 520, 1).fill('#000');

          // Titre du document
          doc.fontSize(20).font('Helvetica-Bold').fillColor('#000').text('FACTURE', 50, 140);

          // Bloc client
          const clientTop = 110;
          const clientBoxWidth = 260;
          const clientBoxHeight = 60;
          const clientBoxX = 300;

          doc.roundedRect(clientBoxX, clientTop, clientBoxWidth, clientBoxHeight, tableBorderRadius).stroke('#000');
          doc.fontSize(10).font('Helvetica').fillColor('#000');
          doc.text(`Client : ${firstLine.client || firstLine.nom_client || ''}`, clientBoxX + 10, clientTop + 10);
          doc.text(`Adresse : ${firstLine.adresse || ''}`, clientBoxX + 10, clientTop + 28);
          doc.text(`${firstLine.ville || ''}`, clientBoxX + 10, clientTop + 46);

          // Tableau d'info (Numéro, Date, BL) - uniquement sur la première page
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
            doc.text('Bon de Livraison', 415, infoTableY + 8, { width: 145, align: 'center' });

            doc.font('Helvetica').fontSize(9);
            doc.text(`${firstLine.numero || ''}`, 55, infoTableY + infoTableHeaderHeight + 6, { width: 180, align: 'center' });
            const formattedDate = firstLine.date ? new Date(firstLine.date).toLocaleDateString('fr-FR') : '';
            doc.text(formattedDate, 235, infoTableY + infoTableHeaderHeight + 6, { width: 180, align: 'center' });
            doc.text(`${firstLine.numero_livraison || ''}`, 415, infoTableY + infoTableHeaderHeight + 6, { width: 145, align: 'center' });

            return infoTableY + infoTableTotalHeight + 10;
          } else {
            // Pages suivantes : retourner position après l'en-tête client
            return 180;
          }
        };

        // === FONCTION: Dessiner l'en-tête du tableau des articles ===
        const drawTableHeader = (y) => {
          const lightGrayColor = '#E0E0E0';
          const tableStartX = 40; // Tableau commence à X=40 (marge gauche) - COMME LIVRAISON
          const tableWidth = 525; // Largeur totale du tableau (595 - 40 marge gauche) - COMME LIVRAISON
          doc.roundedRect(tableStartX, y, tableWidth, articlesTableHeaderHeight, tableBorderRadius).fill(lightGrayColor).stroke('#000');
          doc.lineWidth(1).roundedRect(tableStartX, y, tableWidth, articlesTableHeaderHeight, tableBorderRadius).stroke('#000');
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');

          // Colonnes redimensionnées pour mieux utiliser l'espace disponible - COMME LIVRAISON
          const colRefX = 40;
          const colRefWidth = 50;
          const colDesignationX = 90; // 40 + 50
          const colDesignationWidth = 280; // Colonne Désignation considérablement élargie - COMME LIVRAISON
          const colQteX = 370; // 90 + 280
          const colQteWidth = 45; // Légèrement réduit - COMME LIVRAISON
          const colPUX = 415; // 370 + 45
          const colPUWidth = 45; // Légèrement réduit - COMME LIVRAISON
          const colRX = 460; // 415 + 45
          const colRWidth = 35; // Réduit - COMME LIVRAISON
          const colHTX = 500; // 460 + 35 + 5 (marge)
          const colHTWidth = 50; // Réduit pour tenir dans la page - COMME LIVRAISON

          doc.text('Réf', colRefX, y + 6, { width: colRefWidth, align: 'center' });
          doc.text('Désignation', colDesignationX, y + 6, { width: colDesignationWidth, align: 'center' });
          doc.text('Qté', colQteX, y + 6, { width: colQteWidth, align: 'center' });
          doc.text('P.U.', colPUX, y + 6, { width: colPUWidth, align: 'center' });
          doc.text('R.', colRX, y + 6, { width: colRWidth, align: 'center' });
          doc.text('H.T.', colHTX, y + 6, { width: colHTWidth, align: 'center' });

          return y + articlesTableHeaderHeight;
        };

        // === FONCTION: Dessiner le pied de page (appelée sur CHAQUE page) ===
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
            const piedPageText = htmlToPlainText(options.documentSociete.pied_page);
            doc.font('Helvetica').fontSize(7).fillColor('#000');
            doc.text(piedPageText, 50, footerStartY, { width: 495, align: 'center', lineBreak: false });
          } else {
            doc.font('Helvetica').fontSize(7).fillColor('#000');
            doc.text(
              'SARL au capital 500 000.00 DHS - allée des orangers Derb Najat Rue 4 N°67 RDC Ain Sebaa Casablanca',
              50, footerStartY, { width: 495, align: 'center', lineBreak: false }
            );
            doc.text(
              'Tel : 0522672135 - Fax 0522672143 - RC120431TP37951465 IF : 1680027 Email : info@lesbasculesmondial.com',
              50, footerStartY + footerLineSpacing * 2, { width: 495, align: 'center', lineBreak: false }
            );
            doc.text(
              'RIB 007 780 000368400000157019 - CNSS : 6463814 ICE : 000079494000078',
              50, footerStartY + (footerLineSpacing * 4), { width: 495, align: 'center', lineBreak: false }
            );
          }
        };

        // === DESSINER L'EN-TÊTE DE LA PREMIÈRE PAGE ===
        let y = drawDocumentHeader(true);
        y = drawTableHeader(y);

        // Positions des colonnes (tableau occupe toute la largeur disponible - commence à X=40, largeur totale 525px) - COMME LIVRAISON
        const tableStartX = 40; // Tableau commence à X=40 (marge gauche) - COMME LIVRAISON
        const tableWidth = 525; // Largeur totale du tableau (595 - 40 marge gauche) - COMME LIVRAISON
        const colRefX = 40;
        const colRefWidth = 50;
        const colDesignationX = 90; // 40 + 50
        const colDesignationWidth = 280; // Colonne Désignation considérablement élargie - COMME LIVRAISON
        const colDesignationPadding = 8;
        const colQteX = 370; // 90 + 280
        const colQteWidth = 45; // Légèrement réduit - COMME LIVRAISON
        const colPUX = 415; // 370 + 45
        const colPUWidth = 45; // Légèrement réduit - COMME LIVRAISON
        const colRX = 460; // 415 + 45
        const colRWidth = 35; // Réduit - COMME LIVRAISON
        const colHTX = 500; // 460 + 35 + 5 (marge)
        const colHTWidth = 50; // Réduit pour tenir dans la page - COMME LIVRAISON

        doc.font('Helvetica').fillColor('#000').stroke('#000');
        let totalHT = 0, totalTVA = 0, totalTTC = 0, totalReduction = 0;

        // === RENDU DES LIGNES DU TABLEAU AVEC PAGINATION ===
        if (factureData && factureData.length > 0) {
          factureData.forEach((line, index) => {
          // Traitement de chaque ligne de facture
          const ref = line.article_cod || '';
          const designation = line.article_nom || line.article || line.designation || '';
          const qte = parseFloat(line.quantite) || 0;
          const pu = parseFloat(line.prix) || 0;
          const remise = parseFloat(line.remise) || 0;
          const remiseMontant = parseFloat(line.remise_montant) || 0;

          console.log(`[facturation-pdf] Ligne ${index + 1} - remise: ${remise}, remise_montant: ${remiseMontant}`);

          // Calculer HT avec remise - PRIORITÉ à remise_montant si > 0
          let ht = qte * pu;

          // IMPORTANT: Vérifier d'abord remise_montant (priorité)
          if (remiseMontant > 0) {
            // Remise en montant (DH) - Priorité absolue
            ht = ht - remiseMontant;
            console.log(`[facturation-pdf] ✅ Remise montant appliquée: ${remiseMontant} DH, HT après remise: ${ht}`);
          } else if (remise > 0 && remise <= 1) {
            // Remise en pourcentage décimal (0.1 = 10%)
            ht = ht * (1 - remise);
            console.log(`[facturation-pdf] ✅ Remise pourcentage (décimal) appliquée: ${remise * 100}%, HT après remise: ${ht}`);
          } else if (remise > 1) {
            // Remise en pourcentage (> 1 signifie déjà en %)
            ht = ht * (1 - remise / 100);
            console.log(`[facturation-pdf] ✅ Remise pourcentage (valeur) appliquée: ${remise}%, HT après remise: ${ht}`);
          }

          // S'assurer que HT ne devient pas négatif
          if (ht < 0) {
            console.warn(`[facturation-pdf] ⚠️ HT négatif détecté (${ht}), correction à 0`);
            ht = 0;
          }

          // Calculer le montant de la réduction
          const totalAvantRemise = qte * pu;
          const montantReduction = totalAvantRemise - ht;

          // Calculer la TVA à partir du HT après remise
          const tva = ht * (parseFloat(line.taux_tva) || 0);
          const ttc = ht + tva;

          totalHT += ht;
          totalReduction += montantReduction;
          totalTVA += tva;
          totalTTC += ttc;

          // Déterminer l'affichage de la remise - PRIORITÉ à remise_montant
          // Note: Ne pas afficher le symbole "DH" - seulement afficher "%" pour les pourcentages
          let remiseValueText = '0,00';
          let remiseSymbol = '';

          if (remiseMontant > 0) {
            // Priorité à la remise en montant - pas de symbole DH
            remiseValueText = remiseMontant.toFixed(2).replace('.', ',');
            remiseSymbol = ''; // Pas de symbole pour les montants
            console.log(`[facturation-pdf] Affichage remise: ${remiseValueText} (montant, pas de symbole)`);
          } else if (remise > 0 && remise <= 1) {
            // Remise en pourcentage décimal
            remiseValueText = (remise * 100).toFixed(2).replace('.', ',');
            remiseSymbol = '%';
            console.log(`[facturation-pdf] Affichage remise: ${remiseValueText} ${remiseSymbol}`);
          } else if (remise > 1) {
            // Remise en pourcentage (valeur)
            remiseValueText = remise.toFixed(2).replace('.', ',');
            remiseSymbol = '%';
            console.log(`[facturation-pdf] Affichage remise: ${remiseValueText} ${remiseSymbol}`);
          }

          const designationHtml = designation || '';
          const designationPlain = designationHtml
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

          // === VÉRIFICATION DE SAUT DE PAGE AVANT RENDU ===
          const currentY = isNaN(y) || y < 0 ? 0 : y;
          const estimatedNextY = currentY + rowHeight;
          const pageLimit = 700; // Limite avant d'ajouter une nouvelle page

          if (estimatedNextY > pageLimit && !isNaN(estimatedNextY)) {
            // Dessiner le pied de page sur la page courante
            drawPageFooter();
            // Ajouter une nouvelle page
            doc.addPage();
            // Redessiner l'en-tête du document
            y = drawDocumentHeader(false);
            // Redessiner l'en-tête du tableau
            y = drawTableHeader(y);
          }

          // === RENDU DE LA LIGNE ===
          const validY = isNaN(y) || y < 0 ? 0 : y;
          const centerY = validY + (rowHeight / 2) - 3;

          // Rectangle de la ligne - COMME LIVRAISON
          doc.roundedRect(tableStartX, validY, tableWidth, rowHeight, tableBorderRadius).stroke('#000');

          // Lignes verticales de séparation des colonnes - COMME LIVRAISON
          doc.moveTo(90, validY).lineTo(90, validY + rowHeight).stroke('#000'); // Après Réf (40 + 50)
          doc.moveTo(370, validY).lineTo(370, validY + rowHeight).stroke('#000'); // Après Désignation (90 + 280)
          doc.moveTo(415, validY).lineTo(415, validY + rowHeight).stroke('#000'); // Après Qté (370 + 45)
          doc.moveTo(460, validY).lineTo(460, validY + rowHeight).stroke('#000'); // Après P.U. (415 + 45)
          doc.moveTo(500, validY).lineTo(500, validY + rowHeight).stroke('#000'); // Après R. (460 + 35)

          // Contenu de la ligne
          doc.font('Helvetica').fontSize(9).fillColor('#000');

          // Réf (centré)
          doc.text(ref, colRefX, centerY, { width: colRefWidth, align: 'center' });

          // Désignation (gauche avec padding)
          renderInlineHtml(doc, line.article_nom || line.article || line.designation || '', colDesignationX + colDesignationPadding, validY + colDesignationPadding, effectiveDesignationWidth, rowHeight - colDesignationPadding * 2);

          // Qté (centré)
          doc.text(qte.toFixed(2).replace('.', ','), colQteX, centerY, { width: colQteWidth, align: 'center' });

          // P.U. (centré)
          doc.text(pu.toFixed(2).replace('.', ','), colPUX, centerY, { width: colPUWidth, align: 'center' });

          // Remise (centré)
          const remiseText = remiseValueText + (remiseSymbol === '%' ? '%' : '');
          doc.text(remiseText, colRX, centerY, { width: colRWidth, align: 'center' });

          // HT (centré)
          doc.text(ht.toFixed(2).replace('.', ','), colHTX, centerY, { width: colHTWidth, align: 'center' });

          // Mettre à jour y
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
        const totalsStartX = 305; // Ajusté pour 4 colonnes
        const totalsStartY = y;
        const totalsWidth = 255; // Largeur pour 4 colonnes
        const totalsHeight = 45;
        const totalsRadius = 5;
        const totalsColWidth = totalsWidth / 4; // 4 colonnes

        // Rectangle principal avec bordures arrondies
        doc.roundedRect(totalsStartX, totalsStartY, totalsWidth, totalsHeight, totalsRadius).stroke('#000');

        // Ligne horizontale au milieu
        doc.moveTo(totalsStartX, totalsStartY + totalsHeight / 2).lineTo(totalsStartX + totalsWidth, totalsStartY + totalsHeight / 2).stroke('#000');

        // Lignes verticales pour séparer les 4 colonnes
        doc.moveTo(totalsStartX + totalsColWidth, totalsStartY).lineTo(totalsStartX + totalsColWidth, totalsStartY + totalsHeight).stroke('#000');
        doc.moveTo(totalsStartX + totalsColWidth * 2, totalsStartY).lineTo(totalsStartX + totalsColWidth * 2, totalsStartY + totalsHeight).stroke('#000');
        doc.moveTo(totalsStartX + totalsColWidth * 3, totalsStartY).lineTo(totalsStartX + totalsColWidth * 3, totalsStartY + totalsHeight).stroke('#000');

        // En-têtes des colonnes
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
        doc.text('Total HT', totalsStartX, totalsStartY + 8, { width: totalsColWidth, align: 'center' });
        doc.text('Réduction', totalsStartX + totalsColWidth, totalsStartY + 8, { width: totalsColWidth, align: 'center' });
        doc.text('Total TVA', totalsStartX + totalsColWidth * 2, totalsStartY + 8, { width: totalsColWidth, align: 'center' });
        doc.text('Total TTC', totalsStartX + totalsColWidth * 3, totalsStartY + 8, { width: totalsColWidth, align: 'center' });

        // Valeurs des colonnes
        doc.font('Helvetica').fontSize(9).fillColor('#000');
        doc.text(totalHT.toFixed(2).replace('.', ','), totalsStartX, totalsStartY + totalsHeight / 2 + 6, { width: totalsColWidth, align: 'center' });
        doc.text(totalReduction.toFixed(2).replace('.', ','), totalsStartX + totalsColWidth, totalsStartY + totalsHeight / 2 + 6, { width: totalsColWidth, align: 'center' });
        doc.text(totalTVA.toFixed(2).replace('.', ','), totalsStartX + totalsColWidth * 2, totalsStartY + totalsHeight / 2 + 6, { width: totalsColWidth, align: 'center' });
        doc.text(totalTTC.toFixed(2).replace('.', ','), totalsStartX + totalsColWidth * 3, totalsStartY + totalsHeight / 2 + 6, { width: totalsColWidth, align: 'center' });

        y += totalsHeight + 20;

        // === ARRÊTÉ ===
        const totalTTCWords = convertAmountToWordsFR(totalTTC);

        // Style élégant pour la phrase d'arrêté
        y += 5; // Espacement avant la phrase

        // Phrase principale en italique avec une taille légèrement plus grande
        doc.font('Helvetica-Oblique').fontSize(12).fillColor('#2c3e50');
        const phraseText = 'Arrêté la présente facture à la somme de :';
        doc.text(phraseText, 50, y, { continued: true });

        // Montant en lettres en gras, taille plus grande et couleur plus foncée
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000');
        doc.text(' ' + totalTTCWords, { continued: false });

        // IMPORTANT: utiliser la position réelle après rendu (gère automatiquement les retours à la ligne)
        y = doc.y + 10;

        // Mention sur PDF facture si exonération valide
        if (isClientExonerated) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
          doc.text('TVA non applicable – Client exonéré conformément à la lettre d\'exonération en vigueur', 50, y, {
            width: 500,
            align: 'center'
          });
          y = doc.y + 10;
        }

        // === PIED DE PAGE - Dessiner sur la dernière page ===
        drawPageFooter();

        // Cachet optionnel en bas du PDF (bas-droit)
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

        // Fin du document
        doc.end();

      } catch (error) {
        console.error('[genererPDF] ❌ Erreur lors de la génération du PDF:', error);
        reject(error);
      }
    });
  }

  /**
   * Génère un PDF professionnel pour une FACTURE CONTRAT
   * Basé sur le modèle standard mais avec les champs supplémentaires : Période, Contrat n°, Conditions de paiement
   * @param {Array} factureData - Tableau de lignes de facture depuis v_facture_contrat
   * @param {Object} options - Options de génération (documentSociete, withStamp, etc.)
   * @returns {Promise<string>} - Chemin du fichier PDF généré
   */
  async genererPDFContrat(factureData, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('[genererPDFContrat] 📊 Données facture contrat reçues:', {
          isArray: Array.isArray(factureData),
          length: Array.isArray(factureData) ? factureData.length : 0,
          type: typeof factureData,
          firstElement: Array.isArray(factureData) && factureData.length > 0 ? factureData[0] : null
        });

        if (!Array.isArray(factureData) || factureData.length === 0) {
          console.error('[genererPDFContrat] ❌ Aucune donnée de facture disponible');
          reject(new Error('Aucune donnée de facture disponible pour la génération PDF.'));
          return;
        }

        // === EXONÉRATION TVA ===
        let isClientExonerated = false;
        const part_id = factureData?.[0]?.part_id;
        if (part_id) {
          try {
            const sequelizeConn = options.sequelize || require('../config/database');
            const exonerationModel = require('../models/base/partenaire-exoneration.model');
            const exonerations = await exonerationModel.getAllExonerationsByPartId(part_id, sequelizeConn);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const validExoneration = (Array.isArray(exonerations) ? exonerations : []).find((exon) => {
              if (!exon?.date_debut || !exon?.date_fin) return false;
              const dateDebut = new Date(exon.date_debut);
              dateDebut.setHours(0, 0, 0, 0);
              const dateFin = new Date(exon.date_fin);
              dateFin.setHours(0, 0, 0, 0);
              return today >= dateDebut && today <= dateFin;
            });

            isClientExonerated = !!validExoneration;
          } catch (e) {
            console.warn('[FacturationPdfService] ⚠️ Erreur vérification exonération TVA:', e?.message || e);
            isClientExonerated = false;
          }
        }

        // Créer le dossier factures s'il n'existe pas
        const facturesDir = path.join(__dirname, '..', 'public', 'factures');
        if (!fs.existsSync(facturesDir)) {
          fs.mkdirSync(facturesDir, { recursive: true });
        }
        const firstLine = factureData[0];
        //const fileName = `facture-contrat-${Date.now()}.pdf`;
        // Récupérer le nom du client et le nettoyer pour le nom de fichier
        const clientName = (firstLine.client || 'client').trim();
        const factureNum = (firstLine.numero || 'numero');
        // Nettoyer le nom pour qu'il soit valide comme nom de fichier (remplacer espaces et caractères spéciaux)
        const cleanClientName = clientName.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
        const fileName = `facture_${factureNum}_${cleanClientName}.pdf`;
        const pdfPath = path.join(facturesDir, fileName);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const writeStream = fs.createWriteStream(pdfPath);

        writeStream.on('finish', () => {
          resolve(pdfPath);
        });
        writeStream.on('error', (err) => {
          console.error('❌ Erreur écriture PDF facture contrat :', err);
          reject(err);
        });

        doc.pipe(writeStream);

        // === CONSTANTES POUR LA PAGINATION ===
        const tableBorderRadius = 5;
        const articlesTableHeaderHeight = 30; // Augmenté pour facture contrat (plus d'espace vertical)
        //const firstLine = factureData[0];

        // === FONCTION: Dessiner l'en-tête du document ===
        const drawDocumentHeader = (isFirstPage = false) => {
          // Logo
          if (options.documentSociete && options.documentSociete.logo) {
            try {
              const logoBuffer = Buffer.from(options.documentSociete.logo, 'base64');
              doc.image(logoBuffer, 50, 20, { width: 100 });
            } catch (error) {
              const logoPath = path.join(__dirname, '..', 'public', 'Cactus.png');
              if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, { width: 100 });
            }
          } else {
            const logoPath = path.join(__dirname, '..', 'public', 'Cactus.png');
            if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, { width: 100 });
          }

          // En-tête entreprise
          if (options.documentSociete && options.documentSociete.entete) {
            const enteteText = htmlToPlainText(options.documentSociete.entete);
            const enteteLines = enteteText.split('\n');
            let yPos = 30;
            enteteLines.forEach(line => {
              if (line.trim()) {
                doc.fontSize(10).font('Helvetica-Bold').fillColor('#95D5B2').text(line.trim(), 160, yPos);
                yPos += 12;
              }
            });
          } else {
            doc.fontSize(11).fillColor('#bccbaa').font('Helvetica-Bold').text('CACTUS INFORMATIQUE', 160, 30);
            doc.font('Helvetica').fontSize(10).fillColor('#000')
              .text('LOTISSEMENT HLIWA RUE 8 N°69', 160, 45)
              .text('AIN SEBAA 20250 CASABLANCA', 160, 58)
              .text('TEL : 05 22 34 35 45', 160, 71)
              .text('FAX : 05 22 67 38 09', 160, 84)
          }

          // Ligne de séparation
          doc.rect(40, 100, 520, 1).fill('#000');

          // Titre du document
          doc.fontSize(20).font('Helvetica-Bold').fillColor('#000').text('FACTURE', 50, 150);
          
       
          // Bloc client
          const clientTop = 140;
          const clientBoxWidth = 265;
          const clientBoxHeight = 75; // Augmenté pour accommoder ICE
          const clientBoxX = 300;

          doc.roundedRect(clientBoxX, clientTop, clientBoxWidth, clientBoxHeight, tableBorderRadius).stroke('#000');
          doc.fontSize(10).font('Helvetica').fillColor('#000');
          doc.text(`Client : ${firstLine.client || firstLine.nom_client || ''}`, clientBoxX + 10, clientTop + 10);
          doc.text(`Adresse : ${firstLine.adresse || ''}`, clientBoxX + 10, clientTop + 28);
          doc.text(`${firstLine.ville || ''}`, clientBoxX + 10, clientTop + 46);
          doc.text(`ICE : ${firstLine.ice || ''}`, clientBoxX + 10, clientTop + 64);

          // Tableau d'info (Facture N°, Date, Période divisée en deux colonnes, Contrat N°, Condition de Paiement) - uniquement sur la première page
          if (isFirstPage) {
            const infoTableY = 240; // Ajusté pour accommoder ICE
            const infoTableHeaderHeight = 25;
            const infoTableRowHeight = 25;
            const infoTableTotalHeight = infoTableHeaderHeight + infoTableRowHeight;

            // Tableau avec 6 colonnes : Facture N°, Date, Période (divisée en 2), Contrat N°, Condition de Paiement
            // Largeurs optimisées : Facture N° (90), Date (90), Période Du (80), Période Au (80), Contrat N° (70), Condition (100)
            doc.roundedRect(40, infoTableY, 525, infoTableTotalHeight, tableBorderRadius).stroke('#000');
            doc.moveTo(40, infoTableY + infoTableHeaderHeight).lineTo(560, infoTableY + infoTableHeaderHeight).stroke('#000');
            doc.moveTo(140, infoTableY).lineTo(140, infoTableY + infoTableTotalHeight).stroke('#000'); // Après Facture N°
            doc.moveTo(230, infoTableY).lineTo(230, infoTableY + infoTableTotalHeight).stroke('#000'); // Après Date
            doc.moveTo(250, infoTableY).lineTo(250, infoTableY).stroke('#000'); // Après Date
            doc.moveTo(390, infoTableY).lineTo(390, infoTableY + infoTableTotalHeight).stroke('#000'); // Après Date
            
            // Séparation dans la colonne Période supprimée
            doc.moveTo(460, infoTableY).lineTo(460, infoTableY + infoTableTotalHeight).stroke('#000'); // Après Contrat N°

            doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
            doc.text('Facture N°', 50, infoTableY + 8, { width: 85, align: 'center' });
            doc.text('Date', 145, infoTableY + 8, { width: 85, align: 'center' });
            doc.text('Période', 235, infoTableY + 8, { width: 160, align: 'center' });
            doc.text('Contrat N°', 395, infoTableY + 8, { width: 65, align: 'center' });
            doc.text('Condition', 465, infoTableY + 8, { width: 95, align: 'center' });

            // Sous-titres pour Période (date_planif et date_expire)
            //doc.font('Helvetica-Bold').fontSize(8).fillColor('#000');
            //doc.text('Du', 235, infoTableY + 18, { width: 80, align: 'center' });
            //doc.text('Au', 315, infoTableY + 18, { width: 80, align: 'center' });

            doc.font('Helvetica').fontSize(9);
            // Facture N°
            const factureNumTable = firstLine.numero || firstLine.facture_num || '';
            doc.text(factureNumTable, 55, infoTableY + infoTableHeaderHeight + 6, { width: 85, align: 'center' });
            
            // Date
            const formattedDate = firstLine.date ? new Date(firstLine.date).toLocaleDateString('fr-FR') : '';
            doc.text(formattedDate, 145, infoTableY + infoTableHeaderHeight + 6, { width: 85, align: 'center' });
            
            // Période divisée : date_planif à gauche, date_expire à droite
            const datePlanif = firstLine.date_planif ? new Date(firstLine.date_planif).toLocaleDateString('fr-FR') : '';
            const dateExpire = firstLine.date_expire ? new Date(firstLine.date_expire).toLocaleDateString('fr-FR') : '';
            // Séparation verticale entre les deux dates (uniquement dans la ligne de données, pas dans l'en-tête)
            doc.moveTo(315, infoTableY + infoTableHeaderHeight).lineTo(315, infoTableY + infoTableTotalHeight).stroke('#000');
            doc.text(datePlanif || '', 235, infoTableY + infoTableHeaderHeight + 6, { width: 80, align: 'center' });
            doc.text(dateExpire || '', 315, infoTableY + infoTableHeaderHeight + 6, { width: 80, align: 'center' });
            
            // Contrat N°
            const contratNum = firstLine.contrat || '';
            doc.text(contratNum, 395, infoTableY + infoTableHeaderHeight + 6, { width: 65, align: 'center' });
            
            // Condition de paiement
            const conditionPaiement = firstLine.condition || '';
            doc.text(conditionPaiement, 465, infoTableY + infoTableHeaderHeight + 4, { width: 95, align: 'center' });

            return infoTableY + infoTableTotalHeight + 10;
          } else {
            return 180;
          }
        };

        // === FONCTION: Dessiner l'en-tête du tableau des articles ===
        const drawTableHeader = (y) => {
          const lightGrayColor = '#E0E0E0';
          const tableStartX = 40; // Tableau commence à X=40 (marge gauche)
          const tableWidth = 525; // Largeur totale du tableau (595 - 40 marge gauche)
          doc.roundedRect(tableStartX, y, tableWidth, articlesTableHeaderHeight, tableBorderRadius).fill(lightGrayColor).stroke('#000');
          doc.lineWidth(1).roundedRect(tableStartX, y, tableWidth, articlesTableHeaderHeight, tableBorderRadius).stroke('#000');
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');

          // Colonnes redimensionnées pour mieux utiliser l'espace disponible - Désignation élargie
          // Total largeur: 50 + 350 + 45 + 45 + 35 + 30 = 555px (se termine à 595 avec marge droite de 0)
          const colRefX = 40;
          const colRefWidth = 50; // Réduit pour donner plus d'espace à la Désignation
          const colDesignationX = 90; // 40 + 50
          const colDesignationWidth = 280; // Colonne Désignation considérablement élargie pour le détail (280 -> 350)
          const colQteX = 370; // 90 + 350
          const colQteWidth = 45; // Légèrement réduit
          const colPUX = 415; // 440 + 45
          const colPUWidth = 45; // Légèrement réduit
          const colRX = 460; // 485 + 45
          const colRWidth = 35; // Réduit
          const colHTX = 505; // 530 + 35
          const colHTWidth = 40; // Réduit pour tenir dans la page

          doc.text('Réf', colRefX, y + 10, { width: colRefWidth, align: 'center' });
          doc.text('Désignation', colDesignationX, y + 10, { width: colDesignationWidth, align: 'center' });
          doc.text('Qté', colQteX, y + 10, { width: colQteWidth, align: 'center' });
          doc.text('P.U.', colPUX, y + 10, { width: colPUWidth, align: 'center' });
          doc.text('R.', colRX, y + 10, { width: colRWidth, align: 'center' });
          doc.text('H.T.', colHTX, y + 10, { width: colHTWidth, align: 'center' });

          return y + articlesTableHeaderHeight;
        };

        // === FONCTION: Dessiner le pied de page ===
        const drawPageFooter = () => {
          const footerBgColor = '#f3f5ef';
          const footerPageHeight = 842;
          const bottomMargin = 40;
          const footerHeight = 32;
          const footerY = footerPageHeight - bottomMargin - footerHeight;
          const footerLineSpacing = 5;
          const footerStartY = footerY + 2;
          doc.rect(40, footerY, 515, 1).fill('#000');
          doc.save();
          doc.rect(0, footerY, 595, footerHeight).fill(footerBgColor);
          doc.restore();

          if (options.documentSociete && options.documentSociete.pied_page) {
            const piedPageText = htmlToPlainText(options.documentSociete.pied_page);
        
            doc.font('Helvetica').fontSize(9).fillColor('#000');
            doc.text(piedPageText, 50, footerStartY, { width: 495, align: 'center', lineBreak: false });
          } else {
            doc.font('Helvetica').fontSize(9).fillColor('#000');
            doc.text(
              'RC Casablanca 147263 - Identifiant Fiscal : 1680876 - Patente : 37964603 - CNSS : 7155915 - ICE : 000210663000082',
              50, footerStartY, { width: 495, align: 'center', lineBreak: false }
            );
            doc.text(
              'R.I.B : 007 780 0000793000000882 48 Attijariwafa bank Agence Casa Ain Sebaâ',
              50, footerStartY + footerLineSpacing * 3, { width: 495, align: 'center', lineBreak: false }
            );
          }
        };

        // === DESSINER L'EN-TÊTE DE LA PREMIÈRE PAGE ===
        let y = drawDocumentHeader(true);
        y = drawTableHeader(y);

        // Positions des colonnes (tableau occupe toute la largeur disponible - commence à X=40, largeur totale 555px)
        const colRefX = 40;
        const colRefWidth = 50; // Réduit pour donner plus d'espace à la Désignation
        const colDesignationX = 90; // 40 + 50
        const colDesignationWidth = 280; // Colonne Désignation considérablement élargie pour le détail (280 -> 350)
        const colDesignationPadding = 30; // Augmenté pour plus d'espace vertical dans les cellules
        const colQteX = 370; // 90 + 350
        const colQteWidth = 45; // Légèrement réduit
        const colPUX = 415; // 440 + 45
        const colPUWidth = 45; // Légèrement réduit
        const colRX = 460; // 485 + 45
        const colRWidth = 35; // Réduit
        const colHTX = 500; // 530 + 35
        const colHTWidth = 50; // Réduit pour tenir dans la page

        doc.font('Helvetica').fillColor('#000').stroke('#000');
        let totalHT = 0, totalTVA = 0, totalTTC = 0, totalReduction = 0;

        // === RENDU DES LIGNES DU TABLEAU AVEC PAGINATION ===
        if (factureData && factureData.length > 0) {
          factureData.forEach((line, index) => {
            const ref = line.article_cod || '';
            // Essayer plusieurs champs pour la désignation
            const designation = line.designation || '';
            const qte = parseFloat(line.quantite) || 0;
            const pu = parseFloat(line.prix) || 0;
            const remise = parseFloat(line.remise) || 0;
            const remiseMontant = parseFloat(line.remise_montant) || 0;
            const tauxTVA = isClientExonerated ? 0 : (parseFloat(line.taux_tva) || 0.2);

            let reduction = 0;
            let remiseValueText = '0';
            let remiseSymbol = '';

            if (remiseMontant > 0) {
              reduction = remiseMontant;
              remiseValueText = reduction.toFixed(2).replace('.', ',');
              remiseSymbol = '';
            } else if (remise > 0) {
              reduction = (remise * pu * qte);
              remiseValueText = (remise * 100).toFixed(2).replace('.', ',');
              remiseSymbol = '%';
            }

            const baseHT = pu * qte;
            const ht = baseHT - reduction;
            const tva = ht * tauxTVA;
            const ttc = ht + tva;

            totalHT += ht;
            totalTVA += tva;
            totalTTC += ttc;
            totalReduction += reduction;

            // Pour facture contrat : hauteur minimale beaucoup plus grande pour remplir la page
            // Calculer la hauteur minimale pour une seule ligne qui occupe bien l'espace vertical
            const minRowHeight = 220; // Hauteur minimale augmentée pour facture contrat
            const calculatedHeight = Math.ceil(designation.length / 50) * 12 + 20;
            const rowHeight = Math.max(minRowHeight, calculatedHeight);
            const pageLimit = 750;
            const estimatedNextY = y + rowHeight;

            if (estimatedNextY > pageLimit && !isNaN(estimatedNextY)) {
              drawPageFooter();
              doc.addPage();
              y = drawDocumentHeader(false);
              y = drawTableHeader(y);
            }

            const validY = isNaN(y) || y < 0 ? 0 : y;
            const topY = validY + 5; // Position en haut de la cellule
            const tableStartX = 40; // Tableau commence à X=40 (marge gauche)
            const tableWidth = 525; // Largeur totale du tableau (595 - 40 marge gauche)

            doc.roundedRect(tableStartX, validY, tableWidth, rowHeight, tableBorderRadius).stroke('#000');
            doc.moveTo(90, validY).lineTo(90, validY + rowHeight).stroke('#000'); // Séparation Réf / Désignation (40 + 50)
            doc.moveTo(370, validY).lineTo(370, validY + rowHeight).stroke('#000'); // Après Désignation (90 + 280)
            doc.moveTo(415, validY).lineTo(415, validY + rowHeight).stroke('#000'); // Après Qté (370 + 45)
            doc.moveTo(460, validY).lineTo(460, validY + rowHeight).stroke('#000'); // Après P.U. (415 + 45)
            doc.moveTo(495, validY).lineTo(495, validY + rowHeight).stroke('#000'); // Après R. (460 + 35)

            doc.font('Helvetica').fontSize(10).fillColor('#000'); // Taille de police augmentée pour mieux remplir
            // Afficher la référence dans la colonne Réf (aligné en haut)
            doc.text(ref, colRefX, topY, { width: colRefWidth, align: 'center' });
            // Afficher la désignation dans la colonne Désignation (aligné en haut)
            // Utiliser renderInlineHtml si la désignation contient du HTML, sinon utiliser doc.text
            if (designation && designation.trim()) {
              if (designation.includes('<') || designation.includes('&')) {
                // Contient du HTML, utiliser renderInlineHtml
                renderInlineHtml(doc, designation, colDesignationX + colDesignationPadding, validY + colDesignationPadding, colDesignationWidth - colDesignationPadding * 2, rowHeight - colDesignationPadding * 2);
              } else {
                // Texte simple, utiliser doc.text directement avec alignement vertical en haut
                doc.text(designation, colDesignationX + colDesignationPadding, topY, { 
                  width: colDesignationWidth - colDesignationPadding * 2, 
                  align: 'left',
                  ellipsis: true
                });
              }
            } else {
              // Désignation vide, afficher un tiret
              doc.text('-', colDesignationX + colDesignationPadding, topY, { width: colDesignationWidth - colDesignationPadding * 2, align: 'left' });
            }
            doc.text(qte.toFixed(2).replace('.', ','), colQteX, topY, { width: colQteWidth, align: 'center' });
            doc.text(pu.toFixed(2).replace('.', ','), colPUX, topY, { width: colPUWidth, align: 'center' });
            const remiseText = remiseValueText + (remiseSymbol === '%' ? '%' : '');
            doc.text(remiseText, colRX, topY, { width: colRWidth, align: 'center' });
            doc.text(ht.toFixed(2).replace('.', ','), colHTX, topY, { width: colHTWidth, align: 'center' });

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

        // === TOTAUX ===
        y += 10;
        const totalsStartX = 310;
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

        if (isClientExonerated) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
          doc.text('TVA non applicable – Client exonéré conformément à la lettre d\'exonération en vigueur', 50, y, {
            width: 500,
            align: 'center'
          });
          y = doc.y + 10;
        }

        // === PIED DE PAGE ===
        drawPageFooter();

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
        console.error('[genererPDFContrat] ❌ Erreur lors de la génération du PDF:', error);
        reject(error);
      }
    });
  }
}

module.exports = new FacturationPdfService();
