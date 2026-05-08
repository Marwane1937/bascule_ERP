const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { renderFormattedText } = require('../pdf-format-helper');
const pdfConfigService = require('../pdf-config.service');

function stripHtmlTags(str) {
  if (!str) return '';
  return String(str).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(value) {
  return safeNumber(value, 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatQte(value) {
  return `${Math.round(safeNumber(value, 0))}`;
}

function drawCompanyHeader(doc, options = {}) {
  const logoSize = options.documentSociete?.logoSize || { width: 95, height: null };
  const configuredLogoTop = Number(options.documentSociete?.logoTop);
  const logoTop = Number.isFinite(configuredLogoTop) ? configuredLogoTop : 14;
  const imageOptions = { width: logoSize.width || 95 };
  if (logoSize.height) imageOptions.height = logoSize.height;

  let logoDrawn = false;
  if (options.documentSociete?.logo) {
    try {
      doc.image(Buffer.from(options.documentSociete.logo, 'base64'), 45, logoTop, imageOptions);
      logoDrawn = true;
    } catch (_) {}
  }
  if (!logoDrawn) {
    try {
      const logoPath = options.documentSociete?.logoPath || pdfConfigService.getLogoPath();
      if (logoPath && fs.existsSync(logoPath)) {
        doc.image(logoPath, 45, logoTop, imageOptions);
        logoDrawn = true;
      }
    } catch (_) {}
  }

  if (options.documentSociete?.entete) {
    renderFormattedText(doc, options.documentSociete.entete, {
      startX: 155,
      startY: 20,
      defaultFontSize: 10,
      defaultColor: '#046ba7',
      defaultFont: 'Helvetica-Bold',
      defaultAlign: 'left',
      defaultLineSpacing: 12,
      width: 390
    });
  }
}

function drawFooter(doc, options = {}, pageNumber = 1) {
  const footerTop = 772;
  doc.save();
  doc.rect(35, footerTop, 525, 35).fill('#f6f8fb');
  doc.restore();
  doc.rect(35, footerTop, 525, 35).stroke('#cfd8e3');

  if (options.documentSociete?.pied_page) {
    renderFormattedText(doc, options.documentSociete.pied_page, {
      startX: 45,
      startY: footerTop + 6,
      defaultFontSize: 8,
      defaultColor: '#374151',
      defaultFont: 'Helvetica',
      defaultAlign: 'left',
      defaultLineSpacing: 9,
      width: 445
    });
  }

  doc.font('Helvetica').fontSize(8).fillColor('#4b5563')
    .text(`Page ${pageNumber}`, 500, footerTop + 12, { width: 45, align: 'right' });
}

function computeClientBox(doc, lines, width) {
  doc.font('Helvetica').fontSize(9);
  const heights = lines.map((line) => Math.max(11, doc.heightOfString(line, { width })));
  return {
    heights,
    total: heights.reduce((s, h) => s + h, 0) + Math.max(0, lines.length - 1) * 2
  };
}

function drawPageHeader(doc, firstLine, options = {}) {
  const tableBorderRadius = 6;
  drawCompanyHeader(doc, options);

  doc.lineWidth(1).moveTo(40, 102).lineTo(560, 102).stroke('#000');
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#000')
    .text('ENTREE DE STOCK', 45, 120);

  const partyBoxX = 300;
  const partyBoxY = 112;
  const partyBoxW = 260;
  const partyLines = [
    `Fournisseur : ${firstLine.fournisseur || firstLine.client || ''}`,
    `Adresse : ${firstLine.adresse || ''}`,
    `ICE : ${firstLine.ice || ''}`
  ].filter((line, idx) => idx < 2 || String(line).trim() !== 'ICE :');

  const innerWidth = partyBoxW - 20;
  const metrics = computeClientBox(doc, partyLines, innerWidth);
  const partyBoxH = Math.max(68, Math.ceil(metrics.total + 20));

  doc.roundedRect(partyBoxX, partyBoxY, partyBoxW, partyBoxH, tableBorderRadius).stroke('#000');
  let lineY = partyBoxY + 10;
  partyLines.forEach((line, idx) => {
    doc.font('Helvetica').fontSize(9).fillColor('#000')
      .text(line, partyBoxX + 10, lineY, { width: innerWidth, align: 'left' });
    lineY += metrics.heights[idx] + 2;
  });

  const infoTableY = Math.max(205, partyBoxY + partyBoxH + 8);
  const infoHeaderH = 24;
  const infoRowH = 20;
  const infoTotalH = infoHeaderH + infoRowH;

  doc.roundedRect(50, infoTableY, 510, infoTotalH, tableBorderRadius).stroke('#000');
  doc.moveTo(50, infoTableY + infoHeaderH).lineTo(560, infoTableY + infoHeaderH).stroke('#000');
  doc.moveTo(230, infoTableY).lineTo(230, infoTableY + infoTotalH).stroke('#000');
  doc.moveTo(410, infoTableY).lineTo(410, infoTableY + infoTotalH).stroke('#000');

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');
  doc.text('N° Entrée', 55, infoTableY + 7, { width: 175, align: 'center' });
  doc.text('Date', 235, infoTableY + 7, { width: 175, align: 'center' });
  doc.text('Référence', 415, infoTableY + 7, { width: 140, align: 'center' });

  doc.font('Helvetica').fontSize(9);
  doc.text(`${firstLine.numero || ''}`, 55, infoTableY + infoHeaderH + 5, { width: 175, align: 'center' });
  doc.text(firstLine.date ? new Date(firstLine.date).toLocaleDateString('fr-FR') : '', 235, infoTableY + infoHeaderH + 5, { width: 175, align: 'center' });
  doc.text(`${firstLine.client_ref || ''}`, 415, infoTableY + infoHeaderH + 5, { width: 140, align: 'center' });

  return infoTableY + infoTotalH + 12;
}

function drawTableHeader(doc, y) {
  const x = 40;
  const w = 525;
  const h = 24;
  const cols = [90, 280, 100, 55];

  doc.roundedRect(x, y, w, h, 6).fillAndStroke('#e6e6e6', '#000');
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#000');

  const labels = ['Réf', 'Désignation', 'Rubrique', 'Qté'];
  let cursor = x;
  labels.forEach((label, i) => {
    const width = cols[i];
    doc.text(label, cursor + 2, y + 7, { width: width - 4, align: i >= 2 ? 'center' : 'center' });
    cursor += width;
  });

  return { x, w, h, cols };
}

function drawDetailsTable(doc, rows, startY, options = {}) {
  const footerReserve = 88;
  const pageBottom = 842 - footerReserve;
  let pageNumber = 1;
  let y = startY;
  let tableMeta = drawTableHeader(doc, y);
  y += tableMeta.h;
  let bodyTop = y;

  const addPage = () => {
    // Clôturer le corps du tableau de la page courante
    const pageBodyBottom = Math.max(y, bodyTop + 220);
    doc.rect(40, bodyTop, 525, pageBodyBottom - bodyTop).stroke('#000');
    let vx = 40;
    for (let i = 0; i < tableMeta.cols.length - 1; i++) {
      vx += tableMeta.cols[i];
      doc.moveTo(vx, bodyTop).lineTo(vx, pageBodyBottom).stroke('#000');
    }

    drawFooter(doc, options, pageNumber);
    doc.addPage();
    pageNumber += 1;
    y = drawPageHeader(doc, rows[0], options);
    tableMeta = drawTableHeader(doc, y);
    y += tableMeta.h;
    bodyTop = y;
  };

  const colStarts = [40];
  tableMeta.cols.reduce((acc, width) => {
    colStarts.push(acc + width);
    return acc + width;
  }, 40);

  doc.font('Helvetica').fontSize(8.5).fillColor('#000');
  rows.forEach((item) => {
    const ref = String(item.article_cod || '').trim();
    const designation = stripHtmlTags(item.article || item.designation || item.article_nom || '');
    const rubrique = String(item.rubrique_nom || '').trim();
    const qte = formatQte(item.quantite);

    const designationHeight = Math.max(14, doc.heightOfString(designation || ' ', { width: tableMeta.cols[1] - 8 }));
    const rowHeight = Math.max(18, Math.ceil(designationHeight + 6));

    if (y + rowHeight > pageBottom) addPage();
    const rowY = y;
    const centerY = rowY + Math.max(0, (rowHeight - 10) / 2);
    doc.text(ref, colStarts[0] + 3, centerY, { width: tableMeta.cols[0] - 6, align: 'left' });
    doc.text(designation, colStarts[1] + 4, rowY + 3, { width: tableMeta.cols[1] - 8, align: 'left' });
    doc.text(rubrique, colStarts[2] + 2, centerY, { width: tableMeta.cols[2] - 4, align: 'center' });
    doc.text(qte, colStarts[3] + 2, centerY, { width: tableMeta.cols[3] - 4, align: 'center' });
    y += rowHeight;
  });

  const currentBodyBottom = Math.min(Math.max(y, bodyTop + 220), pageBottom);
  doc.rect(40, bodyTop, 525, currentBodyBottom - bodyTop).stroke('#000');
  let vx = 40;
  for (let i = 0; i < tableMeta.cols.length - 1; i++) {
    vx += tableMeta.cols[i];
    doc.moveTo(vx, bodyTop).lineTo(vx, currentBodyBottom).stroke('#000');
  }

  return { finalY: currentBodyBottom, pageNumber };
}

function genererPDF(entreeStockData, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      if (!Array.isArray(entreeStockData) || entreeStockData.length === 0) {
        throw new Error('Aucune donnée d\'entrée de stock fournie');
      }

      if (!options.documentSociete) {
        options.documentSociete = pdfConfigService.getDocumentSociete();
      }

      const firstLine = entreeStockData[0];
      const entreesStockDir = path.join(__dirname, '..', '..', 'public', 'entrees-stock');
      if (!fs.existsSync(entreesStockDir)) fs.mkdirSync(entreesStockDir, { recursive: true });

      const fournisseurName = (firstLine.fournisseur || 'fournisseur').replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
      const entreeStockNum = firstLine.numero || `ES-${Date.now()}`;
      const fileName = `entree_stock_${entreeStockNum}_${fournisseurName}.pdf`;
      const pdfPath = path.join(entreesStockDir, fileName);

      const doc = new PDFDocument({ margin: 35, size: 'A4' });
      const writeStream = fs.createWriteStream(pdfPath);
      doc.pipe(writeStream);

      writeStream.on('finish', () => resolve(pdfPath));
      writeStream.on('error', reject);

      let y = drawPageHeader(doc, firstLine, options);
      const result = drawDetailsTable(doc, entreeStockData, y, options);

      const totalQte = entreeStockData.reduce((sum, item) => sum + safeNumber(item.quantite), 0);
      const summaryY = Math.min(result.finalY + 12, 730);
      doc.roundedRect(380, summaryY, 185, 28, 6).stroke('#000');
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000')
        .text('Qté totale', 390, summaryY + 8, { width: 85, align: 'left' });
      doc.font('Helvetica').fontSize(10)
        .text(`${Math.round(totalQte)}`, 475, summaryY + 8, { width: 80, align: 'right' });

      if (options.withStamp) {
        doc.font('Helvetica').fontSize(8).fillColor('#4b5563')
          .text('Document validé et cacheté', 40, Math.min(summaryY + 38, 760), { width: 520, align: 'center' });
      }

      drawFooter(doc, options, result.pageNumber);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  genererPDF
};
