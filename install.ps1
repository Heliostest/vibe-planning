# Windows PowerShell installer for vibe-planning skill.
# Requires: Node.js >= 18, PowerShell 5+
[CmdletBinding()]
param(
  [ValidateSet('global', 'project')]
  [string]$Scope = 'global',
  [string]$ProjectDir = '.',
  [ValidateSet('cursor', 'claude', 'codex', 'agents', 'all')]
  [string]$Agent = 'all',
  [switch]$List
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$SkillSrc = Join-Path $Root 'skills\vibe-planning'
$Name = 'vibe-planning'

if (-not (Test-Path $SkillSrc)) { throw "missing $SkillSrc" }

function Test-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw "Node.js >= 18 required. Install from https://nodejs.org/ or winget install OpenJS.NodeJS.LTS"
  }
  $major = [int]((node -p "process.versions.node.split('.')[0]").Trim())
  if ($major -lt 18) { throw "Node.js >= 18 required (found $(node -v))" }
}

function Get-Targets {
  $list = New-Object System.Collections.Generic.List[string]
  if ($Scope -eq 'project') {
    $proj = (Resolve-Path $ProjectDir).Path
    switch ($Agent) {
      'cursor' { [void]$list.Add((Join-Path $proj ".cursor\skills\$Name")) }
      'claude' { [void]$list.Add((Join-Path $proj ".claude\skills\$Name")) }
      'codex'  { [void]$list.Add((Join-Path $proj ".codex\skills\$Name")) }
      'agents' { [void]$list.Add((Join-Path $proj ".agents\skills\$Name")) }
      'all' {
        [void]$list.Add((Join-Path $proj ".cursor\skills\$Name"))
        [void]$list.Add((Join-Path $proj ".claude\skills\$Name"))
        [void]$list.Add((Join-Path $proj ".agents\skills\$Name"))
      }
    }
  } else {
    $home = $env:USERPROFILE
    if (-not $home) { $home = $env:HOME }
    if (-not $home) { throw 'USERPROFILE/HOME not set' }
    switch ($Agent) {
      'cursor' { [void]$list.Add((Join-Path $home ".cursor\skills\$Name")) }
      'claude' { [void]$list.Add((Join-Path $home ".claude\skills\$Name")) }
      'codex'  { [void]$list.Add((Join-Path $home ".codex\skills\$Name")) }
      'agents' { [void]$list.Add((Join-Path $home ".agents\skills\$Name")) }
      'all' {
        [void]$list.Add((Join-Path $home ".cursor\skills\$Name"))
        [void]$list.Add((Join-Path $home ".claude\skills\$Name"))
        [void]$list.Add((Join-Path $home ".codex\skills\$Name"))
        [void]$list.Add((Join-Path $home ".agents\skills\$Name"))
      }
    }
  }
  return $list
}

Test-Node
$targets = Get-Targets

if ($List) {
  $targets | ForEach-Object { $_ }
  exit 0
}

Write-Host "Node $(node -v)"
$first = $null
foreach ($dest in $targets) {
  $parent = Split-Path -Parent $dest
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  Copy-Item -Path (Join-Path $SkillSrc '*') -Destination $dest -Recurse -Force
  Write-Host "installed → $dest"
  if (-not $first) { $first = $dest }
}

Write-Host ""
Write-Host "Done. Start board:"
Write-Host "  node `"$first\scripts\serve.mjs`" `"$((Get-Location).Path)`" --port 7465 --open"
Write-Host ""
Write-Host "Or (recommended):"
Write-Host "  npx skills add Heliostest/vibe-planning -g -a cursor -y"
