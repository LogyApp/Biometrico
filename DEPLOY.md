# Despliegue en Google Cloud Run — Logyser Facial Access

## ¿Por qué fallaba el despliegue anterior?

Dos causas simultáneas:

| Causa | Descripción | Fix aplicado |
|---|---|---|
| **Build timeout** | La pre-descarga del modelo buffalo_l podía fallar en Cloud Build y romper todo el build | Paso marcado como `|| true` — si falla, el modelo se descarga en el primer arranque |
| **Port binding timeout** | `get_analyzer()` en el lifespan de FastAPI bloqueaba el binding del puerto ~60s. Cloud Run no veía el puerto y hacía timeout | Modelo ahora carga en `asyncio.create_task()` (background) — el servidor escucha en el puerto de inmediato |

---

## Variables de entorno en Cloud Run

Al crear/editar el servicio → **"Variables y secretos"**, configura exactamente estas:

| Variable | Valor | Obligatoria |
|---|---|---|
| `DATABASE_URL` | `mysql+aiomysql://claude_user:defgo244r*@34.162.109.112:3307/Desplegables` | ✅ Sí |
| `COSINE_THRESHOLD` | `0.65` | Opcional (default en código) |
| `INSIGHTFACE_MODEL` | `buffalo_l` | Opcional (default en código) |
| `INSIGHTFACE_DET_SIZE` | `640` | Opcional (default en código) |

> **`PORT`** → NO configurar nunca. Cloud Run lo inyecta automáticamente como `8080`.

---

## Variables de entorno en Cloud Run — lista COMPLETA

| Variable | Valor | Notas |
|---|---|---|
| `DATABASE_URL` | `mysql+aiomysql://claude_user:defgo244r*@34.162.109.112:3307/Desplegables` | ⚠️ Credencial sensible |
| `COSINE_THRESHOLD` | `0.65` | Opcional |
| `INSIGHTFACE_MODEL` | `buffalo_l` | Opcional |
| `INSIGHTFACE_DET_SIZE` | `640` | Opcional |
| `FRONTEND_DIR` | `/app/frontend` | **Obligatoria en Cloud Run** |
| `GCP_PROJECT_ID` | `eternal-brand-454501-i8` | Opcional (tiene fallback en código) — habilita correlación de trace en Cloud Logging |
| `LOG_LEVEL` | `INFO` | Opcional (default en código) |

> `PORT` → NO configurar. Cloud Run lo inyecta automáticamente.

---

## Diagnóstico rápido — ver logs ANTES de consumir el URL

```bash
# Ver logs del último arranque (imprescindible para diagnosticar 503)
gcloud run services logs read logyser-facial \
  --region us-central1 \
  --limit 50

# En tiempo real
gcloud run services logs tail logyser-facial --region us-central1
```

> El servicio real en producción se llama `biometrico` en la región `europe-west1` (el nombre `logyser-facial`/`us-central1` de este documento es el ejemplo original de la plantilla). Sustituye esos dos valores en todos los comandos de esta guía.

---

## Logging estructurado (Cloud Logging)

El backend emite JSON estructurado por stdout en cada línea (una línea = un evento), siguiendo el contrato nativo que Cloud Logging parsea automáticamente sin necesidad de ningún agente ni librería adicional:

- `severity`: `INFO` / `WARNING` / `ERROR` / `CRITICAL` — Cloud Logging lo usa para colorear y filtrar.
- `message`: texto legible del evento.
- `time`: timestamp RFC3339 en UTC.
- `logging.googleapis.com/trace`: correlaciona todos los logs de una misma request con su trace en Cloud Trace (requiere que `GCP_PROJECT_ID` esté bien configurado — ver abajo).
- `logging.googleapis.com/labels`: por ahora solo `component` (qué módulo generó el log: `http`, `startup`, `verify`, etc.).
- `request_id`: id corto único por request, útil para buscar "todo lo que pasó en esta petición" aunque el trace de GCP no esté disponible.
- `httpRequest`: en los logs de tipo `http_request` (uno por cada petición HTTP), con `requestMethod`, `requestUrl`, `status`, `latency` (string tipo `"0.017s"`), `remoteIp`, `userAgent` — Cloud Logging reconoce este campo y lo muestra en la columna especial de peticiones HTTP del Log Explorer.
- Excepciones no controladas se loguean con `severity=ERROR` y el stack trace dentro de `message`, lo que activa automáticamente **Error Reporting** de GCP sin configuración extra.

### Variable de entorno necesaria para correlación de traces

| Variable | Valor | Notas |
|---|---|---|
| `GCP_PROJECT_ID` | ID del proyecto GCP (ej. `eternal-brand-454501-i8`) | Cloud Run **no** la inyecta automáticamente. Sin ella, los logs se siguen viendo bien pero sin el link al trace en Cloud Trace. |

Por defecto el código usa `eternal-brand-454501-i8` como fallback si la variable no está configurada, pero es más seguro fijarla explícitamente como env var del servicio.

