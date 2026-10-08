import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import cv2
from insightface.app import FaceAnalysis
from core.config import settings
from core import model_state

_analyzer: FaceAnalysis | None = None
_inference_pool = ThreadPoolExecutor(
    max_workers=settings.face_inference_workers,
    thread_name_prefix="face-inference",
)


class ModelNotReady(Exception):
    pass


def get_analyzer() -> FaceAnalysis:
    global _analyzer
    if _analyzer is None:
        det = settings.insightface_det_size
        _analyzer = FaceAnalysis(
            name=settings.insightface_model,
            providers=["CPUExecutionProvider"],
        )
        _analyzer.prepare(ctx_id=0, det_size=(det, det))
    return _analyzer


def decode_frame(b64_data: str) -> np.ndarray:
    if "," in b64_data:
        b64_data = b64_data.split(",", 1)[1]
    raw = base64.b64decode(b64_data)
    buf = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Frame inválido o corrupto")
    return img


# Minimum face bounding-box area as a fraction of the total frame area.
# Reject tiny faces that are likely photos-of-photos or distant captures.
MIN_FACE_AREA_RATIO = 0.02

def extract_embedding(img: np.ndarray) -> np.ndarray:
    faces = get_analyzer().get(img)
    if not faces:
        raise ValueError("No se detectó un rostro en el frame")
    if len(faces) > 1:
        raise ValueError("Se detectaron múltiples rostros. Solo debe haber una persona frente a la cámara.")
    face = faces[0]
    # Quality gate: reject faces that are too small (far away or photo-of-photo)
    bbox = face.bbox
    face_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
    frame_area = img.shape[0] * img.shape[1]
    if frame_area > 0 and (face_area / frame_area) < MIN_FACE_AREA_RATIO:
        raise ValueError("El rostro es demasiado pequeño. Acércate más a la cámara.")
    return face.embedding


async def extract_embedding_async(img: np.ndarray) -> np.ndarray:
    if not model_state.ready:
        raise ModelNotReady()
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_inference_pool, extract_embedding, img)


def average_embeddings(embeddings: list[np.ndarray]) -> np.ndarray:
    avg = np.mean(np.stack(embeddings, axis=0), axis=0)
    norm = np.linalg.norm(avg)
    if norm == 0:
        raise ValueError("Embedding resultante con norma cero")
    return avg / norm


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a_n, b_n = np.linalg.norm(a), np.linalg.norm(b)
    if a_n == 0 or b_n == 0:
        return 0.0
    return float(np.dot(a, b) / (a_n * b_n))


def to_list(embedding: np.ndarray) -> list[float]:
    return embedding.tolist()


def from_list(values: list[float]) -> np.ndarray:
    return np.array(values, dtype=np.float32)
