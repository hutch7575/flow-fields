/**
 * @link https://medium.com/@bit101/flow-fields-part-i-3ebebc688fd8
 */

import { form } from "./form.js";
import { renderFrame } from "./render.js";
import { createParticles } from "./simulation.js";
import { downloadFile } from "./download.js";
import { buildColourSVG } from "./svgBuilder.js";

/**
 * Named canvas sizes in pixels. "screen" is resolved dynamically since it
 * depends on the current window size.
 */
const CANVAS_SIZES = {
  "a4-portrait": [2480, 3508],
  "a4-landscape": [3508, 2480],
  "a3-portrait": [3508, 4961],
  "a3-landscape": [4961, 3508],
  "letter-portrait": [2550, 3300],
  "letter-landscape": [3300, 2550],
  square: [2048, 2048],
  "ig-post": [1080, 1350],
  "ig-story": [1080, 1920],
};

/**
 * Resolves the chosen canvas size option to actual pixel dimensions.
 */
const resolveCanvasSize = () => {
  const sizeSelect = document.querySelector("#canvas-size");
  if (sizeSelect.value === "screen") {
    return { width: window.innerWidth, height: window.innerHeight };
  }
  if (sizeSelect.value === "custom") {
    const width = Number.parseInt(
      document.querySelector("#canvas-width").value,
      10
    );
    const height = Number.parseInt(
      document.querySelector("#canvas-height").value,
      10
    );
    return { width, height };
  }
  const [width, height] = CANVAS_SIZES[sizeSelect.value];
  return { width, height };
};

/**
 * Scales the canvas's on-screen display size (via CSS) to fit within the
 * viewport while preserving its exact simulation pixel dimensions —
 * letterboxed/centred if the aspect ratio doesn't match the window.
 */
