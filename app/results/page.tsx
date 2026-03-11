'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { marked } from 'marked';

// ── Types ─────────────────────────────────────────────────────────
// ✅ FIX: advancedDiagram and readme are now nullable to match what the route
//   actually returns. The old type said 'string' but runtime could be null
//   → cleanMermaid(null) → TypeError → blank page.
interface AnalysisResult {
  metadata: {
    name: string;
    description: string | null;
    stars: number;
    forks: number;
    openIssues: number;
    defaultBranch: string;
    topics: string[];
    htmlUrl: string;
  };
  languages: Record<string, number>;
  existingContributors: {
    username: string; profileUrl: string;
    avatarUrl: string; contributions: number;
  }[];
  potentialContributors: {
    username: string; profileUrl: string; avatarUrl: string;
    bio: string | null; publicRepos: number;
    followers: number; location: string | null; topLanguages: string[];
  }[];
  contributorEmails: {
    username: string; subject: string; body: string;
  }[];
  architecture: {
    frontend: string | null; backend: string | null;
    database: string | null; caching: string | null; devops: string | null;
    auth: string | null; messaging: string | null; storage: string | null;
    testing: string | null; monitoring: string | null;
  };
  simpleDiagram: string;
  advancedDiagram: string | null;  // ✅ nullable
  readme: string | null;           // ✅ nullable
  repoFullName: string;
  repoOwner: string;
  repoName: string;
}

// ── Logo ──────────────────────────────────────────────────────────
function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="7"  r="3.5" fill="#ff2d78" />
      <circle cx="5"  cy="25" r="3"   fill="white" fillOpacity="0.75" />
      <circle cx="27" cy="25" r="3"   fill="white" fillOpacity="0.75" />
      <circle cx="16" cy="19" r="2.5" fill="#ff2d78" fillOpacity="0.55" />
      <line x1="16" y1="7"  x2="5"  y2="25" stroke="#ff2d78" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="16" y1="7"  x2="27" y2="25" stroke="#ff2d78" strokeWidth="1.2" strokeOpacity="0.6" />
      <line x1="5"  y1="25" x2="27" y2="25" stroke="white"   strokeWidth="1"   strokeOpacity="0.2" />
      <line x1="16" y1="7"  x2="16" y2="19" stroke="#ff2d78" strokeWidth="1"   strokeOpacity="0.4" />
      <line x1="5"  y1="25" x2="16" y2="19" stroke="white"   strokeWidth="1"   strokeOpacity="0.2" />
      <line x1="27" y1="25" x2="16" y2="19" stroke="white"   strokeWidth="1"   strokeOpacity="0.2" />
    </svg>
  );
}

type Tab = 'architecture' | 'readme' | 'contributors' | 'email';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'architecture', label: 'Architecture',     icon: '❋' },
  { id: 'readme',       label: 'README',            icon: '◎' },
  { id: 'contributors', label: 'Find Contributors', icon: '◉' },
  { id: 'email',        label: 'Email Drafts',      icon: '⊕' },
];

