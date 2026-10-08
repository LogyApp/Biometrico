export function buildProfileFields(worker) {
  const fields = [];
  if (worker?.cargo) fields.push({ key: 'cargo', label: 'Cargo', value: worker.cargo });
  if (worker?.operacion) fields.push({ key: 'operacion', label: 'Operación', value: worker.operacion });
  if (worker?.regional) fields.push({ key: 'regional', label: 'Regional', value: worker.regional });
  return fields;
}
