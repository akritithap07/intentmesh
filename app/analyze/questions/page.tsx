'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ─────────────────────────────────────────────────────────
interface SelectedRepo {
  url: string; name: string; fullName: string;
  description: string | null; language: string | null;
  private: boolean; owner: string;
}
interface Feature { id: string; name: string; description: string; }
interface EnvVar  { id: string; name: string; description: string; required: boolean; }

// ── Tech master list ──────────────────────────────────────────────
const ALL_TECH = [
  'React','Next.js','Vue.js','Angular','Svelte','SvelteKit','Nuxt.js','Remix','Astro','Vite',
  'Tailwind CSS','Bootstrap','Material UI','Chakra UI','shadcn/ui','Framer Motion','Three.js',
  'Node.js','Express.js','Fastify','NestJS','Hono','Bun','Deno',
  'Python','FastAPI','Django','Flask','Tornado',
  'Java','Spring Boot','Quarkus','Micronaut',
  'Go','Gin','Echo','Fiber',
  'Rust','Actix Web','Axum',
  'Ruby','Ruby on Rails','Sinatra',
  'PHP','Laravel','Symfony',
  'C#','.NET','ASP.NET Core',
  'TypeScript','JavaScript','Kotlin','Swift','Dart','Flutter',
  'PostgreSQL','MySQL','SQLite','MongoDB','Redis','Supabase','PlanetScale',
  'Prisma','Drizzle ORM','TypeORM','Mongoose','SQLAlchemy',
  'Elasticsearch','DynamoDB','Cassandra','CockroachDB','Neon','Turso',
  'NextAuth.js','Auth.js','Clerk','Auth0','Firebase Auth','Supabase Auth','JWT','Passport.js',
  'Docker','Docker Compose','Kubernetes','Terraform','Ansible',
  'AWS','AWS Lambda','AWS S3','AWS EC2','GCP','Google Cloud Run','Azure',
  'Vercel','Netlify','Railway','Render','Fly.io','Heroku',
  'GitHub Actions','GitLab CI','CircleCI','Jenkins',
  'OpenAI API','Groq','Anthropic Claude','Ollama','LangChain','LlamaIndex',
  'TensorFlow','PyTorch','scikit-learn','Hugging Face',
  'WebSockets','Socket.IO','Pusher','Ably','Kafka','RabbitMQ',
  'Cloudflare R2','Uploadthing','Cloudinary','ImageKit',
  'Stripe','Razorpay','PayPal',
  'Jest','Vitest','Playwright','Cypress','pytest','JUnit',
  'GraphQL','tRPC','gRPC','REST API','OpenAPI/Swagger','Zod',
  'Sentry','Datadog','Prometheus','Grafana','PostHog','Plausible',
];

const PROJECT_TYPES = ['Web Application','Mobile App','CLI Tool','Library / SDK','API / Backend','AI / ML Project','DevOps Tool','Other'];
const AUDIENCE_OPTS = ['Developers','Enterprises','Students','Open Source Community','End Users','Data Scientists','DevOps Engineers'];
const LICENSE_OPTS  = ['MIT','Apache 2.0','GPL v3','BSD 3-Clause','AGPL v3','Proprietary','Not decided'];
const DEPLOY_OPTS   = ['Vercel','AWS','GCP','Azure','Docker / Self-hosted','Netlify','Railway','Fly.io','Not deployed yet'];
const STATUS_OPTS   = ['Early prototype','In active development','Beta / Pre-release','Production / Stable','Maintenance mode'];

const LOADING_STEPS = [
  'Fetching repository metadata…',
  'Processing your answers…',
  'Inferring architecture layers…',
  'Building architecture diagram…',
  'Writing professional README…',
  'Searching for contributors…',
  'Drafting outreach emails…',
  'Almost done…',
];

const STEPS = [
  { id: 1, emoji: '🎯', title: 'What is this project?', sub: 'The core identity — be specific. This shapes the entire README.' },
  { id: 2, emoji: '✨', title: 'What does it do?',       sub: 'Features and tech stack power both the README and the diagram.' },
  { id: 3, emoji: '🚀', title: 'How do people use it?', sub: 'Auto-filled from your stack — review and edit anything.' },
  { id: 4, emoji: '🏁', title: 'Final details',          sub: 'Deployment, license, and contributing are required.' },
];

