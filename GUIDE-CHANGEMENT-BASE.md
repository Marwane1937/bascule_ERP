# 🔄 Guide - Changement de Base de Données Multi-Société

## 🎯 Fonctionnalité implémentée

Votre système dispose maintenant d'un **sélecteur de société** complet avec :

- ✅ **Liste des sociétés** depuis la table `societes`
- ✅ **Confirmation avant changement** avec SweetAlert2
- ✅ **Déconnexion/reconnexion automatique**
- ✅ **Même instance/utilisateur/mot de passe** - seule la base change

## 🚀 Démarrage rapide

### 1. Initialiser les données de test
```bash
cd backend
node src/scripts/init-complete-test-data.js
```

### 2. Démarrer le backend
```bash
cd backend
npm start
```

### 3. Démarrer le frontend
```bash
cd frontend
ng serve
```

### 4. Accéder à l'application
- Ouvrir `http://localhost:4200`
- Se connecter avec `admin` / `admin123`

## 🏢 Sociétés disponibles

Après initialisation, vous aurez :

| Société | Base de données | Utilisateur | Mot de passe |
|---------|----------------|-------------|--------------|
| Cactus Informatique | cactus_informatique | admin | admin123 |
| Cactus Informatique | cactus_informatique | cactus_informatique_user | user123 |
| Alpha Solutions | alpha_solutions | alpha_solutions_user | user123 |
| Beta Technologies | beta_technologies | beta_technologies_user | user123 |
| Gamma Services | gamma_services | gamma_services_user | user123 |

## 🎨 Interface utilisateur

### Sélecteur de société dans le header
```
[Système de Gestion] [🏢 Cactus Informatique ▼] [👤 Admin] [Déconnexion]
```

### Fonctionnement du sélecteur

1. **Clic sur le sélecteur** → Liste déroulante s'ouvre
2. **Sélection d'une société** → Boîte de confirmation s'affiche
3. **Confirmation** → Changement de base + déconnexion automatique
4. **Redirection** → Page de login pour se reconnecter

## 🔄 Workflow complet

### Étape 1 : Sélection
- Cliquer sur le sélecteur de société
- Voir toutes les sociétés disponibles
- Choisir une société différente

### Étape 2 : Confirmation
```
┌─────────────────────────────────────┐
│        Changement de société        │
├─────────────────────────────────────┤
│ Voulez-vous vraiment vous connecter│
│ à la base :                         │
│                                     │
│ Société : Alpha Solutions           │
│ Base de données : alpha_solutions   │
│                                     │
│ ⚠️ Attention : Vous allez être      │
│    déconnecté et reconnecté         │
│    automatiquement.                 │
│                                     │
│    [Annuler]    [Oui, se connecter] │
└─────────────────────────────────────┘
```

### Étape 3 : Changement automatique
1. **Test de connexion** à la nouvelle base
2. **Message de chargement** avec SweetAlert2
3. **Déconnexion automatique** si succès
4. **Redirection** vers la page de login

### Étape 4 : Reconnexion
- Se reconnecter avec un utilisateur de la nouvelle société
- L'interface s'adapte automatiquement

## 🛠️ Architecture technique

### Backend
- **Service DatabaseSwitchService** : Gestion des connexions
- **Contrôleur DatabaseSwitchController** : API REST
- **Routes `/api/database/*`** : Endpoints protégés
- **Test de connexion** avant changement

### Frontend
- **Composant SocieteSelector** : Interface de sélection
- **Service AuthService** : Gestion des changements
- **SweetAlert2** : Confirmations et notifications
- **Déconnexion automatique** après changement

## 📋 API Endpoints

### Changement de base de données
```http
POST /api/database/switch-database
Content-Type: application/json
Authorization: Bearer <token>

{
  "societe_id": 2
}
```

### Test de connexion
```http
POST /api/database/test-connection
Content-Type: application/json
Authorization: Bearer <token>

{
  "database_name": "alpha_solutions"
}
```

### Liste des bases disponibles
```http
GET /api/database/list-databases
Authorization: Bearer <token>
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

## 🎯 Cas d'usage

### Scénario 1 : Changement de société
1. Utilisateur connecté à "Cactus Informatique"
2. Clique sur le sélecteur
3. Choisit "Alpha Solutions"
4. Confirme le changement
5. Déconnexion automatique
6. Se reconnecte avec un compte Alpha Solutions

### Scénario 2 : Gestion multi-société
1. Admin peut voir toutes les sociétés
2. Peut basculer entre les sociétés
3. Chaque société a ses propres données
4. Documents personnalisés par société

## ⚠️ Points importants

### Sécurité
- ✅ **Authentification requise** pour tous les changements
- ✅ **Test de connexion** avant changement
- ✅ **Déconnexion forcée** après changement
- ✅ **Validation des données** côté serveur

### Performance
- ✅ **Connexions poolées** pour les tests
- ✅ **Fermeture des connexions** après test
- ✅ **Messages de chargement** pour l'UX

### Gestion d'erreurs
- ✅ **Messages d'erreur explicites**
- ✅ **Fallback en cas d'échec**
- ✅ **Logs détaillés** pour le debug

## 🐛 Résolution des problèmes

### Erreur "Base de données non trouvée"
1. Vérifier que la base existe sur le serveur
2. Vérifier les permissions de l'utilisateur
3. Vérifier la configuration de connexion

### Erreur "Connexion refusée"
1. Vérifier que SQL Server est démarré
2. Vérifier les paramètres de connexion
3. Vérifier le firewall

### Problème d'affichage du sélecteur
1. Vérifier que les sociétés sont chargées
2. Vérifier la console du navigateur (F12)
3. Vérifier les logs du serveur

## 🎉 Résultat final

Vous avez maintenant un système complet de gestion multi-société avec :

- ✅ **Sélecteur intuitif** dans le header
- ✅ **Confirmation avant changement**
- ✅ **Déconnexion/reconnexion automatique**
- ✅ **Gestion d'erreurs robuste**
- ✅ **Interface utilisateur moderne**

Le système est prêt pour la production ! 🚀







