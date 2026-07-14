import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import { campusHighlights, quickLinks, suggestedQuestions } from './data/knowledge'
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
      'Welcome to the AI-Enhanced Shu-Te University Campus & Website prototype. Ask about admissions, graduation requirements, offices, campus facilities, or student services.',
  },
]

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const chatViewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const viewport = chatViewportRef.current
    if (!viewport) {
      return
    }

    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
  }, [messages, isLoading])

  async function submitQuestion(nextQuestion?: string) {
    const trimmedQuery = (nextQuestion ?? query).trim()
    if (!trimmedQuery || isLoading) {
      return
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedQuery,
    }

    setMessages((current) => [...current, userMessage])
    setQuery('')
    setErrorMessage('')
    setIsLoading(true)

    try {
      const response = await askCampusAssistant(trimmedQuery)
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.answer,
        },
      ])
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'The assistant is temporarily unavailable.'

      setErrorMessage(message)
    } finally {
      setIsLoading(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitQuestion()
  }

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">AI-Enhanced Shu-Te University Campus & Website</span>
          <h1>Rebuilding the Shu-Te University website around search, support, and AI guidance.</h1>
          <p className="lead">
            This prototype reimagines the existing university website as a smart campus
            experience where students, faculty, staff, and visitors can get answers faster
            through guided navigation, campus service discovery, and a conversational AI
            assistant.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#assistant">
              Try the AI assistant
            </a>
            <a className="secondary-action" href="#overview">
              Review the concept
            </a>
          </div>
          <ul className="metrics" aria-label="Project goals">
            <li>
              <strong>3x faster</strong>
              <span>information retrieval goal</span>
            </li>
            <li>
              <strong>24/7</strong>
              <span>AI inquiry support</span>
            </li>
            <li>
              <strong>1 platform</strong>
              <span>for academic and campus questions</span>
            </li>
          </ul>
        </div>
        <aside className="hero-card">
          <p className="card-label">Smart campus focus</p>
          <h2>What this website is designed to solve</h2>
          <ul>
            {campusHighlights.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="content-grid" id="overview">
        <article className="overview-card">
          <span className="section-kicker">Website direction</span>
          <h2>A premium front door for the current `stu.edu.tw` experience</h2>
          <p>
            The research positions this project as a recreation and upgrade of Shu-Te
            University’s current web presence, with AI layered into the experience instead of
            leaving users to navigate long menu trees and disconnected pages.
          </p>
          <div className="link-grid">
            {quickLinks.map((item) => (
              <div className="link-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="assistant-card" id="assistant">
          <div className="assistant-header">
            <div>
              <span className="section-kicker">AI assistant</span>
              <h2>Ask about campus information in plain language</h2>
            </div>
            <span className={`status-pill ${isLoading ? 'busy' : 'ready'}`}>
              {isLoading ? 'Responding...' : 'Prototype ready'}
            </span>
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
              <article className="message assistant loading">
                <span className="message-role">STU AI</span>
                <p>Searching the campus knowledge base for the most relevant answer...</p>
              </article>
            ) : null}
          </div>

          <form className="chat-form" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="campus-question">
              Ask the campus assistant
            </label>
            <textarea
              id="campus-question"
              name="campus-question"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Example: Where can I find enrollment requirements or office locations?"
              rows={3}
            />
            <button type="submit" disabled={isLoading}>
              Send question
            </button>
          </form>

          {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}

          <div className="suggestions">
            {suggestedQuestions.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => void submitQuestion(question)}
                disabled={isLoading}
              >
                {question}
              </button>
            ))}
          </div>
        </article>
      </section>
    </main>
  )
}

export default App
