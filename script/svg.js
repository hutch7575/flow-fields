import simplify from "./lib/simplifyPath.js";
import fitCurve from "./lib/fitCurve.js";
import { simulateTick } from "./simulation.js";
import { createParticles } from "./simulation.js";
import rnd from "./random.js";
import { deserializeConfig } from "./form.js";
import * as noise from "./lib/noise.js";

// `deserializeConfig` rebuilds flow-field functions via eval() from their
// serialized source text (see lib/jsonfn.js). Reconstructed this way, they
// lose their original module closures — so any flow field that references an
// imported binding (like Perlin Noise referencing `noise`) needs that
// binding to exist as a *global* the eval'd function can resolve instead.
globalThis.noise = noise;

const SIMPLIFY_TOLERANCE = 10;
const CURVE_FITTING_ERROR = 200;

/**
 * Simulates all particles and exports their motion to SVG format
 * @returns {string} SVG contents
 */
onmessage = ({ data }) => {
  const config = deserializeConfig(data);

  rnd.reset();

  const particles = createParticles(config);
  const paths = [];

  /**
   * We first simulate all particles and store their paths in an array
   */
  let currentPathIndex = 0;
  for (const particle of particles) {
    paths.push([]);

    for (let step = 0; step < config.maxSteps; step++) {
      const { outOfBounds } = simulateTick(particle, config);

      if (outOfBounds) {
        /**
         * The particle went around the screen so we finish the
         * current path and create a new one to prevent ugly artifacts
         */
        paths.push([{ x: particle.x, y: particle.y }]);
        currentPathIndex += 1;
      } else {
        paths[currentPathIndex].push({ x: particle.x, y: particle.y });
      }
    }

    currentPathIndex += 1;
  }

  const curvePaths = paths
    .map((path) => simplify(path, SIMPLIFY_TOLERANCE))
    .map((path) =>
      fitCurve(
        path.map((p) => [p.x, p.y]),
        CURVE_FITTING_ERROR
      )
    )
    .filter((path) => path.length > 0);

  let svg = `<svg width="${config.width}" height="${config.height}" xmlns="http://www.w3.org/2000/svg">\n`;
  for (const path of curvePaths) {
    const firstCurve = path[0];

    /**
     * @see https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths
     */
    svg += `\t<path stroke-width="0.1" d="M ${firstCurve[0][0]} ${firstCurve[0][1]} `;
    for (const curve of path) {
      svg += `C ${curve[1][0]} ${curve[1][1]}, ${curve[2][0]} ${curve[2][1]}, ${curve[3][0]} ${curve[3][1]} `;
    }
    svg += `" stroke="black" fill="none" />\n`;
  }
  svg += `</svg>`;

  postMessage(svg);
};
