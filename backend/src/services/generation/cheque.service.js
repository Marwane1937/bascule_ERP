const { getConnection } = require('../../config/database');
const { Op, fn, col, where: sqlWhere } = require('sequelize');
const ChequeTemplate = require('../../models/generation/cheque_template.model');
const ChequeField = require('../../models/generation/cheque_field.model');
const RegleSettings = require('../../models/generation/regle_settings.model');
const Banque = require('../../models/generation/banque.model');
const PDFDocument = require('pdfkit');
const ChequePrintLog = require('../../models/generation/cheque_print_log.model');
const ChequeCalibration = require('../../models/generation/cheque_calibration.model');
const sequelize = ChequePrintLog.sequelize;
const { getCompteur } = require('../compteur.service');

// Helper conversion nombre -> lettres
function numberToFrenchWords(number) {
    if (!number) return '';
    try {
        return `${number}`;
    } catch (e) { return `${number}`; }
}

const getReglementsCheque = async () => {
    const sequelize = getConnection();
    const query = `
        SELECT TOP 50
            r.id as regle_id,
            r.regle_ref as numero,
            r.regle_dat as date,
            r.montant,
            r.emetteur as beneficiaire,
            b.nom as banque_nom,
            r.compte_bnq as banque_id
        FROM regle_settings r
        LEFT JOIN banque b ON b.id = r.compte_bnq
        ORDER BY r.regle_dat DESC
    `;
    const results = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
    return results;
};

const getBanques = async () => {
    return await Banque.findAll({
        attributes: ['id', 'nom', 'code'],
        where: { etat: 1 },
        order: [['nom', 'ASC']]
    });
};

const normalizeDocType = (docType) => {
    const t = (docType || 'CHEQUE').toString().trim().toUpperCase();
    return t === 'EFFET' ? 'EFFET' : 'CHEQUE';
};

const getTemplatesByBanque = async (banqueId, docType = null) => {
    const where = { banque_id: banqueId };
    if (docType) {
        // Convention: on filtre par préfixe nom_template "CHEQUE" / "EFFET" si présent
        const t = normalizeDocType(docType);
        where[Op.and] = [
            sqlWhere(fn('UPPER', col('nom_template')), { [Op.like]: `${t}%` })
        ];
    }

    return await ChequeTemplate.findAll({
        where,
        order: [['id', 'ASC']]
    });
};

const getTemplateWithFields = async (templateId) => {
    const template = await ChequeTemplate.findByPk(templateId);
    if (!template) throw new Error(`Template introuvable: ${templateId}`);
    const fields = await ChequeField.findAll({ where: { template_id: template.id }, order: [['id', 'ASC']] });
    return { template, fields };
};