### Consultas útiles en Log Explorer (Cloud Console → Logging → Explorador de registros)

```
# Solo errores
resource.type="cloud_run_revision"
resource.labels.service_name="biometrico"
severity>=ERROR

# Seguir un usuario específico en verify_attempt
jsonPayload.identificacion=1001510303

# Ver todas las peticiones lentas (>1s)
jsonPayload.duration_ms>1000

# Ver todo lo que pasó en una request puntual (usando el request_id de un log de error)
jsonPayload.request_id="ba58ab59e9744c4d9ad5101c9c965ec6"

# Solo intentos de verificación facial fallidos
jsonPayload.verify_status="rejected"
```

También puedes crear **alertas basadas en métricas de logs** (Logging → Métricas basadas en registros → Crear métrica, filtro `severity>=ERROR`) y conectarlas a Cloud Monitoring para recibir notificaciones en tiempo real ante picos de errores — el mismo patrón que usan sistemas de referencia como Stripe o Datadog para "real-time monitoring" basado en logs.

---

## Comando de despliegue completo

```bash
# 1. Construir y subir imagen
gcloud builds submit \
  --tag gcr.io/TU_PROJECT_ID/logyser-facial:latest \
  --timeout=20m

# 2. Desplegar en Cloud Run
gcloud run deploy logyser-facial \
  --image gcr.io/TU_PROJECT_ID/logyser-facial:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 4Gi \
  --cpu 4 \
  --concurrency 20 \
  --min-instances 2 \
  --max-instances 40 \
  --timeout 300 \
  --startup-cpu-boost \
  --set-env-vars "DATABASE_URL=mysql+aiomysql://claude_user:defgo244r*@34.162.109.112:3307/Desplegables,COSINE_THRESHOLD=0.65,INSIGHTFACE_MODEL=buffalo_l,INSIGHTFACE_DET_SIZE=640"
```

> `--startup-cpu-boost` → Cloud Run asigna CPU extra durante el arranque, acelerando la carga del modelo ONNX.

---

## Configuración recomendada del servicio Cloud Run (soporta ~2000 usuarios simultáneos)

| Parámetro | Valor | Razón |
|---|---|---|
| **Memoria** | `4 GiB` | InsightFace + ONNX Runtime (~800 MB) más el pool de 24 hilos de inferencia concurrente |
| **vCPU** | `4` | Más paralelismo real para la inferencia ArcFace bajo carga alta |
| **Concurrencia** | `20` | Máx. solicitudes simultáneas por instancia — la inferencia ya corre en un pool de hilos aparte, no bloquea el event loop |
| **Timeout** | `300 s` | Enrolamiento con 3 frames grandes puede tardar |
| **Min instancias** | `2` | Evita que TODAS las instancias arranquen en frío a la vez durante un pico de demanda |
| **Max instancias** | `40` | Techo real de capacidad: 40 × 20 = 800 solicitudes simultáneas de margen |
| **Startup CPU boost** | ✅ | Activa más CPU durante el arranque inicial |

Con estos valores el techo de capacidad pasa de 50 solicitudes simultáneas (5 × 10) a 800 (40 × 20) — muy por encima de los ~2000 usuarios "al mismo tiempo" reales, que rara vez coinciden en el mismo segundo exacto (cada marcación toma 1-3 s y la app ya reintenta en segundo plano si una sincronización puntual falla). `--min-instances 2` tiene costo fijo permanente (dos instancias siempre encendidas); ajusta ese número si el presupuesto es una limitante.

---

## Comportamiento del startup (nuevo)

```
T+0s   Uvicorn inicia → escucha en $PORT → Cloud Run OK ✅
T+1s   init_db() ejecuta (MySQL handshake, rápido)
T+1s   create_task(_load_model_background()) lanzado
T+2s   Servidor acepta requests — /api/health responde {"model_loaded": false}
T+30s  InsightFace termina de cargar
T+30s  /api/health responde {"model_loaded": true}
```

Los primeros requests de verify/enrollment que lleguen antes de T+30s recibirán un error 500 o esperarán en cola, pero el servidor NO hace timeout en Cloud Run.

---

## Verificar el despliegue

```bash
# URL del servicio
gcloud run services describe logyser-facial \
  --region us-central1 \
  --format 'value(status.url)'

# Health check inmediato (model_loaded puede ser false aún)
curl https://TU_URL.run.app/api/health

# Después de ~30s, model_loaded debería ser true
curl https://TU_URL.run.app/api/health
# {"status":"ok","model_loaded":true}

# Ver logs en tiempo real
gcloud run services logs tail logyser-facial --region us-central1
```

---

## Notas de seguridad para producción

- **DATABASE_URL** contiene credenciales → usar **Secret Manager** de GCP en vez de env var plana
- **HTTPS** es automático en Cloud Run → cámara PWA y Service Worker funcionan sin config extra
- **MediaPipe** se descarga desde `unpkg.com` en el navegador del cliente, no en el servidor
