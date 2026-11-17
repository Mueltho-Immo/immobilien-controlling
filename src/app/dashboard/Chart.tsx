export type Monatswert = { monat: number; einnahmen: number; kosten: number };

const MONATE = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

export default function Chart({ werte }: { werte: Monatswert[] }) {
  const breite = 720;
  const hoehe = 260;
  const links = 56;
  const unten = 28;
  const oben = 12;
  const innenB = breite - links - 12;
  const innenH = hoehe - oben - unten;

  const rohmax = Math.max(
    0,
    ...werte.map((w) => Math.max(w.einnahmen, w.kosten))
  );
  const stufe = (v: number) => {
    if (v <= 0) return 100;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const f of [1, 2, 2.5, 5, 10]) {
      if (v <= f * p) return f * p;
    }
    return 10 * p;
  };
  const max = stufe(rohmax);

  const schritt = innenB / 12;
  const balken = Math.min(16, schritt / 2 - 2);

  const y = (v: number) => oben + innenH - (v / max) * innenH;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${breite} ${hoehe}`}
        className="w-full min-w-[640px]"
        role="img"
        aria-label="Einnahmen und Kosten je Monat"
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={links}
              x2={breite - 12}
              y1={y(max * t)}
              y2={y(max * t)}
              stroke="#e5e7eb"
            />
            <text
              x={links - 8}
              y={y(max * t) + 4}
              textAnchor="end"
              fontSize="11"
              fill="#6b7280"
            >
              {max * t >= 1000
                ? `${((max * t) / 1000).toLocaleString("de-DE", {
                    maximumFractionDigits: 1,
                  })}k`
                : (max * t).toLocaleString("de-DE", {
                    maximumFractionDigits: 0,
                  })}
            </text>
          </g>
        ))}

        {werte.map((w, i) => {
          const x = links + i * schritt + schritt / 2;
          return (
            <g key={w.monat}>
              <rect
                x={x - balken - 1}
                y={y(w.einnahmen)}
                width={balken}
                height={Math.max(0, y(0) - y(w.einnahmen))}
                fill="#15803d"
              />
              <rect
                x={x + 1}
                y={y(w.kosten)}
                width={balken}
                height={Math.max(0, y(0) - y(w.kosten))}
                fill="#b91c1c"
              />
              <text
                x={x}
                y={hoehe - 8}
                textAnchor="middle"
                fontSize="11"
                fill="#374151"
              >
                {MONATE[w.monat - 1]}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-gray-600 mt-1">
        <span className="text-green-700">■ Einnahmen</span> ·{" "}
        <span className="text-red-700">■ Kosten</span>
      </p>
    </div>
  );
}
