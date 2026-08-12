export type KnowledgeEntry = {
  id: string;
  title: string;
  source: string;
  text: string;
};

export const KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "nbti-mandate",
    title: "NBTI mandate, vision and mission",
    source: "https://nbti.gov.ng/",
    text: "The National Board for Technology Incubation is a Nigerian federal institution that develops and manages technology incubation centres, innovation hubs and technology parks. Its mandate includes technology warehousing, innovation management and the commercialisation of research and development outcomes through the Technology Incubation Programme. Its stated vision connects technology incubation with national technological, industrial, social and economic competitiveness. Its mission includes infrastructure for technology start-ups, support for indigenous potential and links among technology providers, entrepreneurs, capital and know-how.",
  },
  {
    id: "nbti-history",
    title: "NBTI history and national footprint",
    source: "https://nbti.gov.ng/about/history",
    text: "NBTI's official history says the organisation was established in 1992 as a parastatal under the then Federal Ministry of Science and Technology. The Technology Incubation Programme began in the early 1990s and expanded through Technology Incubation Centres across Nigeria. NBTI describes its impact in terms of technology enterprise support, research and development, job creation, economic growth and a culture of innovation.",
  },
  {
    id: "nbti-departments",
    title: "NBTI headquarters departments",
    source: "https://nbti.gov.ng/",
    text: "The official NBTI website lists the Director General and CEO's Office, Human Resource Management, Operations, Planning Research and Policy Analysis, Finance and Accounts, Post Incubation and Extension Services, Procurement, Internal Audit, ICT, Commercial and Legal Services. The live Presence register can contain a different locally administered department list, so attendance questions must use the departments in the register rather than assume that this public list is exhaustive or current.",
  },
  {
    id: "nbti-operations",
    title: "Operations Department",
    source: "https://nbti.gov.ng/about/operations-department",
    text: "NBTI describes the Operations Department as responsible for supervision, monitoring and evaluation of the Technology Incubation Programme. Its published functions include reviewing centre and entrepreneur reports, assessing admissions, documenting entrepreneurs, monitoring indicators, quality and safety work, capacity building, graduation criteria and peer review across incubation centres.",
  },
  {
    id: "nbti-hr",
    title: "Human Resource Management Department",
    source: "https://nbti.gov.ng/about/hr-department",
    text: "NBTI describes Human Resource Management as supporting day-to-day administration and personnel matters, coordinating the application of public service rules and other extant regulations, and covering general administration, appointments, promotion and discipline, training, staff welfare and pensions.",
  },
  {
    id: "presence-purpose",
    title: "What NBTI Presence does",
    source: "platform://about/purpose",
    text: "NBTI Presence is an attendance verification instrument. Staff use their own phones to sign in and sign out. A successful attendance action is written only after four checks clear: location, liveness, surroundings and identity. A refusal stops the run and creates an incident with the captured evidence frame when available. The platform separates staff self-service screens from administrator registers, incident review, reports and settings.",
  },
  {
    id: "presence-gates",
    title: "The four verification gates",
    source: "platform://about/verification-gates",
    text: "Location checks whether the device is inside the configured site perimeter and whether the GPS reading is accurate enough to trust. Liveness asks for a head-turn sequence chosen at that moment, so a pre-recorded video does not know the order. Surroundings looks for phones, laptops, screens, printed material, replay characteristics, flat-photo motion and additional faces. Identity compares the live face descriptor only with the descriptors enrolled on that account. Thresholds are controlled settings and the assistant must never suggest weakening them to improve pass rates.",
  },
  {
    id: "presence-incidents",
    title: "Refusals and incident evidence",
    source: "platform://about/incidents",
    text: "A failed gate is not recorded as attendance. The system writes a security incident describing the refusal and may attach the captured frame in private evidence storage. Administrators can review and resolve incidents with a note. The assistant can explain an incident category but must not identify a person from an image, expose biometric vectors, reveal private coordinates or claim misconduct from a failed automated check alone.",
  },
  {
    id: "presence-reporting",
    title: "Attendance reporting rules",
    source: "platform://about/reporting",
    text: "Reports are calculated from the row-level-security protected attendance report. Attendance rate is attended days divided by expected weekdays for the active people in scope. Punctuality is on-time arrivals divided by attended days. Hours exclude an incomplete day with no sign-out. Public holidays are not yet subtracted from expected weekdays, so rates must be described with that limitation. Manually entered attendance is labelled and remains part of the audit trail.",
  },
  {
    id: "presence-permissions",
    title: "Permissions and privacy",
    source: "platform://about/permissions",
    text: "A staff account can read its own profile, enrolment and attendance. Report generation is visible to every staff member but remains locked until authority exists. A Director or Head of Department can generate reports for the department assigned to their profile. A staff member can request a time-limited reporting appointment; a Director, HOD, Director-General or administrator must approve it before department evidence opens. The Director-General and full administrator can use Board scope. The intelligence service validates the caller's signed session and authority before it builds aggregate evidence. It cannot edit settings, grant a role, expose biometric data or bypass a verification gate.",
  },
  {
    id: "presence-absence",
    title: "Absence permission workflow",
    source: "platform://about/absence-permission",
    text: "A staff member can notify the department by submitting a dated absence request and work reason from the Today dashboard. A Director, Head of Department, Director-General or administrator reviews the request within their authority. Approval writes only the weekdays without an actual sign-in as excused attendance. It never overwrites a completed or active attendance record. The requester receives the decision through Notifications, and the decision is written to the audit log.",
  },
  {
    id: "presence-limitations",
    title: "Known technical limits",
    source: "platform://about/limitations",
    text: "Presence runs in a web browser on consumer cameras and phone GPS. Poor indoor GPS, poor lighting and an unfinished sign-out can affect readings. A browser camera can address realistic attendance threats such as phone screens, photographs and replayed video, but it is not equivalent to dedicated infrared or depth hardware. The correct response to repeated face rejection is better enrolment conditions and investigation, not a looser match threshold.",
  },
];

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "been", "before", "but", "can",
  "could", "does", "for", "from", "have", "how", "into", "its", "more", "not", "our",
  "should", "that", "the", "their", "there", "they", "this", "through", "what", "when",
  "where", "which", "who", "why", "with", "would", "you", "your",
]);

function tokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function retrieveKnowledge(query: string, limit = 5) {
  const queryTokens = new Set(tokens(query));
  return KNOWLEDGE
    .map((entry) => {
      const titleTokens = tokens(entry.title);
      const bodyTokens = tokens(entry.text);
      const score = titleTokens.reduce((sum, token) => sum + (queryTokens.has(token) ? 4 : 0), 0)
        + bodyTokens.reduce((sum, token) => sum + (queryTokens.has(token) ? 1 : 0), 0);
      return { entry, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => entry);
}
