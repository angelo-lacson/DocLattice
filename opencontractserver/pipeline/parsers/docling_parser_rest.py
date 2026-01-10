import base64
import logging
from typing import Any, Optional

import requests
from django.conf import settings
from django.core.files.storage import default_storage
from requests.exceptions import ConnectionError, RequestException, Timeout

from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.parser import BaseParser
from opencontractserver.types.dicts import (
    BoundingBoxPythonType,
    ImageIdPythonType,
    OpenContractDocExport,
    PawlsImageTokenPythonType,
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
                logger.error(
                    f"Request to Docling parser service timed out after {self.request_timeout} seconds"
                )
                return None
            except ConnectionError:
                logger.error(
                    f"Failed to connect to Docling parser service at {self.service_url}"
                )
                return None
            except RequestException as e:
                logger.error(f"Request to Docling parser service failed: {e}")
                if hasattr(e, "response") and e.response:
                    logger.error(f"Response content: {e.response.text}")
                return None

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

        except Exception as e:
            import traceback

            stacktrace = traceback.format_exc()
            logger.error(f"Docling REST parser failed: {e}\n{stacktrace}")
            return None

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
        to the PAWLs data and image references to figure/image annotations.

        Args:
            result: The normalized response from the Docling microservice.
            pdf_bytes: The raw PDF bytes for image extraction.
            storage_path: Base path for storing images (e.g., "documents/123/images").
                         If provided, images are saved to storage and referenced by path.
                         If None, images are embedded as base64 (not recommended).

        Returns:
            The result dict with images added to pawls_file_content.
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
                f"Extracted {total_images} images from {len(images_by_page)} pages"
            )

            # Add images to PAWLs pages
            pawls_pages = result.get("pawls_file_content", [])
            for page_idx, page_images in images_by_page.items():
                if page_idx < len(pawls_pages) and page_images:
                    pawls_pages[page_idx]["images"] = page_images

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
                if label in ["figure", "image", "chart", "diagram"]:
                    self._add_image_refs_to_annotation(
                        annotation,
                        pdf_bytes,
                        images_by_page,
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
                .get("imagesJsons")
            )
            logger.info(
                f"Added images to result: {total_images} total images, "
                f"{annotations_with_images} annotations with image refs"
            )

        except Exception as e:
            logger.warning(f"Failed to extract images from PDF: {e}")

        return result

    def _add_image_refs_to_annotation(
        self,
        annotation: dict[str, Any],
        pdf_bytes: bytes,
        images_by_page: dict[int, list[PawlsImageTokenPythonType]],
        page_dims: dict[int, tuple[float, float]],
        pawls_pages: list[dict[str, Any]],
        storage_path: Optional[str] = None,
    ) -> None:
        """
        Add image references to an annotation that represents a figure/image.

        Args:
            annotation: The annotation dict to modify.
            pdf_bytes: PDF bytes for cropping if needed.
            images_by_page: Pre-extracted images by page.
            page_dims: Page dimensions dict.
            pawls_pages: PAWLs pages list (may be modified to add cropped images).
            storage_path: Base path for storing cropped images.
        """
        page_idx = annotation.get("page", 0)
        annotation_json = annotation.get("annotation_json", {})
        page_data = annotation_json.get(str(page_idx), {})

        bounds = page_data.get("bounds", {})
        if not bounds:
            return

        page_images = images_by_page.get(page_idx, [])
        image_refs = self._find_images_in_bounds(bounds, page_idx, page_images)

        # If no embedded image found, crop the region
        if not image_refs:
            page_width, page_height = page_dims.get(page_idx, (612, 792))
            # Get the next image index for this page to use in storage filename
            # Defensive check: ensure page exists and is a dict before accessing
            current_img_count = 0
            if page_idx < len(pawls_pages) and isinstance(pawls_pages[page_idx], dict):
                current_img_count = len(pawls_pages[page_idx].get("images", []))
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
                img_idx=current_img_count,
            )
            if cropped_image and page_idx < len(pawls_pages):
                if "images" not in pawls_pages[page_idx]:
                    pawls_pages[page_idx]["images"] = []
                img_idx = len(pawls_pages[page_idx]["images"])
                pawls_pages[page_idx]["images"].append(cropped_image)
                image_refs = [{"pageIndex": page_idx, "imageIndex": img_idx}]
                logger.debug(f"Cropped image for annotation on page {page_idx}")

        # Add image refs to the annotation
        if image_refs:
            page_data["imagesJsons"] = image_refs
            annotation_json[str(page_idx)] = page_data
            annotation["annotation_json"] = annotation_json

    def _find_images_in_bounds(
        self,
        bounds: BoundingBoxPythonType,
        page_idx: int,
        page_images: list[PawlsImageTokenPythonType],
    ) -> list[ImageIdPythonType]:
        """
        Find images that overlap with the given bounding box.

        Args:
            bounds: The annotation bounding box.
            page_idx: Page index (0-based).
            page_images: List of image tokens on this page.

        Returns:
            List of ImageIdPythonType references for overlapping images.
        """
        if not page_images:
            return []

        image_refs: list[ImageIdPythonType] = []
        ann_left = float(bounds.get("left", 0))
        ann_top = float(bounds.get("top", 0))
        ann_right = float(bounds.get("right", 0))
        ann_bottom = float(bounds.get("bottom", 0))

        for img_idx, img_token in enumerate(page_images):
            img_left = float(img_token["x"])
            img_top = float(img_token["y"])
            img_right = img_left + float(img_token["width"])
            img_bottom = img_top + float(img_token["height"])

            # Check for overlap
            if (
                ann_left < img_right
                and ann_right > img_left
                and ann_top < img_bottom
                and ann_bottom > img_top
            ):
                image_refs.append({"pageIndex": page_idx, "imageIndex": img_idx})

        return image_refs
