FROM node:20-alpine

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances de production uniquement
RUN npm ci --only=production

# Copier le reste du code
COPY . .

# Exposer le port (par défaut 3500 selon server.js)
EXPOSE 3500

# Utiliser la commande start du package.json qui inclut --max-old-space-size=4096
CMD ["npm", "start"]