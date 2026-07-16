import { initialCrmData } from './mockData'
import type { CrmDatabase } from './types'

const STORAGE_KEY = 'stu-nexus-crm-v1'

function cloneInitialData(): CrmDatabase {
  return JSON.parse(JSON.stringify(initialCrmData)) as CrmDatabase
}

function delay(milliseconds = 220) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

export async function loadCrmData(): Promise<CrmDatabase> {
  await delay()
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return cloneInitialData()
    const parsed = JSON.parse(saved) as Partial<CrmDatabase>
    if (!Array.isArray(parsed.students) || !Array.isArray(parsed.cases)) return cloneInitialData()
    return { ...cloneInitialData(), ...parsed }
  } catch {
    return cloneInitialData()
  }
}

export async function saveCrmData(data: CrmDatabase): Promise<void> {
  await delay(100)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    throw new Error(error instanceof Error ? `Unable to persist CRM changes: ${error.message}` : 'Unable to persist CRM changes.')
  }
}

export async function resetCrmData(): Promise<CrmDatabase> {
  await delay(180)
  window.localStorage.removeItem(STORAGE_KEY)
  return cloneInitialData()
}

export const crmDataSource = {
  mode: 'demo' as const,
  label: 'Persistent demo workspace',
  detail: 'Changes are saved in this browser. Supabase activation files are included in the repository.',
}
