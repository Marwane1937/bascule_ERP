const devisHtmlPdfService = require('../devis-html-pdf.service');
const pdfConfigService = require('../pdf-config.service');
const {
  enrichRowsWithNomenclature,
  removeNomenclatureComponentRows
} = require('../../utils/nomenclature.helper');

function sanitizeFileName(value) {
  return String(value || 'CLIENT')
    .trim()
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, ' ')
    .substring(0, 50) || 'CLIENT';
}


function formatPreparationUnits(qte, fact) {
  const quantity = Number(qte || 0);
  const factor = Number(fact || 0);

  if (!Number.isFinite(quantity)) {
    return '0';
  }

  if (!Number.isFinite(factor) || factor <= 0) {
    return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace('.', ',');
  }

  const converted = quantity / factor;
  return Number.isInteger(converted) ? String(converted) : converted.toFixed(2).replace('.', ',');
}

function formatPreparationNumber(value) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) {
    return '0';
  }
  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(2).replace('.', ',');
}

function isPrintablePreparationLine(line) {
  const quantite = Math.max(0, Number(line?.quantite || 0));
  const quantiteTransferee = Math.max(0, Number(line?.quantite_transferee || 0));
  const remainingToTransfer = line?.quantite_restante_transfert != null
    ? Math.max(0, Number(line.quantite_restante_transfert || 0))
    : Math.max(0, quantite - quantiteTransferee);

  return !(Number(line?.etat || 0) === 1 && remainingToTransfer <= 0);
}

function mapPreparationToLivraisonRows(prep) {
  const base = {
    document_id: prep.preparation_id,
    numero: prep.numero || `PREP-${prep.preparation_id}`,
    date: prep.date || new Date(),
    client_ref: prep.commande_numero || '',
    client: prep.client || '',
    adresse: prep.description || '',
    ville: '',
    part_id: prep.part_id || null,
    type: 2,
    document_kind: 'LIVRAISON'
  };

  const printableDetails = (prep.details || []).filter((line) => isPrintablePreparationLine(line));

  const rows = printableDetails.map((line, index) => {
    const qte = Number(line.quantite || 0);
    const prix = Number(line.prix || 0);
    const tauxTva = Number(line.taux_tva || 0);
    const ht = qte * prix;
    const fact = Number(line.fact || 0);
    const uniteNom = String(line.unite_nom || '').trim();
    const qteDisplay = Number.isInteger(qte) ? String(qte) : qte.toFixed(2).replace('.', ',');
    const uniteDisplay = uniteNom || '';
    const resultDisplay = formatPreparationUnits(qte, fact);
    const factorDisplay = fact > 0 ? String(Math.trunc(fact)) : '';
    const boxesDisplay = fact > 0 ? formatPreparationNumber(Math.floor(qte / fact)) : '0';
    const remainderDisplay = fact > 0 ? formatPreparationNumber(qte % fact) : qteDisplay;
    const lotDisplay = String(line.lot || line.serie || '').trim();
    const articleLabel = line.designation || line.article_nom || ' ';
    const articleWithLot = lotDisplay
      ? `${articleLabel}<br><span style="color:#1f4e79;">N° série: ${lotDisplay}</span>`
      : articleLabel;
    return {
      ...base,
      ligne_id: line.id || index + 1,
      ligne_type: line.type ?? line.ligne_type ?? null,
      article_id: line.article_id || null,
      article_cod: line.article_cod || '',
      article_nom: line.article_nom || line.designation || '',
      article: articleWithLot,
      designation: articleLabel,
      lot: lotDisplay,
      quantite: qte,
      qte_display: qteDisplay,
      unite_nom: uniteNom,
      fact,
      unite_display: uniteDisplay,
      factor_display: factorDisplay,
      result_display: resultDisplay,
      boxes_display: boxesDisplay,
      remainder_display: remainderDisplay,
      prix,
      remise: ht, // moteur BL utilise ce champ comme HT aprÃ¨s remise
      remise_montant: 0,
      taux_tva: tauxTva,
      depot_id: line.depot_id || prep.depot_id || null
    };
  });

  if (rows.length > 0) return rows;

  return [{
    ...base,
    ligne_id: 1,
    article_id: null,
    article_cod: '',
    article_nom: '',
    article: ' ',
    designation: ' ',
    quantite: 0,
    prix: 0,
    remise: 0,
    remise_montant: 0,
    taux_tva: 0
  }];
}

async function generatePreparationPdfBuffer(prep, options = {}) {
  let devisData = mapPreparationToLivraisonRows(prep);
  if (options.sequelize) {
    devisData = await enrichRowsWithNomenclature(devisData, options.sequelize);
    devisData = removeNomenclatureComponentRows(devisData);
  }
  const documentSociete = options.documentSociete || pdfConfigService.getDocumentSociete();

  return devisHtmlPdfService.generatePdfBuffer(devisData, {
    ...options,
    documentSociete,
    forceDocumentType: 'LIVRAISON',
    overrideDocumentTitle: 'BON DE PR\u00c9PARATION',
    overridePdfTitle: 'BON DE PR\u00c9PARATION ' + String(prep?.client || 'CLIENT').trim(),
    overrideFileBaseName: 'Bon de Preparation ' + sanitizeFileName(prep?.client || 'CLIENT'),
    usePreparationColumns: true,
    hideNomenclatureComponents: false,
    overrideHeaderLabel: 'Pr\u00e9paration N\u00b0',
    clientSecondLineLabel: 'Description',
    overrideAmountWordsPhrase: 'Arr\u00eate le pr\u00e9sent bon de pr\u00e9paration \u00e0 la somme de: ',
    clientOnlyBox: false,
    hideInfoTable: false,
    hideVerificationTable: true
  });
}

module.exports = {
  generatePreparationPdfBuffer
};





