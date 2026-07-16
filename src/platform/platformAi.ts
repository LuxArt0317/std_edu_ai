import { supabase } from '../utils/supabase'
import type { ChatMessage, GradeScanResult, PlatformData, SchoolChatAnswer } from './types'

async function accessToken() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) throw new Error('Your STU Nexus session has expired. Please sign in again.')
  return data.session.access_token
}

export async function askSchoolAssistant(message: string, history: ChatMessage[], context: { view: string; data: PlatformData }): Promise<SchoolChatAnswer> {
  const token = await accessToken()
  const response = await fetch('/api/school-assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      message,
      history: history.filter((item) => item.role !== 'system').slice(-12).map((item) => ({ role: item.role, content: item.content })),
      context: {
        view: context.view,
        courseCodes: context.data.courses.map((course) => course.code),
        courseTitles: context.data.courses.map((course) => course.title),
        assessmentTitles: context.data.assessments.map((assessment) => assessment.title),
        scheduleSummary: context.data.schedule.slice(0, 8).map((event) => `${event.title} · ${event.startsAt}`),
        knowledgeTitles: context.data.topics.slice(0, 12).map((topic) => topic.title),
      },
    }),
  })
  const payload = await response.json() as Partial<SchoolChatAnswer> & { error?: string }
  if (!response.ok || !payload.answer || !Array.isArray(payload.suggestedActions) || !Array.isArray(payload.citations)) throw new Error(payload.error || 'Nexus AI is unavailable.')
  return { answer: payload.answer, suggestedActions: payload.suggestedActions, citations: payload.citations, source: 'openai' }
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('The selected image could not be read.'))
    reader.onerror = () => reject(new Error('The selected image could not be read.'))
    reader.readAsDataURL(file)
  })
}

export async function scanGradeSheet(file: File, title: string, maxScore: number, roster: PlatformData['students']): Promise<GradeScanResult> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.')
  if (file.size > 7_500_000) throw new Error('The grade-sheet image must be smaller than 7.5 MB.')
  const token = await accessToken()
  const imageDataUrl = await readAsDataUrl(file)
  const response = await fetch('/api/grade-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ imageDataUrl, title, maxScore, roster: roster.map((student) => ({ studentNumber: student.studentNumber, name: student.name })) }),
  })
  const payload = await response.json() as GradeScanResult & { error?: string }
  if (!response.ok || !Array.isArray(payload.rows)) throw new Error(payload.error || 'The grade sheet could not be scanned.')
  return payload
}
