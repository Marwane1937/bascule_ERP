const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Service dédié à la génération de PDF pour les rapports de CAISSE
 */

function htmlToPlainText(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function numberToWordsFR(n) {
  const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  const tens = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

  if (n === 0) return 'zéro';
  if (n < 17) return units[n];
  if (n < 20) return 'dix-' + units[n - 10];
  if (n < 100) {
    const ten = Math.floor(n / 10);
    const unit = n % 10;
    if (unit === 0) return tens[ten];
    if (ten === 7 || ten === 9) {
      return tens[ten] + '-' + (unit === 1 ? 'et-' : '') + units[unit + 10];
    }
    return tens[ten] + (unit === 1 ? '-et-' : '-') + units[unit];
  }
  if (n < 1000) {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let words = hundred === 1 ? 'cent' : units[hundred] + ' cent';
    if (hundred > 1 && rest === 0) words += 's';
    if (rest > 0) words += ' ' + numberToWordsFR(rest);
    return words;
  }
  if (n < 1000000) {
    const thousand = Math.floor(n / 1000);
    const rest = n % 1000;
    let words = thousand === 1 ? 'mille' : numberToWordsFR(thousand) + ' mille';
    if (rest > 0) words += ' ' + numberToWordsFR(rest);
    return words;
  }
  return n.toString();
}

function formatAmount(amount) {
  const parts = amount.toFixed(2).split('.');
  const integerPart = parseInt(parts[0]);
  const decimalPart = parts[1];
  return {
    integer: integerPart,
    decimal: decimalPart,
    words: numberToWordsFR(integerPart) + ' dirhams et ' + decimalPart + ' centimes'
  };
}

function drawRoundedRectOutline(doc, x, y, width, height, radius, options = {}) {
  const { fillColor = null, strokeColor = '#000', lineWidth = 1 } = options;
  doc.save();
  doc.lineWidth(lineWidth);
  doc.strokeColor(strokeColor);
  if (fillColor) {
    doc.fillColor(fillColor);
    doc.moveTo(x + radius, y)
      .lineTo(x + width - radius, y)
      .quadraticCurveTo(x + width, y, x + width, y + radius)
      .lineTo(x + width, y + height - radius)
      .quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
      .lineTo(x + radius, y + height)
      .quadraticCurveTo(x, y + height, x, y + height - radius)
      .lineTo(x, y + radius)
      .quadraticCurveTo(x, y, x + radius, y)
      .fillAndStroke(fillColor, strokeColor);
  } else {
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
  doc.restore();
}

async function genererCaissePDF(caisseData, options = {}) {
  return new Promise((resolve, reject) => {
    try {

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const fileName = `caisse_${caisseData.numero || caisseData.id}_${Date.now()}.pdf`;
      const folderPath = path.join(__dirname, '..', 'public', 'caisses');


      // Créer le dossier s'il n'existe pas
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      const filePath = path.join(folderPath, fileName);

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Suivre le numéro de page pour le footer
      let pageNumber = 1;

      // === EN-TÊTE ENTREPRISE (même format que facturation) ===
      // Utiliser le logo personnalisé si disponible, sinon le logo par défaut
      if (options.documentSociete && options.documentSociete.logo) {
        try {
          const logoBuffer = Buffer.from(options.documentSociete.logo, 'base64');
          doc.image(logoBuffer, 50, 20, { width: 100 });
        } catch (error) {
          console.warn('Erreur affichage logo personnalisé, utilisation du logo par défaut:', error);
          const logoPath = path.join(__dirname, '..', 'public', 'logo-bascule.jpg');
          if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, { width: 100 });
        }
      } else {
        const logoPath = path.join(__dirname, '..', 'public', 'logo-bascule.jpg');
        if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, { width: 100 });
      }

      // Utiliser l'en-tête personnalisé si disponible
      if (options.documentSociete && options.documentSociete.entete) {
        // Parser l'en-tête HTML et l'afficher
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
        // En-tête par défaut à droite du logo (ajusté pour logo de 100px)
        doc.fontSize(11).fillColor('#046ba7').font('Helvetica-Bold').text('Balances et Bascules Pont Bascule Electronique', 160, 30);
        doc.font('Helvetica').fontSize(10)
          .text('Mecanique - Vente et Reparation - Entretien', 160, 45)
          .text('Etalonnage Logiciels de Gestion', 160, 58);
      }

      // Ligne de séparation horizontale
      doc.rect(40, 100, 520, 1).fill('#000');

      // === TITRE ===
      const documentType = caisseData.sens === 1 ? 'RAPPORT CAISSE - RECETTE' : 'RAPPORT CAISSE - DÉPENSE';
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#000').text(documentType, 50, 120);

      // === INFORMATIONS DU DOCUMENT ===
      let yPos = 170;
      doc.fontSize(10).font('Helvetica');

      drawRoundedRectOutline(doc, 50, yPos, 495, 80, 8);
      doc.font('Helvetica-Bold').text('Numéro:', 60, yPos + 10);
      doc.font('Helvetica').text(caisseData.numero || 'N/A', 130, yPos + 10);

      doc.font('Helvetica-Bold').text('Date:', 60, yPos + 25);
      doc.font('Helvetica').text(caisseData.date ? new Date(caisseData.date).toLocaleDateString('fr-FR') : 'N/A', 130, yPos + 25);

      doc.font('Helvetica-Bold').text('Description:', 60, yPos + 40);
      doc.font('Helvetica').text(caisseData.description || '-', 130, yPos + 40, { width: 350 });

      doc.font('Helvetica-Bold').text('Affectation:', 60, yPos + 55);
      doc.font('Helvetica').text(caisseData.affectation || '-', 130, yPos + 55);

      doc.font('Helvetica-Bold').text('État:', 350, yPos + 10);
      const etat = caisseData.etat === 1 || caisseData.etat === '1' ? 'Clôturée' : 'Ouverte';
      doc.font('Helvetica').text(etat, 400, yPos + 10);

      // === DÉTAILS ===
      yPos = 270;
      doc.fontSize(12).font('Helvetica-Bold').text('Détails:', 50, yPos);
      yPos += 25;

      // Variables pour le footer
      const pageHeight = 842; // Hauteur A4
      const bottomMargin = 40;
      const footerHeight = 50; // Hauteur augmentée pour accommoder toutes les lignes du footer
      const footerY = pageHeight - bottomMargin - footerHeight;


      if (caisseData.details && caisseData.details.length > 0) {
        // En-tête du tableau - respecter les marges (50px de chaque côté)
        const tableTop = yPos;
        const tableWidth = 495; // Largeur totale: 595 (A4) - 50 (marge gauche) - 50 (marge droite)
        // Colonnes: Rubrique, Employé, Quantité, Montant, Total (sans Description)
        // Largeurs optimisées pour afficher clairement Rubrique et Employé (total = 495px)
        // Respecter les marges: 50px gauche + 495px tableau + 50px droite = 595px (A4)
        const colWidths = [210, 115, 50, 60, 60];
        const colHeaders = ['Rubrique', 'Employé', 'Quantité', 'Montant', 'Total'];
        const colX = [50, 260, 375, 425, 485];

        // Ligne d'en-tête - respecter la largeur exacte du tableau (495px)
        doc.rect(50, tableTop, tableWidth, 25).fill('#E0E0E0');
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
        colHeaders.forEach((header, i) => {
          // Aligner à droite pour Montant et Total, centré pour Quantité, à gauche pour Rubrique et Employé
          let align = 'left';
          let padding = 4;
          if (i === 2) {
            // Quantité : centré
            align = 'center';
            padding = 2;
          } else if (i >= 3) {
            // Montant et Total : alignés à droite
            align = 'right';
            padding = 2;
          }
          doc.text(header, colX[i] + padding, tableTop + 8, {
            align: align,
            width: colWidths[i] - (padding * 2)
          });
        });

        // Lignes de données
        let currentY = tableTop + 25;
        let totalGeneral = 0;

        caisseData.details.forEach((detail, index) => {
          const quantite = detail.quantite || 0;
          const montant = detail.montant || 0;
          const total = quantite * montant;
          totalGeneral += total;
          const employe = detail.employe_nom_complet || detail.employe || caisseData.affectation || '-';

          // Nettoyer les textes
          const rubriqueText = (detail.rubrique || '-').trim();
          const employeText = employe.trim();

          // Calculer la hauteur nécessaire pour cette ligne (pour les colonnes Rubrique et Employé qui peuvent avoir plusieurs lignes)
          doc.fontSize(9).font('Helvetica');
          const rubriqueHeight = doc.heightOfString(rubriqueText, { width: colWidths[0] - 8 });
          const employeHeight = doc.heightOfString(employeText, { width: colWidths[1] - 8 });
          const actualRowHeight = Math.max(20, Math.max(rubriqueHeight, employeHeight) + 8);

          // Dessiner le fond de la ligne avec la hauteur calculée - respecter exactement la largeur du tableau (495px)
          if (index % 2 === 0) {
            doc.rect(50, currentY, tableWidth, actualRowHeight).fill('#F5F5F5');
          }

          // Les bordures verticales entre les colonnes ne sont pas nécessaires selon la demande

          doc.fontSize(9).font('Helvetica').fillColor('#000');
          // Rubrique : avec largeur exacte pour afficher clairement (retour à la ligne automatique)
          doc.text(rubriqueText, colX[0] + 4, currentY + 6, {
            width: colWidths[0] - 8,
            align: 'left'
          });
          // Employé : avec largeur exacte pour afficher clairement (retour à la ligne si nécessaire)
          doc.text(employeText, colX[1] + 4, currentY + 6, {
            width: colWidths[1] - 8,
            align: 'left'
          });
          // Quantité : centré - centré verticalement si ligne multi-lignes
          // Montant et Total : aligné à droite - centré verticalement si ligne multi-lignes
          const numY = actualRowHeight > 20 ? currentY + (actualRowHeight / 2) - 4 : currentY + 6;
          doc.text(quantite.toString(), colX[2] + 2, numY, {
            align: 'center',
            width: colWidths[2] - 4
          });
          doc.text(montant.toFixed(2), colX[3] + 2, numY, {
            align: 'right',
            width: colWidths[3] - 4
          });
          doc.text(total.toFixed(2), colX[4] + 2, numY, {
            align: 'right',
            width: colWidths[4] - 4
          });

          currentY += actualRowHeight;

          // Nouvelle page si nécessaire - respecter l'espace pour le footer uniquement sur la première page
          // Le footer a besoin de footerHeight (50px) d'espace, donc on doit s'arrêter avant footerY
          if (pageNumber === 1 && currentY > footerY - footerHeight - 10) {
            doc.addPage();
            pageNumber++;
            currentY = 50;
          } else if (pageNumber > 1 && currentY > 750) {
            doc.addPage();
            pageNumber++;
            currentY = 50;
          }
        });

        // Ligne de total - respecter la largeur du tableau
        currentY += 5;
        // Vérifier si le total et le montant en lettres dépasse la zone du footer sur la première page
        // Le montant en lettres prend environ 35px, le total 25px, donc 60px au total
        if (pageNumber === 1 && currentY + 60 > footerY - footerHeight) {
          // Si oui, créer une nouvelle page pour le total et le montant en lettres
          doc.addPage();
          pageNumber++;
          currentY = 50;
        }
        doc.rect(50, currentY, tableWidth, 25).fill('#D0D0D0');
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000');
        doc.text('TOTAL GÉNÉRAL:', colX[0] + 3, currentY + 8);
        doc.text(totalGeneral.toFixed(2), colX[4], currentY + 8, { align: 'right', width: colWidths[4] - 3 });

        // Montant en lettres
        currentY += 35;
        const amountFormatted = formatAmount(totalGeneral);
        doc.fontSize(10).font('Helvetica').fillColor('#000');
        doc.text('Arrêté la présente caisse à la somme de:', 50, currentY);
        doc.font('Helvetica-Bold').text(amountFormatted.words, 50, currentY + 15);
      } else {
        doc.fontSize(10).font('Helvetica').fillColor('#666').text('Aucun détail disponible', 50, yPos);
      }

      // === PIED DE PAGE ===
      // Dessiner le footer UNIQUEMENT sur la première page (page 0)
      // Utiliser switchToPage pour retourner à la première page avant doc.end()
      const pageRange = doc.bufferedPageRange();
      if (pageRange && pageRange.count > 0) {
        // Retourner à la première page (index 0)
        doc.switchToPage(0);
      }

      const footerLineSpacing = 5;
      const separatorLineY = footerY + 2;
      const footerStartY = separatorLineY + 8;

      // Rectangle de fond pour le pied de page (fond blanc) - toute la hauteur du footer
      doc.rect(0, footerY, 595, footerHeight).fill('#FFFFFF');

      // Ligne de séparation noire épaisse en haut du footer
      doc.strokeColor('#000').lineWidth(1.5);
      doc.moveTo(50, separatorLineY).lineTo(545, separatorLineY).stroke();

      if (options.documentSociete && options.documentSociete.pied_page) {
        const piedPageText = htmlToPlainText(options.documentSociete.pied_page);
        doc.font('Helvetica').fontSize(7).fillColor('#000');
        doc.text(piedPageText, 50, footerStartY, { width: 495, align: 'center' });
      } else {
        // Pied de page par défaut - toutes les informations centrées sur la première page
        doc.font('Helvetica').fontSize(7).fillColor('#000');

        // Ligne 1 : SARL au capital et adresse - centrée
        doc.text(
          'SARL au capital 500 000.00 DHS - allée des orangers Derb Najat Rue 4 N°67 RDC Ain Sebaa Casablanca',
          50, footerStartY, { width: 495, align: 'center' }
        );

        // Ligne 2 : Téléphone, Fax, RC, IF, Email - centrée
        doc.text(
          'Tel: 0522672135 - Fax 0522672143 - RC120431TP37951465 IF: 1680027 Email: info@lesbasculesmondial.com',
          50, footerStartY + footerLineSpacing * 2, { width: 495, align: 'center' }
        );

        // Ligne 3 : RIB, CNSS, ICE - centrée (dernière ligne, doit être sur la première page)
        doc.text(
          'RIB 007 780 000368400000157019 - CNSS: 6463814 ICE: 000079494000078',
          50, footerStartY + (footerLineSpacing * 4), { width: 495, align: 'center' }
        );
      }

      doc.end();

      stream.on('finish', () => {
        resolve(filePath);
      });

      stream.on('error', (error) => {
        console.error('[genererCaissePDF] Erreur lors de l\'écriture du fichier:', error);
        reject(error);
      });

    } catch (error) {
      console.error('[genererCaissePDF] Erreur dans la génération du PDF:', error);
      console.error('[genererCaissePDF] Stack:', error.stack);
      reject(error);
    }
  });
}

