import {
  FaceDetector,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".bmp", ".webp"];
const WEB_RECOMMENDED_DEFAULTS = {
  faceRatio: 0.34,
  headroom: 0.95,
  confidence: 0.85,
};
const SIZE_PRESETS = {
  "3x4": { width: 3, height: 4 },
  "35x45": { width: 3.5, height: 4.5 },
  "25x3": { width: 2.5, height: 3 },
  "4x5": { width: 4, height: 5 },
  "5x7": { width: 5, height: 7 },
  "4x3": { width: 4, height: 3 },
};

const elements = {
  loadModelButton: document.querySelector("#loadModelButton"),
  modelStatus: document.querySelector("#modelStatus"),
  imageInput: document.querySelector("#imageInput"),
  csvInput: document.querySelector("#csvInput"),
  sizePresetSelect: document.querySelector("#sizePresetSelect"),
  widthCmInput: document.querySelector("#widthCmInput"),
  heightCmInput: document.querySelector("#heightCmInput"),
  qualityPresetSelect: document.querySelector("#qualityPresetSelect"),
  dpiInput: document.querySelector("#dpiInput"),
  maxKbInput: document.querySelector("#maxKbInput"),
  faceRatioInput: document.querySelector("#faceRatioInput"),
  headroomInput: document.querySelector("#headroomInput"),
  confidenceInput: document.querySelector("#confidenceInput"),
  resetAdvancedButton: document.querySelector("#resetAdvancedButton"),
  processButton: document.querySelector("#processButton"),
  clearButton: document.querySelector("#clearButton"),
  imageCount: document.querySelector("#imageCount"),
  okCount: document.querySelector("#okCount"),
  reviewCount: document.querySelector("#reviewCount"),
  outputSize: document.querySelector("#outputSize"),
  log: document.querySelector("#log"),
};

let faceDetector = null;

function log(message) {
  elements.log.textContent += `${message}\n`;
  elements.log.scrollTop = elements.log.scrollHeight;
}

function cmToPx(cm, dpi) {
  return Math.round((cm / 2.54) * dpi);
}

function outputDimensions() {
  const dpi = Number(elements.dpiInput.value);
  const widthCm = Number(elements.widthCmInput.value);
  const heightCm = Number(elements.heightCmInput.value);
  return {
    width: cmToPx(widthCm, dpi),
    height: cmToPx(heightCm, dpi),
    widthCm,
    heightCm,
    dpi,
  };
}

function updateOutputSize() {
  const size = outputDimensions();
  elements.outputSize.textContent = `${size.width} x ${size.height}`;
}

function setQualityPreset(preset) {
  if (preset === "high") {
    elements.dpiInput.value = "900";
    elements.maxKbInput.value = "500";
  } else if (preset === "standard") {
    elements.dpiInput.value = "300";
    elements.maxKbInput.value = "100";
  }
  updateOutputSize();
}

function setSizePreset(preset) {
  const size = SIZE_PRESETS[preset];
  if (size) {
    elements.widthCmInput.value = String(size.width);
    elements.heightCmInput.value = String(size.height);
  }
  updateOutputSize();
}

function markCustomSize() {
  elements.sizePresetSelect.value = "custom";
  updateOutputSize();
}

function markCustomQuality() {
  elements.qualityPresetSelect.value = "custom";
  updateOutputSize();
}

function validateOutputSettings() {
  const size = outputDimensions();
  if (!Number.isFinite(size.widthCm) || !Number.isFinite(size.heightCm) || size.widthCm <= 0 || size.heightCm <= 0) {
    throw new Error("写真サイズの幅と高さを確認してください。");
  }
  if (!Number.isFinite(size.dpi) || size.dpi <= 0) {
    throw new Error("DPIを確認してください。");
  }
  const maxKb = Number(elements.maxKbInput.value);
  if (!Number.isFinite(maxKb) || maxKb <= 0) {
    throw new Error("最大容量KBを確認してください。");
  }
  return size;
}

function outputZipName(size) {
  const width = String(size.widthCm).replace(".", "_");
  const height = String(size.heightCm).replace(".", "_");
  return `student_photos_${width}x${height}cm_${size.dpi}dpi.zip`;
}

function initializeDefaults() {
  setSizePreset("3x4");
  if (elements.qualityPresetSelect.value === "high") {
    setQualityPreset("high");
  } else {
    setQualityPreset("standard");
  }
}

function resetAdvancedSettings() {
  elements.faceRatioInput.value = String(WEB_RECOMMENDED_DEFAULTS.faceRatio);
  elements.headroomInput.value = String(WEB_RECOMMENDED_DEFAULTS.headroom);
  elements.confidenceInput.value = String(WEB_RECOMMENDED_DEFAULTS.confidence);
  log("詳細設定をWeb版の推奨値に戻しました。");
}

