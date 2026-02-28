import logging

logger = logging.getLogger(__name__)

# from gliner import GLiNER

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # model = GLiNER.from_pretrained("urchade/gliner_base")
    logger.info("SKIPPING GLINER PRELOAD")
