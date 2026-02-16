![OpenContracts](docs/assets/images/logos/OS_Legal_Logo.png)

# OpenContracts ([Demo](https://contracts.opensource.legal))

Open source document intelligence. Self-hosted, AI-powered, and built for teams who need to own their data.

[![Sponsor](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86)](https://github.com/sponsors/JSv4)

| | |
|---|---|
| Backend CI/CD | [![codecov](https://codecov.io/gh/Open-Source-Legal/OpenContracts/branch/main/graph/badge.svg?token=RdVsiuaTVz)](https://app.codecov.io/gh/open-source-legal/OpenContracts) |
| Meta | [![code style - black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black) [![types - Mypy](https://img.shields.io/badge/types-Mypy-blue.svg)](https://github.com/python/mypy) [![imports - isort](https://img.shields.io/badge/imports-isort-ef8336.svg)](https://github.com/pycqa/isort) [![License - AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](https://www.gnu.org/licenses/agpl-3.0) |

---

![Discovery Landing Page](docs/assets/images/screenshots/auto/landing--discovery-page--anonymous.png)

OpenContracts is an AGPL-3.0 licensed platform for document analysis, annotation, and collaboration. It combines document management with AI-powered analysis tools, discussion threads, and structured data extraction.

---

## Features

### Document Annotation

Annotate PDFs and text documents with custom label schemas. Multi-page selections, relationship mapping between annotations, and structural extraction powered by ML-based parsers.

![Document Annotator](docs/assets/images/screenshots/auto/readme--document-annotator--with-pdf.png)

### Corpus Management

Organize documents into collections with folder hierarchies, fine-grained permissions, and an integrated chat bar for quick AI-powered queries across your entire corpus.

![Corpus Home](docs/assets/images/screenshots/auto/readme--corpus-home--with-chat.png)

### AI Agents

Chat with your documents using configurable AI assistants. Agents can search content, load full documents, and query annotations — all with real-time streaming responses.

![AI Agent Response](docs/assets/images/screenshots/auto/threads--agent-message--response.png)

### Discussions & Collaboration

Forum-style threaded discussions at global, corpus, and document levels. @mention documents, corpuses, and AI agents. Upvote, pin, lock, and moderate threads.

![Discussion Threads](docs/assets/images/screenshots/auto/discussions--thread-list--with-threads.png)

### Analytics

Track engagement across your corpus with real-time metrics — thread activity, message volume, contributor counts, and interactive visualizations.

![Analytics Dashboard](docs/assets/images/screenshots/auto/corpus--analytics--dashboard.png)

---

## See it in Action

### PDF Annotation Flow
![PDF Annotation Flow](docs/assets/images/gifs/PDF%20Annotation%20Flow.gif)

### Text Format Support
![Text Annotation Flow](docs/assets/images/gifs/Txt%20Annotation%20Flow.gif)

---

## Quick Start

### Development

```bash
git clone https://github.com/JSv4/OpenContracts.git
cd OpenContracts
docker compose -f local.yml up
```

### Production

```bash
# Apply database migrations first
docker compose -f production.yml --profile migrate up migrate

# Start services
docker compose -f production.yml up -d
```

---

## Documentation

Browse the full documentation at [jsv4.github.io/OpenContracts](https://jsv4.github.io/OpenContracts/) or in the repo:

| Guide | Description |
|-------|-------------|
| [Quick Start](docs/quick_start.md) | Get running with Docker in minutes |
| [Key Concepts](docs/walkthrough/key-concepts.md) | Core workflows and terminology |
| [PDF Data Format](docs/architecture/PDF-data-layer.md) | How text maps to PDF coordinates |
| [LLM Framework](docs/architecture/llms/README.md) | PydanticAI integration and agents |
| [Vector Stores](docs/extract_and_retrieval/vector_stores.md) | Semantic search architecture |
| [Pipeline Overview](docs/pipelines/pipeline_overview.md) | Parser and embedder system |
| [Custom Extractors](docs/walkthrough/advanced/write-your-own-extractors.md) | Build your own data extraction tasks |
| [v3.0.0.b3 Release Notes](docs/releases/v3.0.0.b3.md) | Latest features and migration guide |

---

<details>
<summary><strong>Architecture</strong></summary>

### Data Format

OpenContracts uses a standardized format for representing text and layout on PDF pages, enabling portable annotations across tools:

![Data Format](docs/assets/images/diagrams/pawls-annotation-mapping.svg)

### Processing Pipeline

The modular pipeline supports custom parsers, embedders, and thumbnail generators:

![Pipeline Diagram](docs/assets/images/diagrams/parser_pipeline.svg)

Each component inherits from a base class with a defined interface:
- **Parsers** — Extract text and structure from documents
- **Embedders** — Generate vector embeddings for search
- **Thumbnailers** — Create document previews

See the [pipeline documentation](docs/pipelines/pipeline_overview.md) for details on creating custom components.

</details>

---

## Telemetry

OpenContracts collects anonymous usage data to guide development priorities: installation events, feature usage statistics, and aggregate counts. We do not collect document contents, extracted data, user identities, or query contents.

**Disable backend telemetry**: Set `TELEMETRY_ENABLED=False` in your Django settings.
**Disable frontend analytics**: Leave `REACT_APP_POSTHOG_API_KEY` unset in `frontend/public/env-config.js`.

---

## Supported Formats

- PDF (full layout and annotation support)
- Text-based formats (plaintext, Markdown)

**Coming soon:** DOCX viewing and annotation powered by [Docxodus](https://github.com/JSv4/Docxodus).

---

## Acknowledgements

This project builds on work from:
- [AllenAI PAWLS](https://github.com/allenai/pawls) — PDF annotation data format and concepts
- [NLMatics nlm-ingestor](https://github.com/nlmatics/nlm-ingestor) — Document parsing pipeline

---

## License

AGPL-3.0 — See [LICENSE](LICENSE) for details.
