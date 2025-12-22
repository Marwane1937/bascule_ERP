# Diagnostic de l'erreur - Interface Facturation

## Erreur observée

```
AggregateError avec plusieurs RequestError
La requête SQL échoue lors de l'accès à la vue v_facture
```

## Cause probable

**La vue `v_facture` n'existe pas dans la base de données.**

## Solutions

### Solution 1 : Vérifier si la vue existe

Exécutez cette requête dans SQL Server Management Studio :

```sql
SELECT * FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = 'v_facture';
```

### Solution 2 : Créer la vue v_facture

Si la vue n'existe pas, vous devez la créer. Utilisez le script `CREATION_VUE_V_FACTURE.sql` comme base et adaptez-le à votre structure de base de données.

La vue doit retourner les colonnes suivantes :
- `facture_id`
- `facture_num`
- `facture_dat`
- `nom` (nom du client)
- `facture_ht`
- `facture_tva`
- `facture_ttc`

### Solution 3 : Vérifier les permissions

Assurez-vous que l'utilisateur de la base de données a les permissions nécessaires pour :
- Lire la vue `v_facture`
- Exécuter des requêtes SELECT

### Solution 4 : Fallback automatique

Le code a été configuré pour utiliser automatiquement un fallback sans pagination si la pagination échoue. Cependant, si la vue n'existe pas, même le fallback échouera.

## Prochaines étapes

1. Vérifiez si la vue `v_facture` existe dans votre base de données
2. Si elle n'existe pas, créez-la en adaptant le script `CREATION_VUE_V_FACTURE.sql`
3. Testez l'interface Facturation après la création de la vue

## Note

Si la vue existe mais que l'erreur persiste, vérifiez :
- La structure de la vue (colonnes attendues)
- Les permissions d'accès
- Les logs du serveur pour plus de détails