const getOrCreateTemplate = async (banqueId, docType = 'CHEQUE') => {
    try {
        const bIdInt = parseInt(banqueId, 10);
        if (isNaN(bIdInt)) throw new Error(`Invalid Banque ID: ${banqueId}`);

        const t = normalizeDocType(docType);

        // Convention: 1 template par banque et par type (CHEQUE/EFFET), distingué par nom_template
        let template = await ChequeTemplate.findOne({
            where: {
                banque_id: bIdInt,
                [Op.and]: [
                    sqlWhere(fn('UPPER', col('nom_template')), { [Op.like]: `${t}%` })
                ]
            },
            order: [['id', 'ASC']]
        });

        if (!template) {
            console.log(`[INFO] Creating template for Banque ID ${bIdInt}`);
            const banque = await Banque.findByPk(bIdInt);
            const banqueName = banque ? banque.nom : 'Défaut';

            // Dimensions par défaut demandées (mm)
            // - Chèque : 88 x 194
            // - Effet  : 105 x 108
            const defaultDims = (t === 'EFFET')
                ? { largeur_mm: 105, hauteur_mm: 108 }
                : { largeur_mm: 88, hauteur_mm: 194 };

            try {
                template = await ChequeTemplate.create({
                    banque_id: bIdInt,
                    nom_template: `${t} ${banqueName}`,
                    largeur_mm: defaultDims.largeur_mm,
                    hauteur_mm: defaultDims.hauteur_mm
                });
            } catch (createErr) {
                console.error('[ERROR] Failed to create ChequeTemplate:', createErr);
                throw createErr;
            }

            if (!template || !template.id) {
                throw new Error("Template creation returned no ID.");
            }

            const defaultFields = [
                { nom_champ: 'date', x_mm: 140, y_mm: 52, largeur_mm: 30 },
                { nom_champ: 'lieu', x_mm: 110, y_mm: 52, largeur_mm: 30 },
                { nom_champ: 'montant_chiffres', x_mm: 135, y_mm: 15, largeur_mm: 35 },
                { nom_champ: 'montant_lettres', x_mm: 35, y_mm: 30, largeur_mm: 130 },
                { nom_champ: 'beneficiaire', x_mm: 35, y_mm: 40, largeur_mm: 100 },
                { nom_champ: 'numero', x_mm: 80, y_mm: 75, largeur_mm: 50 },
                { nom_champ: 'paye_pour', x_mm: 10, y_mm: 60, largeur_mm: 50 }
            ];

            for (const f of defaultFields) {
                await ChequeField.create({
                    ...f,
                    template_id: template.id,
                    hauteur_mm: f.hauteur_mm || 5,
                    font: 'Helvetica',
                    font_size: 10,
                    font_style: null,
                    obligatoire: true
                });
            }
        }

        const fields = await ChequeField.findAll({ where: { template_id: template.id } });
        return { template, fields };

    } catch (error) {
        console.error('Detailed Error in getOrCreateTemplate:', error);
        throw error;
    }
};

const loadEditorData = async (banqueId, regleId = null, templateId = null, docType = 'CHEQUE') => {
    try {
        let bId = banqueId ? parseInt(banqueId, 10) : 1;
        let resolvedTemplateId = templateId ? parseInt(templateId, 10) : null;

        // Si on édite un règlement existant, on peut récupérer la banque depuis la donnée métier
        if (regleId && regleId !== 'new' && regleId !== 'test') {
            const reglement = await RegleSettings.findByPk(regleId);
            if (reglement?.compte_bnq) {
                bId = parseInt(reglement.compte_bnq, 10) || bId;
            }
            // Associer template au règlement via colonne existante `mode` (sans changer le schéma)
            if (!resolvedTemplateId && reglement?.mode) {
                const m = parseInt(reglement.mode, 10);
                if (!isNaN(m)) resolvedTemplateId = m;
            }
        }

        let template, fields;
        if (resolvedTemplateId) {
            ({ template, fields } = await getTemplateWithFields(resolvedTemplateId));
        } else {
            ({ template, fields } = await getOrCreateTemplate(bId, docType));
        }

        let values = {
            date: new Date().toISOString().split('T')[0],
            lieu: 'CASABLANCA',
            beneficiaire: '',
            montant: 0,
            montant_chiffres: 0,
            montant_lettres: '',
            paye_pour: '',
            numero: '0000000'
        };

        if (regleId && regleId !== 'new' && regleId !== 'test') {
            const reglement = await RegleSettings.findByPk(regleId);
            if (reglement) {
                const sequelize = getConnection();
                let beneficiaire = '';
                try {
                    const [part] = await sequelize.query(`SELECT nom FROM partenaire WHERE part_id = ${reglement.part_id}`);
                    if (part) beneficiaire = part.nom;
                    else if (Array.isArray(part) && part[0]) beneficiaire = part[0].nom;
                } catch (e) { }

                values = {
                    date: reglement.regle_dat,
                    lieu: reglement.adresse || 'CASABLANCA',
                    beneficiaire: beneficiaire || reglement.emetteur || '',
                    montant: reglement.montant,
                    montant_chiffres: reglement.montant,
                    montant_lettres: numberToFrenchWords(reglement.montant),
                    paye_pour: reglement.description || reglement.regle_ref || '',
                    numero: reglement.regle_ref || ''
                };
            }
        }

        // Calibration pour l'aperçu/impression (par banque)
        const calibration = await ChequeCalibration.findOne({
            where: { banque_id: bId },
            order: [['id', 'DESC']]
        });

        return {
            template,
            fields,
            values,
            banqueId: bId,
            templateId: template?.id || resolvedTemplateId,
            calibration: calibration ? {
                id: calibration.id,
                offset_x_mm: calibration.offset_x_mm || 0,
                offset_y_mm: calibration.offset_y_mm || 0,
                imprimante: calibration.imprimante || null
            } : { id: 0, offset_x_mm: 0, offset_y_mm: 0, imprimante: null }
        };

    } catch (error) {
        throw error;
    }
};

