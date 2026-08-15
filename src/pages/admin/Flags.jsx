import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Shell, Pill, Spinner, Empty, Notice } from "../../components/UI";
import { listFlags, resolveFlag, evidenceUrl } from "../../lib/db";

const EXPLAIN = {
  device_in_frame: "A phone, screen, laptop or printed photo was visible during the check.",
  screen_replay: "The frame behaved like an image shown on a display rather than a live face.",
  flat_surface: "The face moved as one rigid surface, which is consistent with a photograph.",
  multiple_faces: "A second person was visible while attendance was being recorded.",
  face_mismatch: "The face in front of the camera did not match the face enrolled on this account.",
  liveness_failed: "The person did not complete the requested head turn or left the camera frame.",
  outside_geofence: "The device was outside the approved site perimeter.",
  low_gps_accuracy: "The location reading was too imprecise to confirm that the person was on site.",
  mocked_location: "The device reported signs that its location may have been falsified.",
  location_unavailable: "The device could not provide a location reading.",
  shared_device: "This handset had already recorded attendance for another staff member that day.",
};

const INCIDENT_LABELS = {
  low_gps_accuracy: "Low GPS accuracy",
  mocked_location: "Mocked location",
  outside_geofence: "Outside geofence",
  shared_device: "Shared device",
  face_mismatch: "Face mismatch",
  multiple_faces: "Multiple faces",
  screen_replay: "Screen replay",
  flat_surface: "Flat surface",
  device_in_frame: "Device in frame",
  liveness_failed: "Liveness failed",
  location_unavailable: "Location unavailable",
};
const formatType = (value) => INCIDENT_LABELS[value] || String(value || "attendance_refused").replace(/_/g, " ");
const formatMoment = (value) => new Date(value).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const severityTone = (severity) => severity === "critical" ? "deny" : severity === "high" ? "hold" : "mute";

