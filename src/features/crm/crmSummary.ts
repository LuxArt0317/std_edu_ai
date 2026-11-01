import type { CrmDatabase } from './types'
export function summarizeCrm(data: CrmDatabase) {
  const openCases = data.cases.filter(item => item.status !== 'resolved')
  const leads = data.leads.filter(item => item.stage !== 'closed')
  return {
    programCount: new Set(data.students.map(student => student.programId || student.program.trim()).filter(Boolean)).size,
    highPriorityTasks: data.tasks.filter(task => !task.completed && task.priority === 'high').length,
    urgentCases: openCases.filter(item => item.priority === 'urgent').length,
    waitingCases: openCases.filter(item => item.status === 'waiting').length,
    admissionRate: leads.length ? Math.round(leads.filter(lead => lead.stage === 'admitted').length / leads.length * 100) : 0,
    weightedOpenForecast: leads.filter(lead => lead.stage !== 'admitted').reduce((sum, lead) => sum + lead.probability, 0) / 100,
    openLeads: leads.filter(lead => lead.stage !== 'admitted').length,
    unassignedLeads: leads.filter(lead => !lead.ownerId).length,
    signals: data.students.flatMap(student => student.signals.filter(signal => signal.active !== false).map((signal,index) => ({ ...signal, key: signal.id || `${student.id}:${index}`, studentId: student.id, studentName: student.name }))).slice(0, 5),
  }
}
