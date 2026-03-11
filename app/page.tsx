'use client';

import { useEffect, useRef, useState } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useInView,
} from 'framer-motion';

import type { Easing } from 'framer-motion';
const ease = "easeInOut" as const;
const stagger = (delay = 0) => ({
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease, delay } },
});

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.11, delayChildren: 0.05 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
};

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div ref={ref} initial="hidden" animate={inView ? 'show' : 'hidden'} variants={stagger(delay)}>
      {children}
    </motion.div>
  );
}

function LogoMark({ size = 30 }: { size?: number }) {
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

// Glassmorphism style helper
const glass = {
  background: 'rgba(255,255,255,0.05)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 40px rgba(0,0,0,0.4)',
} as const;

const glassHover = {
  background: 'rgba(255,255,255,0.09)',
  border: '1px solid rgba(255,45,120,0.35)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 24px 48px rgba(0,0,0,0.5)',
} as const;

export default function Home() {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const cx = useSpring(0, { stiffness: 120, damping: 18 });
  const cy = useSpring(0, { stiffness: 120, damping: 18 });
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.22], [1, 0]);
  const heroY       = useTransform(scrollYProgress, [0, 0.22], [0, -50]);
  const bar         = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  useEffect(() => {
    let lenis: unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
     import('lenis').then(({ default: Lenis }: any) => {
      lenis = new Lenis({ lerp: 0.08, smoothWheel: true } as never);
      const raf = (t: number) => { (lenis as { raf:(t:number)=>void }).raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    });
    const onMouse = (e: MouseEvent) => { setMouse({ x: e.clientX, y: e.clientY }); cx.set(e.clientX); cy.set(e.clientY); };
    window.addEventListener('mousemove', onMouse);
    return () => { window.removeEventListener('mousemove', onMouse); if (lenis) (lenis as { destroy:()=>void }).destroy(); };
  }, [cx, cy]);

  const features = [
    { step: '01', title: 'Paste Any GitHub URL',      desc: 'Drop any public repository link. IntentMesh reads the codebase, languages, topics, and contributors in real time.',               icon: '⌘' },
    { step: '02', title: 'AI Maps Your Architecture', desc: 'Our inference engine automatically detects frontend, backend, database, and caching layers — no manual input needed.',              icon: '◈' },
    { step: '03', title: 'Get Everything Instantly',  desc: 'Professional README, architecture diagram, contributor profiles, and outreach emails — all generated in under 10 seconds.',        icon: '✦' },
  ];

  const outputs = [
    { label: 'Architecture Diagram', desc: 'Auto-generated visual system map',   icon: '❋' },
    { label: 'README.md',            desc: 'Production-ready documentation',      icon: '◎' },
    { label: 'Contributor List',     desc: 'Top contributors with profiles',      icon: '◉' },
    { label: 'Outreach Email',       desc: 'Invite collaborators professionally', icon: '⊕' },
    { label: 'Folder Blueprint',     desc: 'Structured project layout',           icon: '⊞' },
    { label: 'Tech Stack Map',       desc: 'Layer-by-layer breakdown',            icon: '◈' },
  ];

  const stats = [
    { num: '6',   suffix: '+', label: 'Outputs per analysis'    },
    { num: '<10', suffix: 's', label: 'Average generation time' },
    { num: '0',   suffix: '',  label: 'Manual inputs required'  },
  ];

  const navLinks = [
    { label: 'How it works',       href: '#how-it-works' },
    { label: 'Outputs',            href: '#outputs'      },
    { label: 'GitHub Integration', href: '#github'       },
  ];

  const endpoints = [
    '/repos/{owner}/{repo}',
    '/repos/{owner}/{repo}/languages',
    '/repos/{owner}/{repo}/contributors',
  ];

  const ghStats = [
    { label: 'Repository metadata',    value: '8',  unit: 'fields'   },
    { label: 'Languages detected',     value: '13', unit: 'avg'      },
    { label: 'Top contributors',       value: '10', unit: 'profiles' },
    { label: 'API calls per analysis', value: '3',  unit: 'parallel' },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --pink:       #ff2d78;
          --off-white:  #dddddd;
          --muted:      #888888;
        }
        html { scroll-behavior: auto; }
        body {
          font-family: 'Nunito', sans-serif;
          background: #000;
          color: #fff;
          overflow-x: hidden;
          cursor: none;
        }
        /* ambient glow blobs */
        body::before {
          content: '';
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background:
            radial-gradient(ellipse 80% 50% at 20%   0%, rgba(255,45,120,0.09) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 100%, rgba(255,45,120,0.07) 0%, transparent 60%),
            radial-gradient(ellipse 40% 40% at 60%  40%, rgba(255,45,120,0.04) 0%, transparent 60%);
        }
        a, button { cursor: none; text-decoration: none; }

        /* ── NAV LINKS ── */
        .nl { color: var(--off-white); font-size: 14px; font-weight: 600; transition: color .2s; white-space: nowrap; }
        .nl:hover { color: #fff; }

        .nav-cta {
          background: #fff; color: #000;
          padding: 9px 22px; border-radius: 100px;
          font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 13px;
          border: 2px solid transparent; transition: all .25s ease; white-space: nowrap;
        }
        .nav-cta:hover { background: #000; color: #fff; border-color: var(--pink); box-shadow: 0 0 20px rgba(255,45,120,.25); }

        /* ── BUTTONS ── */
        .btn-p {
          background: #fff; color: #000;
          padding: 14px 32px; border-radius: 100px;
          font-family: 'Nunito', sans-serif; font-size: 15px; font-weight: 700;
          border: 2px solid transparent; transition: all .25s ease; display: inline-block;
        }
        .btn-p:hover { background: #000; color: #fff; border-color: var(--pink); box-shadow: 0 0 28px rgba(255,45,120,.25); }

        .btn-s {
          background: rgba(255,255,255,.05); color: #fff;
          padding: 14px 32px; border-radius: 100px;
          font-family: 'Nunito', sans-serif; font-size: 15px; font-weight: 600;
          border: 1.5px solid rgba(255,255,255,.14); transition: all .25s ease; display: inline-block;
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        }
        .btn-s:hover { background: #000; border-color: var(--pink); box-shadow: 0 0 24px rgba(255,45,120,.2); }

        /* ── HERO ── */
        .hero {
          min-height: 100vh; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          text-align: center; padding: 140px 24px 100px;
          position: relative; z-index: 1; overflow: hidden;
        }
        .hero-grid {
          position: absolute; inset: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
          background-size: 64px 64px;
          mask-image: radial-gradient(ellipse 70% 70% at 50% 40%, black 20%, transparent 80%);
        }

        /* ── TERMINAL ── */
        .terminal-body { padding: 28px; font-size: 13.5px; line-height: 2.1; text-align: left; font-weight: 600; }
        .tp  { color: var(--pink); }
        .tw  { color: #fff; }
        .td  { color: var(--muted); font-weight: 500; }
        .tok { color: #34d399; }

        /* ── SCROLL HINT ── */
        @keyframes pulse { 0%,100%{opacity:1;transform:scaleY(1)} 50%{opacity:.3;transform:scaleY(.5)} }
        .pulse { animation: pulse 2s ease-in-out infinite; transform-origin: top; }

        /* ── SECTION COMMON ── */
        .section { position:relative; z-index:1; padding:120px 24px; max-width:1100px; margin:0 auto; scroll-margin-top:80px; }
        .s-label { font-size:11px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:var(--pink); margin-bottom:16px; }
        .s-title { font-size:clamp(36px,4vw,56px); font-weight:900; letter-spacing:-2px; line-height:1.0; margin-bottom:16px; color:#fff; }
        .s-sub   { font-size:16px; color:var(--off-white); max-width:480px; line-height:1.7; font-weight:500; }

        /* ── STEPS ── */
        .step-card { display:grid; grid-template-columns:72px 1fr 48px; align-items:center; gap:32px; padding:36px 40px; border-radius:18px; transition: all .3s; }
        .step-card:hover { transform: translateX(6px); }
        .step-num { font-size:11px; font-weight:800; letter-spacing:2px; color:var(--pink); }
        .step-card h3 { font-size:19px; font-weight:800; letter-spacing:-.4px; margin-bottom:8px; color:#fff; }
        .step-card p  { font-size:14.5px; color:var(--off-white); line-height:1.65; font-weight:500; }
        .step-icon { font-size:28px; opacity:.2; text-align:right; transition:opacity .3s; }
        .step-card:hover .step-icon { opacity:.7; }

        /* ── OUTPUT CARDS ── */
        .out-icon { font-size:28px; margin-bottom:20px; display:block; color:rgba(255,255,255,.4); transition:all .3s; }
        .output-card:hover .out-icon { color:var(--pink); transform:scale(1.1); }
        .output-card h3 { font-size:16px; font-weight:800; letter-spacing:-.3px; margin-bottom:6px; color:#fff; }
        .output-card p  { font-size:13px; color:var(--off-white); font-weight:500; }

        /* ── GITHUB ── */
        .endpoint { display:flex; align-items:center; gap:12px; padding:14px 18px; border-radius:12px; font-size:13px; font-weight:600; color:var(--off-white); font-family:monospace; transition: all .2s; }
        .endpoint:hover { border-color: rgba(255,45,120,.35) !important; transform: translateX(4px); }
        .ep-method { color:var(--pink); font-size:11px; font-weight:800; letter-spacing:1px; min-width:36px; }
        .gh-row { display:flex; align-items:center; justify-content:space-between; padding:20px 24px; border-radius:14px; transition: border-color .2s; }
        .gh-row:hover { border-color: rgba(255,45,120,.3) !important; }
        .gh-label { font-size:13px; color:var(--off-white); font-weight:600; }
        .gh-val   { font-size:18px; font-weight:900; color:#fff; letter-spacing:-.5px; }
        .gh-val span { color:var(--pink); }

        /* ── DIVIDER ── */
        .divider { width:100%; max-width:1100px; margin:0 auto; height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent); position:relative; z-index:1; }

        /* ── FOOTER ── */
        footer { border-top:1px solid rgba(255,255,255,.06); padding:36px 48px; display:flex; align-items:center; justify-content:space-between; position:relative; z-index:1; }

        ::-webkit-scrollbar { width:3px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,45,120,.4); border-radius:4px; }
      `}</style>

      {/* Progress bar */}
      <motion.div style={{ position:'fixed', top:0, left:0, height:2, background:'#ff2d78', zIndex:9999, width: bar }} />

      {/* Cursor dot */}
      <motion.div style={{ position:'fixed', width:6, height:6, background:'#ff2d78', borderRadius:'50%', pointerEvents:'none', zIndex:9999, x: mouse.x-3, y: mouse.y-3 }} />
      {/* Cursor ring */}
      <motion.div style={{ position:'fixed', width:36, height:36, border:'1.5px solid rgba(255,45,120,.45)', borderRadius:'50%', pointerEvents:'none', zIndex:9998, x:cx, y:cy, translateX:'-50%', translateY:'-50%' }} />

      {/* ══════════════════════════════════════════════
          NAV  —  logo | links centered | cta
      ══════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity:0, y:-20 }}
        animate={{ opacity:1, y:0 }}
        transition={{ duration:.7, ease }}
        style={{
          position:'fixed', top:16, left:'50%', transform:'translateX(-50%)',
          zIndex:500, width:'calc(100% - 48px)', maxWidth:1000,
          borderRadius:20,
          ...glass,
          background:'rgba(0,0,0,0.55)',
          backdropFilter:'blur(28px)',
          WebkitBackdropFilter:'blur(28px)',
        }}
      >
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', alignItems:'center', padding:'0 24px', height:56 }}>

          {/* Left — Logo */}
          <a href="/" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <LogoMark size={28} />
            <span style={{ fontSize:17, fontWeight:800, letterSpacing:-.5, color:'#fff' }}>
              Intent<span style={{ color:'#ff2d78' }}>Mesh</span>
            </span>
          </a>

          {/* Centre — Nav links */}
          <div style={{ display:'flex', alignItems:'center', gap:36 }}>
            {navLinks.map(l => (
              <a key={l.label} href={l.href} className="nl">{l.label}</a>
            ))}
          </div>

          {/* Right — CTA */}
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            <motion.a href="/analyze" className="nav-cta" whileHover={{ scale:1.03 }} whileTap={{ scale:.97 }}>
              Get Started →
            </motion.a>
          </div>

        </div>
      </motion.div>

      {/* ══════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════ */}
      <motion.div className="hero" style={{ opacity: heroOpacity, y: heroY }}>
        <div className="hero-grid" />

        <motion.div style={{ display:'inline-flex', alignItems:'center', gap:12, marginBottom:36 }} variants={stagger(0)} initial="hidden" animate="show">
          <span style={{ width:36, height:1, background:'#ff2d78', display:'block' }} />
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:3, textTransform:'uppercase', color:'#ff2d78' }}>The future of project onboarding</span>
          <span style={{ width:36, height:1, background:'#ff2d78', display:'block' }} />
        </motion.div>

        <motion.h1
          style={{ fontSize:'clamp(56px,9vw,108px)', fontWeight:900, lineHeight:.95, letterSpacing:-4, color:'#fff' }}
          variants={stagger(0.1)} initial="hidden" animate="show"
        >
          Your codebase,
          <span style={{ display:'block', color:'transparent', WebkitTextStroke:'1.5px rgba(255,255,255,0.28)' }}>
            finally <span style={{ color:'#ff2d78', WebkitTextStroke:0 }}>understood.</span>
          </span>
        </motion.h1>

        <motion.p
          style={{ fontSize:'clamp(16px,2vw,19px)', fontWeight:500, color:'#ddd', maxWidth:560, lineHeight:1.7, margin:'32px auto 48px' }}
          variants={stagger(0.2)} initial="hidden" animate="show"
        >
          Stop spending days writing docs for what already exists. IntentMesh reads any GitHub repository and instantly delivers{' '}
          <strong style={{ color:'#fff', fontWeight:700 }}>architecture diagrams, professional READMEs, and contributor insights.</strong>
        </motion.p>

        <motion.div style={{ display:'flex', gap:12, alignItems:'center' }} variants={stagger(0.3)} initial="hidden" animate="show">
          <motion.a href="/analyze" className="btn-p" whileHover={{ y:-2 }} whileTap={{ scale:.97 }}>Analyze a Repository →</motion.a>
          <motion.a href="/create"  className="btn-s" whileHover={{ y:-2 }} whileTap={{ scale:.97 }}>Start From Scratch</motion.a>
        </motion.div>

        {/* Terminal */}
        <motion.div
          variants={stagger(0.45)} initial="hidden" animate="show"
          style={{ marginTop:72, width:'100%', maxWidth:680, borderRadius:20, overflow:'hidden', ...glass, background:'rgba(255,255,255,0.04)', boxShadow:'0 40px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.07)' }}
        >
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'14px 20px', borderBottom:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.03)' }}>
            {[['#FF5F57'],['#FFBD2E'],['#28C840']].map(([c],i) => <span key={i} style={{ width:11,height:11,borderRadius:'50%',background:c,display:'block' }} />)}
            <span style={{ flex:1, textAlign:'center', fontSize:12, color:'#888', fontWeight:600 }}>intentmesh.vercel.app/analyze</span>
          </div>
          <div className="terminal-body">
            <div><span className="tp">›</span> &nbsp;<span className="tw">Analyzing</span> <span className="td">github.com/vercel/next.js</span></div>
            <div><span className="tp">✓</span> &nbsp;GitHub data fetched <span className="td">— 138k ★ · 13 languages · 10 contributors</span></div>
            <div><span className="tp">✓</span> &nbsp;Architecture inferred <span className="td">— React/Next.js · Python · Vercel</span></div>
            <div><span className="tp">✓</span> &nbsp;Mermaid diagram generated <span className="td">— 8 nodes · 3 layers</span></div>
            <div><span className="tp">✓</span> &nbsp;README generated <span className="td">— 6 sections · badges included</span></div>
            <div><span className="tok">✓</span> &nbsp;<span className="tw">All outputs ready.</span> <span className="td">Completed in 6.4s</span></div>
          </div>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          style={{ position:'absolute', bottom:36, left:'50%', transform:'translateX(-50%)', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}
          initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:1.8, duration:1 }}
        >
          <span style={{ fontSize:10, fontWeight:700, letterSpacing:3, textTransform:'uppercase', color:'#666' }}>Scroll to explore</span>
          <div className="pulse" style={{ width:1, height:56, background:'linear-gradient(to bottom, rgba(255,45,120,0.9), transparent)' }} />
        </motion.div>
      </motion.div>

      {/* ══════════════════════════════════════════════
          STATS
      ══════════════════════════════════════════════ */}
      <motion.div
        style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, maxWidth:1100, margin:'0 auto', padding:'0 24px', position:'relative', zIndex:1 }}
        variants={containerVariants} initial="hidden" whileInView="show" viewport={{ once:true, margin:'-80px' }}
      >
        {stats.map(s => (
          <motion.div
            key={s.label} variants={cardVariants}
            style={{ padding:'40px 32px', borderRadius:20, textAlign:'center', ...glass }}
          >
            <div style={{ fontSize:52, fontWeight:900, letterSpacing:-3, color:'#fff', lineHeight:1, marginBottom:10 }}>
              {s.num}<span style={{ color:'#ff2d78' }}>{s.suffix}</span>
            </div>
            <div style={{ fontSize:13, color:'#ddd', fontWeight:600 }}>{s.label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* ══════════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════════ */}
      <div className="section" id="how-it-works">
        <Reveal>
          <p className="s-label">How it works</p>
          <h2 className="s-title">Three steps.<br />Zero friction.</h2>
          <p className="s-sub">No config, no manual setup. IntentMesh does the heavy lifting so your team moves faster from day one.</p>
        </Reveal>

        <motion.div style={{ marginTop:64, display:'flex', flexDirection:'column', gap:10 }} variants={containerVariants} initial="hidden" whileInView="show" viewport={{ once:true, margin:'-60px' }}>
          {features.map(f => (
            <motion.div
              key={f.step} className="step-card" variants={cardVariants}
              style={{ ...glass }}
              whileHover={{ x:6, ...glassHover, transition:{ duration:.2 } }}
            >
              <span className="step-num">{f.step}</span>
              <div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
              <span className="step-icon">{f.icon}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div className="divider" />

      {/* ══════════════════════════════════════════════
          OUTPUTS
      ══════════════════════════════════════════════ */}
      <div className="section" id="outputs">
        <Reveal>
          <p className="s-label">What you get</p>
          <h2 className="s-title">Everything.<br />In one place.</h2>
          <p className="s-sub">Six production-ready outputs — automatically generated from your codebase. No prompting required.</p>
        </Reveal>

        <motion.div
          style={{ marginTop:64, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}
          variants={containerVariants} initial="hidden" whileInView="show" viewport={{ once:true, margin:'-60px' }}
        >
          {outputs.map(o => (
            <motion.div
              key={o.label} className="output-card" variants={cardVariants}
              style={{ padding:'36px 28px', borderRadius:18, ...glass }}
              whileHover={{ y:-4, ...glassHover, transition:{ duration:.2 } }}
            >
              <span className="out-icon">{o.icon}</span>
              <h3>{o.label}</h3>
              <p>{o.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div className="divider" />

      {/* ══════════════════════════════════════════════
          GITHUB INTEGRATION
      ══════════════════════════════════════════════ */}
      <div className="section" id="github">
        <Reveal>
          <p className="s-label">GitHub Integration</p>
          <h2 className="s-title">Powered by the<br />GitHub API.</h2>
          <p className="s-sub">IntentMesh pulls live data directly from GitHub — no copy-pasting, no manual input. Just the URL.</p>
        </Reveal>

        <motion.div
          style={{ marginTop:64, padding:'56px 48px', borderRadius:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:64, alignItems:'center', ...glass }}
          initial={{ opacity:0, y:32 }} whileInView={{ opacity:1, y:0 }} viewport={{ once:true, margin:'-60px' }}
          transition={{ duration:.7, ease }}
        >
          {/* Left */}
          <div>
            <p style={{ fontSize:15, color:'#ddd', fontWeight:600, lineHeight:1.7, marginBottom:24 }}>
              We query three GitHub endpoints in parallel — making the entire analysis complete in milliseconds, not seconds.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {endpoints.map(ep => (
                <motion.div
                  key={ep} className="endpoint"
                  style={{ ...glass, background:'rgba(255,255,255,0.04)' }}
                  whileHover={{ x:4, borderColor:'rgba(255,45,120,0.35)', transition:{ duration:.2 } }}
                >
                  <span className="ep-method">GET</span>
                  <span>{ep}</span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Right */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {ghStats.map(s => (
              <motion.div
                key={s.label} className="gh-row"
                style={{ ...glass, background:'rgba(255,255,255,0.04)' }}
                whileHover={{ borderColor:'rgba(255,45,120,0.3)', transition:{ duration:.2 } }}
              >
                <span className="gh-label">{s.label}</span>
                <span className="gh-val">{s.value} <span>{s.unit}</span></span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ══════════════════════════════════════════════
          CTA
      ══════════════════════════════════════════════ */}
      <div style={{ textAlign:'center', padding:'100px 24px 160px', position:'relative', zIndex:1 }}>
        <Reveal>
          <div style={{ maxWidth:680, margin:'0 auto', padding:'72px 56px', borderRadius:28, ...glass, boxShadow:'inset 0 1px 0 rgba(255,255,255,0.08), 0 60px 120px rgba(0,0,0,0.5), 0 0 80px rgba(255,45,120,0.06)' }}>
            <h2 style={{ fontSize:'clamp(36px,5vw,58px)', fontWeight:900, letterSpacing:-2.5, marginBottom:20, lineHeight:1.0, color:'#fff' }}>
              Your next project<br />starts <em style={{ fontStyle:'normal', color:'#ff2d78' }}>here.</em>
            </h2>
            <p style={{ fontSize:16, color:'#ddd', marginBottom:44, lineHeight:1.7, fontWeight:500 }}>
              Whether you're onboarding onto an existing codebase or starting fresh — IntentMesh gives you the clarity to move fast from day one.
            </p>
            <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
              <motion.a href="/analyze" className="btn-p" style={{ fontSize:16, padding:'16px 40px' }} whileHover={{ y:-2 }} whileTap={{ scale:.97 }}>Analyze a Repository →</motion.a>
              <motion.a href="/create"  className="btn-s" style={{ fontSize:16, padding:'16px 40px' }} whileHover={{ y:-2 }} whileTap={{ scale:.97 }}>Create New Project</motion.a>
            </div>
          </div>
        </Reveal>
      </div>

      {/* ══════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════ */}
      <footer>
        <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:15, fontWeight:800, color:'#fff' }}>
          <LogoMark size={20} />
          IntentMesh
        </div>
        <span style={{ fontSize:13, color:'#888', fontWeight:500 }}>Powered by Groq LLM + GitHub API. Built for developers.</span>
      </footer>
    </>
  );
}