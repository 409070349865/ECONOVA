import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import {
  Activity, ArrowDownToLine, ArrowUpRight, BarChart3, BookOpenText, BrainCircuit, BriefcaseBusiness,
  CalendarDays, Check, CircleHelp, Coins, Database, FileChartColumn, FlaskConical, Globe2,
  FileText, Landmark, Leaf, Menu, Search, Send, Settings, Shield, Sparkles, Trash2, TrendingUp, Upload, Users, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import api from './services/api'

const automaticSeriesSyncs = new Map<string, Promise<void>>()

function ensureSeriesSynced(country: string, indicator: string, start: number, end: number) {
  const key = `${country}:${indicator}:${start}:${end}`
  const existing = automaticSeriesSyncs.get(key)
  if (existing) return existing
  const request = api.post('/ingestion/indicators', null, { params: { country, indicator, start, end } }).then(() => undefined)
  automaticSeriesSyncs.set(key, request)
  request.catch(() => automaticSeriesSyncs.delete(key))
  if (automaticSeriesSyncs.size > 400) {
    const oldestKey = automaticSeriesSyncs.keys().next().value
    if (oldestKey) automaticSeriesSyncs.delete(oldestKey)
  }
  return request
}

function isLegacyEmptyForecast(error: unknown) {
  const response = (error as { response?: { status?: number; data?: { detail?: string } } })?.response
  return response?.status === 404 && response.data?.detail === 'No observations found. Run World Bank ingestion first.'
}

type Point = { period: string; value: number }
type SourcedSeries = { items: Point[]; source: string | null; sourceUrl: string | null; retrievedAt: string | null; unit: string | null }
type ModuleLink = { path: string; label: string; title: string; description: string; icon: LucideIcon }
type Filters = { country: string; start: number; end: number }
type ResearchFile = { id: string; token: string; filename: string; file_type: string; analysis_preview: string; analysis_characters: number }
type ResearchChatMessage = { role: 'user' | 'assistant'; content: string; citations?: Array<{ id: string; source: string; url?: string | null; page?: number | null }>; mode?: string }

const year = new Date().getFullYear()
const initialFilters: Filters = { country: 'JPN', start: 2000, end: year }
const modules: ModuleLink[] = [
  { path: '/pulse', label: 'Economic Pulse', title: 'ECONOVA PULSE', description: 'Macroeconomic indicator monitoring', icon: Activity },
  { path: '/global', label: 'Global Economy', title: 'ECONOVA GLOBAL', description: 'Country-level economic comparison', icon: Globe2 },
  { path: '/forecast', label: 'Economic Forecast', title: 'ECONOVA FORECAST', description: 'Time-series forecasts and evaluation', icon: TrendingUp },
  { path: '/ai-economist', label: 'AI Economist', title: 'ECONOVA AI ECONOMIST', description: 'Evidence-first economic research', icon: BrainCircuit },
  { path: '/policylab', label: 'PolicyLab', title: 'ECONOVA POLICYLAB', description: 'Government policies and official economic statistics', icon: Landmark },
  { path: '/simulator', label: 'Scenario Simulator', title: 'ECONOVA SIMULATOR', description: 'Transparent sensitivity scenarios', icon: FlaskConical },
  { path: '/trade', label: 'Trade Intelligence', title: 'ECONOVA TRADE', description: 'Exports, imports and trade indicators', icon: BriefcaseBusiness },
  { path: '/finance', label: 'Financial Intelligence', title: 'ECONOVA FINANCE', description: 'Country stock indices, trading patterns and forecast ranges', icon: Landmark },
  { path: '/research-lab', label: 'Research Lab', title: 'ECONOVA RESEARCH LAB', description: 'Economic research, findings and measurable goals', icon: BookOpenText },
  { path: '/data-explorer', label: 'Data Explorer', title: 'ECONOVA DATA EXPLORER', description: 'Discover, inspect and export sourced data', icon: Database },
  { path: '/development', label: 'Development & Human Progress', title: 'ECONOVA DEVELOPMENT', description: 'Poverty, people, skills, health and employment indicators', icon: Users },
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
  { code: 'OECD.EO.NLGQ', label: 'Fiscal balance', unit: '% of GDP' },
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
  { code: 'OECD.EO.NLGQ', label: 'Fiscal balance', shortLabel: 'Fiscal balance', unit: '% of GDP', icon: Landmark, color: '#a78bfa' },
]

const comparisonCountries = [
  { code: 'IND', name: 'India', flag: '🇮🇳' },
  { code: 'CHN', name: 'China', flag: '🇨🇳' },
  { code: 'USA', name: 'United States', flag: '🇺🇸' },
  { code: 'DEU', name: 'Germany', flag: '🇩🇪' },
  { code: 'JPN', name: 'Japan', flag: '🇯🇵' },
]

type AppPreferences = {
  theme: 'dark' | 'light'
  density: 'comfortable' | 'compact'
  accent: 'teal' | 'blue' | 'violet' | 'emerald'
  locale: 'en-IN' | 'en-US' | 'en-GB' | 'hi-IN' | 'de-DE' | 'ja-JP'
  timezone: 'browser' | 'Asia/Kolkata' | 'UTC' | 'America/New_York' | 'Europe/London' | 'Asia/Tokyo'
  dateFormat: 'locale' | 'dmy' | 'mdy' | 'iso'
  units: 'metric' | 'imperial'
  supportEmail: string
}

const preferencesKey = 'econova_preferences'
const defaultPreferences: AppPreferences = {
  theme: 'dark', density: 'comfortable', accent: 'teal', locale: 'en-IN', timezone: 'browser',
  dateFormat: 'locale', units: 'metric', supportEmail: '',
}

function readPreferences(): AppPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(preferencesKey) || '{}') as Partial<AppPreferences>
    const locales: AppPreferences['locale'][] = ['en-IN', 'en-US', 'en-GB', 'hi-IN', 'de-DE', 'ja-JP']
    const timezones: AppPreferences['timezone'][] = ['browser', 'Asia/Kolkata', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo']
    return {
      theme: saved.theme === 'light' ? 'light' : 'dark',
      density: saved.density === 'compact' ? 'compact' : 'comfortable',
      accent: ['teal', 'blue', 'violet', 'emerald'].includes(saved.accent || '') ? saved.accent! : defaultPreferences.accent,
      locale: locales.includes(saved.locale as AppPreferences['locale']) ? saved.locale! : defaultPreferences.locale,
      timezone: timezones.includes(saved.timezone as AppPreferences['timezone']) ? saved.timezone! : defaultPreferences.timezone,
      dateFormat: ['locale', 'dmy', 'mdy', 'iso'].includes(saved.dateFormat || '') ? saved.dateFormat! : defaultPreferences.dateFormat,
      units: saved.units === 'imperial' ? 'imperial' : 'metric',
      supportEmail: typeof saved.supportEmail === 'string' ? saved.supportEmail.slice(0, 254) : '',
    }
  } catch { return defaultPreferences }
}

function applyPreferences(preferences: AppPreferences) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = preferences.theme
  root.dataset.density = preferences.density
  root.dataset.accent = preferences.accent
  try { localStorage.setItem(preferencesKey, JSON.stringify(preferences)) } catch { /* browser storage may be disabled */ }
}

function formatNumber(value: number, options: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat(readPreferences().locale, options).format(value)
}

