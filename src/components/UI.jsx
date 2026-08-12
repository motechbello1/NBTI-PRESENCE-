import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/* ── SHELL ────────────────────────────────────────────── */

export function Shell({ children }) {
  const { profile, isAdmin, signOutOfApp } = useAuth();
  const nav = useNavigate();

  const links = isAdmin
    ? [
        ["/admin", "Overview"],
        ["/admin/register", "Register"],
        ["/admin/staff", "Staff"],
        ["/admin/flags", "Incidents"],
        ["/admin/reports", "Reports"],
        ["/admin/settings", "Settings"],
      ]
    : [
        ["/", "Today"],
        ["/history", "My record"],
        ["/profile", "Profile"],
      ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/95 backdrop-blur">
        <div className="max-w-[1240px] mx-auto px-4 md:px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => nav(isAdmin ? "/admin" : "/")}
            className="flex items-center gap-2.5 shrink-0"
          >
            <Seal />
            <span className="display text-[15px] tracking-tight hidden sm:block">
              NBTI <span className="text-beam">PRESENCE</span>
            </span>
          </button>

          <nav className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {links.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/" || to === "/admin"}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-sm text-[13px] font-medium whitespace-nowrap transition-colors ${
                    isActive ? "bg-raised text-paper" : "text-muted hover:text-paper"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden md:block leading-tight">
              <div className="text-[13px] font-medium">{profile?.full_name}</div>
              <div className="mono text-[10px] text-muted uppercase tracking-wider">
                {isAdmin ? "Administrator" : profile?.staff_id || "Staff"}
              </div>
            </div>
            <button onClick={signOutOfApp} className="mono text-[11px] text-muted hover:text-deny uppercase tracking-wider">
              Exit
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1240px] w-full mx-auto px-4 md:px-6 py-6 md:py-8">
        {children}
      </main>

      <footer className="border-t border-line py-4">
        <div className="max-w-[1240px] mx-auto px-4 md:px-6 mono text-[10px] text-muted tracking-wider uppercase">
          National Board for Technology Incubation · ICT Department
        </div>
      </footer>
    </div>
  );
}

/* ── SEAL ─────────────────────────────────────────────── */
/* A rotated square with a centre dot. Reads as an official stamp
   without being a literal coat of arms. */
export function Seal({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M1.5 8.5v-7h21.8l7.2 7.2v21.8h-29z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M23.3 1.5v7.2h7.2M7.5 12V7.5H12M20 7.5h4.5V12M24.5 20v4.5H20M12 24.5H7.5V20" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="16" cy="16" r="3" fill="var(--bureau)" />
      <path d="M16 11v10M11 16h10" stroke="var(--ledger)" strokeWidth="1" />
    </svg>
  );
}

export function Wordmark({ compact = false }) {
  return (
    <div className="brand-lockup">
      <Seal />
      <div>
        <div className="brand-name">NBTI <span>Presence</span></div>
        {!compact && <div className="brand-agency">National Board for Technology Incubation</div>}
      </div>
    </div>
  );
}

export function SecurityRail({ className = "" }) {
  return (
    <svg className={`security-rail ${className}`} viewBox="0 0 36 360" preserveAspectRatio="none" aria-hidden="true">
      <path d="M18 0C3 18 33 36 18 54S3 90 18 108s15 36 0 54-15 36 0 54 15 36 0 54-15 36 0 54 15 36 0 54" />
      <path d="M18 0c15 18-15 36 0 54s15 36 0 54-15 36 0 54 15 36 0 54-15 36 0 54 15 36 0 54-15 36 0 54" />
      <path d="M7 0c22 22 22 32 0 54s-22 32 0 54 22 32 0 54-22 32 0 54 22 32 0 54-22 32 0 54 22 32 0 54" />
      <path d="M29 0C7 22 7 32 29 54s22 32 0 54-22 32 0 54 22 32 0 54-22 32 0 54 22 32 0 54-22 32 0 54" />
    </svg>
  );
}

export function SplashScreen() {
  return (
    <div className="splash" role="status" aria-label="Starting NBTI Presence">
      <div className="splash-mark"><Seal size={42} /></div>
      <div className="splash-copy">
        <div className="brand-name">NBTI <span>Presence</span></div>
        <div className="mono splash-status">Preparing verification register</div>
      </div>
      <div className="splash-meter" aria-hidden="true"><span /></div>
    </div>
  );
}

/* ── HEADINGS ─────────────────────────────────────────── */

export function PageHead({ eyebrow, title, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="display text-[30px] md:text-[40px]">{title}</h1>
      </div>
      {children}
    </div>
  );
}

/* ── GATE STRIP — the signature element ───────────────── */

export const GATES = [
  { key: "location", label: "Location" },
  { key: "live", label: "Liveness" },
  { key: "device", label: "Surroundings" },
  { key: "identity", label: "Identity" },
];

export function GateStrip({ states }) {
  const text = { pending: "Waiting", active: "Checking", clear: "Cleared", deny: "Refused" };
  return (
    <div className="gate-strip">
      {GATES.map((g) => (
        <div key={g.key} className="gate" data-state={states[g.key] || "pending"}>
          <span className="gate-label">{g.label}</span>
          <span className="gate-state">{text[states[g.key] || "pending"]}</span>
        </div>
      ))}
    </div>
  );
}

/* ── STATS ────────────────────────────────────────────── */

export function Stat({ label, value, sub, tone = "paper" }) {
  const colour = { paper: "text-paper", clear: "text-beam", hold: "text-hold", deny: "text-deny" }[tone];
  return (
    <div className="panel p-4">
      <div className="eyebrow mb-2">{label}</div>
      <div className={`display text-[30px] ${colour}`}>{value}</div>
      {sub && <div className="mono text-[11px] text-muted mt-1">{sub}</div>}
    </div>
  );
}

/* ── PILLS ────────────────────────────────────────────── */

export function Pill({ tone = "mute", children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function StatusPill({ status }) {
  const map = {
    present: ["clear", "Present"],
    late: ["hold", "Late"],
    absent: ["deny", "Absent"],
    excused: ["mute", "Excused"],
  };
  const [tone, label] = map[status] || ["mute", status || "No record"];
  return <Pill tone={tone}>{label}</Pill>;
}

/* ── FEEDBACK ─────────────────────────────────────────── */

export function Notice({ tone = "mute", title, children }) {
  const border = {
    clear: "border-l-clear", hold: "border-l-hold",
    deny: "border-l-deny", mute: "border-l-line",
  }[tone];
  return (
    <div className={`panel border-l-2 ${border} p-4 rise`}>
      {title && <div className="display text-[15px] mb-1">{title}</div>}
      <div className="text-[14px] text-muted leading-relaxed">{children}</div>
    </div>
  );
}

export function Spinner({ label = "Working" }) {
  return (
    <div className="flex items-center gap-3 text-muted">
      <svg width="16" height="16" viewBox="0 0 24 24" className="animate-spin">
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--line)" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="var(--beam)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="mono text-[12px] uppercase tracking-wider">{label}</span>
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="panel p-10 text-center">
      <div className="display text-[17px] mb-2">{title}</div>
      <div className="text-[14px] text-muted max-w-sm mx-auto leading-relaxed">{children}</div>
    </div>
  );
}
