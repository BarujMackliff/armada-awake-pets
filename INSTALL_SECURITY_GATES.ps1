$ErrorActionPreference = "Stop"
$repo = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$trustedRoot = Join-Path $env:LOCALAPPDATA "PRBE\AwakePetPublisher"
$scannerSource = Join-Path $repo "scripts\prepublish-check.js"
$publisherSource = Join-Path $repo "SYNC_TO_GITHUB.ps1"
$scannerTarget = Join-Path $trustedRoot "prepublish-check.js"
$publisherTarget = Join-Path $trustedRoot "trusted-publish.ps1"
$sealPath = Join-Path $trustedRoot "seal.json"
$expectedOrigin = "https://github.com/BarujMackliff/armada-awake-pets.git"

$gitRoot = (Resolve-Path -LiteralPath ((git -C $repo rev-parse --show-toplevel).Trim())).Path
if (-not [string]::Equals($gitRoot, $repo, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Security installation blocked: repository root mismatch."
}
if ((git -C $repo remote get-url origin).Trim() -ne $expectedOrigin) {
  throw "Security installation blocked: origin is not the approved avatar repository."
}

New-Item -ItemType Directory -Path $trustedRoot -Force | Out-Null
Copy-Item -LiteralPath $scannerSource -Destination $scannerTarget -Force
Copy-Item -LiteralPath $publisherSource -Destination $publisherTarget -Force

$seal = [ordered]@{
  repository = $repo
  origin = $expectedOrigin
  scannerSha256 = (Get-FileHash -LiteralPath $scannerTarget -Algorithm SHA256).Hash
  publisherSha256 = (Get-FileHash -LiteralPath $publisherTarget -Algorithm SHA256).Hash
  installedAt = (Get-Date).ToUniversalTime().ToString("o")
}
$seal | ConvertTo-Json | Set-Content -LiteralPath $sealPath -Encoding UTF8

git -C $repo config --local core.hooksPath .githooks
git -C $repo remote set-url --push origin $expectedOrigin

& node $scannerTarget --root $repo --history
if ($LASTEXITCODE -ne 0) { throw "Sealed publication gate rejected the repository." }

"Sealed publication gate installed outside the public repository."
