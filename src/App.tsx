import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  admissions,
  audienceEntries,
  contactItems,
  featuredLinks,
  heroSlides,
  hotLinks,
  latestNews,
  performanceStats,
  primaryNavigation,
  storySections,
  visionSlides,
} from './data/knowledge'
import { askCampusAssistant, type AssistantFeedbackCapability } from './services/researchAssistant'
import { PublicAssistantFeedback } from './components/PublicAssistantFeedback'
import { listCampusPlaces, requestCampusRoute, type CampusDirectoryPlace, type CampusRoute } from './services/campusNavigation'

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
  status?: 'answered' | 'clarification' | 'abstained' | 'handoff'
  feedback?: AssistantFeedbackCapability
  citations?: Array<{ chunkId: string; title: string; sourceName: string; url: string; locator: string | null; reviewedAt: string | null }>
}

type IconName =
  | 'search'
  | 'menu'
  | 'close'
  | 'arrow-left'
  | 'arrow-right'
  | 'list'
  | 'building'
  | 'badge'
  | 'teacher'
  | 'lamp'
  | 'cap'
  | 'pin'
  | 'globe'
  | 'phone'
  | 'mail'
  | 'bus'
  | 'spark'

const newsTabs = ['ALL', '行政公告', '單位訊息', '焦點新聞', '就業情報', '其他事項']

const initialMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content: '您好，我是 STU AI 校園助理。可以詢問招生、行政單位、畢業規定、校園設施或常用系統。',
  },
]

const aiSuggestions = ['如何查詢招生訊息？', '行政單位在哪裡？', '畢業規定怎麼查？']

function Icon({ name, className }: { name: IconName; className?: string }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (name) {
    case 'search':
      return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
    case 'menu':
      return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
    case 'close':
      return <svg {...common}><path d="m5 5 14 14M19 5 5 19" /></svg>
    case 'arrow-left':
      return <svg {...common}><path d="m15 18-6-6 6-6" /></svg>
    case 'arrow-right':
      return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>
    case 'list':
      return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 8h7M9 12h7M9 16h7M7 8h.01M7 12h.01M7 16h.01" /></svg>
    case 'building':
      return <svg {...common}><path d="M3 21h18M6 18V9l6-3 6 3v9M9 21v-5h6v5" /></svg>
    case 'badge':
      return <svg {...common}><path d="M12 3 6 6v5c0 4.2 2.5 7.5 6 9 3.5-1.5 6-4.8 6-9V6l-6-3Z" /><path d="m9 11 2 2 4-4" /></svg>
    case 'teacher':
      return <svg {...common}><path d="M12 4 4 8l8 4 8-4-8-4Z" /><path d="M8 11v3.5c0 1.7 1.8 3 4 3s4-1.3 4-3V11" /></svg>
    case 'lamp':
      return <svg {...common}><path d="M9 18h6M10 22h4M12 2a6 6 0 0 0-3.7 10.7c.5.4.7.8.7 1.3V15h6v-1c0-.5.2-.9.7-1.3A6 6 0 0 0 12 2Z" /></svg>
    case 'cap':
      return <svg {...common}><path d="m2 9 10-5 10 5-10 5L2 9Z" /><path d="M6 11.5V15c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.5" /></svg>
    case 'pin':
      return <svg {...common}><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
    case 'globe':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
    case 'phone':
      return <svg {...common}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.8l-1.3 1.3a16 16 0 0 0 6.1 6.1l1.3-1.3a2 2 0 0 1 1.8-.6l3 .5a2 2 0 0 1 1.7 2Z" /></svg>
    case 'mail':
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>
    case 'bus':
      return <svg {...common}><path d="M7 17h10M6 17V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10" /><path d="M6 11h12M8 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM16 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" /></svg>
    case 'spark':
      return <svg {...common}><path d="m12 2 1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg>
  }
}

