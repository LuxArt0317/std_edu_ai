import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  audienceEntries,
  contactItems,
  campusDestinations,
  evaluationQuestions,
  faqItems,
  featuredLinks,
  heroSlides,
  hotLinks,
  knowledgeCategories,
  latestNews,
  performanceStats,
  storySections,
  visionSlides,
} from './data/knowledge'
import { askCampusAssistant } from './services/mockAssistant'
import { supabase } from './utils/supabase'
import { findCampusDestination, searchKnowledge } from './services/campusEngine'

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
}

type Todo = {
  id: number | string
  name: string
}

type SurveyValues = Record<string, string>

type IconName =
  | 'search'
  | 'list'
  | 'building'
  | 'badge'
  | 'teacher'
  | 'lamp'
  | 'cap'
  | 'pin'
  | 'globe'
  | 'briefcase'
  | 'card'
  | 'trophy'
  | 'phone'
  | 'mail'
  | 'users'
  | 'bus'
  | 'spark'

const navItems = [
  '關於樹德',
  '招生訊息',
  '行政單位',
  '學術單位',
  '推廣教育',
  '弱勢勸募',
  '分眾入口',
  '最新消息',
  '熱門連結',
  'English',
  '全站搜尋',
]

const initialMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content:
      '您好，這是 STU AI 助理。可詢問招生訊息、行政單位、畢業規定、校園設施、位置與常用入口。',
  },
]

const aiSuggestions = [
  '如何查詢招生訊息？',
  '行政單位在哪裡？',
  '這個新版網站加入了什麼 AI 功能？',
]

