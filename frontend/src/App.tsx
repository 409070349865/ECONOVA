import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import {
  Activity, ArrowDownToLine, ArrowUpRight, BarChart3, BookOpenText, BrainCircuit, BriefcaseBusiness,
  CalendarDays, Check, ChevronDown, CircleHelp, Coins, Database, FileChartColumn, FlaskConical, Globe2,
  Landmark, Leaf, LogOut, Menu, Search, Settings, Shield, Sparkles, TrendingUp, Users, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import api from './services/api'

type Point = { period: string; value: number }
type SourcedSeries = { items: Point[]; source: string | null; sourceUrl: string | null; retrievedAt: string | null; unit: string | null }
type ModuleLink = { path: string; label: string; title: string; description: string; icon: LucideIcon }
type Filters = { country: string; start: number; end: number }

const year = new Date().getFullYear()
const initialFilters: Filters = { country: 'IND', start: 2000, end: year }
const modules: ModuleLink[] = [
  { path: '/pulse', label: 'Economic Pulse', title: 'ECONOVA PULSE', description: 'Macroeconomic indicator monitoring', icon: Activity },
  { path: '/global', label: 'Global Economy', title: 'ECONOVA GLOBAL', description: 'Country-level economic comparison', icon: Globe2 },
  { path: '/forecast', label: 'Economic Forecast', title: 'ECONOVA FORECAST', description: 'Time-series forecasts and evaluation', icon: TrendingUp },
  { path: '/ai-economist', label: 'AI Economist', title: 'ECONOVA AI ECONOMIST', description: 'Evidence-first economic research', icon: BrainCircuit },
  { path: '/policylab', label: 'PolicyLab', title: 'ECONOVA POLICYLAB', description: 'Policy documents and fiscal analysis', icon: Landmark },
  { path: '/simulator', label: 'Scenario Simulator', title: 'ECONOVA SIMULATOR', description: 'Transparent sensitivity scenarios', icon: FlaskConical },
  { path: '/trade', label: 'Trade Intelligence', title: 'ECONOVA TRADE', description: 'Exports, imports and trade indicators', icon: BriefcaseBusiness },
  { path: '/finance', label: 'Financial Intelligence', title: 'ECONOVA FINANCE', description: 'Monetary and financial indicators', icon: Landmark },
  { path: '/research-lab', label: 'Research Lab', title: 'ECONOVA RESEARCH LAB', description: 'Research documents and citations', icon: BookOpenText },
  { path: '/data-explorer', label: 'Data Explorer', title: 'ECONOVA DATA EXPLORER', description: 'Discover, inspect and export sourced data', icon: Database },
  { path: '/development', label: 'Development & Human Progress', title: 'ECONOVA DEVELOPMENT', description: 'Social and human development indicators', icon: Users },
  { path: '/insights', label: 'Insights & Reports', title: 'ECONOVA INSIGHTS & REPORTS', description: 'Evidence-based data exports', icon: FileChartColumn },
]

const indicators = [
  { code: 'NY.GDP.MKTP.KD.ZG', label: 'GDP growth', unit: 'annual %' },
  { code: 'FP.CPI.TOTL.ZG', label: 'Consumer inflation', unit: 'annual %' },
  { code: 'SL.UEM.TOTL.ZS', label: 'Unemployment', unit: '% of labour force' },
  { code: 'SP.POP.TOTL', label: 'Population', unit: 'people' },
  { code: 'NY.GDP.MKTP.CD', label: 'GDP', unit: 'current USD' },
  { code: 'NE.EXP.GNFS.CD', label: 'Exports', unit: 'current USD' },
  { code: 'NE.IMP.GNFS.CD', label: 'Imports', unit: 'current USD' },
  { code: 'NE.RSB.GNFS.CD', label: 'External balance', unit: 'current USD' },
  { code: 'FR.INR.RINR', label: 'Real interest rate', unit: '%' },
  { code: 'FR.INR.LEND', label: 'Lending interest rate', unit: '%' },
  { code: 'FI.RES.TOTL.CD', label: 'Total reserves', unit: 'current USD' },
  { code: 'GC.BAL.CASH.GD.ZS', label: 'Fiscal balance', unit: '% of GDP' },
  { code: 'GC.DOD.TOTL.GD.ZS', label: 'Government debt', unit: '% of GDP' },
  { code: 'NV.IND.MANF.ZS', label: 'Manufacturing value added', unit: '% of GDP' },
  { code: 'SI.POV.NAHC', label: 'National poverty rate', unit: '%' },
  { code: 'SI.POV.GINI', label: 'Gini index', unit: 'index' },
  { code: 'SE.ADT.LITR.ZS', label: 'Adult literacy', unit: '%' },
  { code: 'SP.DYN.LE00.IN', label: 'Life expectancy', unit: 'years' },
  { code: 'SL.TLF.CACT.ZS', label: 'Labour participation', unit: '%' },
]

const overviewIndicators = [
  { code: 'NY.GDP.MKTP.KD.ZG', label: 'GDP Growth', shortLabel: 'GDP', unit: '%', icon: Activity, color: '#22d3ee' },
  { code: 'FP.CPI.TOTL.ZG', label: 'Inflation (CPI)', shortLabel: 'Inflation', unit: '%', icon: Coins, color: '#fb7185' },
  { code: 'SL.UEM.TOTL.ZS', label: 'Unemployment', shortLabel: 'Unemployment', unit: '%', icon: Users, color: '#38bdf8' },
  { code: 'GC.BAL.CASH.GD.ZS', label: 'Fiscal balance', shortLabel: 'Fiscal balance', unit: '% of GDP', icon: Landmark, color: '#a78bfa' },
]

const comparisonCountries = [
  { code: 'IND', name: 'India', flag: '🇮🇳' },
  { code: 'CHN', name: 'China', flag: '🇨🇳' },
  { code: 'USA', name: 'United States', flag: '🇺🇸' },
  { code: 'DEU', name: 'Germany', flag: '🇩🇪' },
  { code: 'JPN', name: 'Japan', flag: '🇯🇵' },
]

function getError(error: unknown, fallback: string) {
  const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

function readFilters(): Filters {
  try {
    const value = JSON.parse(localStorage.getItem('econova_filters') || '{}') as Partial<Filters>
    const rawEnd = Number(value.end)
    const end = Number.isFinite(rawEnd) ? Math.max(1960, Math.min(year + 1, Math.trunc(rawEnd))) : initialFilters.end
    const rawStart = Number(value.start)
    const start = Number.isFinite(rawStart) ? Math.max(1960, Math.min(end, Math.trunc(rawStart))) : initialFilters.start
    return {
      country: /^[A-Z]{3}$/.test(value.country || '') ? value.country! : initialFilters.country,
      start,
      end,
    }
  } catch {
    return initialFilters
  }
}

function useGlobalFilters() {
  const [filters, setFilters] = useState<Filters>(readFilters)
  useEffect(() => {
    const update = (event: Event) => setFilters((event as CustomEvent<Filters>).detail)
    window.addEventListener('econova:filters', update)
    return () => window.removeEventListener('econova:filters', update)
  }, [])
  return filters
}

function Shell({ children, user, onSignOut }: { children?: ReactNode; user: any; onSignOut: () => void }) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [country, setCountry] = useState(readFilters().country)
  const [start, setStart] = useState(readFilters().start)
  const [end, setEnd] = useState(readFilters().end)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const isAdmin = user?.role === 'SUPER_ADMIN'

  function publishFilters(next: Filters) {
    localStorage.setItem('econova_filters', JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('econova:filters', { detail: next }))
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    const query = search.trim().toLowerCase()
    if (!query) return
    const match = modules.find(item => `${item.label} ${item.title} ${item.description}`.toLowerCase().includes(query))
    if (match) {
      navigate(match.path)
      setSearch('')
      setMenuOpen(false)
    } else {
      setNotice('No module matches that search. Search module names such as forecast, trade or data.')
    }
  }

  const visibleModules = modules
  return <div className="shell">
    {menuOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
      <NavLink to="/" className="brand-link" onClick={() => setMenuOpen(false)}>
        <span className="brand-icon"><Leaf size={19} /></span>
        <span className="brand-text">ECONOVA<small>ECONOMIC INTELLIGENCE</small></span>
      </NavLink>
      <div className="nav-label">WORKSPACE</div>
      <nav className="navigation">
        <NavLink to="/" end onClick={() => setMenuOpen(false)}><Activity />Overview</NavLink>
        {visibleModules.map(item => <NavLink key={item.path} to={item.path} onClick={() => setMenuOpen(false)}><item.icon />{item.label}</NavLink>)}
      </nav>
      {isAdmin && <div className="nav-admin"><div className="nav-label">CONTROL</div><NavLink to="/admin" onClick={() => setMenuOpen(false)}><Shield />Administration</NavLink></div>}
      <div className="sidebar-bottom">
        <NavLink to="/settings" className="settings-link" onClick={() => setMenuOpen(false)}><Settings />Settings</NavLink>
        <div className="system"><span className="pulse" />Data refresh is periodic</div>
        <button className="logout" onClick={onSignOut}><LogOut />Sign out</button>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        <div className="top-brand"><span className="eyebrow">ECONOMIC INTELLIGENCE PLATFORM</span><div className="top-title">ECONOVA</div><small className="top-subtitle">Economic Intelligence &amp; Research Platform</small></div>
        <form className="global-search" onSubmit={submitSearch}><Search size={16} /><input aria-label="Search ECONOVA modules" placeholder="Search modules" value={search} onChange={event => setSearch(event.target.value)} /><button type="submit" className="sr-only">Search</button></form>
        <div className="top-filters">
          <label className="compact-filter country-filter">Country<select aria-label="Country" value={country} onChange={event => { const next = event.target.value; setCountry(next); publishFilters({ country: next, start, end }) }}>
            {comparisonCountries.map(item => <option value={item.code} key={item.code}>{item.flag} {item.name}</option>)}
          </select></label>
          <label className="compact-filter year-filter">From<input aria-label="Start year" type="number" min="1960" max={end} value={start} onChange={event => { const value = Number(event.target.value); const next = Number.isFinite(value) ? Math.max(1960, Math.min(end, Math.trunc(value))) : 1960; setStart(next); if (/^[A-Z]{3}$/.test(country)) publishFilters({ country, start: next, end }) }} /></label>
          <label className="compact-filter year-filter">To<input aria-label="End year" type="number" min={start} max={year + 1} value={end} onChange={event => { const value = Number(event.target.value); const next = Number.isFinite(value) ? Math.max(start, Math.min(year + 1, Math.trunc(value))) : year; setEnd(next); if (/^[A-Z]{3}$/.test(country)) publishFilters({ country, start, end: next }) }} /></label>
        </div>
        <details className="notification-menu"><summary aria-label="Data update information"><CircleHelp size={17} /></summary><div className="notification-card"><strong>About data freshness</strong><p>World Bank economic indicators are generally annual and update on provider schedules. ECONOVA syncs on request; this is not a tick-level live feed.</p></div></details>
        <div className="profile"><div className="avatar">{(user?.display_name || 'R').slice(0, 1).toUpperCase()}</div><div className="profile-name"><strong>{user?.display_name || 'Researcher'}</strong><small>{isAdmin ? 'Administrator' : user?.role || 'Researcher'}</small></div><ChevronDown size={14} /></div>
      </header>
      {notice && <div className="global-notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={14} /></button></div>}
      {children || <Outlet />}
      <footer>ECONOVA <span>Evidence first · Reproducible analysis · Transparent assumptions</span></footer>
    </main>
  </div>
}

function Heading({ eyebrow, title, desc, actions }: { eyebrow: string; title: string; desc: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{desc}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div>
}

function Stat({ label, value, note }: { label: string; value: ReactNode; note: string }) {
  return <div className="stat-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
}

function Empty({ text, title = 'No observations yet' }: { text: string; title?: string }) {
  return <div className="empty"><BarChart3 size={27} /><strong>{title}</strong><p>{text}</p></div>
}

function StatusNotice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={error ? 'notice error-notice' : 'notice'} role={error ? 'alert' : 'status'}>{children}</div>
}

function DataChart({ data, unit }: { data: Point[]; unit?: string | null }) {
  if (!data.length) return <Empty text="Load this series from the public provider or choose another country or indicator. Empty states are intentional; ECONOVA does not substitute sample values." />
  return <ResponsiveContainer width="100%" height={310}>
    <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#223247" />
      <XAxis dataKey="period" stroke="#8091a5" tickLine={false} axisLine={{ stroke: '#2a3d53' }} />
      <YAxis stroke="#8091a5" tickLine={false} axisLine={false} width={64} />
      <Tooltip contentStyle={{ background: '#101f31', border: '1px solid #2b4058', borderRadius: 9, color: '#edf3fa' }} formatter={(value: number) => [`${value.toLocaleString()}${unit ? ` ${unit}` : ''}`, 'Observed value']} />
      <Line type="monotone" dataKey="value" stroke="#35cbb2" strokeWidth={2.5} dot={{ r: 2, fill: '#35cbb2' }} activeDot={{ r: 5 }} />
    </LineChart>
  </ResponsiveContainer>
}

function Overview({ user }: { user: { display_name?: string; role?: string } }) {
  const [stats, setStats] = useState<any>(null)
  const [seriesByCode, setSeriesByCode] = useState<Record<string, SourcedSeries>>({})
  const [comparisonByCountry, setComparisonByCountry] = useState<Record<string, SourcedSeries>>({})
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const filters = useGlobalFilters()

  async function load() {
    setLoading(true)
    try {
      const requests = await Promise.all([
        api.get('/overview'),
        ...overviewIndicators.map(indicator => api.get('/observations', {
          params: { country: filters.country, indicator: indicator.code, start: filters.start, end: filters.end, limit: 5000 },
        })),
        ...comparisonCountries.map(country => api.get('/observations', {
          params: { country: country.code, indicator: overviewIndicators[0].code, start: filters.start, end: filters.end, limit: 5000 },
        })),
      ])
      const toSeries = (response: typeof requests[number]): SourcedSeries => ({
        items: response.data.items || [],
        source: response.data.source || null,
        sourceUrl: response.data.source_url || null,
        retrievedAt: response.data.retrieved_at || null,
        unit: response.data.unit || null,
      })
      setStats(requests[0].data)
      setSeriesByCode(Object.fromEntries(overviewIndicators.map((indicator, index) => [indicator.code, toSeries(requests[index + 1])])))
      setComparisonByCountry(Object.fromEntries(comparisonCountries.map((country, index) => [
        country.code,
        toSeries(requests[index + overviewIndicators.length + 1]),
      ])))
      setMessage('')
    } catch (error) {
      setMessage(getError(error, 'The API is unavailable. Start the backend and try again.'))
    } finally {
      setLoading(false)
    }
  }

  async function sync() {
    setSyncing(true)
    setMessage('')
    try {
      const results = await Promise.allSettled(overviewIndicators.map(indicator => api.post('/ingestion/world-bank', null, {
        params: { country: filters.country, indicator: indicator.code, start: filters.start, end: filters.end },
      })))
      const successful = results.filter(result => result.status === 'fulfilled').length
      await load()
      if (successful === overviewIndicators.length) {
        setMessage(`Provider sync completed for ${successful} indicators. Values appear only when the provider has published observations.`)
      } else {
        setMessage(`Provider sync completed for ${successful} of ${overviewIndicators.length} indicators. Check the source availability and try again.`)
      }
    } catch (error) {
      setMessage(getError(error, 'World Bank could not be reached. Existing stored data remains unchanged.'))
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { void load() }, [filters.country, filters.start, filters.end])

  const trendData = useMemo(() => {
    const periods = new Map<string, Record<string, number>>()
    overviewIndicators.forEach(indicator => {
      for (const point of seriesByCode[indicator.code]?.items || []) {
        const row = periods.get(point.period) || {}
        row[indicator.code] = point.value
        periods.set(point.period, row)
      }
    })
    return [...periods.entries()]
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([period, values]) => ({ period, ...values }))
  }, [seriesByCode])
  const latestRetrieval = overviewIndicators
    .map(indicator => seriesByCode[indicator.code]?.retrievedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .slice(-1)[0]
  const selectedCountry = comparisonCountries.find(country => country.code === filters.country)
  const userName = user.display_name || 'Researcher'
  const isAdmin = user.role === 'SUPER_ADMIN'

  return <section className="content overview-content">
    <div className="overview-welcome">
      <div>
        <div className="welcome-title"><h1>Welcome back, {userName}</h1>{isAdmin && <span className="admin-badge">Administrator</span>}</div>
        <p>Economic intelligence for {selectedCountry?.name || filters.country} and the global economy.</p>
      </div>
      <div className="overview-date"><CalendarDays size={17} /><div><strong>{new Date().toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</strong><small>{latestRetrieval ? `Last source retrieval ${new Date(latestRetrieval).toLocaleString()}` : 'No source observations loaded yet'}</small></div></div>
    </div>
    {message && <StatusNotice error={message.toLowerCase().includes('failed') || message.toLowerCase().includes('unavailable') || message.includes('Check the source')}>{message}</StatusNotice>}
    <div className="overview-kpis">
      {overviewIndicators.map(indicator => {
        const items = seriesByCode[indicator.code]?.items || []
        const latest = items[items.length - 1]
        const previous = items[items.length - 2]
        const delta = latest && previous ? latest.value - previous.value : null
        const fiscalDeficit = indicator.code === 'GC.BAL.CASH.GD.ZS' && latest && latest.value < 0
        return <article className="overview-kpi" key={indicator.code} style={{ '--metric-accent': indicator.color } as CSSProperties}>
          <div className="kpi-topline"><span className="kpi-icon"><indicator.icon size={18} /></span><span className="kpi-name">{indicator.label}</span><span className="kpi-period">{latest?.period || '—'}</span></div>
          <div className="kpi-value">{loading ? '…' : latest ? `${latest.value.toFixed(1)}%` : '—'}</div>
          <div className="kpi-foot"><span>{latest ? (fiscalDeficit ? 'Deficit' : indicator.code === 'GC.BAL.CASH.GD.ZS' ? 'Surplus' : 'Latest observation') : 'No stored data'}</span>
            {delta !== null && <span className={`kpi-change ${delta >= 0 ? 'positive' : 'negative'}`}>{delta > 0 ? '+' : ''}{delta.toFixed(1)} pp</span>}
          </div>
        </article>
      })}
      <article className="overview-ai-card">
        <div className="ai-title"><Sparkles size={17} /><strong>AI Economist</strong><span>RESEARCH</span></div>
        <p>Source-grounded economic answers are not enabled yet. Open the research status for current limitations.</p>
        <NavLink to="/ai-economist">View research status <ArrowUpRight size={14} /></NavLink>
      </article>
    </div>
    <div className="overview-main-grid">
      <section className="panel overview-trends">
        <div className="overview-panel-heading"><div><span className="eyebrow">{filters.country} · ECONOMIC TRENDS</span><h2>Key economic indicators</h2><p>Only stored provider observations are plotted.</p></div><span className="period-chip">{filters.start}–{filters.end}</span></div>
        {loading ? <div className="loading-state">Loading sourced observations…</div> : trendData.length ? <div className="overview-chart"><ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData} margin={{ top: 10, right: 6, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 5" stroke="#1c2c43" vertical={false} />
            <XAxis dataKey="period" stroke="#7589a4" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
            <YAxis stroke="#7589a4" tickLine={false} axisLine={false} tick={{ fontSize: 9 }} />
            <Tooltip contentStyle={{ background: '#0d192a', border: '1px solid #2b4058', borderRadius: 9 }} formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, overviewIndicators.find(item => item.code === name)?.shortLabel || name]} />
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} formatter={value => overviewIndicators.find(item => item.code === value)?.shortLabel || value} />
            {overviewIndicators.map(indicator => seriesByCode[indicator.code]?.items.length
              ? <Line key={indicator.code} type="monotone" dataKey={indicator.code} name={indicator.code} stroke={indicator.color} strokeWidth={2.2} dot={{ r: 2 }} connectNulls={false} />
              : null)}
          </LineChart>
        </ResponsiveContainer></div> : <Empty title="No trend data yet" text="Use Sync World Bank to request available historical observations. Missing indicators stay empty." />}
        <div className="freshness">Source: {overviewIndicators.map(item => seriesByCode[item.code]?.source).find(Boolean) || 'World Bank when synced'} · annual/periodic publication; not a live market feed.</div>
      </section>
      <section className="panel overview-global">
        <div className="overview-panel-heading"><div><span className="eyebrow">GLOBAL ECONOMIC OVERVIEW</span><h2>GDP growth comparison</h2><p>Latest values stored by ECONOVA</p></div><NavLink className="panel-link" to="/global">Explore <ArrowUpRight size={13} /></NavLink></div>
        <div className="country-comparison-list">
          {comparisonCountries.map(country => {
            const observations = comparisonByCountry[country.code]?.items || []
            const latest = observations[observations.length - 1]
            const max = Math.max(0, ...comparisonCountries.map(item => {
              const points = comparisonByCountry[item.code]?.items || []
              return points[points.length - 1]?.value ?? 0
            }))
            const width = latest && max > 0 ? Math.max(4, Math.min(100, latest.value / max * 100)) : 0
            return <div className="country-comparison" key={country.code}>
              <span className="country-flag">{country.flag}</span><span className="country-name">{country.name}</span>
              <span className="country-bar"><i style={{ width: `${width}%` }} /></span>
              <strong>{latest ? `${latest.value.toFixed(1)}%` : '—'}</strong>
              {latest && <small>{latest.period}</small>}
            </div>
          })}
        </div>
        <p className="freshness">{comparisonCountries.some(country => !comparisonByCountry[country.code]?.items.length) ? 'A dash means no observation is stored for that country; it is not an estimate.' : 'GDP growth observations; periods may differ by country.'}</p>
      </section>
      <div className="overview-side-stack">
        <section className="panel overview-briefing">
          <div className="overview-panel-heading"><div><span className="eyebrow">ECONOMIC BRIEFING</span><h2>Latest stored indicators</h2></div><CalendarDays size={16} /></div>
          <div className="briefing-list">{overviewIndicators.map(indicator => {
            const items = seriesByCode[indicator.code]?.items || []
            const latest = items[items.length - 1]
            return <div className="briefing-item" key={indicator.code}><span className="briefing-dot" style={{ background: indicator.color }} /><span>{indicator.shortLabel}</span><strong>{latest ? `${latest.value.toFixed(1)}%` : 'No data'}</strong><small>{latest?.period || '—'}</small></div>
          })}</div>
          <NavLink className="panel-link briefing-link" to="/data-explorer">Open data explorer <ArrowUpRight size={13} /></NavLink>
        </section>
        <section className="panel overview-reports">
          <div className="overview-panel-heading"><div><span className="eyebrow">WORKSPACE</span><h2>Reports & tools</h2></div><FileChartColumn size={17} /></div>
          <p>Build a source-attributed export from observations stored in your workspace.</p>
          <div className="report-actions"><NavLink to="/insights"><FileChartColumn size={14} /> Reports</NavLink><NavLink to="/forecast"><TrendingUp size={14} /> Forecast</NavLink><NavLink to="/simulator"><FlaskConical size={14} /> Simulator</NavLink></div>
        </section>
      </div>
    </div>
    <div className="overview-quick-access">
      <div className="quick-access-title"><span><Activity size={15} /> QUICK ACCESS</span><button className="sync-button" onClick={sync} disabled={syncing}><ArrowDownToLine size={14} />{syncing ? 'Syncing…' : 'Sync selected country'}</button></div>
      <div className="quick-access-links">{[modules[2], modules[5], modules[4], modules[6], modules[7], modules[11]].map(item => <NavLink to={item.path} key={item.path}><item.icon size={15} />{item.label}</NavLink>)}</div>
      <div className="overview-data-source"><span>Source: World Bank Open Data</span><span>Retrieved: {latestRetrieval ? new Date(latestRetrieval).toLocaleString() : 'Not yet retrieved'}</span><span>{stats?.observations ?? 0} stored observations · no synthetic data</span></div>
    </div>
    <div className="overview-modules-heading"><div><span className="eyebrow">ONE PLATFORM · TWELVE MODULES</span><h2>Explore ECONOVA</h2></div><span>Choose a workspace</span></div>
    <ModuleGrid />
  </section>
}

function ModuleGrid() {
  return <div className="module-grid">{modules.map((item, index) => <NavLink key={item.path} to={item.path} className="module-card"><span className="module-icon"><item.icon size={18} /></span><span className="module-number">MODULE {String(index + 1).padStart(2, '0')}</span><strong>{item.label}</strong><small>{item.description}</small><span className="module-arrow">Open module →</span></NavLink>)}</div>
}

function DataModule({ module, initialIndicator }: { module: ModuleLink; initialIndicator: string }) {
  const global = useGlobalFilters()
  const [country, setCountry] = useState(global.country)
  const [indicator, setIndicator] = useState(initialIndicator)
  const [start, setStart] = useState(global.start)
  const [end, setEnd] = useState(global.end)
  const [data, setData] = useState<Point[]>([])
  const [source, setSource] = useState<string | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [unit, setUnit] = useState<string | null>(null)
  const [retrievedAt, setRetrievedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'value-asc' | 'value-desc'>('newest')
  const [tablePage, setTablePage] = useState(0)
  const selectedIndicator = useMemo(() => indicators.find(item => item.code === indicator), [indicator])
  const sortedRows = useMemo(() => [...data].sort((a, b) => {
    if (sortMode === 'value-asc') return a.value - b.value
    if (sortMode === 'value-desc') return b.value - a.value
    return sortMode === 'newest' ? b.period.localeCompare(a.period) : a.period.localeCompare(b.period)
  }), [data, sortMode])
  const pageSize = 20
  const visibleRows = sortedRows.slice(tablePage * pageSize, (tablePage + 1) * pageSize)

  useEffect(() => {
    setCountry(global.country)
    setStart(global.start)
    setEnd(global.end)
  }, [global.country, global.start, global.end])

  async function load() {
    if (!/^[A-Z]{3}$/.test(country) || start > end) {
      setError('Enter a three-letter ISO country code and a valid year range.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await api.get('/observations', { params: { country, indicator, start, end, limit: 5000 } })
      setData(result.data.items)
      setTablePage(0)
      setSource(result.data.source)
      setSourceUrl(result.data.source_url)
      setUnit(result.data.unit)
      setRetrievedAt(result.data.retrieved_at)
      if (!result.data.count) setMessage('No observations are stored for this selection yet. Sync from the public provider.')
      else setMessage(`${result.data.count} stored observations · source ${result.data.source || 'not recorded'}`)
    } catch (requestError) {
      setError(getError(requestError, 'Could not load stored observations. Check the API connection.'))
    } finally {
      setBusy(false)
    }
  }

  async function sync() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await api.post('/ingestion/world-bank', null, { params: { country, indicator, start, end } })
      setMessage(`${result.data.fetched ?? 0} observations fetched from World Bank; ${result.data.inserted ?? 0} new, ${result.data.revised ?? 0} revised.`)
      await load()
    } catch (requestError) {
      setError(getError(requestError, 'World Bank sync failed. Your stored observations were not replaced.'))
    } finally {
      setBusy(false)
    }
  }

  function exportFile(format: 'csv' | 'json') {
    if (!data.length) {
      setMessage('There are no stored observations to export.')
      return
    }
    const content = format === 'json'
      ? JSON.stringify({ product: 'ECONOVA', country, indicator, unit, source, sourceUrl, retrievedAt, observationPeriod: { start, end }, items: data }, null, 2)
      : ['period,value,unit,country,indicator,source,source_url,retrieved_at', ...data.map(item => [item.period, item.value, unit || '', country, indicator, source || '', sourceUrl || '', retrievedAt || ''].map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))].join('\n')
    const mime = format === 'json' ? 'application/json' : 'text/csv'
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(new Blob([content], { type: mime }))
    anchor.download = `econova-${country}-${indicator.replace(/\./g, '-')}.${format}`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }

  useEffect(() => { if (/^[A-Z]{3}$/.test(country) && start <= end) void load() }, [country, indicator, start, end])

  return <section className="content">
    <Heading eyebrow={module.title} title={module.label} desc={module.description} actions={<span className="tag">{module.path === '/data-explorer' ? 'AVAILABLE' : 'PARTIAL · WORLD BANK ONLY'}</span>} />
    <div className="panel filter-panel">
      <div className="controls">
        <label>Country ISO3<input list="econova-country-codes" maxLength={3} value={country} onChange={event => setCountry(event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))} placeholder="IND" /><datalist id="econova-country-codes">{comparisonCountries.map(item => <option value={item.code} key={item.code} />)}</datalist><small className="input-hint">Any three-letter World Bank country code</small></label>
        <label>Indicator<select value={indicator} onChange={event => setIndicator(event.target.value)}>{indicators.map(item => <option key={item.code} value={item.code}>{item.label} · {item.code}</option>)}</select></label>
        <label>From year<input type="number" min="1960" max={end} value={start} onChange={event => { const value = Number(event.target.value); setStart(Number.isFinite(value) ? Math.max(1960, Math.min(end, Math.trunc(value))) : 1960) }} /></label>
        <label>To year<input type="number" min={start} max={year + 1} value={end} onChange={event => { const value = Number(event.target.value); setEnd(Number.isFinite(value) ? Math.max(start, Math.min(year + 1, Math.trunc(value))) : year) }} /></label>
        <div className="control-actions"><button className="primary" onClick={load} disabled={busy || !/^[A-Z]{3}$/.test(country)}>{busy ? 'Loading…' : 'Load data'}</button><button className="secondary" onClick={sync} disabled={busy || !/^[A-Z]{3}$/.test(country)}><ArrowDownToLine size={15} />Sync provider</button></div>
      </div>
    </div>
    {error && <StatusNotice error>{error}</StatusNotice>}
    {message && !error && <StatusNotice>{message}</StatusNotice>}
    <div className="panel chart-panel">
      <div className="panel-head"><div><span className="eyebrow">SOURCE SERIES</span><h2>{selectedIndicator?.label || indicator} · {country}</h2><p>{source || 'No provider data stored'} · {unit || selectedIndicator?.unit || 'Unit will be supplied by provider metadata'} · reference period {start}–{end}</p></div><div className="export-actions"><button className="icon-button" title="Export CSV" onClick={() => exportFile('csv')}><ArrowDownToLine size={16} />CSV</button><button className="icon-button" title="Export JSON" onClick={() => exportFile('json')}><ArrowDownToLine size={16} />JSON</button></div></div>
      {busy && !data.length ? <div className="loading-state">Loading stored observations…</div> : <DataChart data={data} unit={unit || selectedIndicator?.unit} />}
      <div className="freshness">ECONOVA retrieval time: {retrievedAt ? new Date(retrievedAt).toLocaleString() : 'not yet retrieved'} · Source: {sourceUrl || 'not yet recorded'} · World Bank data are periodically published, not real-time.</div>
    </div>
    <div className="panel table-panel">
      <div className="panel-head"><div><span className="eyebrow">OBSERVATION TABLE</span><h2>Provider records</h2></div><span className="tag">{data.length} ROWS</span></div>
      {data.length ? <><div className="table-scroll"><table><thead><tr>
        <th><button className="table-sort" onClick={() => { setSortMode(sortMode === 'newest' ? 'oldest' : 'newest'); setTablePage(0) }}>Period {sortMode === 'newest' ? '↓' : sortMode === 'oldest' ? '↑' : ''}</button></th>
        <th><button className="table-sort" onClick={() => { setSortMode(sortMode === 'value-asc' ? 'value-desc' : 'value-asc'); setTablePage(0) }}>Value {sortMode === 'value-asc' ? '↑' : sortMode === 'value-desc' ? '↓' : ''}</button></th>
        <th>Unit</th><th>Source</th></tr></thead><tbody>{visibleRows.map(item => <tr key={item.period}><td>{item.period}</td><td>{item.value.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td><td>{unit || selectedIndicator?.unit || '—'}</td><td>{source || '—'}</td></tr>)}</tbody></table></div>
        <div className="table-pagination"><span>{data.length} observations · page {tablePage + 1} of {Math.max(1, Math.ceil(data.length / pageSize))}</span><div><button className="secondary" onClick={() => setTablePage(Math.max(0, tablePage - 1))} disabled={tablePage === 0}>Previous</button><button className="secondary" onClick={() => setTablePage(Math.min(Math.ceil(data.length / pageSize) - 1, tablePage + 1))} disabled={(tablePage + 1) * pageSize >= data.length}>Next</button></div></div></> : <Empty title="No stored records" text="Select a country and indicator, then sync from the provider. No synthetic observations are shown." />}
    </div>
  </section>
}

function ForecastPage({ module }: { module: ModuleLink }) {
  const filters = useGlobalFilters()
  const [indicator, setIndicator] = useState('NY.GDP.MKTP.KD.ZG')
  const [horizon, setHorizon] = useState(5)
  const [result, setResult] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function forecast() {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const response = await api.post('/forecasts', { country: filters.country, indicator, horizon, model: 'auto' })
      setResult(response.data)
    } catch (requestError) {
      setError(getError(requestError, 'Forecast unavailable. Sync an adequately long series first.'))
    } finally {
      setBusy(false)
    }
  }
  const chartData = result ? [...result.history.slice(-12).map((point: Point) => ({ ...point, type: 'Observed' })), ...result.forecast.map((point: Point) => ({ ...point, type: 'Forecast' }))] : []
  return <section className="content">
    <Heading eyebrow={module.title} title="Forecast studio" desc="Chronological holdout evaluation with a naive baseline. Estimates are conditional, not promises or real-time predictions." />
    <div className="panel controls">
      <label>Country<input value={filters.country} readOnly aria-label="Selected country" /></label>
      <label>Indicator<select value={indicator} onChange={event => setIndicator(event.target.value)}>{indicators.slice(0, 6).map(item => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
      <label>Forecast horizon (years)<input type="number" min="1" max="15" value={horizon} onChange={event => setHorizon(Math.max(1, Math.min(15, Number(event.target.value) || 1)))} /></label>
      <button className="primary" onClick={forecast} disabled={busy}>{busy ? 'Evaluating…' : 'Run forecast'}</button>
    </div>
    {error && <StatusNotice error>{error}</StatusNotice>}
    {result && <><div className="stats-grid compact-stats"><Stat label="Model used" value={result.model} note={`${result.training_observations} training observations`} /><Stat label="Holdout MAE" value={result.metrics.mae == null ? '—' : result.metrics.mae.toFixed(3)} note="Lower is better; compare to naive" /><Stat label="Naive baseline MAE" value={result.metrics.naive_mae == null ? '—' : result.metrics.naive_mae.toFixed(3)} note="Last observation carried forward" /><Stat label="Forecast horizon" value={`${result.horizon} years`} note="Annual periods" /></div>
      <div className="panel chart-panel"><div className="panel-head"><div><span className="eyebrow">CONDITIONAL ESTIMATE</span><h2>Observed history & forecast</h2><p>Source World Bank · {filters.country} · {indicator}</p></div><span className="tag">ESTIMATE</span></div><ResponsiveContainer width="100%" height={310}><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#223247" /><XAxis dataKey="period" stroke="#8091a5" /><YAxis stroke="#8091a5" /><Tooltip contentStyle={{ background: '#101f31', border: '1px solid #2b4058', borderRadius: 9 }} /><Line type="monotone" dataKey="value" stroke="#43cbb2" strokeWidth={2.5} dot={{ r: 2 }} /></LineChart></ResponsiveContainer><StatusNotice>{result.warning} Prediction intervals are returned by the API; review the reported assumptions and holdout metrics.</StatusNotice></div>
      <div className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">PREDICTION INTERVAL</span><h2>Forecast values</h2></div></div><div className="table-scroll"><table><thead><tr><th>Period</th><th>Forecast</th><th>Lower</th><th>Upper</th></tr></thead><tbody>{result.forecast.map((item: any) => <tr key={item.period}><td>{item.period}</td><td>{Number(item.value).toFixed(4)}</td><td>{Number(item.lower).toFixed(4)}</td><td>{Number(item.upper).toFixed(4)}</td></tr>)}</tbody></table></div></div>
    </>}
    {!result && !error && <div className="panel"><Empty text="Forecasts require at least eight stored annual observations. Sync an appropriate public series in Data Explorer first." /></div>}
  </section>
}

function ScenarioPage({ module }: { module: ModuleLink }) {
  const [name, setName] = useState('GDP sensitivity')
  const [variable, setVariable] = useState('GDP growth')
  const [baseline, setBaseline] = useState('')
  const [shock, setShock] = useState('5')
  const [assumptions, setAssumptions] = useState('Arithmetic percentage shock; no causal relationships assumed.')
  const [result, setResult] = useState<any>(null)
  const [saved, setSaved] = useState<any[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function loadSaved() {
    try { setSaved((await api.get('/scenarios')).data) } catch { setSaved([]) }
  }
  useEffect(() => { void loadSaved() }, [])
  async function run(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const response = await api.post('/scenarios', { name, variable, baseline_value: Number(baseline), shock_percent: Number(shock), assumptions })
      setResult(response.data)
      await loadSaved()
    } catch (requestError) {
      setError(getError(requestError, 'The scenario could not be saved. Check your inputs and API connection.'))
    } finally { setBusy(false) }
  }
  return <section className="content">
    <Heading eyebrow={module.title} title="Scenario simulator" desc="A transparent arithmetic sensitivity tool. It is not a calibrated macro model and does not estimate causal policy effects." />
    <div className="scenario-layout">
      <form className="panel form-panel" onSubmit={run}>
        <span className="eyebrow">SCENARIO ASSUMPTIONS</span><h2>Configure a sensitivity</h2>
        <label>Scenario name<input value={name} onChange={event => setName(event.target.value)} maxLength={160} required /></label>
        <label>Variable<select value={variable} onChange={event => setVariable(event.target.value)}>{['GDP growth', 'Inflation', 'Employment', 'Exchange rate', 'Exports', 'Imports', 'Government spending'].map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Baseline value<input type="number" step="any" value={baseline} onChange={event => setBaseline(event.target.value)} required /></label>
        <label>Percentage shock <span className="range-value">{shock}%</span><input type="range" min="-100" max="100" step="0.5" value={shock} onChange={event => setShock(event.target.value)} /></label>
        <label>Methodology / assumptions<textarea rows={3} value={assumptions} onChange={event => setAssumptions(event.target.value)} maxLength={2000} /></label>
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Calculating…' : 'Run and save sensitivity'}</button>
      </form>
      <div className="panel result-panel"><span className="eyebrow">CONDITIONAL RESULT</span><h2>Calculation</h2>
        {error && <StatusNotice error>{error}</StatusNotice>}
        {result ? <><div className="result-number">{Number(result.scenario).toLocaleString(undefined, { maximumFractionDigits: 4 })}</div><div className="result-line"><span>Baseline</span><strong>{result.baseline}</strong></div><div className="result-line"><span>Absolute change</span><strong>{result.delta}</strong></div><div className="result-line"><span>Shock</span><strong>{result.shock_percent}%</strong></div><p className="muted methodology">{result.assumptions}</p></> : <Empty text="Enter a baseline and shock to calculate a conditional arithmetic sensitivity." />}
        <p className="small-note">This calculation is not an empirically estimated impact, forecast or policy recommendation.</p>
      </div>
    </div>
    <div className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">YOUR SAVED WORK</span><h2>Recent scenarios</h2></div><span className="tag">{saved.length} SAVED</span></div>
      {saved.length ? <div className="table-scroll"><table><thead><tr><th>Name</th><th>Variable</th><th>Baseline</th><th>Scenario</th><th>Shock</th></tr></thead><tbody>{saved.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.variable}</td><td>{item.baseline}</td><td>{item.scenario}</td><td>{item.shock_percent}%</td></tr>)}</tbody></table></div> : <Empty title="No saved scenarios" text="Run a sensitivity above to save it to your account." />}</div>
  </section>
}

function ResearchPage({ module }: { module: ModuleLink }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function ask(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setAnswer(null)
    try { setAnswer((await api.post('/research/ask', { question })).data) }
    catch (requestError) { setError(getError(requestError, 'The research service is unavailable.')) }
    finally { setBusy(false) }
  }
  return <section className="content">
    <Heading eyebrow={module.title} title="AI Economist" desc="The assistant will not make economic claims without retrieved, citable evidence." actions={<span className="status-pill">GROUNDED ANSWERS UNAVAILABLE</span>} />
    <div className="notice">Evidence-first mode: document upload, page-level indexing and retrieval are not yet available. Questions are not sent to an ungrounded model.</div>
    <form className="panel research-form" onSubmit={ask}><label>Your economic question<textarea value={question} onChange={event => setQuestion(event.target.value)} minLength={3} maxLength={2000} rows={5} placeholder="Ask a research question. No unsourced answer will be generated." required /></label><div className="form-footer"><span>{question.length}/2000 characters</span><button className="primary" disabled={busy || question.trim().length < 3}>{busy ? 'Checking evidence…' : 'Check evidence availability'}</button></div></form>
    {error && <StatusNotice error>{error}</StatusNotice>}
    {answer && <div className="panel answer"><span className="eyebrow">{answer.mode}</span><h2>Evidence status</h2><p>{answer.answer}</p>{answer.limitations?.map((item: string) => <p className="muted" key={item}>• {item}</p>)}{answer.citations?.length > 0 && <div className="citations"><strong>Retrieved references</strong>{answer.citations.map((item: any, index: number) => <div key={index}>{item.source}{item.page ? ` · page ${item.page}` : ''}</div>)}</div>}</div>}
    {!answer && !error && <div className="panel"><Empty text="No AI-generated statistics or citations are shown unless a source corpus can support them." /></div>}
  </section>
}

function ReportsPage({ module }: { module: ModuleLink }) {
  const filters = useGlobalFilters()
  const [indicator, setIndicator] = useState('NY.GDP.MKTP.KD.ZG')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function observations() {
    const response = await api.get('/observations', { params: { country: filters.country, indicator, start: filters.start, end: filters.end, limit: 5000 } })
    return response.data
  }
  async function exportData(format: 'csv' | 'json') {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const data = await observations()
      if (!data.items.length) { setMessage('No stored observations are available to export. Sync a source series first.'); return }
      const content = format === 'json'
        ? JSON.stringify({ product: 'ECONOVA', research_question: `What does ${indicator} show for ${filters.country}?`, source: data.source, source_url: data.source_url, retrieved_at: data.retrieved_at, unit: data.unit, observation_period: { start: filters.start, end: filters.end }, methodology: 'Descriptive export; no interpolation or causal inference.', limitations: 'Provider series update periodically; this is not real-time data.', items: data.items }, null, 2)
        : ['period,value,unit,country,indicator,source,source_url,retrieved_at', ...data.items.map((row: Point) => [row.period, row.value, data.unit || '', filters.country, indicator, data.source || '', data.source_url || '', data.retrieved_at || ''].map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))].join('\n')
      const anchor = document.createElement('a')
      anchor.href = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' }))
      anchor.download = `econova-report-${filters.country}-${indicator.replace(/\./g, '-')}.${format}`
      anchor.click()
      URL.revokeObjectURL(anchor.href)
      setMessage(`${data.items.length} sourced observations exported with period and source metadata.`)
    } catch (requestError) { setError(getError(requestError, 'Could not load observations for export.')) }
    finally { setBusy(false) }
  }
  async function exportPdf() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await api.get('/reports/observations.pdf', { params: { country: filters.country, indicator, start: filters.start, end: filters.end }, responseType: 'blob' })
      const anchor = document.createElement('a')
      anchor.href = URL.createObjectURL(response.data)
      anchor.download = `econova-report-${filters.country}-${indicator.replace(/\./g, '-')}.pdf`
      anchor.click()
      URL.revokeObjectURL(anchor.href)
      setMessage('PDF report generated from stored provider observations.')
    } catch (requestError) { setError(getError(requestError, 'No data or PDF generation service is available for this selection.')) }
    finally { setBusy(false) }
  }
  return <section className="content">
    <Heading eyebrow={module.title} title="Insights & Reports" desc="Generate descriptive exports from stored economic observations. Reports state their source, observation period and limitations." actions={<span className="tag">PARTIAL · DATA EXPORTS</span>} />
    <div className="panel report-builder"><span className="eyebrow">CUSTOM REPORT BUILDER</span><h2>Configure an evidence-backed export</h2><div className="controls"><label>Country<input value={filters.country} readOnly /></label><label>Indicator<select value={indicator} onChange={event => setIndicator(event.target.value)}>{indicators.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label>Observation period<input value={`${filters.start} – ${filters.end}`} readOnly /></label></div><div className="export-actions large"><button className="primary" onClick={() => exportData('csv')} disabled={busy}><ArrowDownToLine size={16} />Export CSV</button><button className="secondary" onClick={() => exportData('json')} disabled={busy}><ArrowDownToLine size={16} />Export JSON</button><button className="secondary" onClick={exportPdf} disabled={busy}><FileChartColumn size={16} />Export PDF</button></div>
      {message && <StatusNotice>{message}</StatusNotice>}{error && <StatusNotice error>{error}</StatusNotice>}
    </div>
    <div className="panel"><span className="eyebrow">REPORT CONTENT</span><h2>Scope & limitations</h2><div className="report-points"><p><Check size={16} /> Source/provider and indicator metadata</p><p><Check size={16} /> Observation periods and values</p><p><Check size={16} /> Methodology and limitations included in PDF/JSON</p><p><X size={16} /> Charts, literature review and AI synthesis are not yet part of generated reports</p><p><X size={16} /> No daily/weekly “briefing” is generated from incomplete data</p></div></div>
  </section>
}

