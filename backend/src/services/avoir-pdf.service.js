const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Service dédié à la génération de PDF pour les AVOIRS
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

const units = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const tens = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function underHundredFR(n) {
    if (n < 17) return units[n];
    if (n < 20) return 'dix-' + units[n - 10];
    if (n < 70) {
        const ten = Math.floor(n / 10);
        const unit = n % 10;
        if (unit === 0) return tens[ten];
        if (unit === 1 && [2, 3, 4, 5, 6].includes(ten)) return tens[ten] + '-et-un';
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
    if (hundred === 1) words = 'cent';
    else words = units[hundred] + ' cent';
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
        if (thousands === 1) words += 'mille';
        else words += numberToWordsFR(thousands) + ' mille';
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
    if (centimes > 0) words += ' et ' + numberToWordsFR(centimes) + (centimes > 1 ? ' centimes' : ' centime');
    if (amount < 0) words = 'moins ' + words;
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

class AvoirPdfService {
    async genererPDF(avoirData, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                if (!Array.isArray(avoirData) || avoirData.length === 0) {
                    reject(new Error('Aucune donnée d\'avoir disponible pour la génération PDF.'));
                    return;
                }

                const avoirsDir = path.join(__dirname, '..', 'public', 'avoirs');
                if (!fs.existsSync(avoirsDir)) {
                    fs.mkdirSync(avoirsDir, { recursive: true });
                }

                const fileName = `avoir-${Date.now()}.pdf`;
                const pdfPath = path.join(avoirsDir, fileName);

                const doc = new PDFDocument({ margin: 40, size: 'A4' });
                const writeStream = fs.createWriteStream(pdfPath);

                writeStream.on('finish', () => resolve(pdfPath));
                writeStream.on('error', (err) => reject(err));

                doc.pipe(writeStream);

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

                // Header
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

                // Titre
                doc.fontSize(20).font('Helvetica-Bold').fillColor('#000').text('AVOIR CLIENT', 50, 150);

                const firstLine = avoirData[0];

                // Bloc Client
                const clientTop = 140;
                const clientBoxHeight = 85;
                drawRoundedRectOutline(doc, 300, clientTop, 260, clientBoxHeight, 8);

                const clientName = firstLine.client || firstLine.nom_client || '';
                const clientAdresse = firstLine.adresse || '';
                const clientVille = firstLine.ville || '';
                const clientICE = firstLine.ice || '';

                const lineHeight = 16;
                let currentY = clientTop + 12;

                doc.fontSize(10).font('Helvetica');
                const clientLabel = 'Client : ';
                doc.text(clientLabel, 310, currentY);
                doc.fontSize(10).font('Helvetica-Bold');
                const clientLabelWidth = doc.widthOfString(clientLabel);
                const maxClientNameWidth = 240;

                const clientNameWidth = doc.widthOfString(clientName);
                if (clientNameWidth > maxClientNameWidth) {
                    const nameLines = doc.heightOfString(clientName, { width: maxClientNameWidth });
                    doc.text(clientName, 310 + clientLabelWidth, currentY, { width: maxClientNameWidth, align: 'left' });
                    currentY += Math.ceil(nameLines) + 4;
                } else {
                    doc.text(clientName, 310 + clientLabelWidth, currentY);
                    currentY += lineHeight;
                }

                doc.fontSize(10).font('Helvetica');
                if (clientAdresse) {
                    const adresseText = `Adresse: ${clientAdresse}`;
                    const adresseWidth = doc.widthOfString(adresseText);
                    if (adresseWidth > 240) {
                        doc.text(adresseText, 310, currentY, { width: 240, align: 'left' });
                        const adresseHeight = doc.heightOfString(adresseText, { width: 240 });
                        currentY += Math.ceil(adresseHeight) + 4;
                    } else {
                        doc.text(adresseText, 310, currentY);
                        currentY += lineHeight;
                    }
                }
                if (clientVille) {
                    doc.text(clientVille, 310, currentY);
                    currentY += lineHeight;
                }
                if (clientICE) {
                    const iceLabel = 'ICE : ';
                    doc.text(iceLabel, 310, currentY);
                    doc.font('Helvetica-Bold');
                    doc.text(clientICE, 310 + doc.widthOfString(iceLabel), currentY);
                    doc.font('Helvetica');
                }

                // Infos Avoir
                const infoX = 50;
                const infoY = clientTop + clientBoxHeight + 35;
                const infoWidth = 510;
                const infoHeaderHeight = 25;
                const infoRowHeight = 20;
                const infoRadius = 8;

                drawRoundedRectOutline(doc, infoX, infoY, infoWidth, infoHeaderHeight + infoRowHeight, infoRadius);
                drawRoundedTableDivider(doc, infoX + infoRadius, infoY + infoHeaderHeight, infoX + infoWidth - infoRadius, infoY + infoHeaderHeight);

                const infoColSeparators = [infoX + 255];
                infoColSeparators.forEach(x => {
                    drawRoundedTableDivider(doc, x, infoY + infoHeaderHeight, x, infoY + infoHeaderHeight + infoRowHeight - 1);
                });

                doc.font('Helvetica-Bold').fontSize(9);
                doc.text('Avoir N°', infoX + 10, infoY + 7, { width: 245, align: 'center' });
                doc.text('Date', infoX + 265, infoY + 7, { width: 245, align: 'center' });

                const formattedDate = firstLine.date ? new Date(firstLine.date).toLocaleDateString('fr-FR') : '';
                doc.font('Helvetica').fontSize(9);
                doc.text(`${firstLine.numero || ''}`, infoX + 10, infoY + infoHeaderHeight + 5, { width: 245, align: 'center' });
                doc.text(formattedDate, infoX + 265, infoY + infoHeaderHeight + 5, { width: 245, align: 'center' });

                // Tableau
                let y = infoY + infoHeaderHeight + infoRowHeight + 15;
                const tableX = 50;
                const tableWidth = 510;
                const headerHeight = 20;
                const radius = 8;

                const tableRows = [];
                let totalHT = 0;
                let totalTVA = 0;
                let totalTTC = 0;

                avoirData.forEach((line) => {
                    const ref = line.article_cod || '';
                    const designation = line.article_nom || line.article || line.designation || '';
                    const qte = parseFloat(line.quantite) || 0;
                    const pu = parseFloat(line.prix) || 0;
                    const remise = parseFloat(line.remise) || 0;
                    const remiseMontant = parseFloat(line.remise_montant) || 0;

                    let ht = qte * pu;
                    if (remiseMontant > 0) ht -= remiseMontant;
                    else if (remise > 0 && remise <= 1) ht *= (1 - remise);
                    else if (remise > 1) ht *= (1 - remise / 100);

                    const tva = ht * (parseFloat(line.taux_tva) || 0);
                    const ttc = ht + tva;

                    totalHT += ht;
                    totalTVA += tva;
                    totalTTC += ttc;

                    let remiseValueText = '0,00';
                    let remiseSymbol = '';
                    if (remiseMontant > 0) remiseValueText = remiseMontant.toFixed(2).replace('.', ',');
                    else if (remise > 0) {
                        remiseValueText = (remise <= 1 ? remise * 100 : remise).toFixed(2).replace('.', ',');
                        remiseSymbol = '%';
                    }

                    const designationPlain = designation.replace(/<[^>]*>/g, '').trim();
                    const effectiveDesignationWidth = 250 - 16;
                    doc.fontSize(9).font('Helvetica');
                    const textHeight = doc.heightOfString(designationPlain || ' ', { width: effectiveDesignationWidth, align: 'left' });
                    const rowHeight = Math.max(20, Math.ceil(textHeight) + 16 + 10);

                    tableRows.push({
                        ref,
                        designation: designationPlain,
                        qteText: qte.toFixed(2).replace('.', ','),
                        puText: pu.toFixed(2).replace('.', ','),
                        remiseValueText,
                        remiseSymbol,
                        htText: ht.toFixed(2).replace('.', ','),
                        rowHeight
                    });
                });

                const bodyHeight = tableRows.reduce((sum, row) => sum + row.rowHeight, 0);
                const tableHeight = headerHeight + bodyHeight;

                if (y + tableHeight > 760) {
                    doc.addPage();
                    y = 50;
                }

                doc.save();
                doc.lineJoin('round');
                doc.roundedRect(tableX, y, tableWidth, headerHeight, radius).fill('#f2f2f2');
                doc.restore();

                drawRoundedRectOutline(doc, tableX, y, tableWidth, tableHeight, radius);
                const columnSeparators = [100, 350, 410, 460, 510];
                drawRoundedTableDivider(doc, tableX + radius, y + headerHeight, tableX + tableWidth - radius, y + headerHeight);
                columnSeparators.forEach(x => drawRoundedTableDivider(doc, x, y + radius, x, y + tableHeight - radius));

                const headerLabels = ['Réf', 'Désignation', 'Qte', 'P.U.', 'R.', 'HT'];
                const headerPositions = [75, 108, 380, 435, 485, 535];
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
                headerLabels.forEach((label, idx) => {
                    if (idx === 1) doc.text(label, headerPositions[idx], y + 6);
                    else {
                        const textWidth = doc.widthOfString(label);
                        doc.text(label, headerPositions[idx] - textWidth / 2, y + 6);
                    }
                });

                let rowY = y + headerHeight;
                tableRows.forEach((row, index) => {
                    doc.font('Helvetica').fontSize(9).fillColor('#000000');
                    const refWidth = doc.widthOfString(row.ref);
                    doc.text(row.ref, 75 - refWidth / 2, rowY + 6);
                    renderInlineHtml(doc, avoirData[index].article_nom || avoirData[index].article || avoirData[index].designation || '', 100, rowY, 250, row.rowHeight);
                    const qteWidth = doc.widthOfString(row.qteText);
                    doc.text(row.qteText, 380 - qteWidth / 2, rowY + 6);
                    const puWidth = doc.widthOfString(row.puText);
                    doc.text(row.puText, 435 - puWidth / 2, rowY + 6);
                    const remiseText = row.remiseValueText + row.remiseSymbol;
                    const remiseWidth = doc.widthOfString(remiseText);
                    doc.text(remiseText, 485 - remiseWidth / 2, rowY + 6);
                    const htWidth = doc.widthOfString(row.htText);
                    doc.text(row.htText, 535 - htWidth / 2, rowY + 6);
                    rowY += row.rowHeight;
                    if (index < tableRows.length - 1) drawRoundedTableDivider(doc, tableX + radius, rowY, tableX + tableWidth - radius, rowY);
                });

                y = rowY + 10;
                const totalsStartX = 350;
                const totalsWidth = 210;
                const totalsHeight = 60;
                drawRoundedRectOutline(doc, totalsStartX, y, totalsWidth, totalsHeight, 6);
                drawRoundedTableDivider(doc, totalsStartX + 6, y + 30, totalsStartX + totalsWidth - 6, y + 30);
                const totalsColWidth = totalsWidth / 3;
                drawRoundedTableDivider(doc, totalsStartX + totalsColWidth, y + 6, totalsStartX + totalsColWidth, y + 54);
                drawRoundedTableDivider(doc, totalsStartX + totalsColWidth * 2, y + 6, totalsStartX + totalsColWidth * 2, y + 54);

                doc.font('Helvetica-Bold').fontSize(9);
                ['Total HT', 'Total TVA', 'Total TTC'].forEach((label, idx) => {
                    const labelWidth = doc.widthOfString(label);
                    doc.text(label, totalsStartX + idx * totalsColWidth + totalsColWidth / 2 - labelWidth / 2, y + 8);
                });

                doc.font('Helvetica').fontSize(9);
                const htText = totalHT.toFixed(2).replace('.', ',');
                const tvaText = totalTVA.toFixed(2).replace('.', ',');
                const ttcText = totalTTC.toFixed(2).replace('.', ',');
                doc.text(htText, totalsStartX + totalsColWidth / 2 - doc.widthOfString(htText) / 2, y + 38);
                doc.text(tvaText, totalsStartX + totalsColWidth + totalsColWidth / 2 - doc.widthOfString(tvaText) / 2, y + 38);
                doc.text(ttcText, totalsStartX + totalsColWidth * 2 + totalsColWidth / 2 - doc.widthOfString(ttcText) / 2, y + 38);

                y += totalsHeight + 20;
                const totalTTCWords = convertAmountToWordsFR(totalTTC);
                doc.font('Helvetica-Oblique').fontSize(12).fillColor('#2c3e50');
                const phraseText = 'Arrêté le présent avoir à la somme de :';
                doc.text(phraseText, 50, y);
                doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000');
                doc.text(totalTTCWords, 50 + doc.widthOfString(phraseText) + 8, y);

                // Footer
                const footerBgColor = '#E8F4F8';
                const pageHeight = 842;
                const footerHeight = 32;
                const footerY = pageHeight - 40 - footerHeight;
                doc.rect(0, footerY, 595, footerHeight).fill(footerBgColor);
                doc.font('Helvetica').fontSize(7).fillColor('#000');
                if (options.documentSociete && options.documentSociete.pied_page) {
                    doc.text(htmlToPlainText(options.documentSociete.pied_page), 50, footerY + 2, { width: 495, align: 'center' });
                } else {
                    doc.text('SARL au capital 500 000.00 DHS - allée des orangers Derb Najat Rue 4 N°67 RDC Ain Sebaa Casablanca', 50, footerY + 2, { width: 495, align: 'center' });
                    doc.text('Tel : 0522672135 - Fax 0522672143 - RC120431TP37951465 IF : 1680027 Email : info@lesbasculesmondial.com', 50, footerY + 12, { width: 495, align: 'center' });
                    doc.text('RIB 007 780 000368400000157019 - CNSS : 6463814 ICE : 000079494000078', 50, footerY + 22, { width: 495, align: 'center' });
                }

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }
}

module.exports = new AvoirPdfService();
