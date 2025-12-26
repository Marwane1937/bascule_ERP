const chequeService = require('../../services/generation/cheque.service');
const calibrationService = require('../../services/generation/calibration.service');

const listBanques = async (req, res) => {
    try {
        const banques = await chequeService.getBanques();
        res.json(banques);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const listReglementsCheque = async (req, res) => {
    try {
        const list = await chequeService.getReglementsCheque();
        res.json(list);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const loadChequeData = async (req, res) => {
    try {
        const { regleId } = req.params;
        const { banqueId, templateId, docType } = req.query;

        const data = await chequeService.loadEditorData(
            banqueId,
            regleId,
            templateId ? parseInt(templateId, 10) : null,
            docType
        );
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const saveFieldConfig = async (req, res) => {
    try {
        const { fieldId } = req.params;
        const { x, y, w, h, fontSize, font, fontStyle, obligatoire } = req.body;
        await chequeService.saveFieldConfig(fieldId, {
            x_mm: x,
            y_mm: y,
            largeur_mm: w,
            hauteur_mm: h,
            font_size: fontSize,
            font,
            font_style: fontStyle,
            obligatoire
        });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const updateCalibration = async (req, res) => {
    try {
        const { calibrationId } = req.params;
        const data = req.body;
        const updated = await calibrationService.upsertCalibration({ ...data, id: calibrationId });
        res.json({ success: true, calibration: updated });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const getCalibration = async (req, res) => {
    try {
        const { banqueId, imprimante } = req.query;
        if (!banqueId) return res.status(400).json({ error: 'banqueId requis' });

        const calibration = await calibrationService.getCalibrationForBanque(parseInt(banqueId, 10), imprimante || null);
        res.json(calibration);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const saveCalibration = async (req, res) => {
    try {
        const payload = req.body || {};
        if (!payload.banque_id && !payload.banqueId) {
            return res.status(400).json({ error: 'banque_id requis' });
        }

        const updated = await calibrationService.upsertCalibration({
            id: payload.id,
            banque_id: payload.banque_id || payload.banqueId,
            imprimante: payload.imprimante || null,
            offset_x_mm: payload.offset_x_mm ?? payload.offsetX ?? 0,
            offset_y_mm: payload.offset_y_mm ?? payload.offsetY ?? 0,
            user_id: req.user?.id || payload.user_id || null
        });

        res.json({ success: true, calibration: updated });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const listTemplates = async (req, res) => {
    try {
        const { banqueId, docType } = req.query;
        if (!banqueId) return res.status(400).json({ error: 'banqueId requis' });

        const bId = parseInt(banqueId, 10);
        let templates = await chequeService.getTemplatesByBanque(bId);

        // S'assurer d'avoir au moins 1 template pour le type demandé
        if (docType) {
            const filtered = templates.filter(t => (t.nom_template || '').toUpperCase().startsWith(docType.toString().toUpperCase()));
            if (filtered.length === 0) {
                await chequeService.getOrCreateTemplate(bId, docType);
                templates = await chequeService.getTemplatesByBanque(bId);
            }
        }

        res.json(templates);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const getTemplate = async (req, res) => {
    try {
        const { templateId } = req.params;
        const data = await chequeService.getTemplateWithFields(parseInt(templateId, 10));
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const updateTemplate = async (req, res) => {
    try {
        const { templateId } = req.params;
        const updated = await chequeService.updateTemplate(parseInt(templateId, 10), req.body || {});
        res.json({ success: true, template: updated });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const generatePDF = async (req, res) => {
    try {
        const { regleId } = req.params;
        const { isPreview, data } = req.body; // Extract data (formData) from body

        // Pass 'data' to service
        const pdfBuffer = await chequeService.generateCheque(regleId, isPreview, req.user?.id || null, data);

        res.setHeader('Content-Type', 'application/pdf');
        if (!isPreview) {
            res.setHeader('Content-Disposition', 'attachment; filename=cheque.pdf');
        }
        res.send(pdfBuffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

const testPrint = async (req, res) => {
    try {
        const { regleId } = req.params;
        const pdfBuffer = await chequeService.generateCheque(regleId, true);
        res.setHeader('Content-Type', 'application/pdf');
        res.send(pdfBuffer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const saveChequeData = async (req, res) => {
    try {
        const { regleId } = req.params; // 'new' or ID
        const data = req.body;
        const result = await chequeService.saveChequeData(regleId, data);
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    listBanques,
    listReglementsCheque,
    loadChequeData,
    saveFieldConfig,
    updateCalibration,
    getCalibration,
    saveCalibration,
    listTemplates,
    getTemplate,
    updateTemplate,
    generatePDF,
    testPrint,
    saveChequeData
};
