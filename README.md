# RingCentral App Connect for Google Chrome and Microsoft Edge

[![Build Status](https://github.com/ringcentral/rc-unified-crm-extension/workflows/CI%20Pipeline/badge.svg?branch=main)](https://github.com/ringcentral/rc-unified-crm-extension/actions) [![Coverage](https://codecov.io/gh/ringcentral/rc-unified-crm-extension/branch/main/graph/badge.svg)](https://codecov.io/gh/ringcentral/rc-unified-crm-extension?branch=main) [![Latest release](https://img.shields.io/github/v/release/ringcentral/rc-unified-crm-extension)](https://github.com/ringcentral/rc-unified-crm-extension/releases)

## Looking for user documentation?

Access our end user [documentation](https://ringcentral.github.io/rc-unified-crm-extension/) through the project's Github pages.

## Working on the documentation

The documentation site is built with [MkDocs](https://www.mkdocs.org/) using the Material theme. The source lives in `docs/`, and the site is configured by `mkdocs.yml` in the repository root.

### Prerequisites

* Python 3.9 or later, with `pip`

### Installing MkDocs

Create and activate a virtual environment, then install MkDocs and the plugins this site depends on:

```bash
python3 -m venv venv
source venv/bin/activate        # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

The `requirements.txt` file pins everything the site needs, including `mkdocs-material`, the RingCentral theme extensions (`mkdocs-material-ringcentral`), and the OpenAPI, exclude, and print-site plugins. Installing MkDocs by itself is not enough — the build will fail on missing plugins.

### Previewing the site locally

With the virtual environment active, start the development server from the repository root:

```bash
mkdocs serve
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser. The server watches `docs/` and `mkdocs.yml` and reloads the page whenever you save a change.

To preview on a different port, or to make the preview reachable from another device on your network:

```bash
mkdocs serve -a 0.0.0.0:8080
```

### Building the site

To generate the static site into the `site/` directory (which is git-ignored):

```bash
mkdocs build
```

Add `--strict` to turn warnings, such as broken internal links or pages missing from the navigation, into errors. This is a useful check before opening a pull request:

```bash
mkdocs build --strict
```

When you are finished, deactivate the virtual environment with `deactivate`.

## Testing

Run the Framework-level Jest suite from `packages/core`. These tests may replace
the connector contract to isolate Core routing, orchestration, and persistence:

```bash
cd packages/core
npm test
```

For focused contract checks during App Connect client/server work, run targeted files, for example:

```bash
npm test -- test/routes/pluginRoutes.test.js test/handlers/plugin.test.js --runInBand
```

Run the App-level E2E suite from the repository root. These tests start the real
server and connector implementations, replacing only external provider APIs at
the HTTP boundary:

```bash
npm run test:e2e
```
