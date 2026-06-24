import { getGradient } from "./color.js";
import { getFlowField } from "./flow.js";
import { hideNode, showNode } from "./dom.js";
import rnd from "./random.js";
import JSONfn from "./lib/jsonfn.js";

/**
 * Serialies the unserializable fields in the config by transforming
 * the function definitions to a string using JSON.
 *
 * gradientFn is intentionally NOT serialized this way: chroma's `.scale()`
 * returns a closure over chroma's own internal (minified) variables, which
 * doesn't survive being turned into text and eval()'d back in a different
 * scope. Instead we send colorPalette/customColors (plain serializable data)
 * and let the receiving side call getGradient() itself to rebuild a real,
 * working gradient function.
 */
export const serializeConfig = (config) => {
  const { gradientFn, ...rest } = config;
  return {
    ...rest,
    customFlowFieldFunction: JSONfn.stringify(config.customFlowFieldFunction),
    flowFieldFn: JSONfn.stringify(config.flowFieldFn),
  };
};

export const deserializeConfig = (config) => {
  const { gradientFn, ...rest } = config;
  return {
    ...rest,
    gradientFn: getGradient(config.colorPalette, config.customColors),
    customFlowFieldFunction: JSONfn.parse(config.customFlowFieldFunction),
    flowFieldFn: JSONfn.parse(config.flowFieldFn),
  };
};

const getImageData = (image) => {
  const imageCanvas = document.querySelector("#image-canvas");
  const imageContext = imageCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  imageCanvas.width = window.innerWidth;
  imageCanvas.height = window.innerHeight;

  imageContext.drawImage(image, 0, 0, window.innerWidth, window.innerHeight);
  return imageContext.getImageData(0, 0, window.innerWidth, window.innerHeight);
};