function UnavailableModule({ module }: { module: ModuleLink }) {
  const navigate = useNavigate()
  const notReady: Record<string, string[]> = {
    '/policylab': ['RBI policy document collection and extraction', 'Budget and Economic Survey document citations', 'Public expenditure and tax analysis workflows'],
    '/research-lab': ['PDF upload, page extraction and document library', 'Page-level retrieval and grounded literature review', 'Research notes and citation management'],
  }
  const features = notReady[module.path] || ['A verified, maintained source connector', 'Validated indicator definitions and coverage', 'Feature-specific analysis and tests']
  return <section className="content">
    <Heading eyebrow={module.title} title={module.label} desc={module.description} />
    <div className="panel unavailable-panel"><div className="unavailable-icon"><module.icon size={24} /></div><span className="status-pill">NOT AVAILABLE YET</span><h2>This module is not represented as complete</h2><p>The existing repository does not contain a verified ingestion or analysis workflow for these functions. This page is an explicit capability boundary—not a static mock of live data.</p><h3>Not implemented</h3><ul>{features.map(item => <li key={item}>{item}</li>)}</ul><p className="muted">Use Data Explorer for currently supported World Bank indicator observations and check each series’ source, unit and retrieval time.</p><div className="heading-actions"><button className="primary" onClick={() => navigate('/data-explorer')}>Open Data Explorer</button><button className="secondary" onClick={() => navigate('/insights')}>View export options</button></div></div>
  </section>
}

