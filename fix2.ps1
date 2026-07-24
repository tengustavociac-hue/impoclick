$path = 'C:\Users\gusta\Desktop\TESTE IA\index.html'
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# U+00C1 = Á  (uppercase A acute)
# U+00C9 = É  (uppercase E acute)
# U+00CA = Ê  (uppercase E circumflex)
# U+00CD = Í  (uppercase I acute)
# U+00D3 = Ó  (uppercase O acute)
# U+00DA = Ú  (uppercase U acute)
# U+00C2 = Â  (uppercase A circumflex)

$Á = [char]0x00C1
$É = [char]0x00C9
$Ê = [char]0x00CA
$Í = [char]0x00CD
$Ó = [char]0x00D3
$Ú = [char]0x00DA
$Â = [char]0x00C2
$á = [char]0x00E1
$é = [char]0x00E9
$ê = [char]0x00EA
$í = [char]0x00ED
$ó = [char]0x00F3
$ú = [char]0x00FA
$â = [char]0x00E2

# Fix words where uppercase accented appears incorrectly in lowercase context
# Pattern: fix "wordÁword" -> "wordáword" (uppercase accented in middle of word = wrong)

# These are specific wrong words found in the scan:
$content = $content.Replace('OlÁ!', 'Olá!')
$content = $content.Replace('PerÍodo', 'Período')
$content = $content.Replace('grÁtis', 'grátis')
$content = $content.Replace('CÁlculo', 'Cálculo')
$content = $content.Replace('CÂmbio', 'Câmbio')
$content = $content.Replace('cÁlculo', 'cálculo')
$content = $content.Replace('câmbio', 'câmbio')  # already ok
$content = $content.Replace('BancÁrio', 'Bancário')
$content = $content.Replace('CartÃo CrÉdito', 'Cartão Crédito')  # if still remaining
$content = $content.Replace('CrÉdito', 'Crédito')
$content = $content.Replace('CartÁo', 'Cartão')
$content = $content.Replace('AutomÁtico', 'Automático')
$content = $content.Replace('AlÍquota', 'Alíquota')
$content = $content.Replace('alÍquota', 'alíquota')
$content = $content.Replace('padrÃo', 'padrão')   # if still remaining
$content = $content.Replace('CritÉrios', 'Critérios')
$content = $content.Replace('critÉrios', 'critérios')
$content = $content.Replace('IgualitÁrio', 'Igualitário')
$content = $content.Replace('CatÁlogo', 'Catálogo')
$content = $content.Replace('catÁlogo', 'catálogo')
$content = $content.Replace('PreÇo', 'Preço')
$content = $content.Replace('preÇo', 'preço')
$content = $content.Replace('UnitÁrio', 'Unitário')
$content = $content.Replace('unitÁrio', 'unitário')
$content = $content.Replace('MÁscara', 'Máscara')
$content = $content.Replace('poliÉster', 'poliéster')
$content = $content.Replace('mÉdio', 'médio')
$content = $content.Replace('GrÁfico', 'Gráfico')
$content = $content.Replace('grÁfico', 'gráfico')
$content = $content.Replace('ComposiÇÃo', 'Composição')
$content = $content.Replace('DiluiÇÃo', 'Diluição')
$content = $content.Replace('desembaraÇo', 'desembaraço')
$content = $content.Replace('AnÁlise', 'Análise')
$content = $content.Replace('ViÁvel', 'Viável')
$content = $content.Replace('lÍquido', 'líquido')
$content = $content.Replace('LÍquido', 'Líquido')
$content = $content.Replace('UnitÁria', 'Unitária')
$content = $content.Replace('unitÁria', 'unitária')
$content = $content.Replace('saudÁvel', 'saudável')
$content = $content.Replace('ÉsaudÁvel', 'é saudável')
$content = $content.Replace('importaÇÃo', 'importação')   # if remaining
$content = $content.Replace('aÇÃo', 'ação')              # if remaining
$content = $content.Replace('UsuÁrio', 'Usuário')
$content = $content.Replace('usuÁrio', 'usuário')
$content = $content.Replace('histÓrico', 'histórico')
$content = $content.Replace('HistÓrico', 'Histórico')
$content = $content.Replace('informaÇÕes', 'informações')
$content = $content.Replace('informaÇes', 'informações')
$content = $content.Replace('prejuÍzo', 'prejuízo')
$content = $content.Replace('ÚNico', 'Único')
$content = $content.Replace('Único', 'Único')   # already ok if this
$content = $content.Replace('Único', 'Único')

# Fix remaining uppercase-in-lowercase by looking at the specific chars found
# Using char-level replacements for contexts where we know the fix:

# Period/Periodo
$content = $content.Replace('Per' + $Í + 'odo', 'Período')

