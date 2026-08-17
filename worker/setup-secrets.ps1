# Sube las 10 API keys de Gemini a Cloudflare como secrets (GEMINI_KEY_1..GEMINI_KEY_10).
# Lee las keys de ../API-key.txt (una por linea, nunca se commitea al repo).
# Requiere: wrangler login previo. Ejecutar desde la carpeta /worker.

$keysFile = Join-Path $PSScriptRoot "..\API-key.txt"
if (-not (Test-Path $keysFile)) {
    Write-Error "No se encontro $keysFile. Crea el archivo con una API key de Gemini por linea (10 en total)."
    exit 1
}

$keys = Get-Content $keysFile | Where-Object { $_.Trim() -ne "" }
if ($keys.Count -lt 10) {
    Write-Warning "Se esperaban 10 keys, se encontraron $($keys.Count). Se subiran las disponibles."
}

for ($i = 0; $i -lt $keys.Count -and $i -lt 10; $i++) {
    $name = "GEMINI_KEY_$($i + 1)"
    Write-Host "Subiendo $name..."
    $keys[$i] | wrangler secret put $name
}

Write-Host "Listo. Verifica con: wrangler secret list"
