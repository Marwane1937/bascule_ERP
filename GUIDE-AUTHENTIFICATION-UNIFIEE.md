# 🔐 Guide - Authentification Unifiée Multi-Bases

## 🎯 Concept implémenté

Votre système dispose maintenant d'une **authentification unifiée** qui permet :

- ✅ **Une seule table `users`** pour tous les utilisateurs
- ✅ **Liste déroulante** des bases de données disponibles
- ✅ **Confirmation avant changement** de base
- ✅ **Déconnexion/reconnexion automatique**
- ✅ **Permissions par utilisateur** pour les bases

## 🚀 Démarrage rapide

### 1. Initialiser les utilisateurs unifiés
```bash
cd backend
node src/scripts/init-unified-users.js
```

### 2. Démarrer l'application
```bash
# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - Frontend
cd frontend
ng serve
```

### 3. Se connecter
- Ouvrir `http://localhost:4200`
- Utiliser `admin` / `admin123`

## 👤 Comptes disponibles

| Utilisateur | Mot de passe | Rôle | Bases autorisées |
|-------------|--------------|------|------------------|
| `admin` | `admin123` | Admin | Toutes les bases |
| `user` | `user123` | User | cactus_informatique, alpha_solutions |
| `manager` | `manager123` | Manager | cactus_informatique, alpha_solutions, beta_technologies |

## 🏢 Bases de données disponibles

- `cactus_informatique` → Cactus Informatique
- `alpha_solutions` → Alpha Solutions  
- `beta_technologies` → Beta Technologies
- `gamma_services` → Gamma Services

## 🎨 Interface utilisateur

### Header avec sélecteur de base
```
[Système de Gestion] [🗄️ Cactus Informatique ▼] [👤 Admin] [Déconnexion]
```

### Fonctionnement du sélecteur

1. **Clic sur le sélecteur** → Liste déroulante des bases autorisées
2. **Sélection d'une base** → Boîte de confirmation s'affiche
3. **Confirmation** → Changement de base + déconnexion automatique
4. **Redirection** → Page de login pour se reconnecter

## 🔄 Workflow complet

### Étape 1 : Connexion
- Se connecter avec un compte unifié
- Le système charge les bases autorisées pour cet utilisateur

### Étape 2 : Sélection de base
- Cliquer sur le sélecteur de base dans le header
- Voir toutes les bases autorisées
- Choisir une base différente

### Étape 3 : Confirmation
```
┌─────────────────────────────────────┐
│     Changement de base de données   │
├─────────────────────────────────────┤
│ Voulez-vous vraiment vous connecter │
│ à la base :                         │
│                                     │
│ Base de données : Alpha Solutions   │
│ Nom technique : alpha_solutions      │
│                                     │
│ ⚠️ Attention : Vous allez être      │
│    déconnecté et reconnecté         │
│    automatiquement.                 │
│                                     │
│    [Annuler]    [Oui, se connecter] │
└─────────────────────────────────────┘
```

### Étape 4 : Changement automatique
1. **Test de connexion** à la nouvelle base
2. **Message de chargement** avec SweetAlert2
3. **Déconnexion automatique** si succès
4. **Redirection** vers la page de login

### Étape 5 : Reconnexion
- Se reconnecter avec le même compte unifié
- L'interface s'adapte à la nouvelle base

## 🛠️ Architecture technique

### Backend
- **Modèle UnifiedUser** : Table unifiée pour tous les utilisateurs
- **Service UnifiedAuthService** : Gestion de l'authentification
- **Contrôleur UnifiedAuthController** : API REST
- **Routes `/api/unified-auth/*`** : Endpoints d'authentification
- **Service DatabaseSwitchService** : Gestion des changements de base

### Frontend
- **Composant DatabaseSelector** : Interface de sélection
- **Service AuthService** : Gestion des changements
- **SweetAlert2** : Confirmations et notifications
- **Déconnexion automatique** après changement

## 📋 API Endpoints

### Authentification unifiée
```http
POST /api/unified-auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

### Informations utilisateur
```http
GET /api/unified-auth/me
Authorization: Bearer <token>
```

### Bases de données disponibles
```http
GET /api/unified-auth/databases
Authorization: Bearer <token>
```

### Changement de base
```http
POST /api/unified-auth/switch-database
Content-Type: application/json
Authorization: Bearer <token>

{
  "database_name": "alpha_solutions"
}
```

## 🔧 Configuration requise

### Variables d'environnement (.env)
```env
# Base de données principale
DB_HOST=localhost
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=your_main_database
DB_INSTANCE=SQLEXPRESS

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h
```

### Bases de données à créer
Vous devez créer les bases suivantes sur votre serveur SQL Server :
- `cactus_informatique`
- `alpha_solutions`
- `beta_technologies`
- `gamma_services`

## 🎯 Avantages de cette approche

### 1. **Authentification centralisée**
- Une seule table pour tous les utilisateurs
- Gestion des permissions par utilisateur
- Pas de duplication des comptes

### 2. **Flexibilité des accès**
- Chaque utilisateur peut avoir accès à différentes bases
- Contrôle granulaire des permissions
- Facile à maintenir

### 3. **Sécurité renforcée**
- Vérification des permissions avant changement
- Test de connexion avant basculement
- Déconnexion forcée après changement

### 4. **Expérience utilisateur optimale**
- Interface intuitive
- Confirmations claires
- Messages d'état en temps réel

## 🐛 Résolution des problèmes

### Erreur "Accès non autorisé"
1. Vérifier que l'utilisateur a les permissions pour cette base
2. Vérifier la configuration des `allowed_databases`

### Erreur "Base de données non trouvée"
1. Vérifier que la base existe sur le serveur
2. Vérifier les permissions de l'utilisateur SQL Server

### Problème d'affichage du sélecteur
1. Vérifier que l'utilisateur est connecté
2. Vérifier la console du navigateur (F12)
3. Vérifier les logs du serveur

## 🎉 Résultat final

Vous avez maintenant un système d'authentification unifié qui permet :

- ✅ **Gestion centralisée** des utilisateurs
- ✅ **Sélection intuitive** des bases de données
- ✅ **Confirmations claires** avant changement
- ✅ **Déconnexion/reconnexion automatique**
- ✅ **Contrôle des permissions** par utilisateur

Le système est prêt pour la production ! 🚀







