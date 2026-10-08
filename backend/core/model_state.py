ready = False
error: str | None = None


def set_ready() -> None:
    global ready
    ready = True


def set_error(message: str) -> None:
    global error
    error = message
