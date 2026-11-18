import { useEffect, useRef } from "react";
import type { Scene } from "../lib/eventWeather";
import { skyLook } from "../lib/sky";

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** A cloud drawn once to its own canvas: many soft puffs, lit from above and shaded under, then blurred together. */
function cloudSprite(w: number, shade: number, isDay: boolean, sunset = false) {
  const h = w * 0.6;
  const pad = w * 0.15;
  const puffs = document.createElement("canvas");
  puffs.width = Math.ceil(w + pad * 2);
  puffs.height = Math.ceil(h + pad * 2);
  const g = puffs.getContext("2d")!;
  const lit = isDay ? [255, 255, 255] : [110, 120, 140];
  // At sunset the undersides catch pink instead of going grey.
  const dark = sunset ? [240, 175, 195] : isDay ? [110, 120, 135] : [30, 35, 45];
  const mix = (t: number) => lit.map((v, i) => Math.round(v + (dark[i] - v) * Math.min(1, t))).join(",");
  const alpha = sunset ? 0.55 : isDay ? 0.85 : 0.6;
  const n = 16 + Math.floor(Math.random() * 10);
  for (let i = 0; i < n; i++) {
    // Puffs pile up in the middle: a domed top and a flatter base.
    const u = Math.random();
    const x = pad + w * (0.1 + 0.8 * u);
    const dome = Math.sin(u * Math.PI);
    const r = w * rand(0.07, 0.13) * (0.6 + dome * 0.6);
    const y = pad + h * (0.72 - dome * rand(0.15, 0.4));
    // Lower puffs sit in their own shadow.
    const under = shade + ((y - pad) / h) * 0.35;
    const grad = g.createRadialGradient(x - r * 0.2, y - r * 0.35, r * 0.05, x, y, r);
    grad.addColorStop(0, `rgba(${mix(under * 0.5)},${alpha})`);
    grad.addColorStop(0.6, `rgba(${mix(under)},${alpha * 0.6})`);
    grad.addColorStop(1, `rgba(${mix(under)},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const c = document.createElement("canvas");
  c.width = puffs.width;
  c.height = puffs.height;
  const out = c.getContext("2d")!;
  out.filter = `blur(${Math.max(3, w * 0.02)}px)`;
  out.drawImage(puffs, 0, 0);
  return c;
}

/** A jagged lightning bolt from the top, with a branch or two. */
function boltPath(w: number, h: number) {
  const paths: [number, number][][] = [];
  const grow = (x: number, y: number, len: number, depth: number) => {
    const path: [number, number][] = [[x, y]];
    const end = Math.min(h, y + len);
    while (y < end) {
      y += rand(6, 16);
      x += rand(-10, 10);
      path.push([x, y]);
      if (depth < 2 && Math.random() < 0.08) grow(x, y, len * 0.35, depth + 1);
    }
    paths.push(path);
  };
  grow(rand(w * 0.35, w * 0.9), 0, h * rand(0.6, 0.95), 0);
  return paths;
}

interface Drop { x: number; y: number; len: number; z: number }
interface Splash { x: number; y: number; t: number }
interface Cloud { sprite: HTMLCanvasElement; x: number; y: number; v: number }

/**
 * A live sky behind an event card: sun or moon and stars, drifting clouds, rain with splashes, fog
 * and lightning, as the forecast says. It is only built and animated while near the screen, and holds
 * still for reduced motion. How grey the sky is, how many clouds and how hard it rains follow the hour's cloud
 * cover and rainfall, so a light shower under broken cloud stays bright. `transparent` leaves out the
 * sky so the sun and clouds sit on whatever is behind, as sunny hours on a forecast strip do.
 */
export function WeatherScene({
  scene,
  isDay,
  cloudCover,
  rainMm,
  at,
  className,
  transparent = false,
}: {
  scene: Scene;
  isDay: boolean;
  cloudCover?: number;
  rainMm?: number;
  at?: string;
  className?: string;
  transparent?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const build = skyLook({ scene, isDay, cloudCover, rainMm, at });
    const { top, mid, bottom } = build;

    let w = 0;
    let h = 0;
    let clouds: Cloud[] = [];
    let drops: Drop[] = [];
    let splashes: Splash[] = [];
    let stars: { x: number; y: number; r: number; p: number }[] = [];
    let flash = 0;
    let bolt: [number, number][][] = [];
    let nextFlash = rand(1.5, 4);
    const wind = scene === "storm" || scene === "downpour" ? -0.22 : -0.08;

    const layout = () => {
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = box.width;
      h = box.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      clouds = Array.from({ length: build.clouds }, (_, i) => {
        // A small box (an hour on the strip) gets smaller clouds; on a bare background they're shaded to show up.
        const size = rand(0.4, 0.8) * (w < 160 ? w * 1.6 : Math.max(w, 260));
        return { sprite: cloudSprite(size, transparent ? Math.max(build.shade, 0.3) : build.shade, isDay, build.hour === "sunset"), x: rand(-size * 0.5, w), y: rand(-0.45, 0.15) * h - (i % 2) * 10, v: rand(4, 12) * (1 + (i % 3) * 0.4) };
      });
      // A small box needs more drops per pixel to read as the same rain.
      drops = Array.from({ length: Math.round((w * h * build.rain * (w < 160 ? 2.5 : 1)) / 10_000) }, () => ({ x: rand(0, w * 1.2), y: rand(-h, h), len: build.speed > 500 ? rand(14, 30) : rand(6, 12), z: rand(0.35, 1) }));
      stars = !transparent && !isDay && build.light > 0.1 ? Array.from({ length: Math.round((w * h * build.light) / 1400) }, () => ({ x: rand(0, w), y: rand(0, h * 0.8), r: rand(0.3, 1.1), p: rand(0, Math.PI * 2) })) : [];
    };

    const draw = (t: number, dt: number) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, top);
      if (mid) sky.addColorStop(0.5, mid);
      sky.addColorStop(1, bottom);
      if (transparent) ctx.clearRect(0, 0, w, h);
      else {
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
      }

      for (const s of stars) {
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 1.3 + s.p);
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Sun or moon: on a card, on the right below the badges and clear of the copy; in a small box, in the middle.
      if (build.light > 0.05) {
        ctx.globalAlpha = Math.min(1, build.light * 1.4);
        const small = w < 160;
        const cx = small ? w / 2 : w * 0.84;
        const cy = small ? h * 0.42 : Math.max(h * 0.55, Math.min(h - 30, 90));
        const disc = small ? Math.min(w, h) * 0.14 : 13;
        if (isDay && transparent) {
          // A drawn sun, since there's no sky to light: a warm halo, turning rays and a disc.
          const halo = ctx.createRadialGradient(cx, cy, disc * 0.5, cx, cy, disc * 3);
          halo.addColorStop(0, "rgba(255,196,60,0.45)");
          halo.addColorStop(1, "rgba(255,196,60,0)");
          ctx.fillStyle = halo;
          ctx.fillRect(0, 0, w, h);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(t * 0.25);
          ctx.strokeStyle = "rgba(245,166,35,0.85)";
          ctx.lineWidth = Math.max(1.5, disc * 0.18);
          ctx.lineCap = "round";
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            const out = disc * (1.75 + 0.15 * Math.sin(t * 2 + i));
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * disc * 1.35, Math.sin(a) * disc * 1.35);
            ctx.lineTo(Math.cos(a) * out, Math.sin(a) * out);
            ctx.stroke();
          }
          ctx.restore();
          const face = ctx.createRadialGradient(cx - disc * 0.3, cy - disc * 0.3, 0, cx, cy, disc);
          face.addColorStop(0, "#ffe27a");
          face.addColorStop(1, "#f7a51c");
          ctx.fillStyle = face;
          ctx.beginPath();
          ctx.arc(cx, cy, disc, 0, Math.PI * 2);
          ctx.fill();
        } else if (isDay) {
          const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * (0.9 + 0.04 * Math.sin(t * 0.8)));
          glow.addColorStop(0, "rgba(255,248,220,0.95)");
          glow.addColorStop(0.12, "rgba(255,236,170,0.8)");
          glow.addColorStop(0.35, "rgba(255,220,140,0.25)");
          glow.addColorStop(1, "rgba(255,220,140,0)");
          ctx.fillStyle = glow;
          ctx.fillRect(0, 0, w, h);
        } else {
          const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, disc * 3.5);
          glow.addColorStop(0, transparent ? "rgba(230,200,110,0.3)" : "rgba(220,230,255,0.35)");
          glow.addColorStop(1, "rgba(220,230,255,0)");
          ctx.fillStyle = glow;
          ctx.fillRect(0, 0, w, h);
          // A crescent: the disc clipped by a slightly offset circle, so nothing is painted over the glow.
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, w, h);
          ctx.arc(cx + disc * 0.45, cy - disc * 0.3, disc * 0.85, 0, Math.PI * 2, true);
          ctx.clip("evenodd");
          ctx.fillStyle = transparent ? "#e6c66e" : "#eef2ff";
          ctx.beginPath();
          ctx.arc(cx, cy, disc, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }

      for (const c of clouds) {
        c.x += c.v * dt;
        if (c.x > w) c.x = -c.sprite.width;
        ctx.drawImage(c.sprite, c.x, c.y);
      }

      if (build.fog) {
        for (let i = 0; i < 4; i++) {
          const y = h * (0.35 + i * 0.18) + Math.sin(t * 0.3 + i) * 6;
          const band = ctx.createLinearGradient(0, y - 30, 0, y + 30);
          const a = scene === "fog" ? 0.35 : 0.18;
          band.addColorStop(0, "rgba(220,226,232,0)");
          band.addColorStop(0.5, `rgba(220,226,232,${a})`);
          band.addColorStop(1, "rgba(220,226,232,0)");
          ctx.fillStyle = band;
          ctx.fillRect(0, y - 30, w, 60);
        }
      }

      if (drops.length) {
        ctx.lineCap = "round";
        for (const d of drops) {
          const v = build.speed * d.z;
          d.y += v * dt;
          d.x += v * wind * dt;
          if (d.y > h) {
            if (build.speed > 500 && d.z > 0.7 && splashes.length < 60) splashes.push({ x: d.x, y: h - rand(1, 6), t: 0 });
            d.y = rand(-40, -5);
            d.x = rand(0, w * 1.2);
          }
          // White streaks vanish on a light sunset sky, so there they're a dusky blue.
          ctx.strokeStyle = build.hour === "sunset" ? `rgba(80,95,150,${0.2 + d.z * 0.35})` : `rgba(210,225,245,${0.25 + d.z * 0.4})`;
          ctx.lineWidth = d.z * (build.speed > 500 ? 1.2 : 0.8);
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - d.len * wind * d.z, d.y - d.len * d.z);
          ctx.stroke();
        }
        splashes = splashes.filter((s) => (s.t += dt) < 0.3);
        for (const s of splashes) {
          ctx.strokeStyle = `rgba(210,225,245,${0.5 * (1 - s.t / 0.3)})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, 2 + s.t * 18, 0.6 + s.t * 4, 0, Math.PI, 0);
          ctx.stroke();
        }
      }

      if (build.flash) {
        nextFlash -= dt;
        if (nextFlash <= 0) {
          flash = 1;
          bolt = Math.random() < 0.6 ? boltPath(w, h) : [];
          nextFlash = rand(3, 8);
        }
        if (flash > 0) {
          // Two quick flickers, then a fade.
          const f = flash > 0.75 ? 1 : flash > 0.6 ? 0.3 : flash;
          ctx.fillStyle = `rgba(225,232,255,${0.55 * f})`;
          ctx.fillRect(0, 0, w, h);
          if (bolt.length) {
            ctx.save();
            ctx.strokeStyle = `rgba(245,248,255,${f})`;
            ctx.shadowColor = "rgba(190,205,255,0.9)";
            ctx.shadowBlur = 12;
            for (const [i, p] of bolt.entries()) {
              ctx.lineWidth = i === bolt.length - 1 ? 2 : 1;
              ctx.beginPath();
              p.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
              ctx.stroke();
            }
            ctx.restore();
          }
          flash -= dt * 2.2;
        }
      }
    };

    let raf = 0;
    let last = 0;
    let visible = false;
    let built = false;
    let t = rand(0, 100);
    const frame = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      t += dt;
      draw(t, dt);
      raf = visible ? requestAnimationFrame(frame) : 0;
    };
    const start = () => {
      if (raf || still) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    // Gives the pixels back. A long schedule has a sky on every card, and phones cap how much canvas a page may hold.
    const release = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      clouds = [];
      drops = [];
      stars = [];
      canvas.width = canvas.height = 0;
      built = false;
    };

    // Built only when the card is about to scroll into view and released once it's well past, so only
    // the skies near the screen hold memory. The first frame is the only one for reduced motion; drops
    // start spread mid-fall so it still reads as rain.
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (!visible) return release();
        if (!built) {
          layout();
          built = w > 0;
          if (built) draw(t, 0);
        }
        if (built) start();
      },
      { rootMargin: "50% 0px" },
    );
    io.observe(canvas);
    const ro = new ResizeObserver(() => {
      const box = canvas.getBoundingClientRect();
      if (!visible || (built && box.width === w && box.height === h)) return;
      layout();
      built = w > 0;
      if (built) draw(t, 0);
      if (built) start();
    });
    ro.observe(canvas);
    return () => {
      io.disconnect();
      ro.disconnect();
      release();
    };
  }, [scene, isDay, cloudCover, rainMm, at, transparent]);

  return <canvas ref={ref} aria-hidden className={className} />;
}