// Générer un rapport PDF avec plusieurs caisses (plage de dates)
async function genererRapportCaissePDF(donnees, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!donnees || !donnees.documents) {
        reject(new Error('Données invalides: documents manquant'));
        return;
      }
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const fileName = `rapport_caisse_${donnees.dateFrom || 'all'}_${donnees.dateTo || 'all'}_${Date.now()}.pdf`;
      const folderPath = path.join(__dirname, '..', 'public', 'caisses');

      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      const filePath = path.join(folderPath, fileName);
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // === ENTÊTE ENTREPRISE (même format que facturation) ===
      // Utiliser le logo personnalisé si disponible, sinon le logo par défaut
      if (options.documentSociete && options.documentSociete.logo) {
        try {
          const logoBuffer = Buffer.from(options.documentSociete.logo, 'base64');
          doc.image(logoBuffer, 50, 20, { width: 100 });
        } catch (error) {
          console.warn('Erreur affichage logo personnalisé, utilisation du logo par défaut:', error);
          const logoPath = path.join(__dirname, '..', 'public', 'logo-bascule.jpg');
          if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, { width: 100 });
        }
      } else {
        const logoPath = path.join(__dirname, '..', 'public', 'logo-bascule.jpg');
        if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, { width: 100 });
      }

      // Utiliser l'en-tête personnalisé si disponible
      if (options.documentSociete && options.documentSociete.entete) {
        // Parser l'en-tête HTML et l'afficher
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
        // En-tête par défaut à droite du logo (ajusté pour logo de 100px)
        doc.fontSize(11).fillColor('#046ba7').font('Helvetica-Bold').text('Balances et Bascules Pont Bascule Electronique', 160, 30);
        doc.font('Helvetica').fontSize(10)
          .text('Mecanique - Vente et Reparation - Entretien', 160, 45)
          .text('Etalonnage Logiciels de Gestion', 160, 58);
      }

      // Ligne de séparation horizontale
      doc.rect(40, 100, 520, 1).fill('#000');

      // === TITRE ===
      const caisseTypeLabel = options.caisseType === 'black' ? 'CAISSE BLACK' : 'CAISSE DÉCLARÉE';
      let titreText = `RAPPORT DE ${caisseTypeLabel}`;
      if (options.employeNom) {
        titreText += ` - ${options.employeNom}`;
      }
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#000').text(titreText, 50, 120);

      // === INFORMATIONS DU RAPPORT ===
      let yPos = 150;
      doc.fontSize(10).font('Helvetica');

      // Boîte d'information stylisée
      drawRoundedRectOutline(doc, 50, yPos, 510, 60, 8, { fillColor: '#F8F9FA', strokeColor: '#DEE2E6', lineWidth: 1.5 });

      // Première ligne : Période
      doc.font('Helvetica-Bold').fillColor('#495057').text('Période:', 60, yPos + 12);
      const dateFrom = donnees.dateFrom ? new Date(donnees.dateFrom).toLocaleDateString('fr-FR') : 'Toutes';
      const dateTo = donnees.dateTo ? new Date(donnees.dateTo).toLocaleDateString('fr-FR') : 'Toutes';
      doc.font('Helvetica').fillColor('#212529').text(`Du ${dateFrom} au ${dateTo}`, 130, yPos + 12);

      // Deuxième ligne : Totaux
      doc.font('Helvetica-Bold').fillColor('#495057').text('Total Entrées:', 60, yPos + 30);
      doc.font('Helvetica-Bold').fillColor('#28A745').text(`${(donnees.totalEntrees || 0).toFixed(2)} DH`, 160, yPos + 30);

      doc.font('Helvetica-Bold').fillColor('#495057').text('Total Sorties:', 300, yPos + 30);
      doc.font('Helvetica-Bold').fillColor('#DC3545').text(`${(donnees.totalSorties || 0).toFixed(2)} DH`, 400, yPos + 30);

      // Troisième ligne : Solde
      doc.font('Helvetica-Bold').fillColor('#495057').text('Solde:', 60, yPos + 48);
      const solde = (donnees.totalEntrees || 0) - (donnees.totalSorties || 0);
      doc.font('Helvetica-Bold').fillColor(solde < 0 ? '#DC3545' : '#28A745')
        .text(`${solde.toFixed(2)} DH`, 130, yPos + 48);

      // === TABLEAU DES DÉTAILS ===
      yPos = 230;
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#212529').text('Détails des opérations', 50, yPos);
      yPos += 20;

      // Configuration des deux colonnes côte à côte
      const columnWidth = 245;
      const gap = 20;
      const leftColumnX = 50;
      const rightColumnX = leftColumnX + columnWidth + gap;
      const rowHeight = 16;
      const headerHeight = 20;

      const documents = donnees.documents || [];

      // Initialiser pageNumber avant toutes les conditions
      let pageNumber = 1;

      // Récupérer tous les détails de tous les documents
      const caisseModel = require('../models/finance/caisse.model');
      const allDetails = [];

      console.log('[genererRapportCaissePDF] 📊 Nombre total de documents à traiter:', documents.length);
      console.log('[genererRapportCaissePDF] 📊 Documents par sens:', {
        recettes: documents.filter(d => d.sens === 1).length,
        depenses: documents.filter(d => d.sens === -1).length,
        autres: documents.filter(d => d.sens !== 1 && d.sens !== -1).length
      });

      // Si un employeId est spécifié dans les options, on filtre les détails par cet employé
      const employeId = options.employeId || null;

      if (employeId) {
        console.log('[genererRapportCaissePDF] 👤 Filtrage des détails par employé ID:', employeId);
      }

      for (const docItem of documents) {
        try {
          const documentData = await caisseModel.getCaisseDocumentById(docItem.id);
          if (documentData && documentData.details && documentData.details.length > 0) {
            // Filtrer les détails par employé si employeId est fourni
            const detailsToProcess = employeId
              ? documentData.details.filter(detail => detail.employe_id === employeId)
              : documentData.details;

            if (employeId && detailsToProcess.length > 0) {
              console.log(`[genererRapportCaissePDF] ✅ Document ${docItem.id}: ${detailsToProcess.length} détails trouvés pour l'employé ${employeId} (sur ${documentData.details.length} total)`);
            }

            detailsToProcess.forEach(detail => {
              allDetails.push({
                ...detail,
                document_numero: docItem.numero,
                document_date: docItem.date,
                document_sens: docItem.sens
              });
            });
          }
        } catch (error) {
          console.error(`[genererRapportCaissePDF] ❌ Erreur récupération détails document ${docItem.id}:`, error.message);
        }
      }

      console.log('[genererRapportCaissePDF] 📊 Total détails récupérés:', allDetails.length, employeId ? `(filtrés pour employé ${employeId})` : '(tous les employés)');

      // Séparer les détails en Recettes (sens=1) et Dépenses (sens=-1)
      const recettes = allDetails.filter(d => d.document_sens === 1);
      const depenses = allDetails.filter(d => d.document_sens === -1);

      console.log('[genererRapportCaissePDF] 📊 Répartition des détails:', {
        recettes: recettes.length,
        depenses: depenses.length,
        total: recettes.length + depenses.length
      });

      // Si filtrage par employé, log détaillé des rubriques trouvées
      if (employeId) {
        const rubriquesRecettes = [...new Set(recettes.map(r => r.rubrique).filter(r => r))];
        const rubriquesDepenses = [...new Set(depenses.map(d => d.rubrique).filter(r => r))];
        console.log('[genererRapportCaissePDF] 👤 Rubriques de l\'employé:', {
          recettes: {
            nombre: recettes.length,
            rubriques: rubriquesRecettes.length,
            liste: rubriquesRecettes.slice(0, 10)
          },
          depenses: {
            nombre: depenses.length,
            rubriques: rubriquesDepenses.length,
            liste: rubriquesDepenses.slice(0, 10)
          }
        });

        // Log de chaque dépense trouvée
        if (depenses.length > 0) {
          console.log('[genererRapportCaissePDF] 💰 Dépenses trouvées pour l\'employé:', depenses.map(d => ({
            rubrique: d.rubrique,
            montant: d.montant,
            quantite: d.quantite,
            date: d.document_date
          })).slice(0, 5));
        } else {
          console.log('[genererRapportCaissePDF] ⚠️ Aucune dépense trouvée pour l\'employé', employeId);
        }
      }

      // Variable pour suivre si le footer a été dessiné
      let footerDrawn = false;

      // Fonction pour dessiner le footer (réutilisable)
      const drawFooter = (pageNum) => {
        if (footerDrawn) return; // Ne dessiner qu'une seule fois

        const pageHeight = 842; // Hauteur A4
        const bottomMargin = 40;
        const footerHeight = 45; // Hauteur augmentée pour accommoder deux sections
        const footerY = pageHeight - bottomMargin - footerHeight;
        const footerLineSpacing = 5;
        const footerStartY = footerY + 2;
        const separatorLineY = footerY + 20; // Position de la ligne de séparation

        // Rectangle de fond pour le pied de page (fond blanc)
        doc.rect(0, footerY, 595, footerHeight).fill('#FFFFFF');

        if (options.documentSociete && options.documentSociete.pied_page) {
          const piedPageText = htmlToPlainText(options.documentSociete.pied_page);
          doc.font('Helvetica').fontSize(7).fillColor('#000');
          doc.text(piedPageText, 50, footerStartY, { width: 495, align: 'left' });
        } else {
          // Pied de page par défaut avec toutes les informations selon l'image 2
          doc.font('Helvetica').fontSize(7).fillColor('#000');

          // Section supérieure - alignée à gauche
          // Ligne 1 : SARL au capital et adresse
          doc.text(
            'SARL au capital 500 000.00 DHS - allée des orangers Derb Najat Rue 4 N°67 RDC Ain Sebaa Casablanca',
            50, footerStartY, { width: 495, align: 'left' }
          );

          // Ligne 2 : Téléphone, Fax, RC, IF, Email
          doc.text(
            'Tel: 0522672135 - Fax 0522672143 - RC120431TP37951465 IF: 1680027 Email: info@lesbasculesmondial.com',
            50, footerStartY + footerLineSpacing * 2, { width: 495, align: 'left' }
          );

          // Ligne de séparation noire épaisse
          doc.strokeColor('#000').lineWidth(1.5);
          doc.moveTo(50, separatorLineY).lineTo(545, separatorLineY).stroke();

          // Section inférieure - centrée
          // RIB, CNSS, ICE
          doc.text(
            'RIB 007 780 000368400000157019 - CNSS: 6463814 ICE: 000079494000078',
            50, separatorLineY + 5, { width: 495, align: 'center' }
          );
        }

        footerDrawn = true; // Marquer comme dessiné
      };


      // Fonction pour dessiner une colonne (Débit ou Crédit)
      const drawColumn = (columnDetails, startX, columnWidth, columnTitle, columnColor, startY) => {
        let currentY = startY;
        let columnTotal = 0;

        // Titre de la colonne
        doc.fontSize(11).font('Helvetica-Bold').fillColor(columnColor).text(columnTitle, startX, currentY);
        currentY += 18;

        // En-tête du tableau avec bordures
        const tableTop = currentY;
        const headerHeight = 20;
        const rowHeight = 16;

        // Dessiner l'en-tête avec bordures
        doc.rect(startX, tableTop, columnWidth, headerHeight).fillAndStroke(columnColor === '#28A745' ? '#E8F5E9' : '#FFEBEE', '#000');

        // Colonnes: Date, N°, Rubrique, Employé, Montant
        const colHeaders = ['Date', 'N°', 'Rubrique', 'Employé', 'Montant'];
        const colX = [startX + 3, startX + 28, startX + 68, startX + 140, startX + columnWidth - 65];
        const colWidths = [25, 40, 72, 60, 62];

        doc.fontSize(7).font('Helvetica-Bold').fillColor('#000');
        colHeaders.forEach((header, i) => {
          doc.text(header, colX[i], tableTop + 6, { width: colWidths[i], align: i >= 4 ? 'right' : 'left' });
        });

        // Ligne de séparation sous l'en-tête
        doc.strokeColor('#000').lineWidth(0.5);
        doc.moveTo(startX, tableTop + headerHeight).lineTo(startX + columnWidth, tableTop + headerHeight).stroke();

        currentY = tableTop + headerHeight;

        // Dessiner les lignes de données
        columnDetails.forEach((detail, index) => {
          // Vérifier si on dépasse la page
          if (currentY + rowHeight > 780) {
            return; // Ne pas dessiner cette ligne, sera sur nouvelle page
          }

          // Alterner les couleurs de fond
          const rowColor = index % 2 === 0 ? '#FFFFFF' : '#F8F9FA';

          // Rectangle de la ligne avec bordures
          doc.rect(startX, currentY, columnWidth, rowHeight).fillAndStroke(rowColor, '#000');

          // Bordures verticales entre colonnes
          doc.strokeColor('#000').lineWidth(0.3);
          for (let i = 1; i < colX.length; i++) {
            doc.moveTo(colX[i] - 2, currentY).lineTo(colX[i] - 2, currentY + rowHeight).stroke();
          }

          doc.fontSize(7).font('Helvetica').fillColor('#212529');

          // Date
          const dateStr = detail.document_date ? new Date(detail.document_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '-';
          doc.text(dateStr, colX[0], currentY + 4, { width: colWidths[0], align: 'left' });

          // Numéro de document
          const numero = (detail.document_numero || '-').substring(0, 12);
          doc.text(numero, colX[1], currentY + 4, { width: colWidths[1], align: 'left' });

          // Rubrique (sur plusieurs lignes si nécessaire)
          const rubrique = (detail.rubrique || '-').substring(0, 30);
          doc.text(rubrique, colX[2], currentY + 4, { width: colWidths[2], align: 'left' });

          // Employé
          const employe = (detail.employe_nom_complet || detail.employe || '-').substring(0, 18);
          doc.text(employe, colX[3], currentY + 4, { width: colWidths[3], align: 'left' });

          // Montant
          const quantiteValue = parseFloat(detail.quantite || 0);
          const montantValue = parseFloat(detail.montant || 0);
          const total = quantiteValue > 0 ? (quantiteValue * montantValue) : montantValue;
          columnTotal += total;
          doc.font('Helvetica-Bold').fillColor('#000');
          doc.text(`${total.toFixed(2)} DH`, colX[4], currentY + 4, { width: colWidths[4], align: 'right' });
          doc.font('Helvetica').fillColor('#212529');

          currentY += rowHeight;
        });

        // Ligne de total de la colonne avec bordure
        if (columnDetails.length > 0) {
          doc.rect(startX, currentY, columnWidth, rowHeight).fillAndStroke('#E0E0E0', '#000');
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#000');
          doc.text('Total:', startX + 3, currentY + 4);
          doc.text(`${columnTotal.toFixed(2)} DH`, colX[4], currentY + 4, { width: colWidths[4], align: 'right' });
          currentY += rowHeight;
        }

        return { nextY: currentY, total: columnTotal };
      };

      if (allDetails.length > 0) {
        // Configuration du tableau unique (comme l'image de référence)
        const tableWidth = 510;
        const tableX = 50;
        const rowHeight = 18;
        const headerHeight = 22;
        const pageBreakY = 780;

        // Colonnes: Date, Opérations (Rubrique), Employé, Recette, Dépense, Solde
        const colHeaders = ['Date', 'Opérations', 'Employé', 'Recette', 'Dépense', 'Solde'];
        const colX = [tableX + 2, tableX + 62, tableX + 220, tableX + 320, tableX + 390, tableX + 460];
        const colWidths = [60, 158, 100, 70, 70, 50];

        let currentY = yPos;
        let totalEntrees = 0;
        let totalSorties = 0;

        // Fonction pour dessiner l'en-tête du tableau
        const drawTableHeader = (y) => {
          doc.rect(tableX, y, tableWidth, headerHeight).fillAndStroke('#343A40', '#000');
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');

          colHeaders.forEach((header, i) => {
            // Aligner à droite pour Recette, Dépense, et Solde (colonnes 3, 4, 5)
            const align = i >= 3 ? 'right' : 'left';
            doc.text(header, colX[i], y + 7, { width: colWidths[i], align: align });
          });

          return y + headerHeight;
        };

        // Trier toutes les lignes par date
        const allLines = [];
        let runningSolde = 0; // Solde courant pour chaque ligne

        // Ajouter toutes les recettes (montant dans Débit)
        if (recettes && recettes.length > 0) {
          recettes.forEach(detail => {
            const quantiteValue = parseFloat(detail.quantite || 0);
            const montantValue = parseFloat(detail.montant || 0);
            const total = quantiteValue > 0 ? (quantiteValue * montantValue) : montantValue;
            runningSolde += total; // Ajouter au solde
            allLines.push({
              ...detail,
              type: 'Débit',
              debit: total,
              credit: 0,
              solde: runningSolde
            });
          });
        }

        // Ajouter toutes les dépenses (montant dans Crédit)
        if (depenses && depenses.length > 0) {
          console.log('[genererRapportCaissePDF] 💰 Ajout de', depenses.length, 'dépenses dans allLines');
          depenses.forEach(detail => {
            const quantiteValue = parseFloat(detail.quantite || 0);
            const montantValue = parseFloat(detail.montant || 0);
            const total = quantiteValue > 0 ? (quantiteValue * montantValue) : montantValue;
            runningSolde -= total; // Soustraire du solde
            allLines.push({
              ...detail,
              type: 'Crédit',
              debit: 0,
              credit: total,
              solde: runningSolde
            });
          });
        } else {
          console.log('[genererRapportCaissePDF] ⚠️ Aucune dépense à ajouter (depenses.length =', depenses?.length || 0, ')');
        }

        console.log('[genererRapportCaissePDF] 📊 Lignes combinées:', {
          total: allLines.length,
          debits: allLines.filter(l => l.type === 'Débit').length,
          credits: allLines.filter(l => l.type === 'Crédit').length
        });

        // Utiliser les totaux du backend plutôt que les calculs locaux
        totalEntrees = donnees.totalEntrees || 0;
        totalSorties = donnees.totalSorties || 0;

        // Recalculer le solde après tri car on doit trier d'abord
        runningSolde = 0;
        // Trier par date
        allLines.sort((a, b) => {
          const dateA = a.document_date ? new Date(a.document_date).getTime() : 0;
          const dateB = b.document_date ? new Date(b.document_date).getTime() : 0;
          if (dateA !== dateB) return dateA - dateB;
          // Si même date, recettes avant dépenses
          return a.type === 'Débit' ? -1 : 1;
        });

        // Recalculer le solde après tri (ordre chronologique)
        allLines.forEach(line => {
          if (line.type === 'Débit') {
            runningSolde += line.debit;
          } else {
            runningSolde -= line.credit;
          }
          line.solde = runningSolde;
        });

        // Vérifier qu'on a bien des lignes à afficher
        if (allLines.length === 0) {
          console.warn('[genererRapportCaissePDF] ⚠️ Aucune ligne à afficher (recettes et dépenses vides)');
        }

        // Dessiner l'en-tête initial
        currentY = drawTableHeader(currentY);

        // Si aucune ligne, afficher un message
        if (allLines.length === 0) {
          doc.fontSize(9).font('Helvetica').fillColor('#666');
          doc.text('Aucune opération trouvée dans cette période', tableX + 5, currentY + 5);
          currentY += 20;
        } else {
          // Dessiner les lignes de données
          allLines.forEach((detail, index) => {
            // Vérifier si on a besoin d'une nouvelle page
            if (currentY + rowHeight > pageBreakY) {
              doc.addPage();
              pageNumber++;
              currentY = 50;
              currentY = drawTableHeader(currentY);
            }

            // Couleur de la ligne (alternance)
            const rowColor = index % 2 === 0 ? '#FFFFFF' : '#F8F9FA';

            // Rectangle de la ligne avec bordures
            doc.rect(tableX, currentY, tableWidth, rowHeight).fillAndStroke(rowColor, '#000');

            // Bordures verticales entre colonnes
            doc.strokeColor('#000').lineWidth(0.3);
            for (let i = 1; i < colX.length; i++) {
              doc.moveTo(colX[i] - 2, currentY).lineTo(colX[i] - 2, currentY + rowHeight).stroke();
            }

            doc.fontSize(7).font('Helvetica').fillColor('#212529');

            // Date (format jj/mm/yyyy)
            let dateStr = '-';
            if (detail.document_date) {
              const date = new Date(detail.document_date);
              const day = String(date.getDate()).padStart(2, '0');
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const year = date.getFullYear();
              dateStr = `${day}/${month}/${year}`;
            }
            doc.text(dateStr, colX[0], currentY + 5, { width: colWidths[0], align: 'left' });

            // Opérations : Rubrique + Numéro document (sans employé, qui est dans une colonne séparée)
            const rubrique = (detail.rubrique || '-').trim();
            const numero = (detail.document_numero || '-').trim();
            let operationsText = rubrique !== '-' ? rubrique : '-';
            if (numero !== '-' && operationsText !== '-') {
              operationsText += ' (' + numero + ')';
            }
            // Limiter la longueur
            if (operationsText.length > 35) {
              operationsText = operationsText.substring(0, 32) + '...';
            }
            doc.text(operationsText, colX[1] + 3, currentY + 5, { width: colWidths[1] - 6, align: 'left' });

            // Employé (colonne séparée)
            const employe = (detail.employe_nom_complet || detail.employe || '-').trim();
            const employeText = employe !== '-' ? employe : '-';
            if (employeText.length > 20) {
              doc.text(employeText.substring(0, 17) + '...', colX[2] + 3, currentY + 5, { width: colWidths[2] - 6, align: 'left' });
            } else {
              doc.text(employeText, colX[2] + 3, currentY + 5, { width: colWidths[2] - 6, align: 'left' });
            }

            // Recette (pour les entrées) - toujours afficher "0.00 DH" si vide
            if (detail.debit > 0) {
              doc.font('Helvetica-Bold').fillColor('#28A745');
              doc.text(`${detail.debit.toFixed(2)} DH`, colX[3], currentY + 5, { width: colWidths[3] - 4, align: 'right' });
            } else {
              doc.font('Helvetica').fillColor('#212529');
              doc.text('0.00 DH', colX[3], currentY + 5, { width: colWidths[3] - 4, align: 'right' });
            }

            // Dépense (pour les sorties) - toujours afficher "0.00 DH" si vide
            if (detail.credit > 0) {
              doc.font('Helvetica-Bold').fillColor('#DC3545');
              doc.text(`${detail.credit.toFixed(2)} DH`, colX[4], currentY + 5, { width: colWidths[4] - 4, align: 'right' });
            } else {
              doc.font('Helvetica').fillColor('#212529');
              doc.text('0.00 DH', colX[4], currentY + 5, { width: colWidths[4] - 4, align: 'right' });
            }

            // Solde - toujours afficher "0.00" pour les cellules vides
            doc.font('Helvetica').fillColor('#212529');
            doc.text('0.00', colX[5], currentY + 5, { width: colWidths[5] - 4, align: 'right' });

            currentY += rowHeight;
          });
        }

        // Ligne de séparation avant les totaux (seulement si on a des lignes)
        if (allLines.length > 0) {
          currentY += 3;
          doc.strokeColor('#000').lineWidth(1.5);
          doc.moveTo(tableX, currentY).lineTo(tableX + tableWidth, currentY).stroke();
          currentY += 5;

          // Une seule ligne pour tous les totaux - alignés avec les colonnes
          doc.rect(tableX, currentY, tableWidth, rowHeight + 2).fillAndStroke('#E0E0E0', '#000');
          // Bordures verticales pour les totaux
          doc.strokeColor('#000').lineWidth(0.3);
          for (let i = 1; i < colX.length; i++) {
            doc.moveTo(colX[i] - 2, currentY).lineTo(colX[i] - 2, currentY + rowHeight + 2).stroke();
          }

          doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');

          // Label "TOTAL" qui s'étend du début (Date) jusqu'à avant la colonne Recette
          // Cela signifie qu'il occupe les colonnes Date, Opérations, et Employé
          doc.font('Helvetica-Bold').fillColor('#000');
          // Calculer la largeur totale des colonnes Date + Opérations + Employé
          const totalLabelWidth = colWidths[0] + colWidths[1] + colWidths[2];
          doc.text('TOTAL', colX[0], currentY + 6, { width: totalLabelWidth, align: 'left' });

          // Colonne Employé - afficher "0.00" pour les cellules vides (mais sera couverte par TOTAL)
          // On garde cette partie vide car TOTAL couvre déjà cette zone

          // Total Entrées dans colonne Recette (sans "DH")
          doc.font('Helvetica-Bold').fillColor('#00AA00');
          doc.text(`${totalEntrees.toFixed(2)}`, colX[3], currentY + 6, { width: colWidths[3] - 4, align: 'right' });

          // Total Sorties dans colonne Dépense (sans "DH")
          doc.fillColor('#AA0000');
          doc.text(`${totalSorties.toFixed(2)}`, colX[4], currentY + 6, { width: colWidths[4] - 4, align: 'right' });

          // Solde Final dans colonne Solde (sans "DH")
          doc.fillColor(solde < 0 ? '#FF0000' : '#000000');
          doc.text(`${solde.toFixed(2)}`, colX[5], currentY + 6, { width: colWidths[5] - 4, align: 'right' });

          currentY += rowHeight + 2;
        }

        yPos = currentY + (allLines.length > 0 ? rowHeight + 2 + 10 : 10);
      } else {
        doc.fontSize(10).font('Helvetica').fillColor('#666').text('Aucune opération trouvée pour cette période', 50, yPos);
      }

      // === PIED DE PAGE ===
      // Dessiner le footer UNIQUEMENT sur la dernière page (pas sur chaque page)
      // Le footer sera dessiné juste avant doc.end(), ce qui garantit qu'il sera sur la dernière page
      drawFooter(pageNumber);

      doc.end();

      stream.on('finish', () => {
        resolve(filePath);
      });

      stream.on('error', (error) => {
        console.error('[genererRapportCaissePDF] ❌❌❌ Erreur lors de l\'écriture du fichier');
        console.error('[genererRapportCaissePDF] Message:', error.message);
        console.error('[genererRapportCaissePDF] Stack:', error.stack);
        console.error('[genererRapportCaissePDF] Chemin du fichier:', filePath);
        console.error('[genererRapportCaissePDF] ========================================');
        reject(error);
      });

    } catch (error) {
      console.error('[genererRapportCaissePDF] ❌❌❌ Erreur dans la génération du PDF');
      console.error('[genererRapportCaissePDF] Message:', error.message);
      console.error('[genererRapportCaissePDF] Stack:', error.stack);
      if (error.code) {
        console.error('[genererRapportCaissePDF] Code erreur:', error.code);
      }
      console.error('[genererRapportCaissePDF] ========================================');
      reject(error);
    }
  });
}

