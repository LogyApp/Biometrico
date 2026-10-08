import enum


class DocumentType(str, enum.Enum):
    CC  = "CC"
    CE  = "CE"
    TI  = "TI"
    PP  = "PP"
    NIT = "NIT"


class PersonStatus(str, enum.Enum):
    active   = "active"
    inactive = "inactive"
    blocked  = "blocked"


class AccessDirection(str, enum.Enum):
    entry = "entry"
    exit  = "exit"
    both  = "both"


class EventType(str, enum.Enum):
    entry       = "entry"
    exit        = "exit"
    lunch       = "lunch"
    breakfast   = "breakfast"
    break_start = "break_start"
    break_end   = "break_end"
    transfer    = "transfer"
    manual      = "manual"


class AccessResult(str, enum.Enum):
    authorized = "authorized"
    denied     = "denied"
    not_found  = "not_found"
    error      = "error"