const saveFieldConfig = async (fieldId, config) => {
    const payload = {};
    if (config.x_mm !== undefined) payload.x_mm = config.x_mm;
    if (config.y_mm !== undefined) payload.y_mm = config.y_mm;
    if (config.largeur_mm !== undefined) payload.largeur_mm = config.largeur_mm;
    if (config.hauteur_mm !== undefined) payload.hauteur_mm = config.hauteur_mm;
    if (config.font_size !== undefined) payload.font_size = config.font_size;
    if (config.font !== undefined) payload.font = config.font;
    if (config.font_style !== undefined) payload.font_style = config.font_style;
    if (config.obligatoire !== undefined) payload.obligatoire = config.obligatoire;

    return await ChequeField.update(payload, { where: { id: fieldId } });
};

const updateTemplate = async (templateId, data) => {
    const template = await ChequeTemplate.findByPk(templateId);
    if (!template) throw new Error(`Template introuvable: ${templateId}`);

    const payload = {};
    if (data.nom_template !== undefined) payload.nom_template = data.nom_template;
    if (data.largeur_mm !== undefined) payload.largeur_mm = data.largeur_mm;
    if (data.hauteur_mm !== undefined) payload.hauteur_mm = data.hauteur_mm;

    await template.update(payload);
    return template;
};

const resolvePdfkitFont = (font, style) => {
    const f = (font || 'Helvetica').toString().toLowerCase();
    const s = (style || '').toString().toLowerCase();

    const wantsBold = s.includes('bold') || s.includes('gras');
    const wantsItalic = s.includes('italic') || s.includes('oblique') || s.includes('italique');

    const family = f.includes('courier') ? 'Courier' : f.includes('times') ? 'Times-Roman' : 'Helvetica';

    if (family === 'Times-Roman') {
        if (wantsBold && wantsItalic) return 'Times-BoldItalic';
        if (wantsBold) return 'Times-Bold';
        if (wantsItalic) return 'Times-Italic';
        return 'Times-Roman';
    }

    if (family === 'Courier') {
        if (wantsBold && wantsItalic) return 'Courier-BoldOblique';
        if (wantsBold) return 'Courier-Bold';
        if (wantsItalic) return 'Courier-Oblique';
        return 'Courier';
    }

    // Helvetica
    if (wantsBold && wantsItalic) return 'Helvetica-BoldOblique';
    if (wantsBold) return 'Helvetica-Bold';
    if (wantsItalic) return 'Helvetica-Oblique';
    return 'Helvetica';
};

const formatAmountForCheque = (amount) => {
    if (amount === null || amount === undefined || amount === '') return '';
    let n;
    if (typeof amount === 'string') {
        const normalized = amount.replace(/\s/g, '').replace(',', '.');
        n = Number(normalized);
    } else {
        n = Number(amount);
    }
    if (Number.isNaN(n)) return String(amount);

    const fixed = n.toFixed(2); // "1234.50"
    const [intPartRaw, decPart] = fixed.split('.');
    const intPart = intPartRaw.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // 1.234
    return `#${intPart},${decPart}#`;
};

const formatMontantLettres = (text) => {
    const t = (text ?? '').toString().trim();
    if (!t) return '';
    return `***${t}***`;
};

