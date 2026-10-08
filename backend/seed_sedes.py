import asyncio
from sqlalchemy import select
from core.database import AsyncSessionFactory, init_db
from models.sede import FacialSede

SEDES = [
    ("ANTIOQUIA", "Administracion", 6.2401, -75.5917),
    ("ANTIOQUIA", "CasaLuker Apartadó", None, None),
    ("ANTIOQUIA", "Cedi Vegas", 6.1691, -75.5987),
    ("ANTIOQUIA", "Italcol La Estrella", 6.1566, -75.6337),
    ("ANTIOQUIA", "Italcol Rionegro", None, None),
    ("ANTIOQUIA", "Pepsico DC Hub", 6.1592, -75.6167),
    ("ANTIOQUIA", "Pepsico Guarne", 6.2331, -74.4123),
    ("CARIBE", "Cedi Caribe", 10.8315, -74.7695),
    ("CARIBE", "Gerfor B/qlla", 10.9534, -74.835),
    ("CARIBE", "Italcol B/quilla", 10.962, -74.8376),
    ("CARIBE", "Pastor Julio Valledupar", 10.434, -73.2421),
    ("CARIBE", "Pepsico B/quilla", 10.9413, -74.84),
    ("CARIBE", "Pepsico Cartagena", 10.3756, -75.5037),
    ("CARIBE", "Pepsico Monteria", 8.7305, -75.8447),
    ("CARIBE", "Pepsico Santa Marta", 11.1890, -74.2140),
    ("CENTRO", "CasaLuker Bogotá", 4.6387, -74.1197),
    ("CENTRO", "CasaLuker Funza", 4.7392, -74.158),
    ("CENTRO", "CasaLuker Latam", None, None),
    ("CENTRO", "Cedi Av 68", 4.6311, -74.1222),
    ("CENTRO", "Cedi Funza", 4.7001, -74.1852),
    ("CENTRO", "Cedi Latam", 4.7801, -74.1813),
    ("CENTRO", "Éxito Satelites", None, None),
    ("CENTRO", "Italcol Mosquera", 4.7076, -74.2509),
    ("CENTRO", "Italcol Palermo", None, None),
    ("CENTRO", "Italcol Villavicencio", None, None),
    ("CENTRO", "Pepsico Innova", 4.7810, -74.1732),
    ("NORTE DE SANTANDER", "Casaluker Cúcuta", 7.9073, -72.4997),
    ("NORTE DE SANTANDER", "D1 Cúcuta", 7.8742, -72.4755),
    ("NORTE DE SANTANDER", "Éxito Av Quinta", 7.8851, -72.5036),
    ("NORTE DE SANTANDER", "Éxito San Mateo", 7.8824, -72.4883),
    ("NORTE DE SANTANDER", "Italcol Cucuta", 7.9062, -72.5007),
    ("NORTE DE SANTANDER", "Pastor Julio Cúcuta", 7.9088, -72.503),
    ("PACKING", "Packing", 4.9516, -73.9416),
    ("RISARALDA", "Cedi Pereira", 4.8044, -75.8417),
    ("RISARALDA", "Italcol Pereira", 4.8304, -75.6982),
    ("RISARALDA", "Pepsico Pereira", 4.8293, -75.7013),
    ("SANTANDER", "CasaLuker Bucaramanga", 7.0846, -73.1651),
    ("SANTANDER", "Cedi Bmanga", 7.0861, -73.1708),
    ("SANTANDER", "D1 Bucaramanga", 7.103, -73.1934),
    ("SANTANDER", "Éxito Barranca", None, None),
    ("SANTANDER", "Éxito Ocaña", None, None),
    ("SANTANDER", "Italcol Giron", None, None),
    ("SANTANDER", "Mas por Menos Bmanga", 7.0902, -73.1292),
    ("SANTANDER", "Pastor Julio Bmanga", 7.0846, -73.1434),
    ("SANTANDER", "Pepsico Bmanga", 7.0633, -73.1593),
    ("SANTANDER", "Saceites Bmanga", None, None),
    ("VALLE", "Cedi Calima", 3.4798, -76.5041),
    ("VALLE", "Cedi Yumbo", 3.4981, -76.5036),
    ("VALLE", "Harinera del Valle", 3.4728, -76.5053),
    ("VALLE", "Italcol Murano", 3.5129, -76.5146),
    ("VALLE", "Pepsico Cali", 3.4606, -76.5041),
]


async def main():
    await init_db()
    async with AsyncSessionFactory() as session:
        existing = await session.execute(select(FacialSede.regional, FacialSede.lugar))
        existing_keys = {(r, l) for r, l in existing.all()}

        inserted = 0
        for regional, lugar, lat, lng in SEDES:
            if (regional, lugar) in existing_keys:
                continue
            session.add(FacialSede(regional=regional, lugar=lugar, latitud=lat, longitud=lng))
            inserted += 1

        await session.commit()
        print(f"Sedes insertadas: {inserted} de {len(SEDES)} (ya existentes: {len(SEDES) - inserted}).")


if __name__ == "__main__":
    asyncio.run(main())
