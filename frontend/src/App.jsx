import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";

/**
 * App.jsx
 * Modern news frontend:
 * - Fetches /api/news
 * - Loading skeletons
 * - Debounced search
 * - Dark mode toggle saved in localStorage
 * - Favorites saved in localStorage
 * - Responsive glass cards with hover effects
 * - Accessible buttons / links
 * - Error handling and refresh
 */

/* ---------- Configuration ---------- */
const API_PATH = "/api/news";
const STORAGE_KEYS = {
  THEME: "corriere_theme",
  FAVS: "corriere_favs",
};
const DEBOUNCE_MS = 250;
const AUTO_REFRESH_MS = 1000 * 60 * 5; // 5 minutes

/* ---------- Utilities ---------- */
const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const loadJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const saveJSON = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
};

/* ---------- SVG Icons ---------- */
const IconRefresh = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M21 12a9 9 0 10-3.4 6.8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M21 3v6h-6"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const IconSun = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);
const IconMoon = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const IconHeart = ({ filled = false, className = "w-5 h-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M20.8 7.6a5.4 5.4 0 00-7.6 0L12 8.8l-1.2-1.2a5.4 5.4 0 10-7.6 7.6L12 22l8.8-8.8a5.4 5.4 0 000-7.6z" />
  </svg>
);

/* ---------- Component ---------- */
export default function App() {
  // Data
  const [news, setNews] = useState([]);
  const [scrapedAt, setScrapedAt] = useState(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef(null);

  // Theme and favorites
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    if (saved) return saved === "dark";
    // default to system preference
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  });
  const [favs, setFavs] = useState(
    () => new Set(loadJSON(STORAGE_KEYS.FAVS, [])),
  );

  // Fetch function
  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API_PATH, { cache: "no-store" });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json = await res.json();
      setNews(Array.isArray(json.news) ? json.news : []);
      setScrapedAt(json.scraped_at || null);
    } catch (err) {
      setError(err.message || "Failed to load news");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + periodic refresh
  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchNews]);

  // Persist theme & apply to document
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.THEME, dark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // Persist favorites when changed
  useEffect(() => {
    saveJSON(STORAGE_KEYS.FAVS, Array.from(favs));
  }, [favs]);

  // Debounce search query
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase());
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Filtered news computed
  const filtered = useMemo(() => {
    if (!debouncedQuery) return news;
    return news.filter((item) => {
      const hay = `${item.title} ${item.description || ""}`.toLowerCase();
      return hay.includes(debouncedQuery);
    });
  }, [news, debouncedQuery]);

  // Toggle favorite
  const toggleFav = (link) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(link)) next.delete(link);
      else next.add(link);
      return next;
    });
  };

  // Helpers for UI
  const handleRefresh = async () => {
    await fetchNews();
  };

  // keyboard: press "/" to focus search
  const searchRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- Render Helpers ---------- */
  const SkeletonCard = ({ keyIndex }) => (
    <article
      key={`skeleton-${keyIndex}`}
      className="card skeleton"
      aria-hidden="true"
      style={{
        minHeight: 220,
      }}
    >
      <div className="skeleton-media" />
      <div className="skeleton-body">
        <div className="skeleton-line short" />
        <div className="skeleton-line medium" />
        <div className="skeleton-line long" />
      </div>
    </article>
  );

  return (
    <div className={`app-root ${dark ? "theme-dark" : "theme-light"}`}>
      {/* Particle / subtle background effect */}
      <div className="bg-particles" aria-hidden />

      <header className="topbar" role="banner">
        <div className="topbar-inner">
          <div className="brand" aria-hidden>
            <span className="logo">📰</span>
            <div>
              <h1 className="brand-title">Corriere News</h1>
              <p className="brand-sub">Latest headlines — scraped</p>
            </div>
          </div>

          <div className="controls">
            <div className="search-wrap">
              <label htmlFor="search" className="visually-hidden">
                Cerca notizie
              </label>
              <input
                id="search"
                ref={searchRef}
                className="search"
                type="search"
                placeholder="Cerca per titolo o descrizione (premi '/' per cercare)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Cerca notizie"
              />
              {query && (
                <button
                  className="btn-clear"
                  onClick={() => setQuery("")}
                  aria-label="Cancella ricerca"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="error-banner" role="alert">
            <strong>Errore:</strong> {error}
            <button className="btn-link" onClick={() => fetchNews()}>
              Riprova
            </button>
          </div>
        )}
      </header>

      <main className="content" role="main">
        {loading ? (
          <section className="grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} keyIndex={i} />
            ))}
          </section>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <p className="empty-title">Nessuna notizia trovata</p>
            <p className="empty-sub">
              Prova a rimuovere i filtri o aggiorna la pagina.
            </p>
            <button
              className="btn big"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              Pulisci ricerca
            </button>
          </div>
        ) : (
          <section className="grid" aria-live="polite">
            {filtered.map((item, idx) => {
              const isFav = favs.has(item.link);
              return (
                <article
                  key={item.link || idx}
                  className="card"
                  tabIndex={0}
                  aria-label={item.title}
                >
                  <div
                    className="card-media"
                    role="img"
                    aria-hidden
                    style={{
                      backgroundImage: item.image_url
                        ? `url(${item.image_url})`
                        : undefined,
                    }}
                  >
                    {!item.image_url && <div className="placeholder"></div>}
                    <a
                      className="media-link"
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Apri articolo: ${item.title}`}
                    />
                    <div className="media-overlay">
                      <h3 className="card-title">{item.title}</h3>
                    </div>
                  </div>

                  <div className="card-body">
                    <p className="card-desc">{item.description || ""}</p>

                    <div className="card-row">
                      <a
                        className="read-link"
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Leggi su Corriere: ${item.title}`}
                      >
                        Leggi articolo
                      </a>

                      <div className="meta">
                        <button
                          className={`fav-btn ${isFav ? "fav--on" : ""}`}
                          onClick={() => toggleFav(item.link)}
                          aria-pressed={isFav}
                          aria-label={
                            isFav
                              ? "Rimuovi dai preferiti"
                              : "Aggiungi ai preferiti"
                          }
                          title={
                            isFav
                              ? "Rimosso dai preferiti"
                              : "Aggiungi ai preferiti"
                          }
                        >
                          <IconHeart filled={isFav} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      <footer className="footer" role="contentinfo">
        <div>
          <small>Corriere Scraper • Frontend</small>
        </div>
        <div>
          <small>Powered by your local scraper • {formatDate(scrapedAt)}</small>
        </div>
      </footer>

      {/* Minimal inline styles to ensure basic layout if CSS is missing.
          The app expects a richer CSS file (index.css) for glass effects; these inline rules
          help keep the layout functional even if external CSS didn't load. */}
      <style>{`
        :root { --bg: #0f1724; --card-bg: rgba(255,255,255,0.03); --glass: rgba(255,255,255,0.04); --muted: #9aa4b2; --accent: #5b8cff; --radius: 18px; --glass-border: rgba(255,255,255,0.06); }
        .theme-light { --bg: linear-gradient(180deg,#f6f8ff,#eef2ff); color: #0b1220; --card-bg: rgba(255,255,255,0.72); --glass: rgba(255,255,255,0.7); --glass-border: rgba(16,24,40,0.06); --muted: #374151; }
        .theme-dark { background: radial-gradient(1200px 600px at 10% 10%, rgba(91,140,255,0.06), transparent), radial-gradient(600px 400px at 90% 90%, rgba(99,102,241,0.04), transparent); color: #e6eefc; }
        .app-root { min-height: 100vh; background: var(--bg); display: flex; flex-direction: column; font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; }
        .bg-particles { position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: 0.06; background-image: radial-gradient(circle at 20% 20%, rgba(91,140,255,0.12) 0 2px, transparent 2px), radial-gradient(circle at 80% 80%, rgba(99,102,241,0.10) 0 2px, transparent 2px); }
        .topbar { position: sticky; top: 0; z-index: 40; backdrop-filter: blur(6px); padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.03); }
        .topbar-inner { max-width: 1200px; margin: 0 auto; display:flex; gap:16px; align-items:center; justify-content:space-between; }
        .brand { display:flex; gap:12px; align-items:center; }
        .logo { font-size:28px; display:inline-block; padding:8px; border-radius:10px; background: linear-gradient(135deg, rgba(91,140,255,0.12), rgba(99,102,241,0.08)); }
        .brand-title { margin:0; font-size:16px; font-weight:700; letter-spacing:-0.2px; }
        .brand-sub { margin:0; font-size:12px; color:var(--muted); }
        .controls { display:flex; gap:12px; align-items:center; }
        .search-wrap { position:relative; display:flex; align-items:center; }
        .search { width:320px; max-width:40vw; padding:10px 12px; border-radius: 999px; border:1px solid var(--glass-border); background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)); color:inherit; outline:none; }
        .search::placeholder { color: rgba(200,200,210,0.6); }
        .btn-clear { position:absolute; right:6px; background:transparent; border:none; padding:6px; cursor:pointer; color:var(--muted); }
        .stat-wrap { display:flex; gap:8px; align-items:center; color:var(--muted); font-size:13px; }
        .stat { display:flex; flex-direction:column; align-items:flex-end; gap:2px; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", monospace; font-size:12px; color:var(--muted); }
        .btns { display:flex; gap:8px; align-items:center; }
        .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:8px 10px; border-radius:10px; border:1px solid transparent; background:transparent; cursor:pointer; color:inherit; }
        .btn.refresh { border-color: rgba(255,255,255,0.03); }
        .btn.theme-toggle { border-color: rgba(255,255,255,0.03); }
        .error-banner { margin-top:8px; background: rgba(255,40,40,0.06); color:#ffb3b3; padding:10px; border-radius:12px; border:1px solid rgba(255,40,40,0.08); max-width:1200px; margin-left:auto; margin-right:auto; }
        .content { max-width:1200px; margin:22px auto; padding:0 18px 64px; z-index:10; width:100%; }
        .grid { display:grid; grid-template-columns: repeat(1, minmax(0,1fr)); gap:18px; }
        @media(min-width:680px) { .grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
        @media(min-width:1080px) { .grid { grid-template-columns: repeat(3, minmax(0,1fr)); } }

        .card { position:relative; border-radius:16px; overflow:hidden; background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)); border:1px solid var(--glass-border); box-shadow: 0 6px 28px rgba(2,6,23,0.4); transition: transform .26s ease, box-shadow .26s ease; display:flex; flex-direction:column; min-height:220px; }
        .card:focus { outline: 3px solid rgba(91,140,255,0.18); transform: translateY(-6px) scale(1.02); }
        .card:hover { transform: translateY(-6px) scale(1.02); box-shadow: 0 18px 50px rgba(19,38,76,0.46); }
        .card-media { position:relative; height:160px; background-size:cover; background-position:center; display:block; }
        .card-media .placeholder { display:flex; align-items:center; justify-content:center; height:100%; color:var(--muted); font-size:13px; background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)); }
        .media-link { position:absolute; inset:0; z-index:5; }
        .media-overlay { position:absolute; left:0; right:0; bottom:0; padding:14px; background: linear-gradient(180deg, transparent 10%, rgba(2,6,23,0.6)); color:white; display:flex; align-items:flex-end; z-index:6; }
        .card-title { margin:0; font-size:15px; font-weight:700; line-height:1.2; text-shadow: 0 4px 18px rgba(2,6,23,0.6); }
        .card-body { padding:14px; display:flex; flex-direction:column; gap:12px; flex:1; }
        .card-desc { margin:0; color:var(--muted); font-size:14px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
        .card-row { display:flex; justify-content:space-between; align-items:center; gap:12px; }
        .read-link { background: linear-gradient(90deg,var(--accent), #7b9cff); color:white; padding:8px 12px; border-radius:10px; text-decoration:none; font-weight:600; font-size:13px; box-shadow: 0 6px 18px rgba(91,140,255,0.12); }
        .fav-btn { background:transparent; border:none; padding:8px; border-radius:10px; color:var(--muted); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
        .fav--on { color: #ff6b88; text-shadow: 0 6px 18px rgba(255,107,136,0.08); }
        .skeleton { animation: pulse 1.2s linear infinite; background: linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.04), rgba(255,255,255,0.02)); }
        .skeleton-media { height:140px; background: linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.04)); }
        .skeleton-body { padding:12px; display:flex; flex-direction:column; gap:8px; }
        .skeleton-line { height:12px; border-radius:8px; background: linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.03)); }
        .skeleton-line.short { width:40%; }
        .skeleton-line.medium { width:70%; }
        .skeleton-line.long { width:90%; }

        .empty { text-align:center; padding:48px 12px; color:var(--muted); }
        .empty-title { font-size:20px; margin-bottom:8px; }
        .footer { border-top: 1px solid rgba(255,255,255,0.03); padding:18px; display:flex; justify-content:space-between; gap:12px; max-width:1200px; margin:0 auto; color:var(--muted); font-size:13px; }

        @keyframes pulse { 0%{ opacity:0.95 } 50%{ opacity:0.8 } 100%{ opacity:0.95 } }
        .visually-hidden { position:absolute !important; height:1px; width:1px; overflow:hidden; clip:rect(1px,1px,1px,1px); white-space:nowrap; }
      `}</style>
    </div>
  );
}
