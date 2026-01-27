const fs = require('fs');
const path = require('path');

// Fonction récursive pour trouver tous les fichiers .ts
function findTsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findTsFiles(filePath, fileList);
    } else if (file.endsWith('.ts') && !file.includes('main.ts')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Fonction pour supprimer les console.log d'un fichier
function removeConsoleLogs(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Diviser en lignes
    const lines = content.split('\n');
    const newLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Vérifier si c'est une ligne console.log/warn/error/debug/info
      if (trimmedLine.match(/^console\.(log|warn|error|debug|info)\s*\(/)) {
        // C'est une ligne console.* complète, on la saute
        continue;
      }
      
      // Vérifier si la ligne contient console.* mais pas au début
      if (line.includes('console.') && (line.includes('console.log') || line.includes('console.warn') || line.includes('console.error') || line.includes('console.debug') || line.includes('console.info'))) {
        // Vérifier si ce n'est pas dans un commentaire
        const commentIndex = Math.min(
          line.indexOf('//') !== -1 ? line.indexOf('//') : Infinity,
          line.indexOf('/*') !== -1 ? line.indexOf('/*') : Infinity
        );
        const consoleIndex = line.indexOf('console.');
        
        if (consoleIndex < commentIndex) {
          // Le console.* est avant le commentaire, vérifier si on est dans une chaîne
          const beforeConsole = line.substring(0, consoleIndex);
          const singleQuotes = (beforeConsole.match(/'/g) || []).length;
          const doubleQuotes = (beforeConsole.match(/"/g) || []).length;
          const backticks = (beforeConsole.match(/`/g) || []).length;
          
          // Si le nombre de guillemets est pair, on n'est pas dans une chaîne
          if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0 && backticks % 2 === 0) {
            // C'est probablement une ligne console.*, on la saute
            continue;
          }
        }
      }
      
      newLines.push(line);
    }
    
    content = newLines.join('\n');
    
    // Nettoyer les lignes vides multiples (max 2 consécutives)
    content = content.replace(/\n{3,}/g, '\n\n');
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Erreur lors du traitement de ${filePath}:`, error.message);
    return false;
  }
}

// Trouver tous les fichiers TypeScript dans src/app
const appDir = path.join(__dirname, '..', 'src', 'app');
const files = findTsFiles(appDir);

console.log(`Traitement de ${files.length} fichiers...`);

let modifiedCount = 0;
files.forEach(file => {
  if (removeConsoleLogs(file)) {
    modifiedCount++;
    const relativePath = path.relative(path.join(__dirname, '..'), file);
    console.log(`✓ ${relativePath}`);
  }
});

console.log(`\n✅ ${modifiedCount} fichiers modifiés sur ${files.length} fichiers traités.`);
