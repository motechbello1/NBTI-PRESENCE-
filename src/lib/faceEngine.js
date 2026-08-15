/**
 * Face engine.
 *
 * Everything here runs on the staff member's own device. The camera stream
 * never leaves the browser. What travels to the server is a 128-number
 * vector that describes the face mathematically and cannot be turned back
 * into a photograph, plus, when an attempt is rejected, a single evidence
 * frame.
 */

// Use the package's non-bundled build so face recognition and the spoof
// detector share one TensorFlow runtime. Loading the default build beside
// coco-ssd registers every WebGL kernel twice and slows camera start-up.
import * as faceapi from "@vladmandic/face-api/dist/face-api.esm-nobundle.js";

// These are generic open-source face-api weights, never staff imagery or
// attendance data. Pinning them to an immutable CDN-backed Git commit keeps
// the Vercel release small and makes repeat camera starts cacheable globally.
const MODEL_URL = import.meta.env.VITE_FACE_MODEL_URL
  || "https://cdn.jsdelivr.net/gh/motechbello1/NBTI-PRESENCE-@2eae5a576ea1ae161c88e538b9c5a2e8199ab968/public/models";
let ready = false;
let loading = null;

export async function loadFaceModels(onProgress = () => {}) {
  if (ready) return;
  if (loading) return loading;

  loading = (async () => {
    try {
      onProgress("Loading face detector");
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      onProgress("Loading landmark map");
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      onProgress("Loading recognition model");
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      ready = true;
    } catch (error) {
      loading = null;
      throw error;
    }
  })();

  return loading;
}

export const modelsReady = () => ready;

const DESKTOP_DETECTOR = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.46 });
const MOBILE_DETECTOR = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.42 });

function detectorForDevice() {
  const narrow = typeof window !== "undefined" && window.innerWidth <= 720;
  const modestCpu = typeof navigator !== "undefined" && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
  return narrow || modestCpu ? MOBILE_DETECTOR : DESKTOP_DETECTOR;
}

/** Every face currently visible, with landmarks and descriptors. */
export async function readFaces(videoEl) {
  if (!hasReadableVideoFrame(videoEl)) return [];
  return faceapi
    .detectAllFaces(videoEl, detectorForDevice())
    .withFaceLandmarks()
    .withFaceDescriptors();
}

/** The largest face in frame, which is the person actually standing there. */
export async function readPrimaryFace(videoEl) {
  const faces = await readFaces(videoEl);
  if (!faces.length) return { face: null, count: 0 };
  const face = faces.reduce((a, b) => (a.detection.box.area > b.detection.box.area ? a : b));
  return { face, count: faces.length };
}

/* ══════════════════════════════════════════════════════════
   HEAD POSE
   Derived from the 68-point landmark map. No extra model needed.
   ══════════════════════════════════════════════════════════ */

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Yaw, the left/right turn.
 * Measured as how far off-centre the nose sits between the two jaw edges.
 * Returns roughly -1 (fully turned one way) to +1 (fully the other).
 * Positive means the person turned toward their own left.
 */
export function yawOf(landmarks) {
  const p = landmarks.positions;
  const nose = p[30];
  const jawR = p[0];
  const jawL = p[16];
  const dR = dist(nose, jawR);
  const dL = dist(nose, jawL);
  return (dR - dL) / (dR + dL);
}

/**
 * Pitch, the up/down tilt.
 * Where the nose tip sits between the eye line and the chin.
 * Around 0.5 is level. Smaller means the chin is raised, looking up.
 */
export function pitchOf(landmarks) {
  const p = landmarks.positions;
  const eyeLineY = (p[36].y + p[45].y) / 2;
  const chinY = p[8].y;
  const noseY = p[30].y;
  const span = chinY - eyeLineY;
  if (span <= 0) return 0.5;
  return (noseY - eyeLineY) / span;
}

/** Eye aspect ratio. Collapses toward zero during a blink. */
export function eyeOpenness(landmarks) {
  const p = landmarks.positions;
  const ear = (i) => {
    const e = [p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5]];
    return (dist(e[1], e[5]) + dist(e[2], e[4])) / (2 * dist(e[0], e[3]));
  };
  return (ear(36) + ear(42)) / 2;
}