function getImageFiles() {
  return Array.from(elements.imageInput.files || [])
    .filter((file) => IMAGE_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext)))
    .sort((a, b) => {
      const aName = a.webkitRelativePath || a.name;
      const bName = b.webkitRelativePath || b.name;
      return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: "base" });
    });
}

function updateImageCount() {
  elements.imageCount.textContent = String(getImageFiles().length);
}

async function readCsvNames() {
  const file = elements.csvInput.files?.[0];
  if (!file) return null;
  const text = await file.text();
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.split(",")[0]?.trim())
    .filter(Boolean)
    .map(sanitizeFilename);
}

function sanitizeFilename(value) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

async function loadBitmap(file) {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

function getBoundingBox(detection) {
  const box = detection.boundingBox;
  return {
    x: box.originX ?? box.origin_x,
    y: box.originY ?? box.origin_y,
    width: box.width,
    height: box.height,
  };
}

function getScore(detection) {
  return detection.categories?.[0]?.score ?? 0;
}

function makeCropBox(face, imageWidth, imageHeight, outputWidth, outputHeight) {
  const faceRatio = Number(elements.faceRatioInput.value);
  const headroomRatio = Number(elements.headroomInput.value);
  const aspect = outputWidth / outputHeight;
  const cropHeight = face.height / faceRatio;
  const cropWidth = cropHeight * aspect;
  const centerX = face.x + face.width / 2;
  const left = Math.round(centerX - cropWidth / 2);
  const top = Math.round(face.y - face.height * headroomRatio);
  const right = Math.round(left + cropWidth);
  const bottom = Math.round(top + cropHeight);

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    inside: left >= 0 && top >= 0 && right <= imageWidth && bottom <= imageHeight,
  };
}

function drawCropped(bitmap, cropBox, outputWidth, outputHeight) {
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(
    bitmap,
    cropBox.left,
    cropBox.top,
    cropBox.width,
    cropBox.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );
  return canvas;
}

function bitmapToCanvas(bitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(bitmap, 0, 0);
  return canvas;
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("JPEG export failed"))),
      "image/jpeg",
      quality,
    );
  });
}

async function jpegUnderLimit(canvas, maxBytes, dpi) {
  let low = 0.35;
  let high = 0.95;
  let best = null;

  for (let i = 0; i < 8; i += 1) {
    const quality = (low + high) / 2;
    const blob = await canvasToBlob(canvas, quality);
    const data = await setJpegDpi(blob, dpi);
    if (data.byteLength <= maxBytes) {
      best = { data, quality };
      low = quality;
    } else {
      high = quality;
    }
  }

  if (!best) {
    const blob = await canvasToBlob(canvas, 0.35);
    best = { data: await setJpegDpi(blob, dpi), quality: 0.35 };
  }
  return best;
}

async function setJpegDpi(blob, dpi) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;

  const clampedDpi = Math.max(1, Math.min(65535, Math.round(dpi)));
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xda) break;
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (
      marker === 0xe0 &&
      bytes[offset + 4] === 0x4a &&
      bytes[offset + 5] === 0x46 &&
      bytes[offset + 6] === 0x49 &&
      bytes[offset + 7] === 0x46 &&
      bytes[offset + 8] === 0x00
    ) {
      bytes[offset + 11] = 1;
      bytes[offset + 12] = clampedDpi >> 8;
      bytes[offset + 13] = clampedDpi & 0xff;
      bytes[offset + 14] = clampedDpi >> 8;
      bytes[offset + 15] = clampedDpi & 0xff;
      return bytes;
    }
    offset += 2 + length;
  }

  const app0 = new Uint8Array([
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x01,
    clampedDpi >> 8,
    clampedDpi & 0xff,
    clampedDpi >> 8,
    clampedDpi & 0xff,
    0x00,
    0x00,
  ]);
  const output = new Uint8Array(bytes.length + app0.length);
  output.set(bytes.slice(0, 2), 0);
  output.set(app0, 2);
  output.set(bytes.slice(2), 2 + app0.length);
  return output;
}

