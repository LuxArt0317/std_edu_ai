import type { CrmDatabase } from './types'

export const initialCrmData: CrmDatabase = {
  students: [
    {
      id: 'stu-001', studentNumber: '23101314', name: 'Hayros Baring', initials: 'HB', program: '資訊管理系', yearLevel: '四年級', email: 'hayros.baring@stu.edu.tw', phone: '+886 912 340 114', advisor: '陳俊卿', gpa: 3.72, attendance: 91, engagement: 86, balance: 0, riskScore: 18, riskLevel: 'low', tags: ['Capstone', 'International'], nextAction: 'Confirm capstone presentation schedule', lastContact: 'Today, 09:40',
      signals: [
        { label: 'Academic momentum', detail: 'GPA improved for three consecutive terms', tone: 'positive' },
        { label: 'Capstone milestone', detail: 'Final research implementation is due in 12 days', tone: 'warning' },
      ],
      timeline: [
        { date: 'Today', title: 'Advisor note added', detail: 'Capstone deployment review completed.', type: 'academic' },
        { date: 'Jul 12', title: 'AI assistant inquiry', detail: 'Asked about graduation clearance requirements.', type: 'message' },
        { date: 'Jul 03', title: 'Academic standing updated', detail: 'Maintained good standing for the term.', type: 'system' },
      ],
    },
    {
      id: 'stu-002', studentNumber: '23101319', name: 'Vin Giovanni Galindo', initials: 'VG', program: '資訊管理系', yearLevel: '四年級', email: 'vin.galindo@stu.edu.tw', phone: '+886 912 340 119', advisor: '陳俊卿', gpa: 3.28, attendance: 76, engagement: 54, balance: 12400, riskScore: 82, riskLevel: 'critical', tags: ['Financial hold', 'Capstone'], nextAction: 'Call student and arrange financial-aid consultation', lastContact: '8 days ago',
      signals: [
        { label: 'Attendance drop', detail: 'Attendance declined 14% in the last four weeks', tone: 'negative' },
        { label: 'Financial hold', detail: 'Outstanding balance may block registration', tone: 'negative' },
        { label: 'No recent response', detail: 'Two outreach attempts have not received a reply', tone: 'warning' },
      ],
      timeline: [
        { date: 'Jul 08', title: 'Case escalated', detail: 'Financial aid case moved to high priority.', type: 'case' },
        { date: 'Jul 04', title: 'Email sent', detail: 'Registration hold reminder delivered.', type: 'message' },
        { date: 'Jun 28', title: 'Risk score increased', detail: 'Attendance and balance signals crossed threshold.', type: 'system' },
      ],
    },
    {
      id: 'stu-003', studentNumber: '23101320', name: 'Nemesio Veligiano', initials: 'NV', program: '資訊管理系', yearLevel: '四年級', email: 'nemesio.veligiano@stu.edu.tw', phone: '+886 912 340 120', advisor: '陳俊卿', gpa: 3.44, attendance: 88, engagement: 72, balance: 0, riskScore: 34, riskLevel: 'medium', tags: ['Capstone', 'Career ready'], nextAction: 'Share internship matching opportunities', lastContact: 'Yesterday, 15:20',
      signals: [
        { label: 'Career intent', detail: 'Viewed six employer opportunities this week', tone: 'positive' },
        { label: 'Course requirement', detail: 'One graduation requirement needs confirmation', tone: 'warning' },
      ],
      timeline: [
        { date: 'Yesterday', title: 'Career appointment', detail: 'Discussed software analyst opportunities.', type: 'case' },
        { date: 'Jul 09', title: 'Knowledge article viewed', detail: 'Graduation checklist opened.', type: 'system' },
      ],
    },
    {
      id: 'stu-004', studentNumber: '23101334', name: 'Ralph Jinkin Albores', initials: 'RA', program: '資訊管理系', yearLevel: '四年級', email: 'ralph.albores@stu.edu.tw', phone: '+886 912 340 134', advisor: '陳俊卿', gpa: 2.91, attendance: 79, engagement: 61, balance: 3500, riskScore: 64, riskLevel: 'high', tags: ['Academic support'], nextAction: 'Schedule academic recovery planning session', lastContact: '3 days ago',
      signals: [
        { label: 'Core course', detail: 'Current grade is below the graduation threshold', tone: 'negative' },
        { label: 'Engagement recovery', detail: 'Portal activity improved after advisor outreach', tone: 'positive' },
      ],
      timeline: [
        { date: 'Jul 13', title: 'Advisor outreach', detail: 'Student confirmed availability for consultation.', type: 'message' },
        { date: 'Jul 10', title: 'Academic alert', detail: 'Midterm threshold alert created.', type: 'academic' },
      ],
    },
    {
      id: 'stu-005', studentNumber: '23101331', name: 'Jerrica Myra Conde', initials: 'JC', program: '資訊管理系', yearLevel: '四年級', email: 'jerrica.conde@stu.edu.tw', phone: '+886 912 340 131', advisor: '陳俊卿', gpa: 3.81, attendance: 95, engagement: 92, balance: 0, riskScore: 9, riskLevel: 'low', tags: ['Dean’s list', 'International'], nextAction: 'Invite student to peer mentor program', lastContact: 'Today, 11:05',
      signals: [
        { label: 'High achievement', detail: 'Top-decile academic and engagement performance', tone: 'positive' },
        { label: 'Peer influence', detail: 'Frequently supports classmates in discussion boards', tone: 'positive' },
      ],
      timeline: [
        { date: 'Today', title: 'Recognition sent', detail: 'Dean’s list congratulations delivered.', type: 'message' },
        { date: 'Jul 11', title: 'Mentor nomination', detail: 'Recommended by department coordinator.', type: 'academic' },
      ],
    },
    {
      id: 'stu-006', studentNumber: '24102108', name: 'Lin Yu-Ting', initials: 'LY', program: '視覺傳達設計系', yearLevel: '三年級', email: 'yuting.lin@stu.edu.tw', phone: '+886 933 614 208', advisor: '王雅雯', gpa: 3.12, attendance: 84, engagement: 48, balance: 0, riskScore: 51, riskLevel: 'medium', tags: ['Wellbeing follow-up'], nextAction: 'Send wellbeing check-in and counseling resources', lastContact: '6 days ago',
      signals: [
        { label: 'Engagement decline', detail: 'LMS activity is 38% below personal baseline', tone: 'warning' },
        { label: 'Attendance stable', detail: 'Attendance remains above intervention threshold', tone: 'positive' },
      ],
      timeline: [
        { date: 'Jul 10', title: 'Wellbeing flag', detail: 'Advisor requested a low-pressure check-in.', type: 'case' },
        { date: 'Jul 06', title: 'Activity change detected', detail: 'Engagement signal crossed watch threshold.', type: 'system' },
      ],
    },
  ],
  cases: [
    { id: 'case-101', title: 'Registration blocked by outstanding balance', studentId: 'stu-002', category: 'Financial aid', priority: 'urgent', status: 'in_progress', owner: 'Mei Chen', updatedAt: '12 min ago', dueAt: 'Today, 16:00' },
    { id: 'case-102', title: 'Academic recovery plan', studentId: 'stu-004', category: 'Academic advising', priority: 'high', status: 'open', owner: 'Jiunn Ching Chen', updatedAt: '2 hours ago', dueAt: 'Tomorrow' },
    { id: 'case-103', title: 'Graduation requirement confirmation', studentId: 'stu-003', category: 'Registrar', priority: 'normal', status: 'waiting', owner: 'Amy Wu', updatedAt: 'Yesterday', dueAt: 'Jul 19' },
    { id: 'case-104', title: 'Wellbeing check-in request', studentId: 'stu-006', category: 'Student care', priority: 'normal', status: 'open', owner: 'Yu Han', updatedAt: 'Yesterday', dueAt: 'Jul 18' },
    { id: 'case-105', title: 'Capstone presentation schedule', studentId: 'stu-001', category: 'Department', priority: 'low', status: 'resolved', owner: 'Jiunn Ching Chen', updatedAt: 'Today', dueAt: 'Completed' },
  ],
  leads: [
    { id: 'lead-01', name: 'Chen Wei-An', program: '資訊管理系', source: 'Open House', stage: 'inquiry', probability: 22, owner: 'Grace Lin', lastActivity: 'Today', nextStep: 'Send program guide' },
    { id: 'lead-02', name: 'Maria Santos', program: '國際企業與貿易系', source: 'International fair', stage: 'engaged', probability: 44, owner: 'Kevin Tsai', lastActivity: '2 hours ago', nextStep: 'Book admissions call' },
    { id: 'lead-03', name: 'Huang Pei-Yu', program: '動畫與遊戲設計系', source: 'Website', stage: 'application', probability: 63, owner: 'Grace Lin', lastActivity: 'Yesterday', nextStep: 'Request portfolio' },
    { id: 'lead-04', name: 'Jamie Cruz', program: '資訊管理系', source: 'Student referral', stage: 'review', probability: 78, owner: 'Kevin Tsai', lastActivity: 'Today', nextStep: 'Complete document review' },
    { id: 'lead-05', name: 'Liu Chia-Hao', program: '電腦與通訊系', source: 'Education fair', stage: 'admitted', probability: 96, owner: 'Grace Lin', lastActivity: '3 days ago', nextStep: 'Send enrollment checklist' },
    { id: 'lead-06', name: 'Nguyen Minh Anh', program: '休閒遊憩與運動管理系', source: 'Partner school', stage: 'application', probability: 68, owner: 'Kevin Tsai', lastActivity: 'Today', nextStep: 'Validate transcript' },
  ],
  campaigns: [
    { id: 'camp-01', name: 'Registration readiness', audience: 'Students with incomplete registration', channel: 'Multi-channel', status: 'active', reach: 428, engagement: 71, scheduledFor: 'Running now' },
    { id: 'camp-02', name: '2027 applicant nurture', audience: 'Engaged admissions leads', channel: 'Email', status: 'scheduled', reach: 1160, engagement: 0, scheduledFor: 'Jul 20, 09:00' },
    { id: 'camp-03', name: 'Graduation clearance', audience: 'Final-year students', channel: 'LINE', status: 'completed', reach: 892, engagement: 84, scheduledFor: 'Completed Jul 10' },
    { id: 'camp-04', name: 'Midterm wellbeing check', audience: 'Students with declining engagement', channel: 'SMS', status: 'draft', reach: 136, engagement: 0, scheduledFor: 'Not scheduled' },
  ],
  tasks: [
    { id: 'task-01', title: 'Call Vin about registration hold', linkedTo: 'Vin Giovanni Galindo', owner: 'You', dueAt: 'Today, 14:30', priority: 'high', completed: false },
    { id: 'task-02', title: 'Review Ralph’s recovery plan', linkedTo: 'Ralph Jinkin Albores', owner: 'You', dueAt: 'Today, 16:00', priority: 'high', completed: false },
    { id: 'task-03', title: 'Approve applicant document review', linkedTo: 'Jamie Cruz', owner: 'You', dueAt: 'Tomorrow', priority: 'normal', completed: false },
    { id: 'task-04', title: 'Publish registration FAQ update', linkedTo: 'Knowledge Hub', owner: 'You', dueAt: 'Jul 19', priority: 'normal', completed: false },
  ],
  knowledge: [
    { id: 'kb-01', title: 'Graduation clearance and requirements', category: 'Academic', owner: 'Office of Academic Affairs', status: 'verified', updatedAt: 'Jul 15, 2026', sourceUrl: 'https://www.stu.edu.tw/', summary: 'Credits, required courses, service learning, language requirements, and clearance sequence.', usageCount: 1842 },
    { id: 'kb-02', title: 'Registration and tuition payment', category: 'Registrar', owner: 'Cashier Division', status: 'verified', updatedAt: 'Jul 16, 2026', sourceUrl: 'https://cashier.swd.stu.edu.tw/registration-fee-area/', summary: 'Registration dates, payment channels, holds, and exception handling.', usageCount: 2416 },
    { id: 'kb-03', title: 'Admissions pathways', category: 'Admissions', owner: 'Admissions Office', status: 'verified', updatedAt: 'Jul 14, 2026', sourceUrl: 'https://reg.aca.stu.edu.tw/', summary: 'Graduate, undergraduate, continuing education, transfer, and international routes.', usageCount: 3198 },
    { id: 'kb-04', title: 'Student financial aid and scholarships', category: 'Student services', owner: 'Student Affairs', status: 'review_due', updatedAt: 'Jun 20, 2026', sourceUrl: 'https://www.sao.stu.edu.tw/', summary: 'Aid eligibility, scholarship options, application timing, and responsible offices.', usageCount: 982 },
    { id: 'kb-05', title: 'Campus facilities and office directory', category: 'Campus', owner: 'General Affairs', status: 'verified', updatedAt: 'Jul 11, 2026', sourceUrl: 'https://www.stu.edu.tw/行政單位/', summary: 'Administrative offices, service centers, facilities, and campus navigation guidance.', usageCount: 1556 },
    { id: 'kb-06', title: 'International student onboarding', category: 'International', owner: 'OICA', status: 'draft', updatedAt: 'Jul 13, 2026', sourceUrl: 'https://www.oica.stu.edu.tw/', summary: 'Arrival, enrollment, housing, visa support, and campus orientation.', usageCount: 421 },
  ],
}
