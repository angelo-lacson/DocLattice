import logging
from typing import Optional

from doclatticeserver.pipeline.base.parser import BaseParser
from doclatticeserver.types.dicts import DocLatticeDocExport

logger = logging.getLogger(__name__)


class MockParser(BaseParser):
    title: str = "MockParser"
    description: str = "A parser for testing KWARGS passing in doc_tasks."
    author: str = "Integration Test"
    dependencies: list[str] = []

    def _parse_document_impl(
        self, user_id: int, doc_id: int, **kwargs
    ) -> Optional[DocLatticeDocExport]:
        logger.info(f"MockParser.parse_document called with kwargs: {kwargs}")
        return None
