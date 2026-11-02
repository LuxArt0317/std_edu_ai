import { Search, Menu, X, ChevronLeft, ChevronRight, List, Building2, BadgeCheck, Presentation, Lightbulb, GraduationCap, MapPin, Globe, Phone, Mail, Bus, Sparkles } from 'lucide-react'
import { referenceAsset, referenceHref } from './features/public/site/reference'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { CheckboxField } from '@/components/form-controls'
import { Textarea } from '@/components/ui/textarea'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
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
import { PublicAssistantFeedback } from './features/public/PublicAssistantFeedback'
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
  const icons = { search: Search, menu: Menu, close: X, 'arrow-left': ChevronLeft, 'arrow-right': ChevronRight, list: List, building: Building2, badge: BadgeCheck, teacher: Presentation, lamp: Lightbulb, cap: GraduationCap, pin: MapPin, globe: Globe, phone: Phone, mail: Mail, bus: Bus, spark: Sparkles };
  const Component = icons[name];
  return <Component className={className} aria-hidden="true" strokeWidth={1.8}/>;
}

function movePublicTab<T extends string>(event: KeyboardEvent<HTMLDivElement>, labels: readonly T[], current: T, change: (value:T)=>void) {
  const currentIndex=labels.indexOf(current);
  const next=event.key==='Home'?0:event.key==='End'?labels.length-1:event.key==='ArrowRight'?(currentIndex+1)%labels.length:event.key==='ArrowLeft'?(currentIndex-1+labels.length)%labels.length:-1;
  if(next<0)return;
  event.preventDefault();change(labels[next]);event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
}

