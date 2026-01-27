const fs = require('fs');
const path = require('path');
const databaseSwitchService = require('./database-switch.service');

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
   * Récupère la configuration pour la base de données actuelle
   * @returns {Object|null} Configuration pour la base actuelle ou null si non trouvée
   */
  getConfigForCurrentDatabase() {
    try {
      const config = this.loadConfig();
      const currentDbName = databaseSwitchService.getCurrentDatabase();
      
      console.log(`[PdfConfigService] 🔍 Recherche configuration pour base: "${currentDbName}"`);

      // Si la structure est l'ancienne (sans configurations), retourner null pour utiliser le default
      if (!config.configurations || !Array.isArray(config.configurations)) {
        console.log('[PdfConfigService] Structure ancienne détectée, utilisation de la configuration par défaut');
        return null;
      }

      // Normaliser le nom de la base pour la comparaison
      const normalizeDbName = (name) => {
        if (!name) return '';
        // Enlever espaces, normaliser underscores, mettre en minuscules
        return name.toString().trim().replace(/\s+/g, '_').replace(/_+/g, '_').toLowerCase();
      };

      const normalizedCurrentDb = normalizeDbName(currentDbName);
      console.log(`[PdfConfigService] Nom normalisé: "${normalizedCurrentDb}"`);

      // Afficher toutes les configurations disponibles pour debug
      console.log(`[PdfConfigService] Configurations disponibles:`, 
        config.configurations.map(c => ({ id_db: c.id_db, normalized: normalizeDbName(c.id_db) }))
      );

      // Chercher la configuration correspondant à la base de données actuelle
      const dbConfig = config.configurations.find(cfg => {
        if (!cfg.id_db) return false;
        const normalizedConfigDb = normalizeDbName(cfg.id_db);
        const match = normalizedConfigDb === normalizedCurrentDb;
        if (match) {
          console.log(`[PdfConfigService] ✅ Match trouvé: "${cfg.id_db}" === "${currentDbName}"`);
        }
        return match;
      });

      if (dbConfig) {
        console.log(`[PdfConfigService] ✅ Configuration trouvée pour ${currentDbName}`);
        return dbConfig;
      }

      console.warn(`[PdfConfigService] ⚠️ Aucune configuration trouvée pour "${currentDbName}", utilisation de la configuration par défaut`);
      return null;
    } catch (error) {
      console.error('[PdfConfigService] Erreur lors de la récupération de la configuration:', error.message);
      return null;
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
   * Récupère le chemin complet vers le logo pour la base de données actuelle
   * @returns {string|null} Chemin complet vers le logo ou null
   */
  getLogoPath() {
    const dbConfig = this.getConfigForCurrentDatabase();
    const config = this.loadConfig();
    const currentDbName = databaseSwitchService.getCurrentDatabase();
    
    console.log(`[PdfConfigService] getLogoPath() - Base actuelle: "${currentDbName}"`);
    console.log(`[PdfConfigService] getLogoPath() - Configuration DB trouvée:`, dbConfig ? 'Oui' : 'Non');
    
    // Utiliser la configuration de la base actuelle, sinon la config par défaut, sinon l'ancienne structure
    const logoConfig = dbConfig?.logo || config.default?.logo || config.logo;
    
    console.log(`[PdfConfigService] getLogoPath() - Logo config:`, logoConfig);
    
    if (!logoConfig || !logoConfig.path) {
      console.warn(`[PdfConfigService] ⚠️ Aucun chemin de logo configuré`);
      return null;
    }

    // Si le chemin est absolu, le retourner tel quel
    if (path.isAbsolute(logoConfig.path)) {
      console.log(`[PdfConfigService] getLogoPath() - Chemin absolu: ${logoConfig.path}`);
      return logoConfig.path;
    }

    // Construire le chemin relatif à la racine du backend
    // __dirname = backend/src/services
    // ../.. = backend/
    // logoConfig.path = src/public/maties.png
    // Résultat = backend/src/public/maties.png
    const logoPath = path.join(__dirname, '..', '..', logoConfig.path);
    const absolutePath = path.resolve(logoPath);
    
    console.log(`[PdfConfigService] getLogoPath() - Chemin relatif: ${logoConfig.path}`);
    console.log(`[PdfConfigService] getLogoPath() - Chemin résolu: ${absolutePath}`);
    console.log(`[PdfConfigService] getLogoPath() - Fichier existe: ${fs.existsSync(absolutePath)}`);
    
    return absolutePath;
  }

  /**
   * Récupère la taille du logo depuis la configuration
   * @returns {Object} { width: number, height: number|null }
   */
  getLogoSize() {
    const dbConfig = this.getConfigForCurrentDatabase();
    const config = this.loadConfig();
    
    // Utiliser la configuration de la base actuelle, sinon la config par défaut, sinon l'ancienne structure
    const logoConfig = dbConfig?.logo || config.default?.logo || config.logo;
    
    if (!logoConfig) {
      return { width: 100, height: null }; // Valeur par défaut
    }
    
    return {
      width: logoConfig.width || 100, // Défaut: 100
      height: logoConfig.height || null // null = proportionnel
    };
  }

  /**
   * Récupère le contenu de l'en-tête depuis le fichier (format JSON ou texte)
   * @returns {Object|string|null} Contenu de l'en-tête structuré (JSON) ou texte brut, ou null
   */
  getEntete() {
    const dbConfig = this.getConfigForCurrentDatabase();
    const config = this.loadConfig();
    
    // Utiliser la configuration de la base actuelle, sinon la config par défaut, sinon l'ancienne structure
    const enteteConfig = dbConfig?.entete || config.default?.entete || config.entete;
    
    // Retourner null si pas de configuration, pas de chemin, ou chemin vide
    if (!enteteConfig || !enteteConfig.path || enteteConfig.path.trim() === '') {
      return null;
    }

    try {
      let filePath;
      if (path.isAbsolute(enteteConfig.path)) {
        filePath = enteteConfig.path;
      } else {
        filePath = path.join(__dirname, '..', '..', enteteConfig.path);
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
    const dbConfig = this.getConfigForCurrentDatabase();
    const config = this.loadConfig();
    
    // Utiliser la configuration de la base actuelle, sinon la config par défaut, sinon l'ancienne structure
    const piedPageConfig = dbConfig?.pied_page || config.default?.pied_page || config.pied_page;
    
    if (!piedPageConfig || !piedPageConfig.path) {
      return null;
    }

    try {
      let filePath;
      if (path.isAbsolute(piedPageConfig.path)) {
        filePath = piedPageConfig.path;
      } else {
        filePath = path.join(__dirname, '..', '..', piedPageConfig.path);
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
    const currentDbName = databaseSwitchService.getCurrentDatabase();

    console.log(`[PdfConfigService] Récupération configuration pour base: ${currentDbName}`);

    // Si le logo existe, le convertir en base64 pour compatibilité
    let logoBase64 = null;
    if (logoPath && fs.existsSync(logoPath)) {
      try {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = logoBuffer.toString('base64');
        console.log(`[PdfConfigService] Logo chargé depuis: ${logoPath}`);
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

