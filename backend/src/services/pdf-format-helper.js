/**
 * Fonction utilitaire pour rendre un en-tête ou pied de page formaté
 * @param {Object} doc - Instance PDFDocument
 * @param {Object|string} content - Contenu JSON structuré ou texte brut
 * @param {Object} defaultOptions - Options par défaut (startX, startY, defaultFontSize, etc.)
 */
function renderFormattedText(doc, content, defaultOptions = {}) {
  if (!content) return;
  
  const {
    startX = 160,
    startY = 20,
    defaultFontSize = 10,
    defaultColor = '#000000',
    defaultFont = 'Helvetica',
    defaultAlign = 'left',
    defaultLineSpacing = 12,
    width = 495
  } = defaultOptions;

  // Si c'est un objet JSON structuré
  if (typeof content === 'object' && content !== null) {
    const config = content;
    const lines = config.lines || [];
    const baseX = config.startX !== undefined ? config.startX : startX;
    const baseY = config.startY !== undefined ? config.startY : startY;
    
    let currentY = baseY;
    
    lines.forEach((line, index) => {
      if (!line.text || !line.text.trim()) return;
      
      const fontSize = line.fontSize !== undefined ? line.fontSize : defaultFontSize;
      const color = line.color || defaultColor;
      const font = line.font || defaultFont;
      const align = line.align || defaultAlign;
      const lineSpacing = line.lineSpacing !== undefined ? line.lineSpacing : defaultLineSpacing;
      const yOffset = line.yOffset || 0;
      
      // Appliquer les styles
      doc.fontSize(fontSize).font(font).fillColor(color);
      
      // Calculer la position X selon l'alignement
      let xPos = baseX;
      if (align === 'center') {
        xPos = 50; // Pour centrer, on utilise x=50 et width=495
      } else if (align === 'right') {
        xPos = 545 - width; // Alignement à droite
      }
      
      // Rendre le texte
      doc.text(line.text.trim(), xPos, currentY + yOffset, {
        width: width,
        align: align
      });
      
      // Avancer la position Y
      currentY += lineSpacing;
    });
  } else {
    // Compatibilité avec l'ancien format texte brut
    const htmlToPlainText = (html) => {
      if (!html) return '';
      let text = html.replace(/<br\s*\/?>/gi, '\n');
      text = text.replace(/<p[^>]*>/gi, '\n');
      text = text.replace(/<\/p>/gi, '\n');
      text = text.replace(/<[^>]+>/g, '');
      return text.replace(/[ \t]+/g, ' ').trim();
    };
    
    const text = typeof content === 'string' ? htmlToPlainText(content) : String(content);
    const lines = text.split('\n').filter(line => line.trim());
    
    let currentY = startY;
    lines.forEach(line => {
      if (line.trim()) {
        doc.fontSize(defaultFontSize).font(defaultFont).fillColor(defaultColor);
        doc.text(line.trim(), startX, currentY, { width: width, align: defaultAlign });
        currentY += defaultLineSpacing;
      }
    });
  }
}

module.exports = { renderFormattedText };

