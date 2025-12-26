# Rich Mentions Implementation Plan

**Issue:** #689
**Status:** Planning
**Created:** 2024-12-24

## Problem Statement

Currently, mentions in messages are rendered through `MarkdownMessageRenderer.tsx` which:
1. Parses markdown links from message content
2. Detects mention types by URL pattern (`/c/` = corpus, `/d/` = document, `/d/...?ann=` = annotation)
3. Renders styled `<a>` tags with icons

However, **annotation mentions lose their rich metadata** (full text, label name, document title) because:
- At creation time: Full metadata is available in `MessageComposer` but only a truncated preview is stored as the link text
- At render time: Only the URL and link text are available - metadata is lost

Additionally, there is duplicate/unused code:
- `MentionChip.tsx` and `parseMentionsInContent()` are defined but never used
- `MarkdownMessageRenderer.tsx` has similar but separate styling logic

## Goal

Create a **DRY, centralized solution** where:
1. Backend provides full metadata for all mentioned resources
2. Frontend has a single component for rendering mention chips
3. Rich tooltips show full annotation text, label, and document context

## Current Data Flow

### Creation Time (MessageComposer.tsx)
```
User selects annotation from UnifiedMentionPicker
    → Full metadata available (rawText, label, document title)
    → Inserted as markdown: ["Preview text..." (Label)](/d/creator/corpus/doc?ann=id&structural=true)
    → Metadata is LOST (only truncated preview stored)
```

### Render Time (MarkdownMessageRenderer.tsx)
```
Message content parsed by ReactMarkdown
    → Link detected: [text](url)
    → Type detected from URL pattern (/d/...?ann= = annotation)
    → Rendered as styled <a> with icon
    → No access to full metadata
```

## Solution Architecture

### Backend: Extend `mentioned_resources` GraphQL Field

The `MessageType` already has a `mentioned_resources` field that parses `@corpus:slug` patterns. Extend it to also parse markdown link URLs containing annotation references.

#### URL Patterns to Handle

Per `docs/frontend/routing_system.md`, documents have two URL patterns:

1. **Corpus-scoped:** `/d/{creatorSlug}/{corpusSlug}/{docSlug}?ann={id}&structural=true`
2. **Non-corpus-scoped:** `/d/{creatorSlug}/{docSlug}?ann={id}&structural=true`

Annotation IDs can be:
- Plain numeric IDs: `123`
- Base64-encoded Relay global IDs: `QW5ub3RhdGlvblR5cGU6Mw==`

### Implementation Details

#### 1. Extend `MentionedResourceType` (graphene_types.py)

```python
class MentionedResourceType(graphene.ObjectType):
    """
    Represents a corpus, document, or annotation mentioned in a message.

    For annotations, includes full metadata for rich tooltip display.
    Permission-safe: Only returns resources visible to the requesting user.
    """

    type = graphene.String(
        required=True,
        description='Resource type: "corpus", "document", or "annotation"'
    )
    id = graphene.ID(required=True, description="Global ID of the resource")
    slug = graphene.String(description="URL-safe slug (null for annotations)")
    title = graphene.String(required=True, description="Display title")
    url = graphene.String(required=True, description="Frontend URL path")

    # Existing field for document context
    corpus = graphene.Field(
        lambda: MentionedResourceType,
        description="Parent corpus context (for documents within a corpus)",
    )

    # NEW: Annotation-specific fields (Issue #689)
    raw_text = graphene.String(
        description="Full annotation text content"
    )
    annotation_label = graphene.String(
        description="Annotation label name (e.g., 'Section Header', 'Definition')"
    )
    document = graphene.Field(
        lambda: MentionedResourceType,
        description="Parent document (for annotations)"
    )
```

#### 2. Update `resolve_mentioned_resources` (graphene_types.py)

