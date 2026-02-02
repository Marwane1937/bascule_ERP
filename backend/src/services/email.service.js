const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { getEmailDataByDocumentId } = require('../models/email.model');
const { renderFormattedText } = require('./pdf-format-helper');


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
        // === MODE D'IMPRESSION (NORMAL / NOMENCLATURE / NON_VALORISE) ===
        // printMode = 'normal' (par défaut) -> comportement existant (BL normal)
        // printMode = 'nomenclature' -> PDF basé sur le même modèle, mais avec 1 seule ligne "article composé"
        // printMode = 'non_valorise' -> BL non valorisé (même mise en page que normal mais sans les totaux HT/TVA/TTC)
        const printMode = (options.printMode || 'normal').toLowerCase();
        const isNonValorise = printMode === 'non_valorise';

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
        // Si forceDocumentType est fourni dans les options, l'utiliser (pour forcer DEVIS depuis l'interface des devis)
        const forceDocumentType = options.forceDocumentType ? options.forceDocumentType.toString().toUpperCase().trim() : null;
        
        const documentType = devisData[0]?.type;
        const documentKind = devisData[0]?.document_kind;

        let saveDir = path.join(__dirname, '..', 'public', 'devis');
        let documentTitle = 'DEVIS';
        let headerLabel = 'Devis N°';

        // 1. Vérifier si c'est un RETOUR CLIENT
        // IMPORTANT: Si forceDocumentType est fourni, l'utiliser en priorité
        // Sinon, vérifier d'abord documentKind (string) puis documentType (number) comme fallback
        // documentType peut être 1=DEVIS, 2=LIVRAISON, 3=COMMANDE, 4=FACTURE, 5=RETOUR
        // Mais documentKind est plus fiable car il vient directement de la base de données
        // Définir documentKindUpper avant le bloc conditionnel pour le log
        const documentKindUpper = documentKind ? documentKind.toString().toUpperCase().trim() : '';
        
        let isRetour = false;
        let isLivraison = false;
        let isDevis = true;
        
        if (forceDocumentType) {
          // Forcer le type de document selon l'option fournie
          if (forceDocumentType === 'DEVIS') {
            isDevis = true;
            isRetour = false;
            isLivraison = false;
          } else if (forceDocumentType === 'LIVRAISON' || forceDocumentType === 'BON DE LIVRAISON') {
            isLivraison = true;
            isDevis = false;
            isRetour = false;
          } else if (forceDocumentType === 'RETOUR' || forceDocumentType === 'RETOUR CLIENT' || forceDocumentType === 'BON DE RETOUR') {
            isRetour = true;
            isDevis = false;
            isLivraison = false;
          }
        } else {
          // Détection automatique (comportement par défaut)
          isRetour = documentKindUpper === 'RETOUR CLIENT' || (!documentKind && documentType === 5);
          isLivraison = documentKindUpper === 'LIVRAISON' || (!documentKind && documentType === 2);
          isDevis = !isRetour && !isLivraison;
        }
        
        // Log pour diagnostiquer le problème de détection (après initialisation de documentTitle)
        console.log(`[PDF] Détection type document:`, {
          documentType,
          documentKind,
          documentKindUpper,
          forceDocumentType,
          type: typeof documentType,
          kind: typeof documentKind,
          isRetour,
          isLivraison,
          isDevis
        });

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
        
        // Compteur de pages pour la numérotation
        let currentPageNumber = 1;
        let totalPagesNumber = 1;

        // === FONCTION: Dessiner l'en-tête du document (logo, titre, client) ===
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
          doc.fontSize(20).font('Helvetica-Bold').fillColor('#000').text(docTitle, 50, 120);

          // Bloc client
          const clientTop = 110;
          const clientBoxWidth = 260;
          const clientBoxHeight = 60;
          const clientBoxX = 300;

          doc.roundedRect(clientBoxX, clientTop, clientBoxWidth, clientBoxHeight, tableBorderRadius).stroke('#000');
          doc.fontSize(10).font('Helvetica').fillColor('#000');
          doc.text(`Client : ${devisData[0].client}`, clientBoxX + 10, clientTop + 10 ,{width: clientBoxWidth - 50, lineBreak: false , ellipsis: true});
          doc.text(`Adresse : ${devisData[0].adresse || ''}`, clientBoxX + 10, clientTop + 35);
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
        // EXACTEMENT COMME FACTURE CONTRAT
        const drawTableHeader = (y) => {
          const lightGrayColor = '#E0E0E0';
          const tableStartX = 40; // Tableau commence à X=40 (marge gauche)
          const tableWidth = 525; // Largeur totale du tableau (595 - 40 marge gauche) - EXACTEMENT COMME FACTURE CONTRAT
          doc.roundedRect(tableStartX, y, tableWidth, articlesTableHeaderHeight, tableBorderRadius).fill(lightGrayColor).stroke('#000');
          doc.lineWidth(1).roundedRect(tableStartX, y, tableWidth, articlesTableHeaderHeight, tableBorderRadius).stroke('#000');
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');

          // Colonnes EXACTEMENT COMME FACTURE CONTRAT
          const colRefX = 40;
          const colRefWidth = 70; // Agrandi de 50 à 70
          const colDesignationX = 110; // 40 + 70
          const colDesignationWidth = 260; // Réduit de 280 à 260 pour compenser l'agrandissement de Réf
          const colQteX = 370; // 110 + 260
          const colQteWidth = 45; // Légèrement réduit
          const colPUX = 415; // 370 + 45
          const colPUWidth = 45; // Légèrement réduit
          const colRX = 460; // 415 + 45
          const colRWidth = 35; // Réduit
          const colHTX = 500; // 460 + 35 + 5 (marge)
          const colHTWidth = 40; // Réduit pour tenir dans la page

          doc.text('Réf', colRefX, y + 10, { width: colRefWidth, align: 'center' });
          doc.text('Désignation', colDesignationX, y + 10, { width: colDesignationWidth, align: 'center' });
          doc.text('Qté', colQteX, y + 10, { width: colQteWidth, align: 'center' });
          doc.text('P.U.', colPUX, y + 10, { width: colPUWidth, align: 'center' });
          doc.text('R.', colRX, y + 10, { width: colRWidth, align: 'center' });
          doc.text('H.T.', colHTX, y + 10, { width: colHTWidth, align: 'center' });

          return y + articlesTableHeaderHeight;
        };

        // === FONCTION: Dessiner le pied de page (appelée sur CHAQUE page) ===
        const drawPageFooter = (pageNum = null) => {
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

          // Numérotation des pages (au centre, directement en haut du pied de page)
          // On utilise le numéro de page passé en paramètre et le total pré-calculé
          const pageNumToDisplay =
            pageNum !== null && pageNum !== undefined ? pageNum : currentPageNumber;
          const totalPagesToDisplay =
            totalPagesNumber && totalPagesNumber > 0 ? totalPagesNumber : currentPageNumber;

          doc.font('Helvetica').fontSize(8).fillColor('#000000');
          // Positionner au centre, directement en haut du pied de page (5px au-dessus de la bande bleue)
          doc.text(
            `Page ${pageNumToDisplay} / ${totalPagesToDisplay}`,
            50,
            footerY - 5,
            { width: 495, align: 'center' }
          );
        };

        // === DESSINER L'EN-TÊTE DE LA PREMIÈRE PAGE ===
        let y = drawDocumentHeader(true);
        y = drawTableHeader(y);
        const tableStartY = y; // Position de départ du tableau (après l'en-tête)
        
        // Dessiner le footer sur la première page (le total sera mis à jour à la fin)
        drawPageFooter(1);
        
        // === DÉFINIR LA HAUTEUR FIXE DU TABLEAU ===
        // Le tableau principal a une hauteur fixe raisonnable qui ne dépasse pas la page
        // pageHeight est déjà défini plus haut (ligne 442)
        const bottomMargin = 40;
        const footerHeight = 32;
        const footerY = pageHeight - bottomMargin - footerHeight;
        
        // Hauteur fixe du tableau (environ 250px pour une taille raisonnable)
        const fixedTableHeight = 250; // Hauteur fixe du tableau des détails
        const maxTableHeight = fixedTableHeight; // Utiliser la hauteur fixe

        // Positions des colonnes (utilisées dans la boucle de rendu des lignes)
        // EXACTEMENT COMME FACTURE CONTRAT
        const tableStartX = 40; // Tableau commence à X=40 (marge gauche)
        const tableWidth = 525; // Largeur totale du tableau (595 - 40 marge gauche)
        const colRefX = 40;
        const colRefWidth = 70; // Agrandi de 50 à 70
        const colDesignationX = 110; // 40 + 70
        const colDesignationWidth = 260; // Réduit de 280 à 260 pour compenser l'agrandissement de Réf
        const colDesignationPadding = 20; // Padding réduit pour un rendu plus compact et professionnel
        const colQteX = 370; // 110 + 260
        const colQteWidth = 45; // Légèrement réduit
        const colPUX = 415; // 370 + 45
        const colPUWidth = 45; // Légèrement réduit
        const colRX = 460; // 415 + 45
        const colRWidth = 35; // Réduit
        const colHTX = 500; // 460 + 35 + 5 (marge)
        const colHTWidth = 50; // Réduit pour tenir dans la page - COMME FACTURE CONTRAT
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

        function renderInlineHtml(doc, html, x, y, width, maxHeight, align = 'left') {
          if (!html || !String(html).trim()) {
            // Retourner une hauteur minimale même si le HTML est vide
            return 9; // Hauteur minimale d'une ligne
          }

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

          // Si aucune ligne à rendre, retourner une hauteur minimale
          if (lines.length === 0) {
            // Extraire le texte brut pour le rendre même s'il n'y a pas de structure HTML
            const plainText = String(html || '').replace(/<[^>]+>/g, '').trim();
            if (plainText) {
              // Ajouter une ligne simple avec le texte brut
              lines.push({ text: plainText, bold: false, italic: false, color: '#000000' });
            } else {
              // Même si vide, retourner une hauteur minimale pour que la ligne s'affiche
              return 9; // Hauteur minimale d'une ligne
            }
          }

          // Rendre dans le PDF
          doc.save();

          const padding = 2; // Réduit encore plus pour un espacement très compact comme livraison
          const drawX = x + padding;
          const drawY = y + padding;
          const drawWidth = width - (padding * 2);
          const baseLineHeight = 9; // Réduit encore plus pour un espacement très compact comme livraison

          // Ne pas utiliser de clipping pour permettre au texte de s'afficher en entier
          // Le clipping sera géré par la pagination au niveau supérieur
          // if (maxHeight) doc.rect(x, y, width, maxHeight).clip();

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
                const prefixText = line.prefix || '';
                const prefixWidth = doc.widthOfString(prefixText, { fontSize: 9 });
                const contentWidth = drawWidth - prefixWidth;
                const yBefore = currentY;

                // Rendre le préfixe
                setFont(doc, false, false);
                doc.fontSize(9);
                doc.fillColor('#000000');
                doc.text(prefixText, drawX, currentY, { width: drawWidth, align: 'left', continued: true });

                // Rendre chaque segment avec son style en mode continued
                let isFirstContentSegment = true;
                line.segments.forEach((segment, segIdx) => {
                  if (segment.text === '\n') {
                    // Saut de ligne explicite: terminer le texte actuel et passer à la ligne suivante
                    if (!isFirstContentSegment) {
                      doc.text('', { width: contentWidth, continued: false });
                    }
                    currentY += baseLineHeight;
                    // Redessiner le préfixe sur la nouvelle ligne
                    setFont(doc, false, false);
                    doc.fontSize(9);
                    doc.fillColor('#000000');
                    doc.text(prefixText, drawX, currentY, { width: drawWidth, align: 'left', continued: true });
                    isFirstContentSegment = true;
                    return;
                  }

                  if (!segment.text || !segment.text.trim()) return;

                  setFont(doc, segment.bold, segment.italic);
                  doc.fontSize(9);
                  doc.fillColor(segment.color);

                  // Rendre le segment en mode continued pour un rendu continu
                  const isLastSegment = (segIdx === line.segments.length - 1);
                  
                  if (isFirstContentSegment) {
                    // Premier segment de contenu: continuer après le préfixe
                    doc.text(segment.text, { 
                      width: contentWidth, 
                      align: 'left',
                      continued: !isLastSegment 
                    });
                    isFirstContentSegment = false;
                  } else {
                    // Segments suivants: continuer le texte précédent
                    doc.text(segment.text, { 
                      width: contentWidth, 
                      align: 'left',
                      continued: !isLastSegment 
                    });
                  }
                });

                // Terminer le texte si nécessaire
                if (!isFirstContentSegment) {
                  doc.text('', { width: contentWidth, continued: false });
                }

                // Calculer la hauteur réelle utilisée
                const yAfter = getActualY();
                const actualHeight = Math.max(baseLineHeight, yAfter - yBefore);
                currentY += actualHeight;
              } else if (line.type === 'text' && line.segments) {
                // Rendre du texte avec segments stylisés
                // Utiliser le mode continued pour éviter les retours à la ligne incorrects
                let isFirstSegment = true;
                const yBefore = currentY;

                line.segments.forEach((segment, segIdx) => {
                  if (segment.text === '\n') {
                    // Saut de ligne explicite: terminer le texte actuel et passer à la ligne suivante
                    if (!isFirstSegment) {
                      // Terminer le texte en cours
                      doc.text('', { width: drawWidth, continued: false });
                    }
                    currentY += baseLineHeight;
                    isFirstSegment = true;
                    return;
                  }

                  if (!segment.text || !segment.text.trim()) return;

                  setFont(doc, segment.bold, segment.italic);
                  doc.fontSize(9);
                  doc.fillColor(segment.color);

                  // Rendre le segment en mode continued pour un rendu continu
                  const isLastSegment = (segIdx === line.segments.length - 1);
                  
                  if (isFirstSegment) {
                    // Premier segment: positionner à la position initiale
                    doc.text(segment.text, drawX, currentY, { 
                      width: drawWidth, 
                      align: align,
                      continued: !isLastSegment 
                    });
                    isFirstSegment = false;
                  } else {
                    // Segments suivants: continuer le texte précédent
                    doc.text(segment.text, { 
                      width: drawWidth, 
                      align: align,
                      continued: !isLastSegment 
                    });
                  }
                });

                // Calculer la hauteur réelle utilisée
                const yAfter = getActualY();
                const actualHeight = Math.max(baseLineHeight, yAfter - yBefore);
                currentY += actualHeight;
              } else {
                // Ligne simple avec texte uniforme
                setFont(doc, line.bold || false, line.italic || false);
                doc.fontSize(9);
                doc.fillColor(line.color || '#000000');

                // Calculer la hauteur réelle du texte
                const textHeight = calculateTextHeight(line.text, drawWidth);

                // Rendre le texte
                doc.text(line.text, drawX, currentY, { width: drawWidth, align: align });
                
                // Mettre à jour Y avec la hauteur réelle
                currentY += textHeight;
              }
            } catch (e) {
              console.error('[EmailService] Error rendering line:', e.message, line);
              currentY += baseLineHeight;
            }
          });

          // Calculer la hauteur réelle utilisée
          const actualHeight = currentY - drawY + padding;
          
          doc.restore();
          
          // Retourner la hauteur réelle utilisée pour ajuster la ligne
          return actualHeight;
        }

        // === LE CONTOUR SERA DESSINÉ APRÈS LE RENDU DES LIGNES ===
        // On ne connaît pas encore la hauteur réelle nécessaire
        // Le contour sera dessiné après le rendu avec la hauteur réelle
        
        // === CALCULER TOUTES LES HAUTEURS NÉCESSAIRES D'ABORD (comme demande-achat) ===
        const baseRowHeight = 16; // Réduit encore plus pour un espacement très compact comme livraison
        const maxRowHeight = 1000; // Augmenté pour permettre plus de contenu
        const rowHeights = [];
        let totalNeededHeight = 0;
        // availableHeight sera calculé dynamiquement selon le contenu
        let adjustedRowHeights = []; // Déclarer avant les blocs if pour qu'il soit accessible partout

        if (devisData && devisData.length > 0) {
          // Calculer d'abord toutes les hauteurs nécessaires
          devisData.forEach((line) => {
            const designationHtml = line.article || '';
            // La largeur effective pour le calcul de hauteur doit tenir compte du padding interne de renderInlineHtml (16px)
            const effectiveDesignationWidth = Math.max(0, colDesignationWidth - 16);

            // Améliorer le calcul de hauteur en tenant compte des structures HTML
            // Compter les lignes supplémentaires pour les titres, listes, paragraphes
            let lineCount = 1; // Au moins une ligne
            const htmlContent = designationHtml || '';
            
            // Compter les sauts de ligne explicites
            const brCount = (htmlContent.match(/<br\s*\/?>/gi) || []).length;
            lineCount += brCount;
            
            // Compter les titres (h1-h6) - chaque titre = 1 ligne supplémentaire
            const headingCount = (htmlContent.match(/<h[1-6][^>]*>/gi) || []).length;
            lineCount += headingCount;
            
            // Compter les éléments de liste (li) - chaque élément = 1 ligne supplémentaire
            const liCount = (htmlContent.match(/<li[^>]*>/gi) || []).length;
            lineCount += liCount;
            
            // Compter les paragraphes (p) - chaque paragraphe = 1 ligne supplémentaire
            const pCount = (htmlContent.match(/<p[^>]*>/gi) || []).length;
            lineCount += pCount;

            // Extraire le texte brut pour calculer la hauteur
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

            // Utiliser le maximum entre la hauteur calculée et le nombre de lignes estimé
            // Chaque ligne structurelle (titre, liste, etc.) ajoute environ 12px (réduit de 14px)
            const structuralHeight = lineCount * 12;
            const estimatedHeight = Math.max(textHeight, structuralHeight);

            const validTextHeight = isNaN(estimatedHeight) || estimatedHeight <= 0 ? baseRowHeight : estimatedHeight;
            // Espacement vertical minimal - seulement ce qui est nécessaire pour le texte
            // Réduire le padding à 4px (2px en haut + 2px en bas) pour un espacement très compact comme livraison
            const naturalHeight = Math.max(baseRowHeight, Math.ceil(validTextHeight) + 4);
            const rowHeight = Math.min(maxRowHeight, naturalHeight);
            const validRowHeight = isNaN(rowHeight) || rowHeight <= 0 ? baseRowHeight : rowHeight;
            
            rowHeights.push(validRowHeight);
            totalNeededHeight += validRowHeight;
          });

          // Utiliser les hauteurs naturelles calculées - ne pas forcer à remplir tout l'espace
          // Le tableau s'agrandit automatiquement uniquement s'il y a plusieurs détails
          adjustedRowHeights = [...rowHeights];
          // totalNeededHeight contient déjà la somme des hauteurs naturelles
        }
        
        // === RENDU DES LIGNES DU TABLEAU DANS L'ESPACE FIXE ===
        let currentRowY = tableStartY; // Position Y courante pour les lignes
        let tableStartYCurrent = tableStartY; // Position Y actuelle du début du tableau (peut changer avec pagination)
        let actualTableHeight = 0; // Hauteur réelle utilisée par les lignes sur la première page
        let isFirstPage = true; // Indicateur pour savoir si on est sur la première page
        const firstPageTableStartY = tableStartY; // Sauvegarder la position de la première page pour la vérification
        
        console.log(`[PDF ${documentTitle}] Initialisation: tableStartY=${tableStartY}, tableStartYCurrent=${tableStartYCurrent}, firstPageTableStartY=${firstPageTableStartY}`);
        
        if (devisData && devisData.length > 0) {
          devisData.forEach((line, index) => {
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

            // Utiliser la hauteur précalculée et ajustée
            const validRowHeight = adjustedRowHeights[index] || baseRowHeight;

            // CRITIQUE : Vérifier AVANT de rendre la ligne si elle rentre dans l'espace restant du tableau
            // Si non, créer une nouvelle page AVANT de rendre la ligne
            const currentY = currentRowY;
            const estimatedNextY = currentY + validRowHeight;
            const tableEndY = tableStartYCurrent + maxTableHeight; // Fin du tableau max sur la page actuelle
            
            // Vérifier si la ligne dépasse la hauteur fixe du tableau
            // Si oui, créer une nouvelle page AVANT de rendre cette ligne
            if (estimatedNextY > tableEndY && !isNaN(estimatedNextY)) {
              // La ligne va dépasser, créer une nouvelle page AVANT de la rendre
              doc.addPage();
              currentPageNumber++;
              y = drawDocumentHeader(false);
              y = drawTableHeader(y);
              // Le contour sera dessiné après le rendu des lignes sur cette page
              const newTableStartY = y;
              // Réinitialiser la position Y pour les lignes
              currentRowY = newTableStartY;
              // Mettre à jour tableStartYCurrent pour les vérifications suivantes
              tableStartYCurrent = newTableStartY;
              // On n'est plus sur la première page
              isFirstPage = false;
            }

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
                  doc.addPage();
                  currentPageNumber++;
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
                  doc.text(ref || '', colRefX + 8, blockY + padding, { width: colRefWidth - 16, align: 'left' });
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
                      // Utiliser le mode continued pour éviter les retours à la ligne incorrects
                      let isFirstSegment = true;
                      
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
                        
                        const isLastSegment = (segIdx === lineData.segments.length - 1);
                        
                        if (isFirstSegment) {
                          // Premier segment: positionner à la position initiale
                          doc.text(segment.text, currentX, textY, { 
                            width: availableWidth,
                            align: 'left',
                            continued: !isLastSegment
                          });
                          isFirstSegment = false;
                        } else {
                          // Segments suivants: continuer le texte précédent
                          doc.text(segment.text, { 
                            width: availableWidth,
                            align: 'left',
                            continued: !isLastSegment
                          });
                        }
                      });
                      
                      // Terminer le texte si nécessaire
                      if (!isFirstSegment) {
                        doc.text('', { width: availableWidth, continued: false });
                      }
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
                [colDesignationX, colQteX, colPUX, colRX, colHTX].forEach(xPos => {
                  doc.moveTo(xPos, blockY).lineTo(xPos, blockY + rowHeight).stroke('#000');
                });
                
                // Mettre à jour les variables
                currentY = blockY + rowHeight;
                currentLineIdx = tempIdx;
                isFirstBlock = false;
                
                console.log('[PDF Nomenclature] Bloc rendu, nouveau Y:', currentY, 'Lignes restantes:', lineHeights.length - currentLineIdx);
                
                // Si il reste des lignes, passer à une nouvelle page
                if (currentLineIdx < lineHeights.length) {
                  doc.addPage();
                  currentPageNumber++;
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
            
            // Tous les éléments sur la même ligne horizontale (comme demande-achat)
            const validY = currentRowY;

            doc.font('Helvetica').fontSize(9).fillColor('#000000');
            
            // Désignation (avec HTML support) - même ligne
            // La fonction renderInlineHtml ajoute un padding de 2px de chaque côté
            // Estimer la hauteur pour déterminer l'alignement vertical
            const effectiveDesignationWidth = Math.max(0, colDesignationWidth - 4); // Largeur moins padding
            const designationPlain = (designationHtml || '')
              .replace(/<h[1-6][^>]*>/gi, '\n').replace(/<\/h[1-6]>/gi, '\n')
              .replace(/<ul[^>]*>/gi, '\n').replace(/<\/ul>/gi, '\n')
              .replace(/<li[^>]*>/gi, '\n• ').replace(/<\/li>/gi, '')
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<p[^>]*>/gi, '\n').replace(/<\/p>/gi, '\n')
              .replace(/<[^>]*>/g, '')
              .replace(/[ \t]+/g, ' ')
              .trim();
            
            // Estimer la hauteur du texte
            let estimatedHeight = baseRowHeight;
            if (effectiveDesignationWidth > 0 && designationPlain.length > 0) {
              try {
                const textHeight = doc.heightOfString(designationPlain || ' ', { width: effectiveDesignationWidth, align: 'left' });
                estimatedHeight = Math.max(baseRowHeight, Math.ceil(textHeight) + 4); // +4 pour le padding
              } catch (e) {
                estimatedHeight = baseRowHeight;
              }
            }
            
            const estimatedRowHeight = Math.max(validRowHeight, estimatedHeight);
            const centerY = validY + (estimatedRowHeight / 2) - 3;
            
            // Pour les lignes courtes (une seule ligne), aligner la désignation avec les autres colonnes
            // renderInlineHtml ajoute un padding de 2px, donc on ajuste le Y de départ pour aligner avec centerY
            const designationStartY = estimatedRowHeight <= validRowHeight + 5 
              ? centerY - 4.5  // Aligner avec centerY pour les lignes courtes (taille police 9 / 2 = 4.5)
              : validY;  // Commencer en haut pour les lignes longues
            
            // Rendre la désignation avec le bon alignement vertical
            // S'assurer qu'on a toujours quelque chose à rendre même si designationHtml est vide
            const designationToRender = designationHtml && String(designationHtml).trim() ? designationHtml : ' ';
            const actualDesignationHeight = renderInlineHtml(doc, designationToRender, colDesignationX, designationStartY, colDesignationWidth, null) || validRowHeight;
            
            // Utiliser la hauteur réelle retournée par renderInlineHtml, avec un minimum de validRowHeight
            const actualRowHeight = Math.max(validRowHeight, actualDesignationHeight + 2); // +2 pour le padding minimal
            
            // Recalculer centerY avec la hauteur réelle pour les autres colonnes
            const finalCenterY = validY + (actualRowHeight / 2) - 3;
            
            // Réf aligné à gauche, sur la même ligne que les autres colonnes
            doc.text(ref || '', colRefX + 8, finalCenterY, { width: colRefWidth - 16, align: 'left' });

            // Qté, P.U., R., H.T. alignés à droite - centrer verticalement dans la ligne
            doc.text(qte.toFixed(2).replace('.', ','), colQteX, finalCenterY, { width: colQteWidth, align: 'right' });
            doc.text(pu.toFixed(2).replace('.', ','), colPUX, finalCenterY, { width: colPUWidth, align: 'right' });
            const remiseText = (montantRemise > 0 ? montantRemise.toFixed(2).replace('.', ',') : '0,00');
            doc.text(remiseText, colRX, finalCenterY, { width: colRWidth, align: 'right' });
            doc.text(ht.toFixed(2).replace('.', ','), colHTX, finalCenterY, { width: colHTWidth, align: 'right' });

            // Mettre à jour currentRowY pour la ligne suivante avec la hauteur réelle
            currentRowY = validY + actualRowHeight;
            
            // Mettre à jour la hauteur dans adjustedRowHeights pour le calcul du tableau
            adjustedRowHeights[index] = actualRowHeight;
            
            // Mettre à jour la hauteur réelle utilisée (seulement pour la première page)
            // Calculer après la mise à jour de currentRowY pour avoir la hauteur correcte
            if (isFirstPage) {
              // La hauteur réelle est la position actuelle moins le début du tableau de la première page
              const newHeight = currentRowY - firstPageTableStartY;
              actualTableHeight = Math.max(actualTableHeight, newHeight);
              console.log(`[PDF Livraison] Ligne ${index + 1}: currentRowY=${currentRowY.toFixed(2)}, actualTableHeight=${actualTableHeight.toFixed(2)}, maxTableHeight=${maxTableHeight.toFixed(2)}, isFirstPage=${isFirstPage}, firstPageTableStartY=${firstPageTableStartY}`);
            }
          });
          
          // Utiliser la hauteur fixe maxTableHeight pour que le tableau occupe toujours l'espace jusqu'en bas
          // Le tableau a une taille fixe même s'il n'y a pas de détails
          let targetHeight = maxTableHeight; // Hauteur fixe pour occuper tout l'espace disponible
          
          if (targetHeight > 0 && !isNaN(targetHeight)) {
            // Dessiner le contour avec la hauteur réelle
            doc.roundedRect(tableStartX, tableStartY, tableWidth, targetHeight, tableBorderRadius).stroke('#000');
            // Dessiner les lignes verticales avec la hauteur réelle (positions mises à jour)
            doc.moveTo(colDesignationX, tableStartY).lineTo(colDesignationX, tableStartY + targetHeight).stroke('#000');
            doc.moveTo(colQteX, tableStartY).lineTo(colQteX, tableStartY + targetHeight).stroke('#000');
            doc.moveTo(colPUX, tableStartY).lineTo(colPUX, tableStartY + targetHeight).stroke('#000');
            doc.moveTo(colRX, tableStartY).lineTo(colRX, tableStartY + targetHeight).stroke('#000');
            doc.moveTo(colHTX, tableStartY).lineTo(colHTX, tableStartY + targetHeight).stroke('#000');
          }
          
          // Mettre à jour y pour être à la fin du tableau
          y = tableStartY + targetHeight;
        } else {
          // Si aucune ligne, utiliser la hauteur fixe maxTableHeight pour occuper tout l'espace
          // Redessiner avec hauteur fixe
          doc.roundedRect(tableStartX, tableStartY, tableWidth, maxTableHeight, tableBorderRadius).stroke('#000');
          doc.moveTo(colDesignationX, tableStartY).lineTo(colDesignationX, tableStartY + maxTableHeight).stroke('#000');
          doc.moveTo(colQteX, tableStartY).lineTo(colQteX, tableStartY + maxTableHeight).stroke('#000');
          doc.moveTo(colPUX, tableStartY).lineTo(colPUX, tableStartY + maxTableHeight).stroke('#000');
          doc.moveTo(colRX, tableStartY).lineTo(colRX, tableStartY + maxTableHeight).stroke('#000');
          doc.moveTo(colHTX, tableStartY).lineTo(colHTX, tableStartY + maxTableHeight).stroke('#000');
          y = tableStartY + maxTableHeight;
        }

        // === BLOC RÉCAPITULATIF HORIZONTAL (ne dépasse pas la moitié de la page, positionné à droite) ===
        // Ne pas afficher le bloc récapitulatif si le mode est "non_valorise"
        if (!isNonValorise) {
          // Vérifier s'il y a assez d'espace pour le bloc récapitulatif sur la page actuelle
          const recapTableHeight = 25;
          const recapTableRowHeight = 20;
          const recapTableTotalHeight = recapTableHeight + recapTableRowHeight;
          const spaceNeededForRecap = recapTableTotalHeight + 10; // 10px d'espace avant
          
          // Si pas assez d'espace, passer à la page suivante
          if (y + spaceNeededForRecap > footerY) {
            doc.addPage();
            currentPageNumber++;
            y = drawDocumentHeader(false);
          }
          
          y += 10; // Espace avant le bloc récapitulatif
          const recapTableY = y;
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
        }

        // Mention sur PDF (devis + bon de livraison) si exonération valide
        if (isClientExonerated && (isDevis || isLivraison)) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
          doc.text('TVA non applicable – Client exonéré conformément à la lettre d\'exonération en vigueur', 50, y, {
            width: 500,
            align: 'center'
          });
          y += 15;
        }

        // Mettre à jour le total de pages avant de finaliser
        try {
          const finalPageRange = doc.bufferedPageRange();
          if (finalPageRange && typeof finalPageRange.count === 'number' && finalPageRange.count > 0) {
            totalPagesNumber = finalPageRange.count;
          } else {
            totalPagesNumber = currentPageNumber;
          }
        } catch (e) {
          totalPagesNumber = currentPageNumber;
        }

        // === TABLEAU CONDITION / EXPÉDITION / TRANSPORTEUR avec bordures arrondies ===
        const condition = devisData[0]?.condition || '';
        const expedition = devisData[0]?.expedition || '';
        const transporteur = devisData[0]?.transporteur || '';

        // Afficher le tableau seulement si au moins une donnée existe
        if (condition || expedition || transporteur) {
          const conditionTableY = y;
          const conditionTableHeight = 18; // Réduit de 25 à 18
          const conditionTableRowHeight = 15; // Réduit de 20 à 15
          const conditionTableTotalHeight = conditionTableHeight + conditionTableRowHeight;

          // Tableau complet avec bordures arrondies (un seul rectangle)
          doc.roundedRect(50, conditionTableY, 510, conditionTableTotalHeight, tableBorderRadius).stroke('#000');

          // Ligne de séparation horizontale
          doc.moveTo(50, conditionTableY + conditionTableHeight).lineTo(560, conditionTableY + conditionTableHeight).stroke('#000');

          // Lignes de séparation verticales
          doc.moveTo(220, conditionTableY).lineTo(220, conditionTableY + conditionTableTotalHeight).stroke('#000');
          doc.moveTo(390, conditionTableY).lineTo(390, conditionTableY + conditionTableTotalHeight).stroke('#000');

          // En-tête (ligne 1)
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#000'); // Réduit de 9 à 8
          doc.text('Condition de règlement', 55, conditionTableY + 5, { width: 170, align: 'center' }); // Réduit de 8 à 5
          doc.text('Expédition', 225, conditionTableY + 5, { width: 170, align: 'center' });
          doc.text('Transporteur', 395, conditionTableY + 5, { width: 165, align: 'center' });

          // Valeurs (ligne 2)
          doc.font('Helvetica').fontSize(8); // Réduit de 9 à 8
          doc.text(condition, 55, conditionTableY + conditionTableHeight + 4, { width: 170, align: 'center' }); // Réduit de 6 à 4
          doc.text(expedition, 225, conditionTableY + conditionTableHeight + 4, { width: 170, align: 'center' });
          doc.text(transporteur, 395, conditionTableY + conditionTableHeight + 4, { width: 165, align: 'center' });

          y = conditionTableY + conditionTableTotalHeight + 10; // Réduit de 20 à 10 pour réduire l'espace
        }

        // === TABLEAU DE VÉRIFICATION (remplace les cadres Direction et Bon pour accord) ===
        // Ce tableau est affiché UNIQUEMENT dans les PDFs de livraison, APRÈS le montant en lettres
        // Il ne doit pas impacter l'affichage du tableau des détails
        if (isLivraison) {
          y += 10; // Espace avant le tableau de vérification
          
          // Calculer l'espace disponible avant le pied de page
          const verificationBottomMargin = 40;
          const verificationFooterHeight = 32;
          const footerYForVerification = pageHeight - verificationBottomMargin - verificationFooterHeight;
          const minSpaceBeforeFooter = 10;
          const maxYForVerificationTable = footerYForVerification - minSpaceBeforeFooter;
          
          // Dimensions du tableau de vérification
          const verificationTableWidth = 510;
          const verificationTableX = 50;
          const verificationHeaderHeight = 25;
          const verificationNumberOfRows = 6; // Quantité, Numéro de lot/série, Date de péremption, Indicateur, Nom et prénom du vérificateur, Signature
          const verificationRowHeight = 25; // Hauteur fixe par ligne (pas de compression)
          const verificationTableHeight = verificationHeaderHeight + (verificationRowHeight * verificationNumberOfRows);
          
          // Vérifier si on a assez d'espace pour le tableau de vérification sur la page actuelle
          const availableSpace = maxYForVerificationTable - y;
          
          // Si pas assez d'espace, passer à la page suivante
          if (availableSpace < verificationTableHeight) {
            doc.addPage();
            currentPageNumber++;
            y = drawDocumentHeader(false);
            y += 10; // Espace avant le tableau
          }
          
          const verificationTableY = y;
          
          // Définir les colonnes du tableau
          const colCriteresWidth = 220; // Colonne "Critères"
          const colConformeWidth = 90;  // Colonne "Conforme"
          const colNonConformeWidth = 100; // Colonne "Non Conforme"
          const colRemarquesWidth = 100; // Colonne "Remarques"
          
          const colCriteresX = verificationTableX;
          const colConformeX = colCriteresX + colCriteresWidth;
          const colNonConformeX = colConformeX + colConformeWidth;
          const colRemarquesX = colNonConformeX + colNonConformeWidth;
          
          // Dessiner le contour du tableau
          doc.roundedRect(verificationTableX, verificationTableY, verificationTableWidth, verificationTableHeight, tableBorderRadius).stroke('#000');
          
          // Ligne horizontale de l'en-tête
          doc.moveTo(verificationTableX, verificationTableY + verificationHeaderHeight).lineTo(verificationTableX + verificationTableWidth, verificationTableY + verificationHeaderHeight).stroke('#000');
          
          // Lignes verticales de séparation
          doc.moveTo(colConformeX, verificationTableY).lineTo(colConformeX, verificationTableY + verificationTableHeight).stroke('#000');
          doc.moveTo(colNonConformeX, verificationTableY).lineTo(colNonConformeX, verificationTableY + verificationTableHeight).stroke('#000');
          doc.moveTo(colRemarquesX, verificationTableY).lineTo(colRemarquesX, verificationTableY + verificationTableHeight).stroke('#000');
          
          // En-tête du tableau
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
          doc.text('Critères', colCriteresX + 5, verificationTableY + 8, { width: colCriteresWidth - 10, align: 'left' });
          doc.text('Conforme', colConformeX + 5, verificationTableY + 8, { width: colConformeWidth - 10, align: 'center' });
          doc.text('Non Conforme', colNonConformeX + 5, verificationTableY + 8, { width: colNonConformeWidth - 10, align: 'center' });
          doc.text('Remarques', colRemarquesX + 5, verificationTableY + 8, { width: colRemarquesWidth - 10, align: 'left' });
          
          // Lignes horizontales entre les lignes
          for (let i = 1; i <= verificationNumberOfRows; i++) {
            const lineY = verificationTableY + verificationHeaderHeight + (verificationRowHeight * i);
            doc.moveTo(verificationTableX, lineY).lineTo(verificationTableX + verificationTableWidth, lineY).stroke('#000');
          }
          
          // Contenu des lignes
          const criteria = [
            'Quantité',
            'Numéro de lot/série',
            '!date de péremption',
            'Indicateur',
            'Nom et prénom du vérificateur :',
            'Signature :'
          ];
          
          doc.font('Helvetica').fontSize(9).fillColor('#000');
          criteria.forEach((criterion, index) => {
            const rowY = verificationTableY + verificationHeaderHeight + (verificationRowHeight * index) + 6;
            doc.text(criterion, colCriteresX + 5, rowY, { width: colCriteresWidth - 10, align: 'left' });
            // Les colonnes Conforme, Non Conforme et Remarques restent vides pour être remplies manuellement
          });
          
          y = verificationTableY + verificationTableHeight + 10;
        }

        // === PIED DE PAGE - Mettre à jour la numérotation sur TOUTES les pages ===
        // Utiliser simplement le compteur de pages comme total (il est incrémenté à chaque addPage)
        totalPagesNumber = currentPageNumber;

        // Redessiner le footer sur toutes les pages avec la numérotation correcte
        // Les pages sont indexées à partir de 1 dans PDFKit
        for (let i = 1; i <= totalPagesNumber; i++) {
          try {
            doc.switchToPage(i);
            drawPageFooter(i);
          } catch (e) {
            console.error(
              `[PDF] Erreur lors du dessin du footer sur la page ${i}:`,
              e.message
            );
          }
        }
        
        // Retourner à la dernière page
        if (totalPagesNumber > 0) {
          try {
            doc.switchToPage(totalPagesNumber);
          } catch (e) {
            // Ignorer l'erreur
          }
        }

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

  // Génère le PDF en mémoire (buffer) sans sauvegarde sur disque
  async genererPDFBuffer(devisData, options = {}) {
    console.log('[EmailService] 📄 Début genererPDFBuffer (en mémoire)');
    if (!devisData || devisData.length === 0) {
      console.error('[EmailService] ❌ devisData est vide ou indéfini');
      throw new Error('Données du document manquantes pour la génération du PDF');
    }
    return new Promise(async (resolve, reject) => {
      try {
        // Réutiliser la même logique que genererPDF mais avec buffer au lieu de fichier
        const printMode = (options.printMode || 'normal').toLowerCase();
        const part_id = devisData?.[0]?.part_id;
        const documentType0 = devisData?.[0]?.type;
        const documentKind0 = devisData?.[0]?.document_kind;
        const isRetour0 = documentKind0 === 'RETOUR CLIENT' || documentType0 === 5;
        const isLivraison0 = documentKind0 === 'LIVRAISON' || documentType0 === 2;
        const isDevis0 = !isRetour0 && !isLivraison0;

        // Gestion de la nomenclature (même logique que genererPDF)
        if (printMode === 'nomenclature' && isDevis0) {
          const sequelizeConn = options.sequelize || require('../config/database');
          const compose = options.composeArticle || {};
          let composeId = compose.article_id ? parseInt(compose.article_id, 10) : null;
          let nomLines = [];

          if (!composeId) {
            const componentIds = Array.from(new Set((devisData || [])
              .map(l => l.article_id)
              .filter(id => id !== null && id !== undefined)
              .map(id => parseInt(id, 10))
              .filter(id => !isNaN(id))));

            if (componentIds.length > 0) {
              const candidates = await sequelizeConn.query(
                `SELECT TOP 1 n.Compose_id, SUM(CASE WHEN n.Composant_id IN (:componentIds) THEN 1 ELSE 0 END) AS present_count, COUNT(*) AS total_count FROM article_Nomenclature n GROUP BY n.Compose_id ORDER BY CASE WHEN SUM(CASE WHEN n.Composant_id IN (:componentIds) THEN 1 ELSE 0 END) = COUNT(*) THEN 0 ELSE 1 END, SUM(CASE WHEN n.Composant_id IN (:componentIds) THEN 1 ELSE 0 END) DESC, COUNT(*) ASC`,
                { replacements: { componentIds }, type: sequelizeConn.QueryTypes.SELECT }
              );
              if (candidates && candidates.length > 0) {
                composeId = parseInt(candidates[0].Compose_id, 10);
              }
            }
          }

          let composeArticleDb = null;
          if (composeId) {
            const rows = await sequelizeConn.query(
              `SELECT TOP 1 article_id, article_cod, article_nom, prix_vente, quill_editor, quantite FROM article WHERE article_id = :composeId`,
              { replacements: { composeId }, type: sequelizeConn.QueryTypes.SELECT }
            );
            composeArticleDb = rows?.[0] || null;
          }

          let composantsData = [];
          if (composeId) {
            composantsData = await sequelizeConn.query(
              `SELECT n.Composant_id, n.Quantite AS composant_qte, a.article_cod AS composant_cod, a.article_nom AS composant_nom FROM article_Nomenclature n LEFT JOIN article a ON a.article_id = n.Composant_id WHERE n.Compose_id = :composeId ORDER BY a.article_nom ASC`,
              { replacements: { composeId }, type: sequelizeConn.QueryTypes.SELECT }
            );
          }

          const composePrix = !isNaN(Number(compose.prix)) && Number(compose.prix) > 0
            ? Number(compose.prix)
            : (!isNaN(Number(composeArticleDb?.prix_vente)) ? Number(composeArticleDb?.prix_vente) : 0);
          const composeQte = !isNaN(Number(compose.quantite)) && Number(compose.quantite) > 0
            ? Number(compose.quantite)
            : (!isNaN(Number(composeArticleDb?.quantite)) && Number(composeArticleDb?.quantite) > 0 ? Number(composeArticleDb?.quantite) : 1);
          const composeNom = compose.article_nom || composeArticleDb?.article_nom || '';
          const composeCod = compose.article_cod || composeArticleDb?.article_cod || '';

          const base = devisData[0] || {};
          const tauxTva = isNaN(Number(base.taux_tva)) ? 0.2 : Number(base.taux_tva);
          const ht = composePrix * composeQte;

          let designationHtml = `<h3 style="color: #046ba7;"><strong>Composé</strong></h3><p><strong>- ${composeNom}</strong></p>`;
          if (composantsData && composantsData.length > 0) {
            designationHtml += `<h3 style="color: #046ba7;"><strong>Composants</strong></h3><ul>`;
            composantsData.forEach((comp) => {
              const qte = !isNaN(Number(comp.composant_qte)) ? Number(comp.composant_qte) : 1;
              const nom = comp.composant_nom || comp.composant_cod || 'Composant';
              const cod = comp.composant_cod || '';
              designationHtml += `<li><strong style="color: #c00000;">${cod}</strong> - ${nom} <span style="color: #7030a0;">(Qté: ${qte})</span></li>`;
            });
            designationHtml += '</ul>';
          }

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

        // Exonération TVA (même logique)
        let isClientExonerated = false;
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
          } catch (e) {
            isClientExonerated = false;
          }
        }

        // Détecter le type de document
        // Si forceDocumentType est fourni dans les options, l'utiliser (pour forcer DEVIS depuis l'interface des devis)
        const forceDocumentType = options.forceDocumentType ? options.forceDocumentType.toString().toUpperCase().trim() : null;
        
        const documentType = devisData[0]?.type;
        const documentKind = devisData[0]?.document_kind;
        
        let isRetour = false;
        let isLivraison = false;
        let isDevis = true;
        
        if (forceDocumentType) {
          // Forcer le type de document selon l'option fournie
          if (forceDocumentType === 'DEVIS') {
            isDevis = true;
            isRetour = false;
            isLivraison = false;
          } else if (forceDocumentType === 'LIVRAISON' || forceDocumentType === 'BON DE LIVRAISON') {
            isLivraison = true;
            isDevis = false;
            isRetour = false;
          } else if (forceDocumentType === 'RETOUR' || forceDocumentType === 'RETOUR CLIENT' || forceDocumentType === 'BON DE RETOUR') {
            isRetour = true;
            isDevis = false;
            isLivraison = false;
          }
        } else {
          // Détection automatique (comportement par défaut)
          isRetour = documentKind === 'RETOUR CLIENT' || documentType === 5;
          isLivraison = documentKind === 'LIVRAISON' || documentType === 2;
          isDevis = !isRetour && !isLivraison;
        }

        let documentTitle = 'DEVIS';
        let headerLabel = 'Devis N°';
        if (isRetour) {
          documentTitle = 'BON DE RETOUR';
          headerLabel = 'Retour N°';
        } else if (isLivraison) {
          documentTitle = 'BON DE LIVRAISON';
          headerLabel = 'Livraison N°';
        }

        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        
        // Utiliser des buffers au lieu de writeStream
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', (err) => {
          console.error('❌ Erreur génération PDF buffer :', err);
          reject(err);
        });

        // Réutiliser toute la logique de génération du PDF depuis genererPDF
        // Pour simplifier, on va appeler genererPDF et lire le fichier généré
        // Le fichier sera conservé sur disque (sera supprimé après 1h par la route)
        const tempPath = await this.genererPDF(devisData, options);
        const pdfBuffer = fs.readFileSync(tempPath);
        // Ne pas supprimer le fichier immédiatement - il sera supprimé après 1h par la route
        // fs.unlinkSync(tempPath); // Commenté pour conserver le fichier
        resolve(pdfBuffer);
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


      // Note: Dans email.service.js, on ne peut pas utiliser req directement
      // On utilise BASE_URL depuis l'env ou une valeur par défaut
      const BASE_URL = process.env.BASE_URL || 'http://172.16.20.100';
      return {
        success: true,
        message: `E-mail et ${label} envoyés avec succès`,
        pdfUrl: `${BASE_URL}/${folder}/${path.basename(pdfPath)}`
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


      // Note: Dans email.service.js, on ne peut pas utiliser req directement
      // On utilise BASE_URL depuis l'env ou une valeur par défaut
      const BASE_URL = process.env.BASE_URL || 'http://172.16.20.100';
      return {
        success: true,
        message: 'E-mail et bon de commande envoyés avec succès',
        pdfUrl: `${BASE_URL}/commandes/${path.basename(pdfPath)}`
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
