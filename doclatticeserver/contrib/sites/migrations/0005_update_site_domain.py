from django.conf import settings
from django.db import migrations


def update_site_forward(apps, schema_editor):
    """Update site domain from doclattice.opensource.legal to contracts.opensource.legal."""
    Site = apps.get_model("sites", "Site")
    Site.objects.update_or_create(
        id=settings.SITE_ID,
        defaults={
            "domain": "contracts.opensource.legal",
            "name": "DocLatticeServer",
        },
    )


def update_site_backward(apps, schema_editor):
    """Revert site domain to doclattice.opensource.legal."""
    Site = apps.get_model("sites", "Site")
    Site.objects.update_or_create(
        id=settings.SITE_ID,
        defaults={
            "domain": "doclattice.opensource.legal",
            "name": "DocLatticeServer",
        },
    )


class Migration(migrations.Migration):

    dependencies = [("sites", "0004_alter_options_ordering_domain")]

    operations = [migrations.RunPython(update_site_forward, update_site_backward)]
