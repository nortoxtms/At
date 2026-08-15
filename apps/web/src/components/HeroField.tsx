'use client';

import { useEffect, useRef } from 'react';

/**
 * The moving ground behind the hero.
 *
 * §20.6 allows real photographs and nothing else, and there are none yet — so
 * the hero has been a flat ink rectangle. This is the alternative that does
 * not break the rule: no illustration, no stock horse, nothing depicting
 * anything. A slow field of gold motes at three depths, which reads as air
 * and distance rather than as a picture of something.
 *
 * Written against the canvas API directly rather than a 3D library. §24.18
 * gives the listing page 2.5 s to paint on 4G and the measured figure is
 * 524 ms; adding 150 kB of WebGL runtime to buy an effect this subtle would
 * spend a third of that budget on decoration. This is under 3 kB and it starts
 * after first paint, so it cannot delay LCP at all.
 *
 * Three things it refuses to do:
 *   · run before the page has painted — it mounts on an idle callback;
 *   · run when the tab is hidden — no animation frame is scheduled;
 *   · run at all under `prefers-reduced-motion`, where it draws one still
 *     frame instead. Motion sickness is not a preference to override with a
 *     nicer easing curve.
 */
interface Mote {
  x: number;
  y: number;
  z: number;
  drift: number;
}

export function HeroField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let motes: Mote[] = [];
    let width = 0;
    let height = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      // Density scaled to area, so a phone does not render a desktop's worth
      // of particles onto a tenth of the pixels.
      const count = Math.round(Math.min(120, (width * height) / 9000));
      motes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        // Three depth bands, drawn at different sizes and opacities.
        z: 0.35 + Math.random() * 0.65,
        drift: 0.15 + Math.random() * 0.5,
      }));
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);

      for (const mote of motes) {
        const y = reduced ? mote.y : (mote.y - time * 0.008 * mote.drift + height * 4) % height;
        const sway = reduced ? 0 : Math.sin((time * 0.0004 + mote.x) * mote.drift) * 6 * mote.z;
        const radius = 0.6 + mote.z * 1.7;

        context.beginPath();
        context.arc(mote.x + sway, y, radius, 0, Math.PI * 2);
        // Brass, thinned by depth. The nearest motes are still barely visible:
        // this is meant to be noticed only once you stop reading.
        context.fillStyle = `rgba(215, 179, 126, ${0.05 + mote.z * 0.16})`;
        context.fill();
      }
    };

    const loop = (time: number) => {
      draw(time);
      frame = requestAnimationFrame(loop);
    };

    const start = () => {
      resize();
      if (reduced) {
        draw(0);
        return;
      }
      frame = requestAnimationFrame(loop);
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (!reduced && !frame) frame = requestAnimationFrame(loop);
    };

    // After first paint, never before it. `requestIdleCallback` is missing on
    // Safari, so it is looked up rather than feature-tested — narrowing on
    // `'requestIdleCallback' in window` collapses the else branch to `never`
    // once the DOM lib declares it.
    const scheduleIdle: ((fn: () => void, options?: { timeout: number }) => number) | undefined = (
      window as Window & { requestIdleCallback?: (fn: () => void, options?: object) => number }
    ).requestIdleCallback;

    const cancelIdle: ((handle: number) => void) | undefined = (
      window as Window & { cancelIdleCallback?: (handle: number) => void }
    ).cancelIdleCallback;

    const idle = scheduleIdle
      ? scheduleIdle.call(window, start, { timeout: 1200 })
      : window.setTimeout(start, 200);

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      if (cancelIdle) cancelIdle.call(window, idle);
      else window.clearTimeout(idle);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