// ── Logo ──────────────────────────────────────────────────────────
function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="7"  r="3.5" fill="#ff2d78"/>
      <circle cx="5"  cy="25" r="3"   fill="white" fillOpacity="0.75"/>
      <circle cx="27" cy="25" r="3"   fill="white" fillOpacity="0.75"/>
      <circle cx="16" cy="19" r="2.5" fill="#ff2d78" fillOpacity="0.55"/>
      <line x1="16" y1="7"  x2="5"  y2="25" stroke="#ff2d78" strokeWidth="1.2" strokeOpacity="0.6"/>
      <line x1="16" y1="7"  x2="27" y2="25" stroke="#ff2d78" strokeWidth="1.2" strokeOpacity="0.6"/>
      <line x1="5"  y1="25" x2="27" y2="25" stroke="white"   strokeWidth="1"   strokeOpacity="0.2"/>
      <line x1="16" y1="7"  x2="16" y2="19" stroke="#ff2d78" strokeWidth="1"   strokeOpacity="0.4"/>
      <line x1="5"  y1="25" x2="16" y2="19" stroke="white"   strokeWidth="1"   strokeOpacity="0.2"/>
      <line x1="27" y1="25" x2="16" y2="19" stroke="white"   strokeWidth="1"   strokeOpacity="0.2"/>
    </svg>
  );
}

