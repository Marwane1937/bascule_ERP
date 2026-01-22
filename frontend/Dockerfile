FROM nginx:alpine

# Copier les fichiers compilés depuis dist/frontend (selon angular.json)
COPY dist/frontend/ /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]