async function processImages() {
  if (!faceDetector) {
    log("先に顔検出モデルを読み込んでください。");
    return;
  }

  const files = getImageFiles();
  if (!files.length) {
    log("画像が選択されていません。");
    return;
  }

  const csvNames = await readCsvNames();
  if (csvNames && csvNames.length !== files.length) {
    log(`CSV行数と画像数が違います: CSV=${csvNames.length}, 画像=${files.length}`);
    return;
  }

  let size;
  try {
    size = validateOutputSettings();
  } catch (error) {
    log(error.message);
    return;
  }
  const maxBytes = Number(elements.maxKbInput.value) * 1024;
  const zip = new JSZip();
  const outputFolder = zip.folder("output_ok");
  const reviewFolder = zip.folder("output_review");
  const mapping = [["source_file", "output_file", "status", "reason", "bytes", "quality"]];
  let ok = 0;
  let review = 0;

  elements.processButton.disabled = true;
  elements.okCount.textContent = "0";
  elements.reviewCount.textContent = "0";
  log(
    `処理開始: ${files.length}枚 / ${size.widthCm} x ${size.heightCm}cm / ${size.width} x ${size.height}px / ${size.dpi}dpi`,
  );

  for (const [index, file] of files.entries()) {
    const sourceName = file.webkitRelativePath || file.name;
    const baseName = csvNames?.[index] || file.name.replace(/\.[^.]+$/, "");
    const outputName = `${baseName}.jpg`;

    try {
      const bitmap = await loadBitmap(file);
      const sourceCanvas = bitmapToCanvas(bitmap);
      const result = faceDetector.detect(sourceCanvas);
      const detections = result.detections || [];
      const usable = detections.filter((detection) => getScore(detection) >= Number(elements.confidenceInput.value));

      if (usable.length !== 1) {
        review += 1;
        reviewFolder.file(file.name, file);
        mapping.push([sourceName, outputName, "review", usable.length === 0 ? "no_face" : "multiple_faces", "", ""]);
        log(`[${index + 1}/${files.length}] REVIEW ${sourceName}: ${usable.length === 0 ? "no_face" : "multiple_faces"}`);
        continue;
      }

      const face = getBoundingBox(usable[0]);
      const cropBox = makeCropBox(face, bitmap.width, bitmap.height, size.width, size.height);
      if (!cropBox.inside) {
        review += 1;
        reviewFolder.file(file.name, file);
        mapping.push([sourceName, outputName, "review", "crop_out_of_bounds", "", ""]);
        log(`[${index + 1}/${files.length}] REVIEW ${sourceName}: crop_out_of_bounds`);
        continue;
      }

      const canvas = drawCropped(sourceCanvas, cropBox, size.width, size.height);
      const jpeg = await jpegUnderLimit(canvas, maxBytes, size.dpi);
      if (jpeg.data.byteLength > maxBytes) {
        review += 1;
        reviewFolder.file(outputName, jpeg.data);
        mapping.push([sourceName, outputName, "review", "size_limit_exceeded", jpeg.data.byteLength, jpeg.quality.toFixed(3)]);
        log(`[${index + 1}/${files.length}] REVIEW ${sourceName}: size_limit_exceeded`);
        continue;
      }

      ok += 1;
      outputFolder.file(outputName, jpeg.data);
      mapping.push([sourceName, outputName, "ok", "", jpeg.data.byteLength, jpeg.quality.toFixed(3)]);
      log(`[${index + 1}/${files.length}] OK ${sourceName} -> ${outputName} (${jpeg.data.byteLength} bytes)`);
    } catch (error) {
      review += 1;
      reviewFolder.file(file.name, file);
      mapping.push([sourceName, outputName, "review", error.message, "", ""]);
      log(`[${index + 1}/${files.length}] ERROR ${sourceName}: ${error.message}`);
    }

    elements.okCount.textContent = String(ok);
    elements.reviewCount.textContent = String(review);
  }

  zip.file("report.csv", mapping.map((row) => row.map(csvEscape).join(",")).join("\r\n"));
  const blob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = outputZipName(size);
  link.click();
  URL.revokeObjectURL(link.href);
  log(`完了: 成功=${ok}, 要確認=${review}`);
  elements.processButton.disabled = false;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function loadModel() {
  elements.loadModelButton.disabled = true;
  elements.modelStatus.textContent = "モデル読込中";
  log("MediaPipe Face Detectorを読み込んでいます。");
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    faceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: "IMAGE",
      minDetectionConfidence: Number(elements.confidenceInput.value),
    });
    elements.modelStatus.textContent = "モデル読込済み";
    elements.modelStatus.classList.add("ready");
    elements.processButton.disabled = false;
    log("モデル読込完了。");
  } catch (error) {
    elements.modelStatus.textContent = "モデル読込失敗";
    elements.loadModelButton.disabled = false;
    log(`モデル読込失敗: ${error.message}`);
  }
}

elements.loadModelButton.addEventListener("click", loadModel);
elements.imageInput.addEventListener("change", updateImageCount);
elements.sizePresetSelect.addEventListener("change", () => setSizePreset(elements.sizePresetSelect.value));
elements.widthCmInput.addEventListener("input", markCustomSize);
elements.heightCmInput.addEventListener("input", markCustomSize);
elements.qualityPresetSelect.addEventListener("change", () => setQualityPreset(elements.qualityPresetSelect.value));
elements.dpiInput.addEventListener("input", markCustomQuality);
elements.maxKbInput.addEventListener("input", markCustomQuality);
elements.resetAdvancedButton.addEventListener("click", resetAdvancedSettings);
elements.processButton.addEventListener("click", processImages);
elements.clearButton.addEventListener("click", () => {
  elements.log.textContent = "";
});

initializeDefaults();
