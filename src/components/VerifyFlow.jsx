import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { GateStrip, Notice, Spinner } from "./UI";
import {
  loadFaceModels, readPrimaryFace, sharpnessOf,
  grabFrame, frameToBlob, vectorDistance,
} from "../lib/faceEngine";
import { loadSpoofModels, scanFrameObjects, screenLikelihood, flatnessScore, verdict } from "../lib/spoofGuard";
import { LivenessRun, measure } from "../lib/liveness";
import { readPosition, checkPerimeter, formatDistance } from "../lib/geo";
import { deviceFingerprint } from "../lib/device";
import { getMyEnrolments, raiseFlag, sharedDeviceCount } from "../lib/db";

function DirectionCue({ direction }) {
  const paths = {
    left: "M18 5l-7 7 7 7M11 12h15",
    right: "M14 5l7 7-7 7M21 12H6",
    up: "M5 14l7-7 7 7M12 7v15",
  };
  return (
    <div className={`cue cue-${direction}`} aria-hidden="true">
      <svg width="32" height="32" viewBox="0 0 32 32">
        <path d={paths[direction]} fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </div>
  );
}

/**
 * One attendance check, start to finish.
 *
 * The four gates run in a fixed order and the run stops at the first refusal,
 * because there is no reason to keep scanning someone who is not on site.
 * Every refusal captures the frame, so what an administrator sees in the
 * incident register is the person and whatever they were holding.
 */
