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
    <div className="space-y-5">
      <div className="flex gap-1.5">
        {POSES.map((p, i) => (
          <div key={p.capture} className="flex-1">
            <div className={`h-1 rounded-sm transition-colors ${i < step ? "bg-clear" : i === step ? "bg-hold" : "bg-line"}`} />
            <div className="mono text-[10px] text-muted mt-1.5 uppercase tracking-wider">{p.capture}</div>
          </div>
        ))}
      </div>

      <div className="panel p-5 md:p-6">
        <div className="scan-frame">
          <video ref={videoRef} playsInline muted autoPlay />
          {phase === "running" && <div className="sweep" />}
          {phase === "running" && pose.cue === "left" && <div className="cue cue-left">◄</div>}
          {phase === "running" && pose.cue === "right" && <div className="cue cue-right">►</div>}
          {phase === "running" && pose.cue === "up" && <div className="cue cue-up">▲</div>}
        </div>

        <div className="mt-5 text-center min-h-[58px]">
          {phase === "running" && (
            <>
              <div className="display text-[21px]">{pose.prompt}</div>
              <div className="mono text-[11px] text-muted mt-1.5 uppercase tracking-wider">{status}</div>
            </>
          )}
          {phase === "preparing" && <div className="flex justify-center"><Spinner label={status} /></div>}
          {phase === "saving" && <div className="flex justify-center"><Spinner label="Saving your face" /></div>}
          {phase === "done" && <div className="display text-[21px] text-beam">Face enrolled</div>}
          {phase === "idle" && (
            <div className="text-[14px] text-muted max-w-sm mx-auto leading-relaxed">
              Four quick captures from four angles. Take off sunglasses, face a window
              or a lamp, and this takes under a minute.
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-3 justify-center">
          {(phase === "idle" || phase === "error") && (
            <>
              <button className="btn btn-primary" onClick={begin}>
                {phase === "error" ? "Try again" : "Start enrolment"}
              </button>
              {onCancel && <button className="btn btn-ghost" onClick={() => { stop(); onCancel(); }}>Cancel</button>}
            </>
          )}
          {(phase === "running" || phase === "preparing") && (
            <button className="btn btn-ghost" onClick={() => { abort.current = true; stop(); setPhase("idle"); setStep(0); }}>
              Stop
            </button>
          )}
        </div>
      </div>

      {error && <Notice tone="deny" title="Enrolment stopped">{error}</Notice>}
    </div>
  );
}
