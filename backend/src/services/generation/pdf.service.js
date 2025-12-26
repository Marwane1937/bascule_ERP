const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Service pour la génération de PDF de chèques
 */
const generateChequePDF = async (data, template, fields, calibration) => {
    return new Promise((resolve, reject) => {
        try {
            // Dimensions par défaut (chèque standard: 175x80mm)
            // PDFKit utilise des points (1 inch = 72 points)
            // 1 mm = 2.83465 points
            const mmToPoints = (mm) => mm * 2.83465;

            const width = mmToPoints(template.width || 175);
            const height = mmToPoints(template.height || 80);

            const doc = new PDFDocument({
                size: [width, height],
                margin: 0,
                layout: 'landscape' // Bien que size soit défini, landscape aide parfois pour l'impression
            });

            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            // Appliquer la calibration globale
            const globalOffsetX = mmToPoints(calibration.delta_x || 0);
            const globalOffsetY = mmToPoints(calibration.delta_y || 0);

            // Dessiner l'image de fond si présente (pour l'aperçu seulement si demandé, sinon blanc pour impression)
            // Note: Pour une "impression sur papier pré-imprimé", on ne dessine PAS l'image.
            // Si c'est un aperçu (preview), on peut vouloir l'afficher.
            // On vérifiera si 'isPreview' est passé dans les options de data.
            if (data.isPreview && template.image_path) {
                // Logique pour charger l'image si chemin valide
                // doc.image(template.image_path, 0, 0, { width, height });
            }

            // Parcourir les champs et les dessiner
            fields.forEach(field => {
                if (!field.visible) return;

                let value = data[field.key] || '';

                // Formattage spécifique si nécessaire
                if (field.key === 'date' && value instanceof Date) {
                    value = value.toLocaleDateString('fr-FR');
                }

                const fontSize = field.font_size || 10;
                const x = mmToPoints(field.x) + globalOffsetX;
                const y = mmToPoints(field.y) + globalOffsetY;

                doc.font(field.font || 'Helvetica')
                    .fontSize(fontSize)
                    .text(value, x, y, {
                        width: field.width ? mmToPoints(field.width) : undefined,
                        lineBreak: false,
                        ellipsis: true
                    });
            });

            doc.end();

        } catch (error) {
            console.error('[PDF Service] Erreur génération:', error);
            reject(error);
        }
    });
};

module.exports = {
    generateChequePDF
};
