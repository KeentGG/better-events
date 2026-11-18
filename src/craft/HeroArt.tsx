import { useId } from "react";

/*
 * The header's festival art, after the splash and crown around the MassKara logo (without the mask):
 * a rainbow splash of drops that curve gently outward, a crown of gold-edged petals striped in the
 * flag's colours with a ring of pennants, and the slatted basket weave of the Bacolod airport ceiling.
 * Drawn once from fixed numbers, so it is the same on every load. It sits at a few percent opacity
 * (--hero-art-opacity, --hero-weave-opacity in src/index.css): an accent, never something to look at.
 */

const f = (n: number) => n.toFixed(1);
const rad = (d: number) => (d * Math.PI) / 180;
const hue = (t: number) => `hsl(${f(285 - t * 300)} 88% 52%)`;
type Pt = [number, number];

/** A drop that starts as a point near the centre, widens along a gentle curve and ends round. */
function drop(cx: number, cy: number, deg: number, r0: number, r1: number, w: number, bend: number) {
  const N = 22;
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = r0 + (r1 - r0) * t;
    const a = rad(deg + bend * t * t);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const [q, o] = [pts[Math.min(N, i + 1)], pts[Math.max(0, i - 1)]];
    const l = Math.hypot(q[0] - o[0], q[1] - o[1]) || 1;
    const [dx, dy] = [(q[0] - o[0]) / l, (q[1] - o[1]) / l];
    const hw = (w / 2) * Math.pow(i / N, 1.35);
    left.push([pts[i][0] - dy * hw, pts[i][1] + dx * hw]);
    right.push([pts[i][0] + dy * hw, pts[i][1] - dx * hw]);
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i <= N; i++) d += `L${f(left[i][0])} ${f(left[i][1])}`;
  d += `A${f(w / 2)} ${f(w / 2)} 0 1 0 ${f(right[N][0])} ${f(right[N][1])}`;
  for (let i = N - 1; i >= 1; i--) d += `L${f(right[i][0])} ${f(right[i][1])}`;
  const [p, o] = [pts[N], pts[N - 1]];
  const l = Math.hypot(p[0] - o[0], p[1] - o[1]);
  return { d: `${d}Z`, tip: p, dir: [(p[0] - o[0]) / l, (p[1] - o[1]) / l] as Pt };
}

interface Shape {
  d?: string;
  ellipse?: { cx: number; cy: number; rx: number; ry: number; rotate: number };
  fill: string;
  outline: number;
}

// Long and short drops alternate; the lengths vary a little so the rim isn't a perfect arc.
const LENGTHS = [1, 0.66, 0.94, 0.7, 0.98, 0.64, 0.9, 0.72, 1, 0.66, 0.95, 0.7, 0.92, 0.64, 0.97, 0.7, 1];

function splash(cx: number, cy: number, a0: number, a1: number, n: number, rin: number, rout: number, wmax: number, center: number): Shape[] {
  const out: Shape[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = a0 + (a1 - a0) * t;
    const long = i % 2 === 0;
    // Drops bend away from the middle, more the further out they point.
    const bend = ((a - center) / ((a1 - a0) / 2)) * 0.35 * 14;
    const w = wmax * (long ? 1 : 0.66);
    const s = drop(cx, cy, a, rin + (long ? 0 : 12), rout * LENGTHS[i % LENGTHS.length], w, bend);
    out.push({ d: s.d, fill: hue(t), outline: 4 });
    if (long) {
      const [x, y] = [s.tip[0] + s.dir[0] * w * 0.95, s.tip[1] + s.dir[1] * w * 0.95];
      out.push({ ellipse: { cx: x, cy: y, rx: w * 0.3, ry: w * 0.24, rotate: (Math.atan2(s.dir[1], s.dir[0]) * 180) / Math.PI }, fill: hue(t), outline: 2.5 });
    }
  }
  return out;
}

