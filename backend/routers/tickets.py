import logging
from typing import Optional
from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_session
from core.limiter import limiter
from fastapi import Request
from repositories.tickets import TicketRepository, MOTIVOS_BIOMETRICO
from repositories.vinculacion import VinculacionRepository
from services.tickets import upload_ticket_evidence
from schemas.tickets import CalificarTicketRequest, CalificarTicketResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tickets", tags=["tickets"])


@router.get("/modulos")
async def get_modulos(
    session: AsyncSession = Depends(get_session),
) -> list[str]:
    repo = TicketRepository(session)
    return await repo.get_modulos()


@router.get("/motivos")
async def get_motivos(
    modulo: str = "Biometrico",
    session: AsyncSession = Depends(get_session),
) -> list[str]:
    repo = TicketRepository(session)
    return await repo.get_motivos(modulo)


@router.get("/telefono/{identificacion}")
async def get_worker_phone(
    identificacion: str,
    session: AsyncSession = Depends(get_session),
) -> dict:
    repo = TicketRepository(session)
    phone = await repo.get_worker_phone(identificacion)
    return {"telefono": phone or ""}


@router.post("/crear")
@limiter.limit("10/minute")
async def crear_ticket(
    request: Request,
    identificacion: str = Form(...),
    operacion: str = Form(...),
    modulo: str = Form("Biometrico"),
    motivo: str = Form(...),
    descripcion: str = Form(...),
    telefono: Optional[str] = Form(None),
    evidencia: Optional[UploadFile] = File(None),
    session: AsyncSession = Depends(get_session),
) -> dict:
    ident_clean = identificacion.strip()
    op_clean = operacion.strip()
    mod_clean = (modulo or "Biometrico").strip()
    mot_clean = motivo.strip()
    desc_clean = descripcion.strip()

    if not ident_clean or not op_clean or not mot_clean or not desc_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Identificación, Operación, Motivo y Descripción son obligatorios.",
        )

    # Validar que el trabajador exista
    try:
        v_repo = VinculacionRepository(session)
        worker_id_num = int(ident_clean)
        worker = await v_repo.get_worker_any_state(worker_id_num)
        if not worker:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Trabajador no encontrado en el sistema.",
            )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La identificación debe ser numérica.",
        )

    # Subir evidencia si se adjuntó
    evidencia_url = None
    if evidencia and evidencia.filename:
        content = await evidencia.read()
        if len(content) > 15 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El archivo adjunto no puede superar 15 MB.",
            )
        try:
            import uuid
            ticket_temp = uuid.uuid4().hex[:8]
            evidencia_url = upload_ticket_evidence(
                ticket=ticket_temp,
                file_bytes=content,
                filename=evidencia.filename,
                content_type=evidencia.content_type,
            )
        except Exception as exc:
            logger.error("Error al subir evidencia: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error al subir el archivo adjunto: {exc}",
            )

    repo = TicketRepository(session)
    try:
        ticket_code = await repo.create_ticket(
            operacion=op_clean,
            solicitante=ident_clean,
            modulo=mod_clean,
            motivo=mot_clean,
            descripcion=desc_clean,
            telefono=telefono,
            evidencia_url=evidencia_url,
        )
        await session.commit()
        return {"ok": True, "ticket": ticket_code, "evidencia": evidencia_url}
    except Exception as exc:
        await session.rollback()
        logger.error("Error al crear ticket: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al registrar el ticket: {exc}",
        )


@router.get("/mis-tickets/{identificacion}")
async def get_mis_tickets(
    identificacion: str,
    session: AsyncSession = Depends(get_session),
) -> dict:
    repo = TicketRepository(session)
    return await repo.get_mis_tickets(identificacion)


@router.post("/{ticket}/calificar", response_model=CalificarTicketResponse)
async def calificar_ticket(
    ticket: str,
    payload: CalificarTicketRequest,
    session: AsyncSession = Depends(get_session),
) -> CalificarTicketResponse:
    repo = TicketRepository(session)
    try:
        ok = await repo.calificar_ticket(
            ticket=ticket,
            solicitante=payload.identificacion,
            satisfaccion=payload.satisfaccion,
            sugerencia=payload.sugerencia,
        )
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Este ticket ya fue calificado o no está pendiente por calificar.",
            )
        await session.commit()
        return CalificarTicketResponse(
            ok=True,
            ticket=ticket,
            message="¡Gracias por tu calificación! Tu opinión nos ayuda a mejorar.",
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as exc:
        await session.rollback()
        logger.error("Error al calificar ticket %s: %s", ticket, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al registrar la calificación: {exc}",
        )
