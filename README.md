# ProvChart Repo Stats

GitHub Action that reads **live repo health** from the GitHub API and writes **ProvChart SVG** charts for your README.

**v1.3 defaults**

| Chart | File | Type | Values |
|--------|------|------|--------|
| Overview | `docs/charts/repo-overview.svg` | **area** | Real stars, forks, watchers, open issues |
| Languages | `docs/charts/languages.svg` | **hbar** | Language share % |

No hand-written chart JSON for basic stats — only a workflow and an API key.

---

## Quick start

### 1. Secret

Repo **Settings → Secrets and variables → Actions**

| Name | Value |
|------|--------|
| `PROVCHART_API_KEY` | Key from [chart.devtem.org/dashboard](https://chart.devtem.org/dashboard) |

### 2. Workflow

`.github/workflows/repo-stats.yml`:

```yaml
name: Repo stats charts

on:
  schedule:
    - cron: "0 8 * * 0"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  charts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check secret
        env:
          KEY: ${{ secrets.PROVCHART_API_KEY }}
        run: |
          if [ -z "$KEY" ]; then
            echo "::error::PROVCHART_API_KEY is empty"
            exit 1
          fi
          echo "Secret OK (length ${#KEY})"

      - uses: fscss-ttr/provchart-repo-stats@v1.3
        with:
          api-key: ${{ secrets.PROVCHART_API_KEY }}
          # defaults: overview=area (real counts), languages=hbar
        env:
          PROVCHART_API_KEY: ${{ secrets.PROVCHART_API_KEY }}

      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "chore: update repo stats charts"
          file_pattern: "docs/charts/*.svg"
```

### 3. README embeds

```markdown
## Repo health

![Overview](./docs/charts/repo-overview.svg)

![Languages](./docs/charts/languages.svg)
```

Run **Actions → Repo stats charts → Run workflow**, or wait for the weekly schedule.

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | yes | — | ProvChart API key |
| `token` | no | `github.token` | GitHub token for metadata |
| `repo` | no | current repo | `owner/name` override |
| `output-dir` | no | `docs/charts` | Where SVGs are written |
| `theme` | no | `midnight` | `midnight` · `dark` · `light` |
| `charts` | no | `overview,languages` | Which charts to generate |
| `overview-type` | no | **`area`** | e.g. `area`, `hbar`, `bar`, `line` |
| `languages-type` | no | **`hbar`** | e.g. `hbar`, `bar` |
| `language-limit` | no | `8` | Max languages |
| `normalize-overview` | no | **`false`** | `true` = scale overview to 0–100 (labels are relative, not real counts) |
| `width` | no | `640` | SVG width |
| `height-overview` | no | `280` | Overview height |
| `height-languages` | no | `300` | Languages height |
| `api-base` | no | `https://provchart-api.devtem.org` | API base |

Also set:

```yaml
env:
  PROVCHART_API_KEY: ${{ secrets.PROVCHART_API_KEY }}
```

so the key is available if `INPUT_API_KEY` mapping fails in some runners.

---

## Outputs

| Output | Description |
|--------|-------------|
| `files` | Comma-separated paths of written SVGs |

---

## Overview scaling

| `normalize-overview` | Behavior |
|----------------------|----------|
| `false` (default) | Real GitHub counts (e.g. stars = 7) |
| `true` | Largest metric maps to 100; labels show relative values |

Languages always use **share %** (0–100).

---

## Example: hbar overview

```yaml
- uses: fscss-ttr/provchart-repo-stats@v1.3
  with:
    api-key: ${{ secrets.PROVCHART_API_KEY }}
    overview-type: hbar
    languages-type: hbar
  env:
    PROVCHART_API_KEY: ${{ secrets.PROVCHART_API_KEY }}
```

---

## Related

| Project | Link |
|---------|------|
| ProvChart | [chart.devtem.org](https://chart.devtem.org) |
| Config → SVG Action | [provchart-readme-action](https://github.com/fscss-ttr/provchart-readme-action) |
| Sample charts repo | [Figsh/provchart-charts](https://github.com/Figsh/provchart-charts) |
| Docs | [chart.devtem.org/docs](https://chart.devtem.org/docs) |

---

## License

MIT
