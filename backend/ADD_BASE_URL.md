# Instructions pour ajouter BASE_URL dans .env

## Étape importante

Ajoutez cette ligne dans le fichier `backend/src/.env` :

```
BASE_URL=http://172.16.20.100
```

## Comment faire

1. Ouvrez le fichier `backend/src/.env`
2. Ajoutez la ligne `BASE_URL=http://172.16.20.100` à la fin du fichier
3. Sauvegardez le fichier

## Note

- Remplacez `172.16.20.100` par l'IP réelle de votre serveur si elle est différente
- Si vous utilisez un domaine, utilisez : `BASE_URL=http://votre-domaine.com`
- Ne mettez PAS de port dans BASE_URL (pas de `:3500`)

## Vérification

Après avoir ajouté BASE_URL, tous les PDFs utiliseront automatiquement cette URL au lieu de `localhost:3500`.