export default function VerifyFlow({ mode = "in", onVerified, onCancel }) {
  const { session, profile, settings } = useAuth();

  const videoRef = useRef(null);
  const workRef = useRef(document.createElement("canvas"));
  const runRef = useRef(null);
  const loopRef = useRef(null);
  const streamRef = useRef(null);
  const lastObjectScan = useRef(0);
  const objectFindings = useRef({ devices: [], people: 0 });
  const abort = useRef(false);
  // The refusal handler is created once per render, but the run reads position
  // after that. Held in a ref so a flag raised mid-challenge carries real
  // coordinates instead of the null captured at render time.
  const posRef = useRef(null);

  const [gates, setGates] = useState({ location: "pending", live: "pending", device: "pending", identity: "pending" });
  const [phase, setPhase] = useState("idle");   // idle | preparing | running | passed | refused
  const [status, setStatus] = useState("");
  const [prompt, setPrompt] = useState("");
  const [hint, setHint] = useState("");
  const [cue, setCue] = useState(null);
  const [ring, setRing] = useState(0);
  const [refusal, setRefusal] = useState(null);
  const [geoInfo, setGeoInfo] = useState(null);

  const setGate = (k, v) => setGates((g) => ({ ...g, [k]: v }));

  /* ── teardown ───────────────────────────────────────── */
  const stopCamera = useCallback(() => {
    cancelAnimationFrame(loopRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => { abort.current = true; stopCamera(); }, [stopCamera]);

  /* ── refusal path: capture, flag, stop ──────────────── */
  const refuse = useCallback(async ({ gate, flagType, severity, message, detail, matchedUserId = null }) => {
    setGate(gate, "deny");
    setPhase("refused");
    setRefusal({ message, flagType });
    setCue(null);

    let blob = null;
    try {
      if (videoRef.current?.videoWidth) {
        const c = grabFrame(videoRef.current, workRef.current);
        blob = await frameToBlob(c);
      }
    } catch { /* evidence is best effort, the refusal still stands */ }

    const fp = await deviceFingerprint().catch(() => null);
    await raiseFlag({
      userId: session.user.id,
      matchedUserId,
      flagType, severity,
      detail: { mode, ...detail },
      fingerprint: fp,
      lat: posRef.current?.lat ?? null,
      lng: posRef.current?.lng ?? null,
      evidenceBlob: blob,
    });

    stopCamera();
  }, [session, mode, stopCamera]);

  /* ── the run ────────────────────────────────────────── */
  const begin = useCallback(async () => {
    abort.current = false;
    setRefusal(null);
    setPhase("preparing");
    setGates({ location: "active", live: "pending", device: "pending", identity: "pending" });

    /* GATE 1 — LOCATION ------------------------------------------------ */
    setStatus("Confirming you are on the premises");
    let pos;
    try {
      pos = await readPosition();
    } catch (e) {
      await refuse({
        gate: "location", flagType: "location_unavailable", severity: "medium",
        message: e.message, detail: { code: e.code },
      });
      return;
    }
    posRef.current = pos;
    setGeoInfo(pos);

    const perimeter = checkPerimeter(pos, settings);
    if (!perimeter.pass) {
      await refuse({
        gate: "location", flagType: perimeter.reason,
        severity: perimeter.reason === "outside_geofence" ? "high" : "medium",
        message: perimeter.message,
        detail: { distance_m: Math.round(perimeter.distance), accuracy_m: pos.accuracy, lat: pos.lat, lng: pos.lng },
      });
      return;
    }
    setGate("location", "clear");
    setStatus(perimeter.message);

    /* GATE 2 PREP — camera and models ---------------------------------- */
    setGate("device", "active");
    setStatus("Starting the camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    } catch {
      setPhase("refused");
      setRefusal({ message: "The camera could not be opened. Allow camera access in your browser settings and try again." });
      return;
    }

    await loadFaceModels((s) => setStatus(s));
    await loadSpoofModels((s) => setStatus(s));
    if (abort.current) return;

    /* Pre-flight sweep for anything held up to the camera --------------- */
    setStatus("Checking your surroundings");
    const c0 = grabFrame(videoRef.current, workRef.current);
    const pre = await scanFrameObjects(c0);
    if (pre.devices.length) {
      const worst = pre.devices[0];
      await refuse({
        gate: "device", flagType: "device_in_frame", severity: "critical",
        message: `The camera can see ${worst.label}. Put it down, hold your camera yourself and start again.`,
        detail: { devices: pre.devices, stage: "preflight" },
      });
      return;
    }
    setGate("device", "clear");

    /* GATE 3 — LIVENESS ------------------------------------------------ */
    setGate("live", "active");
    runRef.current = new LivenessRun();
    setPhase("running");

    const tick = async () => {
      if (abort.current || !videoRef.current) return;
      const run = runRef.current;

      const { face, count } = await readPrimaryFace(videoRef.current).catch(() => ({ face: null, count: 0 }));

      /* A second face in frame is a proxy attempt, refuse immediately */
      if (count > 1) {
        await refuse({
          gate: "device", flagType: "multiple_faces", severity: "critical",
          message: "More than one face is in the frame. Only you can record your own attendance.",
          detail: { faceCount: count },
        });
        return;
      }

      /* Keep sweeping for devices while the challenge runs, because a phone
         is often only raised once the person sees the prompts start */
      if (Date.now() - lastObjectScan.current > 700) {
        lastObjectScan.current = Date.now();
        const c = grabFrame(videoRef.current, workRef.current);
        const found = await scanFrameObjects(c).catch(() => null);
        if (found?.devices.length) {
          const worst = found.devices[0];
          await refuse({
            gate: "device", flagType: "device_in_frame", severity: "critical",
            message: `The camera can see ${worst.label} in the frame. Attendance was refused and the moment has been recorded.`,
            detail: { devices: found.devices, stage: "during_challenge" },
          });
          return;
        }
        objectFindings.current = found || objectFindings.current;
      }

      const st = face ? run.feed(measure(face.landmarks)) : run.missedFrame();

      setPrompt(face ? st.prompt : "Bring your face into the circle");
      setHint(face ? st.hint : "");
      setCue(face ? st.cue : null);
      setRing(st.progress + st.holdRatio / st.totalSteps);

      if (st.failed) {
        setGate("live", "deny");
        setPhase("refused");
        setRefusal({ message: st.failed.message, retry: true });
        stopCamera();
        return;
      }

      if (!st.done) { loopRef.current = requestAnimationFrame(tick); return; }

      /* ── challenge complete, now judge what we saw ── */
      setGate("live", "clear");
      setCue(null);
      setPrompt("Verifying");
      setStatus("Checking the image");

      const canvas = grabFrame(videoRef.current, workRef.current);
      const box = face.detection.box;
      const sharp = sharpnessOf(canvas, box);
      const screen = screenLikelihood(canvas, box);
      const flat = flatnessScore(run.signatures);

      const call = verdict({
        devices: objectFindings.current.devices,
        faceCount: 1,
        screenScore: screen,
        flatness: flat,
        sharpness: sharp,
      });

      if (!call.pass) {
        await refuse({
          gate: "device", flagType: call.flagType, severity: call.severity,
          message: call.message, detail: call.detail,
        });
        return;
      }

      const liveScore = run.score();
      if (liveScore < settings.liveness_threshold) {
        await refuse({
          gate: "live", flagType: "liveness_failed", severity: "high",
          message: "Your face was not clearly in view for enough of the check. Find better light and try again.",
          detail: { liveScore, ...call.detail },
        });
        return;
      }

      /* GATE 4 — IDENTITY ------------------------------------------------ */
      setGate("identity", "active");
      setStatus("Matching your face to your record");

      const enrolments = await getMyEnrolments(session.user.id);
      if (!enrolments.length) {
        setPhase("refused");
        setRefusal({ message: "Your face is not enrolled yet. Set it up from your profile before recording attendance." });
        stopCamera();
        return;
      }

      const live = face.descriptor;
      let best = Infinity;
      for (const e of enrolments) best = Math.min(best, vectorDistance(live, e.descriptor));

      if (best > settings.face_match_threshold) {
        await refuse({
          gate: "identity", flagType: "face_mismatch", severity: "critical",
          message: "The face in front of the camera does not match the one on this account. If this is your account, re-enrol your face. If you are signing in for someone else, this attempt has been recorded.",
          detail: { matchDistance: Number(best.toFixed(4)), threshold: settings.face_match_threshold, liveScore },
        });
        return;
      }
      setGate("identity", "clear");

      /* Shared handset check --------------------------------------------- */
      const fp = await deviceFingerprint();
      const alsoSignedIn = await sharedDeviceCount(fp);
      if (alsoSignedIn > 0) {
        await raiseFlag({
          userId: session.user.id,
          flagType: "shared_device", severity: "high",
          detail: {
            message: "This handset had already recorded attendance for other staff today.",
            otherCount: alsoSignedIn,
          },
          fingerprint: fp, lat: pos.lat, lng: pos.lng,
          evidenceBlob: await frameToBlob(grabFrame(videoRef.current, workRef.current)),
        });
      }

      setPhase("passed");
      setPrompt("Verified");
      stopCamera();

      onVerified({
        lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy,
        distance: perimeter.distance,
        liveness: liveScore,
        matchDistance: Number(best.toFixed(4)),
        fingerprint: fp,
        sharedDevice: alsoSignedIn > 0,
      });
    };

    loopRef.current = requestAnimationFrame(tick);
  }, [settings, session, refuse, stopCamera, onVerified]);

  /* ── render ─────────────────────────────────────────── */
  const R = 158;
  const CIRC = 2 * Math.PI * R;
  const clearedGates = Object.values(gates).filter((state) => state === "clear").length;
  const activeFraction = phase === "running" ? Math.min(1, ring) : Object.values(gates).includes("active") ? 0.2 : 0;
  const instrumentProgress = phase === "passed" ? 1 : Math.min(1, (clearedGates + activeFraction) / 4);

  return (
    <div className="verify-flow">
      <div className="verification-instrument" data-phase={phase}>
        <header className="verify-head">
          <div>
            <span className="mono">LIVE VERIFICATION · {mode === "in" ? "ARRIVAL" : "DEPARTURE"}</span>
            <strong>Four-gate reading</strong>
          </div>
          <span className="mono verify-run-state">{phase === "idle" ? "READY" : phase.toUpperCase()}</span>
        </header>

        <div className="verify-grid">
          <GateStrip states={gates} />

          <div className="verify-chamber">
            <div className="scan-frame">
              <video ref={videoRef} playsInline muted autoPlay aria-label="Live camera view for attendance verification" />
              {phase === "running" ? <div className="sweep" /> : null}
              {cue ? <DirectionCue direction={cue} /> : null}
              <div className="scan-reticle" aria-hidden="true"><i /><i /><i /><i /></div>

              <svg className="scan-ring" viewBox="0 0 340 340" aria-hidden="true">
                <circle cx="170" cy="170" r={R} stroke="color-mix(in srgb, var(--ledger) 22%, transparent)" strokeWidth="3" />
                <circle
                  cx="170" cy="170" r={R}
                  stroke={phase === "refused" ? "var(--deny)" : "var(--beam)"}
                  strokeWidth="4"
                  strokeDasharray={CIRC}
                  strokeDashoffset={CIRC * (1 - instrumentProgress)}
                  style={{ transition: "stroke-dashoffset 220ms linear, stroke 180ms ease" }}
                />
              </svg>

              {phase === "idle" ? (
                <div className="scan-privacy">
                  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
                    <path d="M6 10h4l2-3h6l2 3h4v14H6z" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <circle cx="15" cy="17" r="4" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                  <p>The camera opens only for this check. Live video is not uploaded.</p>
                </div>
              ) : null}
            </div>

            <div className="verify-readout" aria-live="polite">
              {phase === "running" ? (
                <>
                  <strong className="display">{prompt}</strong>
                  {hint ? <span className="mono">{hint}</span> : null}
                </>
              ) : null}
              {phase === "preparing" ? <Spinner label={status} /> : null}
              {phase === "passed" ? <strong className="display verify-cleared">Verified and cleared</strong> : null}
              {phase === "idle" ? (
                <>
                  <strong className="display">Ready for a live reading</strong>
                  <p>A head-turn order is drawn now and changes on every attempt, so a recording cannot prepare for it.</p>
                </>
              ) : null}
              {phase === "refused" ? <strong className="display verify-refused">Reading refused</strong> : null}
            </div>

            <div className="verify-controls">
              {phase === "idle" || phase === "refused" ? (
                <>
                  <button type="button" className="btn btn-primary" onClick={begin}>
                    {phase === "refused" ? "Try again" : mode === "in" ? "Start sign in" : "Start sign out"}
                  </button>
                  {onCancel ? <button type="button" className="btn btn-ghost" onClick={() => { stopCamera(); onCancel(); }}>Cancel</button> : null}
                </>
              ) : null}
              {phase === "running" || phase === "preparing" ? (
                <button type="button" className="btn btn-ghost" onClick={() => { abort.current = true; stopCamera(); setPhase("idle"); setGates({ location: "pending", live: "pending", device: "pending", identity: "pending" }); }}>
                  Stop verification
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {refusal && (
        <Notice tone="deny" title="Attendance refused">
          {refusal.message}
          {refusal.flagType && (
            <div className="mono text-[11px] text-muted mt-2 uppercase tracking-wider">
              Recorded as {refusal.flagType.replace(/_/g, " ")} · visible to the ICT department
            </div>
          )}
        </Notice>
      )}

      {geoInfo && gates.location === "clear" && phase !== "refused" && (
        <div className="mono verify-geo-readout">
          {formatDistance(checkPerimeter(geoInfo, settings).distance)} from the site centre ·
          accurate to {Math.round(geoInfo.accuracy)}m
        </div>
      )}
    </div>
  );
}
