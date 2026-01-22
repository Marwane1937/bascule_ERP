# 🔒 Guide de Sécurité - Configuration Production

## 📋 Configuration des Variables d'Environnement

### Fichier `.env` pour la Production

Créez un fichier `.env` à la racine du backend avec les variables suivantes :

```env
# ============================================
# ENVIRONNEMENT
# ============================================
NODE_ENV=production

# ============================================
# JWT CONFIGURATION
# ============================================
# ⚠️ IMPORTANT: Générer un secret fort (min 32 caractères)
# Commande: node scripts/generate-secret.js
JWT_SECRET=<secret-généré>
JWT_EXPIRES_IN=24h

# ============================================
# BASE DE DONNÉES
# ============================================
DB_HOST=your-db-host
DB_NAME=your-db-name
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_INSTANCE=your-instance

# ============================================
# CORS - SÉCURITÉ
# ============================================
# Domaines autorisés (séparés par des virgules)
# Exemple: https://votre-domaine.com,https://www.votre-domaine.com
ALLOWED_ORIGINS=https://votre-domaine.com

# ============================================
# URL DE BASE
# ============================================
BASE_URL=https://api.votre-domaine.com

# ============================================
# EMAIL CONFIGURATION
# ============================================
EMAIL_USER=your-email@domain.com
EMAIL_PASS=your-email-password

# ============================================
# WHATSAPP CONFIGURATION
# ============================================
WHATSAPP_TOKEN=your-whatsapp-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
```

## 🔐 Génération du Secret JWT

**⚠️ OBLIGATOIRE EN PRODUCTION**

```bash
node scripts/generate-secret.js
```

Copiez le secret généré dans votre fichier `.env` :

```env
JWT_SECRET=<secret-généré>
```

## 🛡️ Mesures de Sécurité Activées en Production

### 1. CORS (Cross-Origin Resource Sharing)
- ✅ Restriction des origines autorisées
- ✅ Configuration via `ALLOWED_ORIGINS`
- ⚠️ Si `ALLOWED_ORIGINS` est vide, toutes les origines sont autorisées (temporaire)

### 2. Helmet - Headers de Sécurité
- ✅ Content Security Policy (CSP)
- ✅ HTTP Strict Transport Security (HSTS)
- ✅ Protection contre XSS, clickjacking, etc.

### 3. Rate Limiting
- ✅ **Authentification** : 5 tentatives max / 15 minutes
- ✅ **API générale** : 100 requêtes max / minute

### 4. Validation JWT Secret
- ✅ Vérification que `JWT_SECRET` n'est pas la valeur par défaut
- ✅ Avertissement si le secret est trop court (< 32 caractères)

### 5. HTTPS Forcé
- ✅ Redirection automatique HTTP → HTTPS (sauf localhost)

### 6. Fichiers Statiques
- ✅ Protection contre l'exécution de scripts malveillants

## 🚀 Déploiement

### Étape 1: Générer le Secret JWT
```bash
node scripts/generate-secret.js
```

### Étape 2: Configurer le fichier `.env`
Copiez les valeurs générées et configurez toutes les variables.

### Étape 3: Vérifier la Configuration
```bash
# Vérifier que NODE_ENV=production
echo $NODE_ENV

# Vérifier que JWT_SECRET est configuré
# (ne doit pas être 'your-secret-key')
```

### Étape 4: Démarrer l'Application
```bash
npm start
```

## 🔍 Vérification

### En Développement
- CORS permissif (toutes les origines)
- Pas de rate limiting
- Détails d'erreur visibles
- Log: `🔓 [SECURITY] Mode développement - CORS permissif`

### En Production
- CORS restrictif (domaines configurés)
- Rate limiting actif
- Détails d'erreur masqués
- Log: `🔒 [SECURITY] Mode production activé - Sécurité renforcée`

## ⚠️ Checklist de Sécurité

Avant de déployer en production, vérifiez :

- [ ] `NODE_ENV=production` est défini
- [ ] `JWT_SECRET` est généré et configuré (pas la valeur par défaut)
- [ ] `ALLOWED_ORIGINS` contient vos domaines (ou est vide temporairement)
- [ ] `BASE_URL` pointe vers votre domaine de production
- [ ] Tous les mots de passe sont forts et uniques
- [ ] HTTPS est configuré sur le serveur
- [ ] Les logs ne contiennent pas d'informations sensibles
- [ ] Les sauvegardes de base de données sont configurées

## 📞 Support

En cas de problème, vérifiez les logs du serveur pour les messages de sécurité.

