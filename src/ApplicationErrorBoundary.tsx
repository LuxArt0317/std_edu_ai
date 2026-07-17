import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

function isChunkFailure(error: Error) {
  return /chunk|dynamically imported module|module script|failed to fetch/i.test(`${error.name} ${error.message}`)
}

function reloadLatest() {
  const target = new URL(window.location.href)
  target.searchParams.set('recovery', Date.now().toString())
  window.location.replace(target)
}

function resetLocalSession() {
  try {
    window.localStorage.removeItem('stu-nexus-auth')
  } finally {
    const target = new URL('/crm', window.location.origin)
    target.searchParams.set('recovery', Date.now().toString())
    window.location.replace(target)
  }
}

export class ApplicationErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[STU_NEXUS_RENDER_FAILURE]', {
      name: error.name,
      chunkFailure: isChunkFailure(error),
      componentStack: info.componentStack,
    })
  }

  render() {
    if (!this.state.error) return this.props.children
    const chunkFailure = isChunkFailure(this.state.error)
    return (
      <main className="app-failure" role="alert">
        <section>
          <span aria-hidden="true">!</span>
          <p>STU NEXUS RECOVERY</p>
          <h1>{chunkFailure ? 'A portal update needs to reload.' : 'The workspace could not finish rendering.'}</h1>
          <p>{chunkFailure
            ? 'Your data is safe. Reload the latest application files to continue.'
            : 'Your data is safe. Try the latest version first, or reset only this device’s saved session.'}</p>
          <div>
            <button type="button" onClick={reloadLatest}>Reload latest version</button>
            <button type="button" onClick={resetLocalSession}>Reset local session</button>
          </div>
          <a href="/">Return to university homepage</a>
        </section>
      </main>
    )
  }
}
