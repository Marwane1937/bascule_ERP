const fs = require('fs');
const path = require('path');

// Patterns à garder (messages de connexion réussie)
const keepPatterns = [
  /console\.log.*[Cc]onnexion.*[Rr]éussie/i,
  /console\.log.*[Cc]onnection.*[Ss]uccess/i,
  /console\.log.*[Ss]uccessfully.*[Cc]onnect/i,
  /console\.log.*SQL Server.*[Rr]éussie/i,
  /console\.log.*base.*[Rr]éussie/i
];

function shouldKeepLine(line) {
  return keepPatterns.some(pattern => pattern.test(line));
}

function cleanFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const cleanedLines = [];
    let modified = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Vérifier si c'est un console.log
      if (line.trim().match(/^\s*console\.log\(/)) {
        // Garder seulement les messages de connexion réussie
        if (shouldKeepLine(line)) {
          cleanedLines.push(line);
        } else {
          modified = true;
          // Ne pas ajouter la ligne (la supprimer)
        }
      } else {
        cleanedLines.push(line);
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, cleanedLines.join('\n'), 'utf8');
      console.log(`✅ Nettoyé: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Erreur avec ${filePath}:`, error.message);
    return false;
  }
}

function walkDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !filePath.includes('node_modules') && !filePath.includes('scripts')) {
      walkDir(filePath, fileList);
    } else if (file.endsWith('.js') || file.endsWith('.ts')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Nettoyer les fichiers backend
const backendDir = path.join(__dirname, 'backend', 'src');
if (fs.existsSync(backendDir)) {
  const files = walkDir(backendDir);
  let cleaned = 0;
  files.forEach(file => {
    if (cleanFile(file)) cleaned++;
  });
  console.log(`\n✅ ${cleaned} fichiers backend nettoyés sur ${files.length}`);
}

// Nettoyer les fichiers frontend
const frontendDir = path.join(__dirname, 'frontend', 'src');
if (fs.existsSync(frontendDir)) {
  const files = walkDir(frontendDir);
  let cleaned = 0;
  files.forEach(file => {
    if (cleanFile(file)) cleaned++;
  });
  console.log(`✅ ${cleaned} fichiers frontend nettoyés sur ${files.length}`);
}

console.log('\n✅ Nettoyage terminé!');

