import { knowledgeBase } from '../data/knowledge'

type AssistantResponse = {
  answer: string
}

function sleep(duration: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration)
  })
}

export async function askCampusAssistant(question: string): Promise<AssistantResponse> {
  await sleep(900)

  const normalizedQuestion = question.trim().toLowerCase()
  if (!normalizedQuestion) {
    throw new Error('Please enter a question before sending it to the assistant.')
  }

  const matchedEntry = knowledgeBase.find((entry) =>
    entry.keywords.some((keyword) => normalizedQuestion.includes(keyword)),
  )

  if (matchedEntry) {
    return { answer: matchedEntry.answer }
  }

  return {
    answer:
      'This prototype currently focuses on admissions, academic policies, campus navigation, offices, and the overall AI upgrade for the Shu-Te University website. Expand the knowledge base next to cover live university content.',
  }
}
