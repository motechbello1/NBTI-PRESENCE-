import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Shell, PageHead, Notice } from "../../components/UI";
import { saveSettings, writeAudit } from "../../lib/db";
import { readPosition, formatDistance, metresBetween } from "../../lib/geo";

/**
 * System settings.
 * The two that matter most are the site coordinates and the perimeter radius,
 * because together they decide who is treated as being on the premises.
 */
export default function Settings() {
  const { profile, settings, setSettings } = useAuth();
  const [form, setForm] = useState(settings);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);

  const set = (k) => (e) => {
    const v = e.target.type === "number" ? Number(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function useMyPosition() {
    setReading(true);
    setMessage(null);
    try {
      const p = await readPosition();
      const moved = metresBetween(p.lat, p.lng, form.site_lat, form.site_lng);
      setForm((f) => ({ ...f, site_lat: p.lat, site_lng: p.lng }));
      setMessage({
        tone: "clear",
        text: `Centre point set to where you are standing, accurate to ${Math.round(p.accuracy)}m. That is ${formatDistance(moved)} from the previous point. Save to apply it.`,
      });
    } catch (e) {
      setMessage({ tone: "deny", text: e.message });
    } finally {
      setReading(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await saveSettings({
        site_lat: form.site_lat, site_lng: form.site_lng,
        geofence_radius_m: form.geofence_radius_m,
        max_gps_accuracy_m: form.max_gps_accuracy_m,
        work_start: form.work_start, work_end: form.work_end,
        grace_minutes: form.grace_minutes, min_hours: form.min_hours,
        face_match_threshold: form.face_match_threshold,
        liveness_threshold: form.liveness_threshold,
      });
      setSettings(saved);
      await writeAudit(profile.id, "settings.update", "settings", form);
      setMessage({ tone: "clear", text: "Settings saved and applied to the next check." });
    } catch (err) {
      setMessage({ tone: "deny", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageHead eyebrow="Configuration" title="Settings" />

      {message && <div className="mb-5"><Notice tone={message.tone}>{message.text}</Notice></div>}

      <form onSubmit={save} className="grid lg:grid-cols-2 gap-6">
        {/* ── PERIMETER ─────────────────────────────── */}
        <div className="panel p-5">
          <div className="eyebrow mb-1">Site perimeter</div>
          <p className="text-[13px] text-muted mb-5 leading-relaxed">
            Attendance is accepted only inside this circle. Stand at the centre of
            the premises and use the button below rather than typing coordinates.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Latitude</label>
              <input type="number" step="0.000001" className="field mono" value={form.site_lat} onChange={set("site_lat")} />
            </div>
            <div>
              <label className="label">Longitude</label>
              <input type="number" step="0.000001" className="field mono" value={form.site_lng} onChange={set("site_lng")} />
            </div>
          </div>

          <button type="button" className="btn btn-ghost w-full mb-5" onClick={useMyPosition} disabled={reading}>
            {reading ? "Reading your position" : "Use where I am standing now"}
          </button>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Radius, metres</label>
              <input type="number" className="field" value={form.geofence_radius_m} onChange={set("geofence_radius_m")} />
              <p className="text-[12px] text-muted mt-1.5">150m covers a typical compound.</p>
            </div>
            <div>
              <label className="label">Worst accepted GPS error</label>
              <input type="number" className="field" value={form.max_gps_accuracy_m} onChange={set("max_gps_accuracy_m")} />
              <p className="text-[12px] text-muted mt-1.5">Readings vaguer than this are refused, not trusted.</p>
            </div>
          </div>
        </div>

        {/* ── HOURS ─────────────────────────────────── */}
        <div className="panel p-5">
          <div className="eyebrow mb-1">Working hours</div>
          <p className="text-[13px] text-muted mb-5 leading-relaxed">
            These decide who is marked late and who is asked for a reason when
            signing out early.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Day starts</label>
              <input type="time" className="field" value={form.work_start} onChange={set("work_start")} />
            </div>
            <div>
              <label className="label">Grace period, minutes</label>
              <input type="number" className="field" value={form.grace_minutes} onChange={set("grace_minutes")} />
            </div>
            <div>
              <label className="label">Day ends</label>
              <input type="time" className="field" value={form.work_end} onChange={set("work_end")} />
            </div>
            <div>
              <label className="label">Minimum hours</label>
              <input type="number" step="0.5" className="field" value={form.min_hours} onChange={set("min_hours")} />
            </div>
          </div>
        </div>

        {/* ── THRESHOLDS ────────────────────────────── */}
        <div className="panel p-5 lg:col-span-2">
          <div className="eyebrow mb-1">Verification thresholds</div>
          <p className="text-[13px] text-muted mb-5 leading-relaxed">
            Change these only with a reason. Loosening the face threshold makes it
            easier for the wrong person to pass; tightening it locks out legitimate
            staff on bad-light days.
          </p>

          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <label className="label">Face match threshold ({form.face_match_threshold})</label>
              <input type="range" min="0.35" max="0.62" step="0.01" className="w-full accent-clear"
                     value={form.face_match_threshold} onChange={set("face_match_threshold")} />
              <div className="flex justify-between mono text-[10px] text-muted mt-1.5 uppercase tracking-wider">
                <span>Strict</span><span>Lenient</span>
              </div>
              <p className="text-[12px] text-muted mt-2">0.48 is the working default. Below 0.40 expect frequent false rejections.</p>
            </div>

            <div>
              <label className="label">Liveness threshold ({form.liveness_threshold})</label>
              <input type="range" min="0.5" max="0.95" step="0.05" className="w-full accent-clear"
                     value={form.liveness_threshold} onChange={set("liveness_threshold")} />
              <div className="flex justify-between mono text-[10px] text-muted mt-1.5 uppercase tracking-wider">
                <span>Lenient</span><span>Strict</span>
              </div>
              <p className="text-[12px] text-muted mt-2">How completely the head-turn sequence must be performed. 0.75 is the default.</p>
            </div>
          </div>

          <button className="btn btn-primary mt-6" disabled={busy}>
            {busy ? "Saving" : "Save settings"}
          </button>
        </div>
      </form>
    </Shell>
  );
}
