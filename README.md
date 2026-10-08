# Logyser Facial — Sistema de Control de Acceso y Asistencia Biométrico

PWA (Progressive Web App) de reconocimiento facial para control de acceso y asistencia de personal. Funciona en cualquier dispositivo con navegador moderno sin instalación adicional. Detecta vida en el cliente (MediaPipe WASM), extrae embeddings faciales en el servidor (InsightFace ArcFace) y sincroniza con el sistema maestro de asistencia (Dynamic_Asistencia).

---

## Índice

1. [Stack Técnico](#stack-técnico)
2. [Arquitectura](#arquitectura)
3. [Base de Datos](#base-de-datos)
4. [API Reference](#api-reference)
5. [Frontend — Pantallas y Módulos](#frontend--pantallas-y-módulos)
6. [Flujos de Negocio](#flujos-de-negocio)
7. [Sistema de Notificaciones Push](#sistema-de-notificaciones-push)
8. [Sistema de Sesiones](#sistema-de-sesiones)
9. [Despliegue en Google Cloud Run](#despliegue-en-google-cloud-run)
10. [Variables de Entorno](#variables-de-entorno)
11. [Seguridad y Privacidad](#seguridad-y-privacidad)

---

## Stack Técnico

| Capa | Tecnología | Propósito |
|---|---|---|
| Frontend | HTML5 + CSS3 + JavaScript ES6 Modules | PWA sin frameworks ni build tools |
| Detección de vida | MediaPipe Face Mesh 0.4.x (WASM) | 468 landmarks faciales, liveness en el cliente |
| Backend API | FastAPI 0.115 + Uvicorn | API REST asíncrona, ASGI |
| Embeddings biométricos | InsightFace ArcFace `buffalo_l` | Vectores faciales de 512 dimensiones |
| Runtime ONNX | ONNX Runtime (CPU) | Inferencia sin GPU |
| Visión computacional | OpenCV Headless 4.x | Decodificación de frames base64 |
| Base de datos | MySQL (aiomysql) | Almacenamiento principal |
| ORM | SQLAlchemy 2.x Async | Acceso a datos asíncrono |
| Web Push | pywebpush + cryptography | Notificaciones push server-side |
| Mapas | Leaflet.js + OpenStreetMap | Visualización GPS en historial |
| Enrutamiento GPS | OSRM (router.project-osrm.org) | Ajuste de trayectos a calles reales |
| Tour guiado | Driver.js v1.3.1 | Tutorial interactivo en primera apertura |
| Configuración | pydantic-settings | Variables de entorno tipadas |
| Contenedor | Docker multi-stage | Builder + Runtime, optimizado para Cloud Run |
| Hosting | Google Cloud Run | Serverless, autoescalado, HTTPS automático |

---

## Arquitectura

### Patrón MVC por capas

```
HTTP Request
     │
  Routers      → Reciben el request, validan con Pydantic, delegan al Service
     │
  Services     → Toda la lógica de negocio, orquestan Repositories
     │
  Repositories → Única capa que toca SQLAlchemy. Consultas y escrituras
     │
  Models (ORM) → Definición de tablas con SQLAlchemy Declarative
     │
  MySQL (Desplegables)
```

### Estructura de directorios

```
facial-pwa/
├── backend/
│   ├── core/
│   │   ├── config.py              Variables de entorno (pydantic-settings)
│   │   ├── database.py            Engine, Base, init_db(), get_session()
│   │   ├── vapid.py               Gestión de claves VAPID para Web Push
│   │   └── exceptions.py          HTTPExceptions personalizadas por dominio
│   ├── models/
│   │   ├── enums.py               Todos los enums del dominio
│   │   ├── face_embedding.py      ORM: facial_embeddings
│   │   ├── marcacion.py           ORM: facial_marcaciones
│   │   ├── movimiento.py          ORM: facial_movimientos
│   │   ├── movimiento_waypoint.py ORM: facial_movimientos_waypoints
│   │   ├── session.py             ORM: facial_sessions
│   │   ├── push_subscription.py   ORM: facial_push_subscriptions
│   │   ├── vapid_key.py           ORM: facial_vapid_keys
│   │   ├── person.py              ORM: persons (tabla legacy)
│   │   ├── access_event.py        ORM: access_events (tabla legacy)
│   │   ├── access_point.py        ORM: access_points (tabla legacy)
│   │   └── liveness.py            ORM: liveness_attempts (tabla legacy)
│   ├── repositories/
│   │   ├── face_embedding.py      FaceEmbeddingRepository
│   │   ├── marcacion.py           MarcacionRepository
│   │   ├── movimiento.py          MovimientoRepository
│   │   ├── session.py             SessionRepository
│   │   ├── push.py                PushRepository + scheduler asyncio
│   │   ├── asistencia.py          AsistenciaRepository → Dynamic_Asistencia
│   │   └── vinculacion.py         VinculacionRepository → Maestro_Vinculación
│   ├── services/
│   │   ├── face.py                Singleton InsightFace, decode, extract, cosine
│   │   ├── enrollment.py          EnrollmentService (check + save)
│   │   ├── verify.py              VerifyService (verificación biométrica)
│   │   ├── marcacion.py           ManualService (marcación manual)
│   │   └── movimiento.py          MovimientoService (inicio/fin de recorrido)
│   ├── schemas/
│   │   ├── enrollment.py          EnrollmentCheckRequest/Response, EnrollmentSaveRequest/Response
│   │   ├── verify.py              VerifyRequest/Response
│   │   ├── marcacion.py           ManualRequest/Response
│   │   ├── movimiento.py          MovimientoStartRequest/Response, FinishRequest/Response, ActiveResponse
│   │   ├── history.py             HistoryResponse, HistoryRecord, WaypointOut
│   │   ├── session.py             SessionOpenRequest, SessionCloseRequest, SessionHeartbeatRequest, ...
│   │   └── push.py                PushSubscribeRequest, PushScheduleRequest, PushCancelRequest
│   ├── routers/
│   │   ├── health.py              GET  /api/health
│   │   ├── enrollment.py          POST /api/enrollment/check, /api/enrollment/save
│   │   ├── verify.py              POST /api/verify
│   │   ├── marcacion.py           POST /api/attendance/manual
│   │   ├── movimiento.py          POST /api/movement/start, /finish · GET /api/movement/active/{id}
│   │   ├── history.py             GET  /api/history/{id} · GET /api/history/movement/{id}/waypoints
│   │   ├── session.py             POST /api/session/open|close|close-by-id|heartbeat · GET /api/session/check|state
│   │   └── push.py                GET  /api/push/vapid-key · POST /api/push/subscribe|schedule|cancel
│   └── main.py                    App factory, lifespan, CORS, mount frontend estático
├── frontend/
│   ├── js/
│   │   ├── app.js                 Controlador principal (~3000 líneas), orquesta todo
│   │   ├── api.js                 Cliente HTTP (fetch wrapper)
│   │   ├── camera.js              CameraManager — getUserMedia, RAF loop
│   │   ├── liveness.js            LivenessDetector — EAR blink + yaw head turn
│   │   ├── movement.js            MovementManager — GPS tracking, Leaflet, OSRM
│   │   ├── ui.js                  Manipulación DOM pura, navegación entre pantallas
│   │   └── geo.js                 Utilidades de geolocalización
│   ├── icons/                     icon-192.png, icon-512.png, apple-touch-icon.png
│   ├── index.html                 SPA con todas las pantallas y modales
│   ├── styles.css                 Dark theme, responsive, sin dependencias CSS
│   ├── manifest.json              PWA manifest (standalone, theme navy, icons)
│   └── sw.js                      Service Worker — caché offline + Web Push receiver
├── database/
│   ├── schema.sql                 DDL de referencia
│   └── migrations/                Historial de migraciones
├── recursos/                      Assets fuente (imágenes sin procesar)
├── Dockerfile                     Multi-stage build (builder + runtime)
├── docker-compose.yml             Ejecución local
└── .env.example                   Plantilla de variables de entorno
```

---

## Base de Datos

La base de datos es **MySQL** (instancia Cloud SQL en Google Cloud). La aplicación se conecta a la base `Desplegables` que contiene tanto las tablas propias del sistema biométrico como las tablas maestras del sistema de RRHH.

### Tablas propias del sistema biométrico

#### `facial_embeddings`

Almacena los datos biométricos de cada trabajador registrado. Un trabajador puede tener un único embedding activo.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INT PK AUTO | Identificador interno |
| `identificacion` | BIGINT UNIQUE | Número de documento del trabajador |
| `trabajador` | VARCHAR(255) | Código de trabajador en formato `COD ** NOMBRE` |
| `cargo` | VARCHAR(255) | Cargo del trabajador |
| `operacion` | VARCHAR(255) | Operación/proyecto al que pertenece |
| `regional` | VARCHAR(255) | Regional geográfica |
| `document_type` | VARCHAR(10) | Tipo de documento (CC, CE, TI, PP, NIT) |
| `document_issue_date` | DATE | Fecha de expedición del documento |
| `device_fingerprint` | VARCHAR(128) | Huella digital del dispositivo de enrolamiento |
| `embedding` | JSON | Vector ArcFace de 512 dimensiones (lista de floats) |
| `model_version` | VARCHAR(64) | Versión del modelo (`buffalo_l` por defecto) |
| `is_active` | BOOLEAN | Si este embedding es el vigente para el trabajador |
| `created_at` | DATETIME | Fecha de creación |
| `updated_at` | DATETIME | Fecha de última actualización |

#### `facial_marcaciones`

Log de todas las marcaciones de asistencia: entradas, salidas, novedades manuales y eventos de movimiento.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INT PK AUTO | Identificador interno |
| `identificacion` | BIGINT (idx) | Número de documento |
| `trabajador` | VARCHAR(255) | Código de trabajador |
| `tipo` | VARCHAR(30) | Tipo de marcación (ver lista abajo) |
| `score` | DECIMAL(6,4) | Score de similitud coseno ArcFace (NULL si es manual) |
| `latitud` | DECIMAL(10,8) | Latitud GPS al momento de la marca |
| `longitud` | DECIMAL(11,8) | Longitud GPS al momento de la marca |
| `precision_gps` | INT | Precisión GPS en metros |
| `es_manual` | BOOLEAN | TRUE si fue registrada sin verificación biométrica |
| `motivo` | VARCHAR(512) | Justificación (solo marcaciones manuales) |
| `device_fingerprint` | VARCHAR(128) | Huella del dispositivo |
| `ip` | VARCHAR(45) | IP del cliente |
| `fecha_hora` | DATETIME | Timestamp UTC de la marcación |

**Tipos de marcación (`tipo`):**

| Valor | Descripción |
|---|---|
| `ENTRADA` | Ingreso a jornada laboral |
| `SALIDA` | Fin de jornada laboral |
| `ALMUERZO` | Salida a almuerzo |
| `DESAYUNO` | Salida a desayuno |
| `BREAK` | Pausa de descanso |
| `TRASLADO` | Traslado entre puntos |
| `MOVIMIENTO_INICIO` | Inicio de recorrido GPS |
| `MOVIMIENTO_FIN` | Fin de recorrido GPS |

#### `facial_movimientos`

Registro de cada recorrido GPS completado o activo. Cada recorrido tiene una trayectoria de waypoints detallada en `facial_movimientos_waypoints`.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INT PK AUTO | Identificador del movimiento |
| `identificacion` | BIGINT (idx) | Trabajador |
| `trabajador` | VARCHAR(255) | Código de trabajador |
| `tipo` | VARCHAR(20) | `LIBRE` o `DESTINO_FIJO` |
| `estado` | VARCHAR(20) | `ACTIVO` o `COMPLETADO` |
| `lat_inicio` | DECIMAL(10,8) | Latitud del punto de inicio |
| `lng_inicio` | DECIMAL(11,8) | Longitud del punto de inicio |
| `lat_destino` | DECIMAL(10,8) | Latitud del destino (solo DESTINO_FIJO) |
| `lng_destino` | DECIMAL(11,8) | Longitud del destino (solo DESTINO_FIJO) |
| `direccion_destino` | VARCHAR(512) | Dirección textual del destino |
| `ruta_dist_km` | DECIMAL(8,3) | Distancia de la ruta planificada en km |
| `ruta_tiempo_min` | INT | Tiempo estimado de la ruta planificada en minutos |
| `fecha_inicio` | DATETIME | Inicio del recorrido (UTC) |
| `fecha_fin` | DATETIME | Fin del recorrido (NULL si activo) |
| `duracion_min` | INT | Duración total en minutos |
| `distancia_real_km` | DECIMAL(8,3) | Distancia real recorrida (calculada en cliente) |
| `desvio_max_km` | DECIMAL(8,3) | Máximo desvío respecto a la ruta planificada |
| `velocidad_max_kmh` | DECIMAL(6,2) | Velocidad máxima registrada |
| `velocidad_prom_kmh` | DECIMAL(6,2) | Velocidad promedio |
| `total_waypoints` | INT | Total de waypoints guardados |
| `llego_destino` | BOOLEAN | Si llegó al radio de 30m del destino |
| `waypoints_json` | JSON | Resumen ligero (primer y último waypoint) |
| `device_fingerprint` | VARCHAR(128) | Huella del dispositivo |
| `ip` | VARCHAR(45) | IP del cliente |

#### `facial_movimientos_waypoints`

GPS crumb trail de cada movimiento. Cada fila es un punto GPS filtrado (mínimo 30m de desplazamiento o 12 segundos entre puntos).

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INT PK AUTO | Identificador |
| `movimiento_id` | INT (idx) | FK → `facial_movimientos.id` |
| `secuencia` | INT | Orden del punto dentro del recorrido |
| `lat` | DECIMAL(10,8) | Latitud |
| `lng` | DECIMAL(11,8) | Longitud |
| `altitud_m` | DECIMAL(8,2) | Altitud en metros |
| `velocidad_kmh` | DECIMAL(6,2) | Velocidad en ese punto |
| `precision_m` | INT | Precisión GPS en metros |
| `rumbo_grados` | DECIMAL(5,2) | Rumbo en grados (0–360) |
| `fecha_hora` | DATETIME | Timestamp del punto |

#### `facial_sessions`

Control de sesiones activas por trabajador y dispositivo. Garantiza que un trabajador solo puede tener sesión activa en un dispositivo a la vez.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INT PK AUTO | Identificador |
| `identificacion` | BIGINT (idx) | Trabajador |
| `session_token` | VARCHAR(64) UNIQUE | Token hexadecimal de 32 bytes (secrets.token_hex) |
| `device_fp` | VARCHAR(128) | Huella del dispositivo |
| `opened_at` | DATETIME | Cuando se abrió la sesión (UTC) |
| `expires_at` | DATETIME | Expiración (UTC); renovado por heartbeat cada 10 min |
| `closed_at` | DATETIME NULL | Cuando se cerró; NULL = sesión activa |

#### `facial_push_subscriptions`

Suscripciones Web Push registradas. Una suscripción por combinación trabajador + dispositivo.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INT PK AUTO | Identificador |
| `identificacion` | BIGINT (idx) | Trabajador |
| `device_fp` | VARCHAR(128) | Huella del dispositivo |
| `endpoint` | TEXT | URL del servidor push del navegador |
| `p256dh` | VARCHAR(512) | Clave pública del cliente (curva P-256) |
| `auth` | VARCHAR(128) | Secreto de autenticación del cliente |
| `created_at` | DATETIME | Fecha de registro |

#### `facial_vapid_keys`

Almacén de las claves VAPID generadas en BD. En producción, las claves se inyectan como variables de entorno y esta tabla no se usa activamente.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INT PK AUTO | Identificador |
| `private_pem` | TEXT | Clave privada EC en formato PEM |
| `private_raw` | TEXT | Escalar d en base64url (formato que requiere pywebpush) |
| `public_b64url` | TEXT | Clave pública en base64url (formato ApplicationServerKey) |
| `created_at` | DATETIME | Cuando se generaron |

### Tablas externas (solo lectura o escritura)

Estas tablas pertenecen al sistema de RRHH y son accedidas directamente por SQL raw (no tienen ORM propio en este proyecto).

#### `Maestro_Vinculación` (lectura)

Directorio maestro de trabajadores activos. El sistema consulta esta tabla para verificar que un trabajador existe y está activo antes de permitir enrolamiento o marcación.

Columnas relevantes: `` `Identificación` ``, `` `Trabajador` ``, `` `Estado` ``, `` `Cargo` ``, `` `Operación` ``, `` `Regional` ``, `` `Area` ``

#### `Maestro_Segmentación` (lectura)

Datos de documento de identidad de los trabajadores. Se hace JOIN con `Maestro_Vinculación` para validar el tipo y fecha de expedición del documento en el momento del enrolamiento.

Columnas relevantes: `` `Identificación` ``, `` `Tipo de Documento` ``, `` `Cod. Tipo Doc` ``, `` `Fecha Expedición` ``

#### `Dynamic_Asistencia` (escritura)

Tabla maestra del sistema de asistencia. El sistema biométrico escribe aquí en background (sin bloquear el response) cada vez que se registra una ENTRADA o SALIDA biométrica verificada.

Columnas escritas: `IdAsistencia`, `IdRegistro`, `Operación`, `Novedad`, `Prefijo Novedad` (`BIO`), `Día`, `Area`, `Trabajador`, `Cédula`, `Nombre`, `Hora Llegada`, `Hora Salida`, `Tiempo Laborado`, `Observaciones`, `Origen`, `Fecha Registro`, `Usuario`, `Estado`

---

## API Reference

Todos los endpoints están bajo el prefijo `/api/`. El servidor sirve también el frontend estático desde `/`.

### Health

#### `GET /api/health`

Endpoint de salud usado por Cloud Run para verificar si el servicio está listo.

```json
{
  "status": "ok",
  "model_loaded": true,
  "model_error": null,
  "db_ready": true,
  "db_error": null
}
```

`model_loaded` puede ser `false` brevemente durante el arranque mientras InsightFace se carga en background. Cloud Run considera el servicio healthy si responde 200, independientemente del valor de `model_loaded`.

---

### Enrollment (Enrolamiento Biométrico)

#### `POST /api/enrollment/check`

Verifica si un trabajador puede enrolarse. Realiza validación en tres capas:
1. Existencia y estado activo en `Maestro_Vinculación`
2. Coincidencia de tipo y fecha de expedición en `Maestro_Segmentación`
3. Si ya tiene embedding: validación contra datos guardados + control de dispositivo único

**Request:**
```json
{
  "document_type": "CC",
  "identificacion": 1234567890,
  "document_issue_date": "2015-03-21",
  "device_fingerprint": "d7a3f..."
}
```

**Response:**
```json
{
  "status": "ready_to_enroll",
  "worker": {
    "identificacion": 1234567890,
    "nombre": "Juan Pérez",
    "cargo": "Operario",
    "operacion": "Bogotá Norte",
    "regional": "Cundinamarca",
    "has_biometrics": false
  },
  "message": "Trabajador identificado. Procede con el registro biométrico."
}
```

**Valores de `status`:**

| Valor | Significado |
|---|---|
| `ready_to_enroll` | Trabajador válido, sin biometría previa |
| `already_enrolled` | Trabajador válido, ya tiene biometría |
| `not_found` | No existe o no está activo en el sistema |
| `invalid_credentials` | Tipo o fecha de documento incorrectos |
| `wrong_device` | Ya tiene sesión activa en otro dispositivo |

#### `POST /api/enrollment/save`

Guarda (o actualiza) el embedding biométrico de un trabajador. Recibe 3 frames base64 capturados durante el proceso de liveness, extrae el embedding de cada uno con ArcFace y guarda el promedio normalizado.

**Request:**
```json
{
  "identificacion": 1234567890,
  "document_type": "CC",
  "document_issue_date": "2015-03-21",
  "device_fingerprint": "d7a3f...",
  "frames": ["data:image/jpeg;base64,...", "...", "..."]
}
```

**Response:**
```json
{
  "status": "enrolled",
  "identificacion": 1234567890,
  "nombre": "Juan Pérez",
  "message": "Datos biométricos registrados exitosamente."
}
```

`status` es `enrolled` para nuevos registros y `updated` si ya existía uno previo.

---

### Verificación Biométrica

#### `POST /api/verify`

Verifica la identidad del trabajador comparando el frame capturado contra el embedding almacenado. Si la similitud coseno supera `0.65`, registra la marcación en `facial_marcaciones` y sincroniza en background con `Dynamic_Asistencia`.

**Request:**
```json
{
  "identificacion": 1234567890,
  "frame": "data:image/jpeg;base64,...",
  "tipo": "ENTRADA",
  "latitud": 4.6097,
  "longitud": -74.0817,
  "precision_gps": 15,
  "device_fingerprint": "d7a3f..."
}
```

**Response:**
```json
{
  "status": "authorized",
  "identificacion": 1234567890,
  "nombre": "Juan Pérez",
  "score": 0.8734,
  "message": "Identidad verificada."
}
```

**Valores de `status`:** `authorized` | `denied` | `not_found`

El campo `tipo` acepta: `ENTRADA`, `SALIDA`, `ALMUERZO`, `DESAYUNO`, `BREAK`, `TRASLADO`.

---

### Marcación Manual

#### `POST /api/attendance/manual`

Registra una marcación sin verificación biométrica. Requiere un motivo de mínimo 4 caracteres. Útil cuando el sistema biométrico no puede verificar (mala iluminación, lesión, etc.).

**Request:**
```json
{
  "identificacion": 1234567890,
  "tipo": "ENTRADA",
  "motivo": "Cámara dañada en el dispositivo",
  "latitud": 4.6097,
  "longitud": -74.0817,
  "precision_gps": 20,
  "device_fingerprint": "d7a3f..."
}
```

**Response:**
```json
{
  "status": "recorded",
  "identificacion": 1234567890,
  "nombre": "Juan Pérez",
  "message": "Marcación manual registrada."
}
```

---

### Movimiento GPS

#### `POST /api/movement/start`

Inicia un nuevo recorrido GPS. Hay dos tipos:
- `LIBRE`: recorrido sin destino definido
- `DESTINO_FIJO`: recorrido hacia coordenadas específicas; el frontend calcula la ruta con OSRM antes de iniciar

Si el trabajador ya tiene un movimiento activo de menos de 4 horas, devuelve HTTP 409 (`ACTIVE_MOVEMENT`). Si tiene uno de más de 4 horas, lo auto-completa y crea el nuevo.

**Request:**
```json
{
  "identificacion": 1234567890,
  "tipo": "DESTINO_FIJO",
  "lat_inicio": 4.6097,
  "lng_inicio": -74.0817,
  "lat_destino": 4.6200,
  "lng_destino": -74.0900,
  "direccion_destino": "Calle 80 con Av. Suba, Bogotá",
  "ruta_dist_km": 2.3,
  "ruta_tiempo_min": 8,
  "device_fingerprint": "d7a3f..."
}
```

**Response:**
```json
{
  "movimiento_id": 42,
  "message": "Movimiento iniciado. Seguimiento activo."
}
```

#### `POST /api/movement/finish`

Finaliza el recorrido activo. Recibe los waypoints GPS registrados durante el viaje, calcula estadísticas de velocidad y guarda todo en base de datos.

**Request:**
```json
{
  "movimiento_id": 42,
  "distancia_real_km": 2.1,
  "desvio_max_km": 0.15,
  "llego_destino": true,
  "waypoints": [
    {
      "lat": 4.6097,
      "lng": -74.0817,
      "ts": 1716700000000,
      "speed": 25.3,
      "accuracy": 10.0,
      "alt": 2600.0,
      "heading": 45.0
    }
  ]
}
```

**Response:**
```json
{
  "status": "completed",
  "duracion_min": 12,
  "distancia_real_km": 2.1,
  "llego_destino": true,
  "total_waypoints": 18,
  "velocidad_max_kmh": 45.2,
  "velocidad_prom_kmh": 28.7,
  "message": "Movimiento completado. 12 min · 2.10 km"
}
```

#### `GET /api/movement/active/{identificacion}`

Consulta si el trabajador tiene un movimiento activo. Usado al reabrir la app para restaurar el estado del movimiento en el frontend.

**Response (activo):**
```json
{
  "active": true,
  "movimiento_id": 42,
  "tipo": "DESTINO_FIJO",
  "fecha_inicio": "2026-05-26T14:00:00",
  "lat_inicio": 4.6097,
  "lng_inicio": -74.0817,
  "lat_destino": 4.6200,
  "lng_destino": -74.0900,
  "dir_destino": "Calle 80 con Av. Suba, Bogotá",
  "ruta_dist_km": 2.3,
  "ruta_tiempo_min": 8
}
```

---

### Historial

#### `GET /api/history/{identificacion}?limit=40`

Devuelve las marcaciones de asistencia y movimientos más recientes del trabajador, mezclados y ordenados por fecha descendente. Excluye los tipos `MOVIMIENTO_INICIO` y `MOVIMIENTO_FIN` de las marcaciones (ya representados como registros de movimiento).

**Response:**
```json
{
  "records": [
    {
      "tipo_registro": "marcacion",
      "id": 123,
      "tipo": "ENTRADA",
      "fecha_hora": "2026-05-26T08:05:00",
      "latitud": 4.6097,
      "longitud": -74.0817,
      "score": 0.8734,
      "es_manual": false,
      "motivo": null
    },
    {
      "tipo_registro": "movimiento",
      "id": 42,
      "tipo": "LIBRE",
      "fecha_hora": "2026-05-26T10:00:00",
      "latitud": 4.6097,
      "longitud": -74.0817,
      "estado": "COMPLETADO",
      "duracion_min": 25,
      "distancia_km": 3.4,
      "total_wps": 22,
      "vel_max": 48.0,
      "vel_prom": 31.2,
      "llego": false
    }
  ],
  "total": 2
}
```

#### `GET /api/history/movement/{movimiento_id}/waypoints`

Devuelve todos los waypoints GPS de un movimiento específico, ordenados por secuencia. Usado al hacer clic en un registro de movimiento en el historial para visualizar la ruta en el mapa.

```json
[
  {
    "secuencia": 0,
    "lat": 4.6097,
    "lng": -74.0817,
    "altitud_m": 2600.0,
    "velocidad_kmh": 0.0,
    "precision_m": 10,
    "fecha_hora": "2026-05-26T10:00:00"
  }
]
```

---

### Sesiones

#### `POST /api/session/open`

Abre una sesión para el trabajador en el dispositivo actual. Si ya existe sesión activa en el mismo dispositivo, la reanuda. Si existe en otro dispositivo, devuelve `other_device`.

**Request:** `{ "identificacion": 1234567890, "device_fp": "d7a3f..." }`

**Response:** `{ "status": "opened" | "resumed" | "other_device", "token": "abc..." }`

#### `POST /api/session/close`

Cierra la sesión por token. `{ "token": "abc..." }`

#### `POST /api/session/close-by-id`

Cierra todas las sesiones activas del trabajador por identificación. Más robusto que por token porque no depende del localStorage del dispositivo. Usado en logout.

**Request:** `{ "identificacion": 1234567890 }`

#### `GET /api/session/check/{identificacion}?fp={device_fp}`

Verifica si existe sesión activa para el trabajador en ese dispositivo específico. Devuelve `same_device`, `other_device` o `none`.

#### `POST /api/session/heartbeat`

Renueva la sesión activa (+30 minutos). Llamado cada 10 minutos mientras la app está en primer plano.

**Request:** `{ "identificacion": 1234567890, "device_fp": "d7a3f..." }`

#### `GET /api/session/state/{identificacion}`

Deriva el estado de asistencia del trabajador para el día actual (Colombia UTC-5) consultando `facial_marcaciones`. Devuelve si tiene entrada activa y el timestamp de esa entrada.

**Response:**
```json
{
  "has_active_entry": true,
  "last_action": "ENTRADA",
  "entry_time_ms": 1716724800000
}
```

---

### Push Notifications

#### `GET /api/push/vapid-key`

Devuelve la clave pública VAPID que el frontend usa en `pushManager.subscribe()`.

```json
{ "public_key": "BNx7..." }
```

#### `POST /api/push/subscribe`

Guarda la suscripción Web Push del dispositivo. Si ya existía una para el mismo `device_fp`, la reemplaza.

**Request:**
```json
{
  "identificacion": 1234567890,
  "device_fp": "d7a3f...",
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "BNx7...",
    "auth": "abc123..."
  }
}
```

#### `POST /api/push/schedule`

Programa notificaciones push para cuando la app pasa a background. Crea tareas asyncio en memoria del servidor.

**Request:**
```json
{
  "identificacion": 1234567890,
  "device_fp": "d7a3f...",
  "has_movement": true,
  "has_entry": true,
  "entry_time_ms": 1716724800000,
  "worker_name": "Juan Pérez",
  "delay_movement_ms": 600000,
  "repeat_movement_ms": 900000,
  "delay_entrada_ms": 12600000,
  "repeat_entrada_ms": 1800000
}
```

#### `POST /api/push/cancel`

Cancela todas las tareas de notificación pendientes para el trabajador. Llamado cuando la app regresa al primer plano.

**Request:** `{ "identificacion": 1234567890 }`

---

## Frontend — Pantallas y Módulos

### Pantallas (SPA)

La aplicación es una SPA sin router. La navegación entre pantallas se hace mostrando/ocultando contenedores `<section>` con la clase `active`.

#### `screen-landing`

Pantalla de bienvenida inicial. Muestra el logo de Logyser y el botón "Comenzar". Detecta si el usuario ya tiene sesión activa (via `localStorage`) y redirige directamente a la pantalla de asistencia si es así.

#### `screen-enrollment-form`

Formulario de identificación del trabajador. Campos:
- Tipo de documento (CC / CE / TI / PP / NIT)
- Número de documento
- Fecha de expedición del documento (inicializada con la fecha actual de Colombia)

Al enviar, llama a `/api/enrollment/check`. Si el trabajador está `already_enrolled` navega a `screen-attendance`. Si está `ready_to_enroll` navega a `screen-enrollment-camera`.

#### `screen-enrollment-camera`

Pantalla de enrolamiento biométrico. Muestra el visor de cámara en tiempo real con el overlay SVG de posicionamiento. Guía al usuario por 3 pasos de liveness:
1. Girar cabeza a la **izquierda** (yaw > 0.18)
2. Girar cabeza a la **derecha** (yaw < -0.18)
3. Mirar al frente **inmóvil** (captura automática)

Captura 1 frame JPEG por cada paso completado. Al completar los 3 frames llama a `/api/enrollment/save`.

#### `screen-enrollment-success`

Pantalla de confirmación post-enrolamiento. Muestra nombre del trabajador y navega automáticamente a `screen-attendance` tras un breve delay.

#### `screen-attendance`

Pantalla principal de asistencia. Es la pantalla central de la app post-login. Contiene:
- **Header navy** con nombre del trabajador, hora y fecha en tiempo real (Colombia)
- **Foto de última verificación** o placeholder con icono si no hay foto
- **Overlay SVG** con 4 esquinas y círculo guía, visible solo sobre foto de verificación
- **Reloj de jornada** activo desde la ENTRADA
- **Botón de acción principal** (registra ENTRADA / SALIDA / novedades según estado actual)
- **Botón de Movimiento** (inicia recorrido GPS)
- **Botón de Manual** (abre modal de marcación manual)
- **Botón de Historial** (navega al historial)
- **Botón de ayuda** (activa Driver.js tutorial)
- **Ticker de tips** rotativo con información del sistema

#### `screen-verify`

Pantalla de verificación facial activa. Muestra el visor de cámara con modo pasivo (liveness automático, sin pasos explícitos). Captura el frame cuando MediaPipe detecta un rostro correctamente posicionado. Llama a `/api/verify`.

#### `screen-movement`

Pantalla de configuración de movimiento. Permite elegir:
- **Recorrido libre** (sin destino)
- **Destino fijo** (búsqueda de dirección via Nominatim/OpenStreetMap)

Para DESTINO_FIJO muestra el mapa Leaflet con la ruta calculada por OSRM (router.project-osrm.org).

#### `screen-movement-active`

Pantalla de seguimiento GPS en tiempo real. Muestra:
- Mapa Leaflet centrado en posición actual del trabajador
- Marcador de posición animado con ring pulsante
- Información del recorrido: distancia, tiempo, velocidad
- Barra de progreso hacia el destino (solo DESTINO_FIJO)
- Botón "Finalizar recorrido"

El GPS se actualiza usando `navigator.geolocation.watchPosition`. Los waypoints se filtran (mínimo 30m o 12 segundos entre puntos) antes de enviarse al servidor al finalizar.

#### `screen-history`

Historial de marcaciones y movimientos. Filtros por rango de fechas (hf-desde / hf-hasta). Selector de atajos: Hoy, Ayer, Esta semana, Este mes.

Cada registro de movimiento es expandible y muestra el mapa Leaflet con los waypoints del recorrido. Los waypoints se conectan ajustando la trayectoria a calles reales via OSRM Map Matching (`/match/v1/driving/`), con fallback a línea directa si OSRM tarda más de 6 segundos.

#### `screen-manual`

Formulario de marcación manual (sin biometría). Campos: tipo de novedad (dropdown) y motivo (textarea mínimo 4 caracteres). Llama a `/api/attendance/manual`.

#### `screen-success`

Pantalla de confirmación de marcación exitosa (biométrica o manual). Muestra nombre, tipo de marcación, hora Colombia y score de similitud. Se auto-descarta tras 4 segundos.

#### `screen-denied`

Pantalla de rechazo de verificación biométrica. Muestra el score obtenido y el umbral requerido. Ofrece opciones: reintentar o usar marcación manual.

### Modales

La app tiene modales para flujos secundarios que no justifican pantalla completa:

| Modal | Trigger | Propósito |
|---|---|---|
| `modal-movement-type` | Botón Movimiento | Elegir entre recorrido libre o con destino |
| `modal-destination` | Seleccionar "Destino fijo" | Búsqueda de dirección + mapa de previsualización de ruta |
| `modal-movement-active` | Inicio de movimiento con uno ya activo | Confirmar si se desea reemplazar el movimiento activo |
| `modal-action-select` | Botón principal de asistencia | Seleccionar tipo de novedad (almuerzo, break, traslado...) |
| `modal-history-map` | Click en registro de movimiento | Mapa detallado del recorrido con waypoints |
| `modal-offline` | Pérdida de conexión | Aviso de modo sin conexión |
| `modal-permissions` | Primer acceso o permisos revocados | Solicitar cámara y ubicación |

### Módulos JavaScript

#### `app.js`

Controlador principal (~3000 líneas). Importa y orquesta todos los demás módulos. Maneja:
- Estado global de la sesión (`state` object)
- Ciclo de vida de la app (inicio, restauración de estado, background/foreground)
- Lógica de cada pantalla y modal
- Scheduling de notificaciones push
- Detección de conectividad offline/online
- Heartbeat de sesión
- Tour guiado Driver.js

#### `camera.js` — `CameraManager`

Gestiona el acceso a la cámara. Métodos principales:
- `start(videoEl)`: Abre la cámara (facingMode: user) con getUserMedia
- `captureFrame()`: Captura un frame JPEG como base64 usando canvas
- `stop()`: Libera el MediaStream

#### `liveness.js` — `LivenessDetector`

Detección de vida client-side usando MediaPipe Face Mesh (WASM). Dos modos:
- **Enrolamiento (pasos explícitos)**: `start(steps)` exige completar `["left", "right", "still"]` en orden
- **Verificación (pasivo)**: `startPassive()` captura automáticamente cuando el rostro está correctamente posicionado

**Algoritmos:**

- **Parpadeo — Eye Aspect Ratio (EAR)**: Se calculan 6 landmarks por ojo. `EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)`. Threshold: `EAR < 0.22`.
- **Giro lateral — Yaw normalizado**: Posición de la nariz (landmark 1) relativa al ancho facial (landmarks 234 y 454). `yaw = (nose.x - center.x) / faceWidth`. Threshold: `|yaw| > 0.18`.

#### `movement.js` — `MovementManager`

Gestiona el seguimiento GPS en tiempo real. Inicializa el mapa Leaflet, maneja `watchPosition`, filtra waypoints, calcula distancias con la fórmula de Haversine y detecta la llegada al destino (radio de 30m, una sola vez por recorrido).

**Constantes:**
- `ARRIVAL_DIST = 0.03` km (30m): radio de llegada al destino
- Filtro de waypoints: mínimo 30m de desplazamiento O 12 segundos entre puntos

#### `api.js`

Wrapper de `fetch` para todos los endpoints del backend. Maneja timeout, errores de red y deserialización JSON. Todos los métodos son async.

#### `ui.js`

Funciones de manipulación DOM sin estado. Responsable de mostrar/ocultar pantallas, actualizar textos, manejar clases CSS.

#### `geo.js`

Utilidades de geolocalización: cálculo de distancia Haversine entre dos puntos GPS.

### Service Worker (`sw.js`)

Cache name actual: `logyser-facial-v15`

**Estrategia de caché:** Cache-first para assets estáticos, bypass completo para:
- Cualquier URL bajo `/api/`
- Dominios externos (OpenStreetMap, CartoCDN, Google Fonts, OSRM, Nominatim, etc.)

**Web Push receiver:** Escucha el evento `push` y muestra la notificación. Maneja el evento `notificationclick` para traer la app al frente.

**Mensajes desde app.js:**
- `APP_FOREGROUND`: Cancela todas las notificaciones `SHOW_NOW` pendientes
- `SHOW_NOW`: Muestra una notificación inmediata (eventos síncronos como pérdida de red)

---

## Flujos de Negocio

### Flujo de Enrolamiento

```
Usuario → Ingresa tipo doc + número + fecha expedición
    │
    ├─ POST /api/enrollment/check
    │   ├─ Consulta Maestro_Vinculación (trabajador activo?)
    │   ├─ LEFT JOIN Maestro_Segmentación (valida tipo y fecha de doc)
    │   ├─ Si ya tiene embedding: valida device_fingerprint
    │   │   └─ Mismo fp → "already_enrolled" → ir a pantalla principal
    │   │   └─ Otro fp con sesión activa → "wrong_device" → error
    │   └─ Sin embedding → "ready_to_enroll" → ir a cámara
    │
    ├─ Liveness: izquierda → derecha → frente (3 frames capturados)
    │
    └─ POST /api/enrollment/save
        ├─ Decodifica 3 frames base64 → OpenCV ndarray
        ├─ Extrae embedding ArcFace 512d de cada frame
        ├─ Promedia los 3 embeddings + normaliza L2
        └─ Guarda en facial_embeddings (INSERT o UPDATE si ya existe)
```

### Flujo de Verificación Biométrica

```
Usuario → Pantalla de verificación (modo pasivo)
    │
    ├─ MediaPipe detecta rostro → captura automática de frame
    │
    ├─ POST /api/verify
    │   ├─ Obtiene embedding almacenado de facial_embeddings
    │   ├─ Extrae embedding del frame capturado (ArcFace)
    │   ├─ Calcula similitud coseno
    │   ├─ score >= 0.65 → AUTORIZADO
    │   │   ├─ INSERT en facial_marcaciones (con GPS, score, device_fp)
    │   │   └─ Background: sync con Dynamic_Asistencia (solo ENTRADA/SALIDA)
    │   └─ score < 0.65 → DENEGADO (no se registra marcación)
    │
    └─ Respuesta al usuario (pantalla de éxito o rechazo)
```

### Flujo de Estado de Asistencia

Al abrir la app, se consulta `/api/session/state/{id}` para determinar el estado actual del día (sin depender del localStorage, que podría estar limpio):

```
GET /api/session/state/{identificacion}
    │
    └─ Consulta facial_marcaciones donde tipo IN ('ENTRADA','SALIDA')
       para el día actual de Colombia (UTC 05:00 – 05:00 del día siguiente)
       │
       ├─ Último registro = ENTRADA → has_active_entry: true, entry_time_ms: <timestamp>
       └─ Último registro = SALIDA (o sin registros) → has_active_entry: false
```

### Sincronización con Dynamic_Asistencia

Solo ocurre para marcaciones biométricas de tipo `ENTRADA` o `SALIDA`. Es un proceso en background que no bloquea la respuesta al usuario:

- **ENTRADA**: INSERT en `Dynamic_Asistencia` con `Hora Llegada`, `Prefijo Novedad = 'BIO'`
- **SALIDA**: UPDATE del registro del día llenando `Hora Salida` y `Tiempo Laborado = TIMEDIFF(salida, llegada)`
- Si no existe fila de entrada al registrar la salida, se inserta una fila nueva con solo `Hora Salida`

Los IDs se generan con el formato `BIO - DD.MES.YYYY -<8chars_hex>`.

---

## Sistema de Notificaciones Push

### Arquitectura

El sistema usa el estándar **Web Push Protocol** (RFC 8030) con claves VAPID (Voluntary Application Server Identification).

```
App → background → POST /api/push/schedule
                          │
                    asyncio.create_task()
                          │
            Espera delay (10 min movimiento / dinámico entrada)
                          │
                    pywebpush.webpush()
                          │
                  Servidor push del navegador (FCM, Mozilla, Apple)
                          │
                    Service Worker (evento "push")
                          │
                    showNotification()
```

### Tipos de notificaciones

**Notificación de movimiento activo:**
- Se dispara cuando la app pasa a background con un recorrido activo
- Primera notificación: después de **10 minutos** en background
- Repetición: cada **15 minutos**
- Título: `"Movimiento activo"`
- Cuerpo: `"{Nombre}: Tienes un recorrido en curso. Finalízalo antes de cerrar jornada."`

**Notificación de jornada activa:**
- Se dispara cuando la app pasa a background con ENTRADA registrada sin SALIDA
- Primera notificación: al cumplirse **8 horas** desde la ENTRADA (mínimo 15 min si la app se va al fondo cerca de las 8h)
- Repetición: cada **30 minutos**
- Título: `"Registra tu salida"`
- Cuerpo: `"{Nombre}: Llevas Xh Ym de jornada activa."` (tiempo recalculado en cada envío)

**Cancelación:** Cuando la app regresa al primer plano:
1. El frontend llama a `POST /api/push/cancel` → cancela las tareas asyncio en el servidor
2. El frontend envía `postMessage { type: "APP_FOREGROUND" }` al SW → cancela las notificaciones SHOW_NOW pendientes

### Persistencia de claves VAPID

Las claves VAPID son pares de claves EC P-256. **Deben ser permanentes**: si cambian, todos los dispositivos suscritos reciben error `VapidPkHashMismatch` y dejan de recibir push.

**Fuentes en orden de prioridad:**
1. Variables de entorno `VAPID_PRIVATE_RAW` y `VAPID_PUBLIC_KEY` → permanentes entre deployments
2. Generación en arranque → temporal, cambia con cada restart (solo para desarrollo)

**Configuración en Cloud Run:**
```
Cloud Run → Edit revision → Variables & Secrets → Add variable
VAPID_PRIVATE_RAW = <base64url del escalar d>
VAPID_PUBLIC_KEY  = <base64url de la clave pública en formato uncompressed point>
```

### Detección de cambio de clave VAPID

El frontend guarda la clave pública en `localStorage("lgy_vapid_pk")`. Al abrir la app, consulta `/api/push/vapid-key` y compara con la guardada. Si difieren, fuerza una nueva suscripción (`pushManager.subscribe()`) con la nueva clave.

---

## Sistema de Sesiones

### Propósito

Garantizar que un trabajador solo pueda usar la app en un dispositivo a la vez. Previene que dos dispositivos marquen asistencia con el mismo número de documento simultáneamente.

### Huella de dispositivo (`device_fingerprint`)

Se genera en el frontend combinando:
- `navigator.userAgent`
- `navigator.language`
- `screen.width + screen.height + screen.colorDepth`
- `navigator.hardwareConcurrency`
- `navigator.deviceMemory`
- `Intl.DateTimeFormat().resolvedOptions().timeZone`

El hash resultante (SHA-256) empieza con `d` y no contiene guiones (formato determinístico v2). Fingerprints del formato antiguo (`hash-timestamp`) son ignorados en la validación de dispositivo para no bloquear usuarios enrolados previamente.

### Ciclo de vida de la sesión

```
Apertura de app
    │
    ├─ POST /api/session/open
    │   ├─ Sesión activa mismo dispositivo → "resumed" (token reutilizado)
    │   ├─ Sesión activa otro dispositivo  → "other_device" (bloqueado)
    │   └─ Sin sesión activa              → "opened" (token nuevo, TTL 30 min)
    │
    ├─ Heartbeat cada 10 min (app en primer plano)
    │   └─ POST /api/session/heartbeat → +30 min a expires_at
    │
    └─ Cierre de app o logout
        └─ POST /api/session/close-by-id → closed_at = NOW()
```

Las sesiones con `expires_at < NOW()` se ignoran en las consultas (efectivamente expiradas aunque `closed_at` sea NULL).

---

## Despliegue en Google Cloud Run

### Dockerfile (multi-stage)

**Stage 1 — Builder:**
- `python:3.11-slim` con build tools (cmake, libgl1)
- Instala dependencias Python en `/venv`
- Pre-descarga el modelo `buffalo_l` de InsightFace (~400MB) durante el build para eliminar latencia en el primer arranque

**Stage 2 — Runtime:**
- `python:3.11-slim` sin build tools (imagen más pequeña)
- Copia `/venv` y `/root/.insightface` del builder
- Copia el código fuente de `backend/` y el frontend estático de `frontend/`
- Variables: `MPLBACKEND=Agg` (evita errores de display en headless), `FRONTEND_DIR=/app/frontend`
- Puerto: 8080 (estándar Cloud Run)
- Entrypoint: `uvicorn main:app --app-dir /app/backend --host 0.0.0.0 --port ${PORT:-8080} --workers 1`

### Build y deploy

```bash
# Build local para pruebas
docker build -t logyser-facial .
docker run -p 8080:8080 \
  -e DATABASE_URL="mysql+aiomysql://user:pass@host:3307/Desplegables" \
  -e VAPID_PRIVATE_RAW="..." \
  -e VAPID_PUBLIC_KEY="..." \
  logyser-facial

# Deploy a Cloud Run (desde la raíz del proyecto)
gcloud run deploy logyser-facial \
  --source . \
  --region us-east1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --set-env-vars DATABASE_URL="...",VAPID_PRIVATE_RAW="...",VAPID_PUBLIC_KEY="..."
```

### Consideraciones de Cloud Run

**Instancias:** El servicio corre con `--workers 1` (un proceso Uvicorn). Las notificaciones push usan `asyncio.create_task()` que viven en memoria del proceso. Si Cloud Run escala a múltiples instancias, las tareas de notificación solo existen en la instancia que recibió el request de `/api/push/schedule`.

**Cold start:** El modelo InsightFace (`buffalo_l`) pesa ~400MB y tarda 10-20 segundos en cargarse. Para mitigarlo: (1) el modelo se baja durante el build Docker, (2) el endpoint `/api/health` siempre responde 200 aunque el modelo no esté listo, (3) el arranque es no bloqueante (`asyncio.create_task`).

**HTTPS:** Cloud Run incluye HTTPS automáticamente. `getUserMedia` (cámara) y Service Workers requieren HTTPS en producción (o `localhost` para desarrollo).

**Ejecución local con docker-compose:**
```bash
docker compose up --build
# Acceso: http://localhost:8080
```

---

## Variables de Entorno

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `DATABASE_URL` | Sí | — | Conexión MySQL: `mysql+aiomysql://user:pass@host:3307/Desplegables` |
| `VAPID_PRIVATE_RAW` | Sí (producción) | — | Escalar d de la clave EC privada VAPID en base64url |
| `VAPID_PUBLIC_KEY` | Sí (producción) | — | Clave pública EC VAPID en base64url (formato uncompressed point, 65 bytes) |
| `COSINE_THRESHOLD` | No | `0.65` | Score mínimo de similitud coseno para autorizar acceso |
| `INSIGHTFACE_MODEL` | No | `buffalo_l` | Nombre del modelo InsightFace a cargar |
| `INSIGHTFACE_DET_SIZE` | No | `640` | Tamaño del detector facial en píxeles |
| `FRONTEND_DIR` | No | `../frontend` relativo al código | Ruta absoluta al directorio con el frontend estático |
| `PORT` | No | `8080` | Puerto donde escucha Uvicorn (Cloud Run lo inyecta automáticamente) |

Si `VAPID_PRIVATE_RAW` o `VAPID_PUBLIC_KEY` no están definidas, el servidor genera un par de claves temporal al arrancar y las imprime como warning en los logs. Estas claves cambian con cada restart y rompen las suscripciones push existentes.

---

## Seguridad y Privacidad

### Control de acceso biométrico

- **Umbral coseno `0.65`**: Calibrado para ArcFace `buffalo_l`. A este umbral la tasa de falsa aceptación (FAR) es inferior al 0.01%. Configurable via `COSINE_THRESHOLD`.
- **Verificación de vida (liveness)**: El proceso de liveness client-side con MediaPipe previene ataques con fotografías estáticas. Se exige movimiento activo (giro de cabeza) durante el enrolamiento y detección pasiva de rostro vivo durante la verificación.
- **Embeddings, no fotos**: El sistema almacena vectores de 512 dimensiones (floats), no imágenes. Las fotos capturadas se procesan en memoria del servidor y no se persisten en disco ni en base de datos.

### Control de dispositivo único

Un trabajador solo puede tener sesión activa en un dispositivo a la vez (validado por `device_fingerprint` en `facial_sessions`). Si intenta acceder desde un segundo dispositivo sin haber cerrado sesión en el primero, recibe error `wrong_device`.

La sesión expira automáticamente si el heartbeat se detiene (30 minutos sin actividad), liberando el dispositivo.

### Gestión de permisos del navegador

Los permisos de cámara y geolocalización se almacenan en `localStorage` (no `sessionStorage`) para persistir entre sesiones. Al abrir la app se consulta `navigator.permissions.query()` antes de llamar a `getUserMedia`, evitando solicitar permiso si ya fue concedido. Listeners `onchange` revocan automáticamente los flags si el usuario revoca el permiso desde el navegador.

### Seguridad Web Push

Las notificaciones push están firmadas con VAPID usando el estándar RFC 8292. La clave privada nunca sale del servidor. Los endpoints de push son URL opacas provistas por el navegador (FCM, Mozilla Push, Apple Push) que no revelan información del usuario.

### Zona horaria

Toda la lógica de "día laboral" usa **Colombia (UTC-5, sin horario de verano)**. La función `_bog_day_utc_range()` convierte el día calendario de Colombia al rango UTC equivalente para las consultas SQL, evitando errores de clasificación de marcaciones nocturnas o madrugadas.

---

## Rendimiento

| Operación | Tiempo estimado (1 vCPU) |
|---|---|
| Extracción de embedding ArcFace | 300–600 ms |
| Comparación coseno (1 vs 1) | < 1 ms |
| Consulta MySQL con índice | < 10 ms |
| Carga del modelo InsightFace (arranque) | 10–20 s |
| Carga de MediaPipe Face Mesh (primer uso) | 2–4 s |

Para respuesta sub-100ms en alta concurrencia se requeriría GPU (CUDA provider en ONNX Runtime). En entornos de hasta ~50 marcaciones simultáneas, CPU es suficiente con Cloud Run autoscaling.