function Icon({ name, className }: { name: IconName; className?: string }) {
  const common = { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  switch (name) {
    case 'search':
      return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
    case 'list':
      return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 8h7M9 12h7M9 16h7M7 8h.01M7 12h.01M7 16h.01" /></svg>
    case 'building':
      return <svg {...common}><path d="M3 21h18M6 18V9l6-3 6 3v9M9 21v-5h6v5" /></svg>
    case 'badge':
      return <svg {...common}><path d="M12 3 6 6v5c0 4.2 2.5 7.5 6 9 3.5-1.5 6-4.8 6-9V6l-6-3Z" /><path d="M8.5 10.5c1.5-.4 2.8-.4 3.5-.2 1-.8 2.4-1.2 3.5-1" /></svg>
    case 'teacher':
      return <svg {...common}><path d="M12 4 4 8l8 4 8-4-8-4Z" /><path d="M8 11v3.5c0 1.7 1.8 3 4 3s4-1.3 4-3V11" /></svg>
    case 'lamp':
      return <svg {...common}><path d="M9 18h6M10 22h4M12 2a6 6 0 0 0-3.7 10.7c.5.4.7.8.7 1.3V15h6v-1c0-.5.2-.9.7-1.3A6 6 0 0 0 12 2Z" /></svg>
    case 'cap':
      return <svg {...common}><path d="m2 9 10-5 10 5-10 5L2 9Z" /><path d="M6 11.5v3.5c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.5" /></svg>
    case 'pin':
      return <svg {...common}><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
    case 'globe':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>
    case 'briefcase':
      return <svg {...common}><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M3 12h18" /></svg>
    case 'card':
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></svg>
    case 'trophy':
      return <svg {...common}><path d="M8 4h8v2a4 4 0 0 1-8 0V4Z" /><path d="M6 4H4a2 2 0 0 0 2 4M18 4h2a2 2 0 0 1-2 4M12 10v4M9 21h6M10 14h4l1 3H9l1-3Z" /></svg>
    case 'phone':
      return <svg {...common}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.8l-1.3 1.3a16 16 0 0 0 6.1 6.1l1.3-1.3a2 2 0 0 1 1.8-.6l3 .5a2 2 0 0 1 1.7 2Z" /></svg>
    case 'mail':
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>
    case 'users':
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="3.5" /><path d="M20 21v-2a4 4 0 0 0-3-3.9M15 3.2a3.5 3.5 0 0 1 0 6.6" /></svg>
    case 'bus':
      return <svg {...common}><path d="M7 17h10M6 17V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10" /><path d="M6 11h12M8 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM16 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" /></svg>
    case 'spark':
      return <svg {...common}><path d="m12 3 1.8 4.8L19 9.6l-4.2 2.4L13 17l-1.8-5-4.2-2.4 5.2-1.8L12 3Z" /></svg>
  }
}

function App() {
  const [messages, setMessages] = useState(initialMessages)
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [todos, setTodos] = useState<Todo[]>([])
  const [todosError, setTodosError] = useState('')
  const [isTodosLoading, setIsTodosLoading] = useState(true)
  const [knowledgeQuery, setKnowledgeQuery] = useState('graduation requirements')
  const [navigationQuery, setNavigationQuery] = useState('圖資大樓')
  const [surveySubmitted, setSurveySubmitted] = useState(false)
  const [surveyValues, setSurveyValues] = useState<SurveyValues>(() =>
    Object.fromEntries(evaluationQuestions.map((_, index) => [`q${index}`, ''])),
  )
  const chatViewportRef = useRef<HTMLDivElement | null>(null)
  const knowledgeResults = searchKnowledge(knowledgeQuery)
  const navigationResult = findCampusDestination(navigationQuery)

  useEffect(() => {
    const viewport = chatViewportRef.current
    if (!viewport) return
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    async function getTodos() {
      setIsTodosLoading(true)
      setTodosError('')

      const { data, error } = await supabase
        .from('todos')
        .select('id, name')
        .order('id', { ascending: true })

      if (error) {
        setTodosError(error.message)
        setTodos([])
      } else {
        setTodos(data ?? [])
      }

      setIsTodosLoading(false)
    }

    void getTodos()
  }, [])

  useEffect(() => {
    const saved = window.localStorage.getItem('stu-eval-survey')
    if (!saved) return

    try {
      const parsed = JSON.parse(saved) as SurveyValues
      setSurveyValues((current) => ({ ...current, ...parsed }))
      setSurveySubmitted(true)
    } catch {
      // Ignore invalid local state.
    }
  }, [])

  async function submitQuestion(nextQuestion?: string) {
    const trimmedQuery = (nextQuestion ?? query).trim()
    if (!trimmedQuery || isLoading) return

    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', content: trimmedQuery },
    ])
    setQuery('')
    setErrorMessage('')
    setIsLoading(true)

    try {
      const response = await askCampusAssistant(trimmedQuery)
      setMessages((current) => [
        ...current,
        { id: `assistant-${Date.now()}`, role: 'assistant', content: response.answer },
      ])
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'AI 助理目前暫時無法回應。',
      )
    } finally {
      setIsLoading(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitQuestion()
  }

  function handleSurveySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    window.localStorage.setItem('stu-eval-survey', JSON.stringify(surveyValues))
    setSurveySubmitted(true)
  }

  return (
    <main className="stu-page">
      <a className="floating-search" href="#assistant" aria-label="Search and AI assistant">
        <Icon name="search" className="floating-search-icon" />
      </a>

      <section className="hero" id="hero">
        <div className="hero-shade" />
        <header className="hero-header">
          <img
            className="hero-logo"
            src="https://www.stu.edu.tw/wp-content/uploads/2026/01/stu-logo-2.png"
            alt="Shu-Te University"
          />
          <nav className="hero-nav" aria-label="Primary">
            {navItems.map((item, index) => (
              <span className="hero-nav-item" key={item}>
                <a href={item === '分眾入口' ? '#audiences' : item === '熱門連結' ? '#links' : item === '最新消息' ? '#news' : '#hero'}>
                  {item}
                </a>
                {index < navItems.length - 1 ? <span className="nav-divider">|</span> : null}
              </span>
            ))}
          </nav>
        </header>

        <div className="hero-stage">
          <button className="hero-arrow left" type="button" aria-label="Previous slide">
            ‹
          </button>
          <div className="hero-copy">
            <h1>新首頁上線</h1>
            <p>請填寫回饋單留寶貴意見</p>
            <a className="hero-cta" href="#assistant">
              填寫首頁使用回饋單
            </a>
          </div>
          <button className="hero-arrow right" type="button" aria-label="Next slide">
            ›
          </button>
        </div>

        <div className="hero-dots" aria-hidden="true">
          {heroSlides.map((slide, index) => (
            <span key={slide + index} className={index === 0 ? 'active' : ''} />
          ))}
        </div>
      </section>

      <section className="audience-band" id="audiences">
        <h2>分眾入口</h2>
        <div className="audience-grid">
          {audienceEntries.map((entry) => (
            <article className="audience-card" key={entry.title}>
              <div>
                <h3>{entry.title}</h3>
                <p>{entry.description}</p>
              </div>
              <Icon name={entry.icon} className="audience-icon" />
            </article>
          ))}
        </div>
      </section>

      <section className="vision-section">
        <div className="section-title-stack">
          <h2>看見樹德</h2>
          <div className="dots-line">
            {Array.from({ length: 28 }).map((_, index) => (
              <span
                key={index}
                className={index >= 11 && index <= 15 ? `color-dot color-${index - 10}` : ''}
              />
            ))}
          </div>
          <p>SHU-TE UNIVERSITY</p>
        </div>

        <div className="vision-grid">
          {visionSlides.map((slide, index) => (
            <article className="vision-card" key={slide.image}>
              <img src={slide.image} alt={slide.title} />
              <button className={`vision-arrow ${index === 0 ? 'left' : 'right'}`} type="button" aria-label={index === 0 ? 'Previous' : 'Next'}>
                {index === 0 ? '‹' : '›'}
              </button>
            </article>
          ))}
        </div>

        <div className="vision-pager" aria-hidden="true">
          <span className="active" />
          <span />
        </div>
      </section>

      <section className="stats-band">
        <h2>我們的辦學績效</h2>
        <div className="stats-grid">
          {performanceStats.map((item) => (
            <article className="stat-item" key={item.title}>
              <h3>{item.title}</h3>
              <strong>{item.value}</strong>
              <Icon name={item.icon} className="stat-icon" />
            </article>
          ))}
        </div>
      </section>

      <section className="story-section">
        {storySections.map((story, index) => (
          <article
            key={story.title}
            className={`story-row ${index % 2 === 1 ? 'reverse' : ''}`}
          >
            <img src={story.image} alt={story.title} className="story-image" />
            <div className="story-copy">
              <h2>{story.title}</h2>
              <span className="story-underline" />
              <p>{story.description}</p>
              <a href="#hero">了解更多</a>
            </div>
          </article>
        ))}
      </section>

      <section className="links-strip">
        <div className="links-banners">
          {featuredLinks.map((item) => (
            <img key={item} src={item} alt="" />
          ))}
        </div>
      </section>

      <section className="contact-band" id="links">
        <div className="contact-grid">
          {contactItems.map((item) => (
            <article className="contact-card" key={item.title}>
              <Icon name={item.icon} className="contact-icon" />
              <div className="contact-pill">{item.title}</div>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>

        <div className="social-row">
          <span className="social facebook">f</span>
          <span className="social youtube">▶</span>
          <span className="social instagram">◎</span>
          <span className="social line">L</span>
        </div>
      </section>

      <section className="ai-band" id="assistant">
        <div className="ai-intro">
          <p className="ai-label">AI Campus Assistant</p>
          <h2>AI 校園助理</h2>
          <p>
            在保留現有首頁風格的前提下，新增 AI 問答入口，讓使用者可以更快找到招生、行政、
            學術、位置與校園服務資訊。
          </p>
        </div>
        <div className="supabase-panel">
          <div className="supabase-panel-copy">
            <p className="ai-label">Supabase Data</p>
            <h3>Supabase `todos` 查詢</h3>
            <p>
              This panel uses the configured Supabase browser client and reads from the
              `todos` table.
            </p>
          </div>
          <div className="supabase-panel-state">
            {isTodosLoading ? <p>Loading todos...</p> : null}
            {todosError ? <p className="error-banner">{todosError}</p> : null}
            {!isTodosLoading && !todosError && todos.length > 0 ? (
              <ul className="todo-list">
                {todos.map((todo) => (
                  <li key={todo.id}>{todo.name}</li>
                ))}
              </ul>
            ) : null}
            {!isTodosLoading && !todosError && todos.length === 0 ? (
              <p>No todos found.</p>
            ) : null}
          </div>
        </div>
        <div className="ai-panel">
          <div className="chat-window" ref={chatViewportRef}>
            {messages.map((message) => (
              <article key={message.id} className={`message ${message.role}`}>
                <span className="message-role">
                  {message.role === 'assistant' ? 'STU AI' : 'You'}
                </span>
                <p>{message.content}</p>
              </article>
            ))}
            {isLoading ? (
              <article className="message assistant">
                <span className="message-role">STU AI</span>
                <p>正在查詢校園資訊...</p>
              </article>
            ) : null}
          </div>
          <form className="chat-form" onSubmit={handleSubmit}>
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例如：招生訊息在哪裡？行政單位有哪些？"
              rows={3}
            />
            <button type="submit" disabled={isLoading}>
              送出
            </button>
          </form>
          {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}
          <div className="ai-suggestions">
            {aiSuggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => void submitQuestion(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="smart-modules-band">
        <div className="smart-section-heading">
          <p className="ai-label">Research Modules</p>
          <h2>智慧資訊檢索、導航與評估</h2>
          <p>
            These sections implement the concrete system modules described in the research:
            knowledge retrieval, campus assistance, FAQ support, and user evaluation.
          </p>
        </div>

        <div className="module-grid">
          <article className="module-card">
            <h3>Knowledge Base Coverage</h3>
            <div className="chip-list">
              {knowledgeCategories.map((category) => (
                <span key={category} className="chip">
                  {category}
                </span>
              ))}
            </div>
            <div className="faq-list">
              {faqItems.map((faq) => (
                <article key={faq.question}>
                  <strong>{faq.question}</strong>
                  <p>{faq.answer}</p>
                </article>
              ))}
            </div>
          </article>

          <article className="module-card">
            <h3>Intelligent Information Retrieval</h3>
            <input
              className="module-input"
              value={knowledgeQuery}
              onChange={(event) => setKnowledgeQuery(event.target.value)}
              placeholder="Search academic policies, departments, FAQ, or graduation..."
            />
            <div className="search-results">
              {knowledgeResults.length > 0 ? (
                knowledgeResults.slice(0, 4).map((result) => (
                  <article key={result.id} className="result-card">
                    <span>{result.category}</span>
                    <h4>{result.title}</h4>
                    <p>{result.content}</p>
                  </article>
                ))
              ) : (
                <p className="empty-copy">No matching document found in the current knowledge base.</p>
              )}
            </div>
          </article>

          <article className="module-card">
            <h3>Smart Navigation & Campus Assistance</h3>
            <input
              className="module-input"
              value={navigationQuery}
              onChange={(event) => setNavigationQuery(event.target.value)}
              placeholder="Ask for a facility or office location..."
            />
            {navigationResult ? (
              <div className="navigation-card">
                <span>{navigationResult.type}</span>
                <h4>{navigationResult.name}</h4>
                <p><strong>Location:</strong> {navigationResult.location}</p>
                <p>{navigationResult.guidance}</p>
              </div>
            ) : (
              <p className="empty-copy">No navigation match found for the current query.</p>
            )}
            <div className="mini-destination-grid">
              {campusDestinations.map((destination) => (
                <button
                  key={destination.id}
                  type="button"
                  className="destination-button"
                  onClick={() => setNavigationQuery(destination.name)}
                >
                  {destination.name}
                </button>
              ))}
            </div>
          </article>

          <article className="module-card">
            <h3>User Evaluation Survey</h3>
            <form className="survey-form" onSubmit={handleSurveySubmit}>
              {evaluationQuestions.map((question, index) => (
                <label key={question} className="survey-question">
                  <span>{question}</span>
                  <select
                    value={surveyValues[`q${index}`] ?? ''}
                    onChange={(event) =>
                      setSurveyValues((current) => ({
                        ...current,
                        [`q${index}`]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Select a score</option>
                    <option value="5">5 - Strongly agree</option>
                    <option value="4">4 - Agree</option>
                    <option value="3">3 - Neutral</option>
                    <option value="2">2 - Disagree</option>
                    <option value="1">1 - Strongly disagree</option>
                  </select>
                </label>
              ))}
              <button type="submit" className="survey-submit">
                Save evaluation
              </button>
            </form>
            {surveySubmitted ? (
              <p className="survey-status">
                Survey responses saved locally. This matches the research requirement for
                post-implementation user evaluation.
              </p>
            ) : null}
          </article>
        </div>
      </section>

      <section className="news-band" id="news">
        <div className="section-title-stack compact">
          <h2>最新消息</h2>
          <p>Latest News</p>
        </div>
        <div className="news-grid">
          {latestNews.map((item) => (
            <article className="news-card" key={`${item.category}-${item.title}`}>
              <span>{item.category}</span>
              <h3>{item.title}</h3>
              <p>{item.date}</p>
            </article>
          ))}
        </div>
        <div className="hot-grid">
          {hotLinks.map((item) => (
            <article className="hot-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
