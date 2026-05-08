const axios = require('axios');

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const TOGETHER_MODEL = 'Qwen/Qwen3-VL-8B-Instruct';

const FACTURE_SCAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fournisseur: { type: ['string', 'null'] },
    ice: { type: ['string', 'null'] },
    if: { type: ['string', 'null'] },
    numero_facture: { type: ['string', 'null'] },
    date_facture: { type: ['string', 'null'] },
    total_ht: { type: ['number', 'null'] },
    tva: { type: ['number', 'null'] },
    total_ttc: { type: ['number', 'null'] },
    devise: { type: ['string', 'null'] },
    articles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          designation: { type: ['string', 'null'] },
          quantite: { type: ['number', 'null'] },
          prix_unitaire: { type: ['number', 'null'] },
          total_ligne: { type: ['number', 'null'] }
        },
        required: ['designation', 'quantite', 'prix_unitaire', 'total_ligne']
      }
    }
  },
  required: [
    'fournisseur',
    'ice',
    'if',
    'numero_facture',
    'date_facture',
    'total_ht',
    'tva',
    'total_ttc',
    'devise',
    'articles'
  ]
};

function buildPrompt() {
  return [
    "Tu es une intelligence artificielle specialisee dans l'extraction de donnees de factures.",
    '',
    "Ta mission est d'extraire des informations structurees a partir d'une image scannee de facture.",
    '',
    'Retourne UNIQUEMENT un JSON valide (sans explication, sans texte supplementaire).',
    '',
    'Format JSON attendu :',
    JSON.stringify(
      {
        fournisseur: '',
        ice: '',
        if: '',
        numero_facture: '',
        date_facture: '',
        total_ht: 0,
        tva: 0,
        total_ttc: 0,
        devise: '',
        articles: [
          {
            designation: '',
            quantite: 0,
            prix_unitaire: 0,
            total_ligne: 0
          }
        ]
      },
      null,
      2
    ),
    '',
    "Regles d'extraction :",
    '- "fournisseur" : generalement situe dans l\'entete (haut de la facture). Extraire le nom de la societe.',
    '- "ice" : Identifiant Commun de l\'Entreprise (souvent 15 chiffres au Maroc).',
    '- "if" : Identifiant Fiscal.',
    '- "numero_facture" : detecter les mentions comme "Facture No", "No", "Invoice No".',
    '- "date_facture" : convertir au format YYYY-MM-DD si possible.',
    '- Extraire uniquement des nombres (sans symboles de devise).',
    '- "tva" : retourner le pourcentage si possible (ex : 20 pour 20%). Sinon retourner le montant TVA.',
    '- "total_ttc" : montant final a payer.',
    '- Detecter la devise (MAD, EUR, USD...).',
    '',
    'Langue :',
    '- La facture peut etre en francais ou en arabe.',
    '- Reconnaitre les termes comme :',
    '  - "Total TTC", "Montant TTC", "Net a payer"',
    '  - "TVA", "Taxe"',
    '  - "Facture"',
    '  - Equivalents en arabe',
    '',
    'Qualite des donnees :',
    '- Si une donnee est absente -> retourner null',
    '- Si plusieurs valeurs possibles -> choisir la plus pertinente',
    '- Nettoyer le texte OCR bruite',
    '',
    'Reponds uniquement avec un JSON conforme a ce schema :',
    JSON.stringify(FACTURE_SCAN_SCHEMA)
  ].join('\n');
}

function normalizeString(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value)
    .trim()
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.-]/g, '');

  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value) {
  const text = normalizeString(value);
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const slashOrDashMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slashOrDashMatch) {
    const [, ddRaw, mmRaw, yyyyRaw] = slashOrDashMatch;
    const dd = ddRaw.padStart(2, '0');
    const mm = mmRaw.padStart(2, '0');
    const yyyy = yyyyRaw.length === 2 ? `20${yyyyRaw}` : yyyyRaw;
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }

  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeArticle(article) {
  return {
    designation: normalizeString(article?.designation),
    quantite: normalizeNumber(article?.quantite),
    prix_unitaire: normalizeNumber(article?.prix_unitaire),
    total_ligne: normalizeNumber(article?.total_ligne)
  };
}

function normalizeScanResult(result) {
  const articles = Array.isArray(result?.articles)
    ? result.articles.map(normalizeArticle)
    : [];

  return {
    fournisseur: normalizeString(result?.fournisseur),
    ice: normalizeString(result?.ice),
    if: normalizeString(result?.if),
    numero_facture: normalizeString(result?.numero_facture),
    date_facture: normalizeDate(result?.date_facture),
    total_ht: normalizeNumber(result?.total_ht),
    tva: normalizeNumber(result?.tva),
    total_ttc: normalizeNumber(result?.total_ttc),
    devise: normalizeString(result?.devise),
    articles
  };
}

function safeParseJson(rawContent) {
  if (!rawContent) return null;

  if (typeof rawContent === 'object') {
    return rawContent;
  }

  const content = String(rawContent).trim();

  try {
    return JSON.parse(content);
  } catch (error) {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
      return JSON.parse(jsonMatch[0]);
    } catch (nestedError) {
      return null;
    }
  }
}

async function analyzeFactureFournisseurScan({ buffer, mimeType }) {
  const apiKey = process.env.TOGETHER_API_KEY;

  if (!apiKey) {
    const error = new Error('Configuration Together manquante. Ajoutez TOGETHER_API_KEY dans backend/.env.');
    error.statusCode = 500;
    throw error;
  }

  const base64Image = buffer.toString('base64');
  const imageUrl = `data:${mimeType};base64,${base64Image}`;
  const prompt = buildPrompt();

  const response = await axios.post(
    TOGETHER_API_URL,
    {
      model: TOGETHER_MODEL,
      temperature: 0,
      max_tokens: 1800,
      messages: [
        {
          role: 'system',
          content: prompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: "Analyse cette image de facture fournisseur scannee et retourne uniquement le JSON demande."
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'facture_fournisseur_scan',
          schema: FACTURE_SCAN_SCHEMA
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 120000,
      maxBodyLength: Infinity
    }
  );

  const rawContent = response?.data?.choices?.[0]?.message?.content;
  const parsed = safeParseJson(rawContent);

  if (!parsed) {
    const error = new Error("Reponse Together invalide: JSON d'extraction introuvable.");
    error.statusCode = 502;
    throw error;
  }

  return normalizeScanResult(parsed);
}

module.exports = {
  analyzeFactureFournisseurScan
};
