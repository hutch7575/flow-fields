import simplify from "./lib/simplifyPath.js";
import fitCurve from "./lib/fitCurve.js";

const SIMPLIFY_TOLERANCE = 10;
const CURVE_FITTING_ERROR = 200;

/**
 * Splits a particle's recorded path into separate segments wherever it
 * wrapped/left the canvas (mirrors the on-screen renderer's own behaviour of
 * not drawing a line across a wrap).
 */
const splitSegments = (path) => {
  const segments = [];
  let current = [];
  for (const point of path) {
    if (point.outOfBounds) {
      if (current.length > 1) segments.push(current);
      current = [];
      continue;
    }
    current.push(point);
  }
  if (current.length > 1) segments.push(current);
  return segments;
};

/**
 * Builds a complete, coloured SVG string from recorded path history —
 * the exact same drawing already shown on screen, just as vectors.
 *
 * @param {Array<Array<{x:number,y:number,color:string,outOfBounds:boolean}>>} pathHistory
 * @param {{width:number,height:number,backgroundColor:string,minPenWidth:number}} config
 * @param {(progress:number) => void} [onProgress]
 */
export const buildColourSVG = (pathHistory, config, onProgress) => {
  let svg = `<svg width="${config.width}" height="${config.height}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `\t<rect width="${config.width}" height="${config.height}" fill="${config.backgroundColor}" />\n`;

  const allSegments = pathHistory.flatMap(splitSegments);

  allSegments.forEach((segment, i) => {
    const points = segment.map((p) => [p.x, p.y]);
    const curves = fitCurve(simplify(points, SIMPLIFY_TOLERANCE), CURVE_FITTING_ERROR);

    if (curves.length > 0) {
      const color = segment[Math.floor(segment.length / 2)].color;
      const firstCurve = curves[0];
      const strokeWidth = config.minPenWidth * (config.lineScale || 1);
      svg += `\t<path stroke-width="${strokeWidth}" d="M ${firstCurve[0][0]} ${firstCurve[0][1]} `;
      for (const curve of curves) {
        svg += `C ${curve[1][0]} ${curve[1][1]}, ${curve[2][0]} ${curve[2][1]}, ${curve[3][0]} ${curve[3][1]} `;
      }
      svg += `" stroke="${color}" fill="none" />\n`;
    }

    if (onProgress && i % 50 === 0) {
      onProgress(i / allSegments.length);
    }
  });

  svg += `</svg>`;
  return svg;
};
