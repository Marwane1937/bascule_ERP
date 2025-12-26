const express = require('express');
const cors = require('cors'); // ✅ AJOUT
const app = express();
const path = require('path');

// ✅ Middleware CORS
app.use(cors()); // ⚠️ Autorise toutes les origines par défaut
app.use('/devis', express.static(path.join(__dirname, 'public', 'devis')));
app.use('/caisses', express.static(path.join(__dirname, 'public', 'caisses')));
app.use('/commandes', express.static(path.join(__dirname, 'public', 'commandes')));
app.use('/livraisons', express.static(path.join(__dirname, 'public', 'livraisons')));
app.use('/factures', express.static(path.join(__dirname, 'public', 'factures')));
app.use('/retours', express.static(path.join(__dirname, 'public', 'retours')));
app.use('/avoirs', express.static(path.join(__dirname, 'public', 'avoirs')));

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
// ✅ Finance
const caisseRoutes = require('./routes/finance/caisse.routes');
const reglementRoutes = require('./routes/finance/reglement.routes');
// ✅ Achats
const bonCommandeRoutes = require('./routes/achats/bon-commande.routes');
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
const commandePdfRoutes = require('./routes/commande-pdf.routes');
const avoirPdfRoutes = require('./routes/avoir-pdf.routes');

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
// ✅ Finance
app.use('/api/caisse', authenticateToken, caisseRoutes);
app.use('/api/reglement', authenticateToken, reglementRoutes);
app.use('/api/reglements', authenticateToken, reglementRoutes); // Alias pour compatibilité frontend
// ✅ Achats
app.use('/api/bon-commande', authenticateToken, bonCommandeRoutes);
// ✅ Base
app.use('/api/employe', authenticateToken, employeRoutes);
app.use('/api/employes', authenticateToken, employeRoutes); // Alias pour compatibilité frontend
app.use('/api/listes', authenticateToken, listesRoutes);
// ✅l'email
app.use('/api/email', authenticateToken, emailRoutes);
app.use('/api/pdf', authenticateToken, pdfRoutes);
// ✅ PDF spécialisés
app.use('/api/caisse-pdf', authenticateToken, caissePdfRoutes);
app.use('/api/facturation-pdf', authenticateToken, facturationPdfRoutes);
app.use('/api/retour-pdf', authenticateToken, retourPdfRoutes);
app.use('/api/commande-pdf', authenticateToken, commandePdfRoutes);
app.use('/api/avoir-pdf', authenticateToken, avoirPdfRoutes);

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
    res.status(500).json({
        success: false,
        message: err.message || 'Erreur interne du serveur',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

module.exports = app;
