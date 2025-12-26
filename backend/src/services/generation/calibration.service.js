const ChequeCalibration = require('../../models/generation/cheque_calibration.model');

/**
 * La table `cheque_calibration` existante contient:
 * - banque_id, imprimante, offset_x_mm, offset_y_mm, user_id, created_at
 *
 * On gère la calibration comme "dernière calibration enregistrée" par banque (et optionnellement imprimante).
 */

const getCalibrationForBanque = async (banqueId, imprimante = null) => {
    const where = { banque_id: banqueId };
    if (imprimante) where.imprimante = imprimante;

    const calibration = await ChequeCalibration.findOne({
        where,
        order: [['id', 'DESC']]
    });

    if (!calibration) {
        return {
            id: 0,
            banque_id: banqueId,
            imprimante: imprimante || null,
            offset_x_mm: 0,
            offset_y_mm: 0
        };
    }

    return calibration;
};

const upsertCalibration = async (data) => {
    const payload = {
        banque_id: data.banque_id,
        imprimante: data.imprimante || null,
        offset_x_mm: data.offset_x_mm ?? 0,
        offset_y_mm: data.offset_y_mm ?? 0,
        user_id: data.user_id ?? null
    };

    // Si un ID est fourni, on met à jour
    if (data.id && String(data.id) !== '0') {
        const existing = await ChequeCalibration.findByPk(data.id);
        if (existing) {
            await existing.update(payload);
            return existing;
        }
    }

    // Sinon, on crée une nouvelle calibration (historique)
    return await ChequeCalibration.create(payload);
};

module.exports = {
    getCalibrationForBanque,
    upsertCalibration
};
