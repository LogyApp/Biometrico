import os
import base64
import logging

logger = logging.getLogger(__name__)

_private_key_raw: str = ""
_public_key_b64url: str = ""
VAPID_EMAIL: str = "seguimientologyser@gmail.com"


def vapid_public_key() -> str:
    return _public_key_b64url


def vapid_private_key() -> str:
    return _private_key_raw


def init_vapid() -> None:
    global _private_key_raw, _public_key_b64url

    env_raw = os.environ.get("VAPID_PRIVATE_RAW", "").strip()
    env_pub = os.environ.get("VAPID_PUBLIC_KEY",  "").strip()
    if env_raw and env_pub:
        _private_key_raw   = env_raw
        _public_key_b64url = env_pub
        logger.info("✅ VAPID keys loaded from env vars.")
        return

    keys = _generate_keys()
    _private_key_raw   = keys["raw"]
    _public_key_b64url = keys["pub"]

    logger.warning(
        "⚠️  VAPID keys generated fresh — they will change on the next restart "
        "and break existing push subscriptions.\n"
        "Fix this permanently by adding these two env vars to Cloud Run:\n"
        "  VAPID_PRIVATE_RAW = %s\n"
        "  VAPID_PUBLIC_KEY  = %s",
        _private_key_raw,
        _public_key_b64url,
    )


def _generate_keys() -> dict:
    from cryptography.hazmat.primitives.asymmetric.ec import generate_private_key, SECP256R1
    from cryptography.hazmat.primitives.serialization import (
        Encoding, PublicFormat,
    )
    priv    = generate_private_key(SECP256R1())
    d_bytes = priv.private_numbers().private_value.to_bytes(32, "big")
    raw     = base64.urlsafe_b64encode(d_bytes).rstrip(b"=").decode()
    raw_pub = priv.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    pub     = base64.urlsafe_b64encode(raw_pub).rstrip(b"=").decode()
    return {"raw": raw, "pub": pub}
