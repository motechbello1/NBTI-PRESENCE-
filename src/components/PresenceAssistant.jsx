import { useEffect, useRef, useState } from "react";
import { askPresenceIntelligence } from "../lib/intelligence";

const STARTERS = [
  "How do the four verification checks work?",
  "Explain my attendance record in simple English.",
  "What does NBTI do?",
  "Why can an attendance attempt be refused?",
];

export default function PresenceAssistant({ open, onClose }) {
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [sources, setSources] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const conversationRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight });
  }, [messages, busy]);

  async function ask(value) {
    const content = String(value || question).trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setQuestion("");
    setError("");
    setBusy(true);
    try {
      const result = await askPresenceIntelligence({ messages: next });
      setMessages((current) => [...current, { role: "assistant", content: result.answer }]);
      setSources(result.sources || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    ask(question);
  }

  if (!open) return null;
  return (
    <div className="assistant-layer" role="dialog" aria-modal="true" aria-labelledby="assistant-title">
      <button type="button" className="assistant-scrim" onClick={onClose} aria-label="Close Presence Intelligence" />
      <section className="assistant-panel">
        <header className="assistant-head">
          <div className="assistant-insignia" aria-hidden="true"><i /><i /><i /></div>
          <div>
            <span className="mono">INSTITUTIONAL ASSISTANT · PI-01</span>
            <h2 id="assistant-title" className="display">Presence Intelligence</h2>
            <p>Ask about NBTI, attendance, verification or the record you are permitted to see.</p>
          </div>
          <button type="button" className="assistant-close" onClick={onClose} aria-label="Close assistant">×</button>
        </header>

        <div className="assistant-scope mono"><i />SIGNED-IN SCOPE APPLIES · PRIVATE BIOMETRIC DATA IS NEVER SHARED</div>

        <div className="assistant-conversation" ref={conversationRef} aria-live="polite">
          {!messages.length ? (
            <div className="assistant-opening">
              <span className="eyebrow">A useful place to begin</span>
              <h3 className="display">What would you like the system to explain?</h3>
              <p>I can explain the four checks, NBTI’s mandate, your permitted attendance evidence, and how to use the platform. I will refuse requests that expose another person or weaken verification.</p>
              <div className="assistant-starters">
                {STARTERS.map((starter, index) => (
                  <button type="button" key={starter} onClick={() => ask(starter)}>
                    <span className="mono">{String(index + 1).padStart(2, "0")}</span>{starter}
                  </button>
                ))}
              </div>
            </div>
          ) : messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`assistant-message is-${message.role}`}>
              <span className="mono">{message.role === "user" ? "YOU" : "PRESENCE INTELLIGENCE"}</span>
              <div>{message.content.split(/\n{2,}/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
            </article>
          ))}
          {busy ? <div className="assistant-reading"><i /><span className="mono">READING PERMITTED EVIDENCE</span></div> : null}
          {error ? <div className="assistant-error" role="alert"><strong>Assistant unavailable</strong><p>{error}</p><small>ICT must deploy the intelligence function and configure its model key before live answers can be generated.</small></div> : null}
          {sources.length && !busy ? (
            <div className="assistant-sources">
              <span className="mono">SOURCES USED IN THE LATEST ANSWER</span>
              <div>{sources.map((source) => source.source.startsWith("http")
                ? <a key={source.source} href={source.source} target="_blank" rel="noreferrer">{source.title}</a>
                : <span key={source.source}>{source.title}</span>)}</div>
            </div>
          ) : null}
        </div>

        <form className="assistant-composer" onSubmit={submit}>
          <label htmlFor="presence-question">Ask Presence Intelligence</label>
          <div>
            <textarea id="presence-question" ref={inputRef} rows="2" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a clear question" onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(event); }
            }} />
            <button type="submit" disabled={busy || !question.trim()}>Ask</button>
          </div>
          <small>Generated answers can be wrong. Check personnel decisions against the official register.</small>
        </form>
      </section>
    </div>
  );
}
