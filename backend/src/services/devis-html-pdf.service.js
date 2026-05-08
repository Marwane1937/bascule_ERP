const fs = require('fs');
const sanitizeHtml = require('sanitize-html');

function resolveBrowserExecutable() {
  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    process.env.GOOGLE_CHROME_BIN,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/snap/bin/chromium',
    localAppData ? `${localAppData}\\Programs\\BurpSuiteCommunity\\burpbrowser\\chrome.exe` : null,
    localAppData ? `${localAppData}\\Programs\\Google\\Chrome\\Application\\chrome.exe` : null
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/Ã©/g, 'é')
    .replace(/Ã¨/g, 'è')
    .replace(/Ãª/g, 'ê')
    .replace(/Ã /g, 'à')
    .replace(/Ã¹/g, 'ù')
    .replace(/Ã´/g, 'ô')
    .replace(/Â°/g, '°')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat('fr-FR').format(date);
}

function formatNumber(value, digits = 2) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number.isFinite(amount) ? amount : 0);
}

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function formatNullableNumber(value, digits = 2) {
  return hasNumericValue(value) ? formatNumber(Number(value), digits) : '&nbsp;';
}

function isZeroish(value) {
  return hasNumericValue(value) && Math.abs(Number(value)) < 0.000001;
}

function formatNumberOrBlank(value, digits = 2) {
  if (!hasNumericValue(value) || isZeroish(value)) {
    return '&nbsp;';
  }
  return formatNumber(Number(value), digits);
}

function formatTaxeRateLabel(value) {
  if (!hasNumericValue(value) || isZeroish(value)) {
    return 'EXO';
  }

  const numericValue = Number(value);
  const percentValue = numericValue <= 1 ? numericValue * 100 : numericValue;
  const digits = Math.abs(percentValue - Math.round(percentValue)) < 0.000001 ? 0 : 2;
  return `${formatNumber(percentValue, digits)} %`;
}

function sanitizeQuill(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u',
      'ul', 'ol', 'li', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
    ],
    allowedAttributes: {
      span: ['style', 'class'],
      p: ['style', 'class'],
      ul: ['style', 'class'],
      ol: ['style', 'class'],
      li: ['style', 'class', 'data-list'],
      h1: ['style', 'class'],
      h2: ['style', 'class'],
      h3: ['style', 'class'],
      h4: ['style', 'class'],
      h5: ['style', 'class'],
      h6: ['style', 'class']
    },
    allowedClasses: {
      '*': [/^ql-/]
    },
    allowedStyles: {
      '*': {
        color: [/^.*$/],
        'background-color': [/^.*$/],
        background: [/^.*$/],
        'font-weight': [/^.*$/],
        'font-style': [/^.*$/],
        'text-decoration': [/^.*$/],
        'text-align': [/^.*$/]
      }
    }
  });
}

function renderFormattedConfigHtml(content, defaults = {}) {
  if (!content) return '';

  if (typeof content === 'string') {
    return `<div style="text-align:${defaults.align || 'left'};">${escapeHtml(content).replace(/\n/g, '<br>')}</div>`;
  }

  if (typeof content === 'object' && Array.isArray(content.lines)) {
    return content.lines.map((line) => {
      const text = escapeHtml(line?.text || '').replace(/\n/g, '<br>');
      const fontSize = Number(line?.fontSize || defaults.fontSize || 10);
      const color = line?.color || defaults.color || '#000000';
      const align = line?.align || defaults.align || 'left';
      const weight = /bold/i.test(String(line?.font || '')) ? '700' : '400';
      const italic = /oblique|italic/i.test(String(line?.font || '')) ? 'italic' : 'normal';
      const lineHeight = Number(line?.lineSpacing || defaults.lineSpacing || fontSize + 2);
      const marginBottom = Math.max(0, lineHeight - fontSize);
      return `<div style="font-size:${fontSize}px;color:${escapeHtml(color)};text-align:${align};font-weight:${weight};font-style:${italic};line-height:${lineHeight}px;margin:0 0 ${marginBottom}px 0;">${text}</div>`;
    }).join('');
  }

  return '';
}

