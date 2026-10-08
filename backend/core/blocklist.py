import logging

logger = logging.getLogger(__name__)

BLOCKED_IDENTIFICACIONES: frozenset[int] = frozenset({
    1037674223,
    19445642,
    32348736,
})


def is_blocked(identificacion: int) -> bool:
    blocked = identificacion in BLOCKED_IDENTIFICACIONES
    if blocked:
        logger.warning(
            "blocked_identificacion_attempt",
            extra={"extra_fields": {"identificacion": identificacion}},
        )
    return blocked
