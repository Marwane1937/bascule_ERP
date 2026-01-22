const fs = require('fs');
const path = require('path');

class PdfConfigService {
  constructor() {
    // Chemin vers le fichier de configuration
    this.configPath = path.join(__dirname, '..', 'config', 'pdf-config.json');
    this.config = null;
    this.lastModified = null;
  }

  /**
   * Charge la configuration depuis le fichier JSON
   * @returns {Object} Configuration chargée
   */
  loadConfig() {
    try {
      // Vérifier si le fichier existe
      if (!fs.existsSync(this.configPath)) {
        console.warn('[PdfConfigService] Fichier de configuration non trouvé:', this.configPath);
        return this.getDefaultConfig();
      }

      // Vérifier si le fichier a été modifié
      const stats = fs.statSync(this.configPath);
      if (this.lastModified && stats.mtime.getTime() === this.lastModified.getTime()) {
        return this.config; // Retourner le cache si pas de modification
      }

      // Lire et parser le fichier JSON
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(configContent);
      this.lastModified = stats.mtime;

      console.log('[PdfConfigService] Configuration chargée depuis:', this.configPath);
      return this.config;
    } catch (error) {
      console.error('[PdfConfigService] Erreur lors du chargement de la configuration:', error.message);
      return this.getDefaultConfig();
    }
  }

  /**
   * Retourne la configuration par défaut si le fichier n'existe pas
   * @returns {Object} Configuration par défaut
   */
  getDefaultConfig() {
    return {
      logo: {
        path: 'public/logo-bascule.jpg',
        width: 100,
        height: null
      },
      entete: {
        path: null
      },
      pied_page: {
        path: null
      }
    };
  }

  /**
   * Récupère le chemin complet vers le logo
   * @returns {string|null} Chemin complet vers le logo ou null
   */
  getLogoPath() {
    const config = this.loadConfig();
    if (!config.logo || !config.logo.path) {
      return null;
    }

    // Si le chemin est absolu, le retourner tel quel
    if (path.isAbsolute(config.logo.path)) {
      return config.logo.path;
    }

    // Sinon, construire le chemin relatif à la racine du backend
    return path.join(__dirname, '..', '..', config.logo.path);
  }

  /**
   * Récupère la taille du logo depuis la configuration
   * @returns {Object} { width: number, height: number|null }
   */
  getLogoSize() {
    const config = this.loadConfig();
    if (!config.logo) {
      return { width: 100, height: null }; // Valeur par défaut
    }
    
    return {
      width: config.logo.width || 100, // Défaut: 100
      height: config.logo.height || null // null = proportionnel
    };
  }

  /**
   * Récupère le contenu de l'en-tête depuis le fichier (format JSON ou texte)
   * @returns {Object|string|null} Contenu de l'en-tête structuré (JSON) ou texte brut, ou null
   */
  getEntete() {
    const config = this.loadConfig();
    if (!config.entete || !config.entete.path) {
      return null;
    }

    try {
      let filePath;
      if (path.isAbsolute(config.entete.path)) {
        filePath = config.entete.path;
      } else {
        filePath = path.join(__dirname, '..', '..', config.entete.path);
      }

      if (!fs.existsSync(filePath)) {
        console.warn('[PdfConfigService] Fichier en-tête non trouvé:', filePath);
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      
      // Essayer de parser comme JSON
      try {
        const jsonContent = JSON.parse(content);
        // Si c'est un objet JSON valide avec une structure attendue
        if (jsonContent && (jsonContent.lines || jsonContent.text)) {
          return jsonContent;
        }
      } catch (jsonError) {
        // Si ce n'est pas du JSON, retourner le texte brut (compatibilité)
        return content;
      }
      
      return content;
    } catch (error) {
      console.error('[PdfConfigService] Erreur lors de la lecture de l\'en-tête:', error.message);
      return null;
    }
  }

  /**
   * Récupère le contenu du pied de page depuis le fichier (format JSON ou texte)
   * @returns {Object|string|null} Contenu du pied de page structuré (JSON) ou texte brut, ou null
   */
  getPiedPage() {
    const config = this.loadConfig();
    if (!config.pied_page || !config.pied_page.path) {
      return null;
    }

    try {
      let filePath;
      if (path.isAbsolute(config.pied_page.path)) {
        filePath = config.pied_page.path;
      } else {
        filePath = path.join(__dirname, '..', '..', config.pied_page.path);
      }

      if (!fs.existsSync(filePath)) {
        console.warn('[PdfConfigService] Fichier pied de page non trouvé:', filePath);
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      
      // Essayer de parser comme JSON
      try {
        const jsonContent = JSON.parse(content);
        // Si c'est un objet JSON valide avec une structure attendue
        if (jsonContent && (jsonContent.lines || jsonContent.text)) {
          return jsonContent;
        }
      } catch (jsonError) {
        // Si ce n'est pas du JSON, retourner le texte brut (compatibilité)
        return content;
      }
      
      return content;
    } catch (error) {
      console.error('[PdfConfigService] Erreur lors de la lecture du pied de page:', error.message);
      return null;
    }
  }

  /**
   * Récupère toutes les informations au format documentSociete
   * Compatible avec l'interface existante
   * @returns {Object} Configuration au format documentSociete
   */
  getDocumentSociete() {
    const logoPath = this.getLogoPath();
    const entete = this.getEntete();
    const piedPage = this.getPiedPage();
    const logoSize = this.getLogoSize();

    // Si le logo existe, le convertir en base64 pour compatibilité
    let logoBase64 = null;
    if (logoPath && fs.existsSync(logoPath)) {
      try {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = logoBuffer.toString('base64');
      } catch (error) {
        console.error('[PdfConfigService] Erreur lors de la conversion du logo:', error.message);
      }
    }

    return {
      logo: logoBase64,
      logoSize: logoSize, // Ajouter la taille du logo
      entete: entete,
      pied_page: piedPage
    };
  }
}

module.exports = new PdfConfigService();

