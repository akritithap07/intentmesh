'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn, signOut } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  private: boolean;
  stargazers_count: number;
  updated_at: string;
  owner: { login: string };
}

interface SelectedRepo {
  url: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  private: boolean;
  owner: string;
}

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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function AnalyzePage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [urlInput, setUrlInput]         = useState('');
  const [urlError, setUrlError]         = useState('');
  const [myRepos, setMyRepos]           = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError]     = useState('');
  const [searchQuery, setSearchQuery]   = useState('');
  const [tab, setTab]                   = useState<'url' | 'repos'>('url');

  useEffect(() => {
    if (status === 'authenticated' && session?.accessToken) {
      setReposLoading(true);
      fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
        .then(r => r.json())
        .then((data: GitHubRepo[]) => {
          if (Array.isArray(data)) setMyRepos(data);
          else setReposError('Could not load repositories.');
        })
        .catch(() => setReposError('Failed to load repositories.'))
        .finally(() => setReposLoading(false));
    }
  }, [status, session]);

  const selectRepo = (repo: GitHubRepo) => {
    const payload: SelectedRepo = {
      url: repo.html_url,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      language: repo.language,
      private: repo.private,
      owner: repo.owner.login,
    };
    sessionStorage.setItem('intentmesh_selected_repo', JSON.stringify(payload));
    router.push('/analyze/questions');
  };

  const handleUrlSubmit = () => {
    setUrlError('');
    const trimmed = urlInput.trim();
    const match = trimmed.match(/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/\s?#]+)/);
    if (!match) {
      setUrlError('Please enter a valid GitHub repository URL (e.g. github.com/owner/repo).');
      return;
    }
    const owner = match[1];
    const name  = match[2].replace(/\.git$/, '');
    const payload: SelectedRepo = {
      url: `https://github.com/${owner}/${name}`,
      name,
      fullName: `${owner}/${name}`,
      description: null,
      language: null,
      private: false,
      owner,
    };
    sessionStorage.setItem('intentmesh_selected_repo', JSON.stringify(payload));
    router.push('/analyze/questions');
  };

  const filteredRepos = myRepos.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { font-family: 'Nunito', sans-serif; background: #000; color: #fff; min-height: 100vh; overflow-x: hidden; cursor: none; }
        body::before {
          content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background:
            radial-gradient(ellipse 60% 50% at 20% 10%, rgba(255,45,120,0.09) 0%, transparent 60%),
            radial-gradient(ellipse 50% 50% at 80% 90%, rgba(255,45,120,0.06) 0%, transparent 60%);
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        a, button, input { cursor: none; font-family: 'Nunito', sans-serif; }
        .fi {
          width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px; padding: 16px 20px; font-size: 15px; font-weight: 600; color: #fff;
          outline: none; transition: border-color .2s, box-shadow .2s;
        }
        .fi::placeholder { color: #444; font-weight: 500; }
        .fi:focus { border-color: rgba(255,45,120,0.5); box-shadow: 0 0 0 3px rgba(255,45,120,0.08); background: rgba(255,255,255,0.07); }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,45,120,0.4); border-radius: 4px; }
      `}</style>

      {/* NAV */}
      <motion.div
        initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 100, width: 'calc(100% - 48px)', maxWidth: 760, borderRadius: 20, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(28px)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 56 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <LogoMark size={22} />
            <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>Intent<span style={{ color: '#ff2d78' }}>Mesh</span></span>
          </a>
          {status === 'authenticated' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: '#aaa', fontWeight: 600 }}>{session.user?.name ?? session.user?.email}</span>
              <button onClick={() => signOut()}
                style={{ padding: '7px 16px', borderRadius: 100, fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.05)', color: '#777', border: '1px solid rgba(255,255,255,0.1)' }}>
                Sign out
              </button>
            </div>
          ) : (
            <button onClick={() => signIn('github')}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderRadius: 100, fontSize: 13, fontWeight: 700, background: '#fff', color: '#000', border: 'none' }}>
              Sign in with GitHub
            </button>
          )}
        </div>
      </motion.div>

      <div style={{ paddingTop: 100, paddingBottom: 60, position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px' }}>

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#ff2d78', marginBottom: 12 }}>Step 0 of 4</p>
            <h1 style={{ fontSize: 'clamp(28px,4vw,42px)', fontWeight: 900, color: '#fff', letterSpacing: -1.5, marginBottom: 12 }}>
              Which repository?
            </h1>
            <p style={{ fontSize: 15, color: '#888', fontWeight: 500 }}>Paste a GitHub URL or pick from your repos</p>
          </motion.div>

          {/* Tabs — only shown when authenticated */}
          {status === 'authenticated' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
              style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
              {(['url', 'repos'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  style={{ flex: 1, padding: '10px', borderRadius: 11, fontSize: 13, fontWeight: 700, border: 'none',
                    background: tab === t ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: tab === t ? '#fff' : '#666', transition: 'all .2s' }}>
                  {t === 'url' ? '🔗 Paste URL' : '📁 My Repositories'}
                </button>
              ))}
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {/* URL Tab */}
            {(tab === 'url' || status !== 'authenticated') && (
              <motion.div key="url-tab" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div style={{ padding: '28px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 16 }}>Enter a GitHub repository URL</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input className="fi" type="text" placeholder="https://github.com/owner/repository"
                      value={urlInput}
                      onChange={e => { setUrlInput(e.target.value); setUrlError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
                      style={{ flex: 1 }} />
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={handleUrlSubmit}
                      style={{ padding: '0 28px', borderRadius: 14, fontSize: 14, fontWeight: 800, background: '#fff', color: '#000', border: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      Analyze →
                    </motion.button>
                  </div>
                  <AnimatePresence>
                    {urlError && (
                      <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ fontSize: 13, color: '#ff8080', fontWeight: 600, marginTop: 10 }}>
                        ⚠ {urlError}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  {status !== 'authenticated' && (
                    <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
                      <p style={{ fontSize: 13, color: '#666', fontWeight: 500, marginBottom: 14 }}>Or sign in with GitHub to pick from your repositories</p>
                      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => signIn('github')}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 24px', borderRadius: 100, fontSize: 14, fontWeight: 700, background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
                        Connect GitHub
                      </motion.button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Repos Tab */}
            {tab === 'repos' && status === 'authenticated' && (
              <motion.div key="repos-tab" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div style={{ marginBottom: 16 }}>
                  <input className="fi" type="text" placeholder="Search your repositories…"
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>

                {reposLoading && (
                  <div style={{ textAlign: 'center', padding: '48px 0', color: '#555' }}>
                    <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.08)', borderTopColor: '#ff2d78', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 13, fontWeight: 600 }}>Loading your repositories…</p>
                  </div>
                )}

                {reposError && <p style={{ color: '#ff8080', fontSize: 13, fontWeight: 600, textAlign: 'center', padding: '24px 0' }}>⚠ {reposError}</p>}

                {!reposLoading && !reposError && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
                    {filteredRepos.length === 0
                      ? <p style={{ textAlign: 'center', color: '#555', fontSize: 14, padding: '32px 0', fontWeight: 600 }}>No repositories found.</p>
                      : filteredRepos.map(repo => (
                        <motion.button key={repo.id}
                          whileTap={{ scale: 0.995 }}
                          onClick={() => selectRepo(repo)}
                          style={{ width: '100%', textAlign: 'left', padding: '18px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
                          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,45,120,0.35)'; el.style.background = 'rgba(255,45,120,0.05)'; }}
                          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,0.08)'; el.style.background = 'rgba(255,255,255,0.04)'; }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{repo.name}</span>
                              {repo.private && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: 'rgba(255,255,255,0.06)', color: '#888', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>private</span>
                              )}
                            </div>
                            {repo.description && (
                              <p style={{ fontSize: 12, color: '#666', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '480px' }}>{repo.description}</p>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                            {repo.language && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#ff2d78', padding: '3px 10px', borderRadius: 100, background: 'rgba(255,45,120,0.08)', border: '1px solid rgba(255,45,120,0.2)' }}>{repo.language}</span>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#555', fontSize: 12, fontWeight: 600 }}>
                              ★ {repo.stargazers_count}
                            </div>
                            <span style={{ fontSize: 11, color: '#444', fontWeight: 500 }}>{timeAgo(repo.updated_at)}</span>
                          </div>
                        </motion.button>
                      ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
            style={{ textAlign: 'center', fontSize: 12, color: '#444', fontWeight: 500, marginTop: 28 }}>
            Public & private repositories supported · Nothing is stored · Powered by GitHub OAuth
          </motion.p>
        </div>
      </div>
    </>
  );
}