// Générer un rapport PDF filtré par employé (plage de dates)
async function genererRapportCaissePDFByEmploye(donnees, options = {}) {
  // Passer l'employeId dans les options pour que genererRapportCaissePDF filtre les détails
  const employeId = donnees.employeId || options.employeId;
  return genererRapportCaissePDF(donnees, {
    ...options,
    employeId: employeId
  });
}

// Générer un PDF de caisse filtré par employé
async function genererCaissePDFByEmploye(caisseData, employeId, options = {}) {
  return new Promise((resolve, reject) => {
    try {

      // Filtrer les détails par employe_id
      const filteredDetails = caisseData.details ?
        caisseData.details.filter(detail => detail.employe_id === employeId) : [];

      if (filteredDetails.length === 0) {
        return reject(new Error('Aucun détail trouvé pour cet employé'));
      }

      // Récupérer le nom de l'employé depuis les détails
      const employeNom = filteredDetails[0]?.employe_nom_complet || 'Employé inconnu';

      // Créer une copie des données avec seulement les détails filtrés
      const filteredCaisseData = {
        ...caisseData,
        details: filteredDetails
      };

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const fileName = `caisse_${caisseData.numero || caisseData.id}_employe_${employeId}_${Date.now()}.pdf`;
      const folderPath = path.join(__dirname, '..', 'public', 'caisses');

      // Créer le dossier s'il n'existe pas
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      const filePath = path.join(folderPath, fileName);
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // === EN-TÊTE ===
      const logoPath = path.join(__dirname, '..', 'public', 'Cactus.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 30, { width: 70 });
      }

      // Utiliser l'en-tête personnalisé si disponible
      if (options.documentSociete && options.documentSociete.entete) {
        const enteteText = htmlToPlainText(options.documentSociete.entete);
        const enteteLines = enteteText.split('\n');
        let yPos = 30;
        enteteLines.forEach(line => {
          if (line.trim()) {
            doc.fontSize(10).font('Helvetica-Bold').text(line.trim(), 130, yPos);
            yPos += 12;
          }
        });
      } else {
        doc.fontSize(10).font('Helvetica-Bold').text('CACTUS INFORMATIQUE', 130, 30);
        doc.font('Helvetica').fontSize(9)
          .text('LOTISSEMENT HLIWA RUE 8 N°69', 130, 43)
          .text('AIN SEBAA 20250 CASABLANCA', 130, 55)
          .text('TEL : 05 22 34 35 45', 130, 67)
          .text('FAX : 05 22 67 38 09', 130, 79);
      }

      // Ligne de séparation
      doc.rect(40, 100, 520, 1).fill('#000');

      // === TITRE ===
      const documentType = caisseData.sens === 1 ? 'BON DE CAISSE - RECETTE' : 'BON DE CAISSE - DÉPENSE';
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#000').text(documentType, 50, 120);

      // === INFORMATIONS DU DOCUMENT ===
      let yPos = 170;
      doc.fontSize(10).font('Helvetica');

      drawRoundedRectOutline(doc, 50, yPos, 510, 100, 8);
      doc.font('Helvetica-Bold').text('Numéro:', 60, yPos + 10);
      doc.font('Helvetica').text(caisseData.numero || 'N/A', 130, yPos + 10);

      doc.font('Helvetica-Bold').text('Date:', 60, yPos + 25);
      doc.font('Helvetica').text(caisseData.date ? new Date(caisseData.date).toLocaleDateString('fr-FR') : 'N/A', 130, yPos + 25);

      doc.font('Helvetica-Bold').text('Employé:', 60, yPos + 40);
      doc.font('Helvetica').text(employeNom, 130, yPos + 40);

      doc.font('Helvetica-Bold').text('Description:', 60, yPos + 55);
      doc.font('Helvetica').text(caisseData.description || '-', 130, yPos + 55, { width: 350 });

      doc.font('Helvetica-Bold').text('Affectation:', 60, yPos + 70);
      doc.font('Helvetica').text(caisseData.affectation || '-', 130, yPos + 70);

      // === DÉTAILS ===
      yPos = 290;
      doc.fontSize(12).font('Helvetica-Bold').text('Détails:', 50, yPos);
      yPos += 25;

      if (filteredDetails && filteredDetails.length > 0) {
        // En-tête du tableau
        const tableTop = yPos;
        const colWidths = [120, 150, 60, 70, 70];
        const colHeaders = ['Rubrique', 'Description', 'Quantité', 'Montant', 'Total'];
        const colX = [50, 170, 320, 380, 450];

        // Ligne d'en-tête
        doc.rect(50, tableTop, 510, 25).fill('#E0E0E0');
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
        colHeaders.forEach((header, i) => {
          doc.text(header, colX[i], tableTop + 8);
        });

        // Lignes de données
        let currentY = tableTop + 25;
        let totalGeneral = 0;

        filteredDetails.forEach((detail, index) => {
          const quantite = detail.quantite || 0;
          const montant = detail.montant || 0;
          const total = quantite * montant;
          totalGeneral += total;

          // Alterner les couleurs de fond
          if (index % 2 === 0) {
            doc.rect(50, currentY, 510, 20).fill('#F5F5F5');
          }

          doc.fontSize(9).font('Helvetica').fillColor('#000');
          doc.text(detail.rubrique || '-', colX[0], currentY + 6);
          doc.text(detail.description || '-', colX[1], currentY + 6, { width: colWidths[1] });
          doc.text(quantite.toString(), colX[2], currentY + 6, { align: 'right' });
          doc.text(montant.toFixed(2) + ' DH', colX[3], currentY + 6, { align: 'right' });
          doc.text(total.toFixed(2) + ' DH', colX[4], currentY + 6, { align: 'right' });

          currentY += 20;

          // Nouvelle page si nécessaire
          if (currentY > 750) {
            doc.addPage();
            currentY = 50;
          }
        });

        // Ligne de total
        currentY += 5;
        doc.rect(50, currentY, 510, 25).fill('#D0D0D0');
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000');
        doc.text('TOTAL:', colX[0], currentY + 8);
        doc.text(totalGeneral.toFixed(2) + ' DH', colX[4], currentY + 8, { align: 'right' });

        // Montant en lettres
        currentY += 35;
        const amountFormatted = formatAmount(totalGeneral);
        doc.fontSize(10).font('Helvetica').fillColor('#000');
        doc.text('Arrêté la présente caisse à la somme de:', 50, currentY);
        doc.font('Helvetica-Bold').text(amountFormatted.words, 50, currentY + 15);
      } else {
        doc.fontSize(10).font('Helvetica').fillColor('#666').text('Aucun détail disponible', 50, yPos);
      }

      // === PIED DE PAGE ===
      const pageHeight = doc.page.height;
      const footerY = pageHeight - 50;

      if (options.documentSociete && options.documentSociete.pied_page) {
        const piedPageText = htmlToPlainText(options.documentSociete.pied_page);
        const piedPageLines = piedPageText.split('\n');
        let footerYPos = footerY;
        piedPageLines.forEach(line => {
          if (line.trim()) {
            doc.fontSize(8).font('Helvetica').text(line.trim(), 50, footerYPos, { align: 'center', width: 500 });
            footerYPos += 10;
          }
        });
      } else {
        doc.fontSize(8).font('Helvetica').fillColor('#666')
          .text('Document généré le ' + new Date().toLocaleDateString('fr-FR'), 50, footerY, { align: 'center', width: 500 });
      }

      doc.end();

      stream.on('finish', () => {
        resolve(filePath);
      });

      stream.on('error', (error) => {
        console.error('[genererCaissePDFByEmploye] Erreur lors de l\'écriture du fichier:', error);
        reject(error);
      });

    } catch (error) {
      console.error('[genererCaissePDFByEmploye] Erreur dans la génération du PDF:', error);
      console.error('[genererCaissePDFByEmploye] Stack:', error.stack);
      reject(error);
    }
  });
}

