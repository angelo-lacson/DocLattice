"""Re-export *canonical* JSON-shape types declared in `doclatticeserver.types.dicts`.

Keeping a thin wrapper here lets `annotations.models` depend on a *single* import
location while the underlying definitions live in `doclatticeserver.types` –
the shared home for all cross-layer data-shape declarations.
"""

from __future__ import annotations

from doclatticeserver.types.dicts import BoundingBoxPythonType as BoundingBox
from doclatticeserver.types.dicts import (
    DocLatticeSinglePageAnnotationType as SinglePageAnnotationJson,
)
from doclatticeserver.types.dicts import TextSpanData as SpanAnnotationJson

MultipageAnnotationJson = dict[int, SinglePageAnnotationJson]

# Re-exported names for external importers.
__all__ = [
    "BoundingBox",
    "SinglePageAnnotationJson",
    "MultipageAnnotationJson",
    "SpanAnnotationJson",
]