/**
 * Face geometry signature.
 * A set of ratios between landmark distances, normalised by face width.
 * On a real head these ratios shift non-uniformly as it rotates, because
 * the features sit at different depths. On a photograph or a screen they
 * shift together, because everything is on one flat plane. Comparing the
 * signature across a turn is what separates a person from a picture.
 */
export function geometrySignature(landmarks) {
  const p = landmarks.positions;
  const w = dist(p[0], p[16]) || 1;
  return [
    dist(p[36], p[45]) / w,   // outer eye corner span
    dist(p[30], p[8]) / w,    // nose tip to chin
    dist(p[27], p[30]) / w,   // nose bridge length
    dist(p[31], p[35]) / w,   // nostril width
    dist(p[48], p[54]) / w,   // mouth width
    dist(p[30], p[48]) / w,   // nose to mouth corner
    dist(p[39], p[42]) / w,   // inner eye corner span
  ];
}

/* ══════════════════════════════════════════════════════════
   IMAGE QUALITY
   ══════════════════════════════════════════════════════════ */

/**
 * Sharpness, as the variance of the Laplacian.
 * A face printed on paper or shown on a screen has been through a lens
 * twice, so it loses high-frequency detail and scores lower than a face
 * standing in front of the camera.
 */
export function sharpnessOf(canvas, box = null) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const x = box ? Math.max(0, Math.floor(box.x)) : 0;
  const y = box ? Math.max(0, Math.floor(box.y)) : 0;
  const w = box ? Math.min(canvas.width - x, Math.floor(box.width)) : canvas.width;
  const h = box ? Math.min(canvas.height - y, Math.floor(box.height)) : canvas.height;
  if (w < 8 || h < 8) return 0;

  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  const grey = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    grey[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  }

  let sum = 0, sumSq = 0, n = 0;
  for (let yy = 1; yy < h - 1; yy++) {
    for (let xx = 1; xx < w - 1; xx++) {
      const i = yy * w + xx;
      const lap =
        -4 * grey[i] + grey[i - 1] + grey[i + 1] + grey[i - w] + grey[i + w];
      sum += lap; sumSq += lap * lap; n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/* ══════════════════════════════════════════════════════════
   MATCHING
   ══════════════════════════════════════════════════════════ */

/** Euclidean distance between two 128-number face vectors. Lower is closer. */
export function vectorDistance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

/** Closest enrolled vector to a live one. */
export function bestMatch(liveDescriptor, enrolments) {
  let best = { distance: Infinity, userId: null };
  for (const e of enrolments) {
    const d = vectorDistance(liveDescriptor, e.descriptor);
    if (d < best.distance) best = { distance: d, userId: e.user_id };
  }
  return best;
}

/** True only while a mounted video element has a real camera frame. */
export function hasReadableVideoFrame(videoEl) {
  return Boolean(
    videoEl &&
    videoEl.readyState >= 2 &&
    videoEl.videoWidth > 0 &&
    videoEl.videoHeight > 0
  );
}

/** Waits for camera metadata and the first drawable frame. */
export function waitForVideoFrame(videoEl, timeoutMs = 3500) {
  if (hasReadableVideoFrame(videoEl)) return Promise.resolve(videoEl);

  return new Promise((resolve, reject) => {
    if (!videoEl) {
      reject(new Error("The camera view is no longer available."));
      return;
    }

    let timeout;
    const finish = () => {
      if (!hasReadableVideoFrame(videoEl)) return;
      clearTimeout(timeout);
      videoEl.removeEventListener("loadeddata", finish);
      videoEl.removeEventListener("playing", finish);
      resolve(videoEl);
    };
    const fail = () => {
      videoEl.removeEventListener("loadeddata", finish);
      videoEl.removeEventListener("playing", finish);
      reject(new Error("The camera opened but did not produce a readable frame."));
    };

    videoEl.addEventListener("loadeddata", finish);
    videoEl.addEventListener("playing", finish);
    timeout = setTimeout(fail, timeoutMs);
    finish();
  });
}

/** Copies the current video frame to a canvas at native resolution. */
export function grabFrame(videoEl, canvas) {
  if (!hasReadableVideoFrame(videoEl)) {
    throw new Error("A readable camera frame is not available.");
  }
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  canvas.getContext("2d").drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Canvas to a JPEG blob for evidence upload. */
export function frameToBlob(canvas, quality = 0.82) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}
