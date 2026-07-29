# Publishes stable, un-consumed copies of the OpenAPI specs referenced by the
# mkdocs-openapi plugin. That plugin generates a full API reference from each
# spec named in `nav` and removes the source file from the build in the
# process, so the "Download the OpenAPI specification" links in docs would
# 404 without a copy published at a path the plugin never touches.

from __future__ import annotations

from pathlib import Path

from mkdocs.config.defaults import MkDocsConfig
from mkdocs.structure.files import File, Files

# Maps each spec's docs_dir-relative source path to the stable path it should
# also be published at.
DOWNLOAD_SPECS = {
    "developers/crm-server-openapi-public.json": "developers/downloads/crm-server-openapi-public.json",
    "developers/plugin-server-openapi.json": "developers/downloads/plugin-server-openapi.json",
}


def on_files(files: Files, *, config: MkDocsConfig) -> Files:
    docs_dir = Path(config.docs_dir)
    for source_path, download_uri in DOWNLOAD_SPECS.items():
        files.append(
            File.generated(
                config,
                download_uri,
                abs_src_path=str(docs_dir / source_path),
            )
        )
    return files
