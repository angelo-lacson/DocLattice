import base64
import logging
from typing import Any, Optional

import requests
from django.conf import settings
from django.core.files.storage import default_storage
from requests.exceptions import ConnectionError, RequestException, Timeout

from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.exceptions import DocumentParsingError
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.types.dicts import (
    BoundingBoxPythonType,
    OpenContractDocExport,
    PawlsTokenPythonType,
    TokenIdPythonType,
)
from opencontractserver.utils.cloud import maybe_add_cloud_run_auth
from opencontractserver.utils.pdf_token_extraction import (
    crop_image_from_pdf,
    extract_images_from_pdf,
)

logger = logging.getLogger(__name__)


class DoclingParser(BaseParser):
    """
    A parser that delegates PDF document parsing to a Docling microservice via REST API
    instead of running the processing locally. This helps isolate complex dependencies
    and improves performance by offloading processing to a dedicated container.
    """

    title = "Docling Parser (REST)"
    description = "Parses PDF documents using Docling microservice API."
    author = "OpenContracts Team"
    dependencies = ["requests"]
    supported_file_types = [FileTypeEnum.PDF]

    def __init__(self):
        """Initialize the Docling REST parser with service URL from settings."""
        super().__init__()  # Call to superclass __init__

        # Priority order for service URL:
        # 1. PIPELINE_SETTINGS configuration (if specified)
        # 2. Django settings attribute (which reads from env vars)
        # Note: Environment variables are ONLY read in Django settings, not here

        self.service_url = getattr(settings, "DOCLING_PARSER_SERVICE_URL")

        # Allow configuring the timeout
        self.request_timeout = getattr(settings, "DOCLING_PARSER_TIMEOUT")

        # Optional explicit flag to force Cloud Run IAM auth (useful for custom domains)
        self.use_cloud_run_iam_auth = bool(
            getattr(settings, "use_cloud_run_iam_auth", False)
        )

        # Image extraction configuration
        self.extract_images = getattr(settings, "DOCLING_EXTRACT_IMAGES", True)
        self.image_format = getattr(settings, "DOCLING_IMAGE_FORMAT", "jpeg")
        self.image_quality = getattr(settings, "DOCLING_IMAGE_QUALITY", 85)
        self.image_dpi = getattr(settings, "DOCLING_IMAGE_DPI", 150)
        self.min_image_width = getattr(settings, "DOCLING_MIN_IMAGE_WIDTH", 50)
        self.min_image_height = getattr(settings, "DOCLING_MIN_IMAGE_HEIGHT", 50)

        logger.info(
            f"DoclingParser initialized with service URL: {self.service_url}, "
            f"extract_images: {self.extract_images}"
        )

    @staticmethod
    def _maybe_add_cloud_run_auth(
        url: str, headers: dict[str, str], force: bool = False
    ) -> dict[str, str]:
        """
        Attach an Authorization bearer with a Google Cloud Run identity token when applicable.

        Args:
            url: The service URL we are calling (used to derive target audience).
            headers: Existing headers to be augmented.
            force: If True, force adding IAM auth regardless of the domain.

        Returns:
            A possibly augmented headers dict. If token acquisition fails, returns original headers.
        """
        try:
            from urllib.parse import urlparse

            parsed = urlparse(url)
            is_cloud_run = parsed.scheme == "https" and parsed.netloc.endswith(
                ".run.app"
            )
            if not (is_cloud_run or force):
                return headers

            audience = f"{parsed.scheme}://{parsed.netloc}"

            # Lazy import to avoid hard dependency in non-GCP environments
            import google.auth.transport.requests
            import google.oauth2.id_token

            request = google.auth.transport.requests.Request()
            id_token = google.oauth2.id_token.fetch_id_token(request, audience)
            if id_token:
                headers["Authorization"] = f"Bearer {id_token}"
                logger.debug(
                    "Attached Google Cloud Run IAM id_token to Docling request headers."
                )
            else:
                logger.warning(
                    "Failed to obtain Google Cloud Run IAM id_token for Docling."
                )
        except Exception as e:
            logger.warning(f"Docling Cloud Run IAM auth header not added: {e}")
        return headers

    def _parse_document_impl(
        self, user_id: int, doc_id: int, **all_kwargs
    ) -> Optional[OpenContractDocExport]:
        """
        Delegates document parsing to the Docling microservice.

        Args:
            user_id (int): The ID of the user parsing the document.
            doc_id (int): The ID of the target Document in the database.
            **all_kwargs: Additional optional arguments (e.g. "force_ocr", "llm_enhanced_hierarchy", etc.)
                These can come from PIPELINE_SETTINGS or be passed directly.
                - force_ocr (bool): Force OCR processing even if text is detectable
                - roll_up_groups (bool): Roll up items under the same heading into single relationships
                - llm_enhanced_hierarchy (bool): Apply experimental LLM-based hierarchy enhancement

        Returns:
            Optional[OpenContractDocExport]: A dictionary containing the doc metadata,
            annotations ("labelled_text"), and relationships (including grouped relationships).
        """
        logger.info(
            f"DoclingParser - Parsing doc {doc_id} for user {user_id} with effective kwargs: {all_kwargs}"
        )

        document = Document.objects.get(pk=doc_id)
        doc_path = document.pdf_file.name

        # Get settings from all_kwargs (which includes PIPELINE_SETTINGS and direct_kwargs)
        force_ocr = all_kwargs.get("force_ocr", False)
        roll_up_groups = all_kwargs.get(
            "roll_up_groups", True
        )  # Defaulting to True as per original PARSER_KWARGS
        llm_enhanced_hierarchy = all_kwargs.get("llm_enhanced_hierarchy", False)

        if force_ocr:
            logger.info(
                "Force OCR is enabled - this adds extra processing time and may not be necessary. "
                "We normally try to intelligently determine if OCR is needed."
            )

        # Read the PDF file from storage
        try:
            with default_storage.open(doc_path, "rb") as pdf_file:
                pdf_bytes = pdf_file.read()

            # Convert PDF bytes to base64 for JSON request
            pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")

            # Extract filename from path
            filename = doc_path.split("/")[-1]

            # Prepare the request payload
            payload = {
                "filename": filename,
                "pdf_base64": pdf_base64,
                "force_ocr": force_ocr,
                "roll_up_groups": roll_up_groups,
                "llm_enhanced_hierarchy": llm_enhanced_hierarchy,
            }

            # Send request to the microservice
            logger.info(f"Sending PDF to Docling parser service: {self.service_url}")
            try:
                headers: dict[str, str] = {"Content-Type": "application/json"}
                # Attach Cloud Run IAM id_token if applicable/forced
                headers = maybe_add_cloud_run_auth(
                    self.service_url, headers, force=self.use_cloud_run_iam_auth
                )

                response = requests.post(
                    self.service_url,
                    json=payload,
                    headers=headers,
                    timeout=self.request_timeout,
                )
                response.raise_for_status()  # Raise exception for 4XX/5XX responses
            except Timeout:
                msg = (
                    f"Request to Docling parser service timed out after "
                    f"{self.request_timeout} seconds for document {doc_id}"
                )
                logger.error(msg)
                raise DocumentParsingError(msg, is_transient=True)
            except ConnectionError:
                msg = (
                    f"Failed to connect to Docling parser service at "
                    f"{self.service_url} for document {doc_id}"
                )
                logger.error(msg)
                raise DocumentParsingError(msg, is_transient=True)
            except RequestException as e:
                # Determine if transient based on HTTP status code
                is_transient = True
                status_code = None
                response_text = ""

                if hasattr(e, "response") and e.response is not None:
                    status_code = e.response.status_code
                    response_text = e.response.text[:500]  # Limit error text length
                    # 4xx errors are typically permanent (bad request, unauthorized, etc.)
                    # 5xx errors are typically transient (server error, service unavailable)
                    if 400 <= status_code < 500:
                        is_transient = False

                msg = (
                    f"Request to Docling parser service failed for document {doc_id}: "
                    f"{e}"
                )
                if status_code:
                    msg += f" (status={status_code})"
                if response_text:
                    msg += f" - Response: {response_text}"

                logger.error(msg)
                raise DocumentParsingError(msg, is_transient=is_transient)

            # Parse the response
            result = response.json()

            # Handle potential differences in field names (snake_case vs camelCase)
            normalized_result = self._normalize_response(result)

            # Extract images if enabled
            extract_images_flag = all_kwargs.get("extract_images", self.extract_images)
            if extract_images_flag:
                # Construct storage path for images based on document ID
                image_storage_path = f"documents/{doc_id}/images"
                normalized_result = self._add_images_to_result(
                    normalized_result, pdf_bytes, storage_path=image_storage_path
                )

            logger.info(
                f"Successfully processed document {doc_id} through Docling parser service"
            )
            return normalized_result

        except DocumentParsingError:
            # Re-raise our custom exceptions as-is
            raise
        except Exception as e:
            import traceback

            stacktrace = traceback.format_exc()
            msg = f"Docling REST parser failed unexpectedly for document {doc_id}: {e}"
            logger.error(f"{msg}\n{stacktrace}")
            # Unexpected errors default to transient (might be temporary issue)
            raise DocumentParsingError(msg, is_transient=True)

    def _normalize_response(self, response_data: dict[str, Any]) -> dict[str, Any]:
        """
        Normalize the response to ensure compatibility with both snake_case and camelCase field names.

        Args:
            response_data: The raw response data from the microservice

        Returns:
            A normalized response with all required fields
        """
        # Dictionary of field name mappings: camelCase -> snake_case
        field_mappings = {
            "pawlsFileContent": "pawls_file_content",
            "pageCount": "page_count",
            "docLabels": "doc_labels",
            "labelledText": "labelled_text",
        }

        # Create a normalized response with both snake_case and camelCase keys
        normalized_data = {}

        for key, value in response_data.items():
            normalized_key = field_mappings.get(key, key)
            normalized_data[normalized_key] = value

            # If we have a snake_case name but the response used camelCase,
            # ensure we also include the camelCase name for backwards compatibility
            if key != normalized_key:
                normalized_data[key] = value

        return normalized_data

    def _add_images_to_result(
        self,
        result: dict[str, Any],
        pdf_bytes: bytes,
        storage_path: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Extract images from the PDF and add them to the parsed result.

        This post-processes the Docling microservice response to add image tokens
        to the PAWLs tokens array (unified token model) and image references to
        figure/image annotations.

        Args:
            result: The normalized response from the Docling microservice.
            pdf_bytes: The raw PDF bytes for image extraction.
            storage_path: Base path for storing images (e.g., "documents/123/images").
                         If provided, images are saved to storage and referenced by path.
                         If None, images are embedded as base64 (not recommended).

        Returns:
            The result dict with image tokens added to pawls_file_content tokens[].
        """
        try:
            logger.info("Extracting images from PDF for LLM consumption...")

            # Extract embedded images from PDF
            images_by_page = extract_images_from_pdf(
                pdf_bytes,
                min_width=self.min_image_width,
                min_height=self.min_image_height,
                image_format=self.image_format,
                jpeg_quality=self.image_quality,
                storage_path=storage_path,
            )

            total_images = sum(len(imgs) for imgs in images_by_page.values())
            logger.info(
                f"Extracted {total_images} image tokens from {len(images_by_page)} pages"
            )

            # Add images as tokens to PAWLs pages (unified token model)
            pawls_pages = result.get("pawls_file_content", [])

            # Track token offsets per page for image token indices
            image_token_offsets: dict[int, int] = {}

            for page_idx, page_images in images_by_page.items():
                # Defensive checks for malformed microservice data
                if not isinstance(pawls_pages, list) or page_idx >= len(pawls_pages):
                    logger.warning(f"Invalid page index {page_idx} for pawls_pages")
                    continue

                page = pawls_pages[page_idx]
                if not isinstance(page, dict):
                    logger.warning(f"Invalid page data at index {page_idx}")
                    continue

                if page_images:
                    # Get existing token count as offset for image indices
                    if "tokens" not in page:
                        page["tokens"] = []

                    token_offset = len(page["tokens"])
                    image_token_offsets[page_idx] = token_offset

                    # Add image tokens to the tokens array
                    for img_token in page_images:
                        # Convert to unified token format with required fields
                        unified_token: PawlsTokenPythonType = {
                            "x": img_token["x"],
                            "y": img_token["y"],
                            "width": img_token["width"],
                            "height": img_token["height"],
                            "text": "",  # Required field, empty for images
                            "is_image": True,
                            "format": img_token.get("format", "jpeg"),
                            "content_hash": img_token.get("content_hash"),
                            "original_width": img_token.get("original_width"),
                            "original_height": img_token.get("original_height"),
                            "image_type": img_token.get("image_type"),
                        }

                        # Copy image path if present
                        if "image_path" in img_token:
                            unified_token["image_path"] = img_token["image_path"]

                        page["tokens"].append(unified_token)

            # Get page dimensions for cropping
            page_dims: dict[int, tuple[float, float]] = {}
            for page_idx, page in enumerate(pawls_pages):
                page_info = page.get("page", {})
                width = float(page_info.get("width", 612))
                height = float(page_info.get("height", 792))
                page_dims[page_idx] = (width, height)

            # Process annotations to add image references for figure/image types
            annotations = result.get("labelled_text", [])
            for annotation in annotations:
                label = annotation.get("annotationLabel", "").lower()
                if label in ["figure", "image", "chart", "diagram", "picture"]:
                    self._add_image_refs_to_annotation(
                        annotation,
                        pdf_bytes,
                        image_token_offsets,
                        page_dims,
                        pawls_pages,
                        storage_path=storage_path,
                    )

            # Log summary
            annotations_with_images = sum(
                1
                for a in annotations
                if a.get("annotation_json", {})
                .get(str(a.get("page", 0)), {})
                .get("tokensJsons")
            )
            logger.info(
                f"Added image tokens to result: {total_images} total image tokens, "
                f"{annotations_with_images} annotations with image token refs"
            )

        except Exception as e:
            logger.warning(f"Failed to extract images from PDF: {e}")

        return result

    def _add_image_refs_to_annotation(
        self,
        annotation: dict[str, Any],
        pdf_bytes: bytes,
        image_token_offsets: dict[int, int],
        page_dims: dict[int, tuple[float, float]],
        pawls_pages: list[dict[str, Any]],
        storage_path: Optional[str] = None,
    ) -> None:
        """
        Add image token references to an annotation that represents a figure/image.

        In the unified token model, images are stored in the tokens[] array with
        is_image=True. This method adds tokensJsons references to image tokens
        and sets content_modalities=["IMAGE"] on annotations with image content.

        Args:
            annotation: The annotation dict to modify.
            pdf_bytes: PDF bytes for cropping if needed.
            image_token_offsets: Dict mapping page_idx to the token index where
                                 image tokens start on that page.
            page_dims: Page dimensions dict.
            pawls_pages: PAWLs pages list (may be modified to add cropped image tokens).
            storage_path: Base path for storing cropped images.
        """
        page_idx = annotation.get("page", 0)
        annotation_json = annotation.get("annotation_json", {})
        page_data = annotation_json.get(str(page_idx), {})

        bounds = page_data.get("bounds", {})
        if not bounds:
            return

        # Find image tokens in the tokens array that overlap with this annotation
        token_offset = image_token_offsets.get(page_idx, 0)
        image_token_refs = self._find_images_in_bounds(
            bounds, page_idx, pawls_pages, token_offset
        )

        # If no embedded image found, crop the region and add as new token
        if not image_token_refs:
            page_width, page_height = page_dims.get(page_idx, (612, 792))

            # Count image tokens for storage filename indexing
            img_idx = 0
            if page_idx < len(pawls_pages) and isinstance(pawls_pages[page_idx], dict):
                for token in pawls_pages[page_idx].get("tokens", []):
                    if token.get("is_image"):
                        img_idx += 1

            cropped_image = crop_image_from_pdf(
                pdf_bytes,
                page_idx,
                bounds,
                page_width,
                page_height,
                image_format=self.image_format,
                jpeg_quality=self.image_quality,
                dpi=self.image_dpi,
                storage_path=storage_path,
                img_idx=img_idx,
            )
            if cropped_image and page_idx < len(pawls_pages):
                if "tokens" not in pawls_pages[page_idx]:
                    pawls_pages[page_idx]["tokens"] = []

                # Convert cropped image to unified token format
                unified_token: PawlsTokenPythonType = {
                    "x": cropped_image["x"],
                    "y": cropped_image["y"],
                    "width": cropped_image["width"],
                    "height": cropped_image["height"],
                    "text": "",  # Required field, empty for images
                    "is_image": True,
                    "format": cropped_image.get("format", "jpeg"),
                    "content_hash": cropped_image.get("content_hash"),
                    "original_width": cropped_image.get("original_width"),
                    "original_height": cropped_image.get("original_height"),
                    "image_type": cropped_image.get("image_type", "cropped"),
                }

                # Copy image path if present
                if "image_path" in cropped_image:
                    unified_token["image_path"] = cropped_image["image_path"]

                new_token_idx = len(pawls_pages[page_idx]["tokens"])
                pawls_pages[page_idx]["tokens"].append(unified_token)
                image_token_refs = [
                    {"pageIndex": page_idx, "tokenIndex": new_token_idx}
                ]
                logger.debug(
                    f"Cropped image token for annotation on page {page_idx} "
                    f"at token index {new_token_idx}"
                )

        # Add image token refs to the annotation's tokensJsons
        if image_token_refs:
            # Get existing tokensJsons or create empty list
            existing_tokens = page_data.get("tokensJsons", [])
            # Add image token references
            existing_tokens.extend(image_token_refs)
            page_data["tokensJsons"] = existing_tokens
            annotation_json[str(page_idx)] = page_data
            annotation["annotation_json"] = annotation_json
            # Mark annotation as containing image content
            annotation["content_modalities"] = ["IMAGE"]

    def _find_images_in_bounds(
        self,
        bounds: BoundingBoxPythonType,
        page_idx: int,
        pawls_pages: list[dict[str, Any]],
        token_offset: int,
    ) -> list[TokenIdPythonType]:
        """
        Find image tokens that overlap with the given bounding box.

        In the unified token model, images are stored in the tokens[] array
        with is_image=True. This method searches through tokens starting from
        token_offset (where image tokens begin) to find overlapping images.

        Args:
            bounds: The annotation bounding box.
            page_idx: Page index (0-based).
            pawls_pages: The PAWLs pages list containing tokens.
            token_offset: The token index where image tokens start on this page.

        Returns:
            List of TokenIdPythonType references for overlapping image tokens.
        """
        if not isinstance(pawls_pages, list) or page_idx >= len(pawls_pages):
            return []

        page = pawls_pages[page_idx]
        if not isinstance(page, dict):
            return []

        page_tokens = page.get("tokens", [])
        if not page_tokens or token_offset >= len(page_tokens):
            return []

        token_refs: list[TokenIdPythonType] = []
        ann_left = float(bounds.get("left", 0))
        ann_top = float(bounds.get("top", 0))
        ann_right = float(bounds.get("right", 0))
        ann_bottom = float(bounds.get("bottom", 0))

        # Search through tokens starting from token_offset
        for token_idx in range(token_offset, len(page_tokens)):
            token = page_tokens[token_idx]

            # Only consider image tokens
            if not token.get("is_image"):
                continue

            img_left = float(token["x"])
            img_top = float(token["y"])
            img_right = img_left + float(token["width"])
            img_bottom = img_top + float(token["height"])

            # Check for overlap
            if (
                ann_left < img_right
                and ann_right > img_left
                and ann_top < img_bottom
                and ann_bottom > img_top
            ):
                token_refs.append({"pageIndex": page_idx, "tokenIndex": token_idx})

        return token_refs
