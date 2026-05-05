from django.apps import AppConfig


class DocumentImportsConfig(AppConfig):
    default_auto_field: str = "django.db.models.BigAutoField"
    name: str = "doclatticeserver.document_imports"
    verbose_name: str = "Document Imports (REST)"