const fitCanvasToViewport = (canvas, padding = 32) => {
  const availW = window.innerWidth - padding * 2;
  const availH = window.innerHeight - padding * 2;
  const scale = Math.min(availW / canvas.width, availH / canvas.height, 1);

  canvas.style.width = `${canvas.width * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
  canvas.style.position = "absolute";
  canvas.style.left = "50%";
  canvas.style.top = "50%";
  canvas.style.transform = "translate(-50%, -50%)";
};

const setupCanvasSizeControl = (onSizeChange) => {
  const sizeSelect = document.querySelector("#canvas-size");
  const customContainer = document.querySelector(
    "#custom-canvas-size-container"
  );

  sizeSelect.addEventListener("change", () => {
    customContainer.classList.toggle("dn", sizeSelect.value !== "custom");
    onSizeChange();
  });

  document
    .querySelector("#canvas-width")
    .addEventListener("change", onSizeChange);
  document
    .querySelector("#canvas-height")
    .addEventListener("change", onSizeChange);
};

const setupExportModal = ({ getCanvas, getConfig, getPathHistory }) => {
  const overlay = document.querySelector("#export-overlay");
  const openBtn = document.querySelector("#open-export");
  const closeBtn = document.querySelector("#close-export");
  const formatBtns = Array.from(document.querySelectorAll(".format-btn"));
  const startBtn = document.querySelector("#start-export");
  const progressContainer = document.querySelector(
    "#export-progress-container"
  );
  const progressBar = document.querySelector("#export-progress-bar");
  const progressLabel = document.querySelector("#export-progress-label");

  let format = "png";

  const open = () => overlay.classList.remove("dn");
  const close = () => {
    overlay.classList.add("dn");
    progressContainer.classList.add("dn");
    startBtn.disabled = false;
    startBtn.textContent = "Export image";
  };

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  formatBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      formatBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      format = btn.dataset.format;
    });
  });

  const setProgress = (pct, label) => {
    progressBar.style.width = `${pct}%`;
    progressLabel.textContent = label;
  };

  const exportRaster = async (mimeType, extension) => {
    setProgress(30, "Encoding image…");
    const canvas = getCanvas();
    // give the progress bar a frame to paint before the (synchronous-ish)
    // encode work runs, so it doesn't look stuck at 0%
    await new Promise((r) => requestAnimationFrame(r));

    canvas.toBlob(
      (blob) => {
        setProgress(100, "Done!");
        downloadFile(blob, `flow-field.${extension}`, mimeType);
        setTimeout(close, 400);
      },
      mimeType,
      0.95
    );
  };

  const exportSVG = async () => {
    setProgress(10, "Building vectors…");
    await new Promise((r) => requestAnimationFrame(r));

    const config = getConfig();
    const svg = buildColourSVG(getPathHistory(), config, (p) => {
      setProgress(10 + Math.round(p * 85), `Building vectors… ${Math.round(p * 100)}%`);
    });

    setProgress(100, "Done!");
    downloadFile(svg, "flow-field.svg", "image/svg+xml");
    setTimeout(close, 400);
  };

  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    startBtn.textContent = "Exporting…";
    progressContainer.classList.remove("dn");
    setProgress(0, "Starting…");

    if (format === "png") await exportRaster("image/png", "png");
    else if (format === "jpeg") await exportRaster("image/jpeg", "jpg");
    else await exportSVG();
  });
};

const main = () => {
  /** @type {HTMLCanvasElement} */
  const canvas = document.querySelector("#canvas");
  const context = canvas.getContext("2d");

  /** @type {HTMLCanvasElement} */
  const flowCanvas = document.querySelector("#flow-canvas");
  const flowContext = flowCanvas.getContext("2d");

  let renderFrameId = -1;
  let step = 0;
  let particles = [];
  let pathHistory = [];

  const f = form({ getCanvasSize: resolveCanvasSize });

  const applyCanvasSize = () => {
    const { width, height } = resolveCanvasSize();
    canvas.width = width;
    canvas.height = height;
    flowCanvas.width = width;
    flowCanvas.height = height;
    fitCanvasToViewport(canvas);
    fitCanvasToViewport(flowCanvas);
  };

  const restart = () => {
    f.refreshConfig();
    applyCanvasSize();

    step = 0;
    particles = createParticles(f.getConfig());
    pathHistory = particles.map(() => []);

    context.clearRect(0, 0, canvas.width, canvas.height);

    cancelAnimationFrame(renderFrameId);
    render();
  };

  applyCanvasSize();
  particles = createParticles(f.getConfig());
  pathHistory = particles.map(() => []);

  window.addEventListener("resize", () => {
    if (document.querySelector("#canvas-size").value === "screen") {
      restart();
    } else {
      // size doesn't depend on the window, just re-fit the display scale
      fitCanvasToViewport(canvas);
      fitCanvasToViewport(flowCanvas);
    }
  });

  setupCanvasSizeControl(restart);

  document.querySelector("#restart").addEventListener("click", restart);

  const renderFlow = () => {
    const config = f.getConfig();

    flowContext.clearRect(0, 0, config.width, config.height);

    if (config.flowFieldFunction === "image") {
      flowContext.putImageData(config.flowFieldFnData.imageData, 0, 0);
    }

    const resolution = 16;
    const previousStrokeStyle = flowContext.strokeStyle;
    flowContext.lineWidth = 1;
    flowContext.strokeStyle = "#FA0F22";

    for (let x = 0; x < config.width; x += resolution) {
      for (let y = 0; y < config.height; y += resolution) {
        const { force, angle } = config.flowFieldFn(
          config.flowFieldFnData,
          x,
          y,
          config.width,
          config.height
        );

        flowContext.save();
        flowContext.translate(x, y);
        flowContext.rotate(angle);
        flowContext.beginPath();
        flowContext.moveTo(0, 0);
        flowContext.lineTo(resolution * force, 0);
        flowContext.lineTo(resolution * force - 4, -4);
        flowContext.moveTo(resolution * force, 0);
        flowContext.lineTo(resolution * force - 4, 4);
        flowContext.stroke();
        flowContext.restore();
      }
    }

    flowContext.strokeStyle = previousStrokeStyle;
  };

  const toggleFlowVisibilityTurnOnIcon = document.querySelector(
    "#toggle-flow-visibility #turn-on"
  );
  const toggleFlowVisibilityTurnOffIcon = document.querySelector(
    "#toggle-flow-visibility #turn-off"
  );
  document
    .querySelector("#toggle-flow-visibility")
    .addEventListener("click", () => {
      toggleFlowVisibilityTurnOnIcon.classList.toggle("dn");
      toggleFlowVisibilityTurnOffIcon.classList.toggle("dn");

      if (toggleFlowVisibilityTurnOnIcon.classList.contains("dn")) {
        renderFlow();
      } else {
        flowContext.clearRect(0, 0, canvas.width, canvas.height);
      }
    });

  setupExportModal({
    getCanvas: () => canvas,
    getConfig: () => f.getConfig(),
    getPathHistory: () => pathHistory,
  });

  const render = () => {
    renderFrame(context, step, particles, f.getConfig(), pathHistory);

    step += 1;
    if (f.getConfig().maxSteps === 0 || step < f.getConfig().maxSteps) {
      renderFrameId = requestAnimationFrame(render);
    }
  };

  renderFrameId = requestAnimationFrame(render);
};

document.addEventListener("DOMContentLoaded", main);
