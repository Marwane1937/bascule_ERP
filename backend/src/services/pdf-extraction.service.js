const pdfParse = require('pdf-parse');

class PDFExtractionService {
  /**
   * Extraire le texte d'un PDF
   */
  async extractTextFromPDF(buffer) {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      console.error('[PDFExtractionService] Erreur extraction PDF:', error);
      throw new Error(`Erreur lors de l'extraction du texte PDF: ${error.message}`);
    }
  }

  /**
   * Analyser le contenu du PDF pour en extraire les données d'intervention
   */
  parseInterventionData(text) {
    try {
      const data = {
        technicien: this.extractTechnicien(text),
        client: this.extractClient(text),
        date: this.extractDate(text),
        reparations: this.extractReparations(text),
        vehicule: this.extractVehicule(text),
        notes: this.extractNotes(text)
      };

      return data;
    } catch (error) {
      console.error('[PDFExtractionService] Erreur parsing:', error);
      throw new Error(`Erreur lors de l'analyse du contenu PDF: ${error.message}`);
    }
  }

  /**
   * Extraire le nom du technicien
   */
  extractTechnicien(text) {
    const patterns = [
      /Technicien\s*:\s*([^\n\r]+)/i,
      /Réparateur\s*:\s*([^\n\r]+)/i,
      /Mécanicien\s*:\s*([^\n\r]+)/i,
      /Intervenant\s*:\s*([^\n\r]+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extraire le nom du client
   */
  extractClient(text) {
    const patterns = [
      /Client\s*:\s*([^\n\r]+)/i,
      /Propriétaire\s*:\s*([^\n\r]+)/i,
      /Véhicule de\s*:\s*([^\n\r]+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extraire la date
   */
  extractDate(text) {
    const patterns = [
      /Date\s*:\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
      /Le\s+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i,
      /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // Retourner la date du jour si aucune date trouvée
    return new Date().toLocaleDateString('fr-FR');
  }

  /**
   * Extraire les informations du véhicule
   */
  extractVehicule(text) {
    const patterns = [
      /Véhicule\s*:\s*([^\n\r]+)/i,
      /Immatriculation\s*:\s*([^\n\r]+)/i,
      /Voiture\s*:\s*([^\n\r]+)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extraire les réparations
   */
  extractReparations(text) {
    const reparations = [];
    const lines = text.split('\n');

    let inReparationsSection = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Détecter le début de la section réparations
      if (this.isReparationsSectionStart(trimmedLine)) {
        inReparationsSection = true;
        continue;
      }

      // Détecter la fin de la section
      if (this.isSectionEnd(trimmedLine)) {
        inReparationsSection = false;
        continue;
      }

      // Traiter les lignes de réparation si on est dans la section
      if (inReparationsSection && trimmedLine) {
        const reparation = this.parseReparationLine(trimmedLine);
        if (reparation) {
          reparations.push(reparation);
        }
      }
    }

    return reparations;
  }

  /**
   * Détecter le début d'une section réparations
   */
  isReparationsSectionStart(line) {
    const startPatterns = [
      /^réparations/i,
      /^travaux/i,
      /^interventions/i,
      /^réalisé/i,
      /^effectué/i,
      /^liste.*réparation/i
    ];

    return startPatterns.some(pattern => pattern.test(line));
  }

  /**
   * Détecter la fin d'une section
   */
  isSectionEnd(line) {
    const endPatterns = [
      /^total/i,
      /^montant/i,
      /^notes/i,
      /^commentaires/i,
      /^signature/i,
      /^---/
    ];

    return endPatterns.some(pattern => pattern.test(line));
  }

  /**
   * Parser une ligne de réparation
   */
  parseReparationLine(line) {
    // Patterns pour différents formats de ligne de réparation
    const patterns = [
      // Format: "Description - 123.45 €"
      /^(.+?)\s*-\s*(\d+(?:[.,]\d+)?)\s*(?:€|EUR)?\s*(.*)?$/i,

      // Format: "Description : 123.45"
      /^(.+?)\s*:\s*(\d+(?:[.,]\d+)?)\s*(?:€|EUR)?\s*(.*)?$/i,

      // Format: "Description 123.45€"
      /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(€|EUR)\s*(.*)?$/i,

      // Format simple: "Description"
      /^(.+)$/i
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const description = match[1] ? match[1].trim() : line.trim();
        const cout = match[2] ? parseFloat(match[2].replace(',', '.')) : 0;
        const notes = match[4] ? match[4].trim() : '';

        // Éviter les lignes trop courtes ou qui semblent être des titres
        if (description.length < 3 || this.isTitleLine(description)) {
          continue;
        }

        return {
          description: description,
          cout: cout,
          notes: notes
        };
      }
    }

    return null;
  }

  /**
   * Vérifier si une ligne semble être un titre
   */
  isTitleLine(line) {
    const titlePatterns = [
      /^réparation/i,
      /^travail/i,
      /^intervention/i,
      /^pièce/i,
      /^main.*oeuvre/i,
      /^total/i,
      /^sous.total/i,
      /^tva/i
    ];

    return titlePatterns.some(pattern => pattern.test(line));
  }

  /**
   * Extraire les notes/commentaires
   */
  extractNotes(text) {
    const notesPatterns = [
      /Notes?\s*:\s*([^\n\r]+)/i,
      /Commentaires?\s*:\s*([^\n\r]+)/i,
      /Observations?\s*:\s*([^\n\r]+)/i
    ];

    for (const pattern of notesPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Valider les données extraites
   */
  validateExtractedData(data) {
    const errors = [];

    if (!data.technicien) {
      errors.push('Nom du technicien non trouvé');
    }

    if (!data.client) {
      errors.push('Nom du client non trouvé');
    }

    if (!data.date) {
      errors.push('Date non trouvée');
    }

    if (!data.reparations || data.reparations.length === 0) {
      errors.push('Aucune réparation trouvée');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }
}

module.exports = new PDFExtractionService();









