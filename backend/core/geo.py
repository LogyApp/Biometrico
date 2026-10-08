from math import radians, sin, cos, sqrt, atan2

EARTH_RADIUS_KM = 6371


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    d_lat = radians(lat2 - lat1)
    d_lng = radians(lng2 - lng1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lng / 2) ** 2
    return EARTH_RADIUS_KM * 2 * atan2(sqrt(a), sqrt(1 - a))