// Générer un bon de caisse PDF par employé selon le format des formulaires
async function genererBonDeCaissePDF(bonDeCaisseData, options = {}) {
  return new Promise((resolve, reject) => {
    try {

      const isRecette = bonDeCaisseData.document.type_caisse === 'recette';
      const borderColor = isRecette ? '#0066CC' : '#FF1493'; // Bleu pour recette, Rose/Magenta pour dépense
      const borderWidth = 8; // Épaisseur de la bordure

      // A5 en paysage: 210mm x 148mm = 595.28 x 419.53 points
      // PDFKit attend [largeur, hauteur] en points
      // Pour A5 paysage: largeur (210mm) > hauteur (148mm)
      const doc = new PDFDocument({
        size: 'A5',
        layout: 'landscape', // Force le format paysage
        margin: 0 // Pas de marge pour avoir la bordure sur tout le document
      });

      const fileName = `bon_caisse_${bonDeCaisseData.document.numero}_${(bonDeCaisseData.employe.nom_complet || 'employe').replace(/\s+/g, '_')}_${Date.now()}.pdf`;
      const folderPath = path.join(__dirname, '..', 'public', 'caisses');

      // Créer le dossier s'il n'existe pas
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      const filePath = path.join(folderPath, fileName);
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Avec layout: 'landscape', PDFKit inverse automatiquement pour A5
      // A5 paysage = 210mm x 148mm = 595.28 x 419.53 points
      const pageWidth = doc.page.width; // Devrait être ~595 points (largeur)
      const pageHeight = doc.page.height; // Devrait être ~420 points (hauteur)
      const leftBorderWidth = 25; // Largeur de la bordure gauche
      const contentMargin = borderWidth + 10; // Marge interne après la bordure
      const contentStartX = leftBorderWidth + contentMargin; // Position X de départ du contenu

      // === BORDURE COLORÉE ===
      doc.rect(0, 0, pageWidth, pageHeight)
        .lineWidth(borderWidth)
        .strokeColor(borderColor)
        .stroke();

      // === BORDURE GAUCHE AVEC TEXTE VERTICAL ===
      doc.rect(0, 0, leftBorderWidth, pageHeight)
        .fillColor(borderColor)
        .fill();

      // Texte vertical sur la bordure gauche
      const refText = isRecette ? 'Ref. PC 900 - Marque et Modèle déposés' : 'Apr. PC 001 - Marque et Modèle déposés';
      doc.save();
      // Centrer le texte verticalement et horizontalement dans la bordure
      const textX = leftBorderWidth / 2;
      const textY = pageHeight / 2;
      doc.translate(textX, textY);
      doc.rotate(-90);
      doc.fontSize(7);
      doc.font('Helvetica-Bold');
      doc.fillColor('#FFFFFF');
      // Calculer la largeur du texte pour le centrer
      const textWidth = doc.widthOfString(refText);
      doc.text(refText, -textWidth / 2, 0);
      doc.restore();

      // === CONTENU PRINCIPAL ===
      let yPos = contentMargin + 15;

      // === TITRE PRINCIPAL (Gauche) ===
      const titleY = yPos;
      doc.fontSize(18).font('Helvetica-Bold').fillColor(borderColor);
      doc.text('Pièce de Caisse', contentStartX, titleY);
      const subtitleY = titleY + 22;
      doc.fontSize(16).text(isRecette ? 'RECETTES' : 'DEPENSES', contentStartX, subtitleY);

      // === BARRER LE TITRE SI CAISSE BLACK (type = 1 ou 2) ===
      // Vérifier si c'est une caisse black (non déclarée)
      const type = bonDeCaisseData.document?.type;
      const typeFromDetails = bonDeCaisseData.details?.[0]?.type;
      const isCaisseBlack = type === 1 || type === 2 || type === '1' || type === '2' ||
        (typeof typeFromDetails === 'string' && typeFromDetails.toLowerCase().includes('black'));

      if (isCaisseBlack) {
        // Dessiner deux lignes diagonales qui traversent le titre (comme sur un chèque barré)
        doc.strokeColor('#000000') // Noir comme sur un chèque barré
          .lineWidth(2)
          .opacity(0.3);

        // Calculer la largeur du titre pour déterminer où s'arrêter les barres
        const titleWidth = doc.widthOfString('Pièce de Caisse');
        const subtitleWidth = doc.widthOfString(isRecette ? 'RECETTES' : 'DEPENSES');
        const maxTitleWidth = Math.max(titleWidth, subtitleWidth);

        // Position des barres : traverser le titre
        const barStartX = contentStartX;
        const barStartY = titleY - 15; // Légèrement au-dessus du titre
        const barEndX = contentStartX + maxTitleWidth + 1; // Jusqu'à la fin du titre + marge
        const barEndY = subtitleY + 1; // Légèrement en dessous du sous-titre

        const barSpacing = 5; // Espacement entre les deux lignes

        // Première ligne diagonale
        doc.moveTo(barStartX, barStartY)
          .lineTo(barEndX, barEndY)
          .stroke();

        // Deuxième ligne diagonale parallèle (décalée)
        doc.moveTo(barStartX, barStartY + barSpacing)
          .lineTo(barEndX, barEndY + barSpacing)
          .stroke();

        // Réinitialiser l'opacité
        doc.opacity(1);
      }

      yPos = subtitleY + 30;

      // === CHAMPS EN HAUT À DROITE ===
      const rightX = pageWidth - contentMargin - 120;
      doc.fontSize(9).font('Helvetica').fillColor(borderColor);

      // N° - Label en couleur, valeur en noir
      doc.fontSize(9).font('Helvetica').fillColor(borderColor);
      doc.text('N°:', rightX, contentMargin + 10);
      const lineY1 = contentMargin + 20;
      // Dessiner la ligne
      doc.moveTo(rightX + 25, lineY1)
        .lineTo(rightX + 110, lineY1)
        .lineWidth(1)
        .strokeColor(borderColor)
        .stroke();
      // Texte en NOIR au-dessus de la ligne
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
      doc.text(bonDeCaisseData.document.numero || '', rightX + 30, lineY1 - 10);

      // Date - Label en couleur, valeur en noir (réorganisé)
      doc.fontSize(9).font('Helvetica').fillColor(borderColor);
      doc.text('Date :', rightX, contentMargin + 32);
      const lineY2 = contentMargin + 42;
      doc.moveTo(rightX + 35, lineY2)
        .lineTo(rightX + 110, lineY2)
        .lineWidth(1)
        .strokeColor(borderColor)
        .stroke();
      const dateStr = bonDeCaisseData.document.date ? new Date(bonDeCaisseData.document.date).toLocaleDateString('fr-FR') : '';
      doc.fontSize(9).font('Helvetica').fillColor('#000000');
      doc.text(dateStr, rightX + 38, lineY2 - 10);

      // === CHAMPS PRINCIPAUX ===
      yPos = contentMargin + 90;

      // Reçu de (pour recette) ou Bénéficiaire (pour dépense)
      if (isRecette) {
        doc.fontSize(10).font('Helvetica').fillColor(borderColor);
        doc.text('Reçu de :', contentStartX, yPos);
        yPos += 14;
        const lineY = yPos;
        // Dessiner la ligne
        doc.moveTo(contentStartX, lineY)
          .lineTo(pageWidth - contentMargin - 10, lineY)
          .lineWidth(1)
          .strokeColor(borderColor)
          .stroke();
        // Texte en noir au-dessus de la ligne
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
        doc.text(bonDeCaisseData.employe.nom_complet || '', contentStartX + 55, lineY - 11);
        yPos += 20;
      } else {
        doc.fontSize(10).font('Helvetica').fillColor(borderColor);
        doc.text('Bénéficiaire :', contentStartX, yPos);
        yPos += 14;
        const lineY = yPos;
        doc.moveTo(contentStartX, lineY)
          .lineTo(pageWidth - contentMargin - 10, lineY)
          .lineWidth(1)
          .strokeColor(borderColor)
          .stroke();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
        doc.text(bonDeCaisseData.employe.nom_complet || '', contentStartX + 55, lineY - 11);
        yPos += 20;
      }

      // Montant - Label en couleur, valeur en noir
      doc.fontSize(10).font('Helvetica').fillColor(borderColor);
      doc.text('Montant :', contentStartX, yPos);
      yPos += 14;
      const montantLineY = yPos;
      doc.moveTo(contentStartX, montantLineY)
        .lineTo(pageWidth - contentMargin - 10, montantLineY)
        .lineWidth(1)
        .strokeColor(borderColor)
        .stroke();
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
      doc.text(bonDeCaisseData.total.toFixed(2) + ' DH', contentStartX + 55, montantLineY - 11);
      yPos += 20;

      // Motif - Label en couleur, valeur en noir
      doc.fontSize(10).font('Helvetica').fillColor(borderColor);
      doc.text('Motif :', contentStartX, yPos);
      yPos += 14;
      const motifLineY = yPos;
      doc.moveTo(contentStartX, motifLineY)
        .lineTo(pageWidth - contentMargin - 10, motifLineY)
        .lineWidth(1)
        .strokeColor(borderColor)
        .stroke();
      if (bonDeCaisseData.details && bonDeCaisseData.details.length > 0) {
        // Afficher les rubriques comme motif
        const motifs = bonDeCaisseData.details.map(d => d.rubrique).filter(Boolean).join(', ');
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
        doc.text(motifs.substring(0, 100), contentStartX + 55, motifLineY - 11);
      }
      yPos += 20;

      // === DÉTAILS DES RUBRIQUES EN TABLEAU ===
      if (bonDeCaisseData.details && bonDeCaisseData.details.length > 0) {
        doc.fontSize(9).font('Helvetica-Bold').fillColor(borderColor);
        doc.text('Détails:', contentStartX, yPos);
        yPos += 18;

        // Dimensions du tableau
        const tableStartX = contentStartX;
        const tableWidth = pageWidth - contentStartX - contentMargin - 10;
        const colWidths = {
          rubrique: tableWidth * 0.45,  // 45% pour la rubrique
          quantite: tableWidth * 0.15,  // 15% pour la quantité
          montant: tableWidth * 0.20,   // 20% pour le montant
          total: tableWidth * 0.20      // 20% pour le total
        };
        const baseRowHeight = 18;
        const headerHeight = 18;
        const headerY = yPos;

        // En-tête du tableau
        let currentX = tableStartX;

        // Fond de l'en-tête
        doc.rect(tableStartX, headerY, tableWidth, headerHeight)
          .fillColor(borderColor)
          .fill();

        // Colonnes de l'en-tête
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
        doc.text('Rubrique', currentX + 5, headerY + 5, { width: colWidths.rubrique - 10, align: 'left' });
        currentX += colWidths.rubrique;
        doc.text('Qté', currentX, headerY + 5, { width: colWidths.quantite, align: 'center' });
        currentX += colWidths.quantite;
        doc.text('Montant', currentX, headerY + 5, { width: colWidths.montant, align: 'center' });
        currentX += colWidths.montant;
        doc.text('Total', currentX, headerY + 5, { width: colWidths.total - 5, align: 'right' });

        yPos = headerY + headerHeight;

        // Corps du tableau
        bonDeCaisseData.details.forEach((detail, index) => {
          const quantite = detail.quantite || 0;
          const montant = detail.montant || 0;
          const total = quantite * montant;
          const rowY = yPos;

          // Calculer la hauteur nécessaire pour la rubrique (avec retour à la ligne si nécessaire)
          const rubriqueText = detail.rubrique || '-';
          const maxRubriqueWidth = colWidths.rubrique - 10;
          // Calculer la hauteur du texte avec retour à la ligne automatique
          const rubriqueLines = doc.heightOfString(rubriqueText, { width: maxRubriqueWidth });
          const rowHeight = Math.max(baseRowHeight, rubriqueLines + 8); // Au moins baseRowHeight, plus si nécessaire

          // Fond alterné pour les lignes
          if (index % 2 === 0) {
            doc.rect(tableStartX, rowY, tableWidth, rowHeight)
              .fillColor('#F8F9FA')
              .fill();
          }

          // Bordures verticales et horizontales
          doc.strokeColor('#CCCCCC').lineWidth(0.5);
          // Ligne horizontale supérieure
          doc.moveTo(tableStartX, rowY)
            .lineTo(tableStartX + tableWidth, rowY)
            .stroke();
          // Ligne horizontale inférieure
          doc.moveTo(tableStartX, rowY + rowHeight)
            .lineTo(tableStartX + tableWidth, rowY + rowHeight)
            .stroke();
          // Bordures verticales
          let borderX = tableStartX;
          doc.moveTo(borderX, rowY)
            .lineTo(borderX, rowY + rowHeight)
            .stroke();
          borderX += colWidths.rubrique;
          doc.moveTo(borderX, rowY)
            .lineTo(borderX, rowY + rowHeight)
            .stroke();
          borderX += colWidths.quantite;
          doc.moveTo(borderX, rowY)
            .lineTo(borderX, rowY + rowHeight)
            .stroke();
          borderX += colWidths.montant;
          doc.moveTo(borderX, rowY)
            .lineTo(borderX, rowY + rowHeight)
            .stroke();
          borderX += colWidths.total;
          doc.moveTo(borderX, rowY)
            .lineTo(borderX, rowY + rowHeight)
            .stroke();

          // Contenu des cellules
          currentX = tableStartX;
          doc.fontSize(8).font('Helvetica').fillColor('#000000');

          // Rubrique avec retour à la ligne automatique
          doc.text(rubriqueText, currentX + 5, rowY + 5, {
            width: maxRubriqueWidth,
            align: 'left',
            ellipsis: true // Tronquer avec ... si trop long
          });
          currentX += colWidths.rubrique;

          // Quantité (centré verticalement si la ligne est plus haute)
          const quantiteY = rowY + (rowHeight / 2) - 3;
          doc.text(quantite.toString(), currentX, quantiteY, {
            width: colWidths.quantite,
            align: 'center'
          });
          currentX += colWidths.quantite;

          // Montant (centré verticalement)
          doc.text(montant.toFixed(2) + ' DH', currentX, quantiteY, {
            width: colWidths.montant,
            align: 'center'
          });
          currentX += colWidths.montant;

          // Total (centré verticalement, en gras)
          doc.font('Helvetica-Bold');
          doc.text(total.toFixed(2) + ' DH', currentX, quantiteY, {
            width: colWidths.total - 5,
            align: 'right'
          });

          yPos += rowHeight;

          // Vérifier si on dépasse la page
          if (yPos > pageHeight - 120) {
            doc.addPage();
            // Redessiner la bordure sur la nouvelle page
            doc.rect(0, 0, pageWidth, pageHeight)
              .lineWidth(borderWidth)
              .strokeColor(borderColor)
              .stroke();
            doc.rect(0, 0, leftBorderWidth, pageHeight)
              .fillColor(borderColor)
              .fill();
            // Redessiner le texte vertical
            doc.save();
            const textX = leftBorderWidth / 2;
            const textY = pageHeight / 2;
            doc.translate(textX, textY);
            doc.rotate(-90);
            doc.fontSize(7);
            doc.font('Helvetica-Bold');
            doc.fillColor('#FFFFFF');
            const textWidth = doc.widthOfString(refText);
            doc.text(refText, -textWidth / 2, 0);
            doc.restore();

            yPos = contentMargin + 15;

            // Réafficher l'en-tête du tableau sur la nouvelle page
            const newHeaderY = yPos;
            doc.rect(tableStartX, newHeaderY, tableWidth, headerHeight)
              .fillColor(borderColor)
              .fill();
            currentX = tableStartX;
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFFFFF');
            doc.text('Rubrique', currentX + 5, newHeaderY + 5, { width: colWidths.rubrique - 10, align: 'left' });
            currentX += colWidths.rubrique;
            doc.text('Qté', currentX, newHeaderY + 5, { width: colWidths.quantite, align: 'center' });
            currentX += colWidths.quantite;
            doc.text('Montant', currentX, newHeaderY + 5, { width: colWidths.montant, align: 'center' });
            currentX += colWidths.montant;
            doc.text('Total', currentX, newHeaderY + 5, { width: colWidths.total - 5, align: 'right' });
            yPos = newHeaderY + headerHeight;
          }
        });

        // Ligne de fermeture du tableau
        doc.strokeColor(borderColor).lineWidth(1);
        doc.moveTo(tableStartX, yPos)
          .lineTo(tableStartX + tableWidth, yPos)
          .stroke();
      }

      // === SECTION VISAS (EN BAS) ===
      const visaY = pageHeight - 70;
      const availableWidth = pageWidth - contentStartX - contentMargin - 10;
      const visaWidth = availableWidth / 3;
      const visaStartX = contentStartX;

      // Visa Caissier
      doc.moveTo(visaStartX, visaY)
        .lineTo(visaStartX + visaWidth - 10, visaY)
        .lineWidth(1)
        .strokeColor(borderColor)
        .stroke();
      doc.fontSize(8).font('Helvetica').fillColor(borderColor)
        .text('Visa Caissier', visaStartX, visaY + 4, { align: 'center', width: visaWidth - 10 });

      // Visa Bénéficiaire
      doc.moveTo(visaStartX + visaWidth, visaY)
        .lineTo(visaStartX + visaWidth * 2 - 10, visaY)
        .lineWidth(1)
        .strokeColor(borderColor)
        .stroke();
      doc.fontSize(8).font('Helvetica').fillColor(borderColor)
        .text('Visa Bénéficiaire', visaStartX + visaWidth, visaY + 4, { align: 'center', width: visaWidth - 10 });

      // Visa Direction
      doc.moveTo(visaStartX + visaWidth * 2, visaY)
        .lineTo(visaStartX + visaWidth * 3 - 10, visaY)
        .lineWidth(1)
        .strokeColor(borderColor)
        .stroke();
      doc.fontSize(8).font('Helvetica').fillColor(borderColor)
        .text('Visa Direction', visaStartX + visaWidth * 2, visaY + 4, { align: 'center', width: visaWidth - 10 });

      // === CACHET APPROVED (centré au-dessus de "Visa Caissier") ===
      const stampCenterX = visaStartX + (visaWidth / 2); // Centre du premier visa
      const stampY = visaY - 50; // 50 points au-dessus de la ligne de visa
      const stampRadius = 25; // Rayon du cercle du cachet

      // Cercle pour le cachet (correctement centré)
      doc.circle(stampCenterX, stampY, stampRadius)
        .lineWidth(2)
        .strokeColor('#FF0000')
        .stroke();

      // Texte "APPROVED" parfaitement centré dans le cercle
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#FF0000');
      const approvedText = 'APPROVED';
      // Mesurer la largeur exacte du texte
      doc.fontSize(11).font('Helvetica-Bold');
      const approvedTextWidth = doc.widthOfString(approvedText);
      const approvedTextHeight = 11 * 1.2; // Approximation de la hauteur (fontSize * line height)
      // Centrer horizontalement et verticalement
      doc.text(approvedText, stampCenterX - approvedTextWidth / 2, stampY - approvedTextHeight / 2 - 3);

      // Date de génération du PDF (date actuelle) centrée dans le cachet
      doc.fontSize(7).font('Helvetica').fillColor('#FF0000');
      const currentDate = new Date();
      const dateText = currentDate.toLocaleDateString('fr-FR'); // Date de génération dynamique
      const dateTextWidth = doc.widthOfString(dateText);
      doc.text(dateText, stampCenterX - dateTextWidth / 2, stampY + approvedTextHeight / 2 - 2);

      doc.end();

      stream.on('finish', () => {
        resolve(filePath);
      });

      stream.on('error', (error) => {
        console.error('[genererBonDeCaissePDF] Erreur lors de l\'écriture du fichier:', error);
        reject(error);
      });

    } catch (error) {
      console.error('[genererBonDeCaissePDF] Erreur dans la génération du PDF:', error);
      console.error('[genererBonDeCaissePDF] Stack:', error.stack);
      reject(error);
    }
  });
}

