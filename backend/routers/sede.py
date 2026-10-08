from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_session
from core.exceptions import WorkerNotFoundError
from schemas.sede import SedeListResponse, SedeOut, OrigenCheckResponse
from repositories.sede import SedeRepository
from repositories.vinculacion import VinculacionRepository

router = APIRouter(prefix="/api/sedes", tags=["sedes"])


# Debe ir ANTES de /{identificacion}: si no, "origen-check" se intenta leer
# como identificación y falla con 422 antes de llegar a esta ruta.
@router.get("/origen-check", response_model=OrigenCheckResponse)
async def check_origen(lat: float, lng: float, session: AsyncSession = Depends(get_session)) -> OrigenCheckResponse:
    sede, distancia_km, dentro = await SedeRepository(session).find_nearest(lat, lng)
    return OrigenCheckResponse(
        dentro_de_rango=dentro,
        distancia_km=distancia_km,
        sede_cercana=sede.lugar if sede else None,
    )


@router.get("/{identificacion}", response_model=SedeListResponse)
async def list_sedes(identificacion: int, session: AsyncSession = Depends(get_session)) -> SedeListResponse:
    worker = await VinculacionRepository(session).get_active_worker(identificacion)
    if not worker:
        raise WorkerNotFoundError()

    repo  = SedeRepository(session)
    sedes = await repo.list_usable(regional=worker.regional)
    return SedeListResponse(sedes=[
        SedeOut(
            id=s.id,
            regional=s.regional,
            lugar=s.lugar,
            latitud=float(s.latitud),
            longitud=float(s.longitud),
        )
        for s in sedes
    ])
