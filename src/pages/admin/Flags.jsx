import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Shell, PageHead, Pill, Spinner, Empty } from "../../components/UI";
import { listFlags, resolveFlag, evidenceUrl } from "../../lib/db";

/**
 * The incident register.
 * Every refused attempt lands here with the frame that was captured at the
 * moment of refusal, so what an administrator sees is the person and whatever
 * they were holding up to the camera.
 */
const EXPLAIN = {
  device_in_frame: "A phone, screen, laptop or printed photo was visible in the frame during the check.",
  screen_replay: "The image had the banding and colour behaviour of a display rather than a live face.",
  flat_surface: "The face turned as one rigid plane, which is how a photograph behaves and a head does not.",
  multiple_faces: "A second face was in the frame while attendance was being recorded.",
  face_mismatch: "The face in front of the camera did not match the one enrolled on this account.",
  liveness_failed: "The head-turn sequence was not completed correctly or the face left the frame.",
  outside_geofence: "The attempt came from outside the site perimeter.",
  low_gps_accuracy: "The location reading was too imprecise to confirm presence on site.",
  mocked_location: "The location reading carried the signature of a spoofed position.",
  location_unavailable: "Location could not be read at all.",
  shared_device: "This handset had already recorded attendance for another member of staff the same day.",
};

export default function Flags() {
  const { profile } = useAuth();
  const [flags, setFlags] = useState([]);
  const [filter, setFilter] = useState("open");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [note, setNote] = useState("");

  const load = () => {
    setLoading(true);
    listFlags({ resolved: filter === "all" ? null : filter === "resolved" })
      .then(setFlags).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  async function expand(f) {
    if (open === f.id) { setOpen(null); setEvidence(null); return; }
    setOpen(f.id);
    setEvidence(null);
    setNote("");
    if (f.evidence_path) setEvidence(await evidenceUrl(f.evidence_path));
  }

  async function close(f) {
    await resolveFlag(profile.id, f.id, note || "Reviewed, no action");
    setOpen(null);
    load();
  }

  return (
    <Shell>
      <PageHead eyebrow="Security" title="Incidents">
        <div className="flex gap-1">
          {[["open", "Open"], ["resolved", "Closed"], ["all", "All"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
                    className={`px-3 py-1.5 rounded-sm mono text-[11px] uppercase tracking-wider ${
                      filter === k ? "bg-raised text-paper" : "text-muted hover:text-paper"}`}>
              {l}
            </button>
          ))}
        </div>
      </PageHead>

      {loading ? <Spinner label="Loading incidents" />
        : flags.length === 0 ? (
        <Empty title="Nothing to review">
          Refused attendance attempts appear here with the frame captured at the moment of refusal.
        </Empty>
      ) : (
        <div className="space-y-2">
          {flags.map((f) => (
            <div key={f.id} className="panel">
              <button onClick={() => expand(f)}
                      className="w-full p-4 flex flex-wrap items-center gap-3 text-left hover:bg-raised transition-colors">
                <Pill tone={f.severity === "critical" ? "deny" : f.severity === "high" ? "hold" : "mute"}>
                  {f.severity}
                </Pill>
                <div className="flex-1 min-w-[180px]">
                  <div className="text-[14px] capitalize">{f.flag_type.replace(/_/g, " ")}</div>
                  <div className="mono text-[11px] text-muted">
                    {f.profiles?.full_name || "Unknown"} · {f.profiles?.staff_id || "no staff no."}
                  </div>
                </div>
                <div className="mono text-[11px] text-muted whitespace-nowrap">
                  {new Date(f.created_at).toLocaleString("en-GB", {
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
                {f.resolved && <Pill tone="clear">Closed</Pill>}
              </button>

              {open === f.id && (
                <div className="border-t border-line p-5 grid md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] gap-5 rise">
                  <div>
                    <div className="eyebrow mb-3">Evidence</div>
                    {evidence ? (
                      <img src={evidence} alt="Frame captured at the moment of refusal"
                           className="w-full rounded-sm border border-line" />
                    ) : f.evidence_path ? (
                      <Spinner label="Loading frame" />
                    ) : (
                      <div className="panel-raised p-6 text-center text-[13px] text-muted">
                        No frame was captured for this incident.
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="eyebrow mb-2">What happened</div>
                      <p className="text-[14px] text-muted leading-relaxed">
                        {EXPLAIN[f.flag_type] || "An attendance attempt was refused."}
                      </p>
                    </div>

                    <div>
                      <div className="eyebrow mb-2">Recorded detail</div>
                      <pre className="mono text-[11px] text-muted bg-ink border border-line rounded-sm p-3 overflow-x-auto">
{JSON.stringify(f.detail, null, 2)}
                      </pre>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Fact k="Device" v={f.device_fingerprint?.slice(0, 16) || "—"} />
                      <Fact k="Coordinates" v={f.lat ? `${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}` : "—"} />
                    </div>

                    {!f.resolved && (
                      <div className="pt-2 border-t border-line">
                        <label className="label">Resolution note</label>
                        <input className="field mb-3" value={note} onChange={(e) => setNote(e.target.value)}
                               placeholder="Spoke with staff member, camera fault confirmed, referred to HR" />
                        <button className="btn btn-primary" onClick={() => close(f)}>Close incident</button>
                      </div>
                    )}

                    {f.resolved && (
                      <div className="pt-2 border-t border-line text-[13px] text-muted">
                        Closed: {f.resolution_note}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

function Fact({ k, v }) {
  return (
    <div>
      <div className="mono text-[10px] text-muted uppercase tracking-wider mb-1">{k}</div>
      <div className="mono text-[12px] break-all">{v}</div>
    </div>
  );
}
