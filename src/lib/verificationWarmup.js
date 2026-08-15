let warming = null;

/**
 * Downloads and initialises the verification models while the attendance page
 * is idle, so pressing Sign in does not have to pay the full start-up cost.
 */
export function warmVerificationModels() {
  if (warming) return warming;

  warming = Promise.all([
    import("./faceEngine").then(({ loadFaceModels }) => loadFaceModels()),
    import("./spoofGuard").then(({ loadSpoofModels }) => loadSpoofModels()),
  ]).catch((error) => {
    warming = null;
    console.warn("Verification model warm-up was deferred:", error);
  });

  return warming;
}

export function warmVerificationWhenIdle() {
  if (typeof window === "undefined") return () => {};

  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(() => { void warmVerificationModels(); }, { timeout: 1200 });
    return () => window.cancelIdleCallback(id);
  }

  const id = window.setTimeout(() => { void warmVerificationModels(); }, 350);
  return () => window.clearTimeout(id);
}