function App() {
  const [heroIndex, setHeroIndex] = useState(0)
  const [visionIndex, setVisionIndex] = useState(0)
  const [newsTab, setNewsTab] = useState('ALL')
  const [hotLinkTab, setHotLinkTab] = useState<'student' | 'teacher'>('student')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [messages, setMessages] = useState(initialMessages)
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [campusOpen, setCampusOpen] = useState(false)
  const [campusPlaces, setCampusPlaces] = useState<CampusDirectoryPlace[]>([])
  const [campusLoading, setCampusLoading] = useState(false)
  const [campusError, setCampusError] = useState('')
  const [campusOrigin, setCampusOrigin] = useState('')
  const [campusDestination, setCampusDestination] = useState('')
  const [accessibleRoute, setAccessibleRoute] = useState(false)
  const [campusRoute, setCampusRoute] = useState<CampusRoute | null>(null)
  const chatViewportRef = useRef<HTMLDivElement | null>(null)
  const campusLaunchRef = useRef<HTMLButtonElement | null>(null)
  const campusCloseRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroSlides.length)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const viewport = chatViewportRef.current
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (!campusOpen) return
    const launchButton = campusLaunchRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    campusCloseRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { setCampusOpen(false); return }
      if (event.key !== 'Tab') return
      const panel = campusCloseRef.current?.closest('.campus-directory-panel')
      const focusable = panel ? Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href]')) : []
      if (!focusable.length) return
      const first = focusable[0]; const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); launchButton?.focus() }
  }, [campusOpen])

  const visibleNews = newsTab === 'ALL'
    ? latestNews.slice(0, 8)
    : latestNews.filter((item) => item.category === newsTab).slice(0, 8)

  const visibleHotLinks = hotLinks.filter((link) => link.audience === hotLinkTab)
  const activeHero = heroSlides[heroIndex]

  function moveHero(direction: number) {
    setHeroIndex((current) => (current + direction + heroSlides.length) % heroSlides.length)
  }

  async function submitQuestion(nextQuestion?: string) {
    const trimmed = (nextQuestion ?? query).trim()
    if (!trimmed || isLoading) return
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', content: trimmed }])
    setQuery('')
    setErrorMessage('')
    setIsLoading(true)
    try {
      const response = await askCampusAssistant(trimmed)
      setMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: 'assistant', content: response.answer, status: response.status, citations: response.citations, feedback: response.feedback }])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'AI 助理目前暫時無法回應。')
    } finally {
      setIsLoading(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitQuestion()
  }

  async function openCampusDirectory() {
    setCampusOpen(true)
    if (campusPlaces.length || campusLoading) return
    setCampusLoading(true); setCampusError('')
    try { setCampusPlaces(await listCampusPlaces()) }
    catch (error) { setCampusError(error instanceof Error ? error.message : '校園導覽目前無法使用。') }
    finally { setCampusLoading(false) }
  }

  async function buildCampusRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!campusOrigin || !campusDestination || campusLoading) return
    setCampusLoading(true); setCampusError(''); setCampusRoute(null)
    try { setCampusRoute(await requestCampusRoute(campusOrigin, campusDestination, accessibleRoute)) }
    catch (error) { setCampusError(error instanceof Error ? error.message : '目前沒有符合條件的驗證路線。') }
    finally { setCampusLoading(false) }
  }

  return (
    <main className="stu-page">
      <a className="site-search-tab" href="https://www.stu.edu.tw/%e5%85%a8%e7%ab%99%e6%90%9c%e5%b0%8b/" aria-label="全站搜尋">
        <Icon name="search" />
      </a>

      <section className="hero" id="top" style={{ backgroundImage: `url(${activeHero.image})` }}>
        <div className="hero-overlay" />
        <header className="site-header">
          <a href="#top" className="logo-link" aria-label="樹德科技大學首頁">
            <img src="https://www.stu.edu.tw/wp-content/uploads/2026/01/stu-logo-2.png" alt="樹德科技大學 Shu-Te University" />
          </a>
          <button className="mobile-menu-button" type="button" aria-label="開啟主選單" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>
            <Icon name={mobileMenuOpen ? 'close' : 'menu'} />
          </button>
          <nav className={`primary-nav ${mobileMenuOpen ? 'open' : ''}`} aria-label="主選單">
            {primaryNavigation.map((item) => (
              <a key={item.label} href={item.href} onClick={() => setMobileMenuOpen(false)}>{item.label}</a>
            ))}
          </nav>
        </header>

        <button className="hero-arrow hero-arrow-left" type="button" aria-label="上一張輪播" onClick={() => moveHero(-1)}><Icon name="arrow-left" /></button>
        <div className="hero-content" key={activeHero.title}>
          <h1>{activeHero.title}</h1>
          <p>{activeHero.subtitle}</p>
          {activeHero.button && activeHero.href ? <a href={activeHero.href}>{activeHero.button}</a> : null}
        </div>
        <button className="hero-arrow hero-arrow-right" type="button" aria-label="下一張輪播" onClick={() => moveHero(1)}><Icon name="arrow-right" /></button>
        <div className="carousel-dots" aria-label="首頁輪播選擇">
          {heroSlides.map((slide, index) => (
            <button key={slide.image} className={index === heroIndex ? 'active' : ''} type="button" aria-label={`顯示第 ${index + 1} 張`} onClick={() => setHeroIndex(index)} />
          ))}
        </div>
      </section>

      <section className="audience-section angled-bottom" id="rolecategory">
        <h2>分眾入口</h2>
        <div className="audience-grid">
          {audienceEntries.map((entry) => (
            <a className="audience-card" href={entry.href} key={entry.title}>
              <div><h3>{entry.title}</h3><p>{entry.description}</p></div>
              <Icon name={entry.icon} />
            </a>
          ))}
        </div>
      </section>

      <section className="vision-section">
        <div className="title-lockup teal-title">
          <h2>看見樹德</h2>
          <img src="https://www.stu.edu.tw/wp-content/uploads/2026/01/bar.svg" alt="" />
          <p>SHU-TE UNIVERSITY</p>
        </div>
        <div className="vision-carousel">
          <button type="button" aria-label="上一張校園照片" onClick={() => setVisionIndex((visionIndex - 1 + visionSlides.length) % visionSlides.length)}><Icon name="arrow-left" /></button>
          <img src={visionSlides[visionIndex].image} alt={visionSlides[visionIndex].title} />
          <button type="button" aria-label="下一張校園照片" onClick={() => setVisionIndex((visionIndex + 1) % visionSlides.length)}><Icon name="arrow-right" /></button>
        </div>
        <div className="small-dots" aria-hidden="true">{visionSlides.map((slide, index) => <span key={slide.image} className={index === visionIndex ? 'active' : ''} />)}</div>
      </section>

      <section className="performance-section angled-both">
        <h2>我們的辦學績效</h2>
        <div className="performance-grid">
          {performanceStats.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <strong>{item.value}</strong>
              <img src={item.image} alt="" />
            </article>
          ))}
        </div>
      </section>

      <section className="stories-section">
        {storySections.map((story, index) => (
          <article className={`story ${index % 2 ? 'reverse' : ''}`} key={story.title}>
            <img className="story-photo" src={story.image} alt={story.title} />
            <div className="story-copy">
              <h2>{story.title}</h2>
              <span />
              <p>{story.description}</p>
              {index === 0 ? <a href={story.href}>了解更多</a> : null}
            </div>
          </article>
        ))}
      </section>

      <section className="campus-life-section">
        <div className="title-lockup white-title"><h2>進一步了解樹德的生活</h2><img src="https://www.stu.edu.tw/wp-content/uploads/2026/01/bar.svg" alt="" /></div>
        <a href="http://about.stu.edu.tw"><img src="https://www.stu.edu.tw/wp-content/uploads/2025/12/aboutstu-1024x532.jpg" alt="樹德科技大學校園生活" /></a>
      </section>

      <section className="campus-navigation-section" aria-labelledby="campus-navigation-title">
        <div><span>VERIFIED CAMPUS DIRECTORY</span><h2 id="campus-navigation-title">校園導覽與無障礙路線</h2><p>搜尋經校方資料來源驗證的地點，取得樓層、服務資訊與逐步文字路線。實地步行驗證完成前，請以現場標示為準。</p></div>
        <button ref={campusLaunchRef} type="button" onClick={() => void openCampusDirectory()}><Icon name="pin" />開啟校園導覽</button>
      </section>

      {campusOpen ? <div className="campus-directory-shell" role="dialog" aria-modal="true" aria-labelledby="campus-directory-title">
        <button className="campus-directory-backdrop" type="button" aria-label="關閉校園導覽" onClick={() => setCampusOpen(false)} />
        <section className="campus-directory-panel">
          <header><div><span>STU CAMPUS NAVIGATION</span><h2 id="campus-directory-title">驗證地點與文字路線</h2></div><button ref={campusCloseRef} type="button" aria-label="關閉校園導覽" onClick={() => setCampusOpen(false)}><Icon name="close" /></button></header>
          <form onSubmit={(event) => void buildCampusRoute(event)}>
            <label>起點<select value={campusOrigin} onChange={(event) => setCampusOrigin(event.target.value)} required><option value="">選擇起點</option>{campusPlaces.filter((place) => place.status === 'active').map((place) => <option key={`from-${place.id}`} value={place.code}>{place.name_zh} · {place.name_en}</option>)}</select></label>
            <label>目的地<select value={campusDestination} onChange={(event) => setCampusDestination(event.target.value)} required><option value="">選擇目的地</option>{campusPlaces.filter((place) => place.status === 'active').map((place) => <option key={`to-${place.id}`} value={place.code}>{place.name_zh} · {place.name_en}</option>)}</select></label>
            <label className="campus-accessible"><input type="checkbox" checked={accessibleRoute} onChange={(event) => setAccessibleRoute(event.target.checked)} />只使用無障礙路線（避開樓梯與不適用通道）</label>
            <button type="submit" disabled={campusLoading || !campusOrigin || !campusDestination}>{campusLoading ? '正在驗證路線…' : '建立文字路線'}</button>
          </form>
          {campusError ? <p className="campus-directory-error" role="alert">{campusError}</p> : null}
          {!campusLoading && !campusPlaces.length && !campusError ? <div className="campus-directory-empty"><strong>官方地點資料正在建置</strong><p>目前沒有已驗證且可公開的校園地點。系統不會以近似或模型產生的位置取代官方資料。</p></div> : null}
          {campusRoute ? <article className="campus-route-result" aria-live="polite"><header><div><span>{campusRoute.wheelchair ? '無障礙路線' : '一般步行路線'}</span><h3>{campusRoute.origin.name_zh} → {campusRoute.destination.name_zh}</h3></div><strong>{campusRoute.distanceMeters} m · 約 {Math.max(1, Math.ceil(campusRoute.estimatedSeconds / 60))} 分鐘</strong></header>{campusRoute.steps.length ? <ol>{campusRoute.steps.map((step, index) => <li key={step.edgeId}><span>{index + 1}</span><div><strong>{step.instructionZh}</strong><small>{step.instructionEn} · {step.distanceMeters} m · {step.environment}/{step.traversalType}</small></div></li>)}</ol> : <p>您已在目的地。</p>}<p className="campus-route-disclaimer">{campusRoute.disclaimer}</p></article> : null}
          {campusPlaces.length ? <div className="campus-place-directory"><h3>已驗證地點</h3>{campusPlaces.map((place) => <article key={place.id}><div><strong>{place.name_zh}</strong><span>{place.name_en} · {place.code}</span></div><p>{[place.building?.name_zh,place.floor?.label_zh,place.room].filter(Boolean).join(' · ') || place.place_type}</p><small className={place.status}>{place.status === 'temporarily_closed' ? `暫時關閉：${place.closure_reason}` : `驗證日期 ${new Date(place.verified_at).toLocaleDateString('zh-TW')}`}</small>{place.source?.canonical_url ? <a href={place.source.canonical_url} target="_blank" rel="noreferrer">官方來源</a> : null}</article>)}</div> : null}
        </section>
      </div> : null}

      <section className="admissions-section">
        <h2>招生專區</h2>
        <div className="admissions-grid">
          {admissions.map((item) => (
            <a href={item.href} key={item.title}>
              <img src={item.image} alt="" />
              <div><h3>{item.title}</h3><p>{item.description}</p></div>
            </a>
          ))}
        </div>
      </section>

      <section className="news-section" id="stunews">
        <div className="news-heading"><p>LATEST NEWS</p><h2>校園新聞</h2></div>
        <div className="news-tabs" role="tablist" aria-label="新聞分類">
          {newsTabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={tab === newsTab} className={tab === newsTab ? 'active' : ''} onClick={() => setNewsTab(tab)}>{tab}</button>)}
        </div>
        <div className="news-list">
          {visibleNews.map((item) => (
            <a href={item.href} key={`${item.category}-${item.title}`}><span>{item.category}</span><strong>{item.title}</strong><b>›</b></a>
          ))}
        </div>
        <a className="more-link" href="https://www.stu.edu.tw/latestnews">more</a>
      </section>

      <section className="hot-links-section" id="hotlink">
        <h2>熱門連結</h2>
        <div className="hot-tabs" role="tablist" aria-label="熱門連結分類">
          <button type="button" role="tab" aria-selected={hotLinkTab === 'student'} className={hotLinkTab === 'student' ? 'active' : ''} onClick={() => setHotLinkTab('student')}>學生專區</button>
          <button type="button" role="tab" aria-selected={hotLinkTab === 'teacher'} className={hotLinkTab === 'teacher' ? 'active' : ''} onClick={() => setHotLinkTab('teacher')}>教師專區</button>
        </div>
        <div className="hot-grid">
          {visibleHotLinks.map((item, index) => <a href={item.href} key={`${item.audience}-${item.title}-${index}`}>{item.title}</a>)}
        </div>
      </section>

      <section className="public-links-section">
        <h2>公開訊息</h2>
        <div className="public-links-grid">
          {featuredLinks.map((item) => <a href={item.href} key={item.image}><img src={item.image} alt={item.label} /></a>)}
        </div>
      </section>

      <footer className="site-footer">
        <div className="contact-grid">
          {contactItems.map((item) => (
            <a href={item.href} key={item.title}><Icon name={item.icon} /><span>{item.title}</span><strong>{item.detail}</strong></a>
          ))}
        </div>
        <div className="community-row">
          <a className="community-card" href="https://lin.ee/ZYTiDs2"><img src="https://www.stu.edu.tw/wp-content/uploads/2025/11/20-%E5%8A%A0%E5%85%A5%E6%9C%AC%E6%A0%A1%E7%A4%BE%E7%BE%A4-150x150.png" alt="加入本校社群" /><span>加入本校社群</span></a>
          <div className="social-links" aria-label="社群網站">
            <a className="facebook" href="https://www.facebook.com/ShuTeUniversity/" aria-label="Facebook">f</a>
            <a className="youtube" href="https://www.youtube.com/c/StuEduTw" aria-label="Youtube">▶</a>
            <a className="instagram" href="https://www.instagram.com/shute59/" aria-label="Instagram">◎</a>
            <a className="line" href="https://lin.ee/ZYTiDs2" aria-label="Line">L</a>
          </div>
          <a className="bus-link" href="https://things.stu.edu.tw/%e4%ba%a4%e9%80%9a%e8%bb%8a%e8%b3%87%e8%a8%8a/"><Icon name="bus" /><span>公車資訊</span></a>
        </div>
        <div className="copyright-row"><span>Copyright 2025. All Rights Reserved.</span><a href="https://www.stu.edu.tw/%e7%b6%b2%e7%ab%99%e5%9c%b0%e5%9c%96/">網站地圖</a></div>
      </footer>

      <button className="ai-launcher" type="button" aria-label="開啟 AI 校園助理" aria-expanded={assistantOpen} onClick={() => setAssistantOpen(true)}><Icon name="spark" /><span>AI 校園助理</span></button>
      {assistantOpen ? <button className="assistant-backdrop" type="button" aria-label="關閉 AI 校園助理" onClick={() => setAssistantOpen(false)} /> : null}
      <aside className={`assistant-drawer ${assistantOpen ? 'open' : ''}`} aria-hidden={!assistantOpen}>
        <header><div><span>AI-ENHANCED CAMPUS</span><h2>STU AI 校園助理</h2></div><button type="button" aria-label="關閉" onClick={() => setAssistantOpen(false)}><Icon name="close" /></button></header>
        <div className="assistant-messages" ref={chatViewportRef}>
          {messages.map((message) => <article className={message.role} key={message.id}><b>{message.role === 'assistant' ? 'STU AI' : 'YOU'}</b><p>{message.content}</p>{message.citations?.length ? <ul className="assistant-citations" aria-label="Official sources">{message.citations.map((citation) => <li key={`${message.id}-${citation.chunkId}`}><a href={citation.url} target="_blank" rel="noreferrer"><strong>{citation.title}</strong><span>{citation.sourceName}{citation.locator ? ` · ${citation.locator}` : ''}</span></a></li>)}</ul> : null}{message.role === 'assistant' && message.feedback ? <PublicAssistantFeedback capability={message.feedback} status={message.status} /> : null}</article>)}
          {isLoading ? <article className="assistant"><b>STU AI</b><p>正在檢索校園資訊...</p></article> : null}
        </div>
        <div className="assistant-suggestions">{aiSuggestions.map((item) => <button type="button" key={item} onClick={() => void submitQuestion(item)}>{item}</button>)}</div>
        {errorMessage ? <p className="assistant-error">{errorMessage}</p> : null}
        <form onSubmit={handleSubmit}><textarea rows={2} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="輸入校園相關問題..." /><button type="submit" disabled={isLoading}>送出</button></form>
      </aside>
    </main>
  )
}

export default App
