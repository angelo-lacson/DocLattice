![OpenContracts](docs/assets/images/logos/OS_Legal_Logo.png)

# OpenContracts ([Demo](https://contracts.opensource.legal))

Open source document intelligence. Self-hosted, AI-powered, and built for teams who need to own their data.

[![Sponsor](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86)](https://github.com/sponsors/JSv4)

---

| | |
|---|---|
| Backend CI/CD | [![codecov](https://codecov.io/gh/Open-Source-Legal/OpenContracts/branch/main/graph/badge.svg?token=RdVsiuaTVz)](https://codecov.io/gh/JSv4/OpenContracts) |
| Meta | [![code style - black](https://img.shields.io/badge/code%20style-black-000000.svg)](https://github.com/psf/black) [![types - Mypy](https://img.shields.io/badge/types-Mypy-blue.svg)](https://github.com/python/mypy) [![imports - isort](https://img.shields.io/badge/imports-isort-ef8336.svg)](https://github.com/pycqa/isort) [![License - AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](https://www.gnu.org/licenses/agpl-3.0) |

## What is OpenContracts?

OpenContracts is an AGPL-3.0 licensed platform for document analysis, annotation, and collaboration. It combines document management with AI-powered analysis tools, discussion threads, and structured data extraction.

### Core Capabilities

- **Document Processing** — Upload PDFs and text files, automatically extract structure with ML-based parsers
- **Annotation & Analysis** — Highlight, label, and analyze documents with custom annotation schemas
- **AI Agents** — Chat with documents using configurable AI assistants that can search and analyze content
- **Collaboration** — Threaded discussions with @mentions, voting, and moderation at corpus and document levels
- **Data Extraction** — Extract structured data from hundreds of documents using agent-powered queries
- **Version Control** — Track document changes, restore previous versions, soft delete with recovery

---

## Quick Look

### Document Annotation
![PDF Processing](/docs/assets/images/gifs/PDF%20Annotation%20Flow.gif)

### Text Format Support
![Txt Processing](/docs/assets/images/gifs/Txt%20Annotation%20Flow.gif)

### Structured Data Extraction
![Data Grid](docs/assets/images/screenshots/data_grid_image.png)

### Custom Analytics
![Analyzer Annotations](docs/assets/images/screenshots/Analyzer_Annotations.png)

---

## Features

### Document Management
- Organize documents into collections (Corpuses) with folder hierarchies
- Fine-grained permissions with public/private visibility controls
- Document versioning with full history and restore capability
- Bulk upload and batch operations

### Parsing & Processing
- Pluggable parser architecture supporting multiple backends:
  - [Docling](docs/pipelines/docling_parser.md) — ML-based structure extraction
  - [NLM-Ingest](docs/pipelines/nlm_ingest_parser.md) — Layout-aware parsing
  - Text/Markdown — Simple text extraction
- Automatic vector embeddings for semantic search (powered by pgvector)
- Structural annotation extraction (headers, paragraphs, tables)

### Annotation Tools
- Multi-page annotation support
- Custom label schemas with validation
- Relationship mapping between annotations
- Import/export in standard formats

### AI & LLM Integration
- Built on [PydanticAI](docs/architecture/llms/README.md) for structured LLM interactions
- Configurable AI agents with tool access (search, document loading, annotation queries)
- Real-time streaming responses via WebSocket
- Conversation history with context management

### Collaboration (New in v3.0.0.b3)
- Threaded discussions at global, corpus, and document levels
- @mentions for documents, corpuses, and AI agents
- Upvoting/downvoting with reputation tracking
- Thread pinning, locking, and moderation controls
- User profiles with activity feeds and statistics
- Badges and achievements for community engagement
- Leaderboards showing top contributors

### Data Extraction
- Define extraction schemas with multiple question types
- Run extractions across document collections
- Review and validate extracted data in grid view
- Export results in structured formats

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

## Architecture

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

---

## Deployment

### Quick Start (Development)

```bash
git clone https://github.com/JSv4/OpenContracts.git
cd OpenContracts
docker compose -f local.yml up
```

### Production

Run migrations before starting services:

```bash
# Apply database migrations
docker compose -f production.yml --profile migrate up migrate

# Start services
docker compose -f production.yml up -d
```

The migration service runs once to avoid race conditions and ensures all tables are created before dependent services start.

---

## Telemetry

OpenContracts collects anonymous usage data to guide development priorities. We collect:
- Installation events (unique installation ID)
- Feature usage statistics (analyzer runs, extracts created)
- Aggregate counts (documents, users, queries)

We do not collect document contents, extracted data, user identities, or query contents.

Disable with `TELEMETRY_ENABLED=False` in your settings.

---

## Supported Formats

Currently supported:
- PDF (full layout and annotation support)
- Text-based formats (plaintext, Markdown)

**Coming soon:** DOCX viewing and annotation powered by [Docxodus](https://github.com/JSv4/Docxodus), an open source in-browser Word document viewer. This will enable the same annotation and analysis workflows for Word documents that currently exist for PDFs.

---

## Acknowledgements

This project builds on work from:

- [AllenAI PAWLS](https://github.com/allenai/pawls) — PDF annotation data format and concepts
- [NLMatics nlm-ingestor](https://github.com/nlmatics/nlm-ingestor) — Document parsing pipeline

The data extraction grid UI draws inspiration from NLMatics' innovative approach to document querying:

![NLMatics Grid](docs/assets/images/screenshots/nlmatics_datagrid.png)

---

## License

AGPL-3.0 — See [LICENSE](LICENSE) for details.
