-- Deny direct public access to protected retrieval, evaluation, and research data.
-- The public assistant must use the server retrieval boundary, which enforces
-- source approval, document freshness, citations, and query logging.
revoke all privileges on table
  public.knowledge_chunks,
  public.knowledge_ingestion_runs,
  public.knowledge_review_events,
  public.ai_queries,
  public.ai_answers,
  public.ai_retrieval_results,
  public.ai_answer_citations,
  public.ai_feedback,
  public.ai_eval_cases,
  public.ai_eval_runs,
  public.ai_eval_results,
  public.research_studies,
  public.research_study_versions,
  public.research_participants,
  public.research_consent_records,
  public.research_tasks,
  public.research_sessions,
  public.research_task_attempts,
  public.research_questionnaires,
  public.research_questionnaire_items,
  public.research_responses,
  public.administrative_inquiry_metrics
from anon;

revoke all privileges on table
  public.knowledge_chunks,
  public.knowledge_ingestion_runs,
  public.knowledge_review_events,
  public.ai_queries,
  public.ai_answers,
  public.ai_retrieval_results,
  public.ai_answer_citations,
  public.ai_feedback,
  public.ai_eval_cases,
  public.ai_eval_runs,
  public.ai_eval_results,
  public.research_studies,
  public.research_study_versions,
  public.research_participants,
  public.research_consent_records,
  public.research_tasks,
  public.research_sessions,
  public.research_task_attempts,
  public.research_questionnaires,
  public.research_questionnaire_items,
  public.research_responses,
  public.administrative_inquiry_metrics
from public;