function AdminPage({ user }: { user: any }) {
  const [summary, setSummary] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [audit, setAudit] = useState<any[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyUser, setBusyUser] = useState<number | null>(null)
  const isAdmin = user?.role === 'SUPER_ADMIN'
  async function load() {
    setError('')
    try {
      const [summaryResponse, userResponse, auditResponse] = await Promise.all([api.get('/admin/summary'), api.get('/admin/users'), api.get('/admin/audit')])
      setSummary(summaryResponse.data)
      setUsers(userResponse.data.items)
      setAudit(auditResponse.data)
    } catch (requestError) { setError(getError(requestError, 'Administrator access is required, or the API is unavailable.')) }
  }
  useEffect(() => { if (isAdmin) void load() }, [isAdmin])
  async function changeRole(user: any) {
    const role = user.role === 'analyst' ? 'researcher' : 'analyst'
    setBusyUser(user.id)
    setNotice('')
    try {
      await api.patch(`/admin/users/${user.id}/role`, { role })
      setNotice(`${user.email} is now assigned the ${role} role.`)
      await load()
    } catch (requestError) { setError(getError(requestError, 'Role update was not completed.')) }
    finally { setBusyUser(null) }
  }
  if (!isAdmin) return <section className="content"><Heading eyebrow="RESTRICTED AREA" title="Administration" desc="Administrator access is required to view users, settings and audit events." /><div className="panel"><StatusNotice error>Access denied. Public registration cannot create administrator accounts.</StatusNotice></div></section>
  return <section className="content">
    <Heading eyebrow="SECURE CONTROL PLANE" title="Administration" desc="Protected platform monitoring. Sensitive values and provider credentials are never displayed here." actions={<span className="admin-identity"><Shield size={16} />Atharav | Administrator</span>} />
    {error && <StatusNotice error>{error}</StatusNotice>}{notice && <StatusNotice>{notice}</StatusNotice>}
    {summary && <div className="stats-grid"><Stat label="Users" value={summary.users} note="Registered accounts" /><Stat label="Observations" value={summary.observations} note={`Latest retrieval ${summary.latest_retrieval ? new Date(summary.latest_retrieval).toLocaleDateString() : 'not available'}`} /><Stat label="Data sources" value={summary.data_sources} note={`${summary.countries} countries in database`} /><Stat label="AI provider" value={summary.ai_provider_configured ? 'Configured' : 'Not configured'} note="Credentials not shown" /></div>}
    <div className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">USER MANAGEMENT</span><h2>Accounts & roles</h2></div><span className="tag">ADMIN ONLY</span></div>
      {users.length ? <div className="table-scroll"><table><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Created</th><th>Action</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td>{user.display_name}{user.display_name === 'Atharav' && <span className="small-note"> · Administrator</span>}</td><td>{user.email}</td><td>{user.role}</td><td>{new Date(user.created_at).toLocaleDateString()}</td><td><button className="text-button" onClick={() => changeRole(user)} disabled={busyUser === user.id || user.role === 'SUPER_ADMIN'}>{user.role === 'analyst' ? 'Set researcher' : user.role === 'researcher' ? 'Set analyst' : 'Protected admin'}</button></td></tr>)}</tbody></table></div> : !error && <Empty text="No accounts are available." />}</div>
    <div className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">AUDIT LOG</span><h2>Recent administrative activity</h2></div></div>{audit.length ? <div className="table-scroll"><table><thead><tr><th>Time</th><th>Actor ID</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>{audit.map(item => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString()}</td><td>{item.actor_user_id}</td><td>{item.action}</td><td>{item.target}</td><td>{item.details}</td></tr>)}</tbody></table></div> : !error && <Empty text="No recorded administrative events." />}</div>
  </section>
}

