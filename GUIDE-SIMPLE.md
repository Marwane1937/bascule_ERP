# Guide Simple - Gestion des Documents de Société

## 🎯 Objectif
Vous avez maintenant une interface complète pour gérer les documents (logo, en-tête, pied de page) de vos sociétés **sans recréer les tables**.

## 🚀 Comment utiliser

### 1. Démarrer l'application
```bash
# Backend
cd backend
npm start

# Frontend (nouveau terminal)
cd frontend
ng serve
```

### 2. Se connecter
- Aller sur `http://localhost:4200`
- Se connecter avec `admin` / `admin123`

### 3. Gérer les documents de société
- Aller sur `/societe-management`
- Cliquer sur une société pour la configurer
- Configurer le logo, l'en-tête et le pied de page
- Sauvegarder

## 📋 Interface de gestion

### Page `/societe-management`
- **Liste des sociétés** : Affiche toutes les sociétés avec leur statut
- **Statut des documents** : Indique si logo, en-tête, pied de page sont configurés
- **Configuration** : Cliquer sur une société pour la configurer

### Configuration des documents
1. **Logo** : 
   - Cliquer sur "Sélectionner un logo"
   - Choisir une image (PNG, JPG recommandés)
   - Prévisualisation automatique

2. **En-tête** :
   ```html
   <h2>NOM DE VOTRE SOCIÉTÉ</h2>
   <p>Adresse complète</p>
   <p>Téléphone | Email</p>
   ```

3. **Pied de page** :
   ```
   RC Casablanca 147263 - IF 1680876 - Patente 37964603
   ```

## 🔧 Vérifier l'état des sociétés

### Script de vérification
```bash
cd backend
node src/scripts/init-documents.js
```

Ce script vous montre :
- Combien de sociétés existent
- Quels documents sont configurés pour chaque société
- Instructions pour configurer les documents manquants

## 📁 Structure des données

### Table `societes`
- `id` : Identifiant unique
- `nom` : Nom de la société
- `nom_base` : Nom de la base de données
- `actif` : Statut actif/inactif

### Table `document_societe`
- `id` : Identifiant unique
- `societe_id` : Référence vers la société
- `logo` : Logo en base64 (BLOB)
- `entete` : En-tête HTML
- `pied_page` : Pied de page texte

## 🎨 Exemples de configuration

### En-tête HTML
```html
<div>
  <h2 style="color: #333; margin: 0;">VOTRE SOCIÉTÉ</h2>
  <p style="margin: 5px 0;">123 Rue de la Paix</p>
  <p style="margin: 5px 0;">75001 Paris</p>
  <p style="margin: 5px 0;">Tél: 01 23 45 67 89 | Email: contact@votre-societe.com</p>
</div>
```

### Pied de page
```
RC Paris 123456 - IF 789012 - Patente 345678 - CNSS 901234 - ICE 567890123456789
```

## ✅ Avantages de cette solution

1. **Pas de recréation de tables** : Utilise les tables existantes
2. **Interface intuitive** : Gestion visuelle des documents
3. **Prévisualisation** : Voir le logo avant sauvegarde
4. **Statut visuel** : Savoir quels documents sont configurés
5. **Application automatique** : Tous les PDFs utilisent les documents configurés

## 🔄 Workflow typique

1. **Vérifier les sociétés** : `node src/scripts/init-documents.js`
2. **Démarrer l'application** : `npm start` + `ng serve`
3. **Se connecter** : admin/admin123
4. **Aller sur** : `/societe-management`
5. **Configurer** : Cliquer sur une société et configurer ses documents
6. **Tester** : Générer un PDF pour voir le résultat

## 🎯 Résultat

Une fois configuré, tous les PDFs générés (devis, factures, etc.) utiliseront automatiquement :
- Le logo de votre société
- L'en-tête personnalisé
- Le pied de page personnalisé

**Plus besoin de recréer les tables !** 🎉











