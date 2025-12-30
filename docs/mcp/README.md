# OpenContracts MCP Server

## TL;DR

OpenContracts exposes a read-only [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for AI assistants to access **public** corpuses, documents, annotations, and discussion threads.

- **Endpoint**: `POST /mcp/` (Streamable HTTP, stateless)
- **Scope**: Public resources only (anonymous user visibility)
- **Auth**: None required (public data only)

### Claude Desktop Quick Start

Add to `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "opencontracts": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-instance.com/mcp/"
      ]
    }
  }
}
```

---

## Available Tools

| Tool | Description |
|------|-------------|
| `list_public_corpuses` | List all public corpuses (paginated, searchable) |
| `list_documents` | List documents in a corpus |
| `get_document_text` | Get full extracted text from a document |
| `list_annotations` | List annotations on a document (filter by page/label) |
| `search_corpus` | Semantic vector search within a corpus |
| `list_threads` | List discussion threads in a corpus |
| `get_thread_messages` | Get messages in a thread (flat or hierarchical) |

## Available Resources

Resources use URI patterns for direct access:

| URI Pattern | Description |
|-------------|-------------|
| `corpus://{corpus_slug}` | Corpus metadata and document list |
| `document://{corpus_slug}/{document_slug}` | Document with extracted text |
| `annotation://{corpus_slug}/{document_slug}/{annotation_id}` | Specific annotation |
| `thread://{corpus_slug}/threads/{thread_id}` | Thread with messages |

---

## Transport Options

### HTTP (Streamable HTTP)

The primary transport. Stateless mode - each request is independent.

```bash
# Test with curl
curl -X POST https://your-instance.com/mcp/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

### stdio (CLI)

For local development or direct integration:

```bash
cd /path/to/OpenContracts
python -m opencontractserver.mcp.server
```

---

## Example Usage

### List Public Corpuses

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "list_public_corpuses",
    "arguments": {"limit": 10}
  },
  "id": 1
}
```

### Semantic Search

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "search_corpus",
    "arguments": {
      "corpus_slug": "my-corpus",
      "query": "indemnification clause",
      "limit": 5
    }
  },
  "id": 2
}
```

### Read Resource

```json
{
  "jsonrpc": "2.0",
  "method": "resources/read",
  "params": {
    "uri": "document://my-corpus/contract-2024"
  },
  "id": 3
}
```

---

## Architecture

```
┌─────────────────┐     POST /mcp/     ┌──────────────────────┐
│  MCP Client     │ ◄────────────────► │  StreamableHTTP      │
│  (Claude, etc)  │   JSON-RPC 2.0     │  Session Manager     │
└─────────────────┘                    │  (stateless mode)    │
                                       └──────────┬───────────┘
                                                  │
                                       ┌──────────▼───────────┐
                                       │  MCP Server          │
                                       │  - Tools (7)         │
                                       │  - Resources (4)     │
                                       └──────────┬───────────┘
                                                  │
                                       ┌──────────▼───────────┐
                                       │  Django ORM          │
                                       │  visible_to_user()   │
                                       │  (AnonymousUser)     │
                                       └──────────────────────┘
```

**Key files**:
- `opencontractserver/mcp/server.py` - Server setup, ASGI app, URI parsing
- `opencontractserver/mcp/tools.py` - Tool implementations
- `opencontractserver/mcp/resources.py` - Resource handlers
- `opencontractserver/mcp/formatters.py` - Response formatters
- `config/asgi.py` - HTTP routing (`/mcp/*` → MCP app)

---

## Security Model

- **Read-only**: No mutations, no writes
- **Public only**: Uses `AnonymousUser` for all permission checks
- **Slug-based**: All identifiers are URL-safe slugs (no internal IDs exposed)
- **No auth required**: Only public resources are accessible

---

## Limitations

- No authentication (future: JWT/API key support for private resources)
- No write operations (by design)
- No streaming of large documents (text returned in full)
- Semantic search requires corpus to have embeddings configured
