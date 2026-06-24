/**
 * @link https://medium.com/@bit101/flow-fields-part-i-3ebebc688fd8
 */

import { form, serializeConfig } from "./form.js";
import { renderFrame } from "./render.js";
import { createParticles } from "./simulation.js";
import { downloadFile } from "./download.js";

/**
 * Resolves a named export size option to {width, height} in pixels.
 */
const EXPORT_SIZES = {
  "a4-portrait": [2480, 3508],
  "a4-landscape": [3508, 2480],
  "a3-portrait": [3508, 4961],
  "a3-landscape": [4961, 3508],
  "letter-portrait": [2550, 3300],
  "letter-landscape": [3300, 2550],
  square: [2048, 2048],
  "ig-post": [1080, 1350],
  "ig-story": [1080, 1920],
  screen: [window.innerWidth, window.innerHeight],
};

const setupExportModal = (f) => {
  const overlay = document.querySelector("#export-overlay");
  const openBtn = document.querySelector("#open-export");
  const closeBtn = document.querySelector("#close-export");
  const formatBtns = Array.from(document.querySelectorAll(".format-btn"));
  const sizeSelect = document.querySelector("#export-size");
  const customSizeContainer = document.querySelector(
    "#custom-size-container"
  );
  const widthInput = document.querySelector("#export-width");
  const heightInput = document.querySelector("#export-height");
  const startBtn = document.querySelector("#start-export");
  const progressContainer = document.querySelector(
    "#export-progress-container"
  );
  const progressBar = document.querySelector("#export-progress-bar");
  const progressLabel = document.querySelector("#export-progress-label");

  let format = "png";
  let exportWorker = null;

  const open = () => overlay.classList.remove("dn");
  const close = () => {
    overlay.classList.add("dn");
    if (exportWorker) {
      exportWorker.terminate();
      exportWorker = null;
    }
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

  sizeSelect.addEventListener("change", () => {
    if (sizeSelect.value === "custom") {
      customSizeContainer.classList.remove("dn");
    } else {
      customSizeContainer.classList.add("dn");
    }
  });

  const resolveSize = () => {
    if (sizeSelect.value === "custom") {
      return {
        width: Number.parseInt(widthInput.value, 10),
        height: Number.parseInt(heightInput.value, 10),
      };
    }
    const [width, height] = EXPORT_SIZES[sizeSelect.value];
    return { width, height };
  };

  startBtn.addEventListener("click", () => {
    const { width, height } = resolveSize();
    if (!width || !height || width <= 0 || height <= 0) {
      progressLabel.textContent = "Please enter a valid size.";
      progressContainer.classList.remove("dn");
      return;
    }

    startBtn.disabled = true;
    startBtn.textContent = "Exporting…";
    progressContainer.classList.remove("dn");
    progressBar.style.width = "0%";
    progressLabel.textContent = "Starting…";

    exportWorker = new Worker(new URL("export.js", import.meta.url), {
      type: "module",
    });

    exportWorker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        const pct = Math.round(data.progress * 100);
        progressBar.style.width = `${pct}%`;
        progressLabel.textContent = `Rendering… ${pct}%`;
        return;
      }

      if (data.type === "done") {
        progressBar.style.width = "100%";
        progressLabel.textContent = "Done!";
        const extension = data.format === "jpeg" ? "jpg" : data.format;
        const mimeType =
          data.format === "svg"
            ? "image/svg+xml"
            : data.format === "jpeg"
            ? "image/jpeg"
            : "image/png";
        downloadFile(data.result, `flow-field.${extension}`, mimeType);

        setTimeout(() => {
          startBtn.disabled = false;
          startBtn.textContent = "Export image";
        }, 400);

        exportWorker.terminate();
        exportWorker = null;
      }
    };

    exportWorker.postMessage({
      format,
      width,
      height,
      backgroundColor: document.querySelector("#bg-color").value,
      config: serializeConfig(f.getConfig()),
    });
  });
};

const main = () => {
  /**
   * @type {HTMLCanvasElement}
   */
  const canvas = document.querySelector("#canvas");
  const context = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  /**
   * @type {HTMLCanvasElement}
   */
  const flowCanvas = document.querySelector("#flow-canvas");
  const flowContext = flowCanvas.getContext("2d");
  flowCanvas.width = window.innerWidth;
  flowCanvas.height = window.innerHeight;

  let renderFrameId = -1;
  const f = form();
  let step = 0;
  let particles = createParticles(f.getConfig());

  document.querySelector("#restart").addEventListener("click", () => {
    f.refreshConfig();

    step = 0;
    particles = createParticles(f.getConfig());

    context.clearRect(0, 0, window.innerWidth, window.innerHeight);

    cancelAnimationFrame(renderFrameId);
    render();
  });

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

    for (let x = 0; x < window.innerWidth; x += resolution) {
      for (let y = 0; y < window.innerHeight; y += resolution) {
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
        flowContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    });

  setupExportModal(f);

  const render = () => {
    renderFrame(context, step, particles, f.getConfig());

    step += 1;
    if (f.getConfig().maxSteps === 0 || step < f.getConfig().maxSteps) {
      renderFrameId = requestAnimationFrame(render);
    }
  };

  renderFrameId = requestAnimationFrame(render);
};

document.addEventListener("DOMContentLoaded", main);
