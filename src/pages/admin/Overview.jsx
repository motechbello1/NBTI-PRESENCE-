import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Shell, Spinner, Pill, AuthorityBadge, SecurityRail } from "../../components/UI";
import { isSuperAdmin } from "../../lib/authority";
import { listStaff, reportRows, listFlags } from "../../lib/db";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

const iso = (date) => date.toISOString().slice(0, 10);

function CountedValue({ value, suffix = "" }) {
  const finalValue = Number(value) || 0;
  const decimals = String(value).includes(".") ? 1 : 0;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(finalValue);
      return undefined;
    }
    let frame;
    const started = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / 420);
      const eased = 1 - ((1 - progress) ** 3);
      setShown(progress === 1 ? finalValue : finalValue * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [finalValue]);

  return <>{shown.toFixed(decimals)}{suffix}</>;
}

function BoardTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="admin-chart-tooltip">
      <span className="mono">{label}</span>
      {payload.map((item) => <strong key={item.dataKey} style={{ color: item.stroke }}>{item.name}: {item.value}</strong>)}
    </div>
  );
}

function SuperAdminEntrance({ name, onFinished }) {
  useEffect(() => {
    const timer = setTimeout(onFinished, 580);
    return () => clearTimeout(timer);
  }, [onFinished]);

  return (
    <div className="super-entrance" role="status" aria-live="polite">
      <SecurityRail className="super-entrance-rail" />
      <div className="super-entrance-mark"><AuthorityBadge badge={{ kind: "super", label: "Developer super admin" }} /></div>
      <div className="mono super-entrance-code">MASTER AUTHORITY CONFIRMED</div>
      <div className="display super-entrance-title">Welcome, Super Admin.</div>
      <div className="super-entrance-name">{name}</div>
    </div>
  );
}