export default function Flags() {
  const { profile } = useAuth();
  const [flags, setFlags] = useState([]);
  const [filter, setFilter] = useState("open");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [evidence, setEvidence] = useState({ state: "idle", url: null });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const load = () => {
    setLoading(true);
    listFlags({ resolved: null })
      .then(setFlags)
      .catch((error) => setMessage({ tone: "deny", text: error.message }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => ({
    open: flags.filter((flag) => !flag.resolved).length,
    critical: flags.filter((flag) => !flag.resolved && flag.severity === "critical").length,
    withEvidence: flags.filter((flag) => flag.evidence_path).length,
    resolved: flags.filter((flag) => flag.resolved).length,
  }), [flags]);
  const visibleFlags = useMemo(() => flags.filter((flag) => filter === "all" || (filter === "resolved" ? flag.resolved : !flag.resolved)), [filter, flags]);
  const selected = flags.find((flag) => flag.id === selectedId) || null;

  async function selectIncident(flag) {
    if (selectedId === flag.id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(flag.id);
    setNote("");
    setMessage(null);
    if (!flag.evidence_path) {
      setEvidence({ state: "none", url: null });
      return;
    }
    setEvidence({ state: "loading", url: null });
    const url = await evidenceUrl(flag.evidence_path);
    setEvidence(url ? { state: "ready", url } : { state: "error", url: null });
  }

  async function closeIncident(event) {
    event.preventDefault();
    if (!selected || note.trim().length < 6) return;
    setSaving(true);
    try {
      await resolveFlag(profile.id, selected.id, note.trim());
      setMessage({ tone: "clear", text: "Incident closed and the decision was written to the audit log." });
      setSelectedId(null);
      setNote("");
      load();
    } catch (error) {
      setMessage({ tone: "deny", text: error.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell>
      <section className="incident-command-page" aria-labelledby="incident-command-title">
        <header className="incident-command-head">
          <div>
            <div className="eyebrow">Evidence and intervention · suspicious-attempt sheet</div>
            <h1 id="incident-command-title" className="display">Suspicious attendance attempts</h1>
            <p>Every refused or suspicious attendance attempt is held here with its time, device reading, location and captured frame.</p>
          </div>
          <aside className="incident-command-alert">
            <span className="mono">CURRENT THREAT STATE</span>
            <strong>{counts.open ? `${counts.open} open for review` : "All incidents cleared"}</strong>
            <small className="mono">{counts.critical ? `${counts.critical} CRITICAL PRIORITY` : "NO CRITICAL PRIORITY"}</small>
          </aside>
        </header>

        <dl className="incident-command-summary" aria-label="Incident summary">
          <IncidentMeasure index="01" label="All incidents" value={flags.length} />
          <IncidentMeasure index="02" label="Open review" value={counts.open} tone={counts.open ? "deny" : "clear"} />
          <IncidentMeasure index="03" label="Critical" value={counts.critical} tone={counts.critical ? "deny" : "clear"} />
          <IncidentMeasure index="04" label="Frames held" value={counts.withEvidence} />
          <IncidentMeasure index="05" label="Resolved" value={counts.resolved} tone="clear" />
        </dl>

        <div className="incident-command-toolbar">
          <div>
            <span className="label">Review view</span>
            <div className="incident-filter-tabs" role="group" aria-label="Filter incidents">
              {[["open", "Open", counts.open], ["resolved", "Closed", counts.resolved], ["all", "All", flags.length]].map(([key, label, count]) => (
                <button key={key} type="button" className={filter === key ? "is-active" : undefined} aria-pressed={filter === key} onClick={() => { setFilter(key); setSelectedId(null); }}>
                  <span>{label}</span><small className="mono">{count}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="incident-command-sync mono"><i />{loading ? "READING EVIDENCE REGISTER" : `${visibleFlags.length} INCIDENTS IN VIEW`}</div>
        </div>

        {message ? <div className="incident-command-notice"><Notice tone={message.tone}>{message.text}</Notice></div> : null}

        {loading ? <div className="incident-command-loading"><Spinner label="Loading incidents" /></div> : visibleFlags.length === 0 ? (
          <div className="incident-command-empty"><Empty title={filter === "open" ? "No open incidents" : "Nothing in this view"}>Refused attendance attempts appear here with the frame captured at the decision point.</Empty></div>
        ) : (
          <div className="incident-command-register">
            <div className="incident-command-register-head">
              <div><span className="mono">FORENSIC REGISTER</span><strong>Decision queue</strong></div>
              <span className="mono">NEWEST EVIDENCE FIRST</span>
            </div>
            <div className="incident-command-list">
              {visibleFlags.map((flag, index) => (
                <button key={flag.id} type="button" className={`incident-command-row${selectedId === flag.id ? " is-selected" : ""}`} data-severity={flag.severity} onClick={() => selectIncident(flag)} aria-pressed={selectedId === flag.id}>
                  <span className="incident-command-index mono">{String(index + 1).padStart(2, "0")}</span>
                  <span className="incident-command-type"><strong>{formatType(flag.flag_type)}</strong><small>{EXPLAIN[flag.flag_type] || "An attendance attempt was refused by the verification instrument."}</small></span>
                  <span className="incident-command-person"><small className="mono">CLAIMED ACCOUNT</small><strong>{flag.profiles?.full_name || "Unknown person"}</strong><span className="mono">{flag.profiles?.staff_id || "NO STAFF NUMBER"}</span></span>
                  <span className="incident-command-moment"><small className="mono">RECORDED</small><strong className="mono">{formatMoment(flag.created_at)}</strong></span>
                  <span className="incident-command-state"><Pill tone={severityTone(flag.severity)}>{flag.severity}</Pill>{flag.resolved ? <Pill tone="clear">Closed</Pill> : <span className="mono">OPEN</span>}</span>
                  <span className="incident-command-open mono">INSPECT <i aria-hidden="true">→</i></span>
                </button>
              ))}
            </div>
          </div>
        )}

        {selected ? <IncidentDossier flag={selected} evidence={evidence} note={note} saving={saving} onNote={setNote} onClose={() => setSelectedId(null)} onResolve={closeIncident} /> : null}
      </section>
    </Shell>
  );
}

function IncidentMeasure({ index, label, value, tone }) {
  return <div className={tone ? `is-${tone}` : undefined}><span className="mono">NODE {index}</span><dt className="mono">{label}</dt><dd className="mono">{value}</dd></div>;
}

function IncidentDossier({ flag, evidence, note, saving, onNote, onClose, onResolve }) {
  const details = Object.entries(flag.detail || {});
  return (
    <section className="incident-dossier" aria-labelledby="incident-dossier-title">
      <header>
        <div><span className="eyebrow">Selected evidence file</span><h2 id="incident-dossier-title" className="display">{formatType(flag.flag_type)}</h2><small className="mono">{flag.id} · {formatMoment(flag.created_at).toUpperCase()}</small></div>
        <button type="button" onClick={onClose} aria-label="Close incident dossier">×</button>
      </header>
      <div className="incident-dossier-body">
        <div className="incident-evidence-panel">
          <div className="incident-section-head"><span className="mono">01</span><div><strong>Captured evidence</strong><small>Frame held at the moment the attempt was refused</small></div></div>
          <div className="incident-evidence-frame">
            {evidence.state === "ready" ? <img src={evidence.url} alt={`Captured refusal frame for ${flag.profiles?.full_name || "unknown person"}`} />
              : evidence.state === "loading" ? <Spinner label="Loading protected frame" />
              : <div><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 13h32v25H8zM15 13l3-5h12l3 5M14 31l7-7 6 6 4-4 5 5" /></svg><strong>{evidence.state === "error" ? "Protected frame unavailable" : "No frame was captured"}</strong><span>The incident record and instrument readings remain available.</span></div>}
          </div>
          <div className="incident-evidence-status mono">
            <i />
            {flag.evidence_path ? "EVIDENCE OBJECT · SIGNED ACCESS · 10 MINUTES" : "NO STORAGE OBJECT ATTACHED"}
            {evidence.state === "ready" ? <a href={evidence.url} target="_blank" rel="noreferrer">OPEN PROTECTED IMAGE ↗</a> : null}
          </div>
        </div>

        <div className="incident-analysis-panel">
          <div className="incident-section-head"><span className="mono">02</span><div><strong>Instrument finding</strong><small>Plain explanation and machine readings</small></div></div>
          <p className="incident-finding">{EXPLAIN[flag.flag_type] || "The verification instrument refused this attendance attempt."}</p>
          <dl className="incident-facts">
            <Fact label="Claimed staff" value={flag.profiles?.full_name || "Unknown"} />
            <Fact label="Staff number" value={flag.profiles?.staff_id || "Not recorded"} machine />
            <Fact label="Severity" value={flag.severity || "Not recorded"} />
            <Fact label="Device trace" value={flag.device_fingerprint?.slice(0, 20) || "Not recorded"} machine />
            <Fact label="Coordinates" value={flag.lat != null && flag.lng != null ? `${Number(flag.lat).toFixed(5)}, ${Number(flag.lng).toFixed(5)}` : "Not recorded"} machine />
            <Fact label="Evidence state" value={flag.evidence_path ? "Frame attached" : "No frame"} />
          </dl>
          <div className="incident-readings">
            <span className="label">Recorded instrument detail</span>
            {details.length ? <dl>{details.map(([key, value]) => <div key={key}><dt className="mono">{formatType(key)}</dt><dd className="mono">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl> : <p>No additional machine readings were recorded.</p>}
          </div>

          {flag.resolved ? (
            <div className="incident-resolution is-closed"><span className="eyebrow">Resolution decision</span><strong>Incident closed</strong><p>{flag.resolution_note || "Reviewed by an administrator."}</p></div>
          ) : (
            <form className="incident-resolution" onSubmit={onResolve}>
              <span className="eyebrow">Resolution decision</span>
              <label className="label" htmlFor="incident-resolution-note">Why is this incident being closed?</label>
              <textarea id="incident-resolution-note" className="field" rows="4" minLength="6" required value={note} onChange={(event) => onNote(event.target.value)} placeholder="State what was checked and the action taken" />
              <div><button type="submit" className="btn btn-primary" disabled={saving || note.trim().length < 6}>{saving ? "Writing decision…" : "Close incident"}</button><span className="mono">AUDIT LOG REQUIRED</span></div>
            </form>
          )}
        </div>
      </div>
      <footer className="mono"><i />EVIDENCE IS REVIEWED HERE · VERIFICATION THRESHOLDS REMAIN UNCHANGED</footer>
    </section>
  );
}

function Fact({ label, value, machine = false }) {
  return <div><dt>{label}</dt><dd className={machine ? "mono" : undefined}>{value}</dd></div>;
}
