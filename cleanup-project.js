const fs = require('fs');
const path = require('path');

console.log('🧹 Début du nettoyage du projet...\n');

const filesToDelete = [
  // === FICHIERS DE TEST ===
  'backend/test_email_model.js',
  'backend/test-database-switch.js',
  'backend/test-persistence.js',
  'backend/test-real-database.js',
  'backend/test-real-persistence.js',
  'backend/test-service-persistence.js',
  'backend/temp_auth.service.js',
  'backend/check_db.js',
  'backend/start-with-test-data.js',
  'backend/counters_output.txt',
  'backend/index.js',
  
  // === FICHIERS D'EXEMPLE ===
  'backend/frontend-improved-example.ts',
  'backend/frontend-service-example.ts',
  
  // === FICHIERS DE CONFIGURATION TEMPORAIRES ===
  'backend/src/config/test.js',
  'backend/src/check-admin.js',
  'backend/src/chatlog.json',
  
  // === DOSSIERS DUPLIQUÉS ===
  'backend/backend',
  'backend/controllers',
  'backend/routes',
  'backend/services',
  'backend/frontend',
  
  // === DOCUMENTATION REDONDANTE ===
  'CORRECTIONS_APPLIQUEES.md',
  'CORRECTIONS_FINALES.md',
  'DIAGNOSTIC_ERREUR_FACTURATION.md',
  'GUIDE-AUTHENTIFICATION-UNIFIEE.md',
  'GUIDE-CHANGEMENT-BASE.md',
  'GUIDE-FINAL.md',
  'GUIDE-SIMPLE.md',
  'GUIDE-UTILISATION.md',
  'LINKEDIN_EXPERIENCE.md',
  'OPTIMISATIONS_FACTURATION.md',
  'PROBLEME_FACTURATION_SQL.md',
  'README-AUTH.md',
  
  // === SCRIPTS SQL (garder seulement si nécessaire) ===
  'create_stock_tables.sql',
  'CREATION_VUE_V_FACTURE.sql',
  'MODIFIER_VUE_V_FACTURE_POUR_FACTURES_VIDES.sql',
  
  // === FICHIERS TEMPORAIRES ===
  'backend/tmp',
  
  // === FICHIERS FRONTEND DE TEST ===
  'frontend/src/app/app.component.spec.ts',
  'frontend/src/app/assistant/assistant.component.spec.ts',
  'frontend/src/app/service/base.service.spec.ts',
  'frontend/src/app/service/bot.service.spec.ts',
  'frontend/src/app/service/email.service.spec.ts',
  'frontend/src/app/service/ventes.service.spec.ts',
  'frontend/src/app/service/websocket.service.spec.ts',
  'frontend/src/app/uppercase.directive.spec.ts',
  
  // === FICHIERS DE BACKUP ===
  'frontend/src/app/service/stock.service.backup.ts',
  
  // === DOSSIERS FRONTEND DUPLIQUÉS ===
  'frontend/backend',
];

const dirsToClean = [
  // Nettoyer les PDF anciens (garder seulement les 30 derniers jours)
  'backend/public/devis',
  'backend/src/public/devis',
];

let deletedCount = 0;
let errorCount = 0;

function deleteFileOrDir(filePath) {
  try {
    const fullPath = path.join(__dirname, filePath);
    
    if (!fs.existsSync(fullPath)) {
      return false; // Fichier n'existe pas, pas d'erreur
    }
    
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`✓ Supprimé: ${filePath}/`);
      return true;
    } else {
      fs.unlinkSync(fullPath);
      console.log(`✓ Supprimé: ${filePath}`);
      return true;
    }
  } catch (error) {
    console.error(`✗ Erreur avec ${filePath}:`, error.message);
    errorCount++;
    return false;
  }
}

function cleanOldPDFs(dirPath, maxAgeDays = 30) {
  try {
    const fullPath = path.join(__dirname, dirPath);
    if (!fs.existsSync(fullPath)) return;
    
    const files = fs.readdirSync(fullPath);
    const now = Date.now();
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000; // Convertir en millisecondes
    
    let cleaned = 0;
    files.forEach(file => {
      if (file.endsWith('.pdf')) {
        const filePath = path.join(fullPath, file);
        const stat = fs.statSync(filePath);
        const age = now - stat.mtimeMs;
        
        if (age > maxAge) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      }
    });
    
    if (cleaned > 0) {
      console.log(`✓ Nettoyé ${cleaned} PDF anciens dans ${dirPath}`);
    }
  } catch (error) {
    console.error(`✗ Erreur nettoyage PDF ${dirPath}:`, error.message);
  }
}

// Supprimer les fichiers et dossiers listés
console.log('📁 Suppression des fichiers et dossiers inutiles...\n');
filesToDelete.forEach(file => {
  if (deleteFileOrDir(file)) {
    deletedCount++;
  }
});

// Nettoyer les PDF anciens
console.log('\n📄 Nettoyage des PDF anciens (>30 jours)...\n');
dirsToClean.forEach(dir => {
  cleanOldPDFs(dir);
});

// Résumé
console.log('\n' + '='.repeat(50));
console.log(`✅ Nettoyage terminé!`);
console.log(`   - ${deletedCount} fichiers/dossiers supprimés`);
if (errorCount > 0) {
  console.log(`   - ${errorCount} erreurs rencontrées`);
}
console.log('='.repeat(50));

