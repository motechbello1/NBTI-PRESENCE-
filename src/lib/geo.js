/**
 * Location gate.
 * Attendance is only accepted from inside the NBTI perimeter.
 * The radius and site coordinates are held in the settings table
 * so an admin can move them without a redeploy.
 */

const EARTH_R = 6371000; // metres

export function metresBetween(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

/** Reads the device position at high accuracy. Rejects rather than guesses. */
export function readPosition({ timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject({ code: "unsupported", message: "This device cannot report its location." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
      (err) => {
        const map = {
          1: "Location permission was denied. Turn it on in your browser settings, then try again.",
          2: "Your location could not be determined. Move near a window or step outside and try again.",
          3: "Locating you took too long. Check that GPS is on, then try again.",
        };
        reject({ code: err.code, message: map[err.code] || "Location is unavailable." });
      },
      { enableHighAccuracy: true, timeout, maximumAge: 0 }
    );
  });
}

/**
 * Checks a reading against the site perimeter.
 * A reading with poor accuracy is refused rather than trusted, because
 * a 2km error radius makes "inside the fence" meaningless.
 */
export function checkPerimeter(pos, settings) {
  const distance = metresBetween(pos.lat, pos.lng, settings.site_lat, settings.site_lng);
  const radius = settings.geofence_radius_m;
  const maxErr = settings.max_gps_accuracy_m;

  if (pos.accuracy > maxErr) {
    return {
      pass: false,
      reason: "low_gps_accuracy",
      distance,
      message: `Your location is only accurate to ${Math.round(pos.accuracy)}m, which is too imprecise to confirm you are on site. Move to an open area and try again.`,
    };
  }

  // A reported accuracy of exactly zero does not occur on real hardware.
  // It is a signature of an injected or mocked position.
  if (pos.accuracy === 0) {
    return {
      pass: false,
      reason: "mocked_location",
      distance,
      message: "This location reading looks artificial. Attendance was not recorded.",
    };
  }

  if (distance > radius) {
    return {
      pass: false,
      reason: "outside_geofence",
      distance,
      message: `You are ${formatDistance(distance)} from the NBTI premises. Attendance can only be recorded on site.`,
    };
  }

  return { pass: true, distance, message: `On site, ${Math.round(distance)}m from the centre point.` };
}

export function formatDistance(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}
