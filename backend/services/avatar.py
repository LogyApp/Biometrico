import cv2
from core.config import settings
from core.exceptions import InvalidImageError, AvatarStorageError
from services.face import decode_frame

_AVATAR_SIZE = 512
_JPEG_QUALITY = 85

_storage_client = None


def _get_bucket():
    global _storage_client
    from google.cloud import storage

    if _storage_client is None:
        _storage_client = storage.Client()
    return _storage_client.bucket(settings.avatar_bucket)


def _resize_square(img):
    h, w = img.shape[:2]
    side = min(h, w)
    top = (h - side) // 2
    left = (w - side) // 2
    cropped = img[top:top + side, left:left + side]
    return cv2.resize(cropped, (_AVATAR_SIZE, _AVATAR_SIZE), interpolation=cv2.INTER_AREA)


def upload_avatar(identificacion: int, photo_b64: str) -> str:
    try:
        img = decode_frame(photo_b64)
    except ValueError:
        raise InvalidImageError()

    square = _resize_square(img)
    ok, buf = cv2.imencode(".jpg", square, [cv2.IMWRITE_JPEG_QUALITY, _JPEG_QUALITY])
    if not ok:
        raise InvalidImageError("No se pudo procesar la imagen")

    blob_name = f"{settings.avatar_prefix}/{identificacion}.jpg"

    try:
        bucket = _get_bucket()
        blob = bucket.blob(blob_name)
        blob.cache_control = "public, max-age=300"
        blob.upload_from_string(buf.tobytes(), content_type="image/jpeg")
    except Exception as exc:
        raise AvatarStorageError() from exc

    return f"https://storage.googleapis.com/{settings.avatar_bucket}/{blob_name}"
