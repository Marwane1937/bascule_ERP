const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();
const path = require('path');

// Configuration conditionnelle (production vs développement)
const isProduction = process.env.NODE_ENV === 'production';

// ✅ Middleware CORS - Configuration conditionnelle
if (isProduction) {
  // CORS strict en production
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean) || [];
  
  app.use(cors({
    origin: function (origin, callback) {
      // Autoriser les requêtes sans origine (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }
      
      if (allowedOrigins.length === 0) {
        // Si aucun domaine configuré, autoriser toutes les origines (temporaire)
        // ⚠️ À changer dès que vous avez un domaine
        console.warn('⚠️ [SECURITY] ALLOWED_ORIGINS non configuré, CORS ouvert à toutes les origines');
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`⚠️ [SECURITY] Origine bloquée: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));

  // Headers de sécurité avec Helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // Rate limiting général (production uniquement)
  const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requêtes max par minute
    message: {
      success: false,
      message: 'Trop de requêtes. Réessayez plus tard.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Appliquer le rate limiting général sur toutes les routes API
  app.use('/api/', generalLimiter);

  // Forcer HTTPS en production (sauf localhost)
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https' && 
        !req.header('host')?.includes('localhost') &&
        !req.header('host')?.includes('127.0.0.1')) {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });

  console.log('🔒 [SECURITY] Mode production activé - Sécurité renforcée');
} else {
  // CORS permissif en développement
  app.use(cors());
  console.log('🔓 [SECURITY] Mode développement - CORS permissif');
}

// Routes statiques (sécurisées en production)
const staticOptions = isProduction ? {
  setHeaders: (res, filePath) => {
    // Désactiver l'exécution de scripts dans les fichiers statiques
    const ext = path.extname(filePath).toLowerCase();
    if (['.js', '.exe', '.sh', '.bat'].includes(ext) && !filePath.includes('node_modules')) {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', 'attachment');
    }
  }
} : {};

app.use('/devis', express.static(path.join(__dirname, 'public', 'devis'), staticOptions));
app.use('/caisses', express.static(path.join(__dirname, 'public', 'caisses'), staticOptions));
app.use('/commandes', express.static(path.join(__dirname, 'public', 'commandes'), staticOptions));
app.use('/livraisons', express.static(path.join(__dirname, 'public', 'livraisons'), staticOptions));
app.use('/factures', express.static(path.join(__dirname, 'public', 'factures'), staticOptions));
app.use('/factures-fournisseur', express.static(path.join(__dirname, 'public', 'factures-fournisseur'), staticOptions));
app.use('/retours', express.static(path.join(__dirname, 'public', 'retours'), staticOptions));
app.use('/avoirs', express.static(path.join(__dirname, 'public', 'avoirs'), staticOptions));
app.use('/receptions', express.static(path.join(__dirname, 'public', 'receptions'), staticOptions));
app.use('/interventions', express.static(path.join(__dirname, 'public', 'interventions'), staticOptions));
app.use('/stock-historique', express.static(path.join(__dirname, 'public', 'stock-historique'), staticOptions));

// Import des routes
const userRoutes = require('./routes/user.routes');
// ✅ Base
const clientRoutes = require('./routes/base/client.routes');
const articleRoutes = require('./routes/base/article.routes');
const familleRoutes = require('./routes/base/famille.routes');
const vehiculeRoutes = require('./routes/base/vehicule.routes');

// ✅ Ventes
const devisRoutes = require('./routes/ventes/devis.routes');
const livraisonRoutes = require('./routes/ventes/livraison.routes');
const facturationRoutes = require('./routes/ventes/facturation.routes');
const avoirRoutes = require('./routes/ventes/avoir.routes');
const retourRoutes = require('./routes/ventes/retour.routes');
const contratRoutes = require('./routes/ventes/contrat.routes');
const venteReportingRoutes = require('./routes/ventes/vente-reporting.routes');
// ✅ Finance
const caisseRoutes = require('./routes/finance/caisse.routes');
const reglementRoutes = require('./routes/finance/reglement.routes');
const financeReportingRoutes = require('./routes/finance/finance-reporting.routes');
// ✅ Achats
const bonCommandeRoutes = require('./routes/achats/bon-commande.routes');
const demandeAchatRoutes = require('./routes/achats/demande-achat.routes');
const factureFournisseurRoutes = require('./routes/achats/facture-fournisseur.routes');
// ✅ Base
const employeRoutes = require('./routes/base/employe.routes');
const listesRoutes = require('./routes/listes.routes');
// ✅ email
const emailRoutes = require('./routes/email.routes');
const pdfRoutes = require('./routes/pdf.routes');
// ✅ PDF spécialisés
const caissePdfRoutes = require('./routes/caisse-pdf.routes');
const facturationPdfRoutes = require('./routes/facturation-pdf.routes');
const retourPdfRoutes = require('./routes/retour-pdf.routes');
const { router: commandePdfRoutes, publicRouter: commandePdfPublicRoutes } = require('./routes/commande-pdf.routes');
const avoirPdfRoutes = require('./routes/avoir-pdf.routes');
const factureFournisseurPdfRoutes = require('./routes/achats/facture-fournisseur-pdf.routes');
const receptionPdfRoutes = require('./routes/reception-pdf.routes');

// ✅ Authentification
const authRoutes = require('./routes/auth.routes');
const documentSocieteRoutes = require('./routes/document_societe.routes');
const societeRoutes = require('./routes/societe.routes');
const userPermissionsRoutes = require('./routes/user-permissions.routes');

// ✅ Middleware d'authentification
const { authenticateToken } = require('./middleware/auth.middleware');

app.use(express.json());

// Routes publiques (pas d'authentification requise)
app.use('/api/auth', authRoutes);

// Routes protégées (authentification requise)
app.use('/api/users', authenticateToken, userRoutes);
// ✅ Base
app.use('/api/clients', authenticateToken, clientRoutes);
app.use('/api/articles', authenticateToken, articleRoutes);
app.use('/api/familles', authenticateToken, familleRoutes);
app.use('/api/vehicules', authenticateToken, vehiculeRoutes);
// ✅ Ventes
app.use('/api/devis', authenticateToken, devisRoutes);
app.use('/api/livraisons', authenticateToken, livraisonRoutes);
app.use('/api/facturations', authenticateToken, facturationRoutes);
app.use('/api/avoirs', authenticateToken, avoirRoutes);
app.use('/api/retours', authenticateToken, retourRoutes);
app.use('/api/contrats', authenticateToken, contratRoutes);
app.use('/api/vente/reporting', authenticateToken, venteReportingRoutes);
// ✅ Finance
app.use('/api/caisse', authenticateToken, caisseRoutes);
app.use('/api/reglement', authenticateToken, reglementRoutes);
app.use('/api/reglements', authenticateToken, reglementRoutes); // Alias pour compatibilité frontend
app.use('/api/finance/reporting', authenticateToken, financeReportingRoutes);
// ✅ Achats
app.use('/api/bon-commande', authenticateToken, bonCommandeRoutes);
app.use('/api/demande-achat', authenticateToken, demandeAchatRoutes);
app.use('/api/achats', authenticateToken, bonCommandeRoutes); // Alias pour compatibilité frontend
app.use('/api/factures-fournisseur', authenticateToken, factureFournisseurRoutes);
const receptionRoutes = require('./routes/achats/reception.routes');
app.use('/api/receptions', authenticateToken, receptionRoutes);
// ✅ Stock
const stockRoutes = require('./routes/stock.routes');
app.use('/api/stock', authenticateToken, stockRoutes);
const { router: entreeStockRoutes, publicRouter: entreeStockPublicRoutes } = require('./routes/stock/entree-stock.routes');
app.use('/api/stock', authenticateToken, entreeStockRoutes);
app.use('/entrees-stock', entreeStockPublicRoutes); // Routes publiques pour servir les PDFs
const { router: sortieStockRoutes, publicRouter: sortieStockPublicRoutes } = require('./routes/stock/sortie-stock.routes');
app.use('/api/stock', authenticateToken, sortieStockRoutes);
app.use('/sorties-stock', sortieStockPublicRoutes); // Routes publiques pour servir les PDFs
// ✅ Interventions
const interventionRoutes = require('./routes/intervention.routes');
app.use('/api/interventions', interventionRoutes); // Webhook Telegram sans auth
// ✅ Base
app.use('/api/employe', authenticateToken, employeRoutes);
app.use('/api/employes', authenticateToken, employeRoutes); // Alias pour compatibilité frontend
app.use('/api/villes', authenticateToken, require('./routes/base/ville.routes'));
app.use('/api/banques', authenticateToken, require('./routes/base/banque.routes'));
app.use('/api/beneficiaires', authenticateToken, require('./routes/base/beneficiaire.routes'));
app.use('/api/departements', authenticateToken, require('./routes/base/departement.routes'));
app.use('/api/unites', authenticateToken, require('./routes/base/unite.routes'));
app.use('/api/compteurs', authenticateToken, require('./routes/base/compteur.routes'));
app.use('/api/listes', authenticateToken, listesRoutes);
// ✅l'email
app.use('/api/email', authenticateToken, emailRoutes);
// Route PDF : les routes POST sont protégées dans pdf.routes.js, la route GET est publique
app.use('/api/pdf', pdfRoutes);
// ✅ PDF spécialisés
app.use('/api/caisse-pdf', authenticateToken, caissePdfRoutes);
// Route facturation-pdf : les routes POST sont protégées dans facturation-pdf.routes.js, la route GET est publique
app.use('/api/facturation-pdf', facturationPdfRoutes);
// Route retour-pdf : la route GET est publique (pour servir les PDFs), les routes POST sont protégées dans retour-pdf.routes.js
app.use('/api/retour-pdf', retourPdfRoutes);
app.use('/commandes', commandePdfPublicRoutes); // Routes publiques pour servir les PDFs
// Route commande-pdf : les routes POST sont protégées dans commande-pdf.routes.js, la route GET est publique
app.use('/api/commande-pdf', commandePdfRoutes);
app.use('/api/avoir-pdf', authenticateToken, avoirPdfRoutes);
app.use('/api/facture-fournisseur-pdf', authenticateToken, factureFournisseurPdfRoutes);
app.use('/api/reception-pdf', authenticateToken, receptionPdfRoutes);

// ✅ Generation / Impression Chèque
const chequePdfRoutes = require('./routes/generation/cheque.routes');
app.use('/api/generation/cheque', authenticateToken, chequePdfRoutes);

// ✅ Documents société
app.use('/api/document-societe', documentSocieteRoutes);
app.use('/api/societes', societeRoutes);

// ✅ Permissions utilisateurs
app.use('/api/user-permissions', userPermissionsRoutes);

// ✅ Notifications
const notificationRoutes = require('./routes/notification.routes');
app.use('/api/notifications', notificationRoutes);

// ✅ Changement de base de données
const databaseSwitchRoutes = require('./routes/database-switch.routes');
app.use('/api/database', databaseSwitchRoutes);

// ✅ Authentification unifiée
const unifiedAuthRoutes = require('./routes/unified-auth.routes');
app.use('/api/unified-auth', unifiedAuthRoutes);

// ✅ Authentification avec table users existante
const existingAuthRoutes = require('./routes/existing-auth.routes');
app.use('/api/existing-auth', existingAuthRoutes);


// ✅ Middleware de gestion d'erreurs global
app.use((err, req, res, next) => {
    console.error('❌ [Global Error Handler]:', err);
    
    // Ne pas exposer les détails d'erreur en production
    const isProduction = process.env.NODE_ENV === 'production';
    const statusCode = err.status || err.statusCode || 500;
    
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Erreur interne du serveur',
        // Ne montrer les détails que en développement
        error: isProduction ? undefined : (err.stack ? err.stack : err),
        // En production, logger l'erreur complète côté serveur et fournir un ID pour tracking
        ...(isProduction && { errorId: Date.now() })
    });
});

module.exports = app;