// Générer un rapport PDF pour les rubriques 2000/3000
async function genererRapportCaisseGroup2000_3000PDF(donnees, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const fileName = `rapport_rubriques_${donnees.dateFrom || 'all'}_${donnees.dateTo || 'all'}_${Date.now()}.pdf`;
      const folderPath = path.join(__dirname, '..', 'public', 'caisses');

      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      const filePath = path.join(folderPath, fileName);
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // === ENTÊTE ENTREPRISE ===
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

      if (options.documentSociete && options.documentSociete.entete) {
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
        doc.fontSize(11).fillColor('#046ba7').font('Helvetica-Bold').text('Balances et Bascules Pont Bascule Electronique', 160, 30);
        doc.font('Helvetica').fontSize(10)
          .text('Mecanique - Vente et Reparation - Entretien', 160, 45)
          .text('Etalonnage Logiciels de Gestion', 160, 58);
      }

      doc.rect(40, 100, 520, 1).fill('#000');

      // === TITRE ===
      const caisseTypeLabel = options.caisseType === 'black' ? 'CAISSE BLACK' : 'CAISSE DÉCLARÉE';
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#000').text(`RAPPORT RUBRIQUES (2000/3000) - ${caisseTypeLabel}`, 50, 120);

      // === INFO PÉRIODE ===
      let yPos = 150;
      doc.fontSize(10).font('Helvetica');
      drawRoundedRectOutline(doc, 50, yPos, 510, 40, 8, { fillColor: '#F8F9FA', strokeColor: '#DEE2E6', lineWidth: 1.5 });

      doc.font('Helvetica-Bold').fillColor('#495057').text('Période:', 60, yPos + 15);
      const dateFrom = donnees.dateFrom ? new Date(donnees.dateFrom).toLocaleDateString('fr-FR') : 'Toutes';
      const dateTo = donnees.dateTo ? new Date(donnees.dateTo).toLocaleDateString('fr-FR') : 'Toutes';
      doc.font('Helvetica').fillColor('#212529').text(`Du ${dateFrom} au ${dateTo}`, 130, yPos + 15);

      yPos += 60;

      // Fonction pour dessiner un tableau
      const drawTable = (title, items, total, color, startY) => {
        let currentY = startY;

        // Titre section
        doc.fontSize(14).font('Helvetica-Bold').fillColor(color).text(title, 50, currentY);
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text(`Total: ${total.toFixed(2)} DH`, 400, currentY, { align: 'right', width: 145 });
        currentY += 25;

        // En-tête tableau
        const colWidths = [70, 70, 180, 100, 75];
        const colHeaders = ['Date', 'N°', 'Rubrique', 'Employé', 'Montant'];
        const colX = [50, 120, 190, 370, 470];

        doc.rect(50, currentY, 495, 20).fill('#E0E0E0');
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');

        colHeaders.forEach((header, i) => {
          doc.text(header, colX[i] + 2, currentY + 6, {
            width: colWidths[i] - 4,
            align: i === 4 ? 'right' : 'left'
          });
        });

        currentY += 20;

        // Lignes
        items.forEach((item, index) => {
          if (currentY > 750) {
            doc.addPage();
            currentY = 50;
          }

          if (index % 2 === 0) doc.rect(50, currentY, 495, 18).fill('#F5F5F5');

          doc.fontSize(8).font('Helvetica').fillColor('#000');

          // Date
          const dateStr = item.date ? new Date(item.date).toLocaleDateString('fr-FR') : '-';
          doc.text(dateStr, colX[0] + 2, currentY + 5, { width: colWidths[0] - 4 });

          // N°
          doc.text(item.numero || '-', colX[1] + 2, currentY + 5, { width: colWidths[1] - 4 });

          // Rubrique
          doc.text((item.rubrique || '-').substring(0, 40), colX[2] + 2, currentY + 5, { width: colWidths[2] - 4 });

          // Employé
          doc.text((item.employe_nom_complet || '-').substring(0, 20), colX[3] + 2, currentY + 5, { width: colWidths[3] - 4 });

          // Montant
          const montant = (item.quantite || 0) * (item.montant || 0);
          doc.text(montant.toFixed(2), colX[4] + 2, currentY + 5, { width: colWidths[4] - 4, align: 'right' });

          currentY += 18;
        });

        return currentY + 30; // Marge après tableau
      };

      // === SECTION RECETTES ===
      if (donnees.recettes && donnees.recettes.length > 0) {
        yPos = drawTable('RECETTES', donnees.recettes, donnees.totalRecettes, '#28A745', yPos);
      } else {
        doc.fontSize(12).font('Helvetica-Oblique').fillColor('#666').text('Aucune recette trouvée.', 50, yPos);
        yPos += 40;
      }

      // === SECTION DÉPENSES ===
      if (yPos > 700) {
        doc.addPage();
        yPos = 50;
      }

      if (donnees.depenses && donnees.depenses.length > 0) {
        yPos = drawTable('DÉPENSES', donnees.depenses, donnees.totalDepenses, '#DC3545', yPos);
      } else {
        doc.fontSize(12).font('Helvetica-Oblique').fillColor('#666').text('Aucune dépense trouvée.', 50, yPos);
        yPos += 40;
      }

      // === FOOTER ===
      const pageRange = doc.bufferedPageRange();
      if (pageRange && pageRange.count > 0) {
        doc.switchToPage(0);
      }

      const footerY = 842 - 40 - 50;
      doc.rect(0, footerY, 595, 50).fill('#FFFFFF');
      doc.strokeColor('#000').lineWidth(1.5);
      doc.moveTo(50, footerY + 2).lineTo(545, footerY + 2).stroke();

      if (options.documentSociete && options.documentSociete.pied_page) {
        const piedPageText = htmlToPlainText(options.documentSociete.pied_page);
        doc.font('Helvetica').fontSize(7).fillColor('#000');
        doc.text(piedPageText, 50, footerY + 10, { width: 495, align: 'center' });
      } else {
        doc.font('Helvetica').fontSize(7).fillColor('#000');
        doc.text('SARL au capital 500 000.00 DHS - allée des orangers Derb Najat Rue 4 N°67 RDC Ain Sebaa Casablanca', 50, footerY + 10, { width: 495, align: 'center' });
        doc.text('Tel: 0522672135 - Fax 0522672143 - RC120431TP37951465 IF: 1680027 Email: info@lesbasculesmondial.com', 50, footerY + 20, { width: 495, align: 'center' });
        doc.text('RIB 007 780 000368400000157019 - CNSS: 6463814 ICE: 000079494000078', 50, footerY + 30, { width: 495, align: 'center' });
      }

      doc.end();

      stream.on('finish', () => resolve(filePath));
      stream.on('error', (error) => reject(error));

    } catch (error) {
      console.error('[genererRapportCaisseGroup2000_3000PDF] Erreur:', error);
      reject(error);
    }
  });
}

