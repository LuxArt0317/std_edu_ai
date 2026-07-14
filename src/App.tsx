import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  admissionsGroups,
  audienceEntries,
  campusShowcases,
  hotLinks,
  latestNews,
  performanceStats,
} from './data/knowledge'
import { askCampusAssistant } from './services/mockAssistant'

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
}

const initialMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content:
      'Welcome to the AI-enhanced STU prototype. Ask about admissions, offices, campus services, graduation requirements, or how this redesign improves the current website.',
  },
]

const quickQuestions = [
  'How does this redesign improve the current STU website?',
  'What can the AI assistant answer?',
  'How does the site support campus navigation?',
]

function App() {
  const [messages, setMessages] = useState(initialMessages)
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const chatViewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const viewport = chatViewportRef.current
    if (!viewport) return
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
  }, [messages, isLoading])

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
        error instanceof Error ? error.message : 'The assistant is temporarily unavailable.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitQuestion()
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#hero" aria-label="Shu-Te University home">
          <img
            src="https://www.stu.edu.tw/wp-content/uploads/2026/01/stu-logo-2.png"
            alt="Shu-Te University"
          />
        </a>
        <nav className="topnav" aria-label="Primary">
          <a href="#audiences">分眾入口</a>
          <a href="#showcase">校園亮點</a>
          <a href="#admissions">招生專區</a>
          <a href="#news">最新消息</a>
          <a href="#links">熱門連結</a>
          <a href="#assistant">AI 助理</a>
        </nav>
      </header>

      <section className="hero" id="hero">
        <div className="hero-overlay" />
        <div className="hero-content">
          <p className="hero-kicker">樹德科技大學</p>
          <h1>愛上宜學、宜居、宜行、宜樂的山水校園</h1>
          <p className="hero-copy">
            This recreation follows the structure and visual language of the current STU
            website, then adds an AI support layer for faster search, guidance, and campus
            information retrieval.
          </p>
          <div className="hero-actions">
            <a href="#audiences" className="hero-button solid">
              進入首頁導覽
            </a>
            <a href="#assistant" className="hero-button ghost">
              試用 AI 助理
            </a>
          </div>
        </div>
      </section>

      <section className="section audience-section" id="audiences">
        <div className="section-heading">
          <p className="section-label">Role Category</p>
          <h2>分眾入口</h2>
        </div>
        <div className="audience-grid">
          {audienceEntries.map((entry) => (
            <article className="audience-card" key={entry.title}>
              <span className="audience-icon">{entry.icon}</span>
              <h3>{entry.title}</h3>
              <p>{entry.description}</p>
              <a href="#assistant">點我更多功能...</a>
            </article>
          ))}
        </div>
      </section>

      <section className="section stat-band">
        <div className="section-heading">
          <p className="section-label">Performance</p>
          <h2>我們的辦學績效</h2>
        </div>
        <div className="stat-grid">
          {performanceStats.map((item) => (
            <article className="stat-card" key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="section showcase-section" id="showcase">
        {campusShowcases.map((group) => (
          <div className="showcase-block" key={group.title}>
            <div className="showcase-copy">
              <p className="section-label">{group.eyebrow}</p>
              <h2>{group.title}</h2>
              <p>{group.description}</p>
            </div>
            <div className="showcase-cards">
              {group.items.map((item) => (
                <article className="media-card" key={item.title}>
                  <img src={item.image} alt={item.title} />
                  <div className="media-card-body">
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="section admissions-section" id="admissions">
        <div className="section-heading">
          <p className="section-label">Admissions</p>
          <h2>招生專區</h2>
        </div>
        <div className="admissions-grid">
          {admissionsGroups.map((group) => (
            <article className="admission-card" key={group.title}>
              <img src={group.image} alt={group.title} />
              <h3>{group.title}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="section news-section" id="news">
        <div className="section-heading">
          <p className="section-label">Latest News</p>
          <h2>校園新聞</h2>
        </div>
        <div className="news-layout">
          <div className="news-list">
            {latestNews.map((item) => (
              <article className="news-item" key={`${item.category}-${item.title}`}>
                <span className="news-category">{item.category}</span>
                <h3>{item.title}</h3>
                <p>{item.date}</p>
              </article>
            ))}
          </div>

          <aside className="assistant-panel" id="assistant">
            <div className="assistant-heading">
              <p className="section-label">AI Feature</p>
              <h2>AI 校園助理</h2>
              <p>
                This is the product upgrade missing from the current university website: a
                conversational layer for campus information.
              </p>
            </div>

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
                  <p>Searching the campus knowledge base for the best answer...</p>
                </article>
              ) : null}
            </div>

            <form className="chat-form" onSubmit={handleSubmit}>
              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ask about admissions, graduation, offices, campus facilities, or website support."
                rows={4}
              />
              <button type="submit" disabled={isLoading}>
                Send
              </button>
            </form>

            {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}

            <div className="question-pills">
              {quickQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  disabled={isLoading}
                  onClick={() => void submitQuestion(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="section hotlink-section" id="links">
        <div className="section-heading">
          <p className="section-label">Hot Links</p>
          <h2>熱門連結</h2>
        </div>
        <div className="hotlink-grid">
          {hotLinks.map((item) => (
            <article className="hotlink-card" key={item.title}>
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
