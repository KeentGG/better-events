/*
 * Line drawings kept for the design preview: a MassKara mask with its feather crown, and a
 * burst of crown petals that doubles as a nod to the sun of the Philippine flag.
 */

function petal(cx: number, cy: number, deg: number, r1: number, r2: number, w: number) {
  const a = (deg * Math.PI) / 180;
  const [ux, uy] = [Math.cos(a), Math.sin(a)];
  const [px, py] = [-uy, ux];
  const bx = cx + ux * r1;
  const by = cy + uy * r1;
  const tx = cx + ux * r2;
  const ty = cy + uy * r2;
  const mx = cx + ux * ((r1 + r2) / 2);
  const my = cy + uy * ((r1 + r2) / 2);
  const f = (n: number) => n.toFixed(1);
  return `M${f(bx)} ${f(by)}Q${f(mx + px * w)} ${f(my + py * w)} ${f(tx)} ${f(ty)}Q${f(mx - px * w)} ${f(my - py * w)} ${f(bx)} ${f(by)}Z`;
}

const range = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

/** A smiling MassKara mask with a crown of feathers and a ring of sequins. */
export function MaskArt({ className }: { className?: string }) {
  const [cx, cy] = [200, 250];
  return (
    <svg viewBox="0 0 400 400" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {/* Feather crown: long and short feathers alternate */}
      {range(-168, -12, 12).map((d, i) => (
        <path key={d} d={petal(cx, cy, d, 112, i % 2 ? 176 : 205, i % 2 ? 9 : 13)} />
      ))}
      {range(-162, -18, 12).map((d) => (
        <circle key={d} cx={cx + Math.cos((d * Math.PI) / 180) * 222} cy={cy + Math.sin((d * Math.PI) / 180) * 222} r="3" />
      ))}
      {/* Face */}
      <path d="M92 236C92 180 140 150 200 150S308 180 308 236C308 300 262 344 200 344S92 300 92 236Z" />
      <path d="M118 218Q152 186 186 216Q152 238 118 218Z" />
      <path d="M214 216Q248 186 282 218Q248 238 214 216Z" />
      <path d="M126 196Q150 176 176 186M224 186Q250 176 274 196" />
      <path d="M130 270Q200 336 270 270Q200 300 130 270Z" />
      <path d="M200 160V180M186 170H214" />
      {[
        [108, 262],
        [292, 262],
        [120, 290],
        [280, 290],
      ].map(([x, y]) => (
        <circle key={x * y} cx={x} cy={y} r="4" />
      ))}
    </svg>
  );
}

/** A half burst of crown petals, like a rising sun. */
export function BurstArt({ className }: { className?: string }) {
  const [cx, cy] = [200, 200];
  return (
    <svg viewBox="0 0 400 400" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={className} aria-hidden>
      <circle cx={cx} cy={cy} r="54" />
      <circle cx={cx} cy={cy} r="40" strokeDasharray="2 7" />
      {range(0, 345, 15).map((d, i) => (
        <path key={d} d={petal(cx, cy, d, 68, i % 2 ? 128 : 168, i % 2 ? 7 : 11)} />
      ))}
      {range(7.5, 360, 15).map((d, i) => (
        <ellipse
          key={d}
          cx={cx + Math.cos((d * Math.PI) / 180) * (i % 2 ? 186 : 196)}
          cy={cy + Math.sin((d * Math.PI) / 180) * (i % 2 ? 186 : 196)}
          rx="3"
          ry="6"
          transform={`rotate(${d + 90} ${cx + Math.cos((d * Math.PI) / 180) * (i % 2 ? 186 : 196)} ${cy + Math.sin((d * Math.PI) / 180) * (i % 2 ? 186 : 196)})`}
        />
      ))}
    </svg>
  );
}

