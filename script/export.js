import simplify from "./lib/simplifyPath.js";
import fitCurve from "./lib/fitCurve.js";
import { simulateTick } from "./simulation.js";
import { createParticles } from "./simulation.js";
import rnd from "./random.js";
import { deserializeConfig } from "./form.js";
import * as noise from "./lib/noise.js";

// See script/svg.js for why this is necessary: functions rebuilt via eval()
// during deserialization lose their original module closures. flowFieldFn
// (e.g. Perlin Noise) references `noise` from its closure, so it needs to
// be resolvable as a global in here.
globalThis.noise = noise;

const SIMPLIFY_TOLERANCE = 10;
const CURVE_FITTING_ERROR = 200;

/**
 * Runs the full simulation at the export's target resolution and reports
 * progress as it goes. Returns one path (a list of {x,y,color} points) per
 * particle lifetime segment, exactly mirroring the on-screen renderer's logic.
 */
const simulate = (config, onProgress) => {
  rnd.reset();

  const particles = createParticles(config);
  const paths = [];
  let currentPathIndex = 0;

  for (let i = 0; i < particles.length; i++) {
    paths.push([]);
  }

  // We simulate step-by-step across all particles (rather than particle-by-particle)
  // so we can report smooth, evenly-spaced progress and apply the same per-step
  // gradient color the on-screen renderer uses.
  let force = config.force;
  for (let step = 0; step < config.maxSteps; step++) {
    const color = config.gradientFn(step / config.maxSteps).hex();
    const stepConfig = { ...config, force };

    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const { outOfBounds } = simulateTick(particle, stepConfig);

      if (outOfBounds) {
        paths[i].push({ x: particle.x, y: particle.y, color, breakAfter: true });
      } else {
        paths[i].push({ x: particle.x, y: particle.y, color });
      }
    }

    if (config.forceReduction > 0) {
      force *= 1 - config.forceReduction;
    }

    if (step % 10 === 0 || step === config.maxSteps - 1) {
      onProgress(0.1 + 0.6 * (step / config.maxSteps)); // simulation = 10%-70% of total progress
    }
  }

  return paths;
};

/**
 * Splits each particle's path into separate segments wherever it wrapped/left
 * the canvas, exactly like the SVG worker already does, but keeping colour
 * per point instead of discarding it.
 */
const splitSegments = (paths) => {
  const segments = [];
  for (const path of paths) {
    let current = [];
    for (const point of path) {
      current.push(point);
      if (point.breakAfter) {
        segments.push(current);
        current = [];
      }
    }
    if (current.length > 1) segments.push(current);
  }
  return segments;
};

const renderRaster = (config, paths, onProgress) => {
  const canvas = new OffscreenCanvas(config.width, config.height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = config.backgroundColor;
  ctx.fillRect(0, 0, config.width, config.height);

  let drawn = 0;
  const total = paths.reduce((sum, p) => sum + p.length, 0);

  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      if (curr.breakAfter || prev.breakAfter) continue;

      const vx = curr.x - prev.x;
      const vy = curr.y - prev.y;
      const speed = Math.sqrt(vx * vx + vy * vy);
      ctx.lineWidth = Math.min(
        config.maxPenWidth,
        Math.max(config.minPenWidth, speed)
      );
      ctx.strokeStyle = curr.color;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();
    }
    drawn += path.length;
    onProgress(0.7 + 0.25 * (drawn / total)); // drawing = 70%-95%
  }

  return canvas;
};

const renderColourSVG = (config, paths, onProgress) => {
  const segments = splitSegments(paths);

  let svg = `<svg width="${config.width}" height="${config.height}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `\t<rect width="${config.width}" height="${config.height}" fill="${config.backgroundColor}" />\n`;

  let done = 0;
  for (const segment of segments) {
    if (segment.length < 2) {
      done++;
      continue;
    }
    const points = segment.map((p) => [p.x, p.y]);
    const curves = fitCurve(simplify(points, SIMPLIFY_TOLERANCE), CURVE_FITTING_ERROR);
    if (curves.length === 0) {
      done++;
      continue;
    }

    const color = segment[Math.floor(segment.length / 2)].color;
    const firstCurve = curves[0];
    svg += `\t<path stroke-width="${config.minPenWidth}" d="M ${firstCurve[0][0]} ${firstCurve[0][1]} `;
    for (const curve of curves) {
      svg += `C ${curve[1][0]} ${curve[1][1]}, ${curve[2][0]} ${curve[2][1]}, ${curve[3][0]} ${curve[3][1]} `;
    }
    svg += `" stroke="${color}" fill="none" />\n`;

    done++;
    if (done % 20 === 0) onProgress(0.7 + 0.25 * (done / segments.length));
  }

  svg += `</svg>`;
  return svg;
};

onmessage = async ({ data }) => {
  const { format, width, height, backgroundColor } = data;
  const config = {
    ...deserializeConfig(data.config),
    width,
    height,
    backgroundColor,
  };

  const report = (progress) => postMessage({ type: "progress", progress });

  report(0.02);
  const paths = simulate(config, report);
  report(0.7);

  if (format === "svg") {
    const svg = renderColourSVG(config, paths, report);
    report(1);
    postMessage({ type: "done", format, result: svg });
    return;
  }

  const canvas = renderRaster(config, paths, report);
  report(0.96);
  const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
  const blob = await canvas.convertToBlob({ type: mimeType, quality: 0.95 });
  report(1);
  postMessage({ type: "done", format, result: blob });
};