function App() {
  const [heroIndex, setHeroIndex] = useState(0)
  const [heroPaused, setHeroPaused] = useState(true)
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
    if (heroPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroSlides.length)
    }, 5000)
    return () => window.clearInterval(timer)
  }, [heroPaused])

  useEffect(() => {
    const viewport = chatViewportRef.current
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
  }, [messages, isLoading])

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

      <section className={`hero ${activeHero.artwork ? "has-artwork" : ""}`} id="top">
        <img className="reference-hero-image" src={referenceAsset(activeHero.image)} alt="" width="1920" height="800" fetchPriority="high" decoding="async" />
        <div className="hero-overlay" />
        <header className="site-header">
          <a href="#top" className="logo-link" aria-label="樹德科技大學首頁">
            <img src={referenceAsset("https://www.stu.edu.tw/wp-content/uploads/2026/01/stu-logo-2.png")} alt="樹德科技大學 Shu-Te University" />
          </a>
          <Button className="mobile-menu-button hidden max-[900px]:inline-flex" type="button" aria-label="開啟主選單" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)} variant="ghost">
            <Icon name={mobileMenuOpen ? 'close' : 'menu'} />
          </Button>
          <nav className={`primary-nav ${mobileMenuOpen ? 'open' : ''}`} aria-label="主選單">
            {primaryNavigation.map((item) => (
              <a key={item.label} href={referenceHref(item.href)} onClick={() => setMobileMenuOpen(false)}>{item.label}</a>
            ))}
          </nav>
        </header>

        <Button variant="ghost" className="hero-arrow hero-arrow-left bg-transparent p-0 text-white shadow-none" type="button" aria-label="上一張輪播" onClick={() => moveHero(-1)}><Icon name="arrow-left" /></Button>
        <div className={`hero-content ${activeHero.artwork ? "hero-artwork" : ""}`} key={activeHero.title}>
          {activeHero.artwork ? <a className="hero-artwork-link" href={activeHero.href}><h1 className="sr-only">{activeHero.title}</h1></a> : <>
          <h1>{activeHero.title}</h1>
          <p>{activeHero.subtitle}</p>
          {activeHero.button && activeHero.href ? <a href={activeHero.href}>{activeHero.button}</a> : null}</>}
        </div>
        <Button variant="ghost" className="hero-arrow hero-arrow-right bg-transparent p-0 text-white shadow-none" type="button" aria-label="下一張輪播" onClick={() => moveHero(1)}><Icon name="arrow-right" /></Button>
        <Button className="hero-pause" type="button" onClick={()=>setHeroPaused(!heroPaused)} aria-label={heroPaused?"播放輪播":"暫停輪播"}>{heroPaused?"播放":"暫停"}</Button>
        <div className="carousel-dots" aria-label="首頁輪播選擇">
          {heroSlides.map((slide, index) => (
            <Button key={slide.image} variant="ghost" className="size-6 min-w-0 rounded-full border-0 bg-transparent p-0 shadow-none hover:bg-white/20" type="button" aria-label={`顯示第 ${index + 1} 張`} aria-pressed={index===heroIndex} onClick={() => setHeroIndex(index)}><span className={index===heroIndex?'is-current':''}/></Button>
          ))}
        </div>
      </section>

      <section className="audience-section angled-bottom" id="rolecategory">
        <h2>分眾入口</h2>
        <div className="audience-grid">
          {audienceEntries.map((entry) => (
            <a className="audience-card" href={referenceHref(entry.href)} key={entry.title}>
              <div><h3>{entry.title}</h3><p>{entry.description}</p></div>
              <Icon name={entry.icon} />
            </a>
          ))}
        </div>
      </section>

      <section className="vision-section">
        <div className="title-lockup teal-title">
          <h2>看見樹德</h2>
          <img loading="lazy" src={referenceAsset("https://www.stu.edu.tw/wp-content/uploads/2026/01/bar.svg")} alt="" />
          <p>SHU-TE UNIVERSITY</p>
        </div>
        <div className="vision-carousel">
          <Button variant="ghost" className="bg-white/80 p-0 text-[#326f63] shadow-none" type="button" aria-label="上一張校園照片" onClick={() => setVisionIndex((visionIndex - 1 + visionSlides.length) % visionSlides.length)}><Icon name="arrow-left" /></Button>
          <div className="vision-photos">{visionSlides.map((_,offset)=>{const slide=visionSlides[(visionIndex+offset)%visionSlides.length];return <img key={slide.image} src={referenceAsset(slide.image)} alt={slide.title} loading="lazy"/>})}</div>
          <Button variant="ghost" className="bg-white/80 p-0 text-[#326f63] shadow-none" type="button" aria-label="下一張校園照片" onClick={() => setVisionIndex((visionIndex + 1) % visionSlides.length)}><Icon name="arrow-right" /></Button>
        </div>
        <div className="small-dots" aria-hidden="true">{visionSlides.map((slide, index) => <span key={slide.image} className={index === visionIndex ? 'active' : ''} />)}</div>
      </section>

      <section className="performance-section angled-both">
        <h2>我們的辦學績效</h2>
        <div className="performance-grid">
          {performanceStats.map((item) => (
            <Card key={item.title}>
              <h3>{item.title}</h3>
              <strong>{item.value}</strong>
              <img loading="lazy" src={referenceAsset(item.image)} alt="" />
            </Card>
          ))}
        </div>
      </section>

      <section className="stories-section">
        {storySections.map((story, index) => (
          <Card className={`story ${index % 2 ? 'reverse' : ''}`} key={story.title}>
            <img loading="lazy" className="story-photo" src={referenceAsset(story.image)} alt={story.title} />
            <div className="story-copy">
              <h2>{story.title}</h2>
              <span />
              <p>{story.description}</p>
              {index === 0 ? <a href={referenceHref(story.href)}>了解更多</a> : null}
            </div>
          </Card>
        ))}
      </section>

      <section className="campus-life-section">
        <div className="title-lockup white-title"><h2>進一步了解樹德的生活</h2><img loading="lazy" src={referenceAsset("https://www.stu.edu.tw/wp-content/uploads/2026/01/bar.svg")} alt="" /></div>
        <a href="http://about.stu.edu.tw"><img src={referenceAsset("https://www.stu.edu.tw/wp-content/uploads/2025/12/aboutstu.jpg")} loading="lazy" alt="樹德科技大學校園生活" /></a>
      </section>

      <section className="campus-navigation-section" aria-labelledby="campus-navigation-title">
        <div><span>VERIFIED CAMPUS DIRECTORY</span><h2 id="campus-navigation-title">校園導覽與無障礙路線</h2><p>搜尋經校方資料來源驗證的地點，取得樓層、服務資訊與逐步文字路線。實地步行驗證完成前，請以現場標示為準。</p></div>
        <Button ref={campusLaunchRef} type="button" onClick={() => void openCampusDirectory()}><Icon name="pin" />開啟校園導覽</Button>
      </section>

      {campusOpen ? <Dialog open onOpenChange={setCampusOpen}><DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto p-0 sm:max-w-4xl" onCloseAutoFocus={() => campusLaunchRef.current?.focus()}><DialogDescription className="sr-only">Browse verified campus places and generate an accessible route.</DialogDescription>
        <Button className="hidden" type="button" aria-label="關閉校園導覽" onClick={() => setCampusOpen(false)} variant="ghost" />
        <section className="campus-directory-panel">
          <header><div><span>STU CAMPUS NAVIGATION</span><DialogTitle asChild><h2 id="campus-directory-title">驗證地點與文字路線</h2></DialogTitle></div><Button ref={campusCloseRef} type="button" aria-label="關閉校園導覽" onClick={() => setCampusOpen(false)}><Icon name="close" /></Button></header>
          <form onSubmit={(event) => void buildCampusRoute(event)}>
            <Label>起點<NativeSelect value={campusOrigin} onChange={(event) => setCampusOrigin(event.target.value)} required><NativeSelectOption value="">選擇起點</NativeSelectOption>{campusPlaces.filter((place) => place.status === 'active').map((place) => <NativeSelectOption key={`from-${place.id}`} value={place.code}>{place.name_zh} · {place.name_en}</NativeSelectOption>)}</NativeSelect></Label>
            <Label>目的地<NativeSelect value={campusDestination} onChange={(event) => setCampusDestination(event.target.value)} required><NativeSelectOption value="">選擇目的地</NativeSelectOption>{campusPlaces.filter((place) => place.status === 'active').map((place) => <NativeSelectOption key={`to-${place.id}`} value={place.code}>{place.name_zh} · {place.name_en}</NativeSelectOption>)}</NativeSelect></Label>
            <Label className="campus-accessible"><CheckboxField type="checkbox" checked={accessibleRoute} onChange={(event) => setAccessibleRoute(event.target.checked)} />只使用無障礙路線（避開樓梯與不適用通道）</Label>
            <Button type="submit" disabled={campusLoading || !campusOrigin || !campusDestination}>{campusLoading ? '正在驗證路線…' : '建立文字路線'}</Button>
          </form>
          {campusError ? <p className="campus-directory-error" role="alert">{campusError}</p> : null}
          {!campusLoading && !campusPlaces.length && !campusError ? <div className="campus-directory-empty"><strong>官方地點資料正在建置</strong><p>目前沒有已驗證且可公開的校園地點。系統不會以近似或模型產生的位置取代官方資料。</p></div> : null}
          {campusRoute ? <Card className="campus-route-result" aria-live="polite"><header><div><span>{campusRoute.wheelchair ? '無障礙路線' : '一般步行路線'}</span><h3>{campusRoute.origin.name_zh} → {campusRoute.destination.name_zh}</h3></div><strong>{campusRoute.distanceMeters} m · 約 {Math.max(1, Math.ceil(campusRoute.estimatedSeconds / 60))} 分鐘</strong></header>{campusRoute.steps.length ? <ol>{campusRoute.steps.map((step, index) => <li key={step.edgeId}><span>{index + 1}</span><div><strong>{step.instructionZh}</strong><small>{step.instructionEn} · {step.distanceMeters} m · {step.environment}/{step.traversalType}</small></div></li>)}</ol> : <p>您已在目的地。</p>}<p className="campus-route-disclaimer">{campusRoute.disclaimer}</p></Card> : null}
          {campusPlaces.length ? <div className="campus-place-directory"><h3>已驗證地點</h3>{campusPlaces.map((place) => <Card key={place.id}><div><strong>{place.name_zh}</strong><span>{place.name_en} · {place.code}</span></div><p>{[place.building?.name_zh,place.floor?.label_zh,place.room].filter(Boolean).join(' · ') || place.place_type}</p><small className={place.status}>{place.status === 'temporarily_closed' ? `暫時關閉：${place.closure_reason}` : `驗證日期 ${new Date(place.verified_at).toLocaleDateString('zh-TW')}`}</small>{place.source?.canonical_url ? <a href={place.source.canonical_url} target="_blank" rel="noreferrer">官方來源</a> : null}</Card>)}</div> : null}
        </section>
      </DialogContent></Dialog> : null}

      <section className="admissions-section">
        <h2>招生專區</h2>
        <div className="admissions-grid">
          {admissions.map((item) => (
            <a href={referenceHref(item.href)} key={item.title}>
              <img loading="lazy" src={referenceAsset(item.image)} alt="" />
              <div><h3>{item.title}</h3><p>{item.description}</p></div>
            </a>
          ))}
        </div>
      </section>

      <section className="news-section" id="stunews">
        <div className="news-heading"><p>LATEST NEWS</p><h2>校園新聞</h2></div>
        <div className="news-tabs" role="tablist" aria-label="新聞分類" onKeyDown={event=>movePublicTab(event,newsTabs,newsTab,setNewsTab)}>
          {newsTabs.map((tab) => <Button key={tab} variant="ghost" type="button" role="tab" id={`news-tab-${tab}`} aria-controls="public-news-panel" tabIndex={tab===newsTab?0:-1} aria-selected={tab === newsTab} className={`rounded-none border-0 bg-transparent px-2 text-sm text-[#333] shadow-none hover:bg-[#e4f3ef] ${tab===newsTab?"active font-bold underline underline-offset-8":"font-normal"}`} onClick={() => setNewsTab(tab)}>{tab}</Button>)}
        </div>
        <div className="news-list" id="public-news-panel" role="tabpanel" aria-labelledby={`news-tab-${newsTab}`}>
          {visibleNews.map((item) => (
            <a href={referenceHref(item.href)} key={`${item.category}-${item.title}`}><span>{item.category}</span><strong>{item.title}</strong><b>›</b></a>
          ))}
        </div>
        <a className="more-link" href="https://www.stu.edu.tw/latestnews">more</a>
      </section>

      <section className="hot-links-section" id="hotlink">
        <h2>熱門連結</h2>
        <div className="hot-tabs" role="tablist" aria-label="熱門連結分類" onKeyDown={event=>movePublicTab(event,["student","teacher"] as const,hotLinkTab,setHotLinkTab)}>
          <Button type="button" role="tab" id="hot-tab-student" aria-controls="public-hot-panel" tabIndex={hotLinkTab==='student'?0:-1} aria-selected={hotLinkTab === 'student'} className={hotLinkTab === 'student' ? 'active' : ''} onClick={() => setHotLinkTab('student')}>學生專區</Button>
          <Button type="button" role="tab" id="hot-tab-teacher" aria-controls="public-hot-panel" tabIndex={hotLinkTab==='teacher'?0:-1} aria-selected={hotLinkTab === 'teacher'} className={hotLinkTab === 'teacher' ? 'active' : ''} onClick={() => setHotLinkTab('teacher')}>教師專區</Button>
        </div>
        <div className="hot-grid" id="public-hot-panel" role="tabpanel" aria-labelledby={`hot-tab-${hotLinkTab}`}>
          {visibleHotLinks.map((item, index) => item.href ? <a href={referenceHref(item.href)} key={`${item.audience}-${item.title}-${index}`}>{item.title}</a> : <span key={`${item.audience}-${item.title}-${index}`}>{item.title}</span>)}
        </div>
      </section>

      <section className="public-links-section">
        <h2>公開訊息</h2>
        <div className="public-links-grid">
          {featuredLinks.map((item) => <a href={referenceHref(item.href)} key={item.image}><img loading="lazy" src={referenceAsset(item.image)} alt={item.label} /></a>)}
        </div>
      </section>

      <footer className="site-footer">
        <div className="contact-grid">
          {contactItems.map((item) => (
            <a href={referenceHref(item.href)} key={item.title}><Icon name={item.icon} /><span>{item.title}</span><strong>{item.detail}</strong></a>
          ))}
        </div>
        <div className="community-row">
          <a className="community-card" href="https://lin.ee/ZYTiDs2"><img loading="lazy" src={referenceAsset("https://www.stu.edu.tw/wp-content/uploads/2025/11/20-%E5%8A%A0%E5%85%A5%E6%9C%AC%E6%A0%A1%E7%A4%BE%E7%BE%A4-150x150.png")} alt="" /><span>加入本校社群</span></a>
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

      <Button className="ai-launcher" type="button" aria-label="開啟 AI 校園助理" aria-expanded={assistantOpen} onClick={() => setAssistantOpen(true)}><Icon name="spark" /><span>AI 校園助理</span></Button>
      {assistantOpen ? <Button className="assistant-backdrop" type="button" aria-label="關閉 AI 校園助理" onClick={() => setAssistantOpen(false)} variant="ghost" /> : null}
      <aside className={`assistant-drawer ${assistantOpen ? 'open' : ''}`} aria-hidden={!assistantOpen} inert={!assistantOpen}>
        <header><div><span>AI-ENHANCED CAMPUS</span><h2>STU AI 校園助理</h2></div><Button type="button" aria-label="關閉" onClick={() => setAssistantOpen(false)}><Icon name="close" /></Button></header>
        <div className="assistant-messages" ref={chatViewportRef} role="log" aria-live="polite" aria-relevant="additions">
          {messages.map((message) => <Card className={message.role} key={message.id}><b>{message.role === 'assistant' ? 'STU AI' : 'YOU'}</b><p>{message.content}</p>{message.citations?.length ? <ul className="assistant-citations" aria-label="Official sources">{message.citations.map((citation) => <li key={`${message.id}-${citation.chunkId}`}><a href={citation.url} target="_blank" rel="noreferrer"><strong>{citation.title}</strong><span>{citation.sourceName}{citation.locator ? ` · ${citation.locator}` : ''}</span></a></li>)}</ul> : null}{message.role === 'assistant' && message.feedback ? <PublicAssistantFeedback capability={message.feedback} status={message.status} /> : null}</Card>)}
          {isLoading ? <Card className="assistant" role="status"><b>STU AI</b><p>正在檢索校園資訊...</p></Card> : null}
        </div>
        <div className="assistant-suggestions">{aiSuggestions.map((item) => <Button type="button" key={item} onClick={() => void submitQuestion(item)}>{item}</Button>)}</div>
        {errorMessage ? <p className="assistant-error">{errorMessage}</p> : null}
        <form onSubmit={handleSubmit}><Textarea rows={2} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="輸入校園相關問題..." /><Button type="submit" disabled={isLoading}>送出</Button></form>
      </aside>
    </main>
  )
}

export default App
