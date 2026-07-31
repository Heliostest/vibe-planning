# vibe-planning

**v1.1.20** · [![skills.sh](https://skills.sh/b/Heliostest/vibe-planning)](https://skills.sh/Heliostest/vibe-planning)

Doc-backed dependency graph for product planning. Specs/plans are the source of truth; `plan-tree.yaml` is an index; a live HTML board shows deps, syncs from git/docs, and persists drag layout.

Works with **Cursor**, **Claude Code**, **Codex**, and other agents that support [Agent Skills](https://skills.sh).

## Requirements

| Tool | Version | Notes |
|------|---------|--------|
| **Node.js** | �?18 | Board server + CLI (`serve` / `render`). Zero npm deps at runtime. |
| **git** | optional | Used by repo sync heuristics |

Install Node:

- **Windows:** `winget install OpenJS.NodeJS.LTS` or https://nodejs.org/
- **macOS:** `brew install node` or https://nodejs.org/
- **Linux:** distro packages / nvm / fnm / volta

## Install the skill

### Recommended �?skills.sh CLI

```bash
npx skills@latest add Heliostest/vibe-planning
```

Global + Cursor, non-interactive:

```bash
npx skills@latest add Heliostest/vibe-planning -g -a cursor -y
```

List without installing:

```bash
npx skills@latest add Heliostest/vibe-planning --list
```

### Bundled installers (copy into agent skill dirs)

Clone once, then:

**macOS / Linux / WSL / Git Bash**

```bash
git clone https://github.com/Heliostest/vibe-planning.git
cd vibe-planning
chmod +x install.sh
./install.sh --global --agent cursor
```

**Windows PowerShell**

```powershell
git clone https://github.com/Heliostest/vibe-planning.git
cd vibe-planning
.\install.ps1 -Scope global -Agent cursor
```

Project-local:

```bash
./install.sh --project . --agent all
# or
.\install.ps1 -Scope project -Agent all
```

### Manual

Copy `skills/vibe-planning/` into one of:

- `~/.cursor/skills/vibe-planning`
- `~/.claude/skills/vibe-planning`
- `~/.codex/skills/vibe-planning`
- `~/.agents/skills/vibe-planning`
- or the project equivalents under `.cursor/skills/`, `.claude/skills/`, �?

## Run the board

After install, find the skill directory (agent path) and:

```bash
node "<skill>/scripts/serve.mjs" "<projectRoot>" --port 7465 --open
```

Or from this repo / npm:

```bash
npx --yes github:Heliostest/vibe-planning serve "<projectRoot>" --open
# after clone:
node bin/vibe-planning.mjs serve "<projectRoot>" --open
```

Open `http://localhost:7465/`.

First use creates/uses `<project>/docs/vibe-planning/plan-tree.yaml` (and `layout.json` for drag positions).

## Repo layout

```
vibe-planning/
├── README.md
├── LICENSE
├── package.json          # optional CLI: vibe-planning serve|render
├── bin/vibe-planning.mjs
├── install.sh            # Unix installer
├── install.ps1           # Windows installer
└── skills/
    └── vibe-planning/    # Agent Skills package (discovered by npx skills)
        ├── SKILL.md
        ├── reference.md
        ├── assets/board.template.html
        └── scripts/      # serve, render, sync, layout (Node, no deps)
```

## What it does

- Index specs/plans in `plan-tree.yaml`
- Live dependency board (HTTP + SSE)
- Sync from docs/git; AI sync prompt for LLM-assisted tree edits
- Ghost suggestions �?promote to real nodes
- Persist node drag layout to `layout.json`

See [`skills/vibe-planning/SKILL.md`](./skills/vibe-planning/SKILL.md) and [`reference.md`](./skills/vibe-planning/reference.md).

## License

MIT