/**
 * Service dédié à la génération de PDF pour les INTERVENTIONS
 */

async function genererInterventionPDF(interventionId, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const PDFDocument = require('pdfkit');
      const { getConnection } = require('../config/database');
      const telegramService = require('./telegram.service'); // Importez le service Telegram

      // Récupérer les données complètes de l'intervention avec la requête fournie
      const sequelize = getConnection();
      const query = `
        SELECT
              i.date,
			  p.nom as client_nom ,
			  e.prenom+' '+e.nom as technicien_nom,
              e.telegram_id as employe_telegram_id,
              idt.quantite,
              idt.prix,
              idt.description as detail_description,
              r.nom AS rubrique_nom,
              (idt.quantite * idt.prix) AS total_ligne
            FROM intervention i
			inner join intervention_detail idt on i.id = idt.intervention_id
			inner join partenaire p on p.part_id = i.part_id
			inner join employe e on i.employe_id = e.id
            LEFT JOIN listes r ON r.id = idt.rubrique_id and r.group_id = 5000
            WHERE idt.intervention_id = :interventionId
            ORDER BY idt.ligne, idt.id
      `;

      const details = await sequelize.query(query, {
        replacements: { interventionId },
        type: sequelize.QueryTypes.SELECT
      });

      if (!details || details.length === 0) {
        return reject(new Error('Aucune donnée trouvée pour cette intervention'));
      }

      // Utiliser la première ligne pour les infos générales
      const firstRow = details[0];
      const interventionData = {
        id: interventionId,
        date: firstRow.date,
        client_nom: firstRow.client_nom,
        technicien_nom: firstRow.technicien_nom,
        employe_telegram_id: firstRow.employe_telegram_id, // Récupérer l'ID Telegram du technicien
        intervention_description: firstRow.intervention_description,
        details: details
      };

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const fileName = `fiche-deplacement-intervention-${interventionId}.pdf`;

      let buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', async () => {
        const pdfBuffer = Buffer.concat(buffers);
        
        // Gérer l'envoi Telegram ici
        if (interventionData.employe_telegram_id) {
          try {
            await telegramService.sendPdfToTechnician(interventionData.employe_telegram_id, pdfBuffer, fileName);
            console.log(`[genererInterventionPDF] PDF envoyé au technicien ${interventionData.technicien_nom} (${interventionData.employe_telegram_id}) via Telegram.`);
          } catch (telegramError) {
            console.error('[genererInterventionPDF] Erreur envoi Telegram:', telegramError);
          }
        }
        resolve(pdfBuffer);
      });

      // --- En-tête (Logo et infos entreprise) ---
      if (options.documentSociete && options.documentSociete.logo) {
        try {
          const logoPath = path.join(__dirname, '..', 'public', 'logo-bascule.jpg');
          if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 20, { width: 100 });
          doc.image(logoBuffer, 50, 20, { width: 100 });
        } catch (error) {
          console.warn('Erreur affichage logo personnalisé, utilisation du logo par défaut:', error);
          // Fallback au logo par défaut si besoin
        }
      }

      if (options.documentSociete && options.documentSociete.entete) {
        const enteteText = htmlToPlainText(options.documentSociete.entete);
        const enteteLines = enteteText.split('\n');
        let yPosEntete = 30;
        enteteLines.forEach(line => {
          if (line.trim()) {
            doc.fontSize(10).font('Helvetica-Bold').text(line.trim(), 160, yPosEntete);
            yPosEntete += 12;
          }
        });
      } else {
        doc.fontSize(11).fillColor('#046ba7').font('Helvetica-Bold').text('Balances et Bascules Pont Bascule Electronique', 160, 30);
        doc.font('Helvetica').fontSize(10)
          .text('Mecanique - Vente et Reparation - Entretien', 160, 45)
          .text('Etalonnage Logiciels de Gestion', 160, 58);
      }
      doc.rect(40, 100, 520, 1).fill('#000'); // Ligne de séparation

      // --- Titre ---
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#000').text('FICHE DE DÉPLACEMENT / INTERVENTION', 50, 120);

      // --- Informations Intervention ---
      let yPos = 170;
      doc.fontSize(10).font('Helvetica');

      // Cadre d'informations
      drawRoundedRectOutline(doc, 50, yPos, 495, 100, 8); // Ajusté la hauteur du cadre

      doc.font('Helvetica-Bold').text('N° Intervention:', 60, yPos + 10);
      doc.font('Helvetica').text(interventionData.id || 'N/A', 150, yPos + 10);

      doc.font('Helvetica-Bold').text('Date:', 60, yPos + 25);
      doc.font('Helvetica').text(interventionData.date ? new Date(interventionData.date).toLocaleDateString('fr-FR') : 'N/A', 150, yPos + 25);

      doc.font('Helvetica-Bold').text('Client:', 60, yPos + 40);
      doc.font('Helvetica').text(interventionData.client_nom || 'N/A', 150, yPos + 40);

      doc.font('Helvetica-Bold').text('Technicien:', 60, yPos + 55);
      doc.font('Helvetica').text(interventionData.technicien_nom || 'N/A', 150, yPos + 55);

      doc.font('Helvetica-Bold').text('Description:', 60, yPos + 70);
      doc.font('Helvetica').text(interventionData.intervention_description || 'N/A', 150, yPos + 70, { width: 350 });

      // --- Détails des rubriques ---
      yPos = 290;
      doc.fontSize(12).font('Helvetica-Bold').text('Détails des Prestations:', 50, yPos);
      yPos += 25;

      const tableTop = yPos;
      const tableWidth = 495;
      const colWidths = [200, 70, 75, 75, 75]; // Rubrique, Quantité, Prix Unitaire, Total HT, Taux TVA
      const colHeaders = ['Rubrique', 'Qté', 'Prix U.', 'Total HT'];
      const colX = [50, 250, 320, 395, 470]; // Positions X pour les colonnes

      // En-tête du tableau
      doc.rect(50, tableTop, tableWidth, 25).fill('#E0E0E0');
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
      colHeaders.forEach((header, i) => {
        let align = 'left';
        if (i > 0) align = 'center'; // Centré pour Qté, Prix U
        if (i === colHeaders.length - 1) align = 'right'; // Aligner à droite pour Total HT
        doc.text(header, colX[i], tableTop + 8, {
          width: colWidths[i],
          align: align
        });
      });

      let currentY = tableTop + 25;
      let totalGeneralHT = 0;
      const rowHeight = 20;
      const pageHeight = doc.page.height;
      const footerHeightActual = 50; // Espace nécessaire pour le footer (environ 3 lignes de texte à 7pt + espacements)
      const contentBottomLimit = pageHeight - footerHeightActual - 40; // Limite avant le footer + marge inférieure

      for (let i = 0; i < interventionData.details.length; i++) {
        const detail = interventionData.details[i];
        const quantite = detail.quantite || 0;
        const prix = detail.prix || 0;
        const totalLigne = quantite * prix;
        totalGeneralHT += totalLigne;

        // Vérifier si une nouvelle page est nécessaire avant d'ajouter la ligne
        if (currentY + rowHeight > contentBottomLimit) {
          doc.addPage();
          currentY = 50; // Position de départ sur la nouvelle page

          // Redessiner l'en-tête du tableau sur la nouvelle page
          doc.rect(50, currentY, tableWidth, 25).fill('#E0E0E0');
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
          colHeaders.forEach((header, idx) => {
            let align = 'left';
            if (idx > 0) align = 'center';
            if (idx === colHeaders.length - 1) align = 'right';
            doc.text(header, colX[idx], currentY + 8, {
              width: colWidths[idx],
              align: align
            });
          });
          currentY += 25;
        }

        // Contenu des lignes
        if (i % 2 === 0) {
          doc.rect(50, currentY, tableWidth, rowHeight).fill('#F5F5F5');
        }
        doc.fontSize(9).font('Helvetica').fillColor('#000');

        doc.text(detail.rubrique_nom || 'N/A', colX[0], currentY + 6, { width: colWidths[0], align: 'left' });
        doc.text(quantite.toFixed(2), colX[1], currentY + 6, { width: colWidths[1], align: 'center' });
        doc.text(prix.toFixed(2), colX[2], currentY + 6, { width: colWidths[2], align: 'center' });
        doc.text(totalLigne.toFixed(2), colX[3], currentY + 6, { width: colWidths[3], align: 'right' });

        currentY += rowHeight;
      }

      // Ligne de total général HT
      currentY += 10;
      // Vérifier pour le total aussi si ça dépasse la limite du contenu
      if (currentY + rowHeight > contentBottomLimit) {
        doc.addPage();
        currentY = 50;
      }
      doc.rect(50, currentY, tableWidth, 25).fill('#D0D0D0');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000');
      doc.text('TOTAL GÉNÉRAL HT:', colX[0], currentY + 8, { width: colWidths[0], align: 'left' });
      doc.text(totalGeneralHT.toFixed(2) + ' DH', colX[3], currentY + 8, { width: colWidths[3] + colWidths[4], align: 'right' }); // Ajuster la largeur pour inclure TVA si nécessaire

      currentY += 35; // Espace après le total

      // --- Pied de page (sera dessiné une seule fois à la fin du document) ---
      const drawFooter = () => {
        const pageHeight = doc.page.height;
        const bottomMargin = 40;
        const footerHeight = 50; // Hauteur réservée au footer
        const footerY = pageHeight - bottomMargin - footerHeight;

        doc.rect(0, footerY, doc.page.width, footerHeight).fill('#FFFFFF'); // Fond blanc pour le footer
        doc.strokeColor('#000').lineWidth(1.5);
        doc.moveTo(50, footerY + 2).lineTo(545, footerY + 2).stroke(); // Ligne de séparation

        doc.font('Helvetica').fontSize(7).fillColor('#000');
        if (options.documentSociete && options.documentSociete.pied_page) {
          const piedPageText = htmlToPlainText(options.documentSociete.pied_page);
          doc.text(piedPageText, 50, footerY + 10, { width: 495, align: 'center' });
        } else {
          doc.text('SARL au capital 500 000.00 DHS - allée des orangers Derb Najat Rue 4 N°67 RDC Ain Sebaa Casablanca', 50, footerY + 10, { width: 495, align: 'center' });
          doc.text('Tel: 0522672135 - Fax 0522672143 - RC120431TP37951465 IF: 1680027 Email: info@lesbasculesmondial.com', 50, footerY + 20, { width: 495, align: 'center' });
          doc.text('RIB 007 780 000368400000157019 - CNSS: 6463814 ICE: 000079494000078', 50, footerY + 30, { width: 495, align: 'center' });
        }
      };

      // Attacher le dessin du footer à l'événement 'end' du document
      doc.on('end', () => {
        drawFooter();
      });

      doc.end();

    } catch (error) {
      console.error('[genererInterventionPDF] Erreur dans la génération du PDF:', error);
      console.error('[genererInterventionPDF] Stack:', error.stack);
      reject(error);
    }
  });
}

module.exports = {
  genererCaissePDF,
  genererRapportCaissePDF,
  genererRapportCaissePDFByEmploye,
  genererCaissePDFByEmploye,
  genererBonDeCaissePDF,
  genererRapportCaisseGroup2000_3000PDF,
  genererInterventionPDF,
  htmlToPlainText // Exportez la fonction si elle est utilisée ailleurs
};