function SettingsPage({ user }: { user: any }) {
  return <section className="content"><Heading eyebrow="ACCOUNT & PLATFORM" title="Settings" desc="Local-first configuration status. Secrets are configured by the operator in the backend environment, never in the browser." />
    <div className="panel settings-panel"><span className="eyebrow">ACCOUNT</span><h2>{user?.display_name || 'Researcher'}</h2><div className="result-line"><span>Email</span><strong>{user?.email}</strong></div><div className="result-line"><span>Role</span><strong>{user?.role}</strong></div>{user?.role === 'SUPER_ADMIN' && <div className="result-line"><span>Administrator identity</span><strong>Atharav | Administrator</strong></div>}</div>
    <div className="panel settings-panel"><span className="eyebrow">DATA & PROVIDERS</span><h2>Connection status</h2><p className="muted">Economic series are stored locally and retrieved from public World Bank APIs on request. Data publication is periodic; no automatic polling or live market feed is active.</p><p className="muted">Gemini synthesis remains disabled without validated source passages, even if a provider key is configured.</p><p className="muted">PostgreSQL and deployments require operator-supplied environment configuration. ECONOVA does not create cloud billing resources.</p></div>
  </section>
}

function Login({ onLogin }: { onLogin: (user: any) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [register, setRegister] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const token = (await api.post(`/auth/${register ? 'register' : 'login'}`, { email, password })).data.access_token
      localStorage.setItem('econova_token', token)
      const response = await api.get('/auth/me')
      onLogin(response.data)
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(getError(requestError, 'Unable to authenticate. Check your details and API connection.'))
    } finally { setBusy(false) }
  }
  return <div className="login-wrap"><form className="login-card" onSubmit={submit}>
    <div className="brand"><span className="brand-icon"><Leaf size={20} /></span><span className="brand-text">ECONOVA<small>ECONOMIC INTELLIGENCE</small></span></div>
    <h1>{register ? 'Create your account' : 'Welcome back'}</h1><p>Access sourced economic indicators, forecasts and sensitivity analysis.</p>
    <label>Email address<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
    <label>Password<input type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /></label>
    <button className="primary full" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create researcher account' : 'Sign in'}</button>
    {error && <StatusNotice error>{error}</StatusNotice>}
    <p className="small-note">Public registration creates a researcher account only. Administrator provisioning is available only through the protected backend CLI.</p>
    <button type="button" className="link-button" onClick={() => { setRegister(!register); setError('') }}>{register ? 'Already registered? Sign in' : 'New to ECONOVA? Create an account'}</button>
  </form></div>
}