const formatFieldValueForPdf = (fieldName, value, mergedValues) => {
    if (fieldName === 'montant_chiffres') {
        const source = mergedValues?.montant ?? value;
        return formatAmountForCheque(source);
    }
    if (fieldName === 'montant_lettres') {
        return formatMontantLettres(value);
    }
    // Ajouter un espace après le lieu pour séparer lieu et date (sans virgule)
    if (fieldName === 'lieu') {
        let lieuStr = String(value || '').trim();
        // Supprimer toute virgule existante à la fin du lieu
        lieuStr = lieuStr.replace(/,\s*$/, '').trim();
        return lieuStr ? lieuStr + ' ' : ''; // Espace simple après le lieu (sans virgule)
    }
    // Formater la date si c'est une date ISO
    if (fieldName === 'date') {
        const dateStr = String(value || '').trim();
        let formattedDate = dateStr;
        if (dateStr && dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
            // Format ISO (YYYY-MM-DD) -> convertir en format français
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                formattedDate = d.toLocaleDateString('fr-FR');
            }
        }
        return formattedDate || '';
    }
    return value;
};

const generateCheque = async (regleId, isPreview, userId = null, valuesOverride = null) => {
    try {
        const values = valuesOverride || {};

        // Banque: priorité aux valeurs envoyées par l'UI, sinon via la donnée métier, sinon 1
        let banqueId = values.banqueId ? parseInt(values.banqueId, 10) : null;
        if (!banqueId && regleId && regleId !== 'new' && regleId !== 'test') {
            const reglement = await RegleSettings.findByPk(regleId);
            if (reglement?.compte_bnq) banqueId = parseInt(reglement.compte_bnq, 10);
        }
        if (!banqueId || isNaN(banqueId)) banqueId = 1;

        const templateId = values.templateId ? parseInt(values.templateId, 10) : null;
        const docType = normalizeDocType(values.docType);

        // Structure template/champs
        let template, fields, data;
        if (templateId) {
            ({ template, fields } = await getTemplateWithFields(templateId));
            data = await loadEditorData(banqueId, regleId, templateId, docType);
        } else {
            data = await loadEditorData(banqueId, regleId, null, docType);
            template = data.template;
            fields = data.fields;
        }

        // Valeurs: WYSIWYG si fourni, sinon valeurs DB
        const mergedValues = valuesOverride ? { ...data.values, ...valuesOverride } : data.values;

        // Calibration désactivée: offsets forcés à 0
        const mmToPt = 2.83465;
        const offsetX = 0;
        const offsetY = 0;

        // Format PDF EXACT demandé (mm), indépendant des dimensions du modèle (éditeur)
        // Exemple fourni:
        // <orientation>L</orientation>
        // <unit>mm</unit>
        // <width>88</width>
        // <height>194</height>
        // -> on applique une orientation Landscape (L) => taille PDF = 194 x 88 mm
        const paper = (docType === 'EFFET')
            ? { w_mm: 105, h_mm: 108, orientation: 'L' }
            : { w_mm: 88, h_mm: 194, orientation: 'L' };

        const pdfW = (paper.orientation === 'L') ? paper.h_mm : paper.w_mm;
        const pdfH = (paper.orientation === 'L') ? paper.w_mm : paper.h_mm;

        const doc = new PDFDocument({
            size: [pdfW * mmToPt, pdfH * mmToPt],
            margin: 0
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));

        return new Promise((resolve, reject) => {
            doc.on('end', async () => {
                const pdfData = Buffer.concat(buffers);

                // Save Log if Real Print
                if (!isPreview && regleId && regleId !== 'new' && regleId !== 'test') {
                    try {
                        await RegleSettings.update(
                            { imprime: 1, etat: 1 },
                            { where: { id: regleId } }
                        );
                        // Important: SQL Server n'aime pas certaines strings timezone.
                        // On laisse SQL Server remplir la date (GETDATE).
                        await ChequePrintLog.create({
                            regle_id: regleId,
                            user_id: userId,
                            date_impression: sequelize.literal('GETDATE()'),
                            imprimante: 'PDF Download'
                        });
                    } catch (logErr) {
                        console.error('Error logging print:', logErr);
                    }
                }

                resolve(pdfData);
            });
            doc.on('error', reject);

            fields.forEach(f => {
                // Ne jamais imprimer certains champs (ils sont enregistrés mais exclus du PDF)
                if (f.nom_champ === 'numero' || f.nom_champ === 'paye_pour') return;
                let val = mergedValues[f.nom_champ];
                if (val !== undefined && val !== null) {
                    val = formatFieldValueForPdf(f.nom_champ, val, mergedValues);
                    const fontSize = (f.font_size || 12);
                    // Bold par défaut si aucun style n'est défini
                    const effectiveStyle = (f.font_style && String(f.font_style).trim()) ? f.font_style : 'bold';
                    doc.font(resolvePdfkitFont(f.font, effectiveStyle))
                        .fontSize(fontSize)
                        .text(
                            String(val),
                            (f.x_mm * mmToPt) + offsetX,
                            (f.y_mm * mmToPt) + offsetY,
                            {
                                width: f.largeur_mm ? f.largeur_mm * mmToPt : undefined,
                                lineBreak: false,
                                ellipsis: true
                            }
                        );
                }
            });

            doc.end();
        });

    } catch (error) {
        console.error('Error generating PDF:', error);
        throw error;
    }
};