export const form = () => {
  const body = document.querySelector("body");
  const form = document.querySelector("#form");
  const imageNode = document.querySelector("#image");
  const maxStepsInput = document.querySelector("#max-steps");
  const numPointsInput = document.querySelector("#num-points");
  const forceInput = document.querySelector("#force");
  const forceReductionInput = document.querySelector("#force-reduction");
  const frictionInput = document.querySelector("#friction");
  const seedInput = document.querySelector("#seed");
  const randomizeSeedInput = document.querySelector("#randomize-seed");
  const outOfBoundsWrapInput = document.querySelector("#oob-wrap");
  const outOfBoundsRecreateInput = document.querySelector("#oob-recreate");
  const minPenWidthInput = document.querySelector("#min-pen-width");
  const maxPenWidthInput = document.querySelector("#max-pen-width");
  const backgroundColorInput = document.querySelector("#bg-color");
  const colorPaletteInput = document.querySelector("#color-palette");
  const customGradientContainer = document.querySelector(
    "#custom-gradient-container"
  );
  const customGradientStops = document.querySelector(
    "#custom-gradient-stops"
  );
  const flowFieldFunctionInput = document.querySelector("#flow-field-function");
  const resolutionContainer = document.querySelector("#resolution-container");
  const resolutionInput = document.querySelector("#resolution");
  const customFlowFieldFunctionContainer = document.querySelector(
    "#custom-flow-field-function-container"
  );
  const customFlowFieldFunctionInput = document.querySelector(
    "#custom-flow-field-function"
  );
  const sourceImageContainer = document.querySelector(
    "#source-image-container"
  );
  const sourceImageInput = document.querySelector("#source-image");

  const resetSeed = () => {
    if (randomizeSeedInput.checked) {
      rnd.newSeed();

      seedInput.value = rnd.getSeed();
    } else {
      rnd.setSeed(rnd.getSeed());
    }
  };

  const readConfig = () => {
    const baseConfig = {
      width: window.innerWidth,
      height: window.innerHeight,
      maxSteps: Number.parseInt(maxStepsInput.value),
      numPoints: Number.parseInt(numPointsInput.value),
      force: Number.parseFloat(forceInput.value),
      forceReduction: Number.parseFloat(forceReductionInput.value),
      friction: Number.parseFloat(frictionInput.value),
      minPenWidth: Number.parseFloat(minPenWidthInput.value),
      maxPenWidth: Number.parseFloat(maxPenWidthInput.value),
      gradientFn: getGradient(colorPaletteInput.value, getCustomGradientColors()),
      colorPalette: colorPaletteInput.value,
      customColors: getCustomGradientColors(),
      flowFieldFunction: flowFieldFunctionInput.value,
      resolution: Number.parseFloat(resolutionInput.value),
      customFlowFieldFunction: customFlowFieldFunctionInput.value,
      sourceImage: sourceImageInput.value,
      seed: Number.parseInt(seedInput.value),
      outOfBoundsBehavior: outOfBoundsWrapInput.checked
        ? "wrap"
        : outOfBoundsRecreateInput.checked
        ? "recreate"
        : "nothing",
    };

    const { generationData, fn } = getFlowField(flowFieldFunctionInput.value, {
      resolution: baseConfig.resolution,
      imageData:
        baseConfig.sourceImage !== null ? getImageData(imageNode) : null,
      customFn: baseConfig.customFn,
    });

    baseConfig.flowFieldFnData = generationData;
    baseConfig.flowFieldFn = fn;

    return baseConfig;
  };

  const getCustomGradientColors = () => {
    return Array.from(
      customGradientStops.querySelectorAll("input[type=color]")
    ).map((input) => input.value);
  };

  const addGradientStop = (color) => {
    const row = document.createElement("div");
    row.className = "gradient-stop";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = color;
    colorInput.className = "gradient-stop-color";
    colorInput.addEventListener("change", () => {
      config = readConfig();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "gradient-stop-remove";
    removeBtn.innerHTML = "&times;";
    removeBtn.title = "Remove this colour";
    removeBtn.addEventListener("click", () => {
      if (customGradientStops.children.length <= 2) return;
      row.remove();
      config = readConfig();
    });

    row.appendChild(colorInput);
    row.appendChild(removeBtn);
    customGradientStops.appendChild(row);
  };

  document
    .querySelector("#add-gradient-stop")
    .addEventListener("click", () => {
      addGradientStop("#ffffff");
      config = readConfig();
    });

  ["#03071e", "#9d0208", "#ffba08"].forEach(addGradientStop);

  resetSeed();
  let config = readConfig();

  /** Background color config */
  body.style.backgroundColor = backgroundColorInput.value;
  backgroundColorInput.addEventListener("change", () => {
    body.style.backgroundColor = backgroundColorInput.value;
  });

  colorPaletteInput.addEventListener("change", () => {
    if (colorPaletteInput.value === "custom") {
      showNode(customGradientContainer);
    } else {
      hideNode(customGradientContainer);
    }
  });

  flowFieldFunctionInput.addEventListener("change", () => {
    switch (flowFieldFunctionInput.value) {
      case "perlin":
        showNode(resolutionContainer);
        hideNode(customFlowFieldFunctionContainer);
        hideNode(sourceImageContainer);
        break;
      case "de-jong-attractor":
        showNode(resolutionContainer);
        hideNode(customFlowFieldFunctionContainer);
        hideNode(sourceImageContainer);
        break;
      case "clifford-attractor":
        showNode(resolutionContainer);
        hideNode(customFlowFieldFunctionContainer);
        hideNode(sourceImageContainer);
        break;
      case "image":
        hideNode(resolutionContainer);
        hideNode(customFlowFieldFunctionContainer);
        showNode(sourceImageContainer);
        break;
      case "custom":
        hideNode(resolutionContainer);
        showNode(customFlowFieldFunctionContainer);
        hideNode(sourceImageContainer);
        break;
    }
  });

  sourceImageInput.addEventListener("change", (event) => {
    const selectedFile = event.target.files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      imageNode.src = event.target.result;
    };

    reader.readAsDataURL(selectedFile);
  });

  const minimize = document.querySelector("#minimize");
  const maximize = document.querySelector("#maximize");
  [minimize, maximize].forEach((node) => {
    node.addEventListener("click", () => {
      form.classList.toggle("dn");
      form.classList.toggle("flex");
      minimize.classList.toggle("dn");
      maximize.classList.toggle("dn");
    });
  });

  return {
    getConfig: () => config,
    refreshConfig: () => {
      resetSeed();
      config = readConfig();
    },
  };
};