```python
def resolve_mentioned_resources(self, info):
    """
    Parse message content for mentions and return structured resource references.

    Patterns handled:
      @corpus:slug → Corpus
      @document:slug → Document
      @corpus:slug/document:slug → Document in Corpus
      [text](/d/.../doc?ann=id) → Annotation (NEW)

    SECURITY: Uses .visible_to_user() to enforce permissions.
    Mentions to inaccessible resources are silently ignored.
    """
    import re
    from urllib.parse import urlparse, parse_qs
    import base64

    content = self.content or ""
    mentions = []
    user = info.context.user

    # ... existing @corpus: and @document: pattern handling ...

    # NEW: Parse markdown links with annotation URLs
    # Matches: [any text](/d/path?...ann=id...)
    # Handles both corpus-scoped and non-corpus-scoped document URLs
    link_pattern = r'\[([^\]]+)\]\((/d/[^)]+\?[^)]*ann=[^)]+)\)'

    for link_text, url in re.findall(link_pattern, content):
        ann_id = _extract_annotation_id(url)
        if not ann_id:
            continue

        try:
            annotation = Annotation.objects.visible_to_user(user).get(id=ann_id)
            doc = annotation.document
            label = annotation.annotation_label

            mentions.append(MentionedResourceType(
                type="annotation",
                id=annotation.id,
                slug=None,  # Annotations don't have slugs
                title=label.text if label else "Annotation",
                url=url,  # Preserve original URL for navigation
                raw_text=annotation.raw_text,
                annotation_label=label.text if label else None,
                document=MentionedResourceType(
                    type="document",
                    id=doc.id,
                    slug=doc.slug,
                    title=doc.title,
                    url=f"/d/{doc.creator.slug}/{doc.slug}",
                ),
            ))
        except Annotation.DoesNotExist:
            # Permission denied or doesn't exist - silently ignore
            continue

    return mentions


def _extract_annotation_id(url: str) -> Optional[str]:
    """
    Extract annotation ID from URL query params.

    Handles both plain IDs and Base64-encoded Relay global IDs.

    Examples:
        /d/user/doc?ann=123 → "123"
        /d/user/corpus/doc?ann=QW5ub3RhdGlvblR5cGU6Mw== → "3"
    """
    from urllib.parse import urlparse, parse_qs
    import base64

    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    ann_ids = query.get('ann', [])

    if not ann_ids:
        return None

    ann_id = ann_ids[0]

    # Handle Relay-style Base64 global IDs (e.g., "QW5ub3RhdGlvblR5cGU6Mw==")
    try:
        decoded = base64.b64decode(ann_id).decode('utf-8')
        if ':' in decoded:
            # Format: "AnnotationType:123" → extract "123"
            return decoded.split(':')[1]
    except Exception:
        pass

    return ann_id  # Already a plain ID
```

#### 3. Update GraphQL Query (frontend/src/graphql/queries.ts)

```graphql
fragment MentionedResourceFields on MentionedResourceType {
  type
  id
  slug
  title
  url
  rawText
  annotationLabel
  document {
    id
    slug
    title
  }
  corpus {
    id
    slug
    title
  }
}

# Include in message queries
query GetThreadMessages($threadId: ID!) {
  thread(id: $threadId) {
    messages {
      id
      content
      mentionedResources {
        ...MentionedResourceFields
      }
      # ... other fields
    }
  }
}
```

#### 4. Consolidate Frontend Components

**Option A: Enhance MarkdownMessageRenderer (simpler)**

Pass `mentionedResources` as a prop and match URLs to resources:

```typescript
interface MarkdownMessageRendererProps {
  content: string;
  mentionedResources?: MentionedResource[];
}

export function MarkdownMessageRenderer({
  content,
  mentionedResources = [],
}: MarkdownMessageRendererProps) {
  // Build URL → Resource lookup map
  const resourceByUrl = useMemo(() => {
    const map = new Map<string, MentionedResource>();
    mentionedResources.forEach(r => map.set(r.url, r));
    return map;
  }, [mentionedResources]);

  // In link renderer:
  a: ({ href, children }) => {
    const resource = resourceByUrl.get(href);

    if (resource) {
      return (
        <MentionChip
          resource={resource}
          // Rich tooltip available for annotations!
        />
      );
    }

    // Fallback to current behavior for unmatched links
    return <RegularLink href={href}>{children}</RegularLink>;
  }
}
```

