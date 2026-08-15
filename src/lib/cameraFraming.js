/**
 * Converts a detected face box into simple, stable camera instructions.
 *
 * Face-api reports coordinates against the camera's native frame. The camera
 * guide is centred over that same frame, so ratios stay correct on both phone
 * and desktop cameras without relying on screen pixels.
 */
export function readCameraFraming(face, video) {
  if (!face || !video?.videoWidth || !video?.videoHeight) {
    return {
      state: "searching",
      ready: false,
      instruction: "Move closer and place your face inside the guide",
      detail: "Keep the phone upright and look directly at the camera",
    };
  }

  const box = face.detection.box;
  const centreX = (box.x + box.width / 2) / video.videoWidth;
  const centreY = (box.y + box.height / 2) / video.videoHeight;
  const faceHeight = box.height / video.videoHeight;

  if (faceHeight < 0.24) {
    return {
      state: "too-far",
      ready: false,
      instruction: "Move a little closer",
      detail: "Your face is visible, but it is too small for a clear reading",
    };
  }

  if (faceHeight > 0.7) {
    return {
      state: "too-close",
      ready: false,
      instruction: "Move back slightly",
      detail: "Keep your full face and chin visible inside the guide",
    };
  }

  if (Math.abs(centreX - 0.5) > 0.18 || centreY < 0.3 || centreY > 0.64) {
    return {
      state: "off-centre",
      ready: false,
      instruction: "Move your face to the centre",
      detail: "Place your eyes near the line and keep your chin inside the guide",
    };
  }

  return {
    state: "ready",
    ready: true,
    instruction: "Face found",
    detail: "Hold the phone still and keep looking at the camera",
  };
}

/** Keeps legacy liveness copy aligned with the larger portrait guide. */
export function guideLanguage(value = "") {
  return value.replace(/circle/gi, "guide");
}
