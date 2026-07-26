param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
  if (-not (Test-Path -LiteralPath ".git")) {
    throw "This folder is not initialized as a Git repository."
  }
  if (-not (git remote get-url origin 2>$null)) {
    throw "Git remote 'origin' is not configured."
  }

  & npm.cmd test
  if ($LASTEXITCODE -ne 0) { throw "Tests failed; GitHub sync blocked." }
  & npm.cmd run prepublish:check
  if ($LASTEXITCODE -ne 0) { throw "Publication safety check failed; GitHub sync blocked." }

  & git add --all
  & git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    "GitHub already matches the verified Armada copy."
    exit 0
  }

  if (-not $Message) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $Message = "auto: sync CRIXUS Awake Pet $stamp"
  }
  & git commit -m $Message
  if ($LASTEXITCODE -ne 0) { throw "Git commit failed." }
  $branch = (& git branch --show-current).Trim()
  & git push --set-upstream origin $branch
  if ($LASTEXITCODE -ne 0) { throw "GitHub push failed." }
  "Verified Armada copy synchronized to GitHub."
}
finally {
  Pop-Location
}
