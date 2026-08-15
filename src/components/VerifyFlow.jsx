import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { GateStrip, Notice, Spinner } from "./UI";
import {
  loadFaceModels, readPrimaryFace, sharpnessOf,
  grabFrame, frameToBlob, vectorDistance, hasReadableVideoFrame, waitForVideoFrame,
} from "../lib/faceEngine";
import { loadSpoofModels, scanFrameObjects, screenLikelihood, flatnessScore, verdict } from "../lib/spoofGuard";
import { LivenessRun, measure } from "../lib/liveness";
import { readPosition, checkPerimeter, formatDistance } from "../lib/geo";
import { deviceFingerprint } from "../lib/device";
import { getMyEnrolments, raiseFlag, sharedDeviceCount } from "../lib/db";
import { guideLanguage, readCameraFraming } from "../lib/cameraFraming";

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
export default function VerifyFlow({ mode = "in", onVerified, onCancel, autoStart = true }) {
  const { session, profile, settings } = useAuth();

  const videoRef = useRef(null);
  const workRef = useRef(document.createElement("canvas"));
  const runRef = useRef(null);
  const loopRef = useRef(null);
  const streamRef = useRef(null);
  const lastObjectScan = useRef(0);
  const objectScanBusy = useRef(false);
  const objectFindings = useRef({ devices: [], people: 0 });
  const framingRef = useRef({ missed: 0, aligned: 0 });
  const refusalLock = useRef(false);
  const autoStarted = useRef(false);
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
  const [refusalBusy, setRefusalBusy] = useState(false);
  const [geoInfo, setGeoInfo] = useState(null);
  const [framing, setFraming] = useState({
    state: "idle",
    instruction: "Position your face inside the guide",
    detail: "The camera will show you when it is ready",
  });
  const updateFraming = useCallback((next) => {
    setFraming((current) => (
      current.state === next.state &&
      current.instruction === next.instruction &&
      current.detail === next.detail
        ? current
        : next
    ));
  }, []);

  const setGate = (k, v) => setGates((g) => ({ ...g, [k]: v }));

  /* ── teardown ───────────────────────────────────────── */
  const stopCamera = useCallback(() => {
    if (loopRef.current !== null) cancelAnimationFrame(loopRef.current);
    loopRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => { abort.current = true; stopCamera(); }, [stopCamera]);

  /* ── refusal path: capture, flag, stop ──────────────── */
  const refuse = useCallback(async ({ gate, flagType, severity, message, detail, matchedUserId = null }) => {
    if (refusalLock.current) return;
    refusalLock.current = true;
    abort.current = true;
    setRefusalBusy(true);
    setGate(gate, "deny");
    setPhase("refused");
    setRefusal({ message, flagType });
    setCue(null);

    let blob = null;
    try {
      const video = videoRef.current;
      if (hasReadableVideoFrame(video)) {
        const c = grabFrame(video, workRef.current);
        blob = await frameToBlob(c);
      }
    } catch { /* evidence is best effort, the refusal still stands */ }

    const fp = await deviceFingerprint().catch(() => null);
    try {
      const incident = await raiseFlag({
        userId: session.user.id,
        matchedUserId,
        flagType, severity,
        detail: { mode, ...detail },
        fingerprint: fp,
        lat: posRef.current?.lat ?? null,
        lng: posRef.current?.lng ?? null,
        evidenceBlob: blob,
      });
      setRefusal({
        message, flagType,
        recorded: Boolean(incident?.id),
        evidenceAttached: Boolean(incident?.evidence_path),
      });
    } catch (recordError) {
      console.error("Suspicious attendance attempt could not be recorded:", recordError);
      setRefusal({
        title: "Attendance refused",
        message: `${message} The incident register could not be reached, so ICT should be contacted before another attempt.`,
      });
    } finally {
      stopCamera();
      setRefusalBusy(false);
    }
  }, [session, mode, stopCamera]);

  /* ── the run ────────────────────────────────────────── */
  const begin = useCallback(async () => {
    abort.current = false;
    refusalLock.current = false;
    setRefusalBusy(false);
    setRefusal(null);
    setPhase("preparing");
    setGates({ location: "active", live: "pending", device: "pending", identity: "pending" });
    setFraming({ state: "preparing", instruction: "Opening the front camera", detail: "Keep this screen open" });
    framingRef.current = { missed: 0, aligned: 0 };
    runRef.current = null;
    lastObjectScan.current = 0;
    objectScanBusy.current = false;
    objectFindings.current = { devices: [], people: 0 };
    posRef.current = null;
    setRing(0);

    /* Camera, location and models start together. The camera must be open
       before a location refusal so that the incident register receives the
       same protected evidence frame as every other suspicious attempt. */
    setGate("device", "active");
    setStatus("Opening the camera and confirming your location");
    const positionPromise = readPosition()
      .then((position) => ({ position, error: null }))
      .catch((error) => ({ position: null, error }));
    const modelsPromise = Promise.all([
      loadFaceModels((s) => setStatus(s)),
      loadSpoofModels((s) => setStatus(s)),
    ]).then(() => ({ error: null })).catch((error) => ({ error }));

    let video;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 720 },
          height: { ideal: 960 },
          aspectRatio: { ideal: 0.75 },
        },
        audio: false,
      });
      streamRef.current = stream;
      video = videoRef.current;
      if (!video || abort.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      await waitForVideoFrame(video);
    } catch {
      stopCamera();
      setPhase("refused");
      setRefusal({ title: "Camera unavailable", message: "The camera could not be opened. Allow camera access in your browser settings and try again." });
      return;
    }

    const { position: pos, error: locationError } = await positionPromise;
    if (abort.current) return;
    if (locationError) {
      await refuse({
        gate: "location", flagType: "location_unavailable", severity: "medium",
        message: locationError.message,
        detail: { code: locationError.code, evidence_stage: "camera_open_before_location_decision" },
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
        detail: {
          distance_m: Math.round(perimeter.distance), accuracy_m: pos.accuracy,
          lat: pos.lat, lng: pos.lng, evidence_stage: "camera_open_before_location_decision",
        },
      });
      return;
    }
    setGate("location", "clear");
    setStatus(perimeter.message);

    const { error: modelError } = await modelsPromise;
    if (abort.current) return;
    if (modelError) {
      stopCamera();
      setPhase("refused");
      setRefusal({ title: "Verification unavailable", message: "The face checks could not be prepared. Check your connection and try again." });
      return;
    }

    /* Pre-flight sweep for anything held up to the camera --------------- */
    setStatus("Checking your surroundings");
    const c0 = grabFrame(video, workRef.current);
    const pre = await scanFrameObjects(c0);
    if (abort.current || videoRef.current !== video) return;
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
    setPhase("running");
    setPrompt("Position your face inside the guide");
    setHint("The timed check begins only when your face is stable");
    setFraming({
      state: "searching",
      instruction: "Move closer and place your face inside the guide",
      detail: "Keep the phone upright and look directly at the camera",
    });

    const tick = async () => {
      const activeVideo = videoRef.current;
      if (abort.current || !hasReadableVideoFrame(activeVideo)) return;

      const { face, count } = await readPrimaryFace(activeVideo).catch(() => ({ face: null, count: 0 }));
      if (abort.current || videoRef.current !== activeVideo) return;

      /* A second face in frame is a proxy attempt, refuse immediately */
      if (count > 1) {
        setFraming({ state: "blocked", instruction: "Only one person can be in view", detail: "Ask everyone else to step outside the camera frame" });
        await refuse({
          gate: "device", flagType: "multiple_faces", severity: "critical",
          message: "More than one face is in the frame. Only you can record your own attendance.",
          detail: { faceCount: count },
        });
        return;
      }

      /* Keep sweeping for devices while the challenge runs, because a phone
         is often only raised once the person sees the prompts start */
      if (!objectScanBusy.current && Date.now() - lastObjectScan.current > 1200) {
        lastObjectScan.current = Date.now();
        objectScanBusy.current = true;
        try {
          const scanCanvas = grabFrame(activeVideo, document.createElement("canvas"));
          void scanFrameObjects(scanCanvas)
            .then(async (found) => {
              if (abort.current || !found) return;
              objectFindings.current = found;
              if (!found.devices.length) return;
              const worst = found.devices[0];
              await refuse({
                gate: "device", flagType: "device_in_frame", severity: "critical",
                message: `The camera can see ${worst.label} in the frame. Attendance was refused and the moment has been recorded.`,
                detail: { devices: found.devices, stage: "during_challenge" },
              });
            })
            .finally(() => { objectScanBusy.current = false; });
        } catch {
          objectScanBusy.current = false;
        }
      }

      const frameReading = readCameraFraming(face, activeVideo);

      if (!face) {
        framingRef.current.missed += 1;
        framingRef.current.aligned = 0;
        const run = runRef.current;
        const st = run ? run.missedFrame() : null;

        // A single low-confidence detector frame should not make the whole
        // screen jump. Once a challenge has begun it still counts as missed
        // liveness evidence, but the visible instruction changes only after
        // three consecutive misses.
        if (framingRef.current.missed >= 3) {
          updateFraming(frameReading);
          setPrompt(frameReading.instruction);
          setHint(frameReading.detail);
          setCue(null);
        }
        if (st) setRing(st.progress + st.holdRatio / st.totalSteps);
        if (st?.failed) {
          await refuse({
            gate: "live", flagType: "liveness_failed", severity: "high",
            message: st.failed.message,
            detail: { reason: st.failed.reason, stage: "challenge", missed_frames: framingRef.current.missed },
          });
          return;
        }
        loopRef.current = requestAnimationFrame(tick);
        return;
      }

      framingRef.current.missed = 0;

      if (!frameReading.ready) {
        framingRef.current.aligned = 0;
        const run = runRef.current;
        const st = run ? run.missedFrame() : null;
        updateFraming(frameReading);
        setPrompt(frameReading.instruction);
        setHint(frameReading.detail);
        setCue(null);
        if (st) setRing(st.progress + st.holdRatio / st.totalSteps);
        if (st?.failed) {
          await refuse({
            gate: "live", flagType: "liveness_failed", severity: "high",
            message: st.failed.message,
            detail: { reason: st.failed.reason, stage: "challenge", framing: frameReading.state },
          });
          return;
        }
        loopRef.current = requestAnimationFrame(tick);
        return;
      }

      framingRef.current.aligned += 1;
      if (!runRef.current && framingRef.current.aligned < 3) {
        if (framingRef.current.aligned >= 2) {
          updateFraming({ state: "locking", instruction: "Face found", detail: "Hold the phone still while the camera locks on" });
          setPrompt("Face found");
          setHint("Hold still. The check is about to begin");
        }
        loopRef.current = requestAnimationFrame(tick);
        return;
      }

      // The timed challenge begins only after three consecutive, centred face
      // readings. This prevents camera start-up and positioning time from
      // consuming the user's liveness attempt.
      if (!runRef.current) runRef.current = new LivenessRun();
      const run = runRef.current;
      const st = run.feed(measure(face.landmarks));

      const visibleHint = guideLanguage(st.hint);
      setPrompt(st.prompt);
      setHint(visibleHint);
      setCue(face ? st.cue : null);
      setRing(st.progress + st.holdRatio / st.totalSteps);
      updateFraming({ state: "challenge", instruction: st.prompt, detail: visibleHint || "Keep your face inside the guide" });

      if (st.failed) {
        await refuse({
          gate: "live", flagType: "liveness_failed", severity: "high",
          message: st.failed.message,
          detail: { reason: st.failed.reason, stage: "challenge" },
        });
        return;
      }

      if (!st.done) { loopRef.current = requestAnimationFrame(tick); return; }

      /* ── challenge complete, now judge what we saw ── */
      setGate("live", "clear");
      setCue(null);
      setPrompt("Verifying");
      setStatus("Checking the image");
      setFraming({ state: "verifying", instruction: "Checking your live reading", detail: "Keep this screen open" });

      if (abort.current || videoRef.current !== activeVideo) return;
      const canvas = grabFrame(activeVideo, workRef.current);
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
      if (abort.current || videoRef.current !== activeVideo) return;
      if (!enrolments.length) {
        abort.current = true;
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
      if (abort.current || videoRef.current !== activeVideo) return;
      const alsoSignedIn = await sharedDeviceCount(fp);
      if (abort.current || videoRef.current !== activeVideo) return;
      if (alsoSignedIn > 0) {
        await raiseFlag({
          userId: session.user.id,
          flagType: "shared_device", severity: "high",
          detail: {
            message: "This handset had already recorded attendance for other staff today.",
            otherCount: alsoSignedIn,
          },
          fingerprint: fp, lat: pos.lat, lng: pos.lng,
          evidenceBlob: await frameToBlob(canvas),
        });
      }

      abort.current = true;
      setPhase("passed");
      setPrompt("Verified");
      setFraming({ state: "clear", instruction: "Attendance verified", detail: "Your reading has been accepted" });
      stopCamera();

      try {
        await onVerified({
          lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy,
          distance: perimeter.distance,
          liveness: liveScore,
          matchDistance: Number(best.toFixed(4)),
          fingerprint: fp,
          sharedDevice: alsoSignedIn > 0,
        });
      } catch (saveError) {
        setPhase("refused");
        setRefusal({
          title: "Attendance not saved",
          message: saveError.message || "Your face was verified, but the attendance record could not be saved. Check your connection and try again.",
          retry: true,
        });
      }
    };

    loopRef.current = requestAnimationFrame(tick);
  }, [settings, session, refuse, stopCamera, onVerified, updateFraming]);

  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    void begin();
  }, [autoStart, begin]);

  /* ── render ─────────────────────────────────────────── */
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
            <div className="verify-camera-placement">
              <span className="mono">CAMERA CENTRELINE</span>
              <small>Place your face in the guide, then keep your eyes on the camera lens directly above it.</small>
            </div>
            <div className="scan-frame" data-framing={framing.state}>
              <video ref={videoRef} playsInline muted autoPlay aria-label="Live camera view for attendance verification" />
              <div className="camera-sightline" aria-hidden="true"><i /><span>CAMERA LENS ABOVE</span><i /></div>
              {cue ? <DirectionCue direction={cue} /> : null}
              <div className="face-guide" aria-hidden="true">
                <i className="face-guide-eye-line" />
                <i className="face-guide-chin" />
              </div>
              {phase !== "idle" ? (
                <div className="scan-guidance" aria-hidden="true">
                  <span className="mono">{framing.state === "challenge" ? "FOLLOW THE INSTRUCTION" : "FACE POSITION"}</span>
                  <strong>{framing.instruction}</strong>
                  <small>{framing.detail}</small>
                </div>
              ) : null}
              <div className="scan-progress" aria-hidden="true"><i style={{ width: `${Math.round(instrumentProgress * 100)}%` }} /></div>

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
              {phase === "refused" ? <strong className="display verify-refused">{refusalBusy ? "Securing refusal evidence" : "Reading refused"}</strong> : null}
            </div>

            <div className="verify-controls">
              {phase === "idle" || phase === "refused" ? (
                <>
                  <button type="button" className="btn btn-primary" onClick={begin} disabled={refusalBusy}>
                    {phase === "refused" ? refusalBusy ? "Recording attempt" : "Try again" : mode === "in" ? "Start sign in" : "Start sign out"}
                  </button>
                  {onCancel ? <button type="button" className="btn btn-ghost" onClick={() => { stopCamera(); onCancel(); }}>Cancel</button> : null}
                </>
              ) : null}
              {phase === "running" || phase === "preparing" ? (
                <button type="button" className="btn btn-ghost" onClick={() => { abort.current = true; stopCamera(); runRef.current = null; framingRef.current = { missed: 0, aligned: 0 }; setFraming({ state: "idle", instruction: "Position your face inside the guide", detail: "The camera will show you when it is ready" }); setPhase("idle"); setGates({ location: "pending", live: "pending", device: "pending", identity: "pending" }); }}>
                  Stop verification
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {refusal && (
        <Notice tone="deny" title={refusal.title || "Attendance refused"}>
          {refusal.message}
          {refusal.flagType && !refusalBusy && (
            <div className="mono text-[11px] text-muted mt-2 uppercase tracking-wider">
              Recorded as {refusal.flagType.replace(/_/g, " ")} · {refusal.evidenceAttached ? "protected image attached" : "attempt details attached"} · visible to ICT
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
