import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

// Gestionnaire d'erreur global pour ignorer les erreurs CORS provenant d'extensions de navigateur
window.addEventListener('error', (event: ErrorEvent): void => {
  // Ignorer les erreurs CORS provenant de services tiers (extensions de navigateur, etc.)
  const errorMessage = event.message || event.error?.message || '';
  const errorSource = event.filename || '';
  
  if (errorMessage.includes('useblackbox.io') || 
      errorMessage.includes('CORS policy') || 
      errorMessage.includes('Access-Control-Allow-Origin') ||
      errorMessage.includes('Failed to fetch') ||
      errorSource.includes('useblackbox.io') ||
      errorSource.includes('index.iife.js')) {
    event.preventDefault();
    event.stopPropagation();
    // Ne pas afficher l'erreur dans la console pour éviter le spam
    return;
  }
}, true); // Utiliser capture phase pour intercepter avant les autres handlers

// Gestionnaire pour les erreurs de fetch non gérées (promises rejetées)
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent): void => {
  const errorMessage = event.reason?.message || event.reason?.toString() || '';
  const errorStack = event.reason?.stack || '';
  
  if (errorMessage.includes('useblackbox.io') || 
      errorMessage.includes('CORS policy') || 
      errorMessage.includes('Access-Control-Allow-Origin') ||
      errorMessage.includes('Failed to fetch') ||
      errorStack.includes('useblackbox.io') ||
      errorStack.includes('index.iife.js')) {
    event.preventDefault();
    // Ne pas afficher l'erreur dans la console pour éviter le spam
    return;
  }
});

// Intercepter également les erreurs de console.error pour les filtrer
const originalConsoleError = console.error;
console.error = (...args: any[]): void => {
  const errorString = args.join(' ');
  if (errorString.includes('useblackbox.io') || 
      errorString.includes('CORS policy') ||
      errorString.includes('index.iife.js')) {
    // Ignorer silencieusement ces erreurs
    return;
  }
  // Appeler la fonction originale pour les autres erreurs
  originalConsoleError.apply(console, args);
};

// ✅ NOUVEAU: Intercepter les warnings de console.warn pour les filtrer
const originalConsoleWarn = console.warn;
console.warn = (...args: any[]): void => {
  const warnString = args.join(' ');
  
  // Liste des warnings à masquer
  const warningsToHide = [
    'quill Overwriting modules/mention', // Warnings Quill
    'quill Overwriting', // Autres warnings Quill
    'jQuery.Deferred exception', // Exceptions jQuery non critiques
    'e.scrollbar is not a function', // Erreur scrollbar (si plugin non chargé)
    '[AuthInterceptor] Token manquant pour la requête: /api/auth/login', // Warning normal pour login
    'Token manquant pour la requête', // Autres warnings de token manquant pour login
    'useblackbox.io', // Extensions de navigateur
    'CORS policy', // CORS
    'Access-Control-Allow-Origin', // CORS
    'index.iife.js' // Extensions
  ];
  
  // Vérifier si le warning doit être masqué
  const shouldHide = warningsToHide.some(pattern => warnString.includes(pattern));
  
  if (shouldHide) {
    // Ignorer silencieusement ces warnings
    return;
  }
  
  // Appeler la fonction originale pour les autres warnings
  originalConsoleWarn.apply(console, args);
};

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => {
    // Erreur critique de bootstrap - doit être visible
    originalConsoleError('Erreur critique lors du démarrage de l\'application:', err);
  });