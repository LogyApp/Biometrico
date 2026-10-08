from datetime import datetime, time, timedelta

# Entradas antes de esta hora se consideran turno día; desde esta hora en
# adelante (inclusive) se consideran turno noche.
NIGHT_SHIFT_START_HOUR = 18

AUTO_CLOSE_MOTIVO = "Cierre automático del sistema: turno prolongado sin registrar salida."


def auto_close_deadline(entrada: datetime) -> datetime:
    """Calcula el momento en que un turno abierto se considera abandonado.

    Turno día (entrada antes de las 6:00 pm): se considera abandonado a las
    11:59:59 pm del MISMO día de la entrada — no a medianoche del día
    siguiente, para que el registro de salida quede en la base de datos con
    la misma fecha que la entrada, en vez de aparecer un día después.
    Turno noche (entrada 6:00 pm o después): el turno sí cruza la
    medianoche legítimamente, así que se considera abandonado al mediodía
    del día siguiente a la entrada, para no cortar un turno que apenas
    empieza.

    Usada tanto por el cierre automático periódico (AutoCloseService) como
    por MarcacionRepository.create() para distinguir un reintento de check-in
    (mismo turno, todavía dentro de su ventana normal) de un turno viejo
    realmente abandonado.
    """
    if entrada.hour < NIGHT_SHIFT_START_HOUR:
        return datetime.combine(entrada.date(), time(23, 59, 59))
    next_day = entrada.date() + timedelta(days=1)
    return datetime.combine(next_day, time(12, 0))
