/**
 * Liveness challenge.
 *
 * The system names three actions in a random order and you have to perform
 * them, on camera, within a few seconds each. This is what makes a recorded
 * video useless: the recording was made before the system chose the order,
 * so it cannot possibly contain the right moves in the right sequence.
 *
 * The sequence is drawn fresh for every single attempt, including retries.
 */

import { yawOf, pitchOf, eyeOpenness, geometrySignature } from "./faceEngine";

export const ACTIONS = {
  center: {
    id: "center",
    prompt: "Look straight at the camera",
    hint: "Hold still for a moment",
    cue: null,
    test: (m) => Math.abs(m.yaw) < 0.09 && m.pitch > 0.42 && m.pitch < 0.62,
  },
  left: {
    id: "left",
    prompt: "Turn your head to your left",
    hint: "Turn, do not just move your eyes",
    cue: "left",
    test: (m) => m.yaw > 0.2,
  },
  right: {
    id: "right",
    prompt: "Turn your head to your right",
    hint: "Turn, do not just move your eyes",
    cue: "right",
    test: (m) => m.yaw < -0.2,
  },
  up: {
    id: "up",
    prompt: "Lift your chin and look up",
    hint: "Keep your face in the circle",
    cue: "up",
    test: (m) => m.pitch < 0.4,
  },
  blink: {
    id: "blink",
    prompt: "Blink twice",
    hint: "A clear, deliberate blink",
    cue: null,
    test: (m) => m.blinks >= 2,
  },
};

/** Reads the pose measurements out of one detected face. */
export function measure(landmarks) {
  return {
    yaw: yawOf(landmarks),
    pitch: pitchOf(landmarks),
    ear: eyeOpenness(landmarks),
    signature: geometrySignature(landmarks),
  };
}

/** Draws a fresh challenge order. Always opens and closes facing forward. */
export function drawSequence() {
  const middle = ["left", "right", "up"];
  // Fisher-Yates
  for (let i = middle.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [middle[i], middle[j]] = [middle[j], middle[i]];
  }
  const picked = middle.slice(0, 2);
  const withBlink = Math.random() < 0.5;
  const steps = ["center", ...picked, ...(withBlink ? ["blink"] : []), "center"];
  return steps.map((id) => ACTIONS[id]);
}

const BLINK_CLOSED = 0.19;
const BLINK_OPEN = 0.25;
const HOLD_FRAMES = 4;      // frames a pose must persist to count
const STEP_TIMEOUT_MS = 9000;

/**
 * Runs the sequence frame by frame.
 * Feed it a measurement each frame and it reports where things stand.
 */
export class LivenessRun {
  constructor() {
    this.sequence = drawSequence();
    this.index = 0;
    this.held = 0;
    this.blinks = 0;
    this.eyesClosed = false;
    this.signatures = [];
    this.startedAt = Date.now();
    this.stepStartedAt = Date.now();
    this.framesSeen = 0;
    this.framesWithFace = 0;
    this.done = false;
    this.failed = null;
  }

  get current() { return this.sequence[this.index]; }
  get progress() { return this.index / this.sequence.length; }
  get total() { return this.sequence.length; }

  /** No face this frame. Counted, because a face that disappears mid-check matters. */
  missedFrame() {
    this.framesSeen++;
    this.held = 0;
    return this.state();
  }

  /** One frame with a face in it. */
  feed(m) {
    this.framesSeen++;
    this.framesWithFace++;

    // Blink tracking runs continuously, not only during the blink step
    if (m.ear < BLINK_CLOSED && !this.eyesClosed) this.eyesClosed = true;
    else if (m.ear > BLINK_OPEN && this.eyesClosed) { this.eyesClosed = false; this.blinks++; }

    if (this.done || this.failed) return this.state();

    if (Date.now() - this.stepStartedAt > STEP_TIMEOUT_MS) {
      this.failed = {
        reason: "timeout",
        message: `Ran out of time on "${this.current.prompt}". Start again when you are ready.`,
      };
      return this.state();
    }

    const passed = this.current.test({ ...m, blinks: this.blinks });

    if (passed) {
      this.held++;
      if (this.held >= HOLD_FRAMES) {
        this.signatures.push(m.signature);
        this.index++;
        this.held = 0;
        this.stepStartedAt = Date.now();
        if (this.index >= this.sequence.length) this.done = true;

        // Blinks are counted continuously from the start of the run, so by the
        // time a blink step arrives the person has usually blinked naturally
        // already and the step would pass without them doing anything. Zero the
        // counter as the step begins so it measures a deliberate blink.
        if (this.current?.id === "blink") this.blinks = 0;
      }
    } else {
      this.held = Math.max(0, this.held - 1);
    }

    return this.state();
  }

  state() {
    return {
      done: this.done,
      failed: this.failed,
      stepIndex: this.index,
      totalSteps: this.sequence.length,
      prompt: this.done ? "Verified" : this.current?.prompt,
      hint: this.done ? "" : this.current?.hint,
      cue: this.done ? null : this.current?.cue,
      holdRatio: Math.min(1, this.held / HOLD_FRAMES),
      progress: this.index / this.sequence.length,
      msLeft: Math.max(0, STEP_TIMEOUT_MS - (Date.now() - this.stepStartedAt)),
    };
  }

  /**
   * Quality of the completed run.
   * A run where the face vanished for long stretches, or that finished
   * implausibly fast, scores lower even if every step technically passed.
   */
  score() {
    if (!this.done) return 0;
    const elapsed = Date.now() - this.startedAt;
    const presence = this.framesSeen ? this.framesWithFace / this.framesSeen : 0;
    const paceOk = elapsed > 2200 ? 1 : elapsed / 2200;
    return Number((presence * 0.6 + paceOk * 0.4).toFixed(3));
  }
}
