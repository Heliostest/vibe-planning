# vibe-planning reference

## YAML schema

```yaml
version: 1
project: naval-ui
nodes:
  - id: aa-fx
    title: AA 假弹道 FX
    status: done
    kind: milestone   # optional: milestone|spec|plan|task|backlog
    docs:
      - docs/superpowers/specs/2026-07-30-aa-projectile-fx-design.md
    parent: air-dimension
    dependsOn: [b2]
    notes: optional
ghosts: []
```

### Fields

| field | required | notes |
|---|---|---|
| `version` | yes | currently `1` |
| `project` | yes | short slug |
| `nodes` | yes | array |
| `nodes[].id` | yes | unique, kebab-case |
| `nodes[].title` | yes | display |
| `nodes[].status` | yes | see palette |
| `nodes[].kind` | no | milestone/spec/plan/task/backlog |
| `nodes[].docs` | no | paths relative to project root |
| `nodes[].parent` | no | tree parent id |
| `nodes[].dependsOn` | no | array of node ids → graph edges |
| `nodes[].notes` | no | free text |
| `ghosts` | yes | same shape as nodes; ephemeral |

### Graph edges

- Tree level primarily from `parent` (solid edges, hierarchical UD)
- `dependsOn` drawn lighter/dashed; secondary to tree structure
- Prefer `dependsOn` for hard deps; `parent` for grouping

## Status palette

| status | meaning | visual |
|---|---|---|
| idea | rough idea | blue outline `#3b82f6`, white fill |
| proposed | written proposal/spec draft | solid blue `#2563eb` |
| planned | has implementation plan | purple `#7c3aed` |
| doing | in progress | amber `#d97706` |
| done | shipped | green `#16a34a` |
| deferred | explicitly postponed | dashed amber/brown `#b45309` |
| cancelled | won't do | muted gray `#6b7280` strikethrough |

CSS tokens (board):

```css
--st-idea-border: #3b82f6;
--st-proposed: #2563eb;
--st-planned: #7c3aed;
--st-doing: #d97706;
--st-done: #16a34a;
--st-deferred: #b45309;
--st-cancelled: #6b7280;
```

## Ghost lifecycle

1. `suggest-from` creates 2–3 entries in `ghosts` with `id: ghost-<slug>`, `status: idea`
2. Board shows ghosts dashed + glow; edges to source
3. User confirms subset → promote to `nodes` (new stable ids), `ghosts: []`
4. Reject / dismiss → `ghosts: []`
5. Never leave stale ghosts across sessions without asking; next suggest overwrites `ghosts`

## Align heuristics

Scan linked markdown (and only those files):

| signal (case-insensitive / 中英) | → status |
|---|---|
| `- [x]` majority of task checkboxes, or 「已交付」「完成」「Done」「闸门全绿」「shipped」 | done |
| 「进行中」「in progress」「WIP」 | doing |
| filename/path contains `/plans/` and tasks unchecked | planned |
| filename/path contains `/specs/` or 「设计」「Design」draft | proposed |
| 「延后」「以后再说」「postponed」「deferred」「暂不做」 | deferred |
| 「不做」「取消」「won't」「cancelled」「out of scope」as decision | cancelled |
| vague bullets only | idea |

Priority when multiple apply:

`cancelled` / `deferred` (explicit only) > `done` > `doing` > `planned` > `proposed` > `idea`

Docs contradict YAML → update YAML to match docs. Never invent doc paths.

## HTTP server

`scripts/serve.mjs <projectRoot> [--port 7465] [--open]`

| route | method | behavior |
|---|---|---|
| `/` | GET | board HTML (bootstrap + live fetch) |
| `/api/tree` | GET | plan-tree JSON |
| `/api/health` | GET | `{ ok, projectRoot }` |
| `/api/events` | GET | SSE; `reload` when yaml changes |
| `/api/sync` | POST | run sync; `{ ok, updated, promptPath, summary }` |
| `/api/sync-prompt` | GET | last sync-prompt.md text |

Shared YAML: `scripts/lib/yaml-mini.mjs`  
Sync logic: `scripts/lib/sync-repo.mjs` → `runSync(projectRoot)`

## Sync behavior

1. Walk `docs/**/*.md` (skip `node_modules`, `.git`, `dist`, `board.html`)
2. `git log --oneline -n 80` (+ optional name-only)
3. Re-align existing nodes with `docs[]`
4. Clear orphans → project root + `dependsOn` chain by doc date (impl order); no inbox; ambiguous orphans listed only in prompt
5. Always write `docs/vibe-planning/sync-prompt.md` with Chinese paste prompt
6. Save YAML; SSE reloads board

## Board layout

- vis-network hierarchical, direction `UD`, `physics: false`
- `sortMethod: 'directed'`; larger `nodeSpacing` / `levelSeparation`
- Header: 「同步仓库」; aside: 「从此处建议」

## Static render (optional)

`render-board.mjs`:

1. Reads `plan-tree.yaml` via yaml-mini
2. Loads `assets/board.template.html`
3. Replaces `/*__PLAN_TREE__*/null` with JSON
4. Writes `board.html` next to the yaml

Board expects:

```js
window.PLAN_TREE = { version, project, nodes, ghosts }
```

On HTTP, board still bootstraps from bake-in, then `GET /api/tree` + SSE/poll.

## Clipboard payload

```
vibe-planning:suggest-from
project: <project>
nodeId: <id>
title: <title>
docs: <comma-separated or none>
```