export default function App() {
  const [user, setUser] = useState<any>(null)
  const [checking, setChecking] = useState(Boolean(localStorage.getItem('econova_token')))
  useEffect(() => {
    if (!localStorage.getItem('econova_token')) return
    api.get('/auth/me')
      .then(response => setUser(response.data))
      .catch(() => localStorage.removeItem('econova_token'))
      .finally(() => setChecking(false))
  }, [])
  function signOut() {
    localStorage.removeItem('econova_token')
    setUser(null)
  }
  if (checking) return <div className="loading-screen"><div className="brand"><span className="brand-icon"><Leaf size={20} /></span><span className="brand-text">ECONOVA<small>ECONOMIC INTELLIGENCE</small></span></div><p>Restoring your secure session…</p></div>
  return <Routes>
    <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onLogin={setUser} />} />
    <Route element={user ? <Shell user={user} onSignOut={signOut} /> : <Navigate to="/login" replace />}>
      <Route path="/" element={<Overview user={user} />} />
      <Route path="/pulse" element={<DataModule key="pulse" module={modules[0]} initialIndicator="NY.GDP.MKTP.KD.ZG" />} />
      <Route path="/global" element={<DataModule key="global" module={modules[1]} initialIndicator="NY.GDP.MKTP.KD.ZG" />} />
      <Route path="/forecast" element={<ForecastPage module={modules[2]} />} />
      <Route path="/ai-economist" element={<ResearchPage module={modules[3]} />} />
      <Route path="/policylab" element={<UnavailableModule module={modules[4]} />} />
      <Route path="/simulator" element={<ScenarioPage module={modules[5]} />} />
      <Route path="/trade" element={<DataModule key="trade" module={modules[6]} initialIndicator="NE.EXP.GNFS.CD" />} />
      <Route path="/finance" element={<DataModule key="finance" module={modules[7]} initialIndicator="FR.INR.RINR" />} />
      <Route path="/research-lab" element={<UnavailableModule module={modules[8]} />} />
      <Route path="/data-explorer" element={<DataModule key="data-explorer" module={modules[9]} initialIndicator="NY.GDP.MKTP.KD.ZG" />} />
      <Route path="/development" element={<DataModule key="development" module={modules[10]} initialIndicator="SI.POV.NAHC" />} />
      <Route path="/insights" element={<ReportsPage module={modules[11]} />} />
      <Route path="/admin" element={<AdminPage user={user} />} />
      <Route path="/settings" element={<SettingsPage user={user} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
}