const FLAG = ["#e8102e", "#1d4fd6", "#dfe7ea", "#ffd21f", "#e8102e", "#1d4fd6", "#19b046"];

interface Petal {
  d: string;
  rotate: number;
  stripes: Array<{ x: number; fill: string }>;
  tilt: number;
  mid: number;
}

function crownPetals(n: number, a0: number, a1: number, r0: number, r1: number, w: number): Petal[] {
  return Array.from({ length: n }, (_, k) => {
    const end = k % 2 ? r1 * 0.86 : r1;
    const mid = (r0 + end) / 2;
    return {
      d: `M${f(r0)} 0Q${f(mid)} ${f(-w)} ${f(end)} 0Q${f(mid)} ${f(w)} ${f(r0)} 0Z`,
      rotate: a0 + ((a1 - a0) * k) / (n - 1),
      stripes: Array.from({ length: 26 }, (_, j) => ({ x: r0 + (j - 12) * 10, fill: FLAG[(j - 12 + k * 3 + 70) % FLAG.length] })),
      tilt: k % 2 ? 28 : -28,
      mid,
    };
  });
}

const arc = (cx: number, cy: number, r: number, a0: number, a1: number) =>
  `M${f(cx + Math.cos(rad(a0)) * r)} ${f(cy + Math.sin(rad(a0)) * r)}A${r} ${r} 0 0 1 ${f(cx + Math.cos(rad(a1)) * r)} ${f(cy + Math.sin(rad(a1)) * r)}`;

function pennants(cx: number, cy: number, r: number, a0: number, a1: number, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = rad(a0 + 4 + ((a1 - a0 - 8) * i) / (n - 1));
    const [ca, sa, ro, ri] = [Math.cos(a), Math.sin(a), r + 8, r - 8];
    return {
      d: `M${f(cx + ca * ro - sa * 5)} ${f(cy + sa * ro + ca * 5)}L${f(cx + ca * ro + sa * 5)} ${f(cy + sa * ro - ca * 5)}L${f(cx + ca * ri)} ${f(cy + sa * ri)}Z`,
      fill: hue(i / (n - 1)),
    };
  });
}

// The burst rises from below the header's bottom edge, like a sun behind the weave.
const C: Pt = [300, 312];
const BURST = splash(C[0], C[1], 186, 354, 17, 112, 255, 42, 270);
const PETALS = crownPetals(9, 198, 342, 72, 172, 22);
/** The pennant ring, just outside the petals' inner tips. */
const HALO = 77;
const PENNANTS = pennants(C[0], C[1], HALO, 198, 342, 13);
const CORNER = splash(10, 210, 266, 346, 7, 70, 170, 30, 306);

function Shapes({ shapes }: { shapes: Shape[] }) {
  return shapes.map((s, i) =>
    s.ellipse ? (
      <ellipse
        key={i}
        cx={f(s.ellipse.cx)}
        cy={f(s.ellipse.cy)}
        rx={f(s.ellipse.rx)}
        ry={f(s.ellipse.ry)}
        transform={`rotate(${f(s.ellipse.rotate)} ${f(s.ellipse.cx)} ${f(s.ellipse.cy)})`}
        fill={s.fill}
        stroke="#fff"
        strokeWidth={s.outline}
        paintOrder="stroke"
      />
    ) : (
      <path key={i} d={s.d} fill={s.fill} stroke="#fff" strokeWidth={s.outline} paintOrder="stroke" strokeLinejoin="round" />
    ),
  );
}

