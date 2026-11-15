export function currentStudyOwnYearClause(question: unknown): boolean;
export function currentStudyForeignYearQuestion(question: unknown): {courseQuestion: string} | null;
export function currentStudyCoachingQuestion(question: unknown): {recordQuestion: string; scope: 'courses' | 'courses_and_year'} | null;
