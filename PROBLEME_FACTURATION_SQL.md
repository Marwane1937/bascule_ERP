# Problème SQL - Interface Facturation

## Erreur observée

L'erreur indique un `AggregateError` lors de l'exécution des requêtes SQL sur la vue `v_facture`.

### Analyse de l'erreur

L'erreur montre que :
1. La requête SQL est correctement formée
2. Les deux requêtes (comptage + données) échouent
3. Il y a une `AggregateError` avec plusieurs `RequestError` imbriqués

### Causes possibles

1. **La vue `v_facture` n'existe pas** dans la base de données
2. **Problème de syntaxe SQL** avec `OFFSET/FETCH` ou `ROW_NUMBER()`
3. **Problème de connexion** à la base de données
4. **Permissions insuffisantes** pour accéder à la vue

## Solutions

### Solution 1 : Vérifier si la vue existe

Exécuter cette requête dans SQL Server Management Studio :

```sql
-- Vérifier si la vue existe
SELECT * FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = 'v_facture';

-- Voir la définition de la vue
EXEC sp_helptext 'v_facture';
```

### Solution 2 : Créer la vue si elle n'existe pas

Si la vue n'existe pas, elle doit être créée selon la requête SQL fournie initialement :

```sql
CREATE VIEW v_facture AS
SELECT
    facture_id,
    facture_num,
    facture_dat,
    nom,
    facture_ht,
    facture_tva,
    facture_ttc
FROM [table_source]
-- Ajouter les jointures nécessaires
```

### Solution 3 : Utiliser une requête directe temporaire

En attendant que la vue soit créée, nous pouvons utiliser directement la requête SQL dans le modèle.

### Solution 4 : Fallback sans pagination

Le code a été mis à jour pour utiliser un fallback sans pagination si la pagination échoue.

## Diagnostic recommandé

1. Vérifier que la vue `v_facture` existe
2. Vérifier les permissions sur la vue
3. Tester une requête simple : `SELECT TOP 1 * FROM v_facture`
4. Vérifier les logs du serveur pour plus de détails



