#!/usr/bin/env bash
# macOS / Linux / WSL / Git Bash installer for vibe-planning skill.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SRC="$ROOT/skills/vibe-planning"
NAME="vibe-planning"

die() { echo "error: $*" >&2; exit 1; }

need_node() {
  if ! command -v node >/dev/null 2>&1; then
    die "Node.js >= 18 required. https://nodejs.org/ (or nvm/fnm/volta/brew)"
  fi
  local major
  major="$(node -p "process.versions.node.split('.')[0]")"
  if [ "$major" -lt 18 ]; then
    die "Node.js >= 18 required (found $(node -v))"
  fi
}

install_dir() {
  local dest="$1"
  mkdir -p "$(dirname "$dest")"
  rm -rf "$dest"
  mkdir -p "$dest"
  (cd "$SKILL_SRC" && tar cf - .) | (cd "$dest" && tar xf -)
  echo "installed → $dest"
}

usage() {
  cat <<EOF
Usage: ./install.sh [--global|--project [dir]] [--agent NAME] [--list]

  --global          User skill dirs (default)
  --project [dir]   Project skill dirs (default dir=.)
  --agent NAME      cursor | claude | codex | agents | all (default: all)
  --list            Print targets only

Recommended (any OS):
  npx skills add Heliostest/vibe-planning -g -a cursor -y
EOF
}

AGENT="all"
MODE="global"
PROJECT_DIR="."
LIST=0

while [ $# -gt 0 ]; do
  case "$1" in
    --global) MODE="global"; shift ;;
    --project)
      MODE="project"
      if [ $# -ge 2 ] && [ "${2#-}" = "$2" ]; then PROJECT_DIR="$2"; shift 2; else shift; fi
      ;;
    --agent) AGENT="${2:-}"; [ -n "$AGENT" ] || die "--agent needs a value"; shift 2 ;;
    --list) LIST=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

[ -d "$SKILL_SRC" ] || die "missing $SKILL_SRC"
need_node
HOME_DIR="${HOME:-}"; [ -n "$HOME_DIR" ] || die "HOME not set"

targets=""
append() { targets="${targets}"$'\n'"$1"; }

if [ "$MODE" = "project" ]; then
  PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
  case "$AGENT" in
    cursor) append "$PROJECT_DIR/.cursor/skills/$NAME" ;;
    claude) append "$PROJECT_DIR/.claude/skills/$NAME" ;;
    codex)  append "$PROJECT_DIR/.codex/skills/$NAME" ;;
    agents) append "$PROJECT_DIR/.agents/skills/$NAME" ;;
    all)
      append "$PROJECT_DIR/.cursor/skills/$NAME"
      append "$PROJECT_DIR/.claude/skills/$NAME"
      append "$PROJECT_DIR/.agents/skills/$NAME"
      ;;
    *) die "unknown agent: $AGENT" ;;
  esac
else
  case "$AGENT" in
    cursor) append "$HOME_DIR/.cursor/skills/$NAME" ;;
    claude) append "$HOME_DIR/.claude/skills/$NAME" ;;
    codex)  append "$HOME_DIR/.codex/skills/$NAME" ;;
    agents) append "$HOME_DIR/.agents/skills/$NAME" ;;
    all)
      append "$HOME_DIR/.cursor/skills/$NAME"
      append "$HOME_DIR/.claude/skills/$NAME"
      append "$HOME_DIR/.codex/skills/$NAME"
      append "$HOME_DIR/.agents/skills/$NAME"
      ;;
    *) die "unknown agent: $AGENT" ;;
  esac
fi

# trim leading newline
targets="$(printf '%s\n' "$targets" | sed '/^$/d')"

if [ "$LIST" -eq 1 ]; then
  printf '%s\n' "$targets"
  exit 0
fi

echo "Node $(node -v)"
FIRST=""
while IFS= read -r t; do
  [ -n "$t" ] || continue
  install_dir "$t"
  [ -n "$FIRST" ] || FIRST="$t"
done <<EOF
$targets
EOF

echo
echo "Done. Start board:"
echo "  node \"$FIRST/scripts/serve.mjs\" \"\$(pwd)\" --port 7465 --open"
