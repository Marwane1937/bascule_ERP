# Corrections Appliquées

## 1. PDF Livraison

### Problème
Le PDF de livraison ne fonctionnait plus alors qu'il était fonctionnel auparavant.

### Solution
- La route `/api/pdf/generate` a été améliorée pour mieux gérer tous les types de documents (Devis, Commande, Livraison)
- Le message d'erreur a été généralisé de "Devis introuvable" à "Document introuvable"
- Le service utilise déjà la fonction `getEmailDataByDocumentId` qui recherche automatiquement dans `v_livraison_report` si le document n'est pas trouvé dans `vente_document`
- Le dossier static `/livraisons` a été ajouté dans `app.js`

### Fichiers modifiés
- `backend/src/routes/pdf.routes.js` - Route améliorée avec gestion des paramètres PDF
- `backend/src/app.js` - Ajout du dossier static `/livraisons`

## 2. Nouvelle Table PDF Settings

### Problème
Lors de l'enregistrement des documents société, l'erreur suivante s'affichait :
```
Erreur sauvegarde documents société: Error: Erreur lors de la sauvegarde des documents: 
WHERE parameter "societe_id" has invalid "undefined" value
```
Le paramètre `societe_id` arrivait comme `undefined`.

### Solution
Création d'une nouvelle table indépendante `pdf_settings` qui ne dépend pas de `societe_id` :

**Nouvelle table : `pdf_settings`**
- `id` (INT, Primary Key, Auto Increment)
- `logo` (VARBINARY(MAX))
- `entete` (NVARCHAR(MAX))
- `pied_page` (NVARCHAR(MAX))
- `actif` (BIT, Default: 1)
- `created_at` (DATETIME)
- `updated_at` (DATETIME)

### Nouveaux fichiers créés
- `backend/src/models/pdf_settings.model.js` - Modèle Sequelize
- `backend/src/services/pdf_settings.service.js` - Service de gestion
- `backend/src/controllers/pdf_settings.controller.js` - Contrôleur
- `backend/src/routes/pdf_settings.routes.js` - Routes API
- `backend/src/scripts/create_pdf_settings_table.sql` - Script SQL de création

### Fichiers modifiés
- `backend/src/app.js` - Enregistrement de la route `/api/pdf-settings`
- `frontend/src/app/service/auth.service.ts` - Ajout de `getPdfSettings()` et modification de `updateDocumentSociete()` pour utiliser la nouvelle API
- `frontend/src/app/auth/document-settings/document-settings.component.ts` - Mise à jour pour utiliser la nouvelle API

### Migration SQL
Exécuter le script `backend/src/scripts/create_pdf_settings_table.sql` dans votre base de données pour créer la table.

## 3. Bouton pour réafficher le Sidebar

### Problème
Le menu pouvait bien se cacher (hide), mais il n'existait aucun bouton visible pour le réafficher.

### Solution
Ajout d'un bouton flottant animé qui apparaît à gauche de l'écran quand le sidebar est caché :
- Position fixe sur le côté gauche de l'écran
- Animation pulse pour attirer l'attention
- Visible uniquement sur desktop (≥992px)
- Caché sur mobile où le système `nav_open` existant reste actif

### Fichiers modifiés
- `frontend/src/app/app.component.html` - Ajout du bouton flottant
- `frontend/src/app/app.component.css` - Styles pour le bouton flottant

## Notes Importantes

1. **Table PDF Settings** : La nouvelle table est indépendante et ne nécessite pas de `societe_id`. Un seul enregistrement peut être actif à la fois (flag `actif = 1`).

2. **Migration** : N'oubliez pas d'exécuter le script SQL pour créer la table `pdf_settings` :
   ```sql
   -- Voir backend/src/scripts/create_pdf_settings_table.sql
   ```

3. **API** : Les routes de l'ancienne API `/api/document-societe` restent disponibles pour compatibilité, mais la nouvelle API `/api/pdf-settings` est maintenant utilisée par défaut.

4. **PDF Livraison** : Le service utilise toujours la même logique, mais avec une meilleure gestion des erreurs et des types de documents.

## Prochaines étapes

1. Exécuter le script SQL pour créer la table `pdf_settings`
2. Tester la sauvegarde des paramètres PDF dans l'interface DocumentSettings
3. Tester la génération du PDF de livraison
4. Vérifier que le bouton flottant apparaît bien quand le sidebar est caché



