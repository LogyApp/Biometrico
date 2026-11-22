import os
import time
import logging
from typing import Optional
from core.config import settings

logger = logging.getLogger(__name__)

_storage_client = None


def _get_storage_client():
    global _storage_client
    if _storage_client is None:
        from google.cloud import storage
        _storage_client = storage.Client()
    return _storage_client


def upload_ticket_evidence(
    ticket: str,
    file_bytes: bytes,
    filename: str,
    content_type: Optional[str] = None,
) -> str:
    """Sube la evidencia del ticket al bucket de recursos corporativos de Google Cloud Storage.
    Mismo bucket y convención que el módulo de tickets en Logyser ERP:
    evidencia_tickets/<Ticket>.Evidencia.<timestamp>.<ext>
    """
    ext = os.path.splitext(filename)[1].lower() or ".jpg"
    timestamp = int(time.time() * 1000)
    blob_name = f"{settings.tickets_prefix}/{ticket}.Evidencia.{timestamp}{ext}"

    try:
        client = _get_storage_client()
        bucket = client.bucket(settings.tickets_bucket)
        blob = bucket.blob(blob_name)
        blob.upload_from_string(
            file_bytes,
            content_type=content_type or "application/octet-stream",
        )
        url = f"https://storage.googleapis.com/{settings.tickets_bucket}/{blob_name}"
        logger.info("Evidencia de ticket %s subida a %s", ticket, url)
        return url
    except Exception as exc:
        logger.error("Error al subir evidencia de ticket %s: %s", ticket, exc)
        raise RuntimeError("No se pudo guardar la evidencia adjunta") from exc
