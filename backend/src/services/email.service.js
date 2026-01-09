const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { getEmailDataByDocumentId } = require('../models/email.model');


function stripHtmlTags(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function htmlToPlainText(html) {
  if (!html) return '';

  let text = html;

  // Remplace les sauts de ligne HTML
  text = text.replace(/<\s*br\s*\/?>/gi, '\n');
  text = text.replace(/<\s*p[^>]*>/gi, '\n');
  text = text.replace(/<\s*\/p\s*>/gi, '\n');

  // Gras, italique, souligné (en pseudo-notation)
  text = text.replace(/<\s*(strong|b)[^>]*>(.*?)<\s*\/\1\s*>/gi, (_, __, inner) => `**${inner}**`);
  text = text.replace(/<\s*(em|i)[^>]*>(.*?)<\s*\/\1\s*>/gi, (_, __, inner) => `_${inner}_`);
  text = text.replace(/<\s*u[^>]*>(.*?)<\s*\/u\s*>/gi, (_, inner) => `__${inner}__`);

  // Supprime toutes les autres balises HTML
  text = text.replace(/<[^>]+>/g, '');

  // Supprime les espaces multiples (mais préserve les sauts de ligne) et nettoie
  text = text.replace(/[ \t]+/g, ' ').trim();

  return text;
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


class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      // Options pour gérer les timeouts et les erreurs réseau
      connectionTimeout: 60000, // 60 secondes pour la connexion
      greetingTimeout: 30000, // 30 secondes pour le greeting
      socketTimeout: 60000, // 60 secondes pour les opérations socket
      // Retry logic
      pool: true,
      maxConnections: 1,
      maxMessages: 3,
      // DNS options
      dns: {
        timeout: 10000, // 10 secondes pour la résolution DNS
        tries: 3 // 3 tentatives pour la résolution DNS
      }
    });
  }

  // 🧾 Génère un PDF professionnel du devis
  async genererPDF(devisData, options = {}) {
    console.log('[EmailService] 📄 Début genererPDF');
    if (!devisData || devisData.length === 0) {
      console.error('[EmailService] ❌ devisData est vide ou indéfini');
      throw new Error('Données du document manquantes pour la génération du PDF');
    }
    return new Promise(async (resolve, reject) => {
      try {
        // === MODE D'IMPRESSION (NORMAL / NOMENCLATURE) ===
        // printMode = 'normal' (par défaut) -> comportement existant
        // printMode = 'nomenclature' -> PDF basé sur le même modèle, mais avec 1 seule ligne "article composé"
        const printMode = (options.printMode || 'normal').toLowerCase();

        // === EXONÉRATION TVA (DEVIS + BON DE LIVRAISON) ===
        let isClientExonerated = false;
        const part_id = devisData?.[0]?.part_id;
        const documentType0 = devisData?.[0]?.type;
        const documentKind0 = devisData?.[0]?.document_kind;
        const isRetour0 = documentKind0 === 'RETOUR CLIENT' || documentType0 === 5;
        const isLivraison0 = documentKind0 === 'LIVRAISON' || documentType0 === 2;
        const isDevis0 = !isRetour0 && !isLivraison0;

        // === Impression NOMENCLATURE (DEVIS uniquement, sans popup côté UI) ===
        // On garde exactement le même template, mais on remplace les lignes par une seule ligne basée sur l'article composé.
        if (printMode === 'nomenclature' && isDevis0) {
          const sequelizeConn = options.sequelize || require('../config/database');
          const compose = options.composeArticle || {};
          let composeId = compose.article_id ? parseInt(compose.article_id, 10) : null;
          let nomLines = [];

          // Auto-détection: trouver le Compose_id le plus probable à partir des lignes composants du devis
          if (!composeId) {
            const componentIds = Array.from(new Set((devisData || [])
              .map(l => l.article_id)
              .filter(id => id !== null && id !== undefined)
              .map(id => parseInt(id, 10))
              .filter(id => !isNaN(id))));

            if (componentIds.length > 0) {
              const candidates = await sequelizeConn.query(
                `
                  SELECT TOP 1
                    n.Compose_id,
                    SUM(CASE WHEN n.Composant_id IN (:componentIds) THEN 1 ELSE 0 END) AS present_count,
                    COUNT(*) AS total_count
                  FROM article_Nomenclature n
                  GROUP BY n.Compose_id
                  ORDER BY
                    CASE WHEN SUM(CASE WHEN n.Composant_id IN (:componentIds) THEN 1 ELSE 0 END) = COUNT(*) THEN 0 ELSE 1 END,
                    SUM(CASE WHEN n.Composant_id IN (:componentIds) THEN 1 ELSE 0 END) DESC,
                    COUNT(*) ASC
                `,
                {
                  replacements: { componentIds },
                  type: sequelizeConn.QueryTypes.SELECT
                }
              );
              if (candidates && candidates.length > 0) {
                composeId = parseInt(candidates[0].Compose_id, 10);
              }
            }
          }

          // Charger les infos de l'article composé
          let composeArticleDb = null;
          if (composeId) {
            const rows = await sequelizeConn.query(
              `
                SELECT TOP 1 article_id, article_cod, article_nom, prix_vente, quill_editor, quantite
                FROM article
                WHERE article_id = :composeId
              `,
              {
                replacements: { composeId },
                type: sequelizeConn.QueryTypes.SELECT
              }
            );
            composeArticleDb = rows?.[0] || null;
          }

          // ============================================================
          // MODIFICATION: Récupérer les composants avec leurs quantités
          // ============================================================
          let composantsData = [];
          if (composeId) {
            composantsData = await sequelizeConn.query(
              `
                SELECT 
                  n.Composant_id,
                  n.Quantite AS composant_qte,
                  a.article_cod AS composant_cod,
                  a.article_nom AS composant_nom
                FROM article_Nomenclature n
                LEFT JOIN article a ON a.article_id = n.Composant_id
                WHERE n.Compose_id = :composeId
                ORDER BY a.article_nom ASC
              `,
              {
                replacements: { composeId },
                type: sequelizeConn.QueryTypes.SELECT
              }
            );
            console.log('[PDF Nomenclature] Composants récupérés:', composantsData.length);
          }

          // ============================================================
          // PRIX: Priorité au prix du composé depuis le devis (edit-devis)
          // ============================================================
          const composePrix = !isNaN(Number(compose.prix)) && Number(compose.prix) > 0
            ? Number(compose.prix)
            : (!isNaN(Number(composeArticleDb?.prix_vente)) ? Number(composeArticleDb?.prix_vente) : 0);

          // Quantité du composé depuis le devis
          const composeQte = !isNaN(Number(compose.quantite)) && Number(compose.quantite) > 0
            ? Number(compose.quantite)
            : (!isNaN(Number(composeArticleDb?.quantite)) && Number(composeArticleDb?.quantite) > 0
              ? Number(composeArticleDb?.quantite)
              : 1);

          const composeNom = compose.article_nom || composeArticleDb?.article_nom || '';
          const composeCod = compose.article_cod || composeArticleDb?.article_cod || '';

          const base = devisData[0] || {};
          const tauxTva = isNaN(Number(base.taux_tva)) ? 0.2 : Number(base.taux_tva);
          const ht = composePrix * composeQte;

          // ============================================================
          // DÉSIGNATION: Construire avec les composants et leurs quantités
          // ============================================================
          let designationHtml = '';
          
          // Titre du composé
          designationHtml = `<h3 style="color: #046ba7;"><strong>Composé</strong></h3>`;
          designationHtml += `<p><strong>- ${composeNom}</strong></p>`;
          
          // Ajouter la section Composants avec quantités
          if (composantsData && composantsData.length > 0) {
            designationHtml += `<h3 style="color: #046ba7;"><strong>Composants</strong></h3>`;
            designationHtml += '<ul>';
            composantsData.forEach((comp) => {
              const qte = !isNaN(Number(comp.composant_qte)) ? Number(comp.composant_qte) : 1;
              const nom = comp.composant_nom || comp.composant_cod || 'Composant';
              const cod = comp.composant_cod || '';
              // Afficher: Code - Nom (Qté: X)
              designationHtml += `<li><strong style="color: #c00000;">${cod}</strong> - ${nom} <span style="color: #7030a0;">(Qté: ${qte})</span></li>`;
            });
            designationHtml += '</ul>';
          }
          
          console.log('[EmailService][PDF Nomenclature] Désignation construite:', {
            composeId,
            composeNom,
            composantsCount: composantsData.length,
            designationLength: designationHtml.length,
            designationPreview: designationHtml.substring(0, 200)
          });

          devisData = [{
            ...base,
            article_id: composeId || null,
            article_cod: composeCod,
            article_nom: composeNom,
            designation: designationHtml,
            article: designationHtml,
            prix: composePrix,
            quantite: composeQte,
            remise: ht,
            taux_tva: tauxTva,
            ligne_id: null
          }];
        }

        if (part_id && (isDevis0 || isLivraison0)) {
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
            console.log('[EmailService] 📋 Exonération TVA:', {
              isClientExonerated: isClientExonerated ? 'Oui' : 'Non',
              document_kind: documentKind0,
              type: documentType0
            });
          } catch (e) {
            console.warn('[EmailService] ⚠️ Erreur vérification exonération TVA:', e);
            isClientExonerated = false;
          }
        }

        // Détecter le type de document
        const documentType = devisData[0]?.type;
        const documentKind = devisData[0]?.document_kind;

        let saveDir = path.join(__dirname, '..', 'public', 'devis');
        let documentTitle = 'DEVIS';
        let headerLabel = 'Devis N°';

        // 1. Vérifier si c'est un RETOUR CLIENT
        const isRetour = documentKind === 'RETOUR CLIENT' || documentType === 5;
        const isLivraison = documentKind === 'LIVRAISON' || documentType === 2;
        const isDevis = !isRetour && !isLivraison;

        if (isRetour) {
          saveDir = path.join(__dirname, '..', 'public', 'retours');
          documentTitle = 'BON DE RETOUR';
          headerLabel = 'Retour N°';
        }
        // 2. Vérifier si c'est une LIVRAISON
        else if (isLivraison) {
          saveDir = path.join(__dirname, '..', 'public', 'livraisons');
          documentTitle = 'BON DE LIVRAISON';
          headerLabel = 'Livraison N°';
        }
        // 3. Par défaut c'est un DEVIS (ou COMMANDE si détecté plus tard, mais ici on initialise)
        else {
          documentTitle = 'DEVIS';
          headerLabel = 'Devis N°';
          saveDir = path.join(__dirname, '..', 'public', 'devis');
        }

        if (!fs.existsSync(saveDir)) {
          fs.mkdirSync(saveDir, { recursive: true });
        }

        // Créer un nom de fichier avec le numéro du document et le nom du client
        const numeroDoc = devisData && devisData[0] && devisData[0].numero ? devisData[0].numero : documentTitle;
        const nomClient = devisData && devisData[0] && devisData[0].client ? devisData[0].client : 'CLIENT';

        // Nettoyer le nom du client pour qu'il soit valide comme nom de fichier
        const nomClientNettoye = nomClient
          .toString()
          .trim()
          .replace(/[^a-zA-Z0-9\s\-_]/g, '')
          .replace(/\s+/g, '_')
          .substring(0, 50);

        // Créer le nom de fichier : numero-client_nom.pdf
        const fileName = `${numeroDoc}_${nomClientNettoye}.pdf`;
        const pdfPath = path.join(saveDir, fileName);

        // Stocker les variables pour utilisation dans le reste de la fonction
        const docTitle = documentTitle;
        const headerText = headerLabel;

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const writeStream = fs.createWriteStream(pdfPath);

        // 🧩 Gestion fiable des événements
        writeStream.on('finish', () => {
          console.log(`✅ PDF enregistré : ${pdfPath}`);
          resolve(pdfPath);
        });
        writeStream.on('error', (err) => {
          console.error('❌ Erreur écriture PDF :', err);
          reject(err);
        });

        doc.pipe(writeStream);

        // === CONSTANTES POUR LA PAGINATION ===
        const tableBorderRadius = 5;
        const articlesTableHeaderHeight = 20;
        const maxYBeforeNewPage = 700; // Position Y maximale avant de passer à une nouvelle page
        const pageHeight = 842; // Hauteur A4 en points

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
          doc.fontSize(20).font('Helvetica-Bold').fillColor('#000').text(docTitle, 50, 120);

          // Bloc client
          const clientTop = 110;
          const clientBoxWidth = 260;
          const clientBoxHeight = 60;
          const clientBoxX = 300;

          doc.roundedRect(clientBoxX, clientTop, clientBoxWidth, clientBoxHeight, tableBorderRadius).stroke('#000');
          doc.fontSize(10).font('Helvetica').fillColor('#000');
          doc.text(`Client : ${devisData[0].client}`, clientBoxX + 10, clientTop + 10);
          doc.text(`Adresse : ${devisData[0].adresse || ''}`, clientBoxX + 10, clientTop + 28);
          doc.text(`${devisData[0].ville || ''}`, clientBoxX + 10, clientTop + 46);

          // Tableau d'info (Numéro, Date, Réf) - uniquement sur la première page
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
            doc.text(headerText, 55, infoTableY + 8, { width: 180, align: 'center' });
            doc.text('Date', 235, infoTableY + 8, { width: 180, align: 'center' });
            doc.text('Vos Réf', 415, infoTableY + 8, { width: 145, align: 'center' });

            doc.font('Helvetica').fontSize(9);
            doc.text(`${devisData[0].numero}`, 55, infoTableY + infoTableHeaderHeight + 6, { width: 180, align: 'center' });
            doc.text(`${new Date(devisData[0].date).toLocaleDateString('fr-FR')}`, 235, infoTableY + infoTableHeaderHeight + 6, { width: 180, align: 'center' });
            doc.text(`${devisData[0].client_ref || ''}`, 415, infoTableY + infoTableHeaderHeight + 6, { width: 145, align: 'center' });

            return infoTableY + infoTableTotalHeight + 10;
          } else {
            // Pages suivantes : retourner position après l'en-tête client
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

        // === FONCTION: Dessiner le pied de page (appelée sur CHAQUE page) ===
        const drawPageFooter = () => {
          const footerBgColor = '#E8F4F8';
          const footerPageHeight = 842;
          const bottomMargin = 40;
          const footerHeight = 32;
          const footerY = footerPageHeight - bottomMargin - footerHeight;
          const footerLineSpacing = 5;
          const footerStartY = footerY + 2;

          // Fond du pied de page
          doc.save();
          doc.rect(0, footerY, 595, footerHeight).fill(footerBgColor);
          doc.restore();

          // Contenu du pied de page
          if (options.documentSociete && options.documentSociete.pied_page) {
            const piedPageText = htmlToPlainText(options.documentSociete.pied_page);
            doc.font('Helvetica').fontSize(7).fillColor('#000');
            doc.text(piedPageText, 50, footerStartY, { width: 495, align: 'center', lineBreak: false });
          } else {
            // Pied de page par défaut
            doc.font('Helvetica').fontSize(7).fillColor('#000');
            doc.text(
              'SARL au capital 500 000.00 DHS - N 67 Rue 04 Lotissement Najat Residence Kanza RDC Ain Sebaa-Casablanca',
              50, footerStartY, { width: 495, align: 'center', lineBreak: false }
            );
            doc.text(
              'Tel : 0522672135 - Fax 0522672143 - RC: 703691 - IF : 68642896 Email : info@lesbasculesmondial.com',
              50, footerStartY + footerLineSpacing * 2, { width: 495, align: 'center', lineBreak: false }
            );
            doc.text(
              'RIB 007 780 000368400000157019 - CNSS : 6463814 ICE : 003801680000040',
              50, footerStartY + (footerLineSpacing * 4), { width: 495, align: 'center', lineBreak: false }
            );
          }
        };

        // === DESSINER L'EN-TÊTE DE LA PREMIÈRE PAGE ===
        let y = drawDocumentHeader(true);
        y = drawTableHeader(y);
        const tableStartY = y;

        // Positions des colonnes (utilisées dans la boucle de rendu des lignes)
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
        const colHTMargin = 5;

        doc.font('Helvetica').fillColor('#000').stroke('#000');
        let totalHT = 0, totalTVA = 0, totalTTC = 0, totalReduction = 0;

        // Helper: simple HTML inline renderer for basic tags (b/i/span color)
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

          // Structure pour stocker les lignes avec leurs segments de texte stylisés
          const lines = [];

          // Fonction pour parser le HTML et extraire les segments de texte avec leurs styles
          function parseHtmlSegments(htmlStr) {
            const segments = [];
            let workingHtml = String(htmlStr || '');
            const processedRanges = [];

            // Trouver tous les éléments structurés dans l'ordre d'apparition
            const allMatches = [];
            
            // Trouver tous les titres
            let hMatch;
            const hRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
            while ((hMatch = hRegex.exec(workingHtml)) !== null) {
              allMatches.push({
                index: hMatch.index,
                length: hMatch[0].length,
                type: 'heading',
                level: hMatch[1],
                content: hMatch[2],
                fullMatch: hMatch[0]
              });
            }
            
            // Trouver toutes les listes
            let ulMatch;
            const ulRegex = /<ul[^>]*>([\s\S]*?)<\/ul>/gi;
            while ((ulMatch = ulRegex.exec(workingHtml)) !== null) {
              allMatches.push({
                index: ulMatch.index,
                length: ulMatch[0].length,
                type: 'list',
                content: ulMatch[1],
                fullMatch: ulMatch[0]
              });
            }
            
            // Trouver tous les paragraphes
            let pMatch;
            const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
            while ((pMatch = pRegex.exec(workingHtml)) !== null) {
              allMatches.push({
                index: pMatch.index,
                length: pMatch[0].length,
                type: 'paragraph',
                content: pMatch[1],
                fullMatch: pMatch[0]
              });
            }
            
            // Trier par index pour traiter dans l'ordre d'apparition
            allMatches.sort((a, b) => a.index - b.index);
            
            // Traiter chaque élément dans l'ordre
            let lastProcessedEnd = 0;
            allMatches.forEach((match) => {
              // Traiter le texte entre les éléments
              if (match.index > lastProcessedEnd) {
                const textBetween = workingHtml.substring(lastProcessedEnd, match.index);
                const textWithoutTags = textBetween.replace(/<[^>]+>/g, '').trim();
                if (textWithoutTags.length > 0) {
                  const contentSegments = parseInlineHtml(textBetween);
                  if (contentSegments.length > 0) {
                    segments.push({ type: 'paragraph', segments: contentSegments });
                  }
                }
              }
              
              // Traiter l'élément structuré
              if (match.type === 'heading') {
                const contentSegments = parseInlineHtml(match.content);
                if (contentSegments.length > 0) {
                  segments.push({ type: 'heading', segments: contentSegments, bold: true });
                }
              } else if (match.type === 'list') {
                // Utiliser une regex globale pour trouver tous les <li>...</li>
                const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
                let liMatch;
                while ((liMatch = liRegex.exec(match.content)) !== null) {
                  const liContent = liMatch[1];
                  if (liContent && liContent.trim()) {
                    const contentSegments = parseInlineHtml(liContent);
                    if (contentSegments.length > 0) {
                      segments.push({ type: 'listitem', segments: contentSegments, prefix: '  • ' });
                    }
                  }
                }
              } else if (match.type === 'paragraph') {
                const contentSegments = parseInlineHtml(match.content);
                if (contentSegments.length > 0) {
                  segments.push({ type: 'paragraph', segments: contentSegments });
                }
              }
              
              lastProcessedEnd = match.index + match.length;
            });
            
            // Traiter le texte après le dernier élément
            if (lastProcessedEnd < workingHtml.length) {
              const textAfter = workingHtml.substring(lastProcessedEnd);
              const textWithoutTags = textAfter.replace(/<[^>]+>/g, '').trim();
              if (textWithoutTags.length > 0) {
                const contentSegments = parseInlineHtml(textAfter);
                if (contentSegments.length > 0) {
                  segments.push({ type: 'paragraph', segments: contentSegments });
                }
              }
            }

            return segments;
          }

          // Fonction pour parser le HTML inline et extraire les segments avec styles
          function parseInlineHtml(htmlContent) {
            const result = [];
            const tokens = String(htmlContent || '').split(/(<[^>]+>)/g).filter(t => t !== '');
            let currentText = '';
            let currentState = { bold: false, italic: false, color: '#000000' };

            tokens.forEach((tok) => {
              if (typeof tok !== 'string') return;

              if (tok.startsWith('<')) {
                const tag = String(tok).toLowerCase();
                
                // Si on a du texte accumulé, l'ajouter avant de changer l'état
                if (currentText.trim()) {
                  result.push({ text: currentText.trim(), bold: currentState.bold, italic: currentState.italic, color: currentState.color });
                  currentText = '';
                }

                // Gérer les balises de style
                if (tag.startsWith('<strong') || tag.startsWith('<b')) {
                  currentState.bold = true;
                  // Extraire la couleur du style si présente dans <strong>
                  const colorMatch = tag.match(/style=["'][^"']*color\s*:\s*([^;"']+)/i);
                  if (colorMatch && colorMatch[1]) {
                    try {
                      currentState.color = parseColor(colorMatch[1].trim());
                    } catch (e) {
                      currentState.color = '#000000';
                    }
                  }
                } else if (tag.startsWith('</strong') || tag.startsWith('</b')) {
                  currentState.bold = false;
                  // Réinitialiser la couleur si elle était définie dans <strong>
                  currentState.color = '#000000';
                } else if (tag.startsWith('<em') || tag.startsWith('<i')) {
                  currentState.italic = true;
                } else if (tag.startsWith('</em') || tag.startsWith('</i')) {
                  currentState.italic = false;
                } else if (tag.startsWith('<span')) {
                  // Extraire la couleur du style
                  const colorMatch = tag.match(/style=["'][^"']*color\s*:\s*([^;"']+)/i);
                  if (colorMatch && colorMatch[1]) {
                    try {
                      currentState.color = parseColor(colorMatch[1].trim());
                    } catch (e) {
                      currentState.color = '#000000';
                    }
                  }
                } else if (tag.startsWith('</span')) {
                  currentState.color = '#000000';
                } else if (tag === '<br>' || tag.startsWith('<br')) {
                  // Saut de ligne: ajouter le texte actuel et créer une nouvelle ligne
                  if (currentText.trim()) {
                    result.push({ text: currentText.trim(), bold: currentState.bold, italic: currentState.italic, color: currentState.color });
                    currentText = '';
                  }
                  result.push({ text: '\n', bold: false, italic: false, color: '#000000' });
                }
                return;
              }

              // Ajouter le texte
              currentText += String(tok);
            });

            // Ajouter le texte restant
            if (currentText.trim()) {
              result.push({ text: currentText.trim(), bold: currentState.bold, italic: currentState.italic, color: currentState.color });
            }

            return result;
          }

          // Parser le HTML complet
          const htmlSegments = parseHtmlSegments(html);

          // Convertir en lignes pour le rendu
          htmlSegments.forEach((block) => {
            if (block.type === 'heading') {
              // Titre: tous les segments en gras
              const lineText = block.segments.map(s => s.text).join(' ');
              if (lineText.trim()) {
                lines.push({ text: lineText.trim(), bold: true, italic: false, color: '#000000' });
              }
            } else if (block.type === 'listitem') {
              // Élément de liste: préfixe + segments avec leurs styles
              const prefix = block.prefix || '';
              // Pour les listes, on doit rendre chaque segment avec son style
              lines.push({ type: 'listitem', prefix: prefix, segments: block.segments });
            } else if (block.type === 'paragraph') {
              // Paragraphe: préserver les segments avec leurs styles (couleur, gras, etc.)
              if (block.segments && block.segments.length > 0) {
                lines.push({ type: 'text', segments: block.segments });
              }
            } else {
              // Texte: segments avec leurs styles
              if (block.segments && block.segments.length > 0) {
                lines.push({ type: 'text', segments: block.segments });
              }
            }
          });

          // Rendre dans le PDF
          doc.save();

          const padding = 8;
          const drawX = x + padding;
          const drawY = y + padding;
          const drawWidth = width - (padding * 2);
          const baseLineHeight = 12; // Hauteur de base pour une ligne

          if (maxHeight) doc.rect(x, y, width, maxHeight).clip();

          let currentY = drawY;

          // Fonction pour calculer la hauteur réelle d'un texte
          function calculateTextHeight(text, availableWidth, fontSize = 9) {
            try {
              const currentFont = doc._font;
              doc.fontSize(fontSize);
              const height = doc.heightOfString(text, { width: availableWidth, align: 'left' });
              if (currentFont) doc.font(currentFont);
              return Math.max(height, baseLineHeight);
            } catch (e) {
              return baseLineHeight;
            }
          }

          // Fonction pour obtenir la position Y réelle après un rendu
          function getActualY() {
            return doc.y || currentY;
          }

          lines.forEach((line, idx) => {
            // Note: Le clipping gère visuellement les dépassements
            // La pagination pour les contenus longs est gérée au niveau supérieur (mode nomenclature)
            try {
              if (line.type === 'listitem' && line.segments) {
                // Rendre une liste avec segments stylisés
                // Construire le texte complet pour calculer la hauteur
                let fullLineText = '';
                line.segments.forEach((segment) => {
                  if (segment.text !== '\n' && segment.text && segment.text.trim()) {
                    fullLineText += segment.text + ' ';
                  }
                });

                const prefixText = line.prefix || '';
                const prefixWidth = doc.widthOfString(prefixText, { fontSize: 9 });
                const contentWidth = drawWidth - prefixWidth;
                
                // Calculer la hauteur totale de cette ligne (préfixe + contenu)
                const prefixHeight = calculateTextHeight(prefixText, drawWidth);
                const contentHeight = calculateTextHeight(fullLineText.trim(), contentWidth);
                const lineHeight = Math.max(prefixHeight, contentHeight);

                // Rendre le préfixe
                setFont(doc, false, false);
                doc.fontSize(9);
                doc.fillColor('#000000');
                doc.text(prefixText, drawX, currentY, { width: drawWidth, align: 'left' });

                // Rendre chaque segment avec son style
                let segmentX = drawX + prefixWidth;
                let segmentY = currentY;
                let currentLineY = currentY;
                let currentLineHeight = lineHeight;

                line.segments.forEach((segment) => {
                  if (segment.text === '\n') {
                    // Saut de ligne explicite: passer à la ligne suivante
                    currentY += currentLineHeight;
                    segmentX = drawX + prefixWidth;
                    segmentY = currentY;
                    currentLineY = currentY;
                    currentLineHeight = baseLineHeight;
                    return;
                  }

                  if (!segment.text || !segment.text.trim()) return;

                  setFont(doc, segment.bold, segment.italic);
                  doc.fontSize(9);
                  doc.fillColor(segment.color);

                  // Utiliser la largeur totale disponible pour le contenu (drawWidth moins le préfixe)
                  // Le texte reviendra automatiquement à la ligne dans cette largeur
                  const totalContentWidth = drawWidth - prefixWidth;
                  
                  // Vérifier si on est au début d'une nouvelle ligne
                  const relativeX = segmentX - (drawX + prefixWidth);
                  if (relativeX <= 0 || relativeX >= totalContentWidth) {
                    // Nouvelle ligne si on dépasse ou si on est au début
                    currentY += currentLineHeight;
                    segmentX = drawX + prefixWidth;
                    segmentY = currentY;
                    currentLineY = currentY;
                    currentLineHeight = baseLineHeight;
                  }

                  // Rendre le segment avec la largeur totale disponible (le texte reviendra automatiquement à la ligne)
                  const yBefore = segmentY;
                  doc.text(segment.text, segmentX, segmentY, { width: totalContentWidth, align: 'left' });
                  
                  // Vérifier la position Y réelle après le rendu (pour détecter les retours à la ligne automatiques)
                  const yAfter = getActualY();
                  const actualHeight = yAfter - yBefore;
                  
                  if (actualHeight > 0) {
                    // Le texte est revenu à la ligne automatiquement
                    currentLineHeight = Math.max(currentLineHeight, actualHeight);
                    segmentY = yAfter;
                    segmentX = drawX + prefixWidth; // Réinitialiser X pour la nouvelle ligne
                  } else {
                    // Le texte tient sur une seule ligne
                    const segmentWidth = doc.widthOfString(segment.text, { fontSize: 9 });
                    const renderedHeight = calculateTextHeight(segment.text, totalContentWidth);
                    currentLineHeight = Math.max(currentLineHeight, renderedHeight);
                    
                    // Mettre à jour la position X (mais ne pas dépasser la largeur disponible)
                    const newSegmentX = segmentX + Math.min(segmentWidth, totalContentWidth);
                    segmentX = Math.min(newSegmentX, drawX + prefixWidth + totalContentWidth);
                  }
                });

                // Passer à la ligne suivante après avoir rendu tous les segments
                currentY += currentLineHeight;
              } else if (line.type === 'text' && line.segments) {
                // Rendre du texte avec segments stylisés
                let segmentX = drawX;
                let segmentY = currentY;
                let currentLineY = currentY;
                let currentLineHeight = baseLineHeight;

                line.segments.forEach((segment) => {
                  if (segment.text === '\n') {
                    // Saut de ligne explicite
                    currentY += currentLineHeight;
                    segmentX = drawX;
                    segmentY = currentY;
                    currentLineY = currentY;
                    currentLineHeight = baseLineHeight;
                    return;
                  }

                  if (!segment.text || !segment.text.trim()) return;

                  setFont(doc, segment.bold, segment.italic);
                  doc.fontSize(9);
                  doc.fillColor(segment.color);

                  // Utiliser la largeur totale disponible (drawWidth)
                  // Le texte reviendra automatiquement à la ligne dans cette largeur
                  const totalContentWidth = drawWidth;
                  
                  // Vérifier si on est au début d'une nouvelle ligne
                  const relativeX = segmentX - drawX;
                  if (relativeX <= 0 || relativeX >= totalContentWidth) {
                    // Nouvelle ligne si on dépasse ou si on est au début
                    currentY += currentLineHeight;
                    segmentX = drawX;
                    segmentY = currentY;
                    currentLineY = currentY;
                    currentLineHeight = baseLineHeight;
                  }

                  // Rendre le segment avec la largeur totale disponible (le texte reviendra automatiquement à la ligne)
                  const yBefore = segmentY;
                  doc.text(segment.text, segmentX, segmentY, { width: totalContentWidth, align: 'left' });
                  
                  // Vérifier la position Y réelle après le rendu (pour détecter les retours à la ligne automatiques)
                  const yAfter = getActualY();
                  const actualHeight = yAfter - yBefore;
                  
                  if (actualHeight > 0) {
                    // Le texte est revenu à la ligne automatiquement
                    currentLineHeight = Math.max(currentLineHeight, actualHeight);
                    segmentY = yAfter;
                    segmentX = drawX; // Réinitialiser X pour la nouvelle ligne
                  } else {
                    // Le texte tient sur une seule ligne
                    const segmentWidth = doc.widthOfString(segment.text, { fontSize: 9 });
                    const renderedHeight = calculateTextHeight(segment.text, totalContentWidth);
                    currentLineHeight = Math.max(currentLineHeight, renderedHeight);
                    
                    // Mettre à jour la position X (mais ne pas dépasser la largeur disponible)
                    const newSegmentX = segmentX + Math.min(segmentWidth, totalContentWidth);
                    segmentX = Math.min(newSegmentX, drawX + totalContentWidth);
                  }
                });

                // Passer à la ligne suivante après avoir rendu tous les segments
                currentY += currentLineHeight;
              } else {
                // Ligne simple avec texte uniforme
                setFont(doc, line.bold || false, line.italic || false);
                doc.fontSize(9);
                doc.fillColor(line.color || '#000000');

                // Calculer la hauteur réelle du texte
                const textHeight = calculateTextHeight(line.text, drawWidth);

                // Rendre le texte
                doc.text(line.text, drawX, currentY, { width: drawWidth, align: 'left' });
                
                // Mettre à jour Y avec la hauteur réelle
                currentY += textHeight;
              }
            } catch (e) {
              console.error('[EmailService] Error rendering line:', e.message, line);
              currentY += baseLineHeight;
            }
          });

          doc.restore();
        }

        if (devisData && devisData.length > 0) {
          devisData.forEach(line => {
            const ref = line.article_cod || '';
            const designationHtml = line.article || '';
            const pu = isNaN(Number(line.prix)) ? 0 : Number(line.prix);
            const qte = isNaN(Number(line.quantite)) ? 0 : Number(line.quantite);
            // Dans le SQL, 'remise' contient déjà le HT après remise
            const htAfterRemise = isNaN(Number(line.remise)) ? 0 : Number(line.remise);
            const taux_tva = isNaN(Number(line.taux_tva)) ? 0 : Number(line.taux_tva);

            // Calculer le montant de la remise
            const totalAvantRemise = pu * qte;
            const montantRemise = isNaN(totalAvantRemise - htAfterRemise) ? 0 : (totalAvantRemise - htAfterRemise);
            const ht = htAfterRemise; // HT = montant après remise
            // Si client exonéré (devis) => TVA 0
            const tva = (isClientExonerated && isDevis) ? 0 : (isNaN(ht * taux_tva) ? 0 : (ht * taux_tva));
            const ttc = isNaN(ht + tva) ? 0 : (ht + tva);

            totalHT += ht;
            totalReduction += montantRemise;
            totalTVA += tva;
            totalTTC += ttc;

            // Calculate dynamic row height based on plaintext designation wrapping
            // CRITIQUE : Calculer la hauteur AVANT de dessiner quoi que ce soit
            // Utiliser la largeur effective pour calculer la hauteur correcte
            // Vérifier que toutes les valeurs sont valides pour éviter NaN
            const validColDesignationWidth = isNaN(colDesignationWidth) || colDesignationWidth <= 0 ? 250 : Number(colDesignationWidth);
            const validColDesignationPadding = isNaN(colDesignationPadding) || colDesignationPadding < 0 ? 8 : Number(colDesignationPadding);
            const effectiveDesignationWidth = Math.max(0, validColDesignationWidth - (validColDesignationPadding * 2));

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
            // Limite de hauteur par page - le contenu sera paginé si nécessaire
            const maxRowHeight = 500;

            // Calculer la hauteur du texte en utilisant une méthode plus robuste
            let textHeight = baseRowHeight;

            // Vérifier que toutes les valeurs sont valides avant de calculer
            if (effectiveDesignationWidth > 0 &&
              !isNaN(effectiveDesignationWidth) &&
              effectiveDesignationWidth < 10000 &&
              typeof designationPlain === 'string' &&
              designationPlain.length > 0) {
              try {
                // S'assurer que designationPlain est une chaîne valide et limitée
                const safeDesignationPlain = designationPlain.toString().substring(0, 10000);
                const safeWidth = Math.max(1, Math.min(Math.floor(effectiveDesignationWidth), 10000));

                // Vérifier que safeWidth est un nombre valide
                if (!isNaN(safeWidth) && safeWidth > 0 && safeWidth < 10000) {
                  // Utiliser une méthode alternative si heightOfString retourne NaN
                  // Estimer la hauteur basée sur le nombre de caractères et la largeur
                  const fontSize = 9; // Taille de police utilisée
                  const lineHeight = fontSize * 1.2; // Hauteur de ligne standard
                  const charsPerLine = Math.floor(safeWidth / (fontSize * 0.6)); // Estimation caractères par ligne
                  const estimatedLines = Math.ceil(safeDesignationPlain.length / Math.max(1, charsPerLine));
                  const estimatedHeight = estimatedLines * lineHeight;

                  // Essayer d'abord avec heightOfString
                  let calculatedHeight;
                  try {
                    doc.fontSize(9).font('Helvetica'); // S'assurer que la police est correcte pour le calcul
                    calculatedHeight = doc.heightOfString(safeDesignationPlain, {
                      width: safeWidth,
                      align: 'left'
                    });
                  } catch (heightError) {
                    // Si heightOfString échoue, utiliser l'estimation
                    calculatedHeight = estimatedHeight;
                  }

                  // Vérifier que le résultat est un nombre valide
                  if (typeof calculatedHeight === 'number' &&
                    !isNaN(calculatedHeight) &&
                    isFinite(calculatedHeight) &&
                    calculatedHeight > 0 &&
                    calculatedHeight < 10000) {
                    textHeight = calculatedHeight;
                  } else {
                    // Utiliser l'estimation si heightOfString retourne NaN
                    if (!isNaN(estimatedHeight) && estimatedHeight > 0) {
                      textHeight = estimatedHeight;
                    } else {
                      textHeight = baseRowHeight;
                    }
                  }
                } else {
                  console.warn('❌ [PDF] safeWidth invalide:', { safeWidth, effectiveDesignationWidth });
                  textHeight = baseRowHeight;
                }
              } catch (error) {
                console.warn('❌ [PDF] Erreur calcul textHeight:', error.message, {
                  effectiveDesignationWidth,
                  designationPlainLength: designationPlain?.length,
                  designationPlainPreview: designationPlain?.substring(0, 50)
                });
                textHeight = baseRowHeight;
              }
            } else {
              // Si effectiveDesignationWidth n'est pas valide, utiliser la hauteur de base
              textHeight = baseRowHeight;
            }

            // Vérifier que textHeight est valide avant de calculer naturalHeight
            const validTextHeight = isNaN(textHeight) || textHeight <= 0 ? baseRowHeight : textHeight;
            // CRITIQUE : Utiliser le vrai padding (haut + bas) et ajouter une marge de sécurité de 10 points
            const naturalHeight = Math.max(baseRowHeight, Math.ceil(validTextHeight) + (validColDesignationPadding * 2) + 10);
            const rowHeight = Math.min(maxRowHeight, naturalHeight);

            // Vérifier que rowHeight est valide
            const validRowHeight = isNaN(rowHeight) || rowHeight <= 0 ? baseRowHeight : rowHeight;

            if (isNaN(rowHeight) || rowHeight <= 0) {
              console.error('❌ [PDF] Erreur calcul rowHeight:', { textHeight, validTextHeight, naturalHeight, rowHeight, validRowHeight });
            }

            // CRITIQUE : Vérifier si la ligne va dépasser la limite AVANT de la rendre
            // Si oui, ajouter une nouvelle page AVANT de rendre la ligne
            const currentY = isNaN(y) || y < 0 ? 0 : y;
            const estimatedNextY = currentY + validRowHeight;
            // Limite ajustée pour remplir la page au maximum avant le pied de page
            // Page A4 = 842pt, pied de page à 770pt, marge de sécurité = 70pt
            // Le bloc récapitulatif (totaux, signatures) n'est que sur la dernière page
            const pageLimit = 700; // Limite avant d'ajouter une nouvelle page

            // === MODE NOMENCLATURE : Pagination spéciale pour afficher TOUS les composants ===
            if (printMode === 'nomenclature') {
              console.log('[PDF Nomenclature] 📝 Début rendu nomenclature');
              console.log('[PDF Nomenclature] - Réf:', ref);
              console.log('[PDF Nomenclature] - Contenu HTML longueur:', (designationHtml || '').length);
              
              // Constantes pour le rendu
              // CRITIQUE : La largeur doit respecter la marge avant colQteX (350)
              // Désignation commence à 105, donc largeur max = 350 - 105 - 10 (marge) = 235
              const contentWidth = colQteX - 105 - 10; // = 235
              const padding = 8;
              const minLineHeight = 14; // Hauteur minimale par ligne de texte
              
              // Fonction pour convertir rgb() en hex
              const rgbToHex = (color) => {
                if (!color) return '#000000';
                const rgbMatch = color.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
                if (rgbMatch) {
                  const r = parseInt(rgbMatch[1], 10);
                  const g = parseInt(rgbMatch[2], 10);
                  const b = parseInt(rgbMatch[3], 10);
                  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                }
                return color;
              };
              
              // Parser le HTML en segments avec styles inline
              const htmlContent = designationHtml || '';
              
              // Fonction pour parser une ligne HTML et retourner des segments avec styles
              const parseLineSegments = (lineHtml) => {
                const segments = [];
                let remaining = lineHtml;
                
                // Pattern pour trouver les tags de style
                const tagPattern = /<(strong|b|em|i|span)([^>]*)>([\s\S]*?)<\/\1>/gi;
                let lastIndex = 0;
                let match;
                
                // Réinitialiser le pattern
                const tempDiv = remaining;
                const allMatches = [];
                
                // Trouver tous les tags de style
                while ((match = tagPattern.exec(tempDiv)) !== null) {
                  allMatches.push({
                    index: match.index,
                    length: match[0].length,
                    tag: match[1].toLowerCase(),
                    attrs: match[2],
                    content: match[3],
                    fullMatch: match[0]
                  });
                }
                
                // Trier par index
                allMatches.sort((a, b) => a.index - b.index);
                
                // Traiter les segments
                let currentPos = 0;
                allMatches.forEach((m) => {
                  // Texte avant ce tag
                  if (m.index > currentPos) {
                    const textBefore = tempDiv.substring(currentPos, m.index).replace(/<[^>]+>/g, '');
                    if (textBefore.trim()) {
                      segments.push({ text: textBefore, bold: false, italic: false, color: null });
                    }
                  }
                  
                  // Extraire les styles du tag
                  const isBold = m.tag === 'strong' || m.tag === 'b';
                  const isItalic = m.tag === 'em' || m.tag === 'i';
                  let color = null;
                  
                  // Extraire la couleur du style
                  const colorMatch = m.attrs.match(/style=["'][^"']*color\s*:\s*([^;"']+)/i);
                  if (colorMatch) {
                    color = rgbToHex(colorMatch[1].trim());
                  }
                  
                  // Nettoyer le contenu (enlever les tags imbriqués mais garder le texte)
                  const cleanContent = m.content.replace(/<[^>]+>/g, '').trim();
                  if (cleanContent) {
                    segments.push({ text: cleanContent, bold: isBold, italic: isItalic, color: color });
                  }
                  
                  currentPos = m.index + m.length;
                });
                
                // Texte après le dernier tag
                if (currentPos < tempDiv.length) {
                  const textAfter = tempDiv.substring(currentPos).replace(/<[^>]+>/g, '');
                  if (textAfter.trim()) {
                    segments.push({ text: textAfter, bold: false, italic: false, color: null });
                  }
                }
                
                // Si aucun segment trouvé, retourner le texte brut
                if (segments.length === 0) {
                  const plainText = lineHtml.replace(/<[^>]+>/g, '').trim();
                  if (plainText) {
                    segments.push({ text: plainText, bold: false, italic: false, color: null });
                  }
                }
                
                return segments;
              };
              
              // Séparer le HTML en lignes (par <p>, <li>, <br>, <h1-6>)
              let tempHtml = htmlContent
                .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n[H$1]$2[/H]\n')
                .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n[LI]$1[/LI]\n')
                .replace(/<ul[^>]*>/gi, '').replace(/<\/ul>/gi, '')
                .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n[P]$1[/P]\n')
                .replace(/<br\s*\/?>/gi, '\n');
              
              const rawLines = tempHtml.split('\n').filter(line => line.trim());
              console.log('[PDF Nomenclature] Lignes parsées:', rawLines.length);
              
              // Calculer la hauteur de chaque ligne et parser les segments
              // IMPORTANT: Utiliser la même largeur que contentWidth pour cohérence
              const lineHeights = [];
              const lineSpacing = 12; // Espacement entre les lignes de texte (taille police 9 + marge)
              
              rawLines.forEach((line, idx) => {
                const isHeading = line.match(/^\[H([1-6])\]/);
                const isLi = line.includes('[LI]');
                const isP = line.includes('[P]');
                
                // Extraire le contenu HTML de la ligne
                let innerHtml = line
                  .replace(/^\[H[1-6]\]/, '').replace(/\[\/H\]$/, '')
                  .replace(/^\[LI\]/, '').replace(/\[\/LI\]$/, '')
                  .replace(/^\[P\]/, '').replace(/\[\/P\]$/, '')
                  .trim();
                
                if (!innerHtml) return;
                
                // Parser les segments avec styles
                const segments = parseLineSegments(innerHtml);
                if (segments.length === 0) return;
                
                // Calculer le texte complet pour la hauteur
                const prefix = isLi ? '• ' : '';
                const fullText = prefix + segments.map(s => s.text).join('');
                
                // Utiliser la bonne police pour le calcul de hauteur
                const fontSize = isHeading ? 10 : 9;
                doc.fontSize(fontSize);
                doc.font(isHeading ? 'Helvetica-Bold' : 'Helvetica');
                
                // Calculer avec la largeur réelle de la colonne moins le préfixe si liste
                const effectiveWidth = contentWidth - (isLi ? 15 : 0);
                
                // MÉTHODE FIABLE : Calculer le nombre de lignes wrappées manuellement
                // Largeur de chaque caractère moyen ≈ 5.5 pour fontSize 9
                const avgCharWidth = fontSize * 0.55;
                const charsPerLine = Math.floor(effectiveWidth / avgCharWidth);
                const numLines = Math.ceil(fullText.length / charsPerLine);
                
                // Hauteur = nombre de lignes * espacement
                const calculatedHeight = numLines * lineSpacing;
                
                // Vérifier aussi avec heightOfString pour plus de précision
                let textHeight;
                try {
                  textHeight = doc.heightOfString(fullText, { width: effectiveWidth, align: 'left' });
                  if (isNaN(textHeight) || textHeight <= 0) {
                    textHeight = calculatedHeight;
                  }
                } catch (e) {
                  textHeight = calculatedHeight;
                }
                
                // Prendre le maximum des deux méthodes + marge de sécurité
                const finalHeight = Math.max(minLineHeight, Math.max(textHeight, calculatedHeight) + 6);
                
                console.log(`[PDF] Ligne ${idx}: "${fullText.substring(0, 30)}..." - Largeur: ${effectiveWidth}, Chars: ${fullText.length}, Lignes: ${numLines}, Hauteur: ${finalHeight}`);
                
                lineHeights.push({
                  segments: segments,
                  height: finalHeight,
                  isHeading: !!isHeading,
                  isLi: isLi,
                  fullText: fullText
                });
              });
              
              console.log('[PDF Nomenclature] Lignes avec hauteurs calculées:', lineHeights.length);
              
              // Calculer la hauteur totale nécessaire
              let totalContentHeight = padding * 2;
              lineHeights.forEach(lh => { totalContentHeight += lh.height; });
              console.log('[PDF Nomenclature] Hauteur totale du contenu:', totalContentHeight);
              
              // Valeurs formatées
              const qteFormatted = isNaN(qte) ? '0,00' : qte.toFixed(2).replace('.', ',');
              const puFormatted = isNaN(pu) ? '0,00' : pu.toFixed(2).replace('.', ',');
              const remiseFormatted = isNaN(montantRemise) ? '0,00' : montantRemise.toFixed(2).replace('.', ',');
              const htFormatted = isNaN(ht) ? '0,00' : ht.toFixed(2).replace('.', ',');
              
              // Variables pour le rendu paginé
              let currentLineIdx = 0;
              let currentY = y;
              let isFirstBlock = true;
              let pageNum = 1;
              
              while (currentLineIdx < lineHeights.length) {
                // Calculer combien de lignes on peut mettre sur cette page
                const availableHeight = pageLimit - currentY - padding * 2;
                console.log('[PDF Nomenclature] Page', pageNum, '- Y:', currentY, 'Disponible:', availableHeight);
                
                // Si pas assez d'espace pour au moins une ligne, nouvelle page
                if (availableHeight < minLineHeight + padding * 2) {
                  console.log('[PDF Nomenclature] Espace insuffisant, nouvelle page');
                  drawPageFooter();
                  doc.addPage();
                  pageNum++;
                  currentY = drawDocumentHeader(false);
                  currentY = drawTableHeader(currentY);
                  continue;
                }
                
                // Collecter les lignes qui tiennent sur cette page
                let blockHeight = padding * 2;
                let linesToRender = [];
                let tempIdx = currentLineIdx;
                
                while (tempIdx < lineHeights.length) {
                  const lineData = lineHeights[tempIdx];
                  if (blockHeight + lineData.height <= availableHeight) {
                    linesToRender.push(lineData);
                    blockHeight += lineData.height;
                    tempIdx++;
                  } else {
                    break;
                  }
                }
                
                // S'assurer qu'on a au moins une ligne (même si elle dépasse)
                if (linesToRender.length === 0 && tempIdx < lineHeights.length) {
                  linesToRender.push(lineHeights[tempIdx]);
                  blockHeight = padding * 2 + lineHeights[tempIdx].height;
                  tempIdx++;
                }
                
                console.log('[PDF Nomenclature] Bloc:', linesToRender.length, 'lignes, hauteur:', blockHeight);
                
                // Dessiner le bloc de tableau
                const blockY = currentY;
                const rowHeight = Math.max(baseRowHeight, blockHeight);
                
                // Bordure du bloc
                doc.roundedRect(50, blockY, 510, rowHeight, tableBorderRadius).stroke('#000');
                
                // Réf (seulement sur le premier bloc)
                if (isFirstBlock) {
                  doc.save();
                  doc.font('Helvetica').fontSize(9).fillColor('#000');
                  doc.text(ref || '', 55, blockY + padding, { width: 45, align: 'left' });
                  doc.restore();
                }
                
                // Désignation - rendre les lignes UNE PAR UNE
                // CRITIQUE : Chaque ligne doit être rendue à sa propre position Y
                let textY = blockY + padding;
                const textStartX = 105;
                const textMaxWidth = colQteX - textStartX - 10; // Marge de sécurité de 10px
                
                linesToRender.forEach((lineData) => {
                  doc.save();
                  
                  // Clipper pour empêcher tout débordement horizontal
                  doc.rect(textStartX, textY, textMaxWidth, lineData.height).clip();
                  
                  let currentX = textStartX;
                  
                  // Préfixe pour les listes
                  if (lineData.isLi) {
                    doc.font('Helvetica').fontSize(9).fillColor('#000');
                    doc.text('• ', currentX, textY, { lineBreak: false, continued: false });
                    currentX += 15;
                  }
                  
                  // Largeur disponible pour le texte
                  const availableWidth = textMaxWidth - (currentX - textStartX);
                  
                  // Si c'est un titre, rendre tout en gras bleu
                  if (lineData.isHeading) {
                    doc.font('Helvetica-Bold').fontSize(10).fillColor('#046ba7');
                    const headingText = lineData.segments.map(s => s.text).join('');
                    doc.text(headingText, currentX, textY, { 
                      width: availableWidth, 
                      align: 'left',
                      lineBreak: true
                    });
                  } else {
                    // Vérifier s'il y a des styles différents
                    const hasStyles = lineData.segments.some(s => s.bold || s.italic || s.color);
                    
                    if (!hasStyles || lineData.segments.length === 1) {
                      // Pas de styles spéciaux ou un seul segment
                      const segment = lineData.segments[0] || { text: '', bold: false, italic: false, color: null };
                      
                      // Appliquer la police
                      if (segment.bold && segment.italic) {
                        doc.font('Helvetica-BoldOblique');
                      } else if (segment.bold) {
                        doc.font('Helvetica-Bold');
                      } else if (segment.italic) {
                        doc.font('Helvetica-Oblique');
                      } else {
                        doc.font('Helvetica');
                      }
                      
                      doc.fontSize(9);
                      doc.fillColor(segment.color || '#000');
                      
                      const fullText = lineData.segments.map(s => s.text).join('');
                      doc.text(fullText, currentX, textY, { 
                        width: availableWidth, 
                        align: 'left',
                        lineBreak: true
                      });
                    } else {
                      // Plusieurs segments avec styles différents
                      // Rendre chaque segment sur la même ligne Y
                      let segmentX = currentX;
                      let segmentY = textY;
                      
                      lineData.segments.forEach((segment, segIdx) => {
                        // Appliquer la police
                        if (segment.bold && segment.italic) {
                          doc.font('Helvetica-BoldOblique');
                        } else if (segment.bold) {
                          doc.font('Helvetica-Bold');
                        } else if (segment.italic) {
                          doc.font('Helvetica-Oblique');
                        } else {
                          doc.font('Helvetica');
                        }
                        
                        doc.fontSize(9);
                        doc.fillColor(segment.color || '#000');
                        
                        // Calculer la largeur du segment
                        const segmentWidth = doc.widthOfString(segment.text);
                        const remainingWidth = textStartX + textMaxWidth - segmentX;
                        
                        if (segmentWidth <= remainingWidth) {
                          // Le segment tient sur la ligne courante
                          doc.text(segment.text, segmentX, segmentY, { 
                            lineBreak: false,
                            continued: false
                          });
                          segmentX += segmentWidth;
                        } else {
                          // Le segment doit être wrappé
                          doc.text(segment.text, segmentX, segmentY, { 
                            width: remainingWidth,
                            align: 'left',
                            lineBreak: true
                          });
                          // Après wrapping, le prochain texte sera sur la nouvelle ligne
                          segmentY = doc.y;
                          segmentX = currentX;
                        }
                      });
                    }
                  }
                  
                  doc.restore();
                  
                  // Incrémenter Y avec la hauteur calculée de cette ligne
                  textY += lineData.height;
                });
                
                // Valeurs numériques (seulement sur le premier bloc)
                if (isFirstBlock) {
                  const centerY = blockY + padding + 3;
                  doc.save();
                  doc.font('Helvetica').fontSize(9).fillColor('#000');
                  doc.text(qteFormatted, colQteX, centerY, { width: colQteWidth, align: 'right' });
                  doc.text(puFormatted, colPUX, centerY, { width: colPUWidth, align: 'right' });
                  doc.text(remiseFormatted, colRX, centerY, { width: colRWidth, align: 'right' });
                  doc.text(htFormatted, colHTX + 5, centerY, { width: colHTWidth - 5, align: 'right' });
                  doc.restore();
                }
                
                // Lignes verticales
                [100, colQteX, colPUX, colRX, colHTX].forEach(xPos => {
                  doc.moveTo(xPos, blockY).lineTo(xPos, blockY + rowHeight).stroke('#000');
                });
                
                // Mettre à jour les variables
                currentY = blockY + rowHeight;
                currentLineIdx = tempIdx;
                isFirstBlock = false;
                
                console.log('[PDF Nomenclature] Bloc rendu, nouveau Y:', currentY, 'Lignes restantes:', lineHeights.length - currentLineIdx);
                
                // Si il reste des lignes, passer à une nouvelle page
                if (currentLineIdx < lineHeights.length) {
                  drawPageFooter();
                  doc.addPage();
                  pageNum++;
                  currentY = drawDocumentHeader(false);
                  currentY = drawTableHeader(currentY);
                }
              }
              
              y = currentY;
              console.log('[PDF Nomenclature] ✅ Rendu terminé. Y final:', y, 'Pages:', pageNum);
              
              // Réinitialiser les positions
              doc.x = undefined;
              doc.y = undefined;
              
              // Sauter le rendu standard
              return;
            }
            
            // === MODE NORMAL (pas nomenclature) ===
            if (estimatedNextY > pageLimit && !isNaN(estimatedNextY)) {
              // La ligne va dépasser la limite, ajouter une nouvelle page AVANT de la rendre
              // 1. D'abord, dessiner le pied de page sur la page COURANTE
              drawPageFooter();
              // 2. Puis ajouter une nouvelle page
              doc.addPage();
              // 3. Redessiner l'en-tête du document sur la nouvelle page
              y = drawDocumentHeader(false);
              // 4. Redessiner l'en-tête du tableau
              y = drawTableHeader(y);
            }

            // CRITIQUE : Calculer la position Y CENTRÉE VERTICALEMENT pour toutes les colonnes numériques
            // Cela garantit que Qté, P.U., R., H.T. restent alignés même si la désignation est haute
            // Utiliser une position fixe basée sur la hauteur calculée, pas sur le rendu HTML
            // Vérifier que rowHeight et y sont des nombres valides pour éviter NaN
            // Utiliser validRowHeight calculé précédemment
            const validY = isNaN(y) || y < 0 ? 0 : y;
            const centerY = validY + (validRowHeight / 2) - 3; // Centre vertical de la ligne (-3 pour ajustement visuel)

            // Vérifier que centerY est valide
            if (isNaN(centerY) || centerY < 0) {
              console.error('❌ [PDF] Erreur calcul centerY:', { y, rowHeight, validY, validRowHeight, centerY });
            }

            // GARANTIR que la désignation ne dépasse jamais la position de Qté (320)
            // La désignation doit s'arrêter à : colDesignationX (105) + effectiveDesignationWidth (175) = 280 max
            // Qté commence à 320, donc il y a 40 points de marge de sécurité

            // Draw row container avec bordures arrondies (ovale) avec lignes verticales
            // Vérifier que toutes les valeurs sont valides avant de dessiner
            // Utiliser validRowHeight calculé précédemment
            const rectY = isNaN(y) || y < 0 ? 0 : y;
            const rectHeight = validRowHeight; // Utiliser validRowHeight déjà calculé

            // Vérifier que toutes les valeurs sont valides avant de dessiner
            if (!isNaN(rectY) && !isNaN(rectHeight) && rectHeight > 0 && rectY >= 0) {
              doc.roundedRect(50, rectY, 510, rectHeight, tableBorderRadius).stroke('#000');
            } else {
              console.error('❌ [PDF] Erreur valeurs pour roundedRect:', { rectY, rectHeight, y, validRowHeight });
            }

            // Column contents - positions exactes selon l'image
            doc.font('Helvetica').fontSize(9).fillColor('#000');

            // CRITIQUE : RENDRE TOUTES LES COLONNES NUMÉRIQUES AVANT LA DÉSIGNATION
            // Cela garantit qu'elles ne sont pas affectées par le rendu HTML

            // CRITIQUE : RENDRE TOUTES LES COLONNES NUMÉRIQUES AVANT LA DÉSIGNATION
            // Utiliser des positions ABSOLUES explicites pour éviter toute interférence

            // Qté - Position CENTRÉE VERTICALEMENT, isolé avec save/restore
            // CRITIQUE : Rendre AVANT la désignation pour éviter toute interférence
            // CRITIQUE : Utiliser une position ABSOLUE explicite, jamais doc.x/doc.y
            doc.save();
            // FORCER la réinitialisation complète avant et après
            doc.x = undefined;
            doc.y = undefined;
            if (qte > 0 && !isNaN(centerY) && centerY >= 0) {
              // Position ABSOLUE explicite - ne JAMAIS utiliser doc.x/doc.y
              const qteValue = isNaN(qte) ? '0,00' : qte.toFixed(2).replace('.', ',');
              const validColQteX = isNaN(colQteX) || colQteX < 0 ? 320 : colQteX;
              const validColQteWidth = isNaN(colQteWidth) || colQteWidth <= 0 ? 55 : colQteWidth;
              if (!isNaN(validColQteX) && !isNaN(centerY) && !isNaN(validColQteWidth)) {
                doc.text(qteValue, validColQteX, centerY, {
                  width: validColQteWidth,
                  align: 'right',
                  continued: false // FORCER à ne pas continuer
                });
              }
            }
            // Réinitialiser après le texte
            doc.x = undefined;
            doc.y = undefined;
            doc.restore();

            // P.U. - Position CENTRÉE VERTICALEMENT, isolé avec save/restore
            doc.save();
            doc.x = undefined;
            doc.y = undefined;
            if (!isNaN(centerY) && centerY >= 0) {
              const puValue = isNaN(pu) ? '0,00' : pu.toFixed(2).replace('.', ',');
              const validColPUX = isNaN(colPUX) || colPUX < 0 ? 380 : colPUX;
              const validColPUWidth = isNaN(colPUWidth) || colPUWidth <= 0 ? 45 : colPUWidth;
              if (!isNaN(validColPUX) && !isNaN(centerY) && !isNaN(validColPUWidth)) {
                doc.text(puValue, validColPUX, centerY, {
                  width: validColPUWidth,
                  align: 'right',
                  continued: false
                });
              }
            }
            doc.x = undefined;
            doc.y = undefined;
            doc.restore();

            // R. - Position CENTRÉE VERTICALEMENT, isolé avec save/restore
            doc.save();
            doc.x = undefined;
            doc.y = undefined;
            if (!isNaN(centerY) && centerY >= 0) {
              const remiseValue = isNaN(montantRemise) ? '0,00' : montantRemise.toFixed(2).replace('.', ',');
              const validColRX = isNaN(colRX) || colRX < 0 ? 430 : colRX;
              const validColRWidth = isNaN(colRWidth) || colRWidth <= 0 ? 55 : colRWidth;
              if (!isNaN(validColRX) && !isNaN(centerY) && !isNaN(validColRWidth)) {
                doc.text(remiseValue, validColRX, centerY, {
                  width: validColRWidth,
                  align: 'right',
                  continued: false
                });
              }
            }
            doc.x = undefined;
            doc.y = undefined;
            doc.restore();

            // H.T. - Position CENTRÉE VERTICALEMENT, isolé avec save/restore
            doc.save();
            doc.x = undefined;
            doc.y = undefined;
            if (!isNaN(centerY) && centerY >= 0) {
              const htValue = isNaN(ht) ? '0,00' : ht.toFixed(2).replace('.', ',');
              const validColHTX = isNaN(colHTX) || colHTX < 0 ? 490 : colHTX;
              const validColHTMargin = isNaN(colHTMargin) || colHTMargin < 0 ? 5 : colHTMargin;
              const validColHTWidth = isNaN(colHTWidth) || colHTWidth <= 0 ? 50 : colHTWidth;
              const validHTX = validColHTX + validColHTMargin;
              const validHTWidth = Math.max(0, validColHTWidth - validColHTMargin);
              if (!isNaN(validHTX) && !isNaN(centerY) && !isNaN(validHTWidth) && validHTWidth > 0) {
                doc.text(htValue, validHTX, centerY, {
                  width: validHTWidth,
                  align: 'right',
                  continued: false
                });
              }
            }
            doc.x = undefined;
            doc.y = undefined;
            doc.restore();

            // Réf - isolé avec save/restore, positionné en haut
            doc.save();
            doc.x = undefined;
            doc.y = undefined;
            // Vérifier que toutes les valeurs sont valides
            const validColRefX = isNaN(colRefX) || colRefX < 0 ? 55 : colRefX;
            const validYForRef = isNaN(y) || y < 0 ? 0 : y;
            const validColRefWidth = isNaN(colRefWidth) || colRefWidth <= 0 ? 45 : colRefWidth;
            if (!isNaN(validColRefX) && !isNaN(validYForRef) && !isNaN(validColRefWidth)) {
              doc.text(ref || '', validColRefX, validYForRef + 6, { width: validColRefWidth, align: 'left' });
            }
            doc.restore();

            // Désignation avec largeur limitée pour ne pas empiéter sur Qté
            // CRITIQUE : La désignation DOIT s'arrêter avant colQteX (320)
            // effectiveDesignationWidth = 200 - 15 = 185, donc fin à 105 + 185 = 290
            // Qté commence à 320, donc marge de 30 points garantie
            // AFFICHER EN TEXTE CLAIR (sans HTML) pour éviter les problèmes de rendu et NaN
            doc.save();
            doc.x = undefined;
            doc.y = undefined;
            // Vérifier que toutes les valeurs sont valides
            const validColDesignationX = isNaN(colDesignationX) || colDesignationX < 0 ? 105 : colDesignationX;
            const validYForDesignation = isNaN(y) || y < 0 ? 0 : y;
            const validEffectiveWidth = isNaN(effectiveDesignationWidth) || effectiveDesignationWidth <= 0 ? 185 : effectiveDesignationWidth;

            // Afficher la désignation en texte clair (sans HTML) - utiliser designationPlain
            // Désignation avec rendu HTML pour supporter le gras, les couleurs et les sauts de ligne
            if (!isNaN(validColDesignationX) && !isNaN(validYForDesignation) && !isNaN(validEffectiveWidth) && designationHtml) {
              // TOUJOURS utiliser une hauteur maximale pour le clipping (évite que le texte déborde du tableau)
              // En mode nomenclature, on utilise validRowHeight calculé dynamiquement
              const maxHeightForRender = validRowHeight - 8;
              renderInlineHtml(doc, designationHtml, validColDesignationX, validYForDesignation + 6, validEffectiveWidth, maxHeightForRender);
            }
            doc.restore();

            // CRITIQUE : Réinitialiser complètement la position après TOUS les rendus
            doc.x = undefined;
            doc.y = undefined;

            // Lignes verticales pour séparer les colonnes (ajustées selon les nouvelles positions)
            const xPositions = [100, colQteX, colPUX, colRX, colHTX];
            // Utiliser validRowHeight calculé précédemment
            const validYForLines = isNaN(y) || y < 0 ? 0 : y;
            xPositions.forEach(x => {
              if (!isNaN(x) && x >= 0 && !isNaN(validYForLines) && !isNaN(validRowHeight) && validRowHeight > 0) {
                doc.moveTo(x, validYForLines).lineTo(x, validYForLines + validRowHeight).stroke('#000');
              }
            });

            // Vérifier que rowHeight est valide avant d'incrémenter y
            // Utiliser validRowHeight calculé précédemment (défini plus haut dans le code)
            const currentYAfterRender = isNaN(y) || y < 0 ? 0 : y;
            y = currentYAfterRender + validRowHeight;

            // Vérifier que y est valide après incrément
            if (isNaN(y) || y < 0) {
              console.error('❌ [PDF] Erreur valeur y après incrément:', { y, validRowHeight, currentYAfterRender });
              y = currentYAfterRender + 20; // Utiliser une valeur sûre
            }
            // Note: La vérification pour ajouter une nouvelle page est faite AVANT de rendre la ligne (ligne 612)
          });
        } else {
          doc.text('Aucune ligne de devis disponible.', 60, y + 10);
          y += 30;
        }

        // === BLOC RÉCAPITULATIF HORIZONTAL (ne dépasse pas la moitié de la page, positionné à droite) ===
        // Calculer la hauteur totale du bloc final (récap + montant + conditions + signatures)
        // Récap: ~55px, Montant en lettres: ~20px, Conditions: ~65px, Signatures: ~80px = ~220px
        // Le pied de page commence à 770, donc on doit s'arrêter à 770 - 220 = 550
        const maxYBeforeFooter = 550; // Position Y maximale avant le bloc final pour éviter chevauchement avec pied de page
        
        // Vérifier si le bloc final va dépasser la zone disponible
        if (y > maxYBeforeFooter) {
          // 1. Dessiner le pied de page sur la page courante
          drawPageFooter();
          // 2. Ajouter une nouvelle page
          doc.addPage();
          // 3. Redessiner l'en-tête du document sur la nouvelle page
          y = drawDocumentHeader(false);
        }
        y += 10;
        const recapTableY = y;
        const recapTableHeight = 25;
        const recapTableRowHeight = 20;
        const recapTableTotalHeight = recapTableHeight + recapTableRowHeight;
        const recapTableWidth = 255; // Moitié de la page (510 / 2)
        const recapTableX = 305; // Position à droite (50 + 510 - 255 = 305)

        // Tableau complet avec bordures arrondies (moitié de la page)
        doc.roundedRect(recapTableX, recapTableY, recapTableWidth, recapTableTotalHeight, tableBorderRadius).stroke('#000');

        // Ligne de séparation horizontale
        doc.moveTo(recapTableX, recapTableY + recapTableHeight).lineTo(recapTableX + recapTableWidth, recapTableY + recapTableHeight).stroke('#000');

        // Lignes de séparation verticales (4 colonnes)
        const recapColWidth = recapTableWidth / 4; // 63.75px par colonne
        const recapCol1X = recapTableX + recapColWidth; // Total HT
        const recapCol2X = recapTableX + recapColWidth * 2;   // Réduction
        const recapCol3X = recapTableX + recapColWidth * 3;  // Total TVA

        doc.moveTo(recapCol1X, recapTableY).lineTo(recapCol1X, recapTableY + recapTableTotalHeight).stroke('#000');
        doc.moveTo(recapCol2X, recapTableY).lineTo(recapCol2X, recapTableY + recapTableTotalHeight).stroke('#000');
        doc.moveTo(recapCol3X, recapTableY).lineTo(recapCol3X, recapTableY + recapTableTotalHeight).stroke('#000');

        // En-tête (ligne 1)
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
        doc.text('Total HT', recapTableX, recapTableY + 8, { width: recapColWidth, align: 'center' });
        doc.text('Réduction', recapCol1X, recapTableY + 8, { width: recapColWidth, align: 'center' });
        doc.text('Total TVA', recapCol2X, recapTableY + 8, { width: recapColWidth, align: 'center' });
        doc.text('Total TTC', recapCol3X, recapTableY + 8, { width: recapColWidth, align: 'center' });

        // Données (ligne 2)
        doc.font('Helvetica').fontSize(9);
        doc.text(totalHT.toFixed(2).replace('.', ','), recapTableX, recapTableY + recapTableHeight + 6, { width: recapColWidth, align: 'center' });
        doc.text(totalReduction.toFixed(2).replace('.', ','), recapCol1X, recapTableY + recapTableHeight + 6, { width: recapColWidth, align: 'center' });
        // Afficher le montant réel de la TVA au lieu de "20%"
        doc.text(totalTVA.toFixed(2).replace('.', ','), recapCol2X, recapTableY + recapTableHeight + 6, { width: recapColWidth, align: 'center' });
        doc.text(totalTTC.toFixed(2).replace('.', ','), recapCol3X, recapTableY + recapTableHeight + 6, { width: recapColWidth, align: 'center' });

        y = recapTableY + recapTableTotalHeight + 10;

        // === MONTANT EN LETTRES (phrase en italique, montant en gras) ===
        const totalTTCWords = convertAmountToWordsFR(totalTTC);
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#000'); // Italique pour la phrase

        // Adapter le texte selon le type de document
        let phraseText = 'Arrêté le présent devis à la somme de: ';
        if (isRetour) {
          phraseText = 'Arrêté le présent bon de retour à la somme de: ';
        } else if (isLivraison) {
          phraseText = 'Arrêté le présent bon de livraison à la somme de: ';
        }

        doc.text(phraseText, 50, y, { width: 500, align: 'left' });

        // Calculer la position du montant en lettres (après la phrase)
        const phraseWidth = doc.widthOfString(phraseText);
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000'); // Gras pour le montant
        doc.text(totalTTCWords, 50 + phraseWidth, y, { width: 500 - phraseWidth, align: 'left' });
        y += 20;

        // Mention sur PDF (devis + bon de livraison) si exonération valide
        if (isClientExonerated && (isDevis || isLivraison)) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
          doc.text('TVA non applicable – Client exonéré conformément à la lettre d\'exonération en vigueur', 50, y, {
            width: 500,
            align: 'center'
          });
          y += 15;
        }

        // === TABLEAU CONDITION / EXPÉDITION / TRANSPORTEUR avec bordures arrondies ===
        const condition = devisData[0]?.condition || '';
        const expedition = devisData[0]?.expedition || '';
        const transporteur = devisData[0]?.transporteur || '';

        // Afficher le tableau seulement si au moins une donnée existe
        if (condition || expedition || transporteur) {
          const conditionTableY = y;
          const conditionTableHeight = 25;
          const conditionTableRowHeight = 20;
          const conditionTableTotalHeight = conditionTableHeight + conditionTableRowHeight;

          // Tableau complet avec bordures arrondies (un seul rectangle)
          doc.roundedRect(50, conditionTableY, 510, conditionTableTotalHeight, tableBorderRadius).stroke('#000');

          // Ligne de séparation horizontale
          doc.moveTo(50, conditionTableY + conditionTableHeight).lineTo(560, conditionTableY + conditionTableHeight).stroke('#000');

          // Lignes de séparation verticales
          doc.moveTo(220, conditionTableY).lineTo(220, conditionTableY + conditionTableTotalHeight).stroke('#000');
          doc.moveTo(390, conditionTableY).lineTo(390, conditionTableY + conditionTableTotalHeight).stroke('#000');

          // En-tête (ligne 1)
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
          doc.text('Condition de règlement', 55, conditionTableY + 8, { width: 170, align: 'center' });
          doc.text('Expédition', 225, conditionTableY + 8, { width: 170, align: 'center' });
          doc.text('Transporteur', 395, conditionTableY + 8, { width: 165, align: 'center' });

          // Valeurs (ligne 2)
          doc.font('Helvetica').fontSize(9);
          doc.text(condition, 55, conditionTableY + conditionTableHeight + 6, { width: 170, align: 'center' });
          doc.text(expedition, 225, conditionTableY + conditionTableHeight + 6, { width: 170, align: 'center' });
          doc.text(transporteur, 395, conditionTableY + conditionTableHeight + 6, { width: 165, align: 'center' });

          y = conditionTableY + conditionTableTotalHeight + 20;
        }

        // === SIGNATURES avec bordures arrondies (comme l'image) ===
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

        // Les zones de signature restent vides (comme sur l'image)

        // === PIED DE PAGE - Dessiner sur la dernière page ===
        drawPageFooter();

        // Cachet optionnel en bas du PDF (bas-droit)
        const withStamp = !!options.withStamp;
        if (withStamp) {
          // Position proche du bas de la page courante
          const stampX = 470; // proche du bord droit
          const stampY = 760; // proche du bas
          doc.save();
          doc.rotate(-12, { origin: [stampX, stampY] });
          doc.lineWidth(3).strokeColor('#c0392b').fillColor('rgba(0,0,0,0)');
          doc.circle(stampX, stampY, 60).stroke();
          doc.font('Helvetica-Bold').fontSize(14).fillColor('#c0392b');
          doc.text('VALIDÉ', stampX - 50, stampY - 10, { width: 100, align: 'center' });
          doc.restore();
        }

        // ✅ Fin du document
        doc.end();

      } catch (error) {
        reject(error);
      }
    });
  }


  // 📤 Envoie l'e-mail avec le PDF du devis
  async envoyerEmail({ to, cc, subject, body, document_id, documentSociete = null }) {
    try {
      const devisData = await getEmailDataByDocumentId(document_id);
      if (!devisData) throw new Error('Devis introuvable');

      const pdfPath = await this.genererPDF(devisData, { documentSociete });

      // Déterminer les labels selon le type
      const documentKind = devisData[0]?.document_kind || '';
      const isRetour = documentKind === 'RETOUR CLIENT' || devisData[0]?.type === 5;
      const isLivraison = documentKind === 'LIVRAISON' || devisData[0]?.type === 2;

      let label = 'devis';
      let folder = 'devis';
      let subjectLabel = 'votre devis';

      if (isRetour) {
        label = 'retour';
        folder = 'retours';
        subjectLabel = 'votre bon de retour';
      } else if (isLivraison) {
        label = 'livraison';
        folder = 'livraisons';
        subjectLabel = 'votre bon de livraison';
      }

      const mailOptions = {
        from: `"Cactus Informatique" <${process.env.EMAIL_USER}>`,
        to,
        cc,
        subject: subject || `Votre ${label} ${devisData[0].numero}`,
        html: `<p>${body || `Veuillez trouver ci-joint ${subjectLabel}.`}</p>`,
        attachments: [
          { filename: `${label}-${devisData[0].numero}.pdf`, path: pdfPath }
        ]
      };

      // Vérifier la connexion avant d'envoyer (avec gestion d'erreur améliorée)
      try {
        await this.transporter.verify();
      } catch (verifyError) {
        console.error('Erreur vérification connexion SMTP :', verifyError);
        // Ne pas bloquer si la vérification échoue, mais logger l'erreur
      }

      await this.transporter.sendMail(mailOptions);


      return {
        success: true,
        message: `E-mail et ${label} envoyés avec succès`,
        pdfUrl: `http://localhost:3500/${folder}/${path.basename(pdfPath)}`
      };
    } catch (error) {
      console.error('Erreur envoi e-mail :', error);

      // Messages d'erreur plus détaillés
      let errorMessage = 'Échec de l\'envoi de l\'e-mail';

      if (error.code === 'EDNS' || error.code === 'ETIMEOUT') {
        errorMessage = 'Erreur de connexion réseau : Impossible de se connecter au serveur email. Vérifiez votre connexion internet et réessayez.';
      } else if (error.code === 'EAUTH') {
        errorMessage = 'Erreur d\'authentification : Les identifiants email sont incorrects.';
      } else if (error.code === 'ECONNECTION') {
        errorMessage = 'Erreur de connexion : Impossible de se connecter au serveur SMTP.';
      } else if (error.message) {
        errorMessage = `Erreur : ${error.message}`;
      }

      throw new Error(errorMessage);
    }
  }

  // 📤 Envoie l'e-mail avec le PDF de la commande
  async envoyerCommandeEmail({ to, cc, subject, body, document_id, documentSociete = null }) {
    try {
      const commandePdfService = require('./commande-pdf.service');
      const commandeData = await getEmailDataByDocumentId(document_id);
      if (!commandeData || commandeData.length === 0) throw new Error('Commande introuvable');

      const pdfPath = await commandePdfService.genererPDF(commandeData, { documentSociete });

      const mailOptions = {
        from: `"Cactus Informatique" <${process.env.EMAIL_USER}>`,
        to,
        cc,
        subject: subject || `Votre bon de commande ${commandeData[0].numero}`,
        html: `<p>${body || 'Veuillez trouver ci-joint votre bon de commande.'}</p>`,
        attachments: [
          { filename: `commande-${commandeData[0].numero}.pdf`, path: pdfPath }
        ]
      };

      // Vérifier la connexion avant d'envoyer (avec gestion d'erreur améliorée)
      try {
        await this.transporter.verify();
      } catch (verifyError) {
        console.error('Erreur vérification connexion SMTP :', verifyError);
        // Ne pas bloquer si la vérification échoue, mais logger l'erreur
      }

      await this.transporter.sendMail(mailOptions);


      return {
        success: true,
        message: 'E-mail et bon de commande envoyés avec succès',
        pdfUrl: `http://localhost:3500/commandes/${path.basename(pdfPath)}`
      };
    } catch (error) {
      console.error('Erreur envoi e-mail commande :', error);

      // Messages d'erreur plus détaillés
      let errorMessage = 'Échec de l\'envoi de l\'e-mail';

      if (error.code === 'EDNS' || error.code === 'ETIMEOUT') {
        errorMessage = 'Erreur de connexion réseau : Impossible de se connecter au serveur email. Vérifiez votre connexion internet et réessayez.';
      } else if (error.code === 'EAUTH') {
        errorMessage = 'Erreur d\'authentification : Les identifiants email sont incorrects.';
      } else if (error.code === 'ECONNECTION') {
        errorMessage = 'Erreur de connexion : Impossible de se connecter au serveur SMTP.';
      } else if (error.message) {
        errorMessage = `Erreur : ${error.message}`;
      }

      throw new Error(errorMessage);
    }
  }
}



module.exports = new EmailService();
