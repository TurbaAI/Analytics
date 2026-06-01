# Deployment

turbalance Analytics is a static prototype. It can be hosted from any static file server that serves these files from one directory:

- `index.html`
- `styles.css`
- `app.js`
- `analytics-core.js`
- `nccl-trace-parser.js`
- `nccl-trace-fixtures.js`
- `build/`
- `fixtures/`
- `docs/`
- `schemas/`
- `grafana/`

## GitHub Pages

The repository includes `.github/workflows/pages.yml`. On pushes to `main`, the workflow:

1. runs `node tests/run-all.js`
2. assembles the static site into `site/`
3. uploads the site as a Pages artifact
4. deploys it with GitHub Pages

Enable Pages in repository settings with GitHub Actions as the source.

If the Pages workflow fails at `Configure Pages`, the repository setting is not enabled yet. Enable Pages from GitHub repository settings, then rerun the latest `Deploy GitHub Pages` workflow.

## Local Static Server

For a local server:

```sh
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000/`.

Opening `index.html` directly also works for the dashboard. Fetching relative fixture URLs may be more reliable through a local static server because browsers apply different `file://` fetch restrictions.
