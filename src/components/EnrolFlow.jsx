import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { Notice, Spinner } from "./UI";
import { loadFaceModels, readPrimaryFace, sharpnessOf, grabFrame } from "../lib/faceEngine";
import { loadSpoofModels, scanFrameObjects } from "../lib/spoofGuard";
import { measure, ACTIONS } from "../lib/liveness";
import { saveEnrolment } from "../lib/db";

/**
 * Face enrolment.
 *
 * Four captures, one per pose. Storing several angles rather than a single
 * front-on shot is what stops the system rejecting someone on a day they
 * are standing slightly off to one side or the light has moved.
 *
 * A phone or a photo held up during enrolment would poison the record for
 * good, so the same surroundings check runs here as at attendance.
 */
const POSES = [
  { ...ACTIONS.center, capture: "center" },
  { ...ACTIONS.left, capture: "left" },
  { ...ACTIONS.right, capture: "right" },
  { ...ACTIONS.up, capture: "up" },
];

function EnrolCue({ direction }) {
  const paths = {
    left: "M18 5l-7 7 7 7M11 12h15",
    right: "M14 5l7 7-7 7M21 12H6",
    up: "M5 14l7-7 7 7M12 7v15",
  };
  if (!paths[direction]) return null;
  return <div className={`enrol-cue is-${direction}`} aria-hidden="true"><svg viewBox="0 0 32 32"><path d={paths[direction]} /></svg></div>;
}

