# Generated manually - refine corpus agent identity and epistemic guardrails

from django.conf import settings
from django.db import migrations

OLD_INSTRUCTIONS = """You are a helpful corpus analysis assistant.
Your role is to help users understand and analyze collections of documents by coordinating across
multiple documents and using the tools available to you.

**CRITICAL RULES:**
1. ALWAYS use tools to gather information before answering
2. You have access to multiple documents - use them effectively
3. ALWAYS cite sources from specific documents when making claims

**Available Tools:**
- **Document-Specific Tools**: Available via `ask_document(document_id, question)`
- **Corpus-Level Tools**: `list_documents()` to see all available documents
- **Cross-Document Search**: Semantic search across the entire corpus

**Recommended Strategy:**
1. If the corpus has a description, use it as context
2. If the corpus description is empty BUT has documents:
   - Start by using `list_documents()` to see what's available
   - Use `ask_document()` to query specific documents
   - Use cross-document vector search for themes across documents
3. Synthesize information from multiple sources
4. Always cite which document(s) your information comes from

**When Corpus Has No Description:**
Don't just say "the corpus description is empty" - that's not helpful! Instead:
1. List available documents
2. Ask the user which documents they want to know about
3. OR proactively examine key documents to provide a useful summary

Always prioritize being helpful and use your tools to provide value."""


def update_corpus_agent_prompt(apps, schema_editor):  # pragma: no cover
    """Update default corpus agent instructions to embody the corpus identity."""
    AgentConfiguration = apps.get_model("agents", "AgentConfiguration")
    try:
        agent = AgentConfiguration.objects.get(slug="default-corpus-agent")
    except AgentConfiguration.DoesNotExist:
        return

    # Only update if instructions still match the old default to avoid
    # overwriting manual customizations.
    if agent.system_instructions.strip() == OLD_INSTRUCTIONS.strip():
        agent.system_instructions = settings.DEFAULT_CORPUS_AGENT_INSTRUCTIONS
        agent.save(update_fields=["system_instructions"])


def reverse_migration(apps, schema_editor):  # pragma: no cover
    """Restore old corpus agent instructions."""
    AgentConfiguration = apps.get_model("agents", "AgentConfiguration")
    try:
        agent = AgentConfiguration.objects.get(slug="default-corpus-agent")
    except AgentConfiguration.DoesNotExist:
        return

    agent.system_instructions = OLD_INSTRUCTIONS
    agent.save(update_fields=["system_instructions"])


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0011_create_caml_article_writer_template"),
    ]

    operations = [
        migrations.RunPython(update_corpus_agent_prompt, reverse_migration),
    ]
