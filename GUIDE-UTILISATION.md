# Guide d'utilisation - Système d'authentification multi-société

## 🚀 Démarrage rapide

### 1. Créer les tables de base de données
```bash
cd backend
node src/scripts/create-tables.js
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
- Se connecter avec :
  - **Admin** : `admin` / `admin123`
  - **User** : `user` / `user123`

## 📋 Fonctionnalités implémentées

### ✅ Authentification
- Page de login moderne et responsive
- Protection de toutes les routes
- Gestion des tokens JWT
- Déconnexion automatique

### ✅ Documents personnalisés
- **Logo** : Upload d'image (PNG, JPG, etc.)
- **En-tête** : Texte HTML personnalisé
- **Pied de page** : Texte personnalisé
- **Application automatique** sur tous les PDFs générés

### ✅ Interface utilisateur
- Menu complet masqué sur la page de login
- Header avec informations utilisateur et société
- Bouton de déconnexion
- Design moderne et responsive

## 🛠️ Comment configurer les documents de votre société

### 1. Accéder à la configuration
- Se connecter à l'application
- Aller sur `/document-settings` (à ajouter au menu)

### 2. Configurer le logo
- Cliquer sur "Sélectionner un logo"
- Choisir une image (PNG, JPG recommandés)
- L'image sera automatiquement redimensionnée

### 3. Configurer l'en-tête
```html
<h2>NOM DE VOTRE SOCIÉTÉ</h2>
<p>Adresse complète</p>
<p>Téléphone | Email</p>
<p>Site web</p>
```

### 4. Configurer le pied de page
```
RC Casablanca 147263 - IF 1680876 - Patente 37964603 - CNSS 7155915 - ICE 000210663000082
```

### 5. Sauvegarder
- Cliquer sur "Sauvegarder"
- Les documents générés utiliseront automatiquement ces informations

## 🔧 Configuration avancée

### Variables d'environnement (backend/.env)
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

### Ajouter une nouvelle société

1. **Via base de données** :
```sql
INSERT INTO societes (nom, nom_base, actif) 
VALUES ('Nouvelle Société', 'nouvelle_societe', 1);

INSERT INTO document_societe (societe_id, entete, pied_page) 
VALUES (2, '<h2>NOUVELLE SOCIÉTÉ</h2>', 'Informations légales');
```

2. **Via API** (à implémenter) :
```javascript
POST /api/societes
{
  "nom": "Nouvelle Société",
  "nom_base": "nouvelle_societe"
}
```

## 📁 Structure des fichiers

### Backend
```
backend/src/
├── models/
│   ├── societe.model.js
│   ├── document_societe.model.js
│   └── user.model.js
├── services/
│   ├── auth.service.js
│   ├── document_societe.service.js
│   └── email.service.js (modifié)
├── controllers/
│   ├── auth.controller.js
│   └── document_societe.controller.js
├── routes/
│   ├── auth.routes.js
│   └── document_societe.routes.js
├── middleware/
│   └── auth.middleware.js
└── scripts/
    ├── create-tables.js
    └── setup-relations.js
```

### Frontend
```
frontend/src/app/
├── auth/
│   ├── login/
│   └── document-settings/
├── service/
│   └── auth.service.ts
├── guards/
│   └── auth.guard.ts
├── interceptors/
│   └── auth.interceptor.ts
└── header/
    └── header.component.*
```

## 🔐 Sécurité

- ✅ Mots de passe hashés avec bcrypt
- ✅ Tokens JWT avec expiration
- ✅ Middleware d'authentification sur toutes les routes
- ✅ Validation des données côté client et serveur
- ✅ Protection CSRF via CORS

## 🐛 Résolution des problèmes

### Erreur "Invalid object name 'societes'"
```bash
# Solution : Créer les tables
cd backend
node src/scripts/create-tables.js
```

### Erreur de connexion base de données
1. Vérifier les variables d'environnement dans `.env`
2. Vérifier que SQL Server est démarré
3. Vérifier les permissions de l'utilisateur

### Problème d'affichage du menu
- L'application affiche seulement la page de login si non connecté
- Le menu complet s'affiche après connexion

## 📞 Support

Pour toute question ou problème :
1. Vérifier les logs du serveur backend
2. Vérifier la console du navigateur (F12)
3. Vérifier que toutes les dépendances sont installées

## 🎯 Prochaines étapes

1. **Ajouter la route document-settings au menu**
2. **Implémenter la sélection de société** (si plusieurs sociétés)
3. **Ajouter la gestion des rôles** (admin peut gérer toutes les sociétés)
4. **Optimiser les performances** (cache des documents)
5. **Ajouter des tests unitaires**

---

**Note** : Ce système est maintenant fonctionnel et prêt à être utilisé en production avec les configurations appropriées.

