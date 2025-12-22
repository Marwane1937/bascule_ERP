# Création de l'utilisateur Admin

## Méthode 1 : Via l'API (Recommandé)

Vous pouvez créer l'utilisateur admin en appelant l'endpoint suivant :

```bash
POST http://localhost:3500/api/auth/create-admin
```

Cela créera automatiquement un utilisateur admin avec :
- **Login**: `admin`
- **Mot de passe**: `admin123`
- **Type**: Administrateur (1)
- **État**: Actif (1)

## Méthode 2 : Via le script Node.js

Exécutez le script directement :

```bash
cd backend
node src/scripts/create-admin-user.js
```

## Méthode 3 : Via l'endpoint de création d'utilisateur

Vous pouvez aussi créer un utilisateur via l'API :

```bash
POST http://localhost:3500/api/auth/create-user
Content-Type: application/json

{
  "nom": "Administrateur",
  "login": "admin",
  "password": "admin123",
  "type": 1
}
```

## Vérification

Après création, vous pouvez vous connecter avec :
- **Login**: `admin`
- **Mot de passe**: `admin123`

## Notes importantes

- Le script vérifie si l'utilisateur admin existe déjà avant de le créer
- Si l'utilisateur existe déjà, le script ne fera rien
- Le mot de passe est hashé avec bcrypt avant d'être stocké
- L'authentification est maintenant insensible à la casse (admin, Admin, ADMIN fonctionnent tous)

