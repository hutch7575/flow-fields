import { simulateTick } from "./simulation.js";
import { clamp } from "./math.js";

/**
 * Renders and simulates a single particle, returning what was drawn so the
 * caller can optionally record it (e.g. for exact-match SVG export).
 */
const renderParticle = (context, color, particle, config) => {
  const fromX = particle.x;
  const fromY = particle.y;

  context.strokeStyle = color;
  context.lineWidth =
    clamp(
      config.minPenWidth,
      config.maxPenWidth,
      Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy)
    ) * (config.lineScale || 1);

  context.beginPath();
  context.moveTo(particle.x, particle.y);
  const { outOfBounds } = simulateTick(particle, config);

  if (!outOfBounds) {
    /**
     * We only render particles if the didn't wrap around the screen.
     * If we render these paths, the screen will be filled with
     * horizontal/vertical lines
     */
    context.lineTo(particle.x, particle.y);
    context.stroke();
  }

  return {
    outOfBounds,
    from: { x: fromX, y: fromY },
    to: { x: particle.x, y: particle.y },
  };
};

/**
 * Renders a single frame, simulating all particles in the process.
 * @param {CanvasRenderingContext2D} context
 * @param {number} step
 * @param {{x: number, y: number: vx: number, vy: number}[]} particles
 * @param {Object} config
 * @param {Array<Array<{x:number,y:number,color:string,outOfBounds:boolean}>>} [pathHistory]
 *   Optional accumulator, one array per particle, that this call appends to —
 *   lets the caller later rebuild the exact same drawing as a vector (SVG).
 */
export const renderFrame = (context, step, particles, config, pathHistory) => {
  const color = config.gradientFn(step / config.maxSteps).hex();

  particles.forEach((particle, i) => {
    const { outOfBounds, to } = renderParticle(context, color, particle, config);

    if (pathHistory) {
      pathHistory[i].push({ x: to.x, y: to.y, color, outOfBounds });
    }
  });

  if (config.forceReduction > 0) {
    config.force *= 1 - config.forceReduction;
  }
};
