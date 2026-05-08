const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { renderFormattedText } = require('./pdf-format-helper');
const pdfConfigService = require('./pdf-config.service');

/**
 * Service dédié à la génération de PDF pour les BONS DE COMMANDE
 * Ce service est séparé du service de génération de devis pour éviter toute confusion
 */

function stripHtmlTags(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function formatPdfNumber(value, digits = 2) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(digits).replace('.', ',');
}

function buildNomenclatureInlineHtml(nodes, depth = 0) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  if (safeNodes.length === 0) return '';

  const items = safeNodes.map((node) => {
    const label = [
      node?.code || '',
      node?.designation || 'Composant'
    ].filter(Boolean).join(' - ');
    const quantity = node?.quantiteTotale ?? node?.quantite ?? 0;
    const line = `${label} | Qté ${formatPdfNumber(quantity)}`;
    const children = buildNomenclatureInlineHtml(node?.children, depth + 1);
    return `<li>${line}${children}</li>`;
  }).join('');

  return `<ul>${items}</ul>`;
}

function appendNomenclatureToDesignation(designationHtml, nodes) {
  const treeHtml = buildNomenclatureInlineHtml(nodes);
  if (!treeHtml) return designationHtml || '';
  return `${designationHtml || ''}<br><strong>Composition</strong>${treeHtml}`;
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

class CommandePdfService {
  /**
   * Génère un PDF professionnel pour un BON DE COMMANDE
   * @param {Array} commandeData - Données de la commande
   * @param {Object} options - Options de génération (documentSociete, withStamp, etc.)
   * @returns {Promise<string>} - Chemin du fichier PDF généré
   */
  async genererPDF(commandeData, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        // Sauvegarder dans src/public/commandes
        const commandeDir = path.join(__dirname, '..', 'public', 'commandes');
        if (!fs.existsSync(commandeDir)) {
          fs.mkdirSync(commandeDir, { recursive: true });
        }

        const firstLine = commandeData[0];

        const clientName = (firstLine.client || 'client').trim();
        const commandeNum = (firstLine.numero || 'numero');
        // Nettoyer le nom pour qu'il soit valide comme nom de fichier (remplacer espaces et caractères spéciaux)
        const cleanClientName = clientName.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
        const fileName = `commande_${commandeNum}_${cleanClientName}.pdf`;

        //const fileName = `commande-${Date.now()}.pdf`;
        const pdfPath = path.join(commandeDir, fileName);

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const writeStream = fs.createWriteStream(pdfPath);

        writeStream.on('finish', () => {
          resolve(pdfPath);
        });
        writeStream.on('error', (err) => {
          console.error('❌ Erreur écriture PDF commande :', err);
          reject(err);
        });

        doc.pipe(writeStream);

        // === ENTÊTE ENTREPRISE ===
        // Récupérer la taille du logo depuis la configuration
        const logoSize = options.documentSociete?.logoSize || { width: 100, height: null };
        const configuredLogoTop = Number(options.documentSociete?.logoTop);
        const logoTop = Number.isFinite(configuredLogoTop) ? configuredLogoTop : 14;
        const headerShift = Math.max(0, 14 - logoTop);
        const imageOptions = { width: logoSize.width };
        if (logoSize.height) {
          imageOptions.height = logoSize.height;
        }
        
        // Utiliser le logo personnalisé si disponible, sinon le logo par défaut
        let logoDrawn = false;
        if (options.documentSociete && options.documentSociete.logo) {
          try {
            const logoBuffer = Buffer.from(options.documentSociete.logo, 'base64');
            doc.image(logoBuffer, 50, logoTop, imageOptions);
            logoDrawn = true;
          } catch (error) {
            console.warn('[commande-pdf] Erreur affichage logo base64, tentative avec chemin:', error.message);
          }
        }
        
        // Si le logo n'a pas pu être chargé depuis base64, essayer depuis le chemin de configuration
        if (!logoDrawn) {
          try {
            const logoPath = options.documentSociete?.logoPath || pdfConfigService.getLogoPath();
            if (logoPath && fs.existsSync(logoPath)) {
              doc.image(logoPath, 50, logoTop, imageOptions);
              logoDrawn = true;
            }
          } catch (error) {
            console.warn('[commande-pdf] Erreur chargement logo depuis chemin:', error.message);
          }
        }
        
        // Fallback : logo par défaut
        if (!logoDrawn) {
          const defaultLogoPath = path.join(__dirname, '..', 'public', 'Cactus.png');
          if (fs.existsSync(defaultLogoPath)) {
            doc.image(defaultLogoPath, 50, logoTop, imageOptions);
          }
        }

        // Utiliser l'en-tête personnalisé si disponible - à côté du logo
        if (options.documentSociete && options.documentSociete.entete) {
          const entete = options.documentSociete.entete;
          // Vérifier si c'est un objet JSON ou du texte brut
          if (typeof entete === 'object' || (typeof entete === 'string' && entete.trim())) {
            renderFormattedText(doc, entete, {
              startX: 160,
              startY: Math.max(8, 20 - headerShift),
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
        const separatorY = Math.max(48, 100 - headerShift);
        doc.rect(40, separatorY, 520, 1).fill('#000');

        // === TITRE BON DE COMMANDE (en haut à gauche) ===
        const titleY = separatorY + 20;
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#000').text('BON DE COMMANDE', 50, titleY);

        // === BLOC CLIENT (en haut à droite avec bordure arrondie) ===
        const clientTop = Math.max(separatorY + 10, 110 - headerShift);
        const clientBoxWidth = 260;
        const clientBoxX = 300;
        const borderRadius = 5;
        const clientLabelX = clientBoxX + 10;
        const clientValueX = clientBoxX + 52;
        const clientTextWidth = clientBoxWidth - (clientValueX - clientBoxX) - 10;
        const clientDisplayName = String(commandeData[0].client || '');
        const clientAdresseDisplay = String(commandeData[0].adresse || '');
        const clientVilleDisplay = String(commandeData[0].ville || '');
        const clientIceDisplay = String(commandeData[0].ice || '');

        doc.fontSize(10).font('Helvetica');
        const clientNameHeight = Math.max(12, doc.heightOfString(clientDisplayName, { width: clientTextWidth, align: 'left' }));
        const addressHeight = Math.max(12, doc.heightOfString(clientAdresseDisplay, { width: clientTextWidth, align: 'left' }));
        const clientBoxHeight = Math.max(82, Math.min(96, 18 + clientNameHeight + 4 + addressHeight + 4 + 12 + (clientVilleDisplay ? 16 : 0)));

        // Dessiner un rectangle avec coins arrondis
        doc.roundedRect(clientBoxX, clientTop, clientBoxWidth, clientBoxHeight, borderRadius).stroke('#000');

        doc.fontSize(10).fillColor('#000');
        let clientInfoY = clientTop + 10;
        doc.font('Helvetica-Bold').text('Client :', clientLabelX, clientInfoY, { width: 40, align: 'left' });
        doc.font('Helvetica').text(clientDisplayName, clientValueX, clientInfoY, { width: clientTextWidth, align: 'left' });
        clientInfoY += clientNameHeight + 4;
        doc.font('Helvetica-Bold').text('Adresse :', clientLabelX, clientInfoY, { width: 40, align: 'left' });
        doc.font('Helvetica').text(clientAdresseDisplay, clientValueX, clientInfoY, { width: clientTextWidth, align: 'left' });
        clientInfoY += addressHeight + 4;
        doc.font('Helvetica-Bold').text('ICE :', clientLabelX, clientInfoY, { width: 40, align: 'left' });
        doc.font('Helvetica').text(clientIceDisplay, clientValueX, clientInfoY, { width: clientTextWidth, align: 'left' });
        if (clientVilleDisplay) {
          const cityY = Math.min(clientTop + clientBoxHeight - 14, clientInfoY + 14);
          if (cityY > clientInfoY + 8) {
            doc.font('Helvetica').text(clientVilleDisplay, clientLabelX, cityY, { width: clientBoxWidth - 20, align: 'left' });
          }
        }

        // === TABLEAU D'EN-TÊTE (Bon de Commande N° | Date | Vos Réf) avec bordures arrondies ===
        const infoTableY = Math.max(clientTop + clientBoxHeight + 12, titleY + 40);
        const infoTableHeaderHeight = 25;
        const infoTableRowHeight = 20;
        const infoTableTotalHeight = infoTableHeaderHeight + infoTableRowHeight;
        const tableBorderRadius = 5;

        // Tableau complet avec bordures arrondies (un seul rectangle)
        doc.roundedRect(50, infoTableY, 510, infoTableTotalHeight, tableBorderRadius).stroke('#000');

        // Ligne de séparation horizontale entre en-tête et données
        doc.moveTo(50, infoTableY + infoTableHeaderHeight).lineTo(560, infoTableY + infoTableHeaderHeight).stroke('#000');

        // Lignes de séparation verticales
        doc.moveTo(230, infoTableY).lineTo(230, infoTableY + infoTableTotalHeight).stroke('#000');
        doc.moveTo(410, infoTableY).lineTo(410, infoTableY + infoTableTotalHeight).stroke('#000');

        // En-tête (ligne 1)
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
        doc.text('Bon de Commande N°', 55, infoTableY + 8, { width: 180, align: 'center' });
        doc.text('Date', 235, infoTableY + 8, { width: 180, align: 'center' });
        doc.text('Vos Réf', 415, infoTableY + 8, { width: 145, align: 'center' });

        // Données (ligne 2)
        doc.font('Helvetica').fontSize(9);
        doc.text(`${commandeData[0].numero}`, 55, infoTableY + infoTableHeaderHeight + 6, { width: 180, align: 'center' });
        doc.text(`${new Date(commandeData[0].date).toLocaleDateString('fr-FR')}`, 235, infoTableY + infoTableHeaderHeight + 6, { width: 180, align: 'center' });
        doc.text(`${commandeData[0].client_ref || ''}`, 415, infoTableY + infoTableHeaderHeight + 6, { width: 145, align: 'center' });

        // === TABLEAU DES ARTICLES ===
        let y = infoTableY + infoTableTotalHeight + 10;
        const tableStartY = y;
        const articlesTableHeaderHeight = 20;
        const fixedDetailsTableHeight = 250; // Comme BL normal: reserve un espace visuel constant

        // En-tête du tableau avec fond gris ciel et bordures arrondies (avec bordure visible)
        const lightGrayColor = '#E0E0E0'; // Gris ciel
        const tableStartX = 40;
        const tableWidth = 525;
        doc.roundedRect(tableStartX, y, tableWidth, articlesTableHeaderHeight, tableBorderRadius).fill(lightGrayColor).stroke('#000');
        // Ajouter une bordure supplémentaire pour plus de visibilité
        doc.lineWidth(1).roundedRect(tableStartX, y, tableWidth, articlesTableHeaderHeight, tableBorderRadius).stroke('#000');
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000'); // Texte en noir sur fond gris

        // Positions des colonnes selon le devis - ajustées pour plus d'espace pour la désignation
        const colRefX = 40;
        const colDesignationX = 110;
        const colQteX = 370;
        const colPUX = 415;
        const colRX = 460;
        const colHTX = 500;

        const colRefWidth = 70;
        const colDesignationWidth = 260;
        const colDesignationPadding = 8;
        const colQteWidth = 45;
        const colPUWidth = 45;
        const colRWidth = 35;
        const colHTWidth = 50;

        // Centraliser les headers avec leurs colonnes
        doc.text('Réf', colRefX, y + 6, { width: colRefWidth, align: 'center' });
        doc.text('Désignation', colDesignationX, y + 6, { width: colDesignationWidth, align: 'center' });
        doc.text('Qté', colQteX, y + 6, { width: colQteWidth, align: 'center' });
        doc.text('P.U.', colPUX, y + 6, { width: colPUWidth, align: 'center' });
        doc.text('R.', colRX, y + 6, { width: colRWidth, align: 'center' });
        doc.text('H.T.', colHTX, y + 6, { width: colHTWidth, align: 'center' });

        y += articlesTableHeaderHeight;
        const detailsBodyY = y;
        doc.rect(tableStartX, detailsBodyY, tableWidth, fixedDetailsTableHeight).stroke('#000');
        [110, colQteX, colPUX, colRX, colHTX].forEach((x) => doc.moveTo(x, detailsBodyY).lineTo(x, detailsBodyY + fixedDetailsTableHeight).stroke('#000'));

        doc.font('Helvetica').fillColor('#000000').stroke('#000');

        if (commandeData && commandeData.length > 0) {
          commandeData.forEach(line => {
            const ref = line.article_cod || '';
            const designationHtml = options.showNomenclatureComponents
              ? appendNomenclatureToDesignation(line.article || '', line.nomenclatureComponents)
              : (line.article || '');
            const pu = isNaN(Number(line.prix)) ? 0 : Number(line.prix);
            const qte = isNaN(Number(line.quantite)) ? 0 : Number(line.quantite);
            // Dans le SQL, 'remise' contient déjà le HT après remise
            const htAfterRemise = isNaN(Number(line.remise)) ? 0 : Number(line.remise);
            const taux_tva = isNaN(Number(line.taux_tva)) ? 0 : Number(line.taux_tva);

            // Calculer le montant de la remise
            const totalAvantRemise = pu * qte;
            const montantRemise = isNaN(totalAvantRemise - htAfterRemise) ? 0 : (totalAvantRemise - htAfterRemise);
            const ht = htAfterRemise; // HT = montant après remise

            const colDesignationPadding = 8; // Marge interne
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

            const baseRowHeight = 20; // one line
            const maxRowHeight = 500; // Augmenté pour permettre l'affichage complet des descriptions longues

            // Calculer la hauteur du texte en utilisant une méthode plus robuste (comme le devis)
            let textHeight = baseRowHeight;

            if (effectiveDesignationWidth > 0 &&
              !isNaN(effectiveDesignationWidth) &&
              effectiveDesignationWidth < 10000 &&
              typeof designationPlain === 'string' &&
              designationPlain.length > 0) {
              try {
                const safeDesignationPlain = designationPlain.toString().substring(0, 10000);
                const safeWidth = Math.max(1, Math.min(Math.floor(effectiveDesignationWidth), 10000));

                if (!isNaN(safeWidth) && safeWidth > 0 && safeWidth < 10000) {
                  const fontSize = 9;
                  const lineHeight = fontSize * 1.2;
                  const charsPerLine = Math.floor(safeWidth / (fontSize * 0.6));
                  const estimatedLines = Math.ceil(safeDesignationPlain.length / Math.max(1, charsPerLine));
                  const estimatedHeight = estimatedLines * lineHeight;

                  let calculatedHeight;
                  try {
                    doc.fontSize(9).font('Helvetica');
                    calculatedHeight = doc.heightOfString(safeDesignationPlain, {
                      width: safeWidth,
                      align: 'left'
                    });
                  } catch (heightError) {
                    calculatedHeight = estimatedHeight;
                  }

                  if (typeof calculatedHeight === 'number' &&
                    !isNaN(calculatedHeight) &&
                    isFinite(calculatedHeight) &&
                    calculatedHeight > 0 &&
                    calculatedHeight < 10000) {
                    textHeight = calculatedHeight;
                  } else if (!isNaN(estimatedHeight) && estimatedHeight > 0) {
                    textHeight = estimatedHeight;
                  } else {
                    textHeight = baseRowHeight;
                  }
                } else {
                  textHeight = baseRowHeight;
                }
              } catch (error) {
                textHeight = baseRowHeight;
              }
            } else {
              textHeight = baseRowHeight;
            }

            const validTextHeight = isNaN(textHeight) || textHeight <= 0 ? baseRowHeight : textHeight;
            const naturalHeight = Math.max(baseRowHeight, Math.ceil(validTextHeight) + (colDesignationPadding * 2) + 10);
            const rowHeight = Math.min(maxRowHeight, naturalHeight);
            const validRowHeight = isNaN(rowHeight) || rowHeight <= 0 ? baseRowHeight : rowHeight;

            // Vérifier si la ligne va dépasser la limite AVANT de la rendre
            const currentY = isNaN(y) || y < 0 ? 0 : y;
            const estimatedNextY = currentY + validRowHeight;
            const maxYBeforeNewPage = 700; // Limite avant d'ajouter une nouvelle page (réduit pour laisser place aux signatures)

            if (estimatedNextY > maxYBeforeNewPage && !isNaN(estimatedNextY)) {
              doc.addPage();
              y = 50;
            }

            // Calculer la position Y CENTRÉE VERTICALEMENT pour toutes les colonnes numériques (affichage clair)
            const validY = isNaN(y) || y < 0 ? 0 : y;
            const centerY = validY + (validRowHeight / 2) - 3; // Centre vertical de la ligne

            // Draw row container avec bordures arrondies


            // Réf : colonne 55-100
            doc.font('Helvetica').fontSize(9).fillColor('#000000');
            doc.text(ref || '', colRefX, centerY, { width: colRefWidth, align: 'center' });

            // Qté : colonne 320-375 (centré verticalement - affichage clair)
            const qteText = `${Math.round(qte)}`;
            doc.font('Helvetica').fontSize(9).fillColor('#000000');
            doc.text(qteText, colQteX, centerY, { width: colQteWidth, align: 'center' });

            // P.U. : colonne 380-425 (centré verticalement - affichage clair)
            const puText = pu.toFixed(2).replace('.', ',');
            doc.font('Helvetica').fontSize(9).fillColor('#000000');
            doc.text(puText, colPUX, centerY, { width: colPUWidth, align: 'center' });

            // R. (Remise) : colonne 430-485 (centré verticalement - affichage clair)
            const remiseValue = (typeof montantRemise === 'number' && montantRemise !== null && montantRemise !== undefined)
              ? montantRemise.toFixed(2).replace('.', ',')
              : '0,00';
            doc.font('Helvetica').fontSize(9).fillColor('#000000');
            doc.text(remiseValue, colRX, centerY, { width: colRWidth, align: 'center' });

            // H.T. : colonne 490-540 (centré verticalement - affichage clair)
            const htValue = (typeof ht === 'number' && ht !== null && ht !== undefined)
              ? ht.toFixed(2).replace('.', ',')
              : '0,00';
            doc.font('Helvetica').fontSize(9).fillColor('#000000');
            doc.text(htValue, colHTX, centerY, { width: colHTWidth, align: 'center' });

            // Désignation : colonne 105-305 (avec couleurs HTML) - affichage clair amélioré
            renderInlineHtml(doc, designationHtml, colDesignationX, validY + 6, effectiveDesignationWidth, validRowHeight - 8);

            // Réinitialiser l'état après renderInlineHtml
            doc.font('Helvetica').fontSize(9).fillColor('#000000');

            // Vertical separators - ajustées pour les nouvelles positions


            y = validY + validRowHeight;
          });
        } else {
          doc.text('Aucune ligne disponible.', 60, y + 10);
          y += 30;
        }

        // Réserver un espace minimum pour le tableau de détails (rendu plus professionnel, comme BL)
        const minDetailsBottomY = tableStartY + articlesTableHeaderHeight + fixedDetailsTableHeight;
        if (y < minDetailsBottomY) {
          y = minDetailsBottomY;
        }

        // === PAS DE TOTAUX POUR LES COMMANDES ===
        // Les totaux HT, TVA et TTC ne sont pas affichés pour les commandes

        // === SIGNATURES avec bordures arrondies (comme le devis) ===
        y += 10; // Espace avant les signatures
        const signatureBoxHeight = 60;
        const signatureBoxWidth = 250;
        const signatureBoxY = y;
        const signatureBoxGap = 10; // Espace entre les deux boîtes
        const signatureBox1X = 50;
        const signatureBox2X = signatureBox1X + signatureBoxWidth + signatureBoxGap; // Position de la deuxième boîte avec espace

        // Deux boîtes séparées avec bordures arrondies
        doc.roundedRect(signatureBox1X, signatureBoxY, signatureBoxWidth, signatureBoxHeight, tableBorderRadius).stroke('#000');
        doc.roundedRect(signatureBox2X, signatureBoxY, signatureBoxWidth, signatureBoxHeight, tableBorderRadius).stroke('#000');

        // Headers dans les boîtes
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
        doc.text('Direction', signatureBox1X, signatureBoxY + 10, { width: signatureBoxWidth, align: 'center' });
        doc.text('Bon Pour Accord', signatureBox2X, signatureBoxY + 10, { width: signatureBoxWidth, align: 'center' });

        // Les zones de signature restent vides (comme sur le devis)
        y = signatureBoxY + signatureBoxHeight + 20;

        // === PIED DE PAGE PERSONNALISÉ (comme le devis avec fond coloré) ===
        // Couleur de background similaire au logo (couleur bleu/vert clair)
        const footerBgColor = '#f3f5ef'; // Couleur de fond claire similaire au logo

        // Calculer la position du pied de page pour qu'il reste sur la même page
        // Hauteur de page A4 = 842 points, marge bas = 40 points
        // Position maximale pour le pied de page = 842 - 40 - hauteur_footer
        const pageHeight = 842; // Hauteur A4 en points
        const bottomMargin = 40;
        const footerHeight = 55; // Hauteur augmentée pour 3 lignes avec espacement
        const footerY = pageHeight - bottomMargin - footerHeight; // Position calculée dynamiquement
        const footerLineSpacing = 8; // Espacement augmenté entre les lignes pour meilleure lisibilité
        const footerStartY = footerY + 5; // Position de départ

        // Fonction helper pour convertir HTML en texte
        const htmlToPlainText = (html) => {
          if (!html) return '';
          return html.replace(/<[^>]*>/g, '').replace(/[ \t]+/g, ' ').trim();
        };

        // Vérifier si on est sur une nouvelle page et ajuster si nécessaire
        if (y > footerY - 20) {
          // Si le contenu est trop proche du pied de page, créer une nouvelle page
          doc.addPage();
          y = 50; // Réinitialiser Y sur la nouvelle page
          const newFooterY = pageHeight - bottomMargin - footerHeight;
          // Rectangle de fond pour le pied de page sur la nouvelle page
          doc.rect(0, newFooterY, 595, footerHeight).fill(footerBgColor);

          if (options.documentSociete && options.documentSociete.pied_page) {
            const piedPage = options.documentSociete.pied_page;
            // Vérifier si c'est un objet JSON ou du texte brut
            if (typeof piedPage === 'object' || (typeof piedPage === 'string' && piedPage.trim())) {
              renderFormattedText(doc, piedPage, {
                startX: 50,
                startY: newFooterY + 5,
                defaultFontSize: 7,
                defaultColor: '#000000',
                defaultFont: 'Helvetica',
                defaultAlign: 'center',
                defaultLineSpacing: footerLineSpacing,
                width: 495
              });
            }
          }
        } else {
          // Rectangle de fond pour le pied de page
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
          } else {
            // Pied de page par défaut avec toutes les informations (3 lignes)
            doc.font('Helvetica').fontSize(7).fillColor('#000');

            // Ligne 1 : SARL au capital
            doc.text(
              'SARL au capital 500 000.00 DHS - allée des orangers Derb Najat Rue 4 N°67 RDC Ain Sebaa Casablanca',
              50, footerStartY, { width: 495, align: 'center' }
            );

            // Ligne 2 : Téléphone, Fax, RC, IF, Email (avec espacement)
            doc.text(
              'Tel : 0522672135 - Fax 0522672143 - RC120431TP37951465 IF : 1680027 Email : info@lesbasculesmondial.com',
              50, footerStartY + footerLineSpacing, { width: 495, align: 'center' }
            );

            // Ligne 3 : RIB, CNSS, ICE (avec espacement)
            doc.text(
              'RIB 007 780 000368400000157019 - CNSS : 6463814 ICE : 000079494000078',
              50, footerStartY + (footerLineSpacing * 2), { width: 495, align: 'center' }
            );
          }
        }

        // Cachet optionnel en bas du PDF
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

        // Fin du document
        doc.end();

      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = new CommandePdfService();