// ── Voice Input ───────────────────────────────────────────────────
function MicButton({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);

  const stopListening = useCallback(() => {
    try { recogRef.current?.stop(); } catch {}
    recogRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SR = typeof window !== 'undefined'
      ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
      : null;
    if (!SR) { alert('Voice input requires Chrome or Edge.'); return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const text = Array.from(e.results as SpeechRecognitionResultList)
        .slice(e.resultIndex)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join(' ');
      onChange(value ? value.trimEnd() + ' ' + text.trim() : text.trim());
    };
    rec.onerror = () => stopListening();
    rec.onend   = () => { if (recogRef.current) stopListening(); };
    recogRef.current = rec;
    try { rec.start(); setListening(true); } catch { stopListening(); }
  }, [value, onChange, stopListening]);

  useEffect(() => () => { try { recogRef.current?.stop(); } catch {} }, []);

  return (
    <button type="button" onClick={listening ? stopListening : startListening}
      title={listening ? 'Stop recording' : 'Voice input'}
      style={{ position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: '50%', background: listening ? 'rgba(255,45,120,0.25)' : 'rgba(255,255,255,0.07)', border: `1.5px solid ${listening ? '#ff2d78' : 'rgba(255,255,255,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s', flexShrink: 0, zIndex: 2, boxShadow: listening ? '0 0 14px rgba(255,45,120,0.5)' : 'none', animation: listening ? 'micPulse 1.5s ease-in-out infinite' : 'none' }}>
      {listening
        ? <svg width="10" height="10" viewBox="0 0 10 10" fill="#ff2d78"><rect width="10" height="10" rx="2"/></svg>
        : <svg width="13" height="16" viewBox="0 0 13 16" fill="none"><rect x="3.5" y="0.5" width="6" height="9" rx="3" fill="#888"/><path d="M1 8C1 11.314 3.686 14 7 14s6-2.686 6-6" stroke="#888" strokeWidth="1.5" strokeLinecap="round" fill="none"/><line x1="6.5" y1="14" x2="6.5" y2="16" stroke="#888" strokeWidth="1.5" strokeLinecap="round"/><line x1="4" y1="16" x2="9" y2="16" stroke="#888" strokeWidth="1.5" strokeLinecap="round"/></svg>
      }
    </button>
  );
}

function VoiceArea({ value, onChange, placeholder, rows = 3, mono = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; mono?: boolean;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <textarea className={mono ? 'fi mono' : 'fi'} rows={rows} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} style={{ paddingRight: 50 }} />
      <MicButton value={value} onChange={onChange} />
    </div>
  );
}

function VoiceInput({ value, onChange, placeholder, maxLength }: {
  value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <input className="fi" type="text" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} maxLength={maxLength} style={{ paddingRight: 50 }} />
      <MicButton value={value} onChange={onChange} />
    </div>
  );
}

// ── Tech Stack Search ─────────────────────────────────────────────
function TechSearch({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  const suggestions = query.trim().length > 0
    ? ALL_TECH.filter(t => t.toLowerCase().includes(query.toLowerCase()) && !selected.includes(t)).slice(0, 8)
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const add = (tech: string) => { onChange([...selected, tech]); setQuery(''); setOpen(false); setTimeout(() => inputRef.current?.focus(), 50); };
  const remove = (tech: string) => onChange(selected.filter(t => t !== tech));
  const addCustom = () => { const t = query.trim(); if (t && !selected.includes(t)) add(t); };

  return (
    <div ref={wrapRef}>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
          {selected.map(t => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px 5px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700, background: 'rgba(255,45,120,0.12)', border: '1px solid rgba(255,45,120,0.3)', color: '#ff2d78' }}>
              {t}
              <button type="button" onClick={() => remove(t)} style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(255,45,120,0.25)', border: 'none', color: '#ff2d78', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0, fontWeight: 900 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <input ref={inputRef} className="fi" type="text"
          placeholder={selected.length === 0 ? 'Type to search — e.g. React, FastAPI, PostgreSQL…' : 'Add more technologies…'}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (query.trim()) setOpen(true); }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); suggestions.length > 0 ? add(suggestions[0]) : addCustom(); }
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Backspace' && !query && selected.length > 0) remove(selected[selected.length - 1]);
          }}
        />
        {query && <button type="button" onClick={() => setQuery('')} style={{ position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#555', fontSize: 18, lineHeight: 1 }}>×</button>}
      </div>
      <AnimatePresence>
        {open && (suggestions.length > 0 || query.trim()) && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
            style={{ position: 'absolute', left: 0, right: 0, zIndex: 300, marginTop: 4, borderRadius: 12, background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.7)' }}>
            {suggestions.map((tech, i) => (
              <button key={tech} type="button" onClick={() => add(tech)}
                style={{ width: '100%', padding: '12px 16px', textAlign: 'left', background: 'transparent', border: 'none', color: '#ddd', fontSize: 13, fontWeight: 600, borderBottom: i < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', transition: 'background .1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,45,120,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {tech}
              </button>
            ))}
            {query.trim() && !ALL_TECH.some(t => t.toLowerCase() === query.toLowerCase()) && (
              <button type="button" onClick={addCustom}
                style={{ width: '100%', padding: '12px 16px', textAlign: 'left', background: 'transparent', border: 'none', color: '#888', fontSize: 13, fontWeight: 600, borderTop: suggestions.length ? '1px solid rgba(255,255,255,0.05)' : 'none', transition: 'background .1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                + Add &quot;{query.trim()}&quot; as custom
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {selected.length === 0 && <p style={{ fontSize: 11, color: '#555', marginTop: 7, fontWeight: 500 }}>💡 The more specific you are, the more accurate the architecture diagram will be. Press Enter to add.</p>}
    </div>
  );
}

// ── Small UI helpers ──────────────────────────────────────────────
function Label({ children, hint, required }: { children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: -0.3 }}>
        {children}{required && <span style={{ color: '#ff2d78', marginLeft: 4 }}>*</span>}
      </p>
      {hint && <p style={{ fontSize: 12, color: '#666', fontWeight: 500, marginTop: 3, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}
function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ padding: '8px 16px', borderRadius: 100, fontSize: 13, fontWeight: 700, border: `1px solid ${active ? 'rgba(255,45,120,0.5)' : 'rgba(255,255,255,0.1)'}`, background: active ? 'rgba(255,45,120,0.15)' : 'rgba(255,255,255,0.04)', color: active ? '#ff2d78' : '#777', transition: 'all .2s' }}>
      {label}
    </button>
  );
}
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: '24px', borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', marginBottom: 14, ...style }}>
      {children}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
export default function QuestionsPage() {
  const router            = useRouter();
  const { data: session } = useSession();
  const [repo, setRepo]   = useState<SelectedRepo | null>(null);
  const [step, setStep]   = useState(1);
  const [dir,  setDir]    = useState(1);

  // Step 1
  const [tagline,     setTagline]     = useState('');
  const [whyBuilt,    setWhyBuilt]    = useState('');
  const [projectType, setProjectType] = useState('');
  const [status,      setStatus]      = useState('');
  const [audience,    setAudience]    = useState<string[]>([]);

  // Step 2
  const [features,  setFeatures]  = useState<Feature[]>([{ id: '1', name: '', description: '' }]);
  const [techStack, setTechStack] = useState<string[]>([]);

  // Step 3
  const [prerequisites, setPrereqs]      = useState('');
  const [installSteps,  setInstall]      = useState('');
  const [usageExample,  setUsage]        = useState('');
  const [envVars,       setEnvVars]      = useState<EnvVar[]>([{ id: '1', name: '', description: '', required: true }]);
  const [showEnvVars,   setShowEnvVars]  = useState(false);
  const [autoFilling,   setAutoFilling]  = useState(false);
  const [autoFillDone,  setAutoFillDone] = useState(false);
  const [autoFillError, setAutoFillError] = useState(false);

  // Step 4
  const [demoUrl,     setDemoUrl]     = useState('');
  const [deployment,  setDeployment]  = useState('');
  const [license,     setLicense]     = useState('');
  const [limitations, setLimitations] = useState('');
  const [roadmap,     setRoadmap]     = useState('');
  const [contributing, setContrib]    = useState<boolean | null>(null);

  // Global
  const [loading,     setLoading]     = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error,       setError]       = useState('');

  // Refs to capture latest state in async callbacks without stale closures
  const featuresRef  = useRef(features);
  const techRef      = useRef(techStack);
  useEffect(() => { featuresRef.current = features;  }, [features]);
  useEffect(() => { techRef.current     = techStack; }, [techStack]);

  useEffect(() => {
    const raw = sessionStorage.getItem('intentmesh_selected_repo');
    if (!raw) { router.push('/analyze'); return; }
    const p: SelectedRepo = JSON.parse(raw);
    setRepo(p);
    if (p.language)    setTechStack([p.language]);
    if (p.description) setTagline(p.description);
  }, [router]);

  // ── Feature helpers ───────────────────────────────────────────
  const addFeature    = () => setFeatures(p => [...p, { id: Date.now().toString(), name: '', description: '' }]);
  const removeFeature = (id: string) => setFeatures(p => p.filter(f => f.id !== id));
  const updFeature    = (id: string, field: 'name' | 'description', v: string) =>
    setFeatures(p => p.map(f => f.id === id ? { ...f, [field]: v } : f));

  // ── Env helpers ───────────────────────────────────────────────
  const addEnv    = () => setEnvVars(p => [...p, { id: Date.now().toString(), name: '', description: '', required: true }]);
  const removeEnv = (id: string) => setEnvVars(p => p.filter(e => e.id !== id));
  const updEnv    = (id: string, field: keyof EnvVar, v: string | boolean) =>
    setEnvVars(p => p.map(e => e.id === id ? { ...e, [field]: v } : e));

  // ── Auto-fill step 3 via Groq ──────────────────────────────────
  const runAutoFill = useCallback(async () => {
    setAutoFilling(true);
    setAutoFillDone(false);
    setAutoFillError(false);
    try {
      const res = await fetch('/api/generate-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: repo?.name ?? 'project',
          projectType,
          features: featuresRef.current.filter(f => f.name.trim()),
          techStack: techRef.current,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.prerequisites) setPrereqs(json.data.prerequisites);
        if (json.data.installSteps)  setInstall(json.data.installSteps);
        if (json.data.usageExample)  setUsage(json.data.usageExample);
        setAutoFillDone(true);
      } else {
        setAutoFillError(true);
      }
    } catch {
      setAutoFillError(true);
    }
    setAutoFilling(false);
  }, [repo?.name, projectType]);

  // ── Validation ────────────────────────────────────────────────
  const validate = (): string => {
    if (step === 1 && !tagline.trim())   return 'Please enter a project tagline.';
    if (step === 1 && !projectType)      return 'Please select a project type.';
    if (step === 2 && features.filter(f => f.name.trim()).length === 0) return 'Add at least one key feature.';
    if (step === 2 && techStack.length === 0) return 'Please add at least one technology to your stack.';
    if (step === 4 && !deployment)       return 'Please select a deployment platform.';
    if (step === 4 && !license)          return 'Please select a license.';
    if (step === 4 && contributing === null) return 'Please choose whether to include a Contributing section.';
    return '';
  };

  const goNext = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    if (step === 2) {
      setDir(1); setStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => runAutoFill(), 100);
      return;
    }
    setDir(1);
    setStep(s => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setError('');
    setDir(-1);
    setStep(s => s - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setLoading(true);
    setLoadingStep(0);

    let s = 0;
    const iv = setInterval(() => {
      s++;
      if (s < LOADING_STEPS.length) setLoadingStep(s);
      else clearInterval(iv);
    }, 2200);

    try {
      const userAnswers = {
        tagline, whyBuilt, projectType,
        audience:     audience.join(', ') || 'Developers',
        features:     features.filter(f => f.name.trim()),
        techStack:    techStack.join(', '),
        prerequisites, installSteps,
        envVars:      showEnvVars ? envVars.filter(e => e.name.trim()) : [],
        usageExample, demoUrl, deployment, license, status,
        limitations, roadmap, contributing: contributing === true,
      };

      // ✅ FIX: accessToken stays in the body — this matches what the route reads.
      //   Do NOT move it to an Authorization header unless you also update route.ts.
      const res = await fetch('/api/analyze-repo', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          url:         repo!.url,
          accessToken: (session as any)?.accessToken ?? '',
          userAnswers,
        }),
      });

      const json = await res.json();
      clearInterval(iv);

      // ✅ FIX: Check both json.error (old shape) and !json.success (new shape)
      if (!res.ok || json.error || json.success === false) {
        setError(json.error || `Server error (${res.status}). Please try again.`);
        setLoading(false);
        return;
      }

      // ✅ FIX: Guard against missing json.data before writing to sessionStorage
      if (!json.data) {
        setError('Received an empty response from the server. Please try again.');
        setLoading(false);
        return;
      }

      sessionStorage.setItem('intentmesh_result', JSON.stringify({
        ...json.data,
        repoFullName: repo!.fullName,
        repoOwner:    repo!.owner,
        repoName:     repo!.name,
      }));
      router.push('/results');

    } catch (e) {
      clearInterval(iv);
      console.error('[handleSubmit]', e);
      setError('Network error — check your connection and try again.');
      setLoading(false);
    }
  };

  if (!repo) return null;

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;
  const variants = {
    enter:  (d: number) => ({ opacity: 0, x: d > 0 ? 40 : -40 }),
    center: { opacity: 1, x: 0 },
    exit:   (d: number) => ({ opacity: 0, x: d > 0 ? -40 : 40 }),
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { font-family: 'Nunito', sans-serif; background: #000; color: #fff; min-height: 100vh; overflow-x: hidden; cursor: none; }
        body::before { content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background: radial-gradient(ellipse 60% 50% at 20% 10%, rgba(255,45,120,0.09) 0%, transparent 60%),
                      radial-gradient(ellipse 50% 50% at 80% 90%, rgba(255,45,120,0.06) 0%, transparent 60%); }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes micPulse { 0%,100% { box-shadow: 0 0 8px rgba(255,45,120,0.4); } 50% { box-shadow: 0 0 20px rgba(255,45,120,0.8); } }
        a, button, input, textarea, select { cursor: none; font-family: 'Nunito', sans-serif; }

        .fi { width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 16px; font-size: 14px; font-weight: 600; color: #fff; outline: none; transition: border-color .2s, box-shadow .2s, background .2s; resize: vertical; line-height: 1.7; }
        .fi::placeholder { color: #444; font-weight: 500; }
        .fi:focus { border-color: rgba(255,45,120,0.5); box-shadow: 0 0 0 3px rgba(255,45,120,0.08); background: rgba(255,255,255,0.07); }
        .fs { width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 16px; font-size: 14px; font-weight: 600; color: #fff; outline: none; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23666' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; transition: border-color .2s; }
        .fs:focus { border-color: rgba(255,45,120,0.5); box-shadow: 0 0 0 3px rgba(255,45,120,0.08); }
        .fs option { background: #111; }
        .mono { font-family: 'JetBrains Mono', monospace !important; font-size: 13px !important; line-height: 1.8 !important; }
        .sub-card { padding: 16px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); margin-bottom: 10px; }
        .add-btn { width: 100%; padding: 12px; border-radius: 11px; border: 1px dashed rgba(255,45,120,0.35); background: rgba(255,45,120,0.04); color: #ff2d78; font-size: 13px; font-weight: 700; margin-top: 4px; transition: all .2s; }
        .add-btn:hover { background: rgba(255,45,120,0.09); }
        .rm-btn { width: 26px; height: 26px; border-radius: 50%; background: rgba(255,80,80,0.1); border: 1px solid rgba(255,80,80,0.2); color: #ff8080; font-size: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all .2s; }
        .opt { width: 100%; padding: 14px 18px; border-radius: 14px; border: 1px dashed rgba(255,255,255,0.1); background: transparent; color: #666; font-size: 13px; font-weight: 700; transition: all .2s; display: flex; align-items: center; justify-content: space-between; }
        .opt:hover { border-color: rgba(255,255,255,0.2); color: #aaa; }
        .opt.open { border-style: solid; border-color: rgba(255,45,120,0.3); color: #ff2d78; background: rgba(255,45,120,0.05); }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,45,120,0.4); border-radius: 4px; }
      `}</style>

      {/* NAV */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 100, width: 'calc(100% - 48px)', maxWidth: 720, borderRadius: 20, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(28px)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 56 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <LogoMark size={22} />
            <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>Intent<span style={{ color: '#ff2d78' }}>Mesh</span></span>
          </a>
          <span style={{ padding: '4px 12px', borderRadius: 100, fontSize: 11, fontWeight: 700, background: 'rgba(255,45,120,0.1)', border: '1px solid rgba(255,45,120,0.25)', color: '#ff2d78' }}>{repo.name}</span>
          <button onClick={() => router.push('/analyze')} style={{ padding: '7px 14px', borderRadius: 100, fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.05)', color: '#777', border: '1px solid rgba(255,255,255,0.08)' }}>← Back</button>
        </div>
      </motion.div>

      {/* LOADING OVERLAY */}
      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(24px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 28 }}>
            <div style={{ width: 56, height: 56, border: '3px solid rgba(255,255,255,0.08)', borderTopColor: '#ff2d78', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: -0.5, marginBottom: 10 }}>Generating your README…</p>
              <AnimatePresence mode="wait">
                <motion.p key={loadingStep} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ fontSize: 14, color: '#777', fontWeight: 500 }}>
                  ⚡ {LOADING_STEPS[loadingStep]}
                </motion.p>
              </AnimatePresence>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {LOADING_STEPS.map((_, i) => (
                <div key={i} style={{ width: i === loadingStep ? 22 : 6, height: 6, borderRadius: 100, background: i <= loadingStep ? '#ff2d78' : 'rgba(255,255,255,0.08)', transition: 'all .35s' }} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ paddingTop: 88, paddingBottom: 60, position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px' }}>

          {/* Accuracy banner */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: '20px 24px', borderRadius: 16, marginBottom: 28, background: 'rgba(255,45,120,0.07)', border: '1px solid rgba(255,45,120,0.18)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>💡</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 3 }}>Your answers are the only source of truth</p>
              <p style={{ fontSize: 13, color: '#aaa', fontWeight: 500, lineHeight: 1.6 }}>
                IntentMesh can't read your code — so the more detail you share, the more accurate your <strong style={{ color: '#fff' }}>README, architecture diagram, and outreach emails</strong> will be.
                <strong style={{ color: '#ff2d78' }}> 🎤 Use mic buttons for faster input.</strong>
              </p>
            </div>
          </motion.div>

          {/* Step progress */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              {STEPS.map((s, i) => {
                const done = step > s.id, current = step === s.id;
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: current ? 36 : 28, height: current ? 36 : 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: current ? 18 : 14, background: done ? '#ff2d78' : current ? 'rgba(255,45,120,0.15)' : 'rgba(255,255,255,0.06)', border: `2px solid ${done ? '#ff2d78' : current ? 'rgba(255,45,120,0.5)' : 'rgba(255,255,255,0.1)'}`, transition: 'all .3s', boxShadow: current ? '0 0 20px rgba(255,45,120,0.3)' : 'none' }}>
                        {done ? '✓' : s.emoji}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: current ? '#ff2d78' : done ? '#aaa' : '#444', whiteSpace: 'nowrap' }}>{s.title.split(' ').slice(0, 2).join(' ')}</span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div style={{ flex: 1, height: 2, background: done ? '#ff2d78' : 'rgba(255,255,255,0.07)', transition: 'background .4s', margin: '0 6px', marginBottom: 20 }} />
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ height: 3, borderRadius: 100, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <motion.div style={{ height: '100%', background: 'linear-gradient(90deg,#ff2d78,#ff6b9d)', borderRadius: 100 }}
                animate={{ width: `${progress}%` }} transition={{ duration: 0.4, ease: 'easeOut' }} />
            </div>
          </motion.div>

          {/* Step header */}
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={`h${step}`} custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }} style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#ff2d78', marginBottom: 8 }}>Step {step} of {STEPS.length}</p>
              <h2 style={{ fontSize: 'clamp(22px,3.5vw,30px)', fontWeight: 900, color: '#fff', letterSpacing: -1, marginBottom: 5 }}>{STEPS[step - 1].emoji} {STEPS[step - 1].title}</h2>
              <p style={{ fontSize: 14, color: '#777', fontWeight: 500, lineHeight: 1.6 }}>{STEPS[step - 1].sub}</p>
            </motion.div>
          </AnimatePresence>

          {/* Step content */}
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={`c${step}`} custom={dir} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }}>

              {/* ── STEP 1 ── */}
              {step === 1 && (
                <>
                  <Card>
                    <Label required hint="The first thing anyone reads — immediately tells them what this does and who it's for.">Project Tagline</Label>
                    <VoiceInput value={tagline} onChange={setTagline} maxLength={120} placeholder="e.g. The fastest way to connect job seekers with local opportunities in India" />
                    <p style={{ fontSize: 11, color: '#444', marginTop: 5, fontWeight: 500 }}>{tagline.length}/120</p>
                  </Card>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <Card style={{ marginBottom: 0 }}>
                      <Label required>Project Type</Label>
                      <select className="fs" value={projectType} onChange={e => setProjectType(e.target.value)}>
                        <option value="">Select…</option>
                        {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </Card>
                    <Card style={{ marginBottom: 0 }}>
                      <Label>Current Status</Label>
                      <select className="fs" value={status} onChange={e => setStatus(e.target.value)}>
                        <option value="">Select…</option>
                        {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </Card>
                  </div>
                  <Card>
                    <Label hint="The most-read section in any good README. What problem does this solve?">Why did you build this?</Label>
                    <VoiceArea value={whyBuilt} onChange={setWhyBuilt} rows={3} placeholder="e.g. Most job platforms ignore tier-2/3 city workers. This bridges that gap with hyperlocal opportunities and vernacular language support." />
                  </Card>
                  <Card>
                    <Label hint="Affects tone and what we emphasize.">Who is this built for?</Label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {AUDIENCE_OPTS.map(a => <Pill key={a} label={a} active={audience.includes(a)} onClick={() => setAudience(p => p.includes(a) ? p.filter(x => x !== a) : [...p, a])} />)}
                    </div>
                  </Card>
                </>
              )}

              {/* ── STEP 2 ── */}
              {step === 2 && (
                <>
                  <Card>
                    <Label required hint="Each feature gets its own bold entry in the README. Be specific.">Key Features</Label>
                    {features.map((f, i) => (
                      <div key={f.id} className="sub-card">
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                          <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,45,120,0.15)', border: '1px solid rgba(255,45,120,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#ff2d78', flexShrink: 0 }}>{i + 1}</span>
                          <input className="fi" type="text" placeholder="Feature name (e.g. Hyperlocal Job Matching)" value={f.name} onChange={e => updFeature(f.id, 'name', e.target.value)} style={{ flex: 1 }} />
                          {features.length > 1 && <button className="rm-btn" onClick={() => removeFeature(f.id)}>×</button>}
                        </div>
                        <VoiceArea value={f.description} onChange={v => updFeature(f.id, 'description', v)} rows={2} placeholder="What does this do? Why does it matter to users?" />
                      </div>
                    ))}
                    <button className="add-btn" onClick={addFeature}>+ Add Feature</button>
                  </Card>
                  <Card style={{ position: 'relative' }}>
                    <Label required hint="This determines how accurate your architecture diagram is. The more specific, the better.">Full Tech Stack</Label>
                    <TechSearch selected={techStack} onChange={setTechStack} />
                  </Card>
                </>
              )}

              {/* ── STEP 3 ── */}
              {step === 3 && (
                <>
                  <AnimatePresence>
                    {(autoFilling || autoFillDone || autoFillError) && (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ padding: '14px 20px', borderRadius: 14, marginBottom: 16, background: autoFilling ? 'rgba(255,255,255,0.04)' : autoFillError ? 'rgba(255,100,100,0.07)' : 'rgba(0,200,100,0.07)', border: `1px solid ${autoFilling ? 'rgba(255,255,255,0.1)' : autoFillError ? 'rgba(255,100,100,0.2)' : 'rgba(0,200,100,0.2)'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                        {autoFilling && <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#ff2d78', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />}
                        <p style={{ fontSize: 13, fontWeight: 600, color: autoFilling ? '#aaa' : autoFillError ? '#ff8080' : '#6ee7b7' }}>
                          {autoFilling  && '⚡ Auto-filling setup instructions from your tech stack…'}
                          {autoFillDone && !autoFilling && '✅ Auto-filled — review and edit anything below.'}
                          {autoFillError && !autoFilling && '⚠ Could not auto-fill — please fill in manually below.'}
                        </p>
                        {autoFillError && !autoFilling && (
                          <button type="button" onClick={runAutoFill} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#aaa', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>Retry</button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <Card>
                    <Label hint="What must someone have installed before they can clone and run this?">Prerequisites</Label>
                    <VoiceArea value={prerequisites} onChange={setPrereqs} rows={2} placeholder="e.g. Node.js 18+, PostgreSQL 15+, Docker, A Groq API key" />
                  </Card>
                  <Card>
                    <Label hint="Exact commands to clone, install, and run. Goes verbatim into a code block.">Installation Commands</Label>
                    <VoiceArea value={installSteps} onChange={setInstall} rows={7} mono placeholder={`git clone https://github.com/you/project\ncd project\nnpm install\ncp .env.example .env.local\nnpm run dev`} />
                  </Card>
                  <div style={{ marginBottom: 14 }}>
                    <button className={`opt ${showEnvVars ? 'open' : ''}`} onClick={() => setShowEnvVars(!showEnvVars)}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span>🔐</span>
                        <div style={{ textAlign: 'left' }}>
                          <span style={{ display: 'block' }}>Environment Variables</span>
                          <span style={{ fontSize: 11, color: showEnvVars ? 'rgba(255,45,120,0.6)' : '#555', fontWeight: 500 }}>Optional — generates a .env config table in the README</span>
                        </div>
                      </span>
                      <span style={{ fontSize: 20 }}>{showEnvVars ? '−' : '+'}</span>
                    </button>
                    <AnimatePresence>
                      {showEnvVars && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} style={{ overflow: 'hidden' }}>
                          <div style={{ padding: '20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderTop: 'none', borderRadius: '0 0 14px 14px' }}>
                            {envVars.map(ev => (
                              <div key={ev.id} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                <input className="fi mono" type="text" placeholder="NEXT_PUBLIC_KEY" value={ev.name} onChange={e => updEnv(ev.id, 'name', e.target.value)} />
                                <input className="fi" type="text" placeholder="What this key does" value={ev.description} onChange={e => updEnv(ev.id, 'description', e.target.value)} />
                                <button type="button" onClick={() => updEnv(ev.id, 'required', !ev.required)} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${ev.required ? 'rgba(255,45,120,0.4)' : 'rgba(255,255,255,0.1)'}`, background: ev.required ? 'rgba(255,45,120,0.1)' : 'transparent', color: ev.required ? '#ff2d78' : '#666', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{ev.required ? 'Required' : 'Optional'}</button>
                                {envVars.length > 1 && <button className="rm-btn" onClick={() => removeEnv(ev.id)}>×</button>}
                              </div>
                            ))}
                            <button className="add-btn" onClick={addEnv}>+ Add Variable</button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <Card>
                    <Label hint="A realistic walkthrough of how someone actually uses this after setup.">Usage Example</Label>
                    <VoiceArea value={usageExample} onChange={setUsage} rows={4} placeholder="e.g. 1. Go to http://localhost:3000  2. Sign in with GitHub  3. Paste your repo URL  4. Click Generate" />
                  </Card>
                </>
              )}

              {/* ── STEP 4 ── */}
              {step === 4 && (
                <>
                  <div style={{ padding: '14px 20px', borderRadius: 14, marginBottom: 14, background: 'rgba(255,45,120,0.06)', border: '1px solid rgba(255,45,120,0.15)' }}>
                    <p style={{ fontSize: 13, color: '#aaa', fontWeight: 600, lineHeight: 1.6 }}>🏁 Almost done — <strong style={{ color: '#ff2d78' }}>deployment, license, and contributing</strong> are required.</p>
                  </div>
                  <Card>
                    <Label required hint="Used in the deployment section and architecture diagram.">Deployment Platform</Label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {DEPLOY_OPTS.map(d => <Pill key={d} label={d} active={deployment === d} onClick={() => setDeployment(d)} />)}
                    </div>
                  </Card>
                  <Card>
                    <Label required>License</Label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {LICENSE_OPTS.map(l => <Pill key={l} label={l} active={license === l} onClick={() => setLicense(l)} />)}
                    </div>
                  </Card>
                  <Card>
                    <Label required hint="Adds a Contributing section explaining how to fork, open PRs, etc.">Include Contributing Section?</Label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[{ val: true, label: '✅ Yes — include it' }, { val: false, label: '❌ No — skip it' }].map(opt => (
                        <button key={String(opt.val)} type="button" onClick={() => setContrib(opt.val)}
                          style={{ flex: 1, padding: '13px', borderRadius: 12, border: `2px solid ${contributing === opt.val ? '#ff2d78' : 'rgba(255,255,255,0.1)'}`, background: contributing === opt.val ? 'rgba(255,45,120,0.1)' : 'rgba(255,255,255,0.04)', color: contributing === opt.val ? '#ff2d78' : '#777', fontSize: 13, fontWeight: 800, transition: 'all .2s' }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </Card>
                  <Card>
                    <Label hint="Shown as a live demo badge at the top of your README.">Live Demo URL <span style={{ fontSize: 11, color: '#555', fontWeight: 500 }}>(optional)</span></Label>
                    <input className="fi" type="text" placeholder="https://yourproject.vercel.app" value={demoUrl} onChange={e => setDemoUrl(e.target.value)} />
                  </Card>
                  <Card>
                    <Label hint="Honest limitations build trust with developers.">Known Limitations <span style={{ fontSize: 11, color: '#555', fontWeight: 500 }}>(optional)</span></Label>
                    <VoiceArea value={limitations} onChange={setLimitations} rows={2} placeholder="e.g. Currently supports public repositories only." />
                  </Card>
                  <Card>
                    <Label hint="Shows the project is alive. Helps contributors find things to work on.">Roadmap <span style={{ fontSize: 11, color: '#555', fontWeight: 500 }}>(optional)</span></Label>
                    <VoiceArea value={roadmap} onChange={setRoadmap} rows={3} placeholder={`- Private repository support\n- VS Code extension\n- One-click Railway deploy`} />
                  </Card>
                </>
              )}

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ padding: '13px 18px', borderRadius: 12, background: 'rgba(255,100,100,0.08)', border: '1px solid rgba(255,100,100,0.2)', marginTop: 4, marginBottom: 12, fontSize: 13, color: '#ff8080', fontWeight: 600 }}>
                    ⚠ {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Navigation */}
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                {step > 1 && (
                  <motion.button type="button" whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} onClick={goBack}
                    style={{ flex: 1, padding: '15px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#aaa', fontSize: 15, fontWeight: 700 }}>
                    ← Back
                  </motion.button>
                )}
                {step < STEPS.length ? (
                  <motion.button type="button" whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} onClick={goNext}
                    style={{ flex: 2, padding: '15px', borderRadius: 14, border: '2px solid transparent', background: '#fff', color: '#000', fontSize: 15, fontWeight: 800, letterSpacing: -0.3, transition: 'all .25s' }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background='#000'; el.style.color='#fff'; el.style.borderColor='#ff2d78'; }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background='#fff'; el.style.color='#000'; el.style.borderColor='transparent'; }}>
                    Continue →
                  </motion.button>
                ) : (
                  <motion.button type="button" whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} onClick={handleSubmit} disabled={loading}
                    style={{ flex: 2, padding: '15px', borderRadius: 14, border: '2px solid transparent', background: loading ? 'rgba(255,255,255,0.1)' : '#fff', color: loading ? '#555' : '#000', fontSize: 15, fontWeight: 800, letterSpacing: -0.3, transition: 'all .25s' }}
                    onMouseEnter={e => { if (loading) return; const el = e.currentTarget as HTMLElement; el.style.background='#000'; el.style.color='#fff'; el.style.borderColor='#ff2d78'; el.style.boxShadow='0 0 28px rgba(255,45,120,0.25)'; }}
                    onMouseLeave={e => { if (loading) return; const el = e.currentTarget as HTMLElement; el.style.background='#fff'; el.style.color='#000'; el.style.borderColor='transparent'; el.style.boxShadow='none'; }}>
                    🚀 Generate README & Diagram
                  </motion.button>
                )}
              </div>

              {step === STEPS.length && (
                <p style={{ fontSize: 12, color: '#444', textAlign: 'center', marginTop: 12, fontWeight: 500 }}>
                  Takes 15–25 seconds · Nothing is stored · Uses your GitHub OAuth token
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}