export default function Overview() {
  const { profile } = useAuth();
  const superAdmin = isSuperAdmin(profile);
  const [staff, setStaff] = useState([]);
  const [rows, setRows] = useState([]);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEntrance, setShowEntrance] = useState(() => superAdmin && sessionStorage.getItem("nbti-super-admin-welcomed") !== "yes");

  useEffect(() => {
    const to = iso(new Date());
    const from = iso(new Date(Date.now() - 29 * 86400000));
    Promise.all([listStaff(), reportRows({ from, to }), listFlags({ resolved: false, limit: 50 })])
      .then(([staffRows, attendanceRows, flagRows]) => { setStaff(staffRows); setRows(attendanceRows); setFlags(flagRows); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const finishEntrance = () => {
    sessionStorage.setItem("nbti-super-admin-welcomed", "yes");
    setShowEntrance(false);
  };

  const today = iso(new Date());
  const todayRows = useMemo(() => rows.filter((row) => row.work_date === today), [rows, today]);
  const activeStaff = useMemo(() => staff.filter((person) => person.is_active), [staff]);
  const inToday = todayRows.filter((row) => row.sign_in_at).length;
  const lateToday = todayRows.filter((row) => row.status === "late").length;
  const approvedAway = todayRows.filter((row) => row.status === "excused").length;
  const stillIn = todayRows.filter((row) => row.sign_in_at && !row.sign_out_at).length;
  const notEnrolled = activeStaff.filter((person) => !person.face_enrolled).length;
  const notRecorded = Math.max(0, activeStaff.length - inToday - approvedAway);
  const rate = activeStaff.length ? Math.round((inToday / activeStaff.length) * 100) : 0;

  const trend = useMemo(() => {
    const byDay = {};
    rows.forEach((row) => {
      byDay[row.work_date] ||= { day: row.work_date, present: 0, late: 0 };
      if (row.status === "late") byDay[row.work_date].late += 1;
      else if (row.sign_in_at) byDay[row.work_date].present += 1;
    });
    return Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day)).map((day) => ({
      ...day,
      label: new Date(day.day).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    }));
  }, [rows]);

  const departments = useMemo(() => {
    const map = {};
    activeStaff.forEach((person) => {
      const key = person.departments?.code || "—";
      map[key] ||= { code: key, name: person.departments?.name || "Unassigned", staff: 0, in: 0 };
      map[key].staff += 1;
    });
    todayRows.forEach((row) => {
      const key = row.department_code || "—";
      if (map[key] && row.sign_in_at) map[key].in += 1;
    });
    return Object.values(map).sort((a, b) => b.staff - a.staff).slice(0, 6);
  }, [activeStaff, todayRows]);

  if (loading) return <Shell><Spinner label="Reading the Board register" /></Shell>;

  return (
    <Shell>
      {showEntrance ? <SuperAdminEntrance name={profile?.full_name} onFinished={finishEntrance} /> : null}
      <section className={`admin-overview${superAdmin ? " is-super" : ""}`} aria-labelledby="admin-overview-title">
        <header className="admin-overview-head">
          <div className="admin-overview-title">
            <div className="mono">BOARD CONTROL · {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase()}</div>
            <h1 id="admin-overview-title" className="display">The Board, at a glance.</h1>
            <p>Attendance, unresolved incidents and staff readiness in one place.</p>
          </div>
          <div className="admin-authority-card">
            <AuthorityBadge badge={{ kind: "super", label: "Developer super admin" }} />
            <span className="mono">FULL BOARD AUTHORITY</span>
            <strong>{profile?.full_name}</strong>
          </div>
        </header>

        <dl className="admin-measures" aria-label="Today’s Board attendance measurements">
          <Measure label="On site" value={<CountedValue value={inToday} />} note={`of ${activeStaff.length} active staff`} tone="clear" />
          <Measure label="Turnout" value={<CountedValue value={rate} suffix="%" />} note="recorded today" tone={rate >= 85 ? "clear" : rate >= 60 ? "hold" : "deny"} />
          <Measure label="Late" value={<CountedValue value={lateToday} />} note="arrivals" tone={lateToday ? "hold" : undefined} />
          <Measure label="Still inside" value={<CountedValue value={stillIn} />} note="no sign-out yet" />
          <Measure label="Open incidents" value={<CountedValue value={flags.length} />} note="need review" tone={flags.length ? "deny" : "clear"} />
        </dl>

        <div className="admin-priority-grid">
          <section className="admin-trend" aria-labelledby="attendance-trend-title">
            <div className="admin-section-head">
              <div><div className="eyebrow">Thirty-day register</div><h2 id="attendance-trend-title" className="display">Daily arrivals</h2></div>
              <span className="mono">ON TIME / LATE</span>
            </div>
            <div className="admin-chart" role="img" aria-label="Line chart showing on-time and late arrivals during the last 30 days">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 12, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="color-mix(in srgb, var(--rule) 28%, transparent)" strokeDasharray="1 6" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--rule)" fontFamily="IBM Plex Mono" fontSize={8} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis stroke="var(--rule)" fontFamily="IBM Plex Mono" fontSize={8} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<BoardTooltip />} cursor={{ stroke: "var(--rule)", strokeWidth: 1 }} />
                  <Line type="monotone" dataKey="present" stroke="var(--bureau)" strokeWidth={2} dot={false} name="On time" isAnimationActive />
                  <Line type="monotone" dataKey="late" stroke="var(--review)" strokeWidth={2} dot={false} name="Late" isAnimationActive />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <aside className="admin-today" aria-labelledby="today-register-title">
            <div className="eyebrow">Today’s register</div>
            <h2 id="today-register-title" className="display">Where staff stand</h2>
            <div className="admin-register-total mono"><CountedValue value={activeStaff.length} /><span>ACTIVE STAFF</span></div>
            <dl>
              <StatusLine label="On site" value={inToday} total={activeStaff.length} tone="clear" />
              <StatusLine label="Approved away" value={approvedAway} total={activeStaff.length} tone="mute" />
              <StatusLine label="Not recorded" value={notRecorded} total={activeStaff.length} tone="deny" />
            </dl>
            <Link to="/admin/register" className="btn btn-primary">Open today’s register</Link>
          </aside>
        </div>

        <section className="admin-attention" aria-labelledby="attention-title">
          <div className="admin-section-head">
            <div><div className="eyebrow">Requires action</div><h2 id="attention-title" className="display">Attention queue</h2></div>
            <span className="mono">LIVE COUNTS</span>
          </div>
          <div className="admin-attention-list">
            <AttentionRow number={flags.length} title="Unresolved incidents" detail="Review refused or suspicious attendance attempts." to="/admin/flags" tone="deny" />
            <AttentionRow number={notEnrolled} title="Face enrolment incomplete" detail="These staff cannot record attendance yet." to="/admin/staff" tone="hold" />
            <AttentionRow number={notRecorded} title="No attendance today" detail="Active staff without an arrival or approved absence." to="/admin/register" />
          </div>
        </section>

        <div className="admin-lower-grid">
          <section className="admin-departments" aria-labelledby="department-readiness-title">
            <div className="admin-section-head">
              <div><div className="eyebrow">Department register</div><h2 id="department-readiness-title" className="display">Staff on site</h2></div>
              <Link to="/admin/staff" className="mono">MANAGE STAFF</Link>
            </div>
            <div className="admin-department-list">
              {departments.map((department) => (
                <div key={department.code}>
                  <span className="mono">{department.code}</span>
                  <strong>{department.name}</strong>
                  <span className="mono">{department.in} / {department.staff}</span>
                </div>
              ))}
            </div>
          </section>

          <aside className="admin-master-actions" aria-labelledby="master-actions-title">
            <div className="eyebrow">Master controls</div>
            <h2 id="master-actions-title" className="display">Board administration</h2>
            <nav aria-label="Super administrator shortcuts">
              <Link to="/admin/staff"><span>People and authority</span><small>Staff, access and face records</small></Link>
              <Link to="/admin/reports"><span>Board reports</span><small>Attendance evidence and exports</small></Link>
              <Link to="/admin/settings"><span>System rules</span><small>Hours, location and thresholds</small></Link>
            </nav>
          </aside>
        </div>

        {flags.length ? (
          <section className="admin-incidents" aria-labelledby="latest-incidents-title">
            <div className="admin-section-head">
              <div><div className="eyebrow">Evidence register</div><h2 id="latest-incidents-title" className="display">Latest incidents</h2></div>
              <Link to="/admin/flags" className="mono">VIEW ALL</Link>
            </div>
            <div className="admin-incident-list">
              {flags.slice(0, 5).map((flag) => (
                <div key={flag.id}>
                  <time className="mono">{new Date(flag.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                  <strong>{flag.profiles?.full_name || "Unknown staff"}</strong>
                  <span>{flag.flag_type.replace(/_/g, " ")}</span>
                  <Pill tone={flag.severity === "critical" ? "deny" : flag.severity === "high" ? "hold" : "mute"}>{flag.severity}</Pill>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </Shell>
  );
}

function Measure({ label, value, note, tone }) {
  return <div className={tone ? `is-${tone}` : undefined}><dt className="mono">{label}</dt><dd className="mono">{value}</dd><small>{note}</small></div>;
}

function StatusLine({ label, value, total, tone }) {
  const width = total ? `${Math.min(100, (value / total) * 100)}%` : "0%";
  return <div className={`is-${tone}`}><dt>{label}</dt><dd className="mono">{value}</dd><span aria-hidden="true"><i style={{ width }} /></span></div>;
}

function AttentionRow({ number, title, detail, to, tone }) {
  return (
    <Link to={to} className={tone ? `is-${tone}` : undefined}>
      <span className="mono"><CountedValue value={number} /></span>
      <div><strong>{title}</strong><small>{detail}</small></div>
      <span aria-hidden="true">→</span>
    </Link>
  );
}
