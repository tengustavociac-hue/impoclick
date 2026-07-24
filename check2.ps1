$path = 'C:\Users\gusta\Desktop\TESTE IA\index.html'
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$lines = $content -split "`n"

# Find lines with uppercase accented chars that likely should be lowercase
# Á (C1), É (C9), Ê (CA), Ó (D3), Ú (DA), Â (C2), Ã (C3), Ç (C7), Í (CD)
$suspects = @([char]0x00C1, [char]0x00C9, [char]0x00CA, [char]0x00D3, [char]0x00DA, [char]0x00C2, [char]0x00CD)

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $hasSuspect = $false
    foreach ($s in $suspects) {
        if ($line.Contains($s)) { $hasSuspect = $true; break }
    }
    if ($hasSuspect) {
        $lineNum = $i + 1
        Write-Host "Line $lineNum : $($line.Trim())"
    }
}
