# Script pour supprimer tous les console.log des fichiers TypeScript
$files = Get-ChildItem -Path "src\app" -Recurse -Filter "*.ts" | Where-Object { $_.FullName -notlike "*main.ts" }

$modifiedCount = 0
$totalCount = $files.Count

Write-Host "Traitement de $totalCount fichiers..."

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $originalContent = $content
    
    # Supprimer les lignes contenant console.log, console.warn, console.error, console.debug, console.info
    # Pattern pour détecter une ligne complète avec console.*
    $lines = $content -split "`n"
    $newLines = @()
    
    foreach ($line in $lines) {
        # Vérifier si la ligne contient console.log/warn/error/debug/info
        if ($line -match '^\s*console\.(log|warn|error|debug|info)\s*\(') {
            # C'est une ligne console.log, on la saute
            continue
        }
        # Vérifier aussi les lignes avec console.* qui se terminent par ; ou rien
        if ($line -match 'console\.(log|warn|error|debug|info)\s*\(') {
            # Vérifier si ce n'est pas dans un commentaire
            $lineBeforeConsole = $line.Substring(0, $line.IndexOf('console'))
            if (-not $lineBeforeConsole.Contains('//') -and -not $lineBeforeConsole.Contains('/*')) {
                # Vérifier si ce n'est pas dans une chaîne de caractères
                $singleQuotes = ($lineBeforeConsole.ToCharArray() | Where-Object { $_ -eq "'" }).Count
                $doubleQuotes = ($lineBeforeConsole.ToCharArray() | Where-Object { $_ -eq '"' }).Count
                $backticks = ($lineBeforeConsole.ToCharArray() | Where-Object { $_ -eq '`' }).Count
                
                if ($singleQuotes % 2 -eq 0 -and $doubleQuotes % 2 -eq 0 -and $backticks % 2 -eq 0) {
                    # On n'est pas dans une chaîne, on saute cette ligne
                    continue
                }
            }
        }
        $newLines += $line
    }
    
    $newContent = $newLines -join "`n"
    
    # Nettoyer les lignes vides multiples (max 2 consécutives)
    $newContent = $newContent -replace "(`n){3,}", "`n`n"
    
    if ($newContent -ne $originalContent) {
        Set-Content -Path $file.FullName -Value $newContent -NoNewline
        $modifiedCount++
        Write-Host "✓ $($file.Name)"
    }
}

Write-Host "`n✅ $modifiedCount fichiers modifiés sur $totalCount fichiers traités."

