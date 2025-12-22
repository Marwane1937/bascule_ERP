# Système ERP de Gestion d'Entreprise

Une solution ERP (Enterprise Resource Planning) complète et full-stack conçue pour rationaliser les opérations commerciales, incluant la gestion des ventes, le suivi des stocks et les relations clients/fournisseurs. Construit avec une stack technique moderne assurant évolutivité, performance et capacités temps réel.

## 🚀 Fonctionnalités Clés

*   **Gestion des Ventes** : Gestion complète du cycle de vie, des Devis aux Commandes et Livraisons.
*   **Gestion des Stocks & Produits** : Suivi détaillé des produits, familles et niveaux de stock.
*   **Fonctionnalités CRM** : Gestion des Clients, Fournisseurs et Agents commerciaux.
*   **Support Multi-Bases de Données** : Basculement dynamique entre différents contextes de base de données.
*   **Assistant Temps Réel** : Assistant de chat intégré basé sur WebSocket pour le support utilisateur.
*   **Génération de Documents** : Génération automatisée de PDF pour les devis et commandes.
*   **Édition de Texte Riche** : Intégration de l'éditeur Quill pour un contenu de document personnalisable.
*   **Contrôle d'Accès Basé sur les Rôles** : Système d'authentification et d'autorisation sécurisé.

## 🛠️ Architecture Technique

### Backend (Node.js & Express)
*   **Framework** : Express.js pour une architecture API RESTful.
*   **Base de Données** : SQL Server (MSSQL) utilisant **Sequelize ORM** pour une modélisation de données robuste et le support des migrations.
*   **Authentification** : Implémentation sécurisée JWT (JSON Web Token) avec `bcryptjs` pour le hachage des mots de passe.
*   **Temps Réel** : Implémentation native `ws` (WebSocket) pour la communication bidirectionnelle client-serveur.
*   **Services** : Architecture en couches séparant les Contrôleurs, Services et Couches d'Accès aux Données.
*   **Utilitaires** : `pdfkit` pour la génération de PDF côté serveur, `nodemailer` pour les services d'email.

### Frontend (Angular 16)
*   **Framework** : Angular 16 avec une architecture modulaire (Feature Modules).
*   **Gestion d'État** : RxJS pour la gestion d'état réactive et le traitement asynchrone des données.
*   **Composants UI** :
    *   **DataTables** : Tableaux avancés avec tri, filtrage et pagination.
    *   **Éditeur Quill** : Intégration d'éditeur de texte riche pour la personnalisation des documents.
    *   **SweetAlert2** : Boîtes de dialogue modales modernes et réactives.
*   **Routage** : Routes protégées avec Gardes et Intercepteurs HTTP pour la gestion automatique des tokens.
*   **Formulaires** : Utilisation extensive des Formulaires Réactifs pour la saisie de données complexe et la validation.

## 📂 Structure du Projet

```
├── backend/
│   ├── src/
│   │   ├── config/         # Configuration Base de données et env
│   │   ├── controllers/    # Gestionnaires de requêtes
│   │   ├── models/         # Modèles de base de données Sequelize
│   │   ├── routes/         # Définitions des routes API
│   │   ├── services/       # Couche logique métier
│   │   └── server.js       # Point d'entrée & configuration WebSocket
│   └── package.json
│
├── frontend/
│   ├── src/app/
│   │   ├── auth/           # Module d'authentification
│   │   ├── base/           # Entités principales (Clients, Produits, etc.)
│   │   ├── vente/          # Module de ventes (Devis, Commandes)
│   │   ├── shared/         # Composants partagés & utilitaires
│   │   └── service/        # Services de consommation API
│   └── package.json
```

## 🔧 Installation & Configuration

### Prérequis
*   Node.js (v16+)
*   SQL Server
*   Angular CLI

### Configuration Backend
1.  Naviguer vers le dossier `backend/`.
2.  Installer les dépendances : `npm install`
3.  Configurer le fichier `.env` avec les identifiants de la base de données.
4.  Démarrer le serveur : `npm start`

### Configuration Frontend
1.  Naviguer vers le dossier `frontend/`.
2.  Installer les dépendances : `npm install`
3.  Démarrer le serveur de développement : `ng serve`
4.  Accéder à l'application sur `http://localhost:4200`