# Olá
$content = $content.Replace('Ol' + $Á + '!', 'Olá!')

# grátis
$content = $content.Replace('gr' + $Á + 'tis', 'grátis')

# Câmbio / câmbio
$content = $content.Replace('C' + $Â + 'mbio', 'Câmbio')
$content = $content.Replace('c' + $Â + 'mbio', 'câmbio')

# Cálculo / cálculo
$content = $content.Replace('C' + $Á + 'lculo', 'Cálculo')
$content = $content.Replace('c' + $Á + 'lculo', 'cálculo')

# Bancário
$content = $content.Replace('Banc' + $Á + 'rio', 'Bancário')

# Crédito
$content = $content.Replace('Cr' + $É + 'dito', 'Crédito')

# Automático / automático
$content = $content.Replace('Autom' + $Á + 'tico', 'Automático')
$content = $content.Replace('autom' + $Á + 'tico', 'automático')

# Alíquota / alíquota
$content = $content.Replace('Al' + $Í + 'quota', 'Alíquota')
$content = $content.Replace('al' + $Í + 'quota', 'alíquota')

# Critérios / critérios
$content = $content.Replace('Crit' + $É + 'rios', 'Critérios')
$content = $content.Replace('crit' + $É + 'rios', 'critérios')

# Igualitário
$content = $content.Replace('Igualiit' + $Á + 'rio', 'Igualitário')
$content = $content.Replace('Igualit' + $Á + 'rio', 'Igualitário')

# Catálogo / catálogo
$content = $content.Replace('Cat' + $Á + 'logo', 'Catálogo')
$content = $content.Replace('cat' + $Á + 'logo', 'catálogo')

# Preço / preço
$content = $content.Replace('Pre' + ([char]0x00C7) + 'o', 'Preço')
$content = $content.Replace('pre' + ([char]0x00C7) + 'o', 'preço')

# Unitário / unitário / Unitária / unitária
$content = $content.Replace('Unit' + $Á + 'rio', 'Unitário')
$content = $content.Replace('unit' + $Á + 'rio', 'unitário')
$content = $content.Replace('Unit' + $Á + 'ria', 'Unitária')
$content = $content.Replace('unit' + $Á + 'ria', 'unitária')

# Máscara
$content = $content.Replace('M' + $Á + 'scara', 'Máscara')

# poliéster
$content = $content.Replace('poli' + $É + 'ster', 'poliéster')

# médio
$content = $content.Replace('m' + $É + 'dio', 'médio')

# Gráfico / gráfico
$content = $content.Replace('Gr' + $Á + 'fico', 'Gráfico')
$content = $content.Replace('gr' + $Á + 'fico', 'gráfico')

# desembaraço
$content = $content.Replace('desembara' + ([char]0x00C7) + 'o', 'desembaraço')

# Análise
$content = $content.Replace('An' + $Á + 'lise', 'Análise')

# Viável / viável
$content = $content.Replace('Vi' + $Á + 'vel', 'Viável')
$content = $content.Replace('vi' + $Á + 'vel', 'viável')

# Líquido / líquido
$content = $content.Replace('L' + $Í + 'quido', 'Líquido')
$content = $content.Replace('l' + $Í + 'quido', 'líquido')

# saudável
$content = $content.Replace('saud' + $Á + 'vel', 'saudável')

# Usuário / usuário
$content = $content.Replace('Usu' + $Á + 'rio', 'Usuário')
$content = $content.Replace('usu' + $Á + 'rio', 'usuário')

# histórico / Histórico
$content = $content.Replace('hist' + $Ó + 'rico', 'histórico')
$content = $content.Replace('Hist' + $Ó + 'rico', 'Histórico')

# informações
$content = $content.Replace('informa' + ([char]0x00C7) + ([char]0x00C3) + 'es', 'informações')
$content = $content.Replace('informa' + ([char]0x00C7) + 'es', 'informações')

# prejuízo
$content = $content.Replace('preju' + $Í + 'zo', 'prejuízo')

# Único / único
$content = $content.Replace($Ú + 'nico', 'Único')
$content = $content.Replace($ú + 'nico', 'único')

# Padrão / padrão  
$content = $content.Replace('Padr' + ([char]0x00C3) + 'o', 'Padrão')
$content = $content.Replace('padr' + ([char]0x00C3) + 'o', 'padrão')

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
Write-Host "Done! File saved."

# Verify key lines
$lines = $content -split "`n"
Write-Host "Line 218: $($lines[217].Trim())"
Write-Host "Line 265: $($lines[264].Trim())"
Write-Host "Line 284: $($lines[283].Trim())"
Write-Host "Line 466: $($lines[465].Trim())"
Write-Host "Line 556: $($lines[555].Trim())"