// ── Clean Mermaid ─────────────────────────────────────────────────
function cleanMermaid(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') {
    return 'flowchart TD\n  APP["Application"]\n  DB["Database"]\n  APP -->|"Query"| DB';
  }

  let s = raw
    // strip markdown fences
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/```$/gm, '')
    .trim();

  // Fix broken arrow syntax: |text|> → |"text"|
  s = s.replace(/\|([^|"]+)\|>/g, '|"$1"|');
  // Fix unquoted arrow labels: -->|word| → -->|"word"|
  s = s.replace(/-->\|([^"|][^|]*)\|/g, '-->|"$1"|');
  // Fix class lines with spaces after commas (mermaid is picky)
  s = s.replace(/^(\s*class\s+)([^\n]+)$/gm,
    (_, prefix, names) => prefix + names.split(',').map((n: string) => n.trim()).join(','));

  return s;
}

// ── Copy button ───────────────────────────────────────────────────
function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="copy-btn" onClick={() => {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }}>
      {copied ? '✓ Copied' : label}
    </button>
  );
}

// ── README with copy buttons on code blocks ───────────────────────
function ReadmeContent({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.querySelectorAll('pre').forEach(pre => {
      if (pre.querySelector('.pre-copy')) return;
      const code = pre.querySelector('code');
      const btn = document.createElement('button');
      btn.className = 'pre-copy';
      btn.textContent = 'Copy';
      btn.onclick = () => {
        navigator.clipboard.writeText(code?.textContent ?? '');
        btn.textContent = '✓ Copied';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      };
      pre.style.position = 'relative';
      pre.appendChild(btn);
    });
  }, [html]);
  return <div ref={ref} className="readme-content" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ─────────────────────────────────────────────────────────────────
export default function ResultsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('architecture');
  const [showPushModal, setShowPushModal] = useState(false);
  const [pushChoice, setPushChoice] = useState<'replace' | 'new' | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);
  const [pushError, setPushError] = useState('');
  const [readmeHtml, setReadmeHtml] = useState('');
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [diagramError, setDiagramError] = useState(false);
  const [diagramRendered, setDiagramRendered] = useState(false);
  const diagramRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<AnalysisResult | null>(null);

  // ── Load result from sessionStorage ──────────────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem('intentmesh_result');
    if (!raw) { router.push('/analyze'); return; }
    try {
      setResult(JSON.parse(raw));
    } catch {
      router.push('/analyze');
    }
  }, [router]);

  // ── Render README markdown ────────────────────────────────────────
  useEffect(() => {
    // ✅ FIX: Guard against null readme — previously marked(null) threw TypeError
    if (!result?.readme) {
      setReadmeHtml('');
      return;
    }
    try {
      marked.setOptions({ gfm: true, breaks: true });
      setReadmeHtml(marked(result.readme) as string);
    } catch (err) {
      console.error('[ResultsPage] marked() failed:', err);
      // Fallback: show raw markdown in a pre block
      setReadmeHtml(`<pre style="white-space:pre-wrap">${result.readme}</pre>`);
    }
  }, [result?.readme]);

  // ── Render Mermaid diagram ────────────────────────────────────────
  // Keep resultRef in sync so the callback ref can always see current result
  useEffect(() => { resultRef.current = result; }, [result]);

  // renderDiagram: called both when result loads AND when the DOM node mounts.
  // Using a stable function reference avoids double-render races.
  const renderDiagram = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const res = resultRef.current;
    if (!res) return;

    setDiagramError(false);
    setDiagramRendered(false);
    node.innerHTML = '<p style="color:#666;font-size:13px">Rendering diagram…</p>';

    const raw     = cleanMermaid(res.advancedDiagram ?? res.simpleDiagram);
    const simple  = cleanMermaid(res.simpleDiagram);

    // Strip classDef/class lines — safest fallback
    const stripStyle = (d: string) => d
      .replace(/^\s*classDef\s+.*$/gm, '')
      .replace(/^\s*class\s+.*$/gm, '')
      .trim();

    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          background: 'transparent',
          primaryColor: '#ff2d78',
          primaryTextColor: '#fff',
          lineColor: 'rgba(255,255,255,0.3)',
          fontSize: '14px',
        },
      });

      const tryRender = (diagram: string, id: string): Promise<string> =>
        mermaid.render(id, diagram).then(({ svg }) => svg);

      // Attempt 1: full diagram as-is
      tryRender(raw, `mermaid-${Date.now()}`)
        .then(svg => { node.innerHTML = svg; setDiagramRendered(true); })
        .catch(() =>
          // Attempt 2: strip classDef/class lines (most common cause of syntax errors)
          tryRender(stripStyle(raw), `mermaid-ns-${Date.now()}`)
            .then(svg => { node.innerHTML = svg; setDiagramRendered(true); })
            .catch(() =>
              // Attempt 3: rule-based simple diagram without styles
              tryRender(stripStyle(simple), `mermaid-fb-${Date.now()}`)
                .then(svg => { node.innerHTML = svg; setDiagramRendered(true); })
                .catch(() => { setDiagramError(true); setDiagramRendered(true); })
            )
        );
    }).catch(() => { setDiagramError(true); setDiagramRendered(true); });
  }, []);

  // Callback ref: fires every time the architecture tab div mounts in the DOM
  // This bypasses AnimatePresence timing — no more null ref on first render
  const diagramCallbackRef = useCallback((node: HTMLDivElement | null) => {
    (diagramRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    if (node && resultRef.current) renderDiagram(node);
  }, [renderDiagram]);

  // Also re-render when result first loads while the tab is already visible
  useEffect(() => {
    if (result && activeTab === 'architecture' && diagramRef.current && !diagramRendered) {
      renderDiagram(diagramRef.current);
    }
  }, [result, activeTab, diagramRendered, renderDiagram]);

  // Reset rendered flag when switching away and back to the architecture tab
  useEffect(() => {
    if (activeTab !== 'architecture') setDiagramRendered(false);
  }, [activeTab]);

  // ── Push to GitHub ────────────────────────────────────────────────
  const handlePush = async () => {
    if (!pushChoice || !result || !session?.accessToken) return;
    setPushing(true); setPushError('');
    try {
      const res = await fetch('/api/push-to-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: session.accessToken,
          owner: result.repoOwner,
          repo: result.repoName,
          readme: result.readme ?? '',
          diagram: cleanMermaid(result.advancedDiagram ?? result.simpleDiagram),
          replaceReadme: pushChoice === 'replace',
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setPushError(json.error || 'Push failed.'); setPushing(false); return; }
      setPushSuccess(true); setPushing(false);
    } catch { setPushError('Network error.'); setPushing(false); }
  };

  const totalBytes = result
    ? Object.values(result.languages).reduce((a, b) => a + b, 0)
    : 0;

  const LANG_COLORS: Record<string, string> = {
    TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
    Rust: '#dea584', Go: '#00ADD8', Java: '#b07219', CSS: '#563d7c',
    HTML: '#e34c26', Ruby: '#701516', 'C++': '#f34b7d', C: '#555', Shell: '#89e051',
  };

  if (!result) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff', fontFamily: 'Nunito, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#ff2d78', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: '#888' }}>Loading results…</p>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { font-family: 'Nunito', sans-serif; background: #000; color: #fff; min-height: 100vh; overflow-x: hidden; cursor: none; }
        body::before { content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none; background: radial-gradient(ellipse 60% 50% at 20% 10%, rgba(255,45,120,0.07) 0%, transparent 60%), radial-gradient(ellipse 50% 50% at 80% 90%, rgba(255,45,120,0.05) 0%, transparent 60%); }
        @keyframes spin { to { transform: rotate(360deg); } }
        a, button { cursor: none; }

        .tab-btn { display: flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 12px; font-family: 'Nunito', sans-serif; font-size: 13px; font-weight: 700; border: 1px solid transparent; transition: all .2s; color: #888; background: transparent; }
        .tab-btn:hover { color: #fff; background: rgba(255,255,255,0.05); }
        .tab-btn.active { color: #fff; background: rgba(255,45,120,0.12); border-color: rgba(255,45,120,0.3); }

        .readme-content { color: #ccc; line-height: 1.8; font-size: 14px; font-weight: 500; }
        .readme-content h1 { font-size: 26px; font-weight: 900; color: #fff; margin: 0 0 20px; letter-spacing: -0.8px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .readme-content h2 { font-size: 20px; font-weight: 800; color: #fff; margin: 36px 0 14px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .readme-content h3 { font-size: 16px; font-weight: 700; color: #eee; margin: 24px 0 10px; }
        .readme-content h4 { font-size: 14px; font-weight: 700; color: #ddd; margin: 16px 0 8px; }
        .readme-content p { margin: 0 0 14px; color: #bbb; }
        .readme-content a { color: #ff2d78; text-decoration: none; }
        .readme-content a:hover { text-decoration: underline; }
        .readme-content strong { color: #fff; font-weight: 800; }
        .readme-content :not(pre) > code { background: rgba(255,45,120,0.12); border: 1px solid rgba(255,45,120,0.2); padding: 2px 7px; border-radius: 5px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #ff6b9d; }
        .readme-content pre { position: relative; background: #0d0d0d; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin: 16px 0; overflow-x: auto; }
        .readme-content pre code { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #e2e8f0; background: none; border: none; padding: 0; line-height: 1.7; }
        .pre-copy { position: absolute; top: 10px; right: 12px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #888; border-radius: 7px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: none; transition: all .2s; font-family: 'Nunito', sans-serif; }
        .pre-copy:hover { background: rgba(255,255,255,0.14); color: #fff; }
        .readme-content table { width: 100%; border-collapse: collapse; margin: 16px 0; border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
        .readme-content th { background: rgba(255,45,120,0.1); padding: 12px 16px; text-align: left; font-weight: 800; font-size: 12px; color: #ff6b9d; letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .readme-content td { padding: 11px 16px; font-size: 13px; color: #bbb; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .readme-content tr:last-child td { border-bottom: none; }
        .readme-content tr:hover td { background: rgba(255,255,255,0.03); }
        .readme-content ul, .readme-content ol { padding-left: 20px; margin: 0 0 14px; }
        .readme-content li { margin-bottom: 6px; color: #bbb; line-height: 1.7; }
        .readme-content li::marker { color: #ff2d78; }
        .readme-content blockquote { border-left: 3px solid #ff2d78; padding: 12px 20px; background: rgba(255,45,120,0.05); border-radius: 0 8px 8px 0; margin: 16px 0; color: #aaa; }
        .readme-content img { max-width: 100%; height: auto; border-radius: 10px; margin: 8px 0; }
        .readme-content hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 28px 0; }

        .copy-btn { padding: 7px 14px; border-radius: 8px; font-family: 'Nunito', sans-serif; font-size: 12px; font-weight: 700; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: #aaa; transition: all .2s; }
        .copy-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .choice-card { padding: 20px; border-radius: 14px; border: 2px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); cursor: none; transition: all .2s; text-align: left; }
        .choice-card:hover { border-color: rgba(255,45,120,0.3); background: rgba(255,255,255,0.07); }
        .choice-card.selected { border-color: #ff2d78; background: rgba(255,45,120,0.1); }
        .diagram-wrap svg { max-width: 100%; height: auto; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,45,120,0.4); border-radius: 4px; }
      `}</style>

      {/* NAV */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 500, width: 'calc(100% - 48px)', maxWidth: 1100, borderRadius: 20, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', border: '1px solid rgba(255,255,255,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 56 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <LogoMark size={24} />
            <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>Intent<span style={{ color: '#ff2d78' }}>Mesh</span></span>
          </a>
          <span style={{ padding: '4px 12px', borderRadius: 100, fontSize: 13, fontWeight: 700, background: 'rgba(255,45,120,0.1)', border: '1px solid rgba(255,45,120,0.25)', color: '#ff2d78' }}>{result.repoFullName}</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <motion.button onClick={() => router.push('/analyze')} whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} style={{ padding: '8px 18px', borderRadius: 100, fontSize: 13, fontWeight: 700, background: 'rgba(255,255,255,0.06)', color: '#ddd', border: '1px solid rgba(255,255,255,0.12)' }}>← New Analysis</motion.button>
            <motion.button onClick={() => setShowPushModal(true)} whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}
              style={{ padding: '8px 18px', borderRadius: 100, fontSize: 13, fontWeight: 700, background: '#fff', color: '#000', border: '2px solid transparent', transition: 'all .25s' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background='#000'; el.style.color='#fff'; el.style.borderColor='#ff2d78'; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background='#fff'; el.style.color='#000'; el.style.borderColor='transparent'; }}>
              Push to Repo ↑
            </motion.button>
          </div>
        </div>
      </motion.div>

      <div style={{ paddingTop: 88, paddingBottom: 60, position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>

          {/* REPO HEADER */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            style={{ padding: '28px 32px', borderRadius: 20, marginBottom: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.8, color: '#fff' }}>{result.metadata.name}</h1>
                  <a href={result.metadata.htmlUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#ff2d78', textDecoration: 'none', fontWeight: 700, padding: '3px 10px', borderRadius: 100, border: '1px solid rgba(255,45,120,0.3)', background: 'rgba(255,45,120,0.08)' }}>View on GitHub ↗</a>
                </div>
                <p style={{ fontSize: 14, color: '#aaa', fontWeight: 500, marginBottom: 14 }}>{result.metadata.description || 'No description'}</p>
                {result.metadata.topics.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {result.metadata.topics.slice(0, 8).map(t => (
                      <span key={t} style={{ padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#aaa' }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                {[
                  { label: 'Stars',  value: result.metadata.stars.toLocaleString()      },
                  { label: 'Forks',  value: result.metadata.forks.toLocaleString()      },
                  { label: 'Issues', value: result.metadata.openIssues.toLocaleString() },
                ].map(s => (
                  <div key={s.label} style={{ padding: '14px 20px', borderRadius: 14, textAlign: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 72 }}>
                    <p style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{s.value}</p>
                    <p style={{ fontSize: 11, color: '#888', fontWeight: 600, marginTop: 2 }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
            {totalBytes > 0 && (
              <>
                <div style={{ display: 'flex', height: 6, borderRadius: 100, overflow: 'hidden', gap: 1, marginBottom: 10 }}>
                  {Object.entries(result.languages).slice(0, 6).map(([lang, bytes]) => (
                    <div key={lang} style={{ height: '100%', flex: bytes / totalBytes, background: LANG_COLORS[lang] ?? '#888', borderRadius: 100 }} />
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                  {Object.entries(result.languages).slice(0, 6).map(([lang, bytes]) => (
                    <span key={lang} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#aaa', fontWeight: 600 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: LANG_COLORS[lang] ?? '#888', display: 'block' }} />
                      {lang} <span style={{ color: '#666' }}>{((bytes / totalBytes) * 100).toFixed(1)}%</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </motion.div>

          {/* ARCHITECTURE CHIPS */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {Object.entries(result.architecture)
              .filter(([, v]) => v !== null)
              .map(([key, value]) => (
                <span key={key} style={{ padding: '6px 14px', borderRadius: 100, fontSize: 12, fontWeight: 700, background: 'rgba(255,45,120,0.08)', border: '1px solid rgba(255,45,120,0.2)', color: '#ff2d78' }}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}: {value}
                </span>
              ))}
          </motion.div>

          {/* TABS */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            style={{ display: 'flex', gap: 4, marginBottom: 16, padding: '6px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', width: 'fit-content' }}>
            {TABS.map(tab => (
              <button key={tab.id} className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                <span>{tab.icon}</span>{tab.label}
              </button>
            ))}
          </motion.div>

          {/* TAB CONTENT */}
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}
              style={{ borderRadius: 20, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>

              {/* ARCHITECTURE TAB */}
              {activeTab === 'architecture' && (
                <div style={{ padding: 32 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Architecture Diagram</h2>
                    <CopyBtn text={cleanMermaid(result.advancedDiagram ?? result.simpleDiagram)} label="Copy Mermaid" />
                  </div>

                  {/* ✅ FIX: diagramError state prevents blank-div confusion */}
                  {diagramError ? (
                    <div style={{ padding: 32, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
                      <p style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>⚠ Diagram could not render. Copy the Mermaid syntax and paste it into <a href="https://mermaid.live" target="_blank" rel="noreferrer" style={{ color: '#ff2d78' }}>mermaid.live</a> to view it.</p>
                      <pre style={{ textAlign: 'left', fontSize: 12, color: '#666', background: '#0d0d0d', padding: 16, borderRadius: 8, overflowX: 'auto' }}>
                        {cleanMermaid(result.advancedDiagram ?? result.simpleDiagram)}
                      </pre>
                    </div>
                  ) : (
                    <div ref={diagramCallbackRef} className="diagram-wrap"
                      style={{ padding: 32, borderRadius: 14, minHeight: 300, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginTop: 20 }}>
                    {Object.entries(result.architecture)
                      .filter(([, v]) => v !== null)
                      .map(([key, value]) => (
                        <div key={key} style={{ padding: '16px 20px', borderRadius: 12, background: 'rgba(255,45,120,0.06)', border: '1px solid rgba(255,45,120,0.15)' }}>
                          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#ff2d78', marginBottom: 4 }}>{key}</p>
                          <p style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{value}</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* README TAB */}
              {activeTab === 'readme' && (
                <div style={{ padding: 32 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Generated README.md</h2>
                    {result.readme && <CopyBtn text={result.readme} label="Copy Markdown" />}
                  </div>

                  {/* ✅ FIX: Show a clear message if README generation failed */}
                  {!result.readme ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#555' }}>
                      <p style={{ fontSize: 32, marginBottom: 12 }}>⚠️</p>
                      <p style={{ fontSize: 15, fontWeight: 600, color: '#888' }}>README generation failed.</p>
                      <p style={{ fontSize: 13, color: '#555', marginTop: 8 }}>This usually means the Groq API timed out or hit a rate limit. Try generating again.</p>
                    </div>
                  ) : (
                    <ReadmeContent html={readmeHtml} />
                  )}
                </div>
              )}

              {/* FIND CONTRIBUTORS TAB */}
              {activeTab === 'contributors' && (
                <div style={{ padding: 32 }}>
                  <div style={{ marginBottom: 28 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Potential Contributors</h2>
                    <p style={{ fontSize: 13, color: '#888', fontWeight: 500 }}>
                      GitHub developers skilled in {Object.keys(result.languages).slice(0, 2).join(' & ')} who may want to contribute.
                    </p>
                  </div>
                  {result.potentialContributors.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#555' }}>
                      <p style={{ fontSize: 32, marginBottom: 12 }}>🔍</p>
                      <p style={{ fontSize: 15, fontWeight: 600 }}>No potential contributors found.</p>
                      <p style={{ fontSize: 13, color: '#444', marginTop: 8 }}>GitHub rate limits may have prevented the search. Try adding a personal access token.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {result.potentialContributors.map((c, i) => (
                        <motion.a key={c.username} href={c.profileUrl} target="_blank" rel="noreferrer"
                          initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                          whileHover={{ x: 4 }}
                          style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderRadius: 14, textDecoration: 'none', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', transition: 'border-color .2s' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,45,120,0.3)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}>
                          <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,45,120,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#ff2d78', flexShrink: 0 }}>#{i + 1}</span>
                          <img src={c.avatarUrl} alt={c.username} style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                              <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>@{c.username}</span>
                              {c.location && <span style={{ fontSize: 11, color: '#666' }}>📍 {c.location}</span>}
                            </div>
                            <p style={{ fontSize: 12, color: '#888', fontWeight: 500 }}>{c.bio ?? 'No bio provided'}</p>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            <span style={{ padding: '4px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#aaa' }}>{c.publicRepos} repos</span>
                            <span style={{ padding: '4px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700, background: 'rgba(255,45,120,0.08)', border: '1px solid rgba(255,45,120,0.2)', color: '#ff2d78' }}>{c.followers} followers</span>
                          </div>
                        </motion.a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* EMAIL DRAFTS TAB */}
              {activeTab === 'email' && (
                <div style={{ padding: 32 }}>
                  <div style={{ marginBottom: 28 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Personalized Outreach Emails</h2>
                    <p style={{ fontSize: 13, color: '#888', fontWeight: 500 }}>
                      One AI-written email per contributor — click Preview to read, Copy to use.
                    </p>
                  </div>
                  {result.contributorEmails.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#555' }}>
                      <p style={{ fontSize: 32, marginBottom: 12 }}>📭</p>
                      <p style={{ fontSize: 15, fontWeight: 600 }}>No emails generated.</p>
                      <p style={{ fontSize: 13, color: '#444', marginTop: 8 }}>Emails are generated per contributor. Check the Find Contributors tab first.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {result.contributorEmails.map((email, i) => {
                        const contributor = result.potentialContributors.find(c => c.username === email.username);
                        const isExpanded = expandedEmail === email.username;
                        return (
                          <motion.div key={email.username}
                            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                            style={{ borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                              {contributor && (
                                <img src={contributor.avatarUrl} alt={email.username} style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', flexShrink: 0 }} />
                              )}
                              <div style={{ flex: 1 }}>
                                <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 2 }}>@{email.username}</p>
                                <p style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>Subject: {email.subject}</p>
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <CopyBtn text={`Subject: ${email.subject}\n\n${email.body}`} label="Copy Email" />
                                <button className="copy-btn"
                                  onClick={() => setExpandedEmail(isExpanded ? null : email.username)}
                                  style={{ borderColor: isExpanded ? 'rgba(255,45,120,0.4)' : undefined, color: isExpanded ? '#ff2d78' : undefined }}>
                                  {isExpanded ? 'Collapse ↑' : 'Preview ↓'}
                                </button>
                              </div>
                            </div>
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} style={{ overflow: 'hidden' }}>
                                  <div style={{ padding: '20px 24px', background: 'rgba(255,255,255,0.02)' }}>
                                    <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                      <span style={{ fontSize: 10, color: '#666', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>Subject</span>
                                      <p style={{ fontSize: 14, color: '#fff', fontWeight: 700, marginTop: 4 }}>{email.subject}</p>
                                    </div>
                                    <div style={{ padding: '18px 20px', borderRadius: 10, background: '#080808', border: '1px solid rgba(255,255,255,0.07)' }}>
                                      <p style={{ fontSize: 14, color: '#ccc', lineHeight: 1.9, fontWeight: 400, whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif' }}>
                                        {email.body}
                                      </p>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* PUSH MODAL */}
      <AnimatePresence>
        {showPushModal && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget && !pushing) setShowPushModal(false); }}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.25 }}
              style={{ width: '100%', maxWidth: 520, borderRadius: 24, padding: 32, background: 'rgba(10,10,10,0.95)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', border: '1px solid rgba(255,255,255,0.12)' }}>
              {pushSuccess ? (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
                  <h3 style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 8 }}>Successfully pushed!</h3>
                  <p style={{ fontSize: 14, color: '#aaa', marginBottom: 24 }}>README.md and architecture.md pushed to <strong style={{ color: '#fff' }}>{result.repoFullName}</strong></p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <a href={result.metadata.htmlUrl} target="_blank" rel="noreferrer" style={{ flex: 1, padding: '12px', borderRadius: 12, textAlign: 'center', background: '#fff', color: '#000', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>View on GitHub ↗</a>
                    <button onClick={() => { setShowPushModal(false); setPushSuccess(false); setPushChoice(null); }} style={{ flex: 1, padding: '12px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', color: '#fff', fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: 14, border: '1px solid rgba(255,255,255,0.1)' }}>Close</button>
                  </div>
                </motion.div>
              ) : (
                <>
                  <h3 style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginBottom: 6 }}>Push to {result.repoName}</h3>
                  <p style={{ fontSize: 13, color: '#888', marginBottom: 24, fontWeight: 500 }}>
                    Pushes <code style={{ color: '#ff2d78', background: 'rgba(255,45,120,0.1)', padding: '2px 6px', borderRadius: 4 }}>README.md</code> and <code style={{ color: '#ff2d78', background: 'rgba(255,45,120,0.1)', padding: '2px 6px', borderRadius: 4 }}>architecture.md</code> to your repo.
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#666', marginBottom: 12 }}>Existing README?</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                    {[
                      { id: 'replace' as const, icon: '🔄', title: 'Replace README.md',               desc: 'Overwrites the current README.' },
                      { id: 'new'     as const, icon: '✨', title: 'Create README-intentmesh.md', desc: 'Keeps your existing README. Adds new file alongside.' },
                    ].map(opt => (
                      <button key={opt.id} className={`choice-card ${pushChoice === opt.id ? 'selected' : ''}`} onClick={() => setPushChoice(opt.id)}>
                        <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{opt.icon} {opt.title}</p>
                        <p style={{ fontSize: 12, color: '#888', fontWeight: 500 }}>{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                  {pushError && <p style={{ fontSize: 13, color: '#ff8080', fontWeight: 600, marginBottom: 16 }}>⚠ {pushError}</p>}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => { setShowPushModal(false); setPushChoice(null); setPushError(''); }} style={{ flex: 1, padding: '13px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', color: '#aaa', fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: 14, border: '1px solid rgba(255,255,255,0.1)' }}>Cancel</button>
                    <button onClick={handlePush} disabled={!pushChoice || pushing}
                      style={{ flex: 2, padding: '13px', borderRadius: 12, background: pushChoice ? '#fff' : 'rgba(255,255,255,0.1)', color: pushChoice ? '#000' : '#555', fontFamily: 'Nunito, sans-serif', fontWeight: 800, fontSize: 14, border: '2px solid transparent', transition: 'all .25s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                      onMouseEnter={e => { if (!pushChoice || pushing) return; const el = e.currentTarget as HTMLElement; el.style.background='#000'; el.style.color='#fff'; el.style.borderColor='#ff2d78'; }}
                      onMouseLeave={e => { if (!pushChoice || pushing) return; const el = e.currentTarget as HTMLElement; el.style.background='#fff'; el.style.color='#000'; el.style.borderColor='transparent'; }}>
                      {pushing ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Pushing…</> : 'Push to GitHub ↑'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}