function formatDateTime(value: string | number | Date, includeTime = false) {
  const preferences = readPreferences()
  const timeZone = preferences.timezone === 'browser' ? undefined : preferences.timezone
  const order = preferences.dateFormat
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  const zoneOptions: Intl.DateTimeFormatOptions = timeZone ? { timeZone } : {}
  const time = includeTime
    ? new Intl.DateTimeFormat(preferences.locale, { ...zoneOptions, hour: '2-digit', minute: '2-digit' }).format(date)
    : ''
  if (order === 'dmy' || order === 'mdy' || order === 'iso') {
    const parts = new Intl.DateTimeFormat(preferences.locale, {
      ...zoneOptions, year: 'numeric', month: '2-digit', day: '2-digit', calendar: 'gregory', numberingSystem: 'latn',
    }).formatToParts(date)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || ''
    const year = part('year').padStart(4, '0')
    const month = part('month').padStart(2, '0')
    const day = part('day').padStart(2, '0')
    const formatted = order === 'iso' ? `${year}-${month}-${day}` : order === 'dmy' ? `${day}/${month}/${year}` : `${month}/${day}/${year}`
    return time ? `${formatted} ${time}` : formatted
  }
  return new Intl.DateTimeFormat(preferences.locale, {
    ...zoneOptions, day: '2-digit', month: 'short', year: 'numeric', ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

function formatWithRegionalUnit(value: number, unit: string) {
  const normalized = unit.trim().toLowerCase()
  if (readPreferences().units === 'imperial') {
    if (['km', 'kilometer', 'kilometers'].includes(normalized)) return `${formatNumber(value * 0.621371, { maximumFractionDigits: 2 })} mi`
    if (['kg', 'kilogram', 'kilograms'].includes(normalized)) return `${formatNumber(value * 2.20462, { maximumFractionDigits: 2 })} lb`
    if (['°c', 'celsius'].includes(normalized)) return `${formatNumber((value * 9) / 5 + 32, { maximumFractionDigits: 1 })} °F`
  }
  return `${formatNumber(value, { maximumFractionDigits: 2 })} ${unit}`.trim()
}

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

function Shell({ children, user }: { children?: ReactNode; user: any }) {
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
        <details className="notification-menu"><summary aria-label="Data update information"><CircleHelp size={17} /></summary><div className="notification-card"><strong>About data freshness</strong><p>ECONOVA fetches the latest available annual observations when a country has no stored data. World Bank and OECD data update on their release schedules; these are not live market feeds. OECD fiscal values for the latest completed year may be estimates; forecast years are excluded.</p></div></details>
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
      <Tooltip contentStyle={{ background: '#101f31', border: '1px solid #2b4058', borderRadius: 9, color: '#edf3fa' }} formatter={(value: number) => [`${formatNumber(value)}${unit ? ` ${unit}` : ''}`, 'Observed value']} />
      <Line type="monotone" dataKey="value" stroke="#35cbb2" strokeWidth={2.5} dot={{ r: 2, fill: '#35cbb2' }} activeDot={{ r: 5 }} />
    </LineChart>
  </ResponsiveContainer>
}

function Overview({ user }: { user?: { display_name?: string; role?: string } | null }) {
  const [stats, setStats] = useState<any>(null)
  const [seriesByCode, setSeriesByCode] = useState<Record<string, SourcedSeries>>({})
  const [comparisonByCountry, setComparisonByCountry] = useState<Record<string, SourcedSeries>>({})
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const filters = useGlobalFilters()

  async function load(autoSyncIfEmpty = true) {
    setLoading(true)
    try {
      const fetchOverview = () => Promise.all([
        api.get('/overview'),
        ...overviewIndicators.map(indicator => api.get('/observations', {
          params: { country: filters.country, indicator: indicator.code, start: filters.start, end: filters.end, limit: 5000 },
        })),
        ...comparisonCountries.map(country => api.get('/observations', {
          params: { country: country.code, indicator: overviewIndicators[0].code, start: filters.start, end: filters.end, limit: 5000 },
        })),
      ])
      let requests = await fetchOverview()
      let refreshMessage = ''
      if (autoSyncIfEmpty) {
        const missing = overviewIndicators.filter((_, index) => !(requests[index + 1].data.items || []).length)
        if (missing.length) {
          const updates = await Promise.allSettled(missing.map(indicator => api.post('/ingestion/indicators', null, {
            params: { country: filters.country, indicator: indicator.code, start: filters.start, end: filters.end },
          })))
          if (updates.some(update => update.status === 'fulfilled' && Number(update.value.data.fetched) > 0)) {
            requests = await fetchOverview()
          }
          const stillMissing = overviewIndicators.filter((_, index) => !(requests[index + 1].data.items || []).length)
          if (stillMissing.length) {
            refreshMessage = updates.every(update => update.status === 'rejected')
              ? 'The data providers could not be reached. Try syncing again when they are available.'
              : `No published observations are available for ${stillMissing.map(item => item.label).join(', ')} in this period.`
          }
        }
      }
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
      setMessage(refreshMessage)
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
      const results = await Promise.allSettled(overviewIndicators.map(indicator => api.post('/ingestion/indicators', null, {
        params: { country: filters.country, indicator: indicator.code, start: filters.start, end: filters.end },
      })))
      const successful = results.filter(result => result.status === 'fulfilled' && Number(result.value.data.fetched) > 0).length
      await load(false)
      setMessage(`Providers returned observations for ${successful} of ${overviewIndicators.length} indicators. Values appear only when published.`)
    } catch (error) {
      setMessage(getError(error, 'The data providers could not be reached. Existing stored data remains unchanged.'))
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
  const activeSources = [...new Set(overviewIndicators
    .map(indicator => seriesByCode[indicator.code]?.source)
    .filter((source): source is string => Boolean(source)))]
  const selectedCountry = comparisonCountries.find(country => country.code === filters.country)
  const isAdmin = user?.role === 'SUPER_ADMIN'

  return <section className="content overview-content">
    <div className="overview-welcome">
      <div>
        <div className="welcome-title"><h1>{user?.display_name ? `Welcome back, ${user.display_name}` : 'Welcome to ECONOVA'}</h1>{isAdmin && <span className="admin-badge">Administrator</span>}</div>
        <p>Economic intelligence for {selectedCountry?.name || filters.country} and the global economy.</p>
      </div>
      <div className="overview-date"><CalendarDays size={17} /><div><strong>{formatDateTime(new Date())}</strong><small>{latestRetrieval ? `Last source retrieval ${formatDateTime(latestRetrieval, true)}` : 'No source observations loaded yet'}</small></div></div>
    </div>
    {message && <StatusNotice error={message.toLowerCase().includes('failed') || message.toLowerCase().includes('unavailable') || message.includes('Check the source')}>{message}</StatusNotice>}
    <div className="overview-kpis">
      {overviewIndicators.map(indicator => {
        const items = seriesByCode[indicator.code]?.items || []
        const latest = items[items.length - 1]
        const previous = items[items.length - 2]
        const delta = latest && previous ? latest.value - previous.value : null
        const isFiscalBalance = indicator.code === 'OECD.EO.NLGQ'
        const fiscalDeficit = isFiscalBalance && latest && latest.value < 0
        return <article className="overview-kpi" key={indicator.code} style={{ '--metric-accent': indicator.color } as CSSProperties}>
          <div className="kpi-topline"><span className="kpi-icon"><indicator.icon size={18} /></span><span className="kpi-name">{indicator.label}</span><span className="kpi-period">{latest?.period || '—'}</span></div>
          <div className="kpi-value">{loading ? '…' : latest ? `${latest.value.toFixed(1)}%` : '—'}</div>
          <div className="kpi-foot"><span>{latest ? (isFiscalBalance ? `${fiscalDeficit ? 'Deficit' : 'Surplus'} · OECD estimate` : 'Latest observation') : 'No published observation'}</span>
            {delta !== null && <span className={`kpi-change ${delta >= 0 ? 'positive' : 'negative'}`}>{delta > 0 ? '+' : ''}{delta.toFixed(1)} pp</span>}
          </div>
        </article>
      })}
      <article className="overview-ai-card">
        <div className="ai-title"><Sparkles size={17} /><strong>AI Economist</strong><span>RESEARCH</span></div>
        <p>Ask economics questions, analyze uploads, and get answers grounded in selected-country data.</p>
        <NavLink to="/ai-economist">Open AI Economist <ArrowUpRight size={14} /></NavLink>
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
        </ResponsiveContainer></div> : <Empty title="No trend data yet" text="Use Sync selected country to request available historical observations. Missing indicators stay empty." />}
        <div className="freshness">Sources: {activeSources.join(', ') || 'World Bank / OECD when synced'} · annual publication; not a live market feed.</div>
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
    <div className="overview-data-source"><span>Sources: {activeSources.join(', ') || 'World Bank / OECD when synced'}</span><span>Retrieved: {latestRetrieval ? formatDateTime(latestRetrieval, true) : 'Not yet retrieved'}</span><span>{stats?.observations ?? 0} stored observations · no synthetic data</span></div>
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
      let response = await api.get('/observations', { params: { country, indicator, start, end, limit: 5000 } })
      // Older backend instances return an empty result without attempting an
      // automatic provider fetch. Keep the page functional during rolling deploys.
      if (!response.data.count && !response.data.message) {
        await ensureSeriesSynced(country, indicator, start, end)
        response = await api.get('/observations', { params: { country, indicator, start, end, limit: 5000 } })
      }
      const result = response
      setData(result.data.items)
      setTablePage(0)
      setSource(result.data.source)
      setSourceUrl(result.data.source_url)
      setUnit(result.data.unit)
      setRetrievedAt(result.data.retrieved_at)
      if (!result.data.count) setMessage(result.data.message || 'The provider has not published observations for this selection and period.')
      else setMessage(`${formatNumber(result.data.count)} observations loaded · source ${result.data.source || 'not recorded'}`)
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
      const result = await api.post('/ingestion/indicators', null, { params: { country, indicator, start, end } })
      setMessage(`${result.data.fetched ?? 0} observations fetched from ${result.data.provider || 'the data provider'}; ${result.data.inserted ?? 0} new, ${result.data.revised ?? 0} revised.`)
      await load()
    } catch (requestError) {
      setError(getError(requestError, 'Data sync failed. Your stored observations were not replaced.'))
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
      {busy && !data.length ? <div className="loading-state">Loading observations from ECONOVA and the public provider…</div> : <DataChart data={data} unit={unit || selectedIndicator?.unit} />}
      <div className="freshness">ECONOVA retrieval time: {retrievedAt ? formatDateTime(retrievedAt, true) : 'not yet retrieved'} · Source: {sourceUrl || 'not yet recorded'} · Provider series are periodically published, not real-time.</div>
    </div>
    <div className="panel table-panel">
      <div className="panel-head"><div><span className="eyebrow">OBSERVATION TABLE</span><h2>Provider records</h2></div><span className="tag">{data.length} ROWS</span></div>
      {data.length ? <><div className="table-scroll"><table><thead><tr>
        <th><button className="table-sort" onClick={() => { setSortMode(sortMode === 'newest' ? 'oldest' : 'newest'); setTablePage(0) }}>Period {sortMode === 'newest' ? '↓' : sortMode === 'oldest' ? '↑' : ''}</button></th>
        <th><button className="table-sort" onClick={() => { setSortMode(sortMode === 'value-asc' ? 'value-desc' : 'value-asc'); setTablePage(0) }}>Value {sortMode === 'value-asc' ? '↑' : sortMode === 'value-desc' ? '↓' : ''}</button></th>
        <th>Unit</th><th>Source</th></tr></thead><tbody>{visibleRows.map(item => <tr key={item.period}><td>{item.period}</td><td>{formatNumber(item.value, { maximumFractionDigits: 4 })}</td><td>{unit || selectedIndicator?.unit || '—'}</td><td>{source || '—'}</td></tr>)}</tbody></table></div>
        <div className="table-pagination"><span>{data.length} observations · page {tablePage + 1} of {Math.max(1, Math.ceil(data.length / pageSize))}</span><div><button className="secondary" onClick={() => setTablePage(Math.max(0, tablePage - 1))} disabled={tablePage === 0}>Previous</button><button className="secondary" onClick={() => setTablePage(Math.min(Math.ceil(data.length / pageSize) - 1, tablePage + 1))} disabled={(tablePage + 1) * pageSize >= data.length}>Next</button></div></div></> : <Empty title="No provider observations for this selection" text="ECONOVA checks the public source automatically. Try a wider year range or choose another country or indicator; no synthetic values are shown." />}
    </div>
  </section>
}

type DevelopmentObservation = { period: string; value: number }
type DevelopmentSeries = {
  code: string; name: string; unit: string; definition: string; economic_relevance: string
  provider: string; source_url: string; provider_status: 'available' | 'no_observations' | 'unavailable'
  error: string | null; latest: DevelopmentObservation | null; items: DevelopmentObservation[]
}
type DevelopmentOverview = {
  country: string; country_name: string; period_range: { start: number; end: number }
  provider: string; provider_url: string; retrieved_at: string; available_indicators: number
  unavailable_indicators: number; series: DevelopmentSeries[]; note: string
}

function formatDevelopmentValue(series?: DevelopmentSeries | null) {
  if (!series?.latest) return 'No observation'
  const value = Number(series.latest.value)
  return `${formatNumber(value, { maximumFractionDigits: 2 })}${series.unit.startsWith('%') ? '%' : ''}`
}

function DevelopmentPage({ module }: { module: ModuleLink }) {
  const [country, setCountry] = useState('IND')
  const [start, setStart] = useState(1990)
  const [end, setEnd] = useState(year)
  const [selectedCode, setSelectedCode] = useState('SI.POV.NAHC')
  const [overview, setOverview] = useState<DevelopmentOverview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    setBusy(true)
    setError('')
    setOverview(null)
    api.get('/development/overview', { params: { country, start, end, force_refresh: refresh > 0 } })
      .then(response => { if (active) setOverview(response.data) })
      .catch(requestError => { if (active) setError(getError(requestError, 'Development data could not be loaded from the provider.')) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [country, start, end, refresh])

  const poverty = overview?.series.find(item => item.code === 'SI.POV.NAHC')
  const selected = overview?.series.find(item => item.code === selectedCode)
  const peopleCards = ['SL.TLF.CACT.ZS', 'SP.POP.1564.TO', 'SE.ADT.LITR.ZS', 'SE.TER.ENRR', 'SP.DYN.LE00.IN', 'SL.UEM.TOTL.ZS', 'SL.AGR.EMPL.ZS', 'SL.IND.EMPL.ZS', 'SL.SRV.EMPL.ZS']
    .map(code => overview?.series.find(item => item.code === code)).filter((item): item is DevelopmentSeries => Boolean(item))
  const providerRecords = (selected?.items || []).slice().sort((a, b) => b.period.localeCompare(a.period))

  return <section className="content development-content">
    <Heading eyebrow={module.title} title="Development & Human Progress" desc="See how poverty, labor availability, education, health and job structure relate to an economy’s productive capacity and inclusion." actions={<span className="tag">WORLD BANK · LATEST RELEASES</span>} />
    <div className="panel controls development-controls">
      <label>Country<select value={country} onChange={event => setCountry(event.target.value)}>{comparisonCountries.map(item => <option value={item.code} key={item.code}>{item.flag} {item.name}</option>)}</select></label>
      <label>From year<input type="number" min="1960" max={end} value={start} onChange={event => setStart(Math.max(1960, Math.min(end, Number(event.target.value) || 1990)))} /></label>
      <label>To year<input type="number" min={start} max={year + 1} value={end} onChange={event => setEnd(Math.max(start, Math.min(year + 1, Number(event.target.value) || year)))} /></label>
      <button className="secondary" onClick={() => setRefresh(value => value + 1)} disabled={busy}><Activity size={15} />{busy ? 'Loading…' : 'Refresh provider data'}</button>
    </div>
    {error && <StatusNotice error>{error}</StatusNotice>}
    {overview && <>
      <section className="poverty-highlight panel">
        <div className="poverty-highlight-main"><span className="eyebrow">NATIONAL POVERTY RATE · {overview.country}</span><strong>{formatDevelopmentValue(poverty)}</strong><span>{poverty?.latest ? `Latest available survey: ${poverty.latest.period}` : 'No observation in the selected period'}</span></div>
        <div className="poverty-highlight-detail"><h2>{poverty?.name || 'Poverty headcount ratio at national poverty lines'}</h2><p>{poverty?.definition || 'The share of the population below the poverty line defined for the country.'}</p><p className="poverty-caveat">This is the national poverty line measure, not an international-dollar poverty estimate. Household-survey observations can be years apart; the latest record is not a current-year estimate.</p>{poverty?.source_url && <a href={poverty.source_url} target="_blank" rel="noreferrer">Open World Bank series <ArrowUpRight size={13} /></a>}</div>
      </section>
      <div className="development-stats-grid">
        {peopleCards.map(item => <article className="development-stat" key={item.code}><span>{item.name}</span><strong>{formatDevelopmentValue(item)}</strong><small>{item.latest ? `Latest record · ${item.latest.period} · ${item.unit}` : item.provider_status === 'unavailable' ? 'Provider temporarily unavailable' : 'No provider observation in this range'}</small><a href={item.source_url} target="_blank" rel="noreferrer">Provider series <ArrowUpRight size={12} /></a></article>)}
      </div>
      <div className="development-insight-grid">
        <section className="panel"><div className="panel-head"><div><span className="eyebrow">HUMAN RESOURCES IN THE ECONOMY</span><h2>What these measures help explain</h2></div><Users size={18} /></div><div className="development-use-list">
          <article><strong>Labor supply</strong><p>Working-age population and participation show the potential workforce and the share active in the labor market. They do not count job-ready skills by themselves.</p></article>
          <article><strong>Skills and productivity capacity</strong><p>Literacy and tertiary enrollment track parts of education access. They are not direct measures of learning quality, occupational skills, or worker productivity.</p></article>
          <article><strong>Health and inclusion</strong><p>Life expectancy and poverty help describe health and living standards that shape people’s ability to participate in and benefit from growth.</p></article>
          <article><strong>Economic transformation</strong><p>Agriculture, industry, and services employment shares show where people work and how the labor structure changes over time.</p></article>
        </div><p className="small-note">These indicators describe conditions and associations. They do not prove that a particular policy caused an economic outcome.</p></section>
        <section className="panel development-series-panel"><div className="panel-head"><div><span className="eyebrow">HISTORICAL PROVIDER SERIES</span><h2>{selected?.name || 'Select a series'}</h2><p>{selected?.definition}</p></div><span className="tag">{selected?.code}</span></div>
          <label className="development-series-select">Indicator<select value={selectedCode} onChange={event => setSelectedCode(event.target.value)}>{(overview.series || []).map(item => <option key={item.code} value={item.code}>{item.name} · {item.code}</option>)}</select></label>
          {selected?.economic_relevance && <div className="development-relevance"><strong>Economic use</strong><p>{selected.economic_relevance}</p></div>}
          <DataChart data={selected?.items || []} unit={selected?.unit} />
          <div className="freshness">Source: {selected?.provider || overview.provider} · {selected?.items.length || 0} observations · {selected?.source_url && <a href={selected.source_url} target="_blank" rel="noreferrer">official series</a>}</div>
        </section>
      </div>
      <section className="panel table-panel development-records-panel"><div className="panel-head"><div><span className="eyebrow">PROVIDER RECORDS</span><h2>{selected?.name} · {overview.country_name}</h2><p>One row per observation returned by the provider for the selected year range. Survey series may have gaps.</p></div><span className="tag">{providerRecords.length} RECORDS</span></div>
        {providerRecords.length ? <div className="table-scroll"><table><thead><tr><th>Year</th><th>Provider value</th><th>Unit</th><th>Provider</th><th>Source record</th></tr></thead><tbody>{providerRecords.map(item => <tr key={`${selectedCode}-${item.period}`}><td>{item.period}</td><td>{formatNumber(Number(item.value), { maximumFractionDigits: 4 })}</td><td>{selected?.unit}</td><td>{selected?.provider}</td><td><a href={selected?.source_url} target="_blank" rel="noreferrer">World Bank WDI</a></td></tr>)}</tbody></table></div> : <Empty title={selected?.provider_status === 'unavailable' ? 'Provider unavailable' : 'No provider records'} text={selected?.error || 'No observations were returned for this country, indicator and period. No zero values or estimates are inserted.'} />}
      </section>
      <div className="development-source-line"><Shield size={15} /><span>{overview.note}</span><span>Retrieved {formatDateTime(overview.retrieved_at, true)}</span></div>
    </>}
    {busy && !overview && <div className="panel"><div className="loading-state">Loading poverty, labor, education, health and employment observations from the World Bank…</div></div>}
    {!busy && !overview && !error && <div className="panel"><Empty text="Choose a country to load provider observations. Missing records remain blank; ECONOVA does not invent or interpolate values." /></div>}
  </section>
}

type MarketAsset = { id: string; name: string; symbol: string; exchange: string; currency: string }
type MarketCountry = { country_code: string; country: string; assets: MarketAsset[] }
type MarketPoint = { date: string; open: number | null; high: number | null; low: number | null; close: number; volume: number | null; sma20: number | null; sma50: number | null; sma200: number | null; rsi14: number | null }
type MarketAnalysis = {
  asset: MarketAsset & { country_code: string; country: string }; provider: string; source_url: string; currency: string
  retrieved_at: string; market_state?: string | null; market_delay_seconds?: number | null; interval?: string; intraday?: boolean; items: MarketPoint[]; summary: Record<string, any>
  patterns: Array<{ name: string; reading: string; signal: string; detail: string }>
  forecast: { horizon_sessions: number; horizon_unit?: string; central_estimate: number; range_low: number; range_high: number; range_confidence: string; model: string; return_observations: number; warning: string }
}

const marketRanges = [
  { value: '1d', label: '1 day · intraday' }, { value: '5d', label: '5 days · intraday' },
  { value: '1mo', label: '1 month' }, { value: '3mo', label: '3 months' }, { value: '6mo', label: '6 months' },
  { value: '1y', label: '1 year' }, { value: '5y', label: '5 years' },
]

function indexLevel(value: unknown) {
  if (value == null) return '—'
  const number = Number(value)
  return Number.isFinite(number) ? formatNumber(number, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
}

function FinancialDashboardPage({ module }: { module: ModuleLink }) {
  const global = useGlobalFilters()
  const [catalog, setCatalog] = useState<MarketCountry[]>([])
  const [catalogError, setCatalogError] = useState('')
  const [countryCode, setCountryCode] = useState('IND')
  const [assetId, setAssetId] = useState('india-nifty-50')
  const [range, setRange] = useState('1d')
  const [horizon, setHorizon] = useState(20)
  const [analysis, setAnalysis] = useState<MarketAnalysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    api.get('/finance/markets')
      .then(response => { if (active) setCatalog(response.data.countries || []) })
      .catch(requestError => { if (active) setCatalogError(getError(requestError, 'Market index list could not be loaded.')) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (catalog.some(item => item.country_code === global.country)) {
      if (global.country !== countryCode) setAnalysis(null)
      setCountryCode(global.country)
    }
  }, [global.country, catalog])

  const selectedCountry = catalog.find(item => item.country_code === countryCode) || catalog[0]
  const selectedAsset = selectedCountry?.assets.find(item => item.id === assetId) || selectedCountry?.assets[0]

  useEffect(() => {
    if (!selectedCountry?.assets.length) return
    if (!selectedCountry.assets.some(item => item.id === assetId)) setAssetId(selectedCountry.assets[0].id)
  }, [countryCode, catalog])

  useEffect(() => {
    if (!selectedAsset) return
    let active = true
    setBusy(true)
    setError('')
    api.get(`/finance/markets/${encodeURIComponent(selectedAsset.id)}`, { params: { range, horizon } })
      .then(response => { if (active) setAnalysis(response.data) })
      .catch(requestError => { if (active) setError(getError(requestError, 'Market history could not be loaded. Try again later.')) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [selectedAsset?.id, range, horizon, reload])

  useEffect(() => {
    if (!['1d', '5d'].includes(range)) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setReload(value => value + 1)
    }, 30000)
    return () => window.clearInterval(timer)
  }, [range, busy])

  function changeCountry(next: string) {
    setAnalysis(null)
    setCountryCode(next)
    const nextCountry = catalog.find(item => item.country_code === next)
    if (nextCountry?.assets[0]) setAssetId(nextCountry.assets[0].id)
    if (comparisonCountries.some(item => item.code === next)) {
      const filters = readFilters()
      const updated = { ...filters, country: next }
      localStorage.setItem('econova_filters', JSON.stringify(updated))
      window.dispatchEvent(new CustomEvent('econova:filters', { detail: updated }))
    }
  }

  function exportCsv() {
    if (!analysis) return
    const columns = ['date', 'open', 'high', 'low', 'close', 'volume', 'sma20', 'sma50', 'sma200', 'rsi14'] as const
    const csv = [columns.join(','), ...analysis.items.map(row => columns.map(column => row[column] ?? '').join(','))].join('\n')
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    anchor.download = `econova-${analysis.asset.id}-${range}.csv`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
  }

  const apiRoot = (api.defaults.baseURL || '/api/v1').replace(/\/$/, '')
  const chartUrl = selectedAsset ? `${apiRoot}/finance/markets/${encodeURIComponent(selectedAsset.id)}/plotly?range=${range}&refresh=${reload}` : ''
  const diagnosticsUrl = selectedAsset ? `${apiRoot}/finance/markets/${encodeURIComponent(selectedAsset.id)}/diagnostics.png?range=${range}` : ''
  const rows = analysis?.items.slice(-12).reverse() || []
  const summary = analysis?.summary

  return <section className="content finance-content">
    <Heading eyebrow={module.title} title="Financial Intelligence" desc="Follow sourced index prices, intraday bars, technical patterns, risk diagnostics and statistical scenarios." actions={<span className="tag">INTRADAY REFRESH · 30 SEC</span>} />
    <div className="panel finance-controls"><div className="controls">
      <label>Market country<select value={selectedCountry?.country_code || countryCode} onChange={event => changeCountry(event.target.value)}>{catalog.map(item => <option value={item.country_code} key={item.country_code}>{item.country}</option>)}</select></label>
      <label>Index<select value={selectedAsset?.id || ''} onChange={event => { setAnalysis(null); setAssetId(event.target.value) }}>{selectedCountry?.assets.map(asset => <option value={asset.id} key={asset.id}>{asset.name} · {asset.exchange}</option>)}</select></label>
      <label>Market window<select value={range} onChange={event => { setAnalysis(null); setRange(event.target.value) }}>{marketRanges.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
      <label>Scenario horizon<select value={horizon} onChange={event => setHorizon(Number(event.target.value))}><option value={5}>5 observations</option><option value={20}>20 observations</option><option value={60}>60 observations</option></select></label>
      <button className="secondary" onClick={() => setReload(value => value + 1)} disabled={busy}><Activity size={15} />{busy ? 'Loading…' : 'Refresh data'}</button>
      {analysis && <button className="secondary" onClick={exportCsv}><ArrowDownToLine size={15} />Export CSV</button>}
    </div></div>
    {catalogError && <StatusNotice error>{catalogError}</StatusNotice>}
    {error && <StatusNotice error>{error}</StatusNotice>}
    {analysis && summary && <>
      <div className="market-heading-row"><div><span className="eyebrow">{analysis.asset.country} · {analysis.asset.exchange}</span><h2>{analysis.asset.name} <small>{analysis.asset.symbol}</small></h2><p>Latest provider bar: {summary.latest_date} · {formatNumber(analysis.items.length)} {analysis.intraday ? 'intraday bars' : 'daily observations'} · {analysis.market_state || 'provider market status unavailable'}</p></div><a className="market-source" href={analysis.source_url} target="_blank" rel="noreferrer">Source: {analysis.provider} <ArrowUpRight size={13} /></a></div>
      <div className="stats-grid market-stats">
        <Stat label="Latest index level" value={indexLevel(summary.latest_close)} note={`Close · ${summary.latest_date}`} />
        <Stat label={analysis.intraday ? 'Latest bar move' : 'Session move'} value={<span className={summary.change_percent >= 0 ? 'market-positive' : 'market-negative'}>{summary.change_percent >= 0 ? '+' : ''}{Number(summary.change_percent).toFixed(2)}%</span>} note={`${summary.change >= 0 ? '+' : ''}${indexLevel(summary.change)} points vs prior ${analysis.intraday ? 'bar' : 'close'}`} />
        <Stat label={`RSI · 14 ${analysis.intraday ? 'bars' : 'sessions'}`} value={summary.rsi14 == null ? '—' : Number(summary.rsi14).toFixed(1)} note="Momentum oscillator · not a buy/sell signal" />
        <Stat label={summary.volatility_label || 'Realized volatility'} value={`${Number(summary.annualized_volatility_20d).toFixed(2)}%`} note={analysis.intraday ? 'Recent intraday bar returns · not annualized' : 'Annualized from recent daily returns'} />
        <Stat label={`20-${analysis.intraday ? 'bar' : 'session'} support zone`} value={indexLevel(summary.support_20d)} note="Lowest observed low in selected series" />
        <Stat label={`20-${analysis.intraday ? 'bar' : 'session'} resistance zone`} value={indexLevel(summary.resistance_20d)} note="Highest observed high in selected series" />
      </div>
      <section className="panel market-chart-panel"><div className="panel-head"><div><span className="eyebrow">PRICE ACTION · OHLC</span><h2>Candlestick chart and moving averages</h2><p>{analysis.intraday ? `Intraday OHLC bars (${analysis.interval || '1–5 minute'} intervals) with 20/50/200-bar averages and volume where supplied.` : 'Daily open, high, low and close with 20/50/200-session averages and volume where supplied.'}</p></div><span className="tag">{analysis.intraday ? 'INTRADAY · 30 SEC REFRESH' : 'PLOTLY'}</span></div><iframe className="plotly-market-frame" title={`${analysis.asset.name} ${analysis.intraday ? 'intraday' : 'daily'} candlestick chart`} src={chartUrl} loading="lazy" sandbox="allow-scripts" /></section>
      <div className="market-analysis-grid">
        <section className="panel"><div className="panel-head"><div><span className="eyebrow">TECHNICAL PATTERNS</span><h2>What the recent trend shows</h2></div><TrendingUp size={18} /></div><div className="market-pattern-list">{analysis.patterns.map(pattern => <article className={`market-pattern ${pattern.signal}`} key={pattern.name}><div><strong>{pattern.name}</strong><span>{pattern.reading}</span></div><p>{pattern.detail}</p></article>)}</div><p className="small-note">Indicators describe past prices. They do not establish what the market will do next.</p></section>
        <section className="panel forecast-range-panel"><div className="panel-head"><div><span className="eyebrow">STATISTICAL SCENARIO · {analysis.forecast.horizon_sessions} {analysis.forecast.horizon_unit || 'sessions'}</span><h2>Estimated closing-level range</h2></div><span className="tag">NOT A PROMISE</span></div><div className="forecast-range-values"><div><small>Lower range</small><strong>{indexLevel(analysis.forecast.range_low)}</strong></div><div className="forecast-center"><small>Central estimate</small><strong>{indexLevel(analysis.forecast.central_estimate)}</strong></div><div><small>Upper range</small><strong>{indexLevel(analysis.forecast.range_high)}</strong></div></div><div className="forecast-range-track"><span /></div><p>{analysis.forecast.range_confidence} based on {analysis.forecast.return_observations} recent {analysis.intraday ? 'bar' : 'daily'} returns. {analysis.forecast.model}.</p><StatusNotice>{analysis.forecast.warning}</StatusNotice></section>
      </div>
      {!analysis.intraday && <section className="panel market-diagnostics-panel"><div className="panel-head"><div><span className="eyebrow">RETURN & RISK DIAGNOSTICS</span><h2>Distribution and rolling volatility</h2><p>Daily return distribution and 20-session rolling volatility, plotted with Matplotlib and Seaborn.</p></div><span className="tag">MATPLOTLIB · SEABORN</span></div><img src={diagnosticsUrl} alt={`Daily return distribution and rolling volatility for ${analysis.asset.name}`} loading="lazy" /></section>}
      <section className="panel table-panel market-table-panel"><div className="panel-head"><div><span className="eyebrow">RECENT {analysis.intraday ? 'INTRADAY BARS' : 'DAILY OBSERVATIONS'}</span><h2>OHLCV market table</h2></div><span className="tag">{formatNumber(analysis.items.length)} {analysis.intraday ? 'BARS' : 'SESSIONS'}</span></div><div className="table-scroll"><table><thead><tr><th>Time</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th><th>SMA 20</th><th>SMA 50</th><th>RSI 14</th></tr></thead><tbody>{rows.map(row => <tr key={row.date}><td>{row.date}</td><td>{indexLevel(row.open)}</td><td>{indexLevel(row.high)}</td><td>{indexLevel(row.low)}</td><td>{indexLevel(row.close)}</td><td>{row.volume == null ? '—' : formatNumber(Number(row.volume))}</td><td>{indexLevel(row.sma20)}</td><td>{indexLevel(row.sma50)}</td><td>{row.rsi14 == null ? '—' : formatNumber(row.rsi14, { maximumFractionDigits: 1 })}</td></tr>)}</tbody></table></div></section>
      <div className="market-disclaimer"><Shield size={15} /><span>Source: <a href={analysis.source_url} target="_blank" rel="noreferrer">Yahoo Finance chart history</a>. Intraday view refreshes every 30 seconds while this tab is visible; provider delivery delay is not specified and can vary. This is not a licensed exchange feed or guaranteed real-time quote. Forecast bands are statistical scenarios, not trading recommendations or guaranteed highs/lows. Verify quotes with your broker before acting.</span><span>Retrieved {formatDateTime(analysis.retrieved_at, true)}</span></div>
    </>}
    {busy && !analysis && <div className="panel"><div className="loading-state">Loading daily index history and calculating indicators…</div></div>}
    {!busy && !analysis && !error && !catalogError && <div className="panel"><Empty text="Choose a country and index to load sourced daily market history. No sample or invented prices are shown." /></div>}
  </section>
}

type TradeOverview = {
  country: string; country_code: string; period: string; release_date: string | null; retrieved_at: string
  source: string; source_url: string; exports_usd: number; imports_usd: number; note: string
  confusion_matrix: { observations: number; accuracy_percent: number | null; method: string }
}

function TradeIntelligencePage({ module }: { module: ModuleLink }) {
  const global = useGlobalFilters()
  const allowed = ['IND', 'USA', 'CHN', 'JPN', 'DEU', 'GBR']
  const [country, setCountry] = useState(allowed.includes(global.country) ? global.country : 'IND')
  const [flow, setFlow] = useState('X')
  const [data, setData] = useState<TradeOverview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (allowed.includes(global.country) && global.country !== country) {
      setData(null)
      setCountry(global.country)
    }
  }, [global.country])
  useEffect(() => {
    let active = true
    setBusy(true)
    setError('')
    api.get('/trade/overview', { params: { country, force_refresh: refresh > 0 } })
      .then(response => { if (active) setData(response.data) })
      .catch(requestError => { if (active) setError(getError(requestError, 'UN Comtrade trade data could not be loaded.')) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [country, refresh])

  const apiRoot = (api.defaults.baseURL || '/api/v1').replace(/\/$/, '')
  const chartUrl = (name: string) => `${apiRoot}/trade/charts/${name}?country=${country}&flow=${flow}&refresh=${refresh}`
  const money = (value: number) => `$${formatNumber(value / 1e9, { maximumFractionDigits: 2 })}B`
  const releaseLabel = data?.release_date ? formatDateTime(`${data.release_date.replace(' ', 'T')}Z`, true) : 'release date not supplied'

  return <section className="content trade-content">
    <Heading eyebrow={module.title} title="Trade Intelligence" desc="Explore the latest reported goods-trade flows, trading partners, value distributions and a tested direction baseline." actions={<span className="tag">RELEASE-BASED DATA</span>} />
    <div className="panel controls trade-controls">
      <label>Reporter country<select value={country} onChange={event => { setData(null); setCountry(event.target.value) }}><option value="IND">India</option><option value="USA">United States</option><option value="CHN">China</option><option value="JPN">Japan</option><option value="DEU">Germany</option><option value="GBR">United Kingdom</option></select></label>
      <label>Partner charts<select value={flow} onChange={event => setFlow(event.target.value)}><option value="X">Exports</option><option value="M">Imports</option></select></label>
      <button className="secondary" onClick={() => setRefresh(value => value + 1)} disabled={busy}><Activity size={15} />{busy ? 'Loading…' : 'Refresh releases'}</button>
    </div>
    {error && <StatusNotice error>{error}</StatusNotice>}
    {data && <>
      <div className="trade-release-note"><Activity size={16} /><span>Latest available reporting period: <strong>{data.period}</strong> · released {releaseLabel}. Trade customs data updates when a reporter publishes a release; it is not a live market feed.</span><a href={data.source_url} target="_blank" rel="noreferrer">Provider documentation <ArrowUpRight size={13} /></a></div>
      <div className="stats-grid trade-stats">
        <Stat label="Reported exports" value={money(data.exports_usd)} note={`Goods · ${data.period} · USD`} />
        <Stat label="Reported imports" value={money(data.imports_usd)} note={`Goods · ${data.period} · USD`} />
        <Stat label="Trade balance" value={money(data.exports_usd - data.imports_usd)} note="Exports minus imports · reported month" />
        <Stat label="Backtest accuracy" value={data.confusion_matrix.accuracy_percent == null ? '—' : `${data.confusion_matrix.accuracy_percent.toFixed(1)}%`} note={`${data.confusion_matrix.observations} held-out monthly directions`} />
      </div>
      <div className="trade-chart-grid">
        <section className="panel trade-chart-card"><div className="trade-chart-heading"><div><span className="eyebrow">PARTNER RANKING</span><h2>{flow === 'X' ? 'Top export' : 'Top import'} partners</h2></div><span className="tag">USD</span></div><iframe className="trade-chart-frame" title={`${data.country} ${flow === 'X' ? 'export' : 'import'} partners bar chart`} src={chartUrl('bar')} loading="lazy" sandbox="allow-scripts" /></section>
        <section className="panel trade-chart-card"><div className="trade-chart-heading"><div><span className="eyebrow">PARTNER SHARES</span><h2>{flow === 'X' ? 'Export' : 'Import'} composition</h2></div><span className="tag">PIE</span></div><iframe className="trade-chart-frame" title={`${data.country} partner share pie chart`} src={chartUrl('pie')} loading="lazy" sandbox="allow-scripts" /></section>
        <section className="panel trade-chart-card"><div className="trade-chart-heading"><div><span className="eyebrow">VALUE DISTRIBUTION</span><h2>Partner-value boxplot</h2></div><span className="tag">BOX PLOT</span></div><iframe className="trade-chart-frame" title={`${data.country} partner trade value box plot`} src={chartUrl('box')} loading="lazy" sandbox="allow-scripts" /></section>
        <section className="panel trade-chart-card"><div className="trade-chart-heading"><div><span className="eyebrow">WALK-FORWARD BACKTEST</span><h2>Trade-balance confusion matrix</h2></div><span className="tag">BASELINE</span></div><iframe className="trade-chart-frame" title={`${data.country} trade balance direction confusion matrix`} src={chartUrl('matrix')} loading="lazy" sandbox="allow-scripts" /><p className="trade-matrix-note">{data.confusion_matrix.method}</p></section>
      </div>
      <div className="market-disclaimer"><Shield size={15} /><span>{data.note} Partner preview may omit records beyond the provider’s public preview limit. Values are reported customs statistics and may be revised.</span><span>Retrieved {formatDateTime(data.retrieved_at, true)}</span></div>
    </>}
    {busy && !data && <div className="panel"><div className="loading-state">Loading current trade release, partner flows and historical backtest…</div></div>}
    {!busy && !data && !error && <div className="panel"><Empty text="Choose a reporting country to load the latest released data. No sample trade values are shown." /></div>}
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
      let response
      try {
        response = await api.post('/forecasts', { country: filters.country, indicator, horizon, model: 'auto' })
      } catch (requestError) {
        if (!isLegacyEmptyForecast(requestError)) throw requestError
        await ensureSeriesSynced(filters.country, indicator, 1960, year + 1)
        response = await api.post('/forecasts', { country: filters.country, indicator, horizon, model: 'auto' })
      }
      setResult(response.data)
    } catch (requestError) {
      setError(isLegacyEmptyForecast(requestError)
        ? 'This series still has no observations after automatic sync. Check the selected country and indicator, then retry when the public provider is available.'
        : getError(requestError, 'Forecast unavailable. Check the public data connection and try again.'))
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
    {!result && !error && <div className="panel"><Empty text="Run forecast to load the selected public series automatically. The statistical model needs at least eight annual observations." /></div>}
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
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Calculating…' : 'Run sensitivity'}</button>
      </form>
      <div className="panel result-panel"><span className="eyebrow">CONDITIONAL RESULT</span><h2>Calculation</h2>
        {error && <StatusNotice error>{error}</StatusNotice>}
        {result ? <><div className="result-number">{formatNumber(Number(result.scenario), { maximumFractionDigits: 4 })}</div><div className="result-line"><span>Baseline</span><strong>{result.baseline}</strong></div><div className="result-line"><span>Absolute change</span><strong>{result.delta}</strong></div><div className="result-line"><span>Shock</span><strong>{result.shock_percent}%</strong></div><p className="muted methodology">{result.assumptions}</p></> : <Empty text="Enter a baseline and shock to calculate a conditional arithmetic sensitivity." />}
        <p className="small-note">This calculation is not an empirically estimated impact, forecast or policy recommendation.</p>
      </div>
    </div>
    <div className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">SCENARIO HISTORY</span><h2>Recent scenarios</h2></div><span className="tag">{saved.length} SAVED</span></div>
      {saved.length ? <div className="table-scroll"><table><thead><tr><th>Name</th><th>Variable</th><th>Baseline</th><th>Scenario</th><th>Shock</th></tr></thead><tbody>{saved.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.variable}</td><td>{item.baseline}</td><td>{item.scenario}</td><td>{item.shock_percent}%</td></tr>)}</tbody></table></div> : <Empty title="No saved scenarios" text="Visitor runs are not saved. Enter a baseline above to calculate a new sensitivity." />}</div>
  </section>
}

function AIEconomistPage({ module }: { module: ModuleLink }) {
  const filters = useGlobalFilters()
  const pageTitle = 'AI Economist'
  const pageDescription = 'Ask economics questions and analyze your own data with source-aware answers.'
  const uploadEyebrow = 'YOUR RESEARCH FILES'
  const uploadTitle = 'Upload data or documents'
  const uploadDescription = 'Upload economic data or documents for analysis.'
  const chatEyebrow = 'ECONOMICS COPILOT'
  const respondentTitle = 'ECONOMIST'
  const chatTitle = 'Ask your economist'
  const chatDescription = 'Questions are limited to economics and economic analysis.'
  const welcomeTitle = 'What would you like to understand?'
  const welcomeBody = 'Try a concept question or ask about the files you attached.'
  const questionLabel = 'Ask an economics question'
  const questionPlaceholder = 'Ask about GDP, inflation, policy, labor, trade, or your uploaded data...'
  const suggestedPrompts = [
    'Explain how inflation affects real wages.',
    'What does my dataset say about economic growth?',
    'Summarize the latest stored indicators for ' + filters.country + '.',
  ]
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ResearchChatMessage[]>([])
  const [uploads, setUploads] = useState<ResearchFile[]>([])
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null)
  const [model, setModel] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [statusError, setStatusError] = useState('')

  useEffect(() => {
    api.get('/research/status')
      .then(response => { setProviderConfigured(Boolean(response.data.provider_configured)); setModel(response.data.model || '') })
      .catch(() => { setStatusError('AI service status could not be loaded.'); setProviderConfigured(false) })
  }, [])

  async function uploadFiles(files: File[]) {
    if (!files.length) return
    setUploadError('')
    const available = Math.max(0, 5 - uploads.length)
    if (!available) { setUploadError('You can attach up to 5 files to one chat.'); return }
    setUploadBusy(true)
    try {
      for (const file of files.slice(0, available)) {
        const form = new FormData()
        form.append('file', file)
        const uploaded = (await api.post('/research/uploads', form)).data as ResearchFile
        setUploads(current => [...current, uploaded])
      }
      if (files.length > available) setUploadError('Only the first 5 attached files were accepted.')
    } catch (requestError) {
      setUploadError(getError(requestError, 'The file could not be analyzed. Check its format and try again.'))
    } finally {
      setUploadBusy(false)
    }
  }

  async function removeUpload(upload: ResearchFile) {
    setUploadError('')
    try {
      await api.delete('/research/uploads/' + upload.id, { headers: { 'X-Upload-Token': upload.token } })
    } catch {
      setUploadError('The server could not remove this file. It will expire automatically within 24 hours.')
    } finally {
      setUploads(current => current.filter(item => item.id !== upload.id))
    }
  }

  async function ask(event: FormEvent) {
    event.preventDefault()
    const prompt = question.trim()
    if (!prompt) return
    setBusy(true)
    setError('')
    try {
      const history = messages.slice(-12).map(message => ({ role: message.role, content: message.content }))
      const result = (await api.post('/research/ask', {
        question: prompt,
        country: filters.country,
        uploads: uploads.map(({ id, token }) => ({ id, token })),
        history,
      })).data
      setMessages(current => [
        ...current,
        { role: 'user', content: prompt },
        { role: 'assistant', content: result.answer, citations: result.citations || [], mode: result.mode },
      ])
      setQuestion('')
    } catch (requestError) {
      setError(getError(requestError, 'The research service is unavailable.'))
    } finally {
      setBusy(false)
    }
  }

  return <section className="content">
    <Heading eyebrow={module.title} title={pageTitle} desc={pageDescription} actions={<span className={providerConfigured ? 'tag' : 'status-pill'}>{providerConfigured ? 'GEMINI ? ' + model : 'AI SETUP NEEDED'}</span>} />
    {providerConfigured === false && <StatusNotice error={!statusError}>{statusError || 'Set GEMINI_API_KEY in the project .env or deployment environment, then restart the backend to enable conversational AI. Files can still be parsed and summarized locally.'}</StatusNotice>}
    <section className="panel research-upload-panel">
      <div className="research-panel-heading"><div><span className="eyebrow">{uploadEyebrow}</span><h2>{uploadTitle}</h2><p>{uploadDescription} CSV, TSV, Excel, JSON, PDF, Word, PowerPoint, text, HTML, and XML are supported, up to 15 MB each.</p></div><FileText size={19} /></div>
      <label className={uploadBusy ? 'research-dropzone disabled' : 'research-dropzone'}>
        <Upload size={20} /><strong>{uploadBusy ? 'Analyzing file...' : 'Choose files to analyze'}</strong><small>Files are parsed locally and attached to your questions. Attach up to 5 files.</small>
        <input type="file" multiple accept=".csv,.tsv,.xlsx,.xls,.json,.jsonl,.pdf,.docx,.pptx,.txt,.md,.markdown,.html,.htm,.xml" disabled={uploadBusy || uploads.length >= 5} onChange={(event: ChangeEvent<HTMLInputElement>) => { const selected = Array.from(event.currentTarget.files || []); event.currentTarget.value = ''; void uploadFiles(selected) }} />
      </label>
      <p className="small-note upload-privacy">Extracted text and summaries are retained for up to 24 hours. They are sent to Gemini only when you submit a question. Remove an attachment to delete it sooner.</p>
      {uploadError && <StatusNotice error>{uploadError}</StatusNotice>}
      {uploads.length > 0 && <div className="research-file-list">{uploads.map(upload => <article className="research-file" key={upload.id}>
        <div className="research-file-heading"><div><strong>{upload.filename}</strong><small>{upload.file_type} · {formatNumber(upload.analysis_characters)} analyzed characters</small></div><button className="text-button" type="button" onClick={() => void removeUpload(upload)} aria-label={'Remove ' + upload.filename}><Trash2 size={15} /> Remove</button></div>
        <details><summary>View automatic analysis</summary><pre>{upload.analysis_preview}</pre></details>
      </article>)}</div>}
    </section>
    <section className="panel economist-chat">
      <div className="research-panel-heading"><div><span className="eyebrow">{chatEyebrow}</span><h2>{chatTitle}</h2><p>{chatDescription}</p></div><Sparkles size={19} /></div>
      <div className="economist-transcript" aria-live="polite">
        {messages.length === 0 && <div className="economist-welcome"><strong>{welcomeTitle}</strong><span>{welcomeBody}</span><div className="economist-prompts">{suggestedPrompts.map(prompt => <button key={prompt} type="button" className="secondary" onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div></div>}
        {messages.map((message, index) => <article className={'economist-message ' + message.role} key={message.role + index}>
          <span className="economist-role">{message.role === 'user' ? 'YOU' : 'ECONOVA ' + respondentTitle}</span><div className="economist-message-content">{message.content}</div>
          {message.citations && message.citations.length > 0 && <div className="citations"><strong>Sources and files</strong>{message.citations.map((citation, citationIndex) => <div key={citation.id + citationIndex}>{citation.id} ? {citation.url ? <a href={citation.url} target="_blank" rel="noreferrer">{citation.source}</a> : citation.source}{citation.page ? ' ? page ' + citation.page : ''}</div>)}</div>}
        </article>)}
        {busy && <div className="economist-thinking" role="status">Analyzing your question and attached evidence...</div>}
      </div>
      {error && <StatusNotice error>{error}</StatusNotice>}
      <form className="research-composer" onSubmit={ask}>
        <label className="sr-only" htmlFor="economist-question">{questionLabel}</label>
        <textarea id="economist-question" value={question} onChange={event => setQuestion(event.target.value)} minLength={3} maxLength={2000} rows={3} placeholder={questionPlaceholder} required />
        <div className="research-composer-footer"><span>{uploads.length} file{uploads.length === 1 ? '' : 's'} attached ? {question.length}/2000</span><button className="primary" type="submit" disabled={busy || question.trim().length < 3}><Send size={15} />{busy ? 'Thinking...' : 'Ask'}</button></div>
      </form>
    </section>
  </section>
}

type PolicyCategory = 'All' | 'Fiscal' | 'Monetary' | 'Jobs & skills' | 'Industry & technology'

const policyStats = [
  { label: 'Real GDP growth', value: '7.8%', period: 'Q1 FY 2026–27', source: 'RBI · Oct 2026', url: 'https://rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=63742' },
  { label: 'CPI inflation', value: '6.09%', period: 'Oct 2026 · provisional', source: 'MoSPI · 12 Nov 2026', url: 'https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2335416&lang=1&reg=3' },
  { label: 'Unemployment', value: '5.1%', period: 'Jul–Sep 2026 · age 15+, CWS', source: 'MoSPI · PLFS', url: 'https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2334642&lang=1&reg=1' },
  { label: 'Policy repo rate', value: '5.50%', period: 'RBI decision · 7 Oct 2026', source: 'Reserve Bank of India', url: 'https://rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=63742' },
  { label: 'Union fiscal deficit', value: '4.3%', period: 'FY 2026–27 budget estimate · % GDP', source: 'Union Budget / FRBM', url: 'https://www.indiabudget.gov.in/doc/frbm1.pdf' },
]

const policyItems: Array<{
  category: Exclude<PolicyCategory, 'All'>; title: string; label: string; headline: string; summary: string
  goal: string; mechanism: string; measures: string; tradeoff: string; source: string; url: string; updated: string
}> = [
  {
    category: 'Fiscal', title: 'Union Budget fiscal path', label: 'FY 2026–27 · Budget estimate', headline: 'Fiscal deficit: 4.3% of GDP',
    summary: 'The Union Budget sets a lower deficit estimate while funding public investment and services.',
    goal: 'Preserve fiscal capacity and reduce debt over time while supporting development spending.',
    mechanism: 'The government finances expenditure through receipts and borrowing; the deficit is the annual gap between spending and receipts.',
    measures: 'Track deficit against GDP, interest costs, revenue receipts, and the quality and completion of capital projects.',
    tradeoff: 'Faster consolidation can limit demand and public services; borrowing can support investment but raises future interest obligations.',
    source: 'Union Budget 2026–27 · FRBM statement', url: 'https://www.indiabudget.gov.in/doc/frbm1.pdf', updated: 'Budget estimate, 2026–27',
  },
  {
    category: 'Fiscal', title: 'Public capital expenditure', label: 'Union Budget · FY 2026–27', headline: '₹12.22 lakh crore planned',
    summary: 'The budget allocates capital expenditure to create or improve public assets and productive capacity.',
    goal: 'Improve transport, energy, logistics and other infrastructure that can support private activity and access to services.',
    mechanism: 'Union capital spending and grants for capital assets fund public works; state capital support is included in the budget figure.',
    measures: 'Track releases, actual spending, project completion time, asset use, and access or logistics outcomes—not allocation alone.',
    tradeoff: 'The growth effect depends on project selection, execution capacity, maintenance and financing costs.',
    source: 'Union Budget 2026–27 · Budget at a Glance', url: 'https://www.indiabudget.gov.in/doc/Budget_at_Glance/budget_at_a_glance.pdf', updated: 'Budget estimate, 2026–27',
  },
  {
    category: 'Monetary', title: 'RBI monetary policy', label: 'Monetary Policy Committee · 7 Oct 2026', headline: 'Repo rate: 5.50%',
    summary: 'The RBI raised the repo rate by 25 basis points and changed its stance to calibrated tightening.',
    goal: 'Keep inflation aligned with the price-stability mandate while considering growth and financial conditions.',
    mechanism: 'The policy rate influences short-term funding costs, lending rates, demand, credit and inflation expectations with a lag.',
    measures: 'Watch CPI inflation and expectations, output and credit growth, lending rates, and subsequent MPC decisions.',
    tradeoff: 'Tighter rates can help contain broad price pressures, while also increasing borrowing costs and moderating demand.',
    source: 'RBI · Monetary Policy Statement, October 2026', url: 'https://rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=63742', updated: 'Decision announced 7 Oct 2026',
  },
  {
    category: 'Jobs & skills', title: 'Employment and skill alignment', label: 'Economic Survey · education and jobs', headline: 'Match training to work',
    summary: 'The Economic Survey identifies weak foundational skills and gaps between training and industry needs as continuing challenges.',
    goal: 'Make the school-to-work transition easier and improve job matching, participation and worker productivity.',
    mechanism: 'Connect foundational learning, vocational education, employer input and emerging technology skills.',
    measures: 'Track labour-force participation, employment and wages alongside course completion, placement and employer-reported skill gaps.',
    tradeoff: 'Training counts alone do not show whether workers find stable, productive jobs; results vary by region and sector.',
    source: 'Economic Survey 2025–26 · Employment and Skill Development', url: 'https://www.indiabudget.gov.in/economicsurvey/doc/eschapter/echap12.pdf', updated: 'Survey published 2026',
  },
  {
    category: 'Industry & technology', title: 'Semiconductor missions', label: 'India Semiconductor Mission · 2026', headline: '12 projects · ₹1.64 lakh crore commitments',
    summary: 'The government reports approved semiconductor projects and a follow-on mission focused on equipment, materials, design and supply chains.',
    goal: 'Build domestic semiconductor capability, strengthen supply resilience, and develop research and technical skills.',
    mechanism: 'Use targeted support across fabrication, advanced packaging, design, equipment, materials, R&D and talent development.',
    measures: 'Track projects reaching production, domestic value added, private investment realized, skilled placements and supply-chain capability.',
    tradeoff: 'Large commitments are not the same as completed investment or commercially competitive output; project execution and market demand matter.',
    source: 'PIB · Semiconductor programme factsheet, 2026', url: 'https://www.pib.gov.in/FactsheetDetails.aspx?Id=150860&lang=1&reg=+3', updated: 'Government update, 2026',
  },
]

function PolicyLabPage() {
  const [category, setCategory] = useState<PolicyCategory>('All')
  const categories: PolicyCategory[] = ['All', 'Fiscal', 'Monetary', 'Jobs & skills', 'Industry & technology']
  const visiblePolicies = category === 'All' ? policyItems : policyItems.filter(policy => policy.category === category)
  return <section className="content policy-content">
    <Heading eyebrow="ECONOVA POLICYLAB · INDIA" title="Policy & economic monitor" desc="Explore current national policy priorities alongside the latest available official economic releases. Select or hover a policy card for goals, mechanisms, measures and trade-offs." actions={<span className="tag">OFFICIAL SOURCES · UPDATED 14 NOV 2026</span>} />
    <div className="policy-data-note"><CalendarDays size={15} /><span>These are the latest releases available as of 14 Nov 2026; release periods differ. Figures are not live feeds. October CPI is provisional and the Union fiscal figures are budget estimates.</span></div>
    <div className="policy-stats-grid">{policyStats.map(stat => <article className="policy-stat-card" key={stat.label}>
      <span>{stat.label}</span><strong>{stat.value}</strong><small>{stat.period}</small>
      <a href={stat.url} target="_blank" rel="noreferrer">{stat.source} <ArrowUpRight size={12} /></a>
    </article>)}</div>
    <section className="panel policy-board">
      <div className="policy-board-heading"><div><span className="eyebrow">GOVERNMENT POLICIES</span><h2>Policy goals and implementation signals</h2><p>Use the information icon or focus a card to see why each policy exists and how its results can be assessed.</p></div><Landmark size={20} /></div>
      <div className="policy-filters" aria-label="Filter policies">{categories.map(item => <button key={item} className={category === item ? 'policy-filter active' : 'policy-filter'} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <div className="policy-grid">{visiblePolicies.map((policy, index) => <article className="policy-card" tabIndex={0} aria-describedby={`policy-detail-${index}`} key={policy.title}>
        <div className="policy-card-top"><span className="policy-category">{policy.category}</span><span className="policy-info" aria-hidden="true">i</span></div>
        <small className="policy-period">{policy.label}</small><h3>{policy.title}</h3><strong className="policy-headline">{policy.headline}</strong><p>{policy.summary}</p>
        <div id={`policy-detail-${index}`} className="policy-hover-detail" role="tooltip">
          <strong>{policy.title} · goal and evaluation</strong>
          <p><b>Goal:</b> {policy.goal}</p><p><b>How it works:</b> {policy.mechanism}</p><p><b>Measure:</b> {policy.measures}</p><p><b>Trade-off:</b> {policy.tradeoff}</p>
          <a href={policy.url} target="_blank" rel="noreferrer">{policy.source} <ArrowUpRight size={12} /></a>
          <small>{policy.updated}</small>
        </div>
        <details className="policy-touch-detail"><summary>View policy goal and details</summary><p><b>Goal:</b> {policy.goal}</p><p><b>How it works:</b> {policy.mechanism}</p><p><b>Measure:</b> {policy.measures}</p><p><b>Trade-off:</b> {policy.tradeoff}</p><a href={policy.url} target="_blank" rel="noreferrer">{policy.source} <ArrowUpRight size={12} /></a></details>
        <span className="policy-hint">Hover or focus for policy details</span>
      </article>)}</div>
    </section>
    <div className="panel policy-reading-note"><BookOpenText size={17} /><p><strong>How to read this page:</strong> allocations, approvals and policy intentions are inputs—not proof of economic impact. Compare them with observed outcomes and the evaluation measures shown on each card.</p></div>
  </section>
}

type ResearchCategory = 'All' | 'Infrastructure' | 'Jobs & skills' | 'Productivity' | 'Industrial growth'

const researchStudies: Array<{
  category: Exclude<ResearchCategory, 'All'>; title: string; organization: string; year: string; method: string
  question: string; finding: string; goal: string; measures: string; limitation: string; source: string; url: string
}> = [
  {
    category: 'Infrastructure', title: 'The Macroeconomic Effects of Public Investment in Developing Economies', organization: 'IMF Working Paper · Furceri & Li', year: '2017',
    method: 'Empirical analysis using forecast errors to identify unexpected public-investment changes.',
    question: 'Does public investment raise output in developing economies?',
    finding: 'The authors find higher output in the short and medium term, with an average short-run fiscal multiplier of about 0.2 in their sample. Effects appear larger in some conditions, including slack and more efficient investment.',
    goal: 'Prioritize projects with strong social returns and build the capacity to select, deliver and maintain them.',
    measures: 'Project completion and use, productivity, employment, private investment, and output over time.',
    limitation: 'A cross-country average is not a forecast for India or any single project; the paper reports IMF Working Paper research, not an official IMF policy position.',
    source: 'IMF Working Paper 17/217', url: 'https://www.imf.org/-/media/files/publications/wp/2017/wp17217.pdf',
  },
  {
    category: 'Jobs & skills', title: 'The Direct Employment Impact of Public Investment', organization: 'IMF Working Paper · Moszoro', year: '2021',
    method: 'Firm-level panel analysis of infrastructure companies across 41 countries over 19 years.',
    question: 'How many direct jobs are associated with infrastructure spending?',
    finding: 'The study estimates 10–17 direct jobs per US$1 million of infrastructure spending in emerging markets. It estimates direct employment only; indirect spillovers are excluded.',
    goal: 'Design infrastructure programmes that deliver useful assets and local employment, with training that helps workers access those jobs.',
    measures: 'Jobs created and sustained, local hiring, wages and job quality, project delivery, and skills gained.',
    limitation: 'The authors describe the sample as illustrative rather than statistically representative; these estimates are not a guaranteed result for a specific Indian project.',
    source: 'IMF Working Paper 21/131', url: 'https://www.elibrary.imf.org/view/journals/001/2021/131/article-A001-en.xml',
  },
  {
    category: 'Productivity', title: 'Efficiency-Adjusted Public Capital, Capital Grants, and Growth', organization: 'IMF Working Paper · Crivelli', year: '2017',
    method: 'Cross-country empirical analysis of 43 emerging and peripheral economies, 1991–2015.',
    question: 'Does the quality and efficiency of public capital matter for growth?',
    finding: 'The study reports that efficiency-adjusted public investment is significant in explaining growth differences across its sample.',
    goal: 'Improve project appraisal, procurement, implementation and maintenance so spending converts into usable capital.',
    measures: 'Cost and schedule overruns, asset condition and utilization, service access, and productivity after completion.',
    limitation: 'The sample and period limit direct transfer of the estimated relationship to current Indian programmes; association is not proof that every project causes growth.',
    source: 'IMF Working Paper · publication summary', url: 'https://www.imf.org/en/publications/wp/issues/2017/07/24/efficiency-adjusted-public-capital-capital-grants-and-growth-45084',
  },
  {
    category: 'Jobs & skills', title: 'Economic Survey: Employment and Skill Development', organization: 'Government of India · Economic Survey', year: '2025–26',
    method: 'Government synthesis of labour-market evidence, skills research and policy programmes.',
    question: 'What is holding back school-to-work transitions and job matching?',
    finding: 'The Survey describes skill mismatch linked to weak foundational skills, gaps between training and industry needs, and difficulty adapting to new technologies.',
    goal: 'Connect foundational learning, vocational pathways and employer demand, and improve transitions into productive work.',
    measures: 'Track job placement and wages after training, course completion, employer skill gaps, participation and youth employment.',
    limitation: 'This is a policy evidence synthesis, not a single causal experiment; proposed measures should be evaluated against worker outcomes.',
    source: 'Economic Survey 2025–26 · Chapter 12', url: 'https://www.indiabudget.gov.in/economicsurvey/doc/eschapter/echap12.pdf',
  },
  {
    category: 'Industrial growth', title: 'Economic Survey: Infrastructure and Growth', organization: 'Government of India · Economic Survey', year: '2025–26',
    method: 'Government review of infrastructure investment and the public-capex trend.',
    question: 'How has public capital outlay changed, and what should policy evaluation examine?',
    finding: 'The Survey reports Union capital outlay rising nearly 89% from ₹5.92 lakh crore in FY22 to a budgeted ₹11.21 lakh crore for FY26, and discusses infrastructure’s potential multiplier effects.',
    goal: 'Convert capital allocations into productive, accessible infrastructure while preserving fiscal sustainability.',
    measures: 'Compare budget allocation with actual expenditure, completed assets, logistics and service outcomes, and private investment response.',
    limitation: 'The allocation trend is descriptive. The Survey’s cited multiplier estimates are not a guaranteed return on any particular project.',
    source: 'Economic Survey 2025–26 · Infrastructure', url: 'https://www.indiabudget.gov.in/economicsurvey/doc/echapter.pdf',
  },
]

const researchGoals = [
  { title: 'More productive growth', icon: TrendingUp, outcomes: 'Real GDP per person · labour productivity · private investment', signal: 'Compare output and productivity growth with investment and capital use.' },
  { title: 'More and better jobs', icon: BriefcaseBusiness, outcomes: 'Unemployment · participation · wages · job stability', signal: 'Disaggregate by age, gender, location and work status; job counts alone miss job quality.' },
  { title: 'Infrastructure that works', icon: Landmark, outcomes: 'Completion · utilization · access · delivery cost', signal: 'Measure completed and functioning assets, not only announced allocations.' },
  { title: 'Skills that lead to work', icon: BookOpenText, outcomes: 'Placement · earnings after training · employer skill gaps', signal: 'Follow learners into jobs and compare results across training pathways.' },
  { title: 'Innovation and industry', icon: Sparkles, outcomes: 'R&D · domestic value added · exports · skilled employment', signal: 'Track investment realized and production capability alongside project approvals.' },
  { title: 'Stable, inclusive progress', icon: Activity, outcomes: 'Inflation · fiscal balance · poverty · service access', signal: 'Assess distribution and affordability alongside aggregate GDP and fiscal indicators.' },
]

function ResearchLabPage() {
  const [category, setCategory] = useState<ResearchCategory>('All')
  const categories: ResearchCategory[] = ['All', 'Infrastructure', 'Jobs & skills', 'Productivity', 'Industrial growth']
  const visibleStudies = category === 'All' ? researchStudies : researchStudies.filter(study => study.category === category)
  return <section className="content research-lab-content">
    <Heading eyebrow="ECONOVA RESEARCH LAB · EVIDENCE LIBRARY" title="Research for a stronger economy" desc="Explore what economic studies and the Economic Survey report, what goals the evidence can inform, and which outcomes to measure. These are curated summaries, not AI-generated claims." actions={<span className="tag">5 SOURCE-LINKED STUDIES</span>} />
    <div className="research-lab-note"><Shield size={15} /><span>Research findings describe specific studies and samples. Suggested goals below are measurable outcome areas, not official numerical targets or promised policy effects.</span></div>
    <section className="panel research-agenda">
      <div className="policy-board-heading"><div><span className="eyebrow">ECONOMIC RESEARCH AGENDA</span><h2>Goals worth measuring</h2><p>Use these outcome measures to judge whether growth policies improve opportunity, productivity and living standards.</p></div><Activity size={20} /></div>
      <div className="research-goal-grid">{researchGoals.map(goal => <article className="research-goal-card" key={goal.title}><div><goal.icon size={17} /><h3>{goal.title}</h3></div><strong>{goal.outcomes}</strong><p>{goal.signal}</p></article>)}</div>
    </section>
    <section className="panel research-evidence">
      <div className="policy-board-heading"><div><span className="eyebrow">RESEARCH FINDINGS</span><h2>What the evidence says about boosting the economy</h2><p>Each summary includes the research question, finding, policy goal, measures and an important limitation.</p></div><FlaskConical size={20} /></div>
      <div className="policy-filters" aria-label="Filter research">{categories.map(item => <button key={item} className={category === item ? 'policy-filter active' : 'policy-filter'} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <div className="research-study-grid">{visibleStudies.map(study => <article className="research-study-card" key={study.title}>
        <div className="study-meta"><span className="policy-category">{study.category}</span><span>{study.year}</span></div><h3>{study.title}</h3><p className="study-organization">{study.organization}</p>
        <div className="study-method"><strong>Research approach</strong><p>{study.method}</p></div>
        <div className="study-finding"><strong>Question and finding</strong><p><b>{study.question}</b> {study.finding}</p></div>
        <div className="study-goal"><strong>Economic goal</strong><p>{study.goal}</p><strong>What to measure</strong><p>{study.measures}</p></div>
        <div className="study-limitation"><strong>Limitations</strong><p>{study.limitation}</p></div>
        <a className="study-source" href={study.url} target="_blank" rel="noreferrer">Read source: {study.source} <ArrowUpRight size={13} /></a>
      </article>)}</div>
    </section>
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
  if (!isAdmin) return <section className="content"><Heading eyebrow="RESTRICTED AREA" title="Administration" desc="Administrator access is required to view users, settings and audit events." /><div className="panel"><StatusNotice error>Access denied. Administrator data remains protected.</StatusNotice></div></section>
  return <section className="content">
    <Heading eyebrow="SECURE CONTROL PLANE" title="Administration" desc="Protected platform monitoring. Sensitive values and provider credentials are never displayed here." actions={<span className="admin-identity"><Shield size={16} />Atharav | Administrator</span>} />
    {error && <StatusNotice error>{error}</StatusNotice>}{notice && <StatusNotice>{notice}</StatusNotice>}
    {summary && <div className="stats-grid"><Stat label="Users" value={summary.users} note="Registered accounts" /><Stat label="Observations" value={summary.observations} note={`Latest retrieval ${summary.latest_retrieval ? formatDateTime(summary.latest_retrieval) : 'not available'}`} /><Stat label="Data sources" value={summary.data_sources} note={`${summary.countries} countries in database`} /><Stat label="AI provider" value={summary.ai_provider_configured ? 'Configured' : 'Not configured'} note="Credentials not shown" /></div>}
    <div className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">USER MANAGEMENT</span><h2>Accounts & roles</h2></div><span className="tag">ADMIN ONLY</span></div>
      {users.length ? <div className="table-scroll"><table><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Created</th><th>Action</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td>{user.display_name}{user.display_name === 'Atharav' && <span className="small-note"> · Administrator</span>}</td><td>{user.email}</td><td>{user.role}</td><td>{formatDateTime(user.created_at)}</td><td><button className="text-button" onClick={() => changeRole(user)} disabled={busyUser === user.id || user.role === 'SUPER_ADMIN'}>{user.role === 'analyst' ? 'Set researcher' : user.role === 'researcher' ? 'Set analyst' : 'Protected admin'}</button></td></tr>)}</tbody></table></div> : !error && <Empty text="No accounts are available." />}</div>
    <div className="panel table-panel"><div className="panel-head"><div><span className="eyebrow">AUDIT LOG</span><h2>Recent administrative activity</h2></div></div>{audit.length ? <div className="table-scroll"><table><thead><tr><th>Time</th><th>Actor ID</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>{audit.map(item => <tr key={item.id}><td>{formatDateTime(item.created_at, true)}</td><td>{item.actor_user_id}</td><td>{item.action}</td><td>{item.target}</td><td>{item.details}</td></tr>)}</tbody></table></div> : !error && <Empty text="No recorded administrative events." />}</div>
  </section>
}

function SettingsPage({ user }: { user: any }) {
  const [preferences, setPreferences] = useState(readPreferences)
  const [supportSubject, setSupportSubject] = useState('')
  const [supportCategory, setSupportCategory] = useState('Problem report')
  const [supportDetails, setSupportDetails] = useState('')
  const [supportNotice, setSupportNotice] = useState('')

  function updatePreference<K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) {
    const next = { ...preferences, [key]: value }
    setPreferences(next)
    applyPreferences(next)
  }

  function resetPreferences() {
    setPreferences(defaultPreferences)
    applyPreferences(defaultPreferences)
    setSupportNotice('Appearance and regional preferences were reset on this device.')
  }

  function submitSupportReport(event: FormEvent) {
    event.preventDefault()
    const reportBody = [
      `Type: ${supportCategory}`,
      `Page: ${window.location.href}`,
      `Date: ${formatDateTime(new Date(), true)}`,
      '',
      supportDetails.trim(),
      '',
      'Please review this report before sending. ECONOVA does not send it automatically.',
    ].join('\n')
    if (preferences.supportEmail.trim()) {
      const mailto = `mailto:${encodeURI(preferences.supportEmail.trim())}?subject=${encodeURIComponent(`[ECONOVA] ${supportSubject.trim() || supportCategory}`)}&body=${encodeURIComponent(reportBody)}`
      window.location.href = mailto
      setSupportNotice('A draft was opened in your email app. Review it and send it there.')
      return
    }
    const file = new Blob([`Subject: ${supportSubject.trim() || supportCategory}\n${reportBody}\n`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `econova-support-report-${new Date().toISOString().slice(0, 10)}.txt`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setSupportNotice('Problem report downloaded. Add a support email above to open a pre-addressed email draft.')
  }

  const accentOptions: Array<{ value: AppPreferences['accent']; label: string; color: string }> = [
    { value: 'teal', label: 'Teal', color: '#14b8a6' }, { value: 'blue', label: 'Blue', color: '#3b82f6' },
    { value: 'violet', label: 'Violet', color: '#8b5cf6' }, { value: 'emerald', label: 'Emerald', color: '#10b981' },
  ]

  return <section className="content settings-content">
    <Heading eyebrow="PLATFORM" title="Settings" desc="Choose how ECONOVA looks and formats regional data. Preferences are saved in this browser." actions={<button className="secondary" onClick={resetPreferences}>Reset preferences</button>} />
    <div className="settings-card-grid">
      <section className="panel settings-panel preference-panel">
        <div className="settings-section-title"><span className="eyebrow">APPEARANCE</span><h2>Make the workspace yours</h2><p>Changes apply immediately and stay on this device.</p></div>
        <div className="settings-fields">
          <label>Color theme<select value={preferences.theme} onChange={event => updatePreference('theme', event.target.value as AppPreferences['theme'])}><option value="dark">Dark</option><option value="light">Light</option></select><small>Switch between dark and light interface colors.</small></label>
          <label>Interface density<select value={preferences.density} onChange={event => updatePreference('density', event.target.value as AppPreferences['density'])}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select><small>Compact mode reduces padding to fit more content.</small></label>
        </div>
        <div className="accent-setting"><span>Accent color</span><div className="accent-options" role="group" aria-label="Accent color">{accentOptions.map(option => <button type="button" key={option.value} className={`accent-choice ${preferences.accent === option.value ? 'selected' : ''}`} aria-pressed={preferences.accent === option.value} onClick={() => updatePreference('accent', option.value)}><i style={{ background: option.color }} />{option.label}</button>)}</div></div>
      </section>

      <section className="panel settings-panel preference-panel">
        <div className="settings-section-title"><span className="eyebrow">LANGUAGE & REGIONAL PREFERENCES</span><h2>Dates, time and number formats</h2><p>Regional settings affect date/time and number formatting. Interface labels are currently in English.</p></div>
        <div className="settings-fields">
          <label>Preferred language and number locale<select value={preferences.locale} onChange={event => updatePreference('locale', event.target.value as AppPreferences['locale'])}><option value="en-IN">English · India</option><option value="en-US">English · United States</option><option value="en-GB">English · United Kingdom</option><option value="hi-IN">Hindi · India</option><option value="de-DE">German · Germany</option><option value="ja-JP">Japanese · Japan</option></select></label>
          <label>Time zone<select value={preferences.timezone} onChange={event => updatePreference('timezone', event.target.value as AppPreferences['timezone'])}><option value="browser">Use browser time zone</option><option value="Asia/Kolkata">India · Kolkata</option><option value="UTC">UTC</option><option value="America/New_York">United States · New York</option><option value="Europe/London">United Kingdom · London</option><option value="Asia/Tokyo">Japan · Tokyo</option></select></label>
          <label>Date format<select value={preferences.dateFormat} onChange={event => updatePreference('dateFormat', event.target.value as AppPreferences['dateFormat'])}><option value="locale">Regional default</option><option value="dmy">DD/MM/YYYY</option><option value="mdy">MM/DD/YYYY</option><option value="iso">YYYY-MM-DD</option></select></label>
          <label>Measurement units<select value={preferences.units} onChange={event => updatePreference('units', event.target.value as AppPreferences['units'])}><option value="metric">Metric</option><option value="imperial">US customary</option></select><small>Example distance: {formatWithRegionalUnit(5, 'km')}. Compatible physical measures convert when available; provider currencies and source-defined units remain unchanged.</small></label>
        </div>
      </section>
    </div>

    <section className="panel settings-panel help-panel">
      <div className="settings-section-title"><span className="eyebrow">HELP & SUPPORT</span><h2>Find an answer or send a report</h2><p>Use the guide and FAQs below, or prepare a problem report for your support contact.</p></div>
      <div className="help-grid">
        <div className="help-card"><BookOpenText size={18} /><div><h3>Documentation</h3><p>Quick guide to modules, data freshness and provider records.</p></div></div>
        <div className="help-card"><CircleHelp size={18} /><div><h3>FAQs</h3><p>Answers to common questions about data and preferences.</p></div></div>
        <div className="help-card"><Send size={18} /><div><h3>Contact support</h3><p>Set your team's support email below. ECONOVA opens a draft in your email app; you review and send it.</p>{preferences.supportEmail.trim() && <a className="help-contact-link" href={`mailto:${encodeURI(preferences.supportEmail.trim())}`}>Email support</a>}</div></div>
      </div>
      <div className="help-details-grid">
        <details className="help-accordion" id="settings-guide"><summary>Open quick documentation</summary><div><p><strong>Modules:</strong> use the left navigation to open economic indicators, forecasts, Trade Intelligence, Financial Intelligence, PolicyLab, Research Lab, and Development & Human Progress.</p><p><strong>Provider data:</strong> use a module's refresh or sync control to request the latest data that provider publishes. Each observation keeps its source and reporting period; these releases are not all real-time.</p><p><strong>Preferences:</strong> appearance, locale, timezone, and units are stored locally in this browser. Use Reset preferences to restore defaults.</p></div></details>
        <details className="help-accordion"><summary>Frequently asked questions</summary><div><p><strong>Why does an indicator have an older year?</strong> Some measures come from household surveys and are only published every few years. ECONOVA shows the observation year and does not fill missing years.</p><p><strong>Does changing language translate every module?</strong> The language choice changes regional date and number formatting. The interface labels currently remain English.</p><p><strong>Are my preferences shared across devices?</strong> No. They remain in this browser's local storage.</p></div></details>
      </div>
    </section>

    <section className="panel settings-panel report-panel">
      <div className="settings-section-title"><span className="eyebrow">REPORT A PROBLEM</span><h2>Tell us what went wrong</h2><p>Reports are prepared in your browser. ECONOVA does not send them automatically.</p></div>
      {supportNotice && <StatusNotice>{supportNotice}</StatusNotice>}
      <div className="settings-fields support-contact-field"><label>Support email address<input type="email" value={preferences.supportEmail} onChange={event => updatePreference('supportEmail', event.target.value)} placeholder="support@your-organization.org" /><small>Saved only in this browser. Leave blank to download a report instead.</small></label></div>
      <form className="support-report-form" onSubmit={submitSupportReport}>
        <label>Report type<select value={supportCategory} onChange={event => setSupportCategory(event.target.value)}><option>Problem report</option><option>Data issue</option><option>Accessibility issue</option><option>General question</option></select></label>
        <label>Subject<input maxLength={120} required value={supportSubject} onChange={event => setSupportSubject(event.target.value)} placeholder="Briefly describe the issue" /></label>
        <label className="support-details-label">Details<textarea required minLength={10} maxLength={4000} rows={5} value={supportDetails} onChange={event => setSupportDetails(event.target.value)} placeholder="What happened, and what did you expect? Please do not include passwords or API keys." /></label>
        <button className="primary" type="submit"><Send size={15} />{preferences.supportEmail ? 'Open email draft' : 'Download problem report'}</button>
      </form>
    </section>

    <section className="panel settings-panel"><span className="eyebrow">ACCESS & DATA</span><h2>{user?.display_name || 'Public visitor'}</h2><div className="result-line"><span>Access mode</span><strong>{user?.role || 'Public access'}</strong></div>{user?.role === 'SUPER_ADMIN' && <div className="result-line"><span>Administrator identity</span><strong>Atharav | Administrator</strong></div>}<p className="muted">Economic series are stored locally and retrieved from World Bank and OECD APIs when needed. Data publication is periodic; these are not live market feeds. AI Economist uses Gemini when GEMINI_API_KEY is configured; attached files expire automatically.</p><p className="muted">Deployments require operator-supplied environment configuration. ECONOVA does not create cloud billing resources.</p></section>
  </section>
}

export default function App() {
  const [user, setUser] = useState<any>(null)
  useEffect(() => { applyPreferences(readPreferences()) }, [])
  useEffect(() => {
    if (!localStorage.getItem('econova_token')) return
    api.get('/auth/me')
      .then(response => setUser(response.data))
      .catch(() => localStorage.removeItem('econova_token'))
  }, [])
  return <Routes>
    <Route element={<Shell user={user} />}>
      <Route path="/" element={<Overview user={user} />} />
      <Route path="/pulse" element={<DataModule key="pulse" module={modules[0]} initialIndicator="NY.GDP.MKTP.KD.ZG" />} />
      <Route path="/global" element={<DataModule key="global" module={modules[1]} initialIndicator="NY.GDP.MKTP.KD.ZG" />} />
      <Route path="/forecast" element={<ForecastPage module={modules[2]} />} />
      <Route path="/ai-economist" element={<AIEconomistPage module={modules[3]} />} />
      <Route path="/policylab" element={<PolicyLabPage />} />
      <Route path="/simulator" element={<ScenarioPage module={modules[5]} />} />
      <Route path="/trade" element={<TradeIntelligencePage module={modules[6]} />} />
      <Route path="/finance" element={<FinancialDashboardPage module={modules[7]} />} />
      <Route path="/research-lab" element={<ResearchLabPage />} />
      <Route path="/research" element={<ResearchLabPage />} />
      <Route path="/data-explorer" element={<DataModule key="data-explorer" module={modules[9]} initialIndicator="NY.GDP.MKTP.KD.ZG" />} />
      <Route path="/development" element={<DevelopmentPage module={modules[10]} />} />
      <Route path="/insights" element={<ReportsPage module={modules[11]} />} />
      <Route path="/admin" element={<AdminPage user={user} />} />
      <Route path="/settings" element={<SettingsPage user={user} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
}