const saveChequeData = async (regleId, data) => {
    const sequelize = getConnection();
    // data: { date, lieu, beneficiaire, montant, paye_pour, numero ... }

    // Map fields to regle_settings columns
    // regle_ref = numero
    // regle_dat = date
    // montant = montant
    // description = paye_pour
    // emetteur = beneficiaire (or link to partenaire if possible, but simplicity first)
    // mode_regle_id = 2 (Cheque) or 4 (Effet)

    // Initialiser des valeurs par défaut pour satisfaire les contraintes NOT NULL
    // part_id: 1 (Client Divers par défaut si non spécifié)
    // sens: 1 (Encaissement) ou 2 (Décaissement)? Pour un chèque émis (fournisseur), c'est souvent Décaissement.
    // regle_num: 0 (Temporaire)

    // regle_ref (Numéro visible) doit rester statique (saisi ou conservé)
    const numeroRef = (data.numero || '').toString().trim() || null;

    // regle_num (numéro interne) : incrémental via compteur code "IM" à la création uniquement
    const isCreate = (!regleId || regleId === 'new' || regleId === 'test');
    let regleNum = null;
    if (isCreate) {
        const next = await getCompteur('IM', 1, sequelize);
        regleNum = Math.trunc(Number(next) || 0);
    }

    const payload = {
        regle_ref: numeroRef,
        regle_dat: data.date,
        montant: parseFloat(data.montant || 0),
        description: data.paye_pour, // "Payé pour" est sauvegardé mais pas imprimé
        emetteur: data.beneficiaire,
        adresse: data.lieu,
        // Associer le template au règlement (sans changer le schéma)
        mode: data.templateId ? parseInt(data.templateId, 10) : null,
        imprime: 0,
        etat: 1,
        user_id: 1,

        // Champs obligatoires selon le modèle
        part_id: 1, // Assure-toi que part_id=1 existe, sinon mettre un ID valide
        sens: 2, // Décaissement par défaut pour un chèque émis

        // Banque
        compte_bnq: data.banqueId, // On stocke l'ID banque ici pour le retrouver
        regle_bnq: 'CHQ' // Code générique ou Nom Banque si disponible
    };

    if (isCreate) {
        payload.regle_num = regleNum || 0;
        const res = await RegleSettings.create(payload);
        return { success: true, id: res.id, message: 'Chèque créé avec succès', regle_num: payload.regle_num };
    } else {
        await RegleSettings.update(payload, { where: { id: regleId } });
        return { success: true, id: regleId, message: 'Chèque mis à jour' };
    }
};

module.exports = {
    getReglementsCheque,
    loadEditorData,
    saveFieldConfig,
    getOrCreateTemplate,
    generateCheque,
    getBanques,
    saveChequeData,
    getTemplatesByBanque,
    getTemplateWithFields,
    updateTemplate
};
