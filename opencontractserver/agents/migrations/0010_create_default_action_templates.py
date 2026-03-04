# Generated manually for data migration

from django.db import migrations


# ---------------------------------------------------------------------------
# Template definitions
# ---------------------------------------------------------------------------

TEMPLATES = [
    {
        "name": "Document Description Updater",
        "description": (
            "Reads a newly added document and writes a concise description "
            "summarising its type, purpose, and key parties."
        ),
        "trigger": "add_document",
        "sort_order": 10,
        "tools": [
            "load_document_text",
            "get_document_description",
            "update_document_description",
        ],
        "pre_authorized": [
            "load_document_text",
            "get_document_description",
            "update_document_description",
        ],
        "instructions": (
            "Read the document text and write a concise 2-3 sentence description "
            "summarising what this document is about, its type (contract, memo, "
            "report, etc.), and the key parties or subjects involved. Use "
            "update_document_description to save your result. If a description "
            "already exists, improve it based on the actual document content."
        ),
    },
    {
        "name": "Corpus Description Updater",
        "description": (
            "Updates the corpus description to reflect the addition of a new "
            "document, maintaining a high-level summary of the collection."
        ),
        "trigger": "add_document",
        "sort_order": 20,
        "tools": [
            "load_document_text",
            "get_document_description",
            "get_corpus_description",
            "update_corpus_description",
            "list_documents",
        ],
        "pre_authorized": [
            "load_document_text",
            "get_document_description",
            "get_corpus_description",
            "update_corpus_description",
            "list_documents",
        ],
        "instructions": (
            "A new document was added to this corpus. Read the current corpus "
            "description, review the new document's description and content, "
            "and update the corpus description to reflect the addition. The "
            "corpus description should be a high-level summary of the "
            "collection's purpose and contents. If no description exists, "
            "create one based on the available documents."
        ),
    },
    {
        "name": "Document Summary Generator",
        "description": (
            "Creates a comprehensive structured summary for a newly added "
            "document, covering type, parties, terms, dates, and conclusions."
        ),
        "trigger": "add_document",
        "sort_order": 30,
        "tools": [
            "load_document_text",
            "load_document_summary",
            "get_document_summary",
            "update_document_summary",
            "search_exact_text",
        ],
        "pre_authorized": [
            "load_document_text",
            "load_document_summary",
            "get_document_summary",
            "update_document_summary",
            "search_exact_text",
        ],
        "instructions": (
            "Read the document text and create a comprehensive structured "
            "summary. Include: (1) Document type and purpose, (2) Key "
            "parties/entities, (3) Main terms or findings, (4) Important "
            "dates or deadlines, (5) Notable provisions or conclusions. "
            "Use update_document_summary to save your result."
        ),
    },
    {
        "name": "Key Terms Annotator",
        "description": (
            "Identifies and annotates the most important key terms, defined "
            "terms, and proper nouns in a newly added document."
        ),
        "trigger": "add_document",
        "sort_order": 40,
        "tools": [
            "load_document_text",
            "search_exact_text",
            "add_annotations_from_exact_strings",
        ],
        "pre_authorized": [
            "load_document_text",
            "search_exact_text",
            "add_annotations_from_exact_strings",
        ],
        "instructions": (
            "Read the document and identify the most important key terms, "
            "defined terms, proper nouns (parties, organisations, places), "
            "and significant legal or business terminology. For each, find "
            "the exact text in the document using search_exact_text, then "
            "create annotations using add_annotations_from_exact_strings "
            "with the label 'Key Term'. Limit to the 20 most important terms."
        ),
    },
    {
        "name": "Document Notes Generator",
        "description": (
            "Creates a structured analysis note for a newly added document "
            "with metadata, executive summary, and key findings."
        ),
        "trigger": "add_document",
        "sort_order": 50,
        "tools": [
            "load_document_text",
            "add_document_note",
            "get_document_description",
        ],
        "pre_authorized": [
            "load_document_text",
            "add_document_note",
            "get_document_description",
        ],
        "instructions": (
            "Read the document and create a structured note with key "
            "findings. The note should include: document metadata (type, "
            "date, parties), a brief executive summary, key obligations or "
            "action items, and any risks or notable provisions. Title the "
            "note 'Document Analysis'."
        ),
    },
]


BADGE_CONFIGS = {
    "Document Description Updater": {
        "icon": "file-text",
        "color": "#059669",
        "label": "Desc",
    },
    "Corpus Description Updater": {
        "icon": "database",
        "color": "#7C3AED",
        "label": "Corpus",
    },
    "Document Summary Generator": {
        "icon": "file-text",
        "color": "#2563EB",
        "label": "Summary",
    },
    "Key Terms Annotator": {
        "icon": "tag",
        "color": "#D97706",
        "label": "Terms",
    },
    "Document Notes Generator": {
        "icon": "edit",
        "color": "#DC2626",
        "label": "Notes",
    },
}


def create_default_action_templates(apps, schema_editor):
    """Create default AgentConfigurations and CorpusActionTemplates."""
    AgentConfiguration = apps.get_model("agents", "AgentConfiguration")
    CorpusActionTemplate = apps.get_model("corpuses", "CorpusActionTemplate")
    User = apps.get_model("users", "User")

    system_user = User.objects.filter(is_superuser=True).first()
    if not system_user:
        return

    for tmpl_def in TEMPLATES:
        # Idempotency: skip if this template already exists.
        if CorpusActionTemplate.objects.filter(name=tmpl_def["name"]).exists():
            continue

        agent_config = AgentConfiguration.objects.create(
            name=f"{tmpl_def['name']} Agent",
            description=tmpl_def["description"],
            system_instructions=(
                "You are an automated document processing agent. "
                "Execute the task described in your instructions precisely. "
                "Use only the tools provided. Do not ask questions."
            ),
            available_tools=tmpl_def["tools"],
            permission_required_tools=[],
            badge_config=BADGE_CONFIGS.get(tmpl_def["name"], {}),
            scope="GLOBAL",
            is_active=True,
            is_public=True,
            creator=system_user,
        )

        CorpusActionTemplate.objects.create(
            name=tmpl_def["name"],
            description=tmpl_def["description"],
            agent_config=agent_config,
            task_instructions=tmpl_def["instructions"],
            pre_authorized_tools=tmpl_def["pre_authorized"],
            trigger=tmpl_def["trigger"],
            is_active=True,
            disabled_on_clone=True,
            sort_order=tmpl_def["sort_order"],
            creator=system_user,
        )


def reverse_migration(apps, schema_editor):
    """Remove default action templates and their agent configs."""
    AgentConfiguration = apps.get_model("agents", "AgentConfiguration")
    CorpusActionTemplate = apps.get_model("corpuses", "CorpusActionTemplate")

    template_names = [t["name"] for t in TEMPLATES]
    agent_names = [f"{n} Agent" for n in template_names]

    CorpusActionTemplate.objects.filter(name__in=template_names).delete()
    AgentConfiguration.objects.filter(name__in=agent_names).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("agents", "0009_update_checkconstraint_check_to_condition"),
        ("corpuses", "0045_corpusactiontemplate"),
    ]

    operations = [
        migrations.RunPython(
            create_default_action_templates,
            reverse_migration,
        ),
    ]