/** The splash and crown, for the bottom right of the header. */
export function HeroBurst({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 600 320" className={className} aria-hidden>
      <defs>
        {PETALS.map((p, k) => (
          <clipPath key={k} id={`${id}p${k}`}>
            <path d={p.d} />
          </clipPath>
        ))}
      </defs>
      <Shapes shapes={BURST} />
      {PETALS.map((p, k) => (
        <g key={k} transform={`translate(${C[0]} ${C[1]}) rotate(${f(p.rotate)})`}>
          <path d={p.d} fill="none" stroke="#fff" strokeWidth="12" strokeLinejoin="round" />
          <g clipPath={`url(#${id}p${k})`}>
            {p.stripes.map((s) => (
              <rect key={s.x} x={f(s.x)} y="-90" width="10" height="180" fill={s.fill} transform={`rotate(${p.tilt} ${f(p.mid)} 0)`} />
            ))}
          </g>
          <path d={p.d} fill="none" stroke="#f2b51c" strokeWidth="7" strokeLinejoin="round" />
          <path d={p.d} fill="none" stroke="#ffe24a" strokeWidth="2.4" strokeLinejoin="round" />
        </g>
      ))}
      <path d={arc(C[0], C[1], HALO, 198, 342)} stroke="#fff" strokeWidth="22" fill="none" />
      {[HALO - 11, HALO + 11].map((r) => (
        <path key={r} d={arc(C[0], C[1], r, 198, 342)} stroke="#f2b51c" strokeWidth="2.4" fill="none" />
      ))}
      {PENNANTS.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill} />
      ))}
    </svg>
  );
}

/** A smaller splash reaching in from the bottom left corner. */
export function HeroSplash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 220" className={className} aria-hidden>
      <Shapes shapes={CORNER} />
    </svg>
  );
}

// The airport ceiling: squares of five raised slats, turning a quarter each square, in cream with olive
// and green squares running on the diagonal. The colours repeat every 12 squares, so one tile covers it.
const SLAT = {
  cream: ["#f3e9c8", "#d9cba1"],
  olive: ["#b9a557", "#8f7d35"],
  khaki: ["#d8c88a", "#b3a266"],
  green: ["#2f9a58", "#1d6e3c"],
} as const;
const T = 14;
const ROWS = 3;
const COLS = 12;

function slatColour(i: number, j: number): keyof typeof SLAT {
  const d = (i + j) % 12;
  if (d === 0 || (d === 1 && j % 2 === 0)) return "green";
  if (d === 1 || d === 11 || d === 2) return "olive";
  if ((((i - j) % 6) + 6) % 6 === 0) return "khaki";
  return "cream";
}

const SLATS = (() => {
  const out: Array<{ x: number; y: number; w: number; h: number; fill: string }> = [];
  const gap = T / 5;
  const sw = gap * 0.62;
  for (let i = 0; i < COLS; i++)
    for (let j = 0; j < ROWS; j++) {
      const [lit, shade] = SLAT[slatColour(i, j)];
      const across = (i + j) % 2 === 0;
      for (let k = 0; k < 5; k++) {
        const o = k * gap + (gap - sw) / 2;
        const [x, y] = across ? [i * T, j * T + o] : [i * T + o, j * T];
        const [w, h] = across ? [T, sw] : [sw, T];
        // The shaded underside, then the lit top two thirds, so each slat reads as raised.
        out.push({ x, y, w, h, fill: shade });
        out.push({ x, y, w: across ? w : w * 0.62, h: across ? h * 0.62 : h, fill: lit });
      }
    }
  return out;
})();

/** A strip of the airport slat weave, three squares tall, fading in at its top edge. */
export function SlatWeave({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg className={className} height={ROWS * T} aria-hidden>
      <defs>
        <pattern id={`${id}t`} width={COLS * T} height={ROWS * T} patternUnits="userSpaceOnUse">
          <rect width={COLS * T} height={ROWS * T} fill="#2b261c" opacity="0.6" />
          {SLATS.map((s, n) => (
            <rect key={n} x={f(s.x)} y={f(s.y)} width={f(s.w)} height={f(s.h)} rx="1" fill={s.fill} />
          ))}
        </pattern>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.7" stopColor="white" stopOpacity="1" />
        </linearGradient>
        <mask id={`${id}m`}>
          <rect width="100%" height="100%" fill={`url(#${id}f)`} />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}t)`} mask={`url(#${id}m)`} />
    </svg>
  );
}
