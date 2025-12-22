# Système d'authentification multi-société

## Vue d'ensemble

Ce système implémente une authentification multi-société avec des documents personnalisés (logo, en-tête, pied de page) pour chaque société.

## Architecture

### Backend (Node.js + Express + Sequelize)
- **Authentification JWT** avec bcrypt pour le hashage des mots de passe
- **Modèles** : Societe, DocumentSociete, User (avec relations)
- **Middleware d'authentification** pour protéger les routes
- **Service de documents personnalisés** pour les PDFs

### Frontend (Angular)
- **Service d'authentification** avec gestion des tokens
- **Interceptor HTTP** pour ajouter automatiquement les tokens
- **AuthGuard** pour protéger les routes
- **Composant de login** avec formulaire réactif
- **Header avec bouton de déconnexion**

## Installation et démarrage

### Backend

1. **Installer les dépendances**
```bash
cd backend
npm install
```

2. **Configurer les variables d'environnement**
Créer un fichier `.env` dans le dossier backend :
```env
# Base de données
DB_HOST=localhost
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=your_database_name
DB_INSTANCE=SQLEXPRESS

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h

# Email (optionnel)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

3. **Démarrer avec données de test**
```bash
node start-with-test-data.js
```

### Frontend

1. **Installer les dépendances**
```bash
cd frontend
npm install
```

2. **Démarrer le serveur de développement**
```bash
ng serve
```

## Comptes de test

Après l'initialisation, vous pouvez vous connecter avec :

- **Admin** : username=`admin`, password=`admin123`
- **User** : username=`user`, password=`user123`

## Fonctionnalités

### Authentification
- ✅ Connexion/déconnexion
- ✅ Protection des routes
- ✅ Gestion des tokens JWT
- ✅ Redirection automatique

### Documents personnalisés
- ✅ Logo personnalisé par société
- ✅ En-tête personnalisé
- ✅ Pied de page personnalisé
- ✅ Application automatique sur tous les PDFs

### Interface utilisateur
- ✅ Page de login moderne
- ✅ Header avec informations utilisateur
- ✅ Bouton de déconnexion
- ✅ Design responsive

## API Endpoints

### Authentification
- `POST /api/auth/login` - Connexion
- `POST /api/auth/logout` - Déconnexion
- `GET /api/auth/me` - Informations utilisateur
- `GET /api/auth/document-societe` - Documents de la société

### Documents société
- `GET /api/document-societe/` - Récupérer les documents
- `POST /api/document-societe/` - Sauvegarder les documents
- `DELETE /api/document-societe/` - Supprimer les documents

## Structure des données

### Table `societes`
- `id` (PK)
- `nom` - Nom de la société
- `nom_base` - Nom de la base de données
- `actif` - Statut actif/inactif

### Table `document_societe`
- `id` (PK)
- `societe_id` (FK) - Référence vers societes
- `logo` (BLOB) - Logo en base64
- `entete` (TEXT) - En-tête HTML
- `pied_page` (TEXT) - Pied de page HTML

### Table `users`
- `id` (PK)
- `name` - Nom complet
- `email` - Email unique
- `username` - Nom d'utilisateur unique
- `password_hash` - Mot de passe hashé
- `societe_id` (FK) - Référence vers societes
- `role` - admin/user/manager
- `actif` - Statut actif/inactif

## Sécurité

- ✅ Mots de passe hashés avec bcrypt
- ✅ Tokens JWT avec expiration
- ✅ Middleware d'authentification sur toutes les routes
- ✅ Validation des données côté client et serveur
- ✅ Protection CSRF via CORS

## Personnalisation

Pour ajouter une nouvelle société :

1. Créer une entrée dans la table `societes`
2. Créer des documents dans `document_societe`
3. Créer des utilisateurs liés à cette société

Les documents générés utiliseront automatiquement les informations de la société de l'utilisateur connecté.

