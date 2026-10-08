from fastapi import HTTPException, status


class WorkerNotFoundError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail="Trabajador no encontrado o no activo en el sistema")


class FaceNotDetectedError(HTTPException):
    def __init__(self, detail: str = "No se detectó un rostro en el frame"):
        super().__init__(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


class InvalidFrameError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Frame inválido o corrupto")


class EmbeddingNotFoundError(HTTPException):
    def __init__(self):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail="No hay datos biométricos registrados para este trabajador")


class InvalidImageError(HTTPException):
    def __init__(self, detail: str = "Imagen inválida o corrupta"):
        super().__init__(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


class AvatarStorageError(HTTPException):
    def __init__(self, detail: str = "El almacenamiento de fotos no está disponible en este momento"):
        super().__init__(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)


class InvalidCredentialsError(HTTPException):
    def __init__(self, detail: str = "Los datos del documento no coinciden con los registrados en el sistema"):
        super().__init__(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


class ModelNotReadyError(HTTPException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El sistema de reconocimiento facial se está preparando. Intenta de nuevo en unos segundos.",
        )


class MovementStaleConflictError(HTTPException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail="MOVEMENT_STALE_AUTO_COMPLETED",
        )


class MultipleFacesError(HTTPException):
    def __init__(self):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Se detectaron múltiples rostros. Solo debe haber una persona frente a la cámara.",
        )


class FaceQualityError(HTTPException):
    def __init__(self, detail: str = "La calidad del rostro capturado no es suficiente"):
        super().__init__(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)
