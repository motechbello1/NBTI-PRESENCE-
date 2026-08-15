/**
 * Spoof guard.
 *
 * Five independent checks run against the live camera. They are deliberately
 * independent: a trick that beats one rarely beats the others at the same
 * time. Each returns a finding, and the caller decides what to do.
 *
 * What each check is for, in plain terms:
 *
 *   1. Device in frame     Someone holding up a phone, tablet or laptop
 *                          showing a face, or a printed photo.
 *   2. Screen replay       A face being played back on a display, caught by
 *                          the banding and colour behaviour of screens
 *                          rather than by seeing the device itself.
 *   3. Flat surface        A photo or screen turning as one rigid plane
 *                          instead of as a head with depth.
 *   4. Multiple faces      A second person in frame, which is what proxy
 *                          sign-in looks like.
 *   5. Sharpness floor     A face that has been through a lens twice.
 *
 * An honest note on the limits of this: everything here runs in a browser on
 * a consumer camera. It defeats a phone screen, a printed photo, a poster and
 * a replayed video, which is the full realistic threat for staff attendance.
 * It is not a match for a purpose-built mask attack, and no browser check is.
 */

import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

let detector = null;
let detectorLoading = null;

/** Object classes that should never be in frame during an attendance check. */
const BANNED = {
  "cell phone": { label: "a phone", severity: "critical" },
  laptop: { label: "a laptop", severity: "critical" },
  tv: { label: "a screen", severity: "critical" },
  remote: { label: "a handheld device", severity: "high" },
  book: { label: "a printed page or photo", severity: "high" },
};

export async function loadSpoofModels(onProgress = () => {}) {
  if (detector) return detector;
  if (detectorLoading) return detectorLoading;

  detectorLoading = (async () => {
    try {
      onProgress("Loading device detector");
      await tf.ready();
      detector = await cocoSsd.load({ base: "lite_mobilenet_v2" });
      return detector;
    } catch (error) {
      detectorLoading = null;
      throw error;
    }
  })();

  return detectorLoading;
}

export const spoofModelsReady = () => detector !== null;

/* ══════════════════════════════════════════════════════════
   1 & 4. WHAT IS IN THE FRAME
   ══════════════════════════════════════════════════════════ */

/**
 * Looks for phones, screens, laptops and printed material held up to the
 * camera. Confidence is kept at a level that catches a device held at
 * arm's length without firing on a dark rectangle on a desk behind someone.
 */
export async function scanFrameObjects(videoOrCanvas, minScore = 0.55) {
  if (!detector) return { devices: [], people: 0, raw: [] };

  const raw = await detector.detect(videoOrCanvas, 12, minScore);
  const devices = raw
    .filter((o) => BANNED[o.class])
    .map((o) => ({
      kind: o.class,
      label: BANNED[o.class].label,
      severity: BANNED[o.class].severity,
      confidence: Number(o.score.toFixed(3)),
      box: o.bbox,
    }));

  const people = raw.filter((o) => o.class === "person" && o.score > 0.6).length;
  return { devices, people, raw };
}

/* ══════════════════════════════════════════════════════════
   2. SCREEN REPLAY
   ══════════════════════════════════════════════════════════ */

/**
 * Displays give themselves away in three ways that a real face does not.
 *
 *   Banding    A camera sampling a refreshing panel picks up horizontal
 *              light and dark stripes. Measured as periodic energy in the
 *              row-brightness profile.
 *   Flat light A screen emits its own even light, so the face has far less
 *              brightness variation across it than one lit by a room.
 *   Colour cast Panels push a narrower gamut and usually skew blue against
 *              the warm mixed lighting of an actual office.
 *
 * Returns 0 to 1. Higher means more screen-like.
 */
