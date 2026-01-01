"""
Data migration to seed default corpus categories.

These categories match the standard legal document types shown in the
Discover page design: Legislation, Contracts, Case Law, Knowledge.
"""

from django.db import migrations


def seed_default_categories(apps, schema_editor):
    """Create default corpus categories for the Discover page."""
    CorpusCategory = apps.get_model("corpuses", "CorpusCategory")
    User = apps.get_model("users", "User")

    # Get or create a system user for ownership of default categories
    system_user, _ = User.objects.get_or_create(
        username="system",
        defaults={
            "email": "system@opencontracts.local",
            "is_active": False,  # System user cannot log in
        },
    )

    default_categories = [
        {
            "name": "Legislation",
            "description": "Laws, statutes, regulations, and legislative documents",
            "icon": "scroll",
            "color": "#3B82F6",  # Blue
            "sort_order": 1,
        },
        {
            "name": "Contracts",
            "description": "Commercial agreements, legal contracts, and transactional documents",
            "icon": "file-text",
            "color": "#10B981",  # Green
            "sort_order": 2,
        },
        {
            "name": "Case Law",
            "description": "Court decisions, judicial opinions, and legal precedents",
            "icon": "gavel",
            "color": "#8B5CF6",  # Purple
            "sort_order": 3,
        },
        {
            "name": "Knowledge",
            "description": "Legal research, articles, and educational materials",
            "icon": "book-open",
            "color": "#F59E0B",  # Amber
            "sort_order": 4,
        },
    ]

    for category_data in default_categories:
        CorpusCategory.objects.get_or_create(
            name=category_data["name"],
            defaults={
                "description": category_data["description"],
                "icon": category_data["icon"],
                "color": category_data["color"],
                "sort_order": category_data["sort_order"],
                "creator": system_user,
            },
        )


def remove_default_categories(apps, schema_editor):
    """Remove default corpus categories (reverse migration)."""
    CorpusCategory = apps.get_model("corpuses", "CorpusCategory")
    default_names = ["Legislation", "Contracts", "Case Law", "Knowledge"]
    CorpusCategory.objects.filter(name__in=default_names).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("corpuses", "0034_add_corpus_category"),
        ("users", "0001_initial"),  # Need User model for creator
    ]

    operations = [
        migrations.RunPython(seed_default_categories, remove_default_categories),
    ]
