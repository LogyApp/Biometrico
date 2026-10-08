function itemTimestamp(item) {
  return item.payload.clientTimestamp
    ?? item.payload.finishPayload?.client_timestamp
    ?? item.createdAt;
}

function toPseudoRecord(item) {
  const pending = item.status !== 'failed';
  const base = {
    id: `outbox-${item.id}`,
    fecha_hora: new Date(itemTimestamp(item)).toISOString(),
    _pending: pending,
    _failed: !pending,
  };

  if (item.type === 'verify') {
    return {
      ...base,
      tipo_registro: 'marcacion',
      tipo: item.payload.tipo,
      es_manual: false,
    };
  }

  if (item.type === 'manual') {
    return {
      ...base,
      tipo_registro: 'marcacion',
      tipo: item.payload.tipo,
      es_manual: true,
    };
  }

  if (item.type === 'movimiento') {
    return {
      ...base,
      tipo_registro: 'movimiento',
      tipo: item.payload.startPayload?.tipo ?? 'LIBRE',
      estado: 'COMPLETADO',
      dir_destino: item.payload.startPayload?.direccion_destino ?? null,
    };
  }

  return null;
}

export function outboxToPseudoRecords(items) {
  return items.map(toPseudoRecord).filter(Boolean);
}
