$ErrorActionPreference = 'Stop'

$secureKey = Read-Host 'Enter your Gemini API key (input hidden)' -AsSecureString
if ($secureKey.Length -eq 0) {
    throw 'No API key was entered. Backend configuration was not changed.'
}

$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer).Trim()
    if (-not $apiKey) {
        throw 'No API key was entered. Backend configuration was not changed.'
    }

    $envPath = Join-Path $PSScriptRoot '..\.env'
    $lines = @()
    if (Test-Path -LiteralPath $envPath) {
        $lines = @(Get-Content -LiteralPath $envPath)
    }

    $keyLineFound = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match '^\s*GEMINI_API_KEY\s*=') {
            $keyLineFound = $true
            $lines[$index] = "GEMINI_API_KEY=$apiKey"
        }
    }
    if (-not $keyLineFound) {
        $lines += "GEMINI_API_KEY=$apiKey"
    }

    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText(
        [System.IO.Path]::GetFullPath($envPath),
        [string]::Join([Environment]::NewLine, $lines) + [Environment]::NewLine,
        $utf8WithoutBom
    )
    Write-Host 'Gemini API key saved to backend\.env. The key was not displayed.'
    Write-Host 'Restart the backend to load the updated configuration.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    Remove-Variable apiKey -ErrorAction SilentlyContinue
}