export default function EnrolFlow({ onDone, onCancel }) {
  const { session, refresh } = useAuth();
  const videoRef = useRef(null);
  const workRef = useRef(document.createElement("canvas"));
  const loopRef = useRef(null);
  const streamRef = useRef(null);
  const captured = useRef([]);
  const held = useRef(0);
  const abort = useRef(false);
  const lastScan = useRef(0);

  const [phase, setPhase] = useState("idle");  // idle | preparing | running | saving | done | error
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(loopRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => { abort.current = true; stop(); }, [stop]);

  const begin = useCallback(async () => {
    abort.current = false;
    setError(null);
    captured.current = [];
    held.current = 0;
    setStep(0);
    setPhase("preparing");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    } catch {
      setPhase("error");
      setError("The camera could not be opened. Allow camera access in your browser settings and try again.");
      return;
    }

    setStatus("Loading the face models");
    await loadFaceModels((s) => setStatus(s));
    await loadSpoofModels((s) => setStatus(s));
    if (abort.current) return;

    setPhase("running");

    const tick = async () => {
      if (abort.current || !videoRef.current) return;

      const { face, count } = await readPrimaryFace(videoRef.current).catch(() => ({ face: null, count: 0 }));

      if (Date.now() - lastScan.current > 900) {
        lastScan.current = Date.now();
        const c = grabFrame(videoRef.current, workRef.current);
        const found = await scanFrameObjects(c).catch(() => null);
        if (found?.devices.length) {
          stop();
          setPhase("error");
          setError(`The camera can see ${found.devices[0].label}. Enrolment must be done with your own face, in person. Put it away and start again.`);
          return;
        }
      }

      if (count > 1) {
        setStatus("Only you should be in the frame");
        held.current = 0;
        loopRef.current = requestAnimationFrame(tick);
        return;
      }

      if (!face) {
        setStatus("Bring your face into the circle");
        held.current = 0;
        loopRef.current = requestAnimationFrame(tick);
        return;
      }

      const pose = POSES[captured.current.length];
      const m = measure(face.landmarks);

      if (pose.test({ ...m, blinks: 0 })) {
        held.current++;
        setStatus(`Hold it`);
        if (held.current >= 6) {
          const canvas = grabFrame(videoRef.current, workRef.current);
          const quality = sharpnessOf(canvas, face.detection.box);

          if (quality < 40) {
            held.current = 0;
            setStatus("Too blurry. Find brighter light and hold steady.");
            loopRef.current = requestAnimationFrame(tick);
            return;
          }

          captured.current.push({ descriptor: face.descriptor, quality, pose: pose.capture });
          held.current = 0;
          setStep(captured.current.length);

          if (captured.current.length >= POSES.length) {
            stop();
            setPhase("saving");
            try {
              await saveEnrolment(session.user.id, captured.current);
              await refresh();
              setPhase("done");
              onDone?.();
            } catch (e) {
              setPhase("error");
              setError(`Your face could not be saved: ${e.message}`);
            }
            return;
          }
        }
      } else {
        held.current = Math.max(0, held.current - 1);
        setStatus(pose.hint);
      }

      loopRef.current = requestAnimationFrame(tick);
    };

    loopRef.current = requestAnimationFrame(tick);
  }, [session, refresh, stop, onDone]);

  const pose = POSES[Math.min(step, POSES.length - 1)];

  return (
    <div className="enrol-flow" data-phase={phase}>
      <ol className="enrol-progress" aria-label={`Face enrolment position ${Math.min(step + 1, 4)} of 4`}>
        {POSES.map((item, index) => (
          <li key={item.capture} data-state={index < step ? "clear" : index === step ? "active" : "pending"}>
            <span className="mono">{String(index + 1).padStart(2, "0")}</span>
            <strong>{item.capture}</strong>
            <i aria-hidden="true" />
          </li>
        ))}
      </ol>

      <div className="enrol-instrument">
        <div className="enrol-instrument-head">
          <div><span className="mono">LIVE CAPTURE · POSITION {String(Math.min(step + 1, 4)).padStart(2, "0")}</span><strong>Face measurement</strong></div>
          <span className="mono">{phase === "idle" ? "READY" : phase.toUpperCase()}</span>
        </div>

        <div className="enrol-camera">
          <div className="scan-frame">
            <video ref={videoRef} playsInline muted autoPlay aria-label="Live camera view for face enrolment" />
            {phase === "running" ? <div className="sweep" /> : null}
            {phase === "running" ? <EnrolCue direction={pose.cue} /> : null}
            <div className="enrol-reticle" aria-hidden="true"><i /><i /><i /><i /></div>
            <svg className="enrol-ring" viewBox="0 0 340 340" aria-hidden="true">
              <circle cx="170" cy="170" r="158" />
              <circle className="is-progress" cx="170" cy="170" r="158" pathLength="4" strokeDasharray={`${step} ${4 - step}`} />
            </svg>
            {phase === "idle" ? (
              <div className="enrol-privacy">
                <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 11h5l2-3h5l2 3h4v14H7z" /><circle cx="16" cy="18" r="4" /></svg>
                <span>Camera opens only when you begin</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="enrol-readout" aria-live="polite">
          {phase === "running" ? <><strong className="display">{pose.prompt}</strong><span className="mono">{status}</span></> : null}
          {phase === "preparing" ? <Spinner label={status} /> : null}
          {phase === "saving" ? <Spinner label="Saving your face measurements" /> : null}
          {phase === "done" ? <strong className="display is-clear">Face record complete</strong> : null}
          {phase === "idle" ? <><strong className="display">Ready for four positions</strong><p>Remove sunglasses, face a window or lamp, and keep everyone else outside the frame.</p></> : null}
          {phase === "error" ? <strong className="display is-denied">Capture stopped</strong> : null}
        </div>

        <div className="enrol-actions">
          {(phase === "idle" || phase === "error") ? (
            <>
              <button type="button" className="btn btn-primary" onClick={begin}>{phase === "error" ? "Try enrolment again" : "Start live capture"}</button>
              {onCancel ? <button type="button" className="btn btn-ghost" onClick={() => { stop(); onCancel(); }}>Cancel</button> : null}
            </>
          ) : null}
          {(phase === "running" || phase === "preparing") ? (
            <button type="button" className="btn btn-ghost" onClick={() => { abort.current = true; stop(); setPhase("idle"); setStep(0); }}>Stop capture</button>
          ) : null}
        </div>
      </div>

      {error ? <Notice tone="deny" title="Enrolment stopped">{error}</Notice> : null}
    </div>
  );
}