export function screenLikelihood(canvas, faceBox) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const x = Math.max(0, Math.floor(faceBox.x));
  const y = Math.max(0, Math.floor(faceBox.y));
  const w = Math.min(canvas.width - x, Math.floor(faceBox.width));
  const h = Math.min(canvas.height - y, Math.floor(faceBox.height));
  if (w < 24 || h < 24) return 0;

  const d = ctx.getImageData(x, y, w, h).data;

  // Row brightness profile
  const rows = new Float32Array(h);
  let rSum = 0, gSum = 0, bSum = 0;
  for (let yy = 0; yy < h; yy++) {
    let acc = 0;
    for (let xx = 0; xx < w; xx++) {
      const i = (yy * w + xx) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      acc += 0.299 * r + 0.587 * g + 0.114 * b;
      rSum += r; gSum += g; bSum += b;
    }
    rows[yy] = acc / w;
  }

  // — Banding: energy in the row profile at screen-like periods —
  const mean = rows.reduce((a, b) => a + b, 0) / h;
  let variance = 0;
  for (let i = 0; i < h; i++) variance += (rows[i] - mean) ** 2;
  variance /= h;

  let bandEnergy = 0;
  if (variance > 0.5) {
    // Autocorrelation across the lag range where refresh banding lands
    for (let lag = 3; lag <= Math.min(24, Math.floor(h / 3)); lag++) {
      let c = 0;
      for (let i = 0; i + lag < h; i++) c += (rows[i] - mean) * (rows[i + lag] - mean);
      c = c / ((h - lag) * variance);
      bandEnergy = Math.max(bandEnergy, c);
    }
  }
  const bandScore = Math.max(0, Math.min(1, (bandEnergy - 0.22) / 0.45));

  // — Flat light: a self-lit panel spreads brightness evenly —
  const spread = Math.sqrt(variance);
  const flatScore = Math.max(0, Math.min(1, (7.5 - spread) / 7.5));

  // — Colour cast —
  const n = w * h;
  const rAvg = rSum / n, gAvg = gSum / n, bAvg = bSum / n;
  const blueBias = (bAvg - (rAvg + gAvg) / 2) / 255;
  const castScore = Math.max(0, Math.min(1, (blueBias - 0.012) / 0.07));

  return Math.min(1, bandScore * 0.45 + flatScore * 0.3 + castScore * 0.25);
}

/* ══════════════════════════════════════════════════════════
   3. FLAT SURFACE
   ══════════════════════════════════════════════════════════ */

/**
 * Compares face geometry across the poses captured during the challenge.
 *
 * Turn a real head and the nose swings across the face while the eye span
 * compresses, because the nose sits centimetres in front of the eyes. Turn
 * a photo and every measurement scales by the same factor, because there is
 * no depth to reveal.
 *
 * Feeding in signatures from at least two distinct poses, this returns 0 to 1,
 * where higher means flatter and therefore more suspicious.
 */
export function flatnessScore(signatures) {
  if (signatures.length < 2) return 0;

  const perFeatureChange = [];
  const dims = signatures[0].length;

  for (let k = 0; k < dims; k++) {
    const series = signatures.map((s) => s[k]);
    const base = series[0] || 1e-6;
    const rel = series.map((v) => v / base);
    const mean = rel.reduce((a, b) => a + b, 0) / rel.length;
    const sd = Math.sqrt(rel.reduce((a, b) => a + (b - mean) ** 2, 0) / rel.length);
    perFeatureChange.push(sd);
  }

  // On a real head these standard deviations differ a lot between features.
  // On a plane they cluster tightly. The spread between them is the signal.
  const m = perFeatureChange.reduce((a, b) => a + b, 0) / dims;
  if (m < 1e-6) return 1;
  const spread =
    Math.sqrt(perFeatureChange.reduce((a, b) => a + (b - m) ** 2, 0) / dims) / m;

  // A live turn typically produces a spread above 0.55.
  return Math.max(0, Math.min(1, (0.55 - spread) / 0.55));
}

/* ══════════════════════════════════════════════════════════
   VERDICT
   ══════════════════════════════════════════════════════════ */

/**
 * Folds every finding into one decision.
 * A device in frame or a second face is an outright refusal, no scoring.
 * The softer signals accumulate and are refused past a threshold.
 */
export function verdict({ devices, faceCount, screenScore, flatness, sharpness }) {
  const findings = [];

  if (devices?.length) {
    const worst = devices.sort((a, b) => b.confidence - a.confidence)[0];
    return {
      pass: false,
      flagType: "device_in_frame",
      severity: "critical",
      message: `The camera can see ${worst.label} in the frame. Put it down, hold the camera yourself and try again.`,
      detail: { devices, screenScore, flatness, sharpness },
    };
  }

  if (faceCount > 1) {
    return {
      pass: false,
      flagType: "multiple_faces",
      severity: "critical",
      message: "More than one face is in the frame. Only you can record your own attendance. Step away from others and try again.",
      detail: { faceCount, screenScore, flatness, sharpness },
    };
  }

  let risk = 0;
  if (screenScore > 0.55) { risk += screenScore; findings.push("screen_replay"); }
  if (flatness > 0.6)     { risk += flatness;    findings.push("flat_surface"); }
  if (sharpness < 55)     { risk += 0.5;         findings.push("low_detail"); }

  if (risk >= 0.95) {
    return {
      pass: false,
      flagType: findings.includes("screen_replay") ? "screen_replay" : "flat_surface",
      severity: "high",
      message: "This does not look like a live face in front of the camera. If you are holding up a photo or a screen, attendance cannot be recorded.",
      detail: { findings, screenScore, flatness, sharpness, risk },
    };
  }

  return {
    pass: true,
    confidence: Number((1 - Math.min(risk, 1)).toFixed(3)),
    detail: { screenScore, flatness, sharpness, risk },
  };
}