function serializeForBrowser(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function applyDocumentMetaOverrides(meta, options = {}) {
  const overrideTitle = typeof options.overrideDocumentTitle === 'string' ? options.overrideDocumentTitle.trim() : '';
  const overrideHeaderLabel = typeof options.overrideHeaderLabel === 'string' ? options.overrideHeaderLabel.trim() : '';
  const overrideAmountWordsPhrase = typeof options.overrideAmountWordsPhrase === 'string' ? options.overrideAmountWordsPhrase.trim() : '';

  return {
    ...meta,
    title: overrideTitle || meta.title,
    numberLabel: overrideHeaderLabel || meta.numberLabel,
    amountWordsLabel: overrideAmountWordsPhrase || meta.amountWordsLabel
  };
}

function resolveDocumentMeta(document = {}, options = {}) {
  const documentKind = String(document.document_kind || '').trim().toUpperCase();
  const isFacture = documentKind === 'FACTURE';
  const isLivraison = documentKind === 'LIVRAISON' || documentKind === 'BON DE LIVRAISON';
  const isDemandeAchat = documentKind === 'DEMANDE_ACHAT';
  const isCommande = documentKind === 'COMMANDE' || (!documentKind && (Number(document.type) === 2 || Number(document.etat) === 2));

  if (isDemandeAchat) {
    return applyDocumentMetaOverrides({
      title: 'DEMANDE D\'ACHAT',
      numberLabel: 'Demande d\'Achat N\u00B0',
      refLabel: 'Description',
      amountWordsLabel: ''
    }, options);
  }

  if (isFacture) {
    return applyDocumentMetaOverrides({
      title: 'FACTURE',
      numberLabel: 'Facture N\u00B0',
      refLabel: 'Bon de Livraison',
      amountWordsLabel: 'Arr\u00eat\u00e9 la pr\u00e9sente facture \u00e0 la somme de :'
    }, options);
  }

  if (isLivraison) {
    return applyDocumentMetaOverrides({
      title: 'BON DE LIVRAISON',
      numberLabel: 'Livraison N\u00B0',
      refLabel: 'Commande',
      amountWordsLabel: 'Arr\u00eat\u00e9 le pr\u00e9sent bon de livraison \u00e0 la somme de :'
    }, options);
  }

  if (isCommande) {
    return applyDocumentMetaOverrides({
      title: 'COMMANDE',
      numberLabel: 'Commande N\u00B0',
      refLabel: 'Vos R\u00e9f',
      amountWordsLabel: 'Arr\u00eat\u00e9 la pr\u00e9sente commande \u00e0 la somme de :'
    }, options);
  }

  return applyDocumentMetaOverrides({
    title: 'DEVIS',
    numberLabel: 'Devis N\u00B0',
    refLabel: 'Vos R\u00e9f',
    amountWordsLabel: 'Arr\u00eat\u00e9 le pr\u00e9sent devis \u00e0 la somme de :'
  }, options);
}

function isLivraisonDocument(document = {}) {
  const documentKind = String(document.document_kind || '').trim().toUpperCase();
  return documentKind === 'LIVRAISON' || documentKind === 'BON DE LIVRAISON';
}

function isDemandeAchatDocument(document = {}, options = {}) {
  const forcedType = String(options.forceDocumentType || '').trim().toUpperCase();
  if (forcedType) {
    return forcedType === 'DEMANDE_ACHAT';
  }
  const documentKind = String(document.document_kind || '').trim().toUpperCase();
  return documentKind === 'DEMANDE_ACHAT';
}

function isLivraisonMode(document = {}, options = {}) {
  const forcedType = String(options.forceDocumentType || '').trim().toUpperCase();
  const isForcedLivraison = forcedType === 'LIVRAISON' || forcedType === 'BON DE LIVRAISON' || forcedType === 'BL';
  return isLivraisonDocument(document) || isForcedLivraison;
}

function isFactureDocument(document = {}) {
  const documentKind = String(document.document_kind || '').trim().toUpperCase();
  return documentKind === 'FACTURE';
}

function isNonValoriseLivraisonMode(document = {}, options = {}) {
  return isLivraisonMode(document, options) && String(options.printMode || 'normal').trim().toLowerCase() === 'non_valorise';
}

function isCompositionLivraisonMode(document = {}, options = {}) {
  return isLivraisonMode(document, options) && String(options.printMode || 'normal').trim().toLowerCase() === 'composition';
}

function getDocumentMeta(document = {}) {
  const documentKind = String(document.document_kind || '').trim().toUpperCase();
  const isCommande = documentKind === 'COMMANDE' || Number(document.type) === 2 || Number(document.etat) === 2;

  if (isCommande) {
    return {
      title: 'COMMANDE',
      numberLabel: 'Commande N°'
    };
  }

  return {
    title: 'DEVIS',
    numberLabel: 'Devis N°'
  };
}

function shouldHideNomenclatureComponents(document = {}, options = {}) {
  if (options.hideNomenclatureComponents === true) {
    return true;
  }

  if (options.hideNomenclatureComponents === false) {
    return false;
  }

  const forcedType = String(options.forceDocumentType || '').trim().toUpperCase();
  const documentKind = String(document.document_kind || '').trim().toUpperCase();
  const effectiveType = forcedType || documentKind;

  return !!options.usePreparationColumns || [
    'COMMANDE',
    'LIVRAISON',
    'BON DE LIVRAISON',
    'BL',
    'FACTURE'
  ].includes(effectiveType);
}

function normalizeRows(rows, isClientExonerated, options = {}, document = {}) {
  const hideNomenclatureComponents = shouldHideNomenclatureComponents(document, options);

  return rows.map((line) => {
    const pu = hasNumericValue(line.prix) ? Number(line.prix) : null;
    const qte = hasNumericValue(line.quantite) ? Number(line.quantite) : null;
    const directHt = hasNumericValue(line.total_ht_net)
      ? Number(line.total_ht_net)
      : (hasNumericValue(line.total_ht) ? Number(line.total_ht) : null);
    const ht = directHt !== null
      ? directHt
      : (hasNumericValue(line.remise) ? Number(line.remise) : null);
    const totalAvantRemise = (pu || 0) * (qte || 0);
    const remise = hasNumericValue(line.total_remise_amount)
      ? Number(line.total_remise_amount)
      : (ht === null ? null : Math.max(0, totalAvantRemise - ht));
    const tauxTva = isClientExonerated ? 0 : Number(line.taux_tva || 0);
    const tva = hasNumericValue(line.total_tva_amount)
      ? Number(line.total_tva_amount)
      : ((ht || 0) * tauxTva);

    return {
      documentKind: String(line.document_kind || '').trim().toUpperCase(),
      ref: line.article_cod || '',
      designation: line.article || line.designation || line.article_nom || '',
      lotNumber: line.numero_lot || line.serie || '',
      destination: line.destination || '',
      qte,
      qteDisplay: line.qte_display || '',
      pu,
      remise,
      ht,
      tva,
      tauxTva,
      uniteDisplay: line.unite_display || line.unite_nom || '',
      factorDisplay: line.factor_display || line.result_display || '',
      boxesDisplay: line.boxes_display || '',
      remainderDisplay: line.remainder_display || '',
      nomenclatureComponents: hideNomenclatureComponents
        ? []
        : (Array.isArray(line.nomenclatureComponents) ? line.nomenclatureComponents : [])
    };
  });
}

function collapseCompositionSourceRows(rows) {
  const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (safeRows.length <= 1) {
    return safeRows;
  }

  const firstCommercialRow = safeRows.find((row) =>
    hasNumericValue(row?.quantite)
    || hasNumericValue(row?.prix)
    || hasNumericValue(row?.remise)
    || hasNumericValue(row?.taux_tva)
  ) || safeRows[0];

  const designation = String(
    safeRows[0]?.designation
    || firstCommercialRow?.designation
    || firstCommercialRow?.article
    || ''
  ).trim();

  return [{
    ...firstCommercialRow,
    designation,
    article: designation || firstCommercialRow?.article || firstCommercialRow?.designation || '',
    quantite: hasNumericValue(firstCommercialRow?.quantite) ? Number(firstCommercialRow.quantite) : null,
    prix: hasNumericValue(firstCommercialRow?.prix) ? Number(firstCommercialRow.prix) : null,
    remise: hasNumericValue(firstCommercialRow?.remise) ? Number(firstCommercialRow.remise) : null,
    taux_tva: hasNumericValue(firstCommercialRow?.taux_tva) ? Number(firstCommercialRow.taux_tva) : null
  }];
}

const units = ['zero', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const tens = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function underHundredFR(n) {
  if (n < 17) return units[n];
  if (n < 20) return `dix-${units[n - 10]}`;
  if (n < 70) {
    const ten = Math.floor(n / 10);
    const unit = n % 10;
    if (unit === 0) return tens[ten];
    if (unit === 1 && [2, 3, 4, 5, 6].includes(ten)) {
      return `${tens[ten]}-et-un`;
    }
    return `${tens[ten]}-${underHundredFR(unit)}`;
  }
  if (n < 80) return `soixante-${underHundredFR(n - 60)}`;
  if (n === 80) return 'quatre-vingts';
  return `quatre-vingt-${underHundredFR(n - 80)}`;
}

function underThousandFR(n) {
  if (n < 100) return underHundredFR(n);
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  let words = hundred === 1 ? 'cent' : `${units[hundred]} cent`;
  if (hundred > 1 && rest === 0) words += 's';
  if (rest > 0) words += ` ${underHundredFR(rest)}`;
  return words;
}

function numberToWordsFR(n) {
  if (n === 0) return 'zero';
  if (n < 0) return `moins ${numberToWordsFR(-n)}`;

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts = [];

  if (millions > 0) {
    parts.push(`${numberToWordsFR(millions)} million${millions > 1 ? 's' : ''}`);
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'mille' : `${numberToWordsFR(thousands)} mille`);
  }
  if (rest > 0) {
    parts.push(underThousandFR(rest));
  }
  return parts.join(' ').trim();
}

function amountToWordsFR(amount) {
  const safeAmount = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const dirhams = Math.floor(Math.abs(safeAmount));
  const centimes = Math.round((Math.abs(safeAmount) - dirhams) * 100);
  let result = `${numberToWordsFR(dirhams)} dirham${dirhams > 1 ? 's' : ''}`;
  if (centimes > 0) {
    result += ` et ${numberToWordsFR(centimes)} centime${centimes > 1 ? 's' : ''}`;
  }
  if (safeAmount < 0) {
    result = `moins ${result}`;
  }
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function isSimpleFactureMode(document = {}, options = {}) {
  const documentKind = String(document.document_kind || '').trim().toUpperCase();
  return !!options.simpleMode && documentKind === 'FACTURE';
}

function isSimpleDevisMode(document = {}, options = {}) {
  const printMode = String(options.printMode || '').trim().toLowerCase();
  if (printMode !== 'simple') {
    return false;
  }

  const forcedType = String(options.forceDocumentType || '').trim().toUpperCase();
  if (forcedType) {
    return forcedType === 'DEVIS';
  }

  const documentKind = String(document.document_kind || '').trim().toUpperCase();
  if (documentKind) {
    return documentKind === 'DEVIS';
  }

  const documentType = Number(document.type);
  const documentState = Number(document.etat);
  return documentType !== 2 && documentType !== 5 && documentState !== 2;
}

function resolveHeaderReferenceValue(document = {}, options = {}) {
  if (isDemandeAchatDocument(document, options)) {
    return document.description || '';
  }

  if (isLivraisonMode(document, options)) {
    return document.commande_numero || document.numero_commande || document.client_ref || '';
  }

  return document.numero_livraison || document.commande_numero || document.client_ref || '';
}

function buildHeader(document, documentSociete, options = {}) {
  const { title, numberLabel, refLabel } = resolveDocumentMeta(document, options);
  const isDemandeAchat = isDemandeAchatDocument(document, options);
  const logoBase64 = !options.hideLogo && documentSociete?.logo
    ? `data:image/png;base64,${documentSociete.logo}`
    : null;
  const companyHeadHtml = !options.hideCompanyHead
    ? renderFormattedConfigHtml(documentSociete?.entete, { align: 'left', fontSize: 10, color: '#046ba7', lineSpacing: 12 })
    : '';
  const vosRef = resolveHeaderReferenceValue(document, options);
  const partnerLabel = isDemandeAchat ? 'Fournisseur' : 'Client';
  const secondLineLabel = options.clientSecondLineLabel || 'Adresse';
  const secondLineValue = options.clientSecondLineLabel
    ? (document.description || document.adresse || '')
    : (document.adresse || '');
  const optionalDeliveryLine = !isDemandeAchat && document.date_fin
    ? `<div><strong>Date livraison :</strong> ${escapeHtml(formatDate(document.date_fin))}</div>`
    : '';
  const logoWidth = Number(documentSociete?.logoSize?.width || 100);
  const logoHeight = documentSociete?.logoSize?.height ? Number(documentSociete.logoSize.height) : null;
  const configuredLogoTop = Number(documentSociete?.logoTop);
  const logoTop = Number.isFinite(configuredLogoTop) ? configuredLogoTop : -6;
  const logoStyle = [
    `width:${Number.isFinite(logoWidth) && logoWidth > 0 ? `${logoWidth}px` : '100px'}`,
    logoHeight && Number.isFinite(logoHeight) && logoHeight > 0 ? `height:${logoHeight}px` : 'height:auto',
    'object-fit:contain',
    'display:block',
    `margin-top:${logoTop}px`
  ].join(';');

  if (isDemandeAchat) {
    return `
    <header class="doc-header">
      <div class="header-top">
        <div class="brand-area">
          ${logoBase64 ? `<img class="brand-logo" style="${logoStyle}" src="${logoBase64}" alt="Logo" />` : ''}
          ${companyHeadHtml ? `<div class="company-head">${companyHeadHtml}</div>` : ''}
        </div>
      </div>
      <div class="header-separator"></div>
      <div class="header-main">
        <div class="document-title">${title}</div>
        <div class="client-card">
          <div><strong>${escapeHtml(partnerLabel)} :</strong> ${escapeHtml(document.client || '')}</div>
          <div><strong>Adresse :</strong> ${escapeHtml(document.adresse || '')}</div>
          <div><strong>ICE :</strong> ${escapeHtml(document.ice || '')}</div>
        </div>
      </div>
      <table class="info-table info-table--demande-achat">
        <colgroup>
          <col class="info-col-numero" />
          <col class="info-col-date-demande" />
          <col class="info-col-date-livraison" />
          <col class="info-col-description" />
        </colgroup>
        <thead>
          <tr>
            <th>Demande d'Achat N°</th>
            <th>Date demande</th>
            <th>Date livraison</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(document.numero || '')}</td>
            <td>${formatDate(document.date)}</td>
            <td>${formatDate(document.date_fin)}</td>
            <td>${escapeHtml(document.description || '')}</td>
          </tr>
        </tbody>
      </table>
    </header>
  `;
  }

  return `
    <header class="doc-header">
      <div class="header-top">
        <div class="brand-area">
          ${logoBase64 ? `<img class="brand-logo" style="${logoStyle}" src="${logoBase64}" alt="Logo" />` : ''}
          ${companyHeadHtml ? `<div class="company-head">${companyHeadHtml}</div>` : ''}
        </div>
      </div>
      <div class="header-separator"></div>
      <div class="header-main">
        <div class="document-title">${title}</div>
        <div class="client-card">
          <div><strong>${escapeHtml(partnerLabel)} :</strong> ${escapeHtml(document.client || '')}</div>
          <div><strong>${escapeHtml(secondLineLabel)} :</strong> ${escapeHtml(secondLineValue)}</div>
          <div><strong>ICE :</strong> ${escapeHtml(document.ice || '')}</div>
          ${optionalDeliveryLine}
        </div>
      </div>
      <table class="info-table">
        <thead>
          <tr>
            <th>Devis N°</th>
            <th>Date</th>
            <th>Vos Réf</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(document.numero || '')}</td>
            <td>${formatDate(document.date)}</td>
            <td>${escapeHtml(vosRef)}</td>
          </tr>
        </tbody>
      </table>
    </header>
  `
    .replace(/<th>Devis[^<]*<\/th>/, `<th>${escapeHtml(numberLabel)}</th>`)
    .replace(/<th>Vos[^<]*<\/th>/, `<th>${escapeHtml(refLabel)}</th>`);
}

function buildRow(row) {
  return buildRowForColumns(row, getDetailColumns());
}

function buildNomenclatureNodeHtml(node, depth = 0) {
  const children = Array.isArray(node?.children) ? node.children : [];
  const quantity = hasNumericValue(node?.quantiteTotale) ? node.quantiteTotale : node?.quantite;
  const meta = `Qt\u00e9 ${formatNullableNumber(quantity, Number.isInteger(Number(quantity)) ? 0 : 2)}`;

  return `
    <li class="nomenclature-pdf-node nomenclature-pdf-node--level-${Math.min(depth, 4)}">
      <div class="nomenclature-pdf-line">
        <span class="nomenclature-pdf-code">${escapeHtml(node?.code || '-')}</span>
        <span class="nomenclature-pdf-name">${escapeHtml(node?.designation || '-')}</span>
      </div>
      <div class="nomenclature-pdf-meta">${meta}</div>
      ${children.length > 0 ? `<ul>${children.map((child) => buildNomenclatureNodeHtml(child, depth + 1)).join('')}</ul>` : ''}
    </li>
  `;
}

function buildNomenclatureHtml(nodes) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  if (safeNodes.length === 0) {
    return '';
  }

  return `
    <div class="nomenclature-pdf">
      <div class="nomenclature-pdf-title">Composition</div>
      <ul>${safeNodes.map((node) => buildNomenclatureNodeHtml(node)).join('')}</ul>
    </div>
  `;
}

function getDetailColumns(document = {}, options = {}) {
  if (isDemandeAchatDocument(document, options)) {
    return [
      { key: 'ref', headerLabel: 'Ref', className: 'col-ref', headerClassName: 'col-ref' },
      { key: 'designation', headerLabel: 'Designation', className: 'col-designation', headerClassName: 'col-designation' },
      { key: 'destination', headerLabel: 'Client/Stock', className: 'col-destination', headerClassName: 'col-destination' },
      { key: 'qte', headerLabel: 'Qte', className: 'col-num col-qte', headerClassName: 'col-num col-qte' }
    ];
  }

  if (isDemandeAchatDocument(document, options)) {
    return [
      { key: 'ref', headerLabel: 'Ref', className: 'col-ref', headerClassName: 'col-ref' },
      { key: 'designation', headerLabel: 'DÃ©signation', className: 'col-designation', headerClassName: 'col-designation' },
      { key: 'destination', headerLabel: 'Client/Stock', className: 'col-destination', headerClassName: 'col-destination' },
      { key: 'qte', headerLabel: 'QtÃ©', className: 'col-num col-qte', headerClassName: 'col-num col-qte' }
    ];
  }

  if (options.usePreparationColumns) {
    return [
      { key: 'ref', headerLabel: 'Ref', className: 'col-ref', headerClassName: 'col-ref' },
      { key: 'designation', headerLabel: 'Désignation', className: 'col-designation', headerClassName: 'col-designation' },
      { key: 'qte', headerLabel: 'Qté', className: 'col-num col-qte', headerClassName: 'col-num col-qte' },
      { key: 'uniteDisplay', headerLabel: 'Unité', className: 'col-num col-prep-unite', headerClassName: 'col-num col-prep-unite' },
      { key: 'factorDisplay', headerLabel: 'cdt', className: 'col-num col-prep-factor', headerClassName: 'col-num col-prep-factor' },
      { key: 'boxesDisplay', headerLabel: 'Nombre', className: 'col-num col-prep-boxes', headerClassName: 'col-num col-prep-boxes' },
      { key: 'remainderDisplay', headerLabel: 'Unité', className: 'col-num col-prep-remainder', headerClassName: 'col-num col-prep-remainder' }
    ];
  }

  if (isNonValoriseLivraisonMode(document, options)) {
    return [
      { key: 'ref', headerLabel: 'Ref', className: 'col-ref', headerClassName: 'col-ref' },
      { key: 'designation', headerLabel: 'Désignation', className: 'col-designation', headerClassName: 'col-designation' },
      { key: 'qte', headerLabel: 'Qté', className: 'col-num col-qte', headerClassName: 'col-num col-qte' }
    ];
  }

  if (isFactureDocument(document)) {
    return [
      { key: 'ref', headerLabel: 'Ref', className: 'col-ref', headerClassName: 'col-ref' },
      { key: 'designation', headerLabel: 'DÃ©signation', className: 'col-designation', headerClassName: 'col-designation' },
      { key: 'qte', headerLabel: 'QtÃ©', className: 'col-num col-qte', headerClassName: 'col-num col-qte' },
      { key: 'pu', headerLabel: 'P.U.', className: 'col-num', headerClassName: 'col-num' },
      { key: 'ht', headerLabel: 'Total HT', className: 'col-num', headerClassName: 'col-num' },
      { key: 'tva', headerLabel: 'TVA (%)', className: 'col-num', headerClassName: 'col-num' }
    ];
  }

  return [
    { key: 'ref', headerLabel: 'Ref', className: 'col-ref', headerClassName: 'col-ref' },
    { key: 'designation', headerLabel: 'Désignation', className: 'col-designation', headerClassName: 'col-designation' },
    { key: 'qte', headerLabel: 'Qté', className: 'col-num col-qte', headerClassName: 'col-num col-qte' },
    { key: 'pu', headerLabel: 'P.U.', className: 'col-num', headerClassName: 'col-num' },
    { key: 'remise', headerLabel: 'R.', className: 'col-num', headerClassName: 'col-num' },
    { key: 'ht', headerLabel: 'H.T.', className: 'col-num', headerClassName: 'col-num' }
  ];
}

function renderDetailCell(row, column) {
  switch (column.key) {
    case 'designation': {
      const designationHtml = sanitizeQuill(row.designation) || '&nbsp;';
      const lotHtml = row.lotNumber
        ? `<div class="lot-reference">Lot : ${escapeHtml(row.lotNumber)}</div>`
        : '';
      const nomenclatureHtml = buildNomenclatureHtml(row.nomenclatureComponents);
      return `<td class="${column.className}"><div class="quill-content quill-block">${designationHtml}${lotHtml}${nomenclatureHtml}</div></td>`;
    }
    case 'qte':
      return `<td class="${column.className}">${row.qteDisplay ? escapeHtml(row.qteDisplay) : formatNullableNumber(row.qte, Number.isInteger(Number(row.qte)) ? 0 : 2)}</td>`;
    case 'destination':
      const destination = String(row.destination || '').trim().toLowerCase();
      return `<td class="${column.className}">${escapeHtml(destination ? `${destination.charAt(0).toUpperCase()}${destination.slice(1)}` : '-')}</td>`;
    case 'uniteDisplay':
      return `<td class="${column.className}">${escapeHtml(row.uniteDisplay || '')}</td>`;
    case 'factorDisplay':
      return `<td class="${column.className}">${escapeHtml(row.factorDisplay || '')}</td>`;
    case 'boxesDisplay':
      return `<td class="${column.className}">${escapeHtml(row.boxesDisplay || '')}</td>`;
    case 'remainderDisplay':
      return `<td class="${column.className}">${escapeHtml(row.remainderDisplay || '')}</td>`;
    case 'pu':
      return `<td class="${column.className}">${row.documentKind === 'FACTURE' ? formatNumberOrBlank(row.pu) : formatNullableNumber(row.pu)}</td>`;
    case 'remise':
      return `<td class="${column.className}">${formatNullableNumber(row.remise)}</td>`;
    case 'ht':
      return `<td class="${column.className}">${row.documentKind === 'FACTURE' ? formatNumberOrBlank(row.ht) : formatNullableNumber(row.ht)}</td>`;
    case 'tva':
      return `<td class="${column.className}">${formatTaxeRateLabel(row.tauxTva)}</td>`;
    case 'ref':
    default:
      return `<td class="${column.className}">${escapeHtml(row.ref)}</td>`;
  }
}

function buildRowForColumns(row, columns = getDetailColumns()) {
  return `
    <tr class="detail-row">
      ${columns.map((column) => renderDetailCell(row, column)).join('')}
    </tr>
  `;
}

function buildRows(rows, columns = getDetailColumns()) {
  return rows.map((row) => buildRowForColumns(row, columns)).join('');
}

function buildClosingSpacerRow(columns = getDetailColumns(), height = '14mm') {
  return `
    <tr class="detail-row detail-row--closing-spacer">
      ${columns.map((column) => `<td class="${column.className}" style="height:${escapeHtml(height)};padding:0;border-top:none;">&nbsp;</td>`).join('')}
    </tr>
  `;
}

function buildDetailColGroup(columns = getDetailColumns()) {
  return columns.map((column) => `<col class="${column.className}" />`).join('');
}

function buildDetailHeaderCells(columns = getDetailColumns()) {
  return columns.map((column) => `<th class="${column.headerClassName}">${escapeHtml(column.headerLabel)}</th>`).join('');
}

function calculateTotals(rows) {
  const totalHt = rows.reduce((sum, row) => sum + Number(row.ht || 0), 0);
  const totalRemise = rows.reduce((sum, row) => sum + Number(row.remise || 0), 0);
  const totalTva = rows.reduce((sum, row) => sum + Number(row.tva || 0), 0);
  const totalTtc = totalHt + totalTva;

  return { totalHt, totalRemise, totalTva, totalTtc };
}

function buildTotals(rows) {
  const { totalHt, totalRemise, totalTva, totalTtc } = calculateTotals(rows);

  return `
    <section class="totals-section">
      <table class="totals-table">
        <thead>
          <tr>
            <th>Total HT</th>
            <th>Réduction</th>
            <th>Total TVA</th>
            <th>Total TTC</th>
          </tr>
        </thead>
        <tbody>
          <tr class="total-ttc">
            <td>${formatNumber(totalHt)}</td>
            <td>${formatNumber(totalRemise)}</td>
            <td>${formatNumber(totalTva)}</td>
            <td>${formatNumber(totalTtc)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  `;
}

function buildAmountWords(rows) {
  const { totalTtc } = calculateTotals(rows);
  return `
    <section class="amount-words">
      Arrêté le présent devis à la somme de : <strong>${escapeHtml(amountToWordsFR(totalTtc))}</strong>
    </section>
  `;
}

function buildAmountWordsForDocument(rows, document = {}, options = {}) {
  const { totalTtc } = calculateTotals(rows);
  const { amountWordsLabel } = resolveDocumentMeta(document, options);
  return `
    <section class="amount-words">
      ${escapeHtml(amountWordsLabel)} <strong>${escapeHtml(amountToWordsFR(totalTtc))}</strong>
    </section>
  `;
}

function buildPreparationSummary(rows) {
  const totalPreparedQuantity = rows.reduce((sum, row) => {
    const value = Number(row.qte || 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const totalPreparedDisplay = Number.isInteger(totalPreparedQuantity)
    ? formatNumber(totalPreparedQuantity, 0)
    : formatNumber(totalPreparedQuantity, 2);

  return `
    <section class="preparation-summary">
      <div class="preparation-visa">
        <div class="preparation-summary-title">Visa préparateur</div>
        <div class="preparation-summary-body">&nbsp;</div>
      </div>
      <div class="preparation-total">
        <div class="preparation-summary-title">Quantité totale préparée</div>
        <div class="preparation-summary-body"><strong>${escapeHtml(totalPreparedDisplay)}</strong></div>
      </div>
    </section>
  `;
}

function buildConditionsSection(document) {
  const condition = document.condition || '';
  const expedition = document.expedition || '';
  const transporteur = document.transporteur || '';
  if (!condition && !expedition && !transporteur) {
    return '';
  }

  return `
    <section class="conditions-section">
      <table class="conditions-table">
        <thead>
          <tr>
            <th>Condition de règlement</th>
            <th>Expédition</th>
            <th>Transport</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(condition)}</td>
            <td>${escapeHtml(expedition)}</td>
            <td>${escapeHtml(transporteur)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  `;
}

function buildVerificationSection() {
  const criteria = [
    'Quantit\u00e9',
    'Num\u00e9ro de lot/s\u00e9rie',
    'Date de p\u00e9remption',
    'Indicateur',
    'Nom et pr\u00e9nom du v\u00e9rificateur :',
    'Signature :'
  ];

  return `
    <section class="verification-section">
      <table class="verification-table">
        <colgroup>
          <col class="col-criteria" />
          <col class="col-conforme" />
          <col class="col-non-conforme" />
          <col class="col-remarques" />
        </colgroup>
        <thead>
          <tr>
            <th>Crit\u00e8res</th>
            <th>Conforme</th>
            <th>Non Conforme</th>
            <th>Remarques</th>
          </tr>
        </thead>
        <tbody>
          ${criteria.map((criterion) => `
            <tr>
              <td>${escapeHtml(criterion)}</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
  `;
}

function buildFooter(documentSociete) {
  return renderFormattedConfigHtml(documentSociete?.pied_page, {
    align: 'center',
    fontSize: 7,
    color: '#000000',
    lineSpacing: 3
  });
}

function buildStamp() {
  return `
    <div class="stamp-layer">
      <div class="stamp">VALIDE</div>
    </div>
  `;
}

function buildHtml(devisData, options = {}) {
  const document = devisData[0] || {};
  const { title } = resolveDocumentMeta(document, options);
  const isClientExonerated = !!options.isClientExonerated;
  const isFacture = isFactureDocument(document);
  const isDemandeAchat = isDemandeAchatDocument(document, options);
  const hideConfiguredDecor = isSimpleFactureMode(document, options) || isSimpleDevisMode(document, options);
  const isLivraison = isLivraisonMode(document, options);
  const isNonValoriseLivraison = isNonValoriseLivraisonMode(document, options);
  const isCompositionLivraison = isCompositionLivraisonMode(document, options);
  const sourceRows = isCompositionLivraison
    ? collapseCompositionSourceRows(devisData)
    : devisData;
  const rows = normalizeRows(sourceRows, isClientExonerated, options, document);
  const detailColumns = getDetailColumns(document, options);
  const headerContent = buildHeader(document, options.documentSociete, {
    ...options,
    hideLogo: hideConfiguredDecor || !!options.hideLogo,
    hideCompanyHead: hideConfiguredDecor || !!options.hideCompanyHead
  });
  const footerContent = hideConfiguredDecor ? '' : buildFooter(options.documentSociete);
  const postTableContent = isDemandeAchat
    ? ''
    : options.usePreparationColumns
    ? buildPreparationSummary(rows)
    : isNonValoriseLivraison
    ? `${buildConditionsSection(document)}${buildVerificationSection()}`
    : `${buildTotals(rows)}${buildAmountWordsForDocument(rows, document, options)}${buildConditionsSection(document)}${isLivraison && !options.hideVerificationTable ? buildVerificationSection() : ''}`;
  const rowHtmlList = rows.map((row) => buildRowForColumns(row, detailColumns));
  const stampContent = options.withStamp ? buildStamp() : '';
  const detailTableClassName = isNonValoriseLivraison
    ? 'details-table details-table--non-valorise'
    : (options.usePreparationColumns
      ? 'details-table details-table--preparation'
      : (isCompositionLivraison
      ? 'details-table details-table--composition'
      : (isDemandeAchat
        ? 'details-table details-table--standard details-table--demande-achat'
        : (isFacture ? 'details-table details-table--standard details-table--facture' : 'details-table details-table--standard'))));
  const detailColGroupHtml = buildDetailColGroup(detailColumns);
  const detailHeaderHtml = buildDetailHeaderCells(detailColumns);
  const detailClosingSpacerHtml = isFacture
    ? buildClosingSpacerRow(detailColumns)
    : (isDemandeAchat ? buildClosingSpacerRow(detailColumns, '0px') : '');
  const detailClosingSpacerMode = isFacture ? 'facture' : (isDemandeAchat ? 'demande-achat' : '');
  const detailEmptyColspan = detailColumns.length;

  return `
    <!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>${title} ${escapeHtml(document.numero || '')}</title>
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          * {
            box-sizing: border-box;
          }
          html, body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            font-size: 11px;
            color: #111;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background: #fff;
          }
          body {
            width: 210mm;
            margin: 0 auto;
          }
          #pages {
            width: 210mm;
            margin: 0 auto;
          }
          .page {
            position: relative;
            width: 210mm;
            height: 297mm;
            background: #fff;
            overflow: hidden;
            page-break-after: always;
          }
          .page:last-child {
            page-break-after: auto;
          }
          .page--no-footer .page-frame {
            bottom: 10mm;
          }
          .page-frame {
            position: absolute;
            top: 16mm;
            left: 12mm;
            right: 12mm;
            bottom: 24mm;
            overflow: hidden;
          }
          .page-footer {
            position: absolute;
            left: 12mm;
            right: 12mm;
            bottom: 6mm;
            font-size: 8px;
            line-height: 1.25;
            text-align: center;
            color: #000;
          }
          .page-number-line {
            font-size: 9px;
          }
          .page-footer-rule {
            height: 1px;
            background: #000;
            margin: 2px 0 3px;
          }
          .page-footer-rule--bottom {
            margin: 3px 0 0;
          }
          .page-footer-content > * {
            margin-top: 0;
            margin-bottom: 0;
          }
          .doc-header {
            margin-bottom: 6mm;
            min-height: 0;
            display: block;
            clear: both;
          }
          .header-top {
            min-height: 76px;
            display: block;
            clear: both;
          }
          .brand-area {
            display: flex;
            align-items: flex-start;
            gap: 16px;
            clear: both;
          }
          .brand-logo {
            flex: 0 0 auto;
          }
          .brand-logo--empty {
            width: 120px;
            height: 58px;
          }
          .company-head {
            max-width: 430px;
          }
          .header-separator {
            height: 1px;
            background: #000;
            margin: 8px 0 10px;
          }
          .header-main {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            min-height: 86px;
            margin-bottom: 14px;
            clear: both;
          }
          .document-title {
            font-size: 20px;
            font-weight: 700;
            line-height: 1;
            margin-top: 18px;
          }
          .client-card {
            width: 260px;
            border: 1px solid #222;
            border-radius: 6px;
            padding: 6px 8px;
            line-height: 1.45;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
            table-layout: fixed;
            clear: both;
            border: 1px solid #222;
          }
          .info-table th,
          .info-table td {
            border-right: 1px solid #222;
            border-bottom: 1px solid #222;
            padding: 6px 8px;
            text-align: center;
          }
          .info-table th:last-child,
          .info-table td:last-child {
            border-right: none;
          }
          .info-table tbody tr:last-child td {
            border-bottom: none;
          }
          .info-table thead th {
            font-weight: 700;
            background: #fff;
          }
          .info-table--demande-achat .info-col-numero {
            width: 24%;
          }
          .info-table--demande-achat .info-col-date-demande {
            width: 18%;
          }
          .info-table--demande-achat .info-col-date-livraison {
            width: 18%;
          }
          .info-table--demande-achat .info-col-description {
            width: 40%;
          }
          .details-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin: 0;
          }
          .details-table--demande-achat {
            margin-top: 3mm;
          }
          .details-table--standard col.col-ref {
            width: 10%;
          }
          .details-table--standard col.col-designation {
            width: 50%;
          }
          .details-table--standard col.col-num {
            width: 10%;
          }
          .details-table--non-valorise col.col-ref {
            width: 12%;
          }
          .details-table--non-valorise col.col-designation {
            width: 72%;
          }
          .details-table--non-valorise col.col-num {
            width: 16%;
          }
          .details-table--composition col.col-ref {
            width: 10%;
          }
          .details-table--composition col.col-designation {
            width: 50%;
          }
          .details-table--composition col.col-num {
            width: 10%;
          }
          .details-table--preparation col.col-ref {
            width: 10%;
          }
          .details-table--preparation col.col-designation {
            width: 36%;
          }
          .details-table--preparation col.col-qte {
            width: 9%;
          }
          .details-table--preparation col.col-prep-unite {
            width: 10%;
          }
          .details-table--preparation col.col-prep-factor {
            width: 9%;
          }
          .details-table--preparation col.col-prep-boxes {
            width: 11%;
          }
          .details-table--preparation col.col-prep-remainder {
            width: 15%;
          }
          .details-table col.col-destination {
            width: 18%;
          }
          .details-table tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .details-table th,
          .details-table td {
            border: 1px solid #222;
            padding: 6px 7px;
            vertical-align: top;
          }
          .details-table--facture {
            border: 1px solid #222;
          }
          .details-table--facture tbody td {
            border-top: none;
            border-bottom: none;
          }
          .details-table th {
            background: #e0e0e0;
            font-size: 10px;
            font-weight: 700;
          }
          .details-table .col-ref {
            word-break: break-word;
          }
          .details-table .col-designation {
            width: auto;
          }
          .details-table .col-destination {
            text-align: center;
            white-space: nowrap;
          }
          .details-table td.col-designation .quill-content {
            overflow-wrap: break-word;
            word-break: normal;
          }
          .lot-reference {
            margin-top: 4px;
            font-size: 10px;
            color: #444;
            font-style: italic;
          }
          .nomenclature-pdf {
            margin-top: 5px;
            padding: 5px 6px;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            background: #f8fafc;
            font-size: 9px;
            line-height: 1.25;
          }
          .nomenclature-pdf-title {
            margin-bottom: 3px;
            font-weight: 700;
            color: #1d4ed8;
            text-transform: uppercase;
            letter-spacing: 0.2px;
          }
          .nomenclature-pdf ul {
            margin: 0;
            padding-left: 12px;
            list-style: none;
          }
          .nomenclature-pdf li {
            position: relative;
            margin: 3px 0;
            padding-left: 8px;
          }
          .nomenclature-pdf li::before {
            content: "";
            position: absolute;
            left: 0;
            top: 6px;
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: #2563eb;
          }
          .nomenclature-pdf-line {
            display: block;
            color: #111827;
          }
          .nomenclature-pdf-code {
            font-weight: 700;
            margin-right: 4px;
          }
          .nomenclature-pdf-meta {
            color: #475569;
            font-size: 8.5px;
          }
          .details-table .col-num {
            text-align: right;
            white-space: nowrap;
          }
          .details-table th.col-qte,
          .details-table td.col-qte {
            text-align: center;
          }
          .details-table .detail-row--before-closing-spacer td {
            border-bottom: none;
          }
          .details-table .detail-row--closing-spacer td {
            border-top: none;
          }
          .details-table--composition th,
          .details-table--composition td,
          .details-table--composition {
            border: none;
          }
          .details-table--composition th {
            background: transparent;
          }
          .quill-content {
            margin: 0;
            padding: 0;
            line-height: 1.35;
            white-space: normal;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          .quill-content p,
          .quill-content ul,
          .quill-content ol,
          .quill-content h1,
          .quill-content h2,
          .quill-content h3,
          .quill-content h4,
          .quill-content h5,
          .quill-content h6 {
            margin: 0 0 5px;
          }
          .quill-content p:last-child,
          .quill-content ul:last-child,
          .quill-content ol:last-child,
          .quill-content h1:last-child,
          .quill-content h2:last-child,
          .quill-content h3:last-child,
          .quill-content h4:last-child,
          .quill-content h5:last-child,
          .quill-content h6:last-child {
            margin-bottom: 0;
          }
          .quill-content ul,
          .quill-content ol {
            padding-left: 18px;
          }
          .quill-content li {
            margin: 0 0 4px;
          }
          .quill-content .ql-align-center {
            text-align: center;
          }
          .quill-content .ql-align-right {
            text-align: right;
          }
          .quill-content .ql-align-justify {
            text-align: justify;
          }
          .quill-content .ql-size-small {
            font-size: 0.75em;
          }
          .quill-content .ql-size-large {
            font-size: 1.5em;
          }
          .quill-content .ql-size-huge {
            font-size: 2.5em;
          }
          .quill-content .ql-font-serif {
            font-family: Georgia, "Times New Roman", serif;
          }
          .quill-content .ql-font-monospace {
            font-family: "Courier New", monospace;
          }
          .quill-content .ql-indent-1 {
            padding-left: 2.5em;
          }
          .quill-content .ql-indent-2 {
            padding-left: 5em;
          }
          .quill-content .ql-indent-3 {
            padding-left: 7.5em;
          }
          .quill-content .ql-indent-4 {
            padding-left: 10em;
          }
          .quill-content span[style*="background"],
          .quill-content p[style*="background"] {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .quill-block {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .page-post {
            margin-top: 6mm;
            display: block;
            clear: both;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .preparation-summary {
            display: grid;
            grid-template-columns: 1fr 0.9fr;
            gap: 8mm;
            margin-top: 8mm;
            align-items: stretch;
          }
          .preparation-visa,
          .preparation-total {
            border: 1px solid #222;
            border-radius: 4px;
            overflow: hidden;
          }
          .preparation-summary-title {
            padding: 5px 8px;
            border-bottom: 1px solid #222;
            text-align: center;
            font-size: 10px;
            font-weight: 700;
            background: #f1f5f9;
          }
          .preparation-summary-body {
            min-height: 16mm;
            padding: 7px 8px;
            text-align: center;
            font-size: 11px;
          }
          .totals-section {
            display: flex;
            justify-content: flex-end;
            margin-top: 8mm;
          }
          .totals-table {
            border-collapse: separate;
            border-spacing: 0;
            width: 255px;
            table-layout: fixed;
            border: 1px solid #222;
            border-radius: 6px;
            overflow: hidden;
          }
          .totals-table th,
          .totals-table td {
            border-right: 1px solid #222;
            border-bottom: 1px solid #222;
            padding: 6px 4px;
            text-align: center;
            width: 25%;
          }
          .totals-table th:last-child,
          .totals-table td:last-child {
            border-right: none;
          }
          .totals-table tbody tr:last-child td {
            border-bottom: none;
          }
          .totals-table thead th {
            background: #fff;
            font-weight: 700;
          }
          .total-ttc th,
          .total-ttc td {
            font-weight: 700;
          }
          .amount-words {
            margin-top: 6mm;
            font-size: 10px;
            font-style: italic;
          }
          .conditions-section {
            margin-top: 6mm;
          }
          .conditions-table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #222;
            table-layout: fixed;
          }
          .conditions-table th,
          .conditions-table td {
            border: 1px solid #222;
            padding: 6px 8px;
            text-align: center;
          }
          .conditions-table thead th {
            background: #fff;
            font-weight: 700;
          }
          .verification-section {
            margin-top: 10px;
          }
          .verification-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            table-layout: fixed;
            border: 1px solid #222;
            border-radius: 8px;
            overflow: hidden;
            font-size: 9px;
          }
          .verification-table col.col-criteria {
            width: 43%;
          }
          .verification-table col.col-conforme {
            width: 17.5%;
          }
          .verification-table col.col-non-conforme {
            width: 19.5%;
          }
          .verification-table col.col-remarques {
            width: 20%;
          }
          .verification-table th,
          .verification-table td {
            border-right: 1px solid #222;
            border-bottom: 1px solid #222;
            padding: 6px 8px;
            vertical-align: middle;
          }
          .verification-table th:last-child,
          .verification-table td:last-child {
            border-right: none;
          }
          .verification-table tbody tr:last-child td {
            border-bottom: none;
          }
          .verification-table thead th {
            background: #fff;
            font-weight: 700;
            text-align: center;
            height: 25px;
          }
          .verification-table thead th:first-child,
          .verification-table thead th:last-child,
          .verification-table tbody td:first-child,
          .verification-table tbody td:last-child {
            text-align: left;
          }
          .verification-table tbody td:not(:first-child) {
            text-align: center;
          }
          .verification-table tbody td {
            height: 25px;
          }
          .stamp-layer {
            position: absolute;
            inset: 0;
            pointer-events: none;
          }
          .stamp {
            position: absolute;
            right: 16mm;
            bottom: 24mm;
            border: 3px solid rgba(192, 57, 43, 0.7);
            color: rgba(192, 57, 43, 0.75);
            border-radius: 999px;
            padding: 10px 18px;
            font-size: 18px;
            font-weight: 700;
            transform: rotate(-14deg);
          }
          .detail-row--empty td {
            height: 14mm;
          }
        </style>
      </head>
      <body>
        <div id="pages"></div>
        <script>
          (() => {
            const headerHtml = ${serializeForBrowser(headerContent)};
            const footerHtml = ${serializeForBrowser(footerContent)};
            const postHtml = ${serializeForBrowser(postTableContent)};
            const rowHtmlList = ${serializeForBrowser(rowHtmlList)};
            const stampHtml = ${serializeForBrowser(stampContent)};
            const showFooter = ${serializeForBrowser(!hideConfiguredDecor)};
            const detailsTableClassName = ${serializeForBrowser(detailTableClassName)};
            const detailColGroupHtml = ${serializeForBrowser(detailColGroupHtml)};
            const detailHeaderHtml = ${serializeForBrowser(detailHeaderHtml)};
            const detailClosingSpacerHtml = ${serializeForBrowser(detailClosingSpacerHtml)};
            const detailClosingSpacerMode = ${serializeForBrowser(detailClosingSpacerMode)};
            const detailEmptyColspan = ${serializeForBrowser(detailEmptyColspan)};
            const pagesRoot = document.getElementById('pages');

            function createPage() {
              const page = document.createElement('section');
              page.className = showFooter ? 'page' : 'page page--no-footer';
              page.innerHTML = [
                stampHtml,
                '<div class="page-frame">',
                  '<div class="page-header">' + headerHtml + '</div>',
                  '<table class="' + detailsTableClassName + '">',
                    '<colgroup>' + detailColGroupHtml + '</colgroup>',
                    '<thead>',
                      '<tr>' + detailHeaderHtml + '</tr>',
                    '</thead>',
                    '<tbody></tbody>',
                  '</table>',
                  '<div class="page-post"></div>',
                '</div>',
                showFooter ? [
                  '<footer class="page-footer">',
                    '<div class="page-number-line">Page <span class="page-number-current"></span> / <span class="page-number-total"></span></div>',
                    '<div class="page-footer-rule"></div>',
                    '<div class="page-footer-content">' + footerHtml + '</div>',
                    '<div class="page-footer-rule page-footer-rule--bottom"></div>',
                  '</footer>'
                ].join('') : ''
              ].join('');

              pagesRoot.appendChild(page);
              return page;
            }

            function pageOverflows(page) {
              const frame = page.querySelector('.page-frame');
              return frame.scrollHeight > frame.clientHeight + 1;
            }

            const pages = [];
            let currentPage = createPage();
            pages.push(currentPage);

            if (rowHtmlList.length === 0) {
              currentPage.querySelector('.details-table tbody').innerHTML =
                '<tr class="detail-row detail-row--empty"><td colspan="' + detailEmptyColspan + '">&nbsp;</td></tr>';
            } else {
              for (const rowHtml of rowHtmlList) {
                let tbody = currentPage.querySelector('.details-table tbody');
                tbody.insertAdjacentHTML('beforeend', rowHtml);

                if (pageOverflows(currentPage)) {
                  const lastRow = tbody.lastElementChild;
                  if (lastRow) {
                    lastRow.remove();
                  }

                  if (tbody.children.length === 0) {
                    tbody.insertAdjacentHTML('beforeend', rowHtml);
                  } else {
                    currentPage = createPage();
                    pages.push(currentPage);
                    tbody = currentPage.querySelector('.details-table tbody');
                    tbody.insertAdjacentHTML('beforeend', rowHtml);
                  }
                }
              }
            }

            if (detailClosingSpacerHtml) {
              const tbody = currentPage.querySelector('.details-table tbody');
              const previousRow = tbody.lastElementChild;
              tbody.insertAdjacentHTML('beforeend', detailClosingSpacerHtml);
              const spacerRow = tbody.lastElementChild;

              if (detailClosingSpacerMode === 'demande-achat' && spacerRow) {
                const frame = currentPage.querySelector('.page-frame');
                const remainingHeight = Math.max(0, Math.floor(frame.clientHeight - frame.scrollHeight));
                const fillHeight = Math.max(0, remainingHeight - 2);

                spacerRow.querySelectorAll('td').forEach((cell) => {
                  cell.style.height = fillHeight + 'px';
                });

                if (previousRow) {
                  previousRow.classList.add('detail-row--before-closing-spacer');
                }
              } else if (pageOverflows(currentPage)) {
                if (spacerRow) {
                  spacerRow.remove();
                }
              } else if (previousRow) {
                previousRow.classList.add('detail-row--before-closing-spacer');
              }
            }

            if (postHtml) {
              let postContainer = currentPage.querySelector('.page-post');
              postContainer.innerHTML = postHtml;

              if (pageOverflows(currentPage)) {
                postContainer.innerHTML = '';
                currentPage = createPage();
                pages.push(currentPage);
                currentPage.querySelector('.page-post').innerHTML = postHtml;
              }
            }

            const totalPages = pages.length;
            if (showFooter) {
              pages.forEach((page, index) => {
                page.querySelector('.page-number-current').textContent = String(index + 1);
                page.querySelector('.page-number-total').textContent = String(totalPages);
              });
            }

            window.__PDF_READY__ = true;
          })();
        </script>
      </body>
    </html>
  `;
}

let pdfBrowserPromise = null;
let pdfBrowserWarmupScheduled = false;
let cachedBrowserExecutablePath = undefined;

function getPdfLaunchOptions() {
  if (cachedBrowserExecutablePath === undefined) {
    cachedBrowserExecutablePath = resolveBrowserExecutable() || null;
  }

  return {
    headless: true,
    executablePath: cachedBrowserExecutablePath || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };
}

async function getPdfBrowser() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (error) {
    error.message = `Puppeteer indisponible: ${error.message}`;
    throw error;
  }

  if (!pdfBrowserPromise) {
    const launchStartedAt = Date.now();
    pdfBrowserPromise = puppeteer.launch(getPdfLaunchOptions()).then((browser) => {
      console.log(`[devis-html-pdf] Navigateur PDF prêt en ${Date.now() - launchStartedAt}ms`);
      browser.on('disconnected', () => {
        pdfBrowserPromise = null;
      });
      return browser;
    }).catch((error) => {
      pdfBrowserPromise = null;
      throw error;
    });
  }

  return pdfBrowserPromise;
}

function schedulePdfBrowserWarmup() {
  if (pdfBrowserWarmupScheduled) {
    return;
  }

  pdfBrowserWarmupScheduled = true;
  setTimeout(() => {
    getPdfBrowser()
      .then(() => {
        console.log('[devis-html-pdf] Warmup navigateur PDF terminé');
      })
      .catch((error) => {
        console.warn('[devis-html-pdf] Warmup navigateur PDF ignoré:', error.message);
      });
  }, 0);
}

async function generatePdfBuffer(devisData, options = {}) {
  const startedAt = Date.now();
  const effectivePrintMode = String(options.printMode || (options.simpleMode ? 'simple' : 'normal')).trim().toLowerCase() || 'normal';
  const documentType = String(options.forceDocumentType || devisData?.[0]?.document_kind || 'document').trim().toUpperCase() || 'DOCUMENT';
  const browser = await getPdfBrowser();
  const browserReadyAt = Date.now();
  const page = await browser.newPage();

  try {
    await page.setContent(buildHtml(devisData, options), {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForFunction(() => window.__PDF_READY__ === true, { timeout: 15000 });
    const contentReadyAt = Date.now();

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm'
      }
    });
    const pdfReadyAt = Date.now();
    console.log(
      `[devis-html-pdf] ${documentType}/${effectivePrintMode} en ${pdfReadyAt - startedAt}ms ` +
      `(browser=${browserReadyAt - startedAt}ms, html=${contentReadyAt - browserReadyAt}ms, pdf=${pdfReadyAt - contentReadyAt}ms)`
    );
    return pdfBuffer;
  } finally {
    await page.close();
  }
}

schedulePdfBrowserWarmup();

module.exports = {
  generatePdfBuffer
};
