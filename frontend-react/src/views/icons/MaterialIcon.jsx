export default function MaterialIcon({ name, size = 20, weight = 400, fill = 0, grade = 0, color = 'currentColor' }) {
  return (
    <span
      className="material-symbols-rounded"
      style={{
        fontSize: size,
        color,
        fontVariationSettings: `'FILL' ${fill}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${size}`,
      }}
    >
      {name}
    </span>
  );
}
