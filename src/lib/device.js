/**
 * Device fingerprint.
 *
 * Purpose: catch one phone being passed around to sign in several people.
 * The fingerprint is a stable hash of properties that do not change between
 * sessions on the same handset but differ across handsets. It is not a
 * unique hardware ID and it is not meant to be one, it only needs to be
 * consistent enough to notice the same device signing in three colleagues
 * in four minutes.
 */

function canvasSignature() {
  try {
    const c = document.createElement("canvas");
    c.width = 220; c.height = 40;
    const ctx = c.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 90, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("NBTI-presence-01", 2, 15);
    ctx.fillStyle = "rgba(102,204,0,0.7)";
    ctx.fillText("NBTI-presence-01", 4, 17);
    return c.toDataURL().slice(-120);
  } catch {
    return "no-canvas";
  }
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function deviceFingerprint() {
  const parts = [
    navigator.userAgent,
    navigator.language,
    (navigator.languages || []).join(","),
    navigator.hardwareConcurrency || "?",
    navigator.maxTouchPoints || 0,
    navigator.deviceMemory || "?",
    screen.width, screen.height, screen.colorDepth,
    window.devicePixelRatio,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    canvasSignature(),
  ].join("|");
  return (await sha256(parts)).slice(0, 32);
}

export function deviceLabel() {
  const ua = navigator.userAgent;
  const os =
    /Android/i.test(ua) ? "Android" :
    /iPhone|iPad|iPod/i.test(ua) ? "iOS" :
    /Windows/i.test(ua) ? "Windows" :
    /Mac OS/i.test(ua) ? "macOS" :
    /Linux/i.test(ua) ? "Linux" : "Unknown";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /OPR\//.test(ua) ? "Opera" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" : "Unknown";
  return `${os} · ${browser}`;
}
