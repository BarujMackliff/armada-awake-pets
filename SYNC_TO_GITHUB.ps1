param(
  [string]$Message = "",
  [string]$Repository = ""
)

$ErrorActionPreference = "Stop"
$trustedRoot = Join-Path $env:LOCALAPPDATA "PRBE\AwakePetPublisher"
$scanner = Join-Path $trustedRoot "prepublish-check.js"
$publisher = Join-Path $trustedRoot "trusted-publish.ps1"
$sealPath = Join-Path $trustedRoot "seal.json"
$expectedOrigin = "https://github.com/BarujMackliff/armada-awake-pets.git"

function Read-Seal {
  if (-not (Test-Path -LiteralPath $sealPath)) {
    throw "GitHub sync blocked: install the sealed gate with INSTALL_SECURITY_GATES.ps1."
  }
  return Get-Content -LiteralPath $sealPath -Raw | ConvertFrom-Json
}

function Assert-SealedFile([string]$Path, [string]$ExpectedHash, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "GitHub sync blocked: sealed $Label is missing."
  }
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  if ($actual -ne $ExpectedHash) {
    throw "GitHub sync blocked: sealed $Label checksum changed."
  }
}

$seal = Read-Seal
Assert-SealedFile $scanner $seal.scannerSha256 "scanner"
Assert-SealedFile $publisher $seal.publisherSha256 "publisher"

$runningTrustedCopy = (Resolve-Path -LiteralPath $PSCommandPath).Path -eq (Resolve-Path -LiteralPath $publisher).Path
if (-not $runningTrustedCopy) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $publisher -Message $Message -Repository $PSScriptRoot
  if ($LASTEXITCODE -ne 0) { throw "Trusted publisher rejected the synchronization." }
  exit 0
}

$repo = if ($Repository) {
  (Resolve-Path -LiteralPath $Repository).Path
} else {
  (Resolve-Path -LiteralPath ([string]$seal.repository)).Path
}

if ($repo -ne (Resolve-Path -LiteralPath ([string]$seal.repository)).Path) {
  throw "GitHub sync blocked: repository does not match the sealed project."
}
$gitRoot = (Resolve-Path -LiteralPath ((git -C $repo rev-parse --show-toplevel).Trim())).Path
if (-not [string]::Equals($gitRoot, $repo, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "GitHub sync blocked: repository root mismatch."
}
if ((git -C $repo remote get-url origin).Trim() -ne $expectedOrigin) {
  throw "GitHub sync blocked: origin is not the approved avatar repository."
}
if ((git -C $repo branch --show-current).Trim() -ne "main") {
  throw "GitHub sync blocked: only the main branch may be published."
}

Push-Location $repo
try {
  & npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw "Tests failed; GitHub sync blocked." }

  & node $scanner --root $repo --history
  if ($LASTEXITCODE -ne 0) { throw "Working-tree or history scan failed; GitHub sync blocked." }

  & git add --all
  & node $scanner --root $repo --staged --history
  if ($LASTEXITCODE -ne 0) { throw "Staged publication scan failed; GitHub sync blocked." }

  & git diff --quiet
  if ($LASTEXITCODE -ne 0) {
    throw "Files changed after staging; GitHub sync blocked. Run the publisher again."
  }

  & git diff --cached --quiet
  $hasStagedChanges = $LASTEXITCODE -ne 0
  if ($hasStagedChanges) {
    if (-not $Message) {
      $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
      $Message = "verified: Awake Pet final polish $stamp"
    }
    & git commit -m $Message
    if ($LASTEXITCODE -ne 0) { throw "Git commit failed." }
  } else {
    "No uncommitted files; verifying local main against GitHub."
  }

  & node $scanner --root $repo --history
  if ($LASTEXITCODE -ne 0) { throw "Post-commit history scan failed; GitHub push blocked." }

  & git fetch origin main
  if ($LASTEXITCODE -ne 0) { throw "Could not verify the remote main branch." }
  $localHead = (& git rev-parse HEAD).Trim()
  $remoteHead = (& git rev-parse origin/main).Trim()
  if ($localHead -eq $remoteHead) {
    "GitHub already matches the sealed, verified avatar project at $localHead."
    exit 0
  }
  & git merge-base --is-ancestor origin/main HEAD
  if ($LASTEXITCODE -ne 0) {
    throw "Remote main is not an ancestor of this commit; non-fast-forward publication is forbidden."
  }

  & git push origin HEAD:main
  if ($LASTEXITCODE -ne 0) { throw "GitHub push failed." }
  "Sealed avatar project synchronized to GitHub without force-push."
}
finally {
  Pop-Location
}