**Option B: Use MentionChip component (more DRY)**

Refactor `MentionChip` to work with URL + optional metadata:

```typescript
interface MentionChipProps {
  // Required
  href: string;
  children: React.ReactNode;

  // Optional - from mentionedResources
  resource?: MentionedResource;
}

export function MentionChip({ href, children, resource }: MentionChipProps) {
  const type = resource?.type || detectTypeFromUrl(href);

  // Rich tooltip if we have resource metadata
  const tooltip = resource?.type === 'annotation'
    ? `${resource.rawText}\n\nLabel: ${resource.annotationLabel}\nDocument: ${resource.document?.title}`
    : resource?.title || String(children);

  return (
    <ChipContainer $type={type} title={tooltip}>
      <Icon type={type} />
      {children}
    </ChipContainer>
  );
}
```

#### 5. Clean Up Dead Code

After implementation, remove:
- `parseMentionsInContent()` function (unused)
- Potentially consolidate `MentionChip` if using Option A

## Data Flow After Implementation

```
1. Message stored: ["Preview...](/d/.../doc?ann=123)"
         ↓
2. GraphQL query: message { mentionedResources { type, rawText, annotationLabel, ... } }
         ↓
3. Backend: Parses URL, extracts ann=123
         ↓
4. Backend: Fetches Annotation(123) with permission check
         ↓
5. Backend: Returns MentionedResourceType with full metadata
         ↓
6. Frontend: MarkdownMessageRenderer receives mentionedResources prop
         ↓
7. Frontend: Matches link URL to resource in lookup map
         ↓
8. Render: MentionChip with icon, styling, and rich tooltip
```

## Security Considerations

1. **Permission checks:** Backend uses `Annotation.objects.visible_to_user(user)` - users can only see metadata for annotations they have access to
2. **Silent failure:** Inaccessible annotations are silently ignored (no error, just no rich metadata)
3. **XSS prevention:** Raw text is escaped by React's default rendering

## Testing Plan

### Backend Tests
- [ ] Test annotation URL parsing (corpus-scoped and non-corpus-scoped)
- [ ] Test Base64 global ID decoding
- [ ] Test permission filtering (user can't see other's private annotations)
- [ ] Test graceful handling of deleted/missing annotations

### Frontend Tests
- [ ] Test MentionChip rendering with full metadata
- [ ] Test tooltip display with annotation text, label, document
- [ ] Test fallback when mentionedResources is empty
- [ ] Test URL matching logic

## Migration Notes

- No database migrations required
- Backward compatible - existing messages will work (just without rich tooltips until re-fetched)
- Frontend gracefully degrades if backend doesn't return new fields

## Estimated Scope

- **Backend:** ~100 lines (extend resolver, add helper function)
- **Frontend:** ~50-100 lines (wire up props, consolidate components)
- **Tests:** ~100-150 lines

## Related Files

### Backend
- `config/graphql/graphene_types.py` - MentionedResourceType, MessageType.resolve_mentioned_resources

### Frontend
- `frontend/src/components/threads/MarkdownMessageRenderer.tsx` - Message rendering
- `frontend/src/components/threads/MentionChip.tsx` - Chip component (currently unused)
- `frontend/src/components/threads/MessageComposer.tsx` - Mention insertion
- `frontend/src/components/threads/MessageItem.tsx` - Message display
- `frontend/src/graphql/queries.ts` - GraphQL queries

### Documentation
- `docs/frontend/routing_system.md` - URL patterns reference
