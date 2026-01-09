require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3500;

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📊 Environnement: ${process.env.NODE_ENV || 'development'}`);
});







