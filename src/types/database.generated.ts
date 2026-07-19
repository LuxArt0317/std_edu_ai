export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      academic_programs: {
        Row: {
          code: string
          created_at: string
          department_id: string
          description: string
          duration_years: number
          id: string
          level: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          department_id: string
          description?: string
          duration_years: number
          id?: string
          level: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          department_id?: string
          description?: string
          duration_years?: number
          id?: string
          level?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_programs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_terms: {
        Row: {
          code: string
          created_at: string
          ends_on: string
          enrollment_ends_on: string | null
          enrollment_starts_on: string | null
          id: string
          name: string
          starts_on: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          ends_on: string
          enrollment_ends_on?: string | null
          enrollment_starts_on?: string | null
          id?: string
          name: string
          starts_on: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          ends_on?: string
          enrollment_ends_on?: string | null
          enrollment_starts_on?: string | null
          id?: string
          name?: string
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      account_access_audit: {
        Row: {
          acted_by: string
          action: string
          created_at: string
          details: Json
          id: string
          reason: string
          target_profile_id: string
        }
        Insert: {
          acted_by: string
          action: string
          created_at?: string
          details?: Json
          id?: string
          reason: string
          target_profile_id: string
        }
        Update: {
          acted_by?: string
          action?: string
          created_at?: string
          details?: Json
          id?: string
          reason?: string
          target_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_access_audit_acted_by_fkey"
            columns: ["acted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_access_audit_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_lifecycle_audit: {
        Row: {
          changed_by: string
          created_at: string
          id: string
          new_status: string
          previous_status: string
          reason: string
          target_profile_id: string
        }
        Insert: {
          changed_by: string
          created_at?: string
          id?: string
          new_status: string
          previous_status: string
          reason: string
          target_profile_id: string
        }
        Update: {
          changed_by?: string
          created_at?: string
          id?: string
          new_status?: string
          previous_status?: string
          reason?: string
          target_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_lifecycle_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_lifecycle_audit_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      administrative_inquiry_metrics: {
        Row: {
          category: string
          confirmed_resolved_count: number
          created_at: string
          duplicate_count: number
          entered_by: string
          escalated_count: number
          id: string
          inquiry_count: number
          period_end: string
          period_start: string
          resolution_evidence_count: number | null
          resolution_evidence_type: string | null
          source_note: string
          study_id: string
          supersedes_metric_id: string | null
          total_first_response_seconds: number
          total_handling_seconds: number
          window_id: string | null
          window_type: string
        }
        Insert: {
          category: string
          confirmed_resolved_count: number
          created_at?: string
          duplicate_count: number
          entered_by: string
          escalated_count: number
          id?: string
          inquiry_count: number
          period_end: string
          period_start: string
          resolution_evidence_count?: number | null
          resolution_evidence_type?: string | null
          source_note: string
          study_id: string
          supersedes_metric_id?: string | null
          total_first_response_seconds?: number
          total_handling_seconds?: number
          window_id?: string | null
          window_type: string
        }
        Update: {
          category?: string
          confirmed_resolved_count?: number
          created_at?: string
          duplicate_count?: number
          entered_by?: string
          escalated_count?: number
          id?: string
          inquiry_count?: number
          period_end?: string
          period_start?: string
          resolution_evidence_count?: number | null
          resolution_evidence_type?: string | null
          source_note?: string
          study_id?: string
          supersedes_metric_id?: string | null
          total_first_response_seconds?: number
          total_handling_seconds?: number
          window_id?: string | null
          window_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "administrative_inquiry_metrics_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "administrative_inquiry_metrics_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "research_studies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "administrative_inquiry_metrics_supersedes_metric_id_fkey"
            columns: ["supersedes_metric_id"]
            isOneToOne: false
            referencedRelation: "administrative_inquiry_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "administrative_inquiry_metrics_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "administrative_workload_windows"
            referencedColumns: ["id"]
          },
        ]
      }
      administrative_workload_windows: {
        Row: {
          approval_reference: string
          collection_method: string
          created_at: string
          created_by: string
          id: string
          office_code: string
          office_name: string
          period_end: string
          period_start: string
          source_extract_sha256: string
          source_record_count: number
          source_system: string
          status: string
          study_id: string
          suppression_threshold: number
          verified_at: string | null
          verified_by: string | null
          window_type: string
        }
        Insert: {
          approval_reference: string
          collection_method: string
          created_at?: string
          created_by?: string
          id?: string
          office_code: string
          office_name: string
          period_end: string
          period_start: string
          source_extract_sha256: string
          source_record_count: number
          source_system: string
          status?: string
          study_id: string
          suppression_threshold?: number
          verified_at?: string | null
          verified_by?: string | null
          window_type: string
        }
        Update: {
          approval_reference?: string
          collection_method?: string
          created_at?: string
          created_by?: string
          id?: string
          office_code?: string
          office_name?: string
          period_end?: string
          period_start?: string
          source_extract_sha256?: string
          source_record_count?: number
          source_system?: string
          status?: string
          study_id?: string
          suppression_threshold?: number
          verified_at?: string | null
          verified_by?: string | null
          window_type?: string
        }
        Relationships: [
          { foreignKeyName: "administrative_workload_windows_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "administrative_workload_windows_study_id_fkey"; columns: ["study_id"]; isOneToOne: false; referencedRelation: "research_studies"; referencedColumns: ["id"] },
          { foreignKeyName: "administrative_workload_windows_verified_by_fkey"; columns: ["verified_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      admission_handoffs: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          lead_id: string
          notes: string
          requested_by: string
          status: string
          student_profile_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          lead_id: string
          notes: string
          requested_by: string
          status?: string
          student_profile_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          lead_id?: string
          notes?: string
          requested_by?: string
          status?: string
          student_profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admission_handoffs_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_handoffs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "admission_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_handoffs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_handoffs_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admission_leads: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          last_activity_at: string
          next_step: string | null
          owner_id: string | null
          phone: string | null
          probability: number
          program_id: string | null
          program_interest: string
          source: string
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          last_activity_at?: string
          next_step?: string | null
          owner_id?: string | null
          phone?: string | null
          probability?: number
          program_id?: string | null
          program_interest: string
          source: string
          stage?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          last_activity_at?: string
          next_step?: string | null
          owner_id?: string | null
          phone?: string | null
          probability?: number
          program_id?: string | null
          program_interest?: string
          source?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admission_leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_leads_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "academic_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_answer_citations: {
        Row: {
          answer_id: string
          chunk_id: string
          claim_end: number | null
          claim_start: number | null
          claim_text: string
          created_at: string
          id: string
        }
        Insert: {
          answer_id: string
          chunk_id: string
          claim_end?: number | null
          claim_start?: number | null
          claim_text: string
          created_at?: string
          id?: string
        }
        Update: {
          answer_id?: string
          chunk_id?: string
          claim_end?: number | null
          claim_start?: number | null
          claim_text?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_answer_citations_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "ai_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_answer_citations_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "knowledge_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_answers: {
        Row: {
          answer_text: string
          corpus_version: string
          created_at: string
          estimated_cost_usd: number | null
          id: string
          latency_ms: number | null
          model: string | null
          prompt_version: string
          query_id: string
          retriever_version: string
          terminal_state: string
        }
        Insert: {
          answer_text?: string
          corpus_version: string
          created_at?: string
          estimated_cost_usd?: number | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt_version: string
          query_id: string
          retriever_version: string
          terminal_state: string
        }
        Update: {
          answer_text?: string
          corpus_version?: string
          created_at?: string
          estimated_cost_usd?: number | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt_version?: string
          query_id?: string
          retriever_version?: string
          terminal_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_answers_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "ai_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_audit_logs: {
        Row: {
          context_fields: string[]
          created_at: string
          id: string
          latency_ms: number | null
          model: string
          outcome: string
          output_citations: string[]
          student_id: string | null
          use_case: string
          user_id: string
        }
        Insert: {
          context_fields?: string[]
          created_at?: string
          id?: string
          latency_ms?: number | null
          model: string
          outcome: string
          output_citations?: string[]
          student_id?: string | null
          use_case: string
          user_id: string
        }
        Update: {
          context_fields?: string[]
          created_at?: string
          id?: string
          latency_ms?: number | null
          model?: string
          outcome?: string
          output_citations?: string[]
          student_id?: string | null
          use_case?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_audit_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_success_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_audit_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_eval_cases: {
        Row: {
          active: boolean
          case_key: string
          domain: string
          expect_abstention: boolean
          expected_chunk_ids: string[]
          expected_claims: Json
          id: string
          language: string
          query: string
          reviewed_at: string
          reviewed_by: string
          rubric: Json
        }
        Insert: {
          active?: boolean
          case_key: string
          domain: string
          expect_abstention?: boolean
          expected_chunk_ids?: string[]
          expected_claims?: Json
          id?: string
          language: string
          query: string
          reviewed_at: string
          reviewed_by: string
          rubric?: Json
        }
        Update: {
          active?: boolean
          case_key?: string
          domain?: string
          expect_abstention?: boolean
          expected_chunk_ids?: string[]
          expected_claims?: Json
          id?: string
          language?: string
          query?: string
          reviewed_at?: string
          reviewed_by?: string
          rubric?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_eval_cases_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_eval_results: {
        Row: {
          abstention_correct: boolean | null
          answer_id: string | null
          case_id: string
          citation_completeness: number | null
          citation_precision: number | null
          correctness: number | null
          estimated_cost_usd: number | null
          groundedness: number | null
          id: string
          latency_ms: number | null
          ndcg: number
          reciprocal_rank: number
          retrieved_chunk_ids: string[]
          reviewer_notes: string | null
          run_id: string
        }
        Insert: {
          abstention_correct?: boolean | null
          answer_id?: string | null
          case_id: string
          citation_completeness?: number | null
          citation_precision?: number | null
          correctness?: number | null
          estimated_cost_usd?: number | null
          groundedness?: number | null
          id?: string
          latency_ms?: number | null
          ndcg?: number
          reciprocal_rank?: number
          retrieved_chunk_ids?: string[]
          reviewer_notes?: string | null
          run_id: string
        }
        Update: {
          abstention_correct?: boolean | null
          answer_id?: string | null
          case_id?: string
          citation_completeness?: number | null
          citation_precision?: number | null
          correctness?: number | null
          estimated_cost_usd?: number | null
          groundedness?: number | null
          id?: string
          latency_ms?: number | null
          ndcg?: number
          reciprocal_rank?: number
          retrieved_chunk_ids?: string[]
          reviewer_notes?: string | null
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_eval_results_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "ai_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_eval_results_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "ai_eval_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_eval_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_eval_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_eval_runs: {
        Row: {
          corpus_version: string
          created_at: string
          finished_at: string | null
          id: string
          metrics: Json
          model: string
          prompt_version: string
          requested_by: string
          retriever_version: string
          started_at: string | null
          status: string
        }
        Insert: {
          corpus_version: string
          created_at?: string
          finished_at?: string | null
          id?: string
          metrics?: Json
          model: string
          prompt_version: string
          requested_by: string
          retriever_version: string
          started_at?: string | null
          status?: string
        }
        Update: {
          corpus_version?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          metrics?: Json
          model?: string
          prompt_version?: string
          requested_by?: string
          retriever_version?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_eval_runs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feedback: {
        Row: {
          anonymous_session_hash: string | null
          answer_id: string
          comment: string | null
          correction_category: string | null
          created_at: string
          helpful: boolean | null
          id: string
          profile_id: string | null
          resolved_need: boolean | null
        }
        Insert: {
          anonymous_session_hash?: string | null
          answer_id: string
          comment?: string | null
          correction_category?: string | null
          created_at?: string
          helpful?: boolean | null
          id?: string
          profile_id?: string | null
          resolved_need?: boolean | null
        }
        Update: {
          anonymous_session_hash?: string | null
          answer_id?: string
          comment?: string | null
          correction_category?: string | null
          created_at?: string
          helpful?: boolean | null
          id?: string
          profile_id?: string | null
          resolved_need?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "ai_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_queries: {
        Row: {
          anonymous_session_hash: string | null
          consented_research_use: boolean
          created_at: string
          id: string
          intent: string | null
          language: string
          profile_id: string | null
          query_hash: string
          query_text: string | null
          surface: string
        }
        Insert: {
          anonymous_session_hash?: string | null
          consented_research_use?: boolean
          created_at?: string
          id?: string
          intent?: string | null
          language: string
          profile_id?: string | null
          query_hash: string
          query_text?: string | null
          surface: string
        }
        Update: {
          anonymous_session_hash?: string | null
          consented_research_use?: boolean
          created_at?: string
          id?: string
          intent?: string | null
          language?: string
          profile_id?: string | null
          query_hash?: string
          query_text?: string | null
          surface?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_queries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_retrieval_results: {
        Row: {
          chunk_id: string
          eligible: boolean
          exclusion_reason: string | null
          fused_score: number
          id: string
          keyword_score: number | null
          query_id: string
          rank: number
          vector_score: number | null
        }
        Insert: {
          chunk_id: string
          eligible: boolean
          exclusion_reason?: string | null
          fused_score: number
          id?: string
          keyword_score?: number | null
          query_id: string
          rank: number
          vector_score?: number | null
        }
        Update: {
          chunk_id?: string
          eligible?: boolean
          exclusion_reason?: string | null
          fused_score?: number
          id?: string
          keyword_score?: number | null
          query_id?: string
          rank?: number
          vector_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_retrieval_results_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "knowledge_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_retrieval_results_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "ai_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience_roles: string[]
          author_id: string | null
          body: string
          created_at: string
          expires_at: string | null
          id: string
          priority: string
          published_at: string | null
          section_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          audience_roles?: string[]
          author_id?: string | null
          body: string
          created_at?: string
          expires_at?: string | null
          id?: string
          priority?: string
          published_at?: string | null
          section_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          audience_roles?: string[]
          author_id?: string | null
          body?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          priority?: string
          published_at?: string | null
          section_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_answer_keys: {
        Row: {
          acceptable_answers: string[]
          correct_option_id: string | null
          grading_notes: string
          question_id: string
        }
        Insert: {
          acceptable_answers?: string[]
          correct_option_id?: string | null
          grading_notes?: string
          question_id: string
        }
        Update: {
          acceptable_answers?: string[]
          correct_option_id?: string | null
          grading_notes?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_answer_keys_correct_option_id_fkey"
            columns: ["correct_option_id"]
            isOneToOne: false
            referencedRelation: "assessment_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_answer_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "assessment_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_answers: {
        Row: {
          attempt_id: string
          created_at: string
          id: string
          is_correct: boolean | null
          points_awarded: number | null
          question_id: string
          response_text: string | null
          selected_option_id: string | null
          teacher_feedback: string | null
          updated_at: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          points_awarded?: number | null
          question_id: string
          response_text?: string | null
          selected_option_id?: string | null
          teacher_feedback?: string | null
          updated_at?: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          points_awarded?: number | null
          question_id?: string
          response_text?: string | null
          selected_option_id?: string | null
          teacher_feedback?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "assessment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "assessment_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_answers_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "assessment_options"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_attempts: {
        Row: {
          assessment_id: string
          attempt_number: number
          graded_at: string | null
          id: string
          max_score: number
          score: number | null
          started_at: string
          status: string
          student_profile_id: string
          submitted_at: string | null
        }
        Insert: {
          assessment_id: string
          attempt_number: number
          graded_at?: string | null
          id?: string
          max_score?: number
          score?: number | null
          started_at?: string
          status?: string
          student_profile_id: string
          submitted_at?: string | null
        }
        Update: {
          assessment_id?: string
          attempt_number?: number
          graded_at?: string | null
          id?: string
          max_score?: number
          score?: number | null
          started_at?: string
          status?: string
          student_profile_id?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_attempts_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_attempts_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_integrity_events: {
        Row: {
          assessment_id: string
          attempt_id: string | null
          details: Json
          event_type: string
          id: string
          occurred_at: string
          session_id: string
          severity: string
          student_profile_id: string
        }
        Insert: {
          assessment_id: string
          attempt_id?: string | null
          details?: Json
          event_type: string
          id?: string
          occurred_at?: string
          session_id: string
          severity?: string
          student_profile_id: string
        }
        Update: {
          assessment_id?: string
          attempt_id?: string | null
          details?: Json
          event_type?: string
          id?: string
          occurred_at?: string
          session_id?: string
          severity?: string
          student_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_integrity_events_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_integrity_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "assessment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_integrity_events_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_options: {
        Row: {
          id: string
          label: string
          position: number
          question_id: string
        }
        Insert: {
          id?: string
          label: string
          position: number
          question_id: string
        }
        Update: {
          id?: string
          label?: string
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "assessment_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_questions: {
        Row: {
          assessment_id: string
          explanation: string
          id: string
          points: number
          position: number
          prompt: string
          question_type: string
        }
        Insert: {
          assessment_id: string
          explanation?: string
          id?: string
          points?: number
          position: number
          prompt: string
          question_type: string
        }
        Update: {
          assessment_id?: string
          explanation?: string
          id?: string
          points?: number
          position?: number
          prompt?: string
          question_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_questions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          assessment_type: string
          attempt_limit: number
          created_at: string
          created_by: string | null
          detect_extended_display: boolean
          detect_multiple_cameras: boolean
          due_at: string | null
          duration_minutes: number | null
          id: string
          instructions: string
          integrity_instructions: string
          max_score: number
          monitor_focus: boolean
          opens_at: string | null
          prevent_copy_paste: boolean
          release_explanations: boolean
          release_scores_immediately: boolean
          require_camera: boolean
          require_fullscreen: boolean
          review_mode: string
          section_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assessment_type?: string
          attempt_limit?: number
          created_at?: string
          created_by?: string | null
          detect_extended_display?: boolean
          detect_multiple_cameras?: boolean
          due_at?: string | null
          duration_minutes?: number | null
          id?: string
          instructions?: string
          integrity_instructions?: string
          max_score?: number
          monitor_focus?: boolean
          opens_at?: string | null
          prevent_copy_paste?: boolean
          release_explanations?: boolean
          release_scores_immediately?: boolean
          require_camera?: boolean
          require_fullscreen?: boolean
          review_mode?: string
          section_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assessment_type?: string
          attempt_limit?: number
          created_at?: string
          created_by?: string | null
          detect_extended_display?: boolean
          detect_multiple_cameras?: boolean
          due_at?: string | null
          duration_minutes?: number | null
          id?: string
          instructions?: string
          integrity_instructions?: string
          max_score?: number
          monitor_focus?: boolean
          opens_at?: string | null
          prevent_copy_paste?: boolean
          release_explanations?: boolean
          release_scores_immediately?: boolean
          require_camera?: boolean
          require_fullscreen?: boolean
          review_mode?: string
          section_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          assessment_id: string
          created_at: string
          feedback: string
          graded_at: string | null
          graded_by: string | null
          id: string
          score: number | null
          status: string
          storage_path: string | null
          student_profile_id: string
          submission_text: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          feedback?: string
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          score?: number | null
          status?: string
          storage_path?: string | null
          student_profile_id: string
          submission_text?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          feedback?: string
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          score?: number | null
          status?: string
          storage_path?: string | null
          student_profile_id?: string
          submission_text?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_correction_requests: {
        Row: {
          attendance_record_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          reason: string
          requested_status: string
          status: string
          student_profile_id: string
          updated_at: string
        }
        Insert: {
          attendance_record_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          reason: string
          requested_status: string
          status?: string
          student_profile_id: string
          updated_at?: string
        }
        Update: {
          attendance_record_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          reason?: string
          requested_status?: string
          status?: string
          student_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_correction_requests_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_correction_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_correction_requests_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          id: string
          marked_at: string
          marked_by: string | null
          notes: string
          session_id: string
          status: string
          student_profile_id: string
        }
        Insert: {
          id?: string
          marked_at?: string
          marked_by?: string | null
          notes?: string
          session_id: string
          status: string
          student_profile_id: string
        }
        Update: {
          id?: string
          marked_at?: string
          marked_by?: string | null
          notes?: string
          session_id?: string
          status?: string
          student_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          section_id: string
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          section_id: string
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          section_id?: string
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          delivered_at: string | null
          delivery_status: string
          opened_at: string | null
          student_id: string
        }
        Insert: {
          campaign_id: string
          delivered_at?: string | null
          delivery_status?: string
          opened_at?: string | null
          student_id: string
        }
        Update: {
          campaign_id?: string
          delivered_at?: string | null
          delivery_status?: string
          opened_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_success_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          approval_reason: string | null
          approved_at: string | null
          approved_by: string | null
          audience_definition: Json
          audience_scope: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          message_template: string
          name: string
          program_id: string | null
          scheduled_for: string | null
          section_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approval_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          audience_definition?: Json
          audience_scope?: string
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          message_template?: string
          name: string
          program_id?: string | null
          scheduled_for?: string | null
          section_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approval_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          audience_definition?: Json
          audience_scope?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          message_template?: string
          name?: string
          program_id?: string | null
          scheduled_for?: string | null
          section_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "academic_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_buildings: {
        Row: {
          active: boolean
          code: string
          geometry: Json
          id: string
          latitude: number | null
          longitude: number | null
          name_en: string
          name_zh: string
          official_source_id: string | null
          site_id: string
          verified_at: string | null
        }
        Insert: {
          active?: boolean
          code: string
          geometry?: Json
          id?: string
          latitude?: number | null
          longitude?: number | null
          name_en: string
          name_zh: string
          official_source_id?: string | null
          site_id: string
          verified_at?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          geometry?: Json
          id?: string
          latitude?: number | null
          longitude?: number | null
          name_en?: string
          name_zh?: string
          official_source_id?: string | null
          site_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campus_buildings_official_source_id_fkey"
            columns: ["official_source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_buildings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "campus_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_edges: {
        Row: {
          bidirectional: boolean
          closes_at: string | null
          closure_reason: string | null
          distance_m: number
          environment: string
          estimated_seconds: number
          from_node_id: string
          id: string
          instruction_en: string
          instruction_reverse_en: string
          instruction_reverse_zh: string
          instruction_zh: string
          opens_at: string | null
          status: string
          to_node_id: string
          traversal_type: string
          verified_at: string | null
          wheelchair_suitable: boolean
        }
        Insert: {
          bidirectional?: boolean
          closes_at?: string | null
          closure_reason?: string | null
          distance_m: number
          environment: string
          estimated_seconds: number
          from_node_id: string
          id?: string
          instruction_en: string
          instruction_reverse_en: string
          instruction_reverse_zh: string
          instruction_zh: string
          opens_at?: string | null
          status?: string
          to_node_id: string
          traversal_type: string
          verified_at?: string | null
          wheelchair_suitable?: boolean
        }
        Update: {
          bidirectional?: boolean
          closes_at?: string | null
          closure_reason?: string | null
          distance_m?: number
          environment?: string
          estimated_seconds?: number
          from_node_id?: string
          id?: string
          instruction_en?: string
          instruction_reverse_en?: string
          instruction_reverse_zh?: string
          instruction_zh?: string
          opens_at?: string | null
          status?: string
          to_node_id?: string
          traversal_type?: string
          verified_at?: string | null
          wheelchair_suitable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "campus_edges_from_node_id_fkey"
            columns: ["from_node_id"]
            isOneToOne: false
            referencedRelation: "campus_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_edges_to_node_id_fkey"
            columns: ["to_node_id"]
            isOneToOne: false
            referencedRelation: "campus_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_floors: {
        Row: {
          building_id: string
          geometry: Json
          id: string
          label_en: string
          label_zh: string
          level: number
        }
        Insert: {
          building_id: string
          geometry?: Json
          id?: string
          label_en: string
          label_zh: string
          level: number
        }
        Update: {
          building_id?: string
          geometry?: Json
          id?: string
          label_en?: string
          label_zh?: string
          level?: number
        }
        Relationships: [
          {
            foreignKeyName: "campus_floors_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "campus_buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_nodes: {
        Row: {
          active: boolean
          building_id: string | null
          floor_id: string | null
          id: string
          indoor_position: Json
          latitude: number | null
          longitude: number | null
          node_type: string
          place_id: string | null
          site_id: string
        }
        Insert: {
          active?: boolean
          building_id?: string | null
          floor_id?: string | null
          id?: string
          indoor_position?: Json
          latitude?: number | null
          longitude?: number | null
          node_type: string
          place_id?: string | null
          site_id: string
        }
        Update: {
          active?: boolean
          building_id?: string | null
          floor_id?: string | null
          id?: string
          indoor_position?: Json
          latitude?: number | null
          longitude?: number | null
          node_type?: string
          place_id?: string | null
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_nodes_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "campus_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_nodes_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "campus_floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_nodes_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "campus_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_nodes_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "campus_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_place_aliases: {
        Row: {
          alias: string
          id: string
          language: string
          normalized_alias: string | null
          place_id: string
        }
        Insert: {
          alias: string
          id?: string
          language: string
          normalized_alias?: string | null
          place_id: string
        }
        Update: {
          alias?: string
          id?: string
          language?: string
          normalized_alias?: string | null
          place_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_place_aliases_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "campus_places"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_places: {
        Row: {
          building_id: string | null
          closure_reason: string | null
          code: string
          contact_email: string | null
          contact_phone: string | null
          description_en: string
          description_zh: string
          floor_id: string | null
          id: string
          indoor_position: Json
          latitude: number | null
          longitude: number | null
          name_en: string
          name_zh: string
          official_source_id: string
          place_type: string
          room: string | null
          site_id: string
          status: string
          updated_at: string
          verified_at: string
          wheelchair_accessible: boolean | null
        }
        Insert: {
          building_id?: string | null
          closure_reason?: string | null
          code: string
          contact_email?: string | null
          contact_phone?: string | null
          description_en?: string
          description_zh?: string
          floor_id?: string | null
          id?: string
          indoor_position?: Json
          latitude?: number | null
          longitude?: number | null
          name_en: string
          name_zh: string
          official_source_id: string
          place_type: string
          room?: string | null
          site_id: string
          status?: string
          updated_at?: string
          verified_at: string
          wheelchair_accessible?: boolean | null
        }
        Update: {
          building_id?: string | null
          closure_reason?: string | null
          code?: string
          contact_email?: string | null
          contact_phone?: string | null
          description_en?: string
          description_zh?: string
          floor_id?: string | null
          id?: string
          indoor_position?: Json
          latitude?: number | null
          longitude?: number | null
          name_en?: string
          name_zh?: string
          official_source_id?: string
          place_type?: string
          room?: string | null
          site_id?: string
          status?: string
          updated_at?: string
          verified_at?: string
          wheelchair_accessible?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "campus_places_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "campus_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_places_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "campus_floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_places_official_source_id_fkey"
            columns: ["official_source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_places_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "campus_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_service_hours: {
        Row: {
          closed: boolean
          closes_at: string | null
          id: string
          note: string | null
          opens_at: string | null
          place_id: string
          weekday: number
        }
        Insert: {
          closed?: boolean
          closes_at?: string | null
          id?: string
          note?: string | null
          opens_at?: string | null
          place_id: string
          weekday: number
        }
        Update: {
          closed?: boolean
          closes_at?: string | null
          id?: string
          note?: string | null
          opens_at?: string | null
          place_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "campus_service_hours_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "campus_places"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_sites: {
        Row: {
          active: boolean
          center_latitude: number | null
          center_longitude: number | null
          code: string
          id: string
          name_en: string
          name_zh: string
          official_source_id: string | null
          verified_at: string | null
        }
        Insert: {
          active?: boolean
          center_latitude?: number | null
          center_longitude?: number | null
          code: string
          id?: string
          name_en: string
          name_zh: string
          official_source_id?: string | null
          verified_at?: string | null
        }
        Update: {
          active?: boolean
          center_latitude?: number | null
          center_longitude?: number | null
          code?: string
          id?: string
          name_en?: string
          name_zh?: string
          official_source_id?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campus_sites_official_source_id_fkey"
            columns: ["official_source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          case_number: number
          category: string
          created_at: string
          description: string
          due_at: string | null
          id: string
          owner_id: string | null
          priority: string
          resolved_at: string | null
          status: string
          student_id: string
          title: string
          updated_at: string
        }
        Insert: {
          case_number?: never
          category: string
          created_at?: string
          description?: string
          due_at?: string | null
          id?: string
          owner_id?: string | null
          priority?: string
          resolved_at?: string | null
          status?: string
          student_id: string
          title: string
          updated_at?: string
        }
        Update: {
          case_number?: never
          category?: string
          created_at?: string
          description?: string
          due_at?: string | null
          id?: string
          owner_id?: string | null
          priority?: string
          resolved_at?: string | null
          status?: string
          student_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_success_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachments: Json
          author_role: string
          citations: string[]
          content: string
          created_at: string
          id: string
          thread_id: string
        }
        Insert: {
          attachments?: Json
          author_role: string
          citations?: string[]
          content: string
          created_at?: string
          id?: string
          thread_id: string
        }
        Update: {
          attachments?: Json
          author_role?: string
          citations?: string[]
          content?: string
          created_at?: string
          id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          context_id: string | null
          context_type: string
          created_at: string
          id: string
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          context_id?: string | null
          context_type?: string
          created_at?: string
          id?: string
          owner_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          context_id?: string | null
          context_type?: string
          created_at?: string
          id?: string
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_requests: {
        Row: {
          approval_reason: string | null
          approved_at: string | null
          approved_by: string | null
          body: string
          channel: string
          created_at: string
          id: string
          recipient_id: string
          sender_id: string
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          approval_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          body: string
          channel?: string
          created_at?: string
          id?: string
          recipient_id: string
          sender_id: string
          sent_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          approval_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          channel?: string
          created_at?: string
          id?: string
          recipient_id?: string
          sender_id?: string
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_requests_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      controlled_action_audit: {
        Row: {
          action: string
          actor_id: string
          after_state: Json
          before_state: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          reason: string
        }
        Insert: {
          action: string
          actor_id: string
          after_state?: Json
          before_state?: Json
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          reason: string
        }
        Update: {
          action?: string
          actor_id?: string
          after_state?: Json
          before_state?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "controlled_action_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_sections: {
        Row: {
          capacity: number
          course_id: string
          created_at: string
          faculty_id: string | null
          id: string
          modality: string
          room: string | null
          section_code: string
          status: string
          term_id: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          course_id: string
          created_at?: string
          faculty_id?: string | null
          id?: string
          modality?: string
          room?: string | null
          section_code: string
          status?: string
          term_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          course_id?: string
          created_at?: string
          faculty_id?: string | null
          id?: string
          modality?: string
          room?: string | null
          section_code?: string
          status?: string
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_sections_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_sections_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_sections_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "academic_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      course_topics: {
        Row: {
          content_markdown: string
          created_at: string
          created_by: string | null
          estimated_minutes: number
          id: string
          position: number
          published_at: string | null
          section_id: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          content_markdown?: string
          created_at?: string
          created_by?: string | null
          estimated_minutes?: number
          id?: string
          position: number
          published_at?: string | null
          section_id: string
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          content_markdown?: string
          created_at?: string
          created_by?: string | null
          estimated_minutes?: number
          id?: string
          position?: number
          published_at?: string | null
          section_id?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_topics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_topics_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          created_at: string
          credits: number
          department_id: string
          description: string
          id: string
          program_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          credits?: number
          department_id: string
          description?: string
          id?: string
          program_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          credits?: number
          department_id?: string
          description?: string
          id?: string
          program_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "academic_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          assigned_to: string
          case_id: string | null
          completed_at: string | null
          created_at: string
          due_at: string | null
          id: string
          priority: string
          student_id: string | null
          title: string
        }
        Insert: {
          assigned_to: string
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          priority?: string
          student_id?: string | null
          title: string
        }
        Update: {
          assigned_to?: string
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          priority?: string
          student_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_success_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_block_templates: {
        Row: {
          block_code: string
          capacity: number
          created_at: string
          id: string
          plan_id: string
          year_level: number
        }
        Insert: {
          block_code: string
          capacity?: number
          created_at?: string
          id?: string
          plan_id: string
          year_level: number
        }
        Update: {
          block_code?: string
          capacity?: number
          created_at?: string
          id?: string
          plan_id?: string
          year_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_block_templates_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "curriculum_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_course_prerequisites: {
        Row: {
          created_at: string
          plan_course_id: string
          prerequisite_course_id: string
        }
        Insert: {
          created_at?: string
          plan_course_id: string
          prerequisite_course_id: string
        }
        Update: {
          created_at?: string
          plan_course_id?: string
          prerequisite_course_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_course_prerequisites_plan_course_id_fkey"
            columns: ["plan_course_id"]
            isOneToOne: false
            referencedRelation: "curriculum_plan_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_course_prerequisites_prerequisite_course_id_fkey"
            columns: ["prerequisite_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_plan_courses: {
        Row: {
          category: string
          course_id: string
          created_at: string
          id: string
          plan_id: string
          semester: number
          sort_order: number
          year_level: number
        }
        Insert: {
          category: string
          course_id: string
          created_at?: string
          id?: string
          plan_id: string
          semester: number
          sort_order: number
          year_level: number
        }
        Update: {
          category?: string
          course_id?: string
          created_at?: string
          id?: string
          plan_id?: string
          semester?: number
          sort_order?: number
          year_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_plan_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_plan_courses_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "curriculum_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_plans: {
        Row: {
          created_at: string
          created_by: string
          effective_year: number
          id: string
          idempotency_key: string
          program_id: string
          source_payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          effective_year: number
          id?: string
          idempotency_key: string
          program_id: string
          source_payload: Json
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          effective_year?: number
          id?: string
          idempotency_key?: string
          program_id?: string
          source_payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_plans_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "academic_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          description: string
          head_id: string | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string
          head_id?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          head_id?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_head_id_fkey"
            columns: ["head_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_items: {
        Row: {
          assessment_id: string | null
          category: string
          created_at: string
          due_at: string | null
          id: string
          max_score: number
          section_id: string
          title: string
          updated_at: string
          weight_percent: number
        }
        Insert: {
          assessment_id?: string | null
          category?: string
          created_at?: string
          due_at?: string | null
          id?: string
          max_score: number
          section_id: string
          title: string
          updated_at?: string
          weight_percent?: number
        }
        Update: {
          assessment_id?: string | null
          category?: string
          created_at?: string
          due_at?: string | null
          id?: string
          max_score?: number
          section_id?: string
          title?: string
          updated_at?: string
          weight_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "grade_items_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_scan_jobs: {
        Row: {
          confidence: number | null
          created_at: string
          extracted_payload: Json
          grade_item_id: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          section_id: string
          source_name: string
          status: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          extracted_payload?: Json
          grade_item_id?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          section_id: string
          source_name: string
          status?: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          extracted_payload?: Json
          grade_item_id?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          section_id?: string
          source_name?: string
          status?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_scan_jobs_grade_item_id_fkey"
            columns: ["grade_item_id"]
            isOneToOne: false
            referencedRelation: "grade_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_scan_jobs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_scan_jobs_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_scan_jobs_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          feedback: string | null
          grade_item_id: string
          graded_at: string
          graded_by: string | null
          id: string
          letter_grade: string | null
          published_at: string | null
          score: number
          status: string
          student_id: string | null
          student_profile_id: string | null
          updated_at: string
        }
        Insert: {
          feedback?: string | null
          grade_item_id: string
          graded_at?: string
          graded_by?: string | null
          id?: string
          letter_grade?: string | null
          published_at?: string | null
          score: number
          status?: string
          student_id?: string | null
          student_profile_id?: string | null
          updated_at?: string
        }
        Update: {
          feedback?: string | null
          grade_item_id?: string
          graded_at?: string
          graded_by?: string | null
          id?: string
          letter_grade?: string | null
          published_at?: string | null
          score?: number
          status?: string
          student_id?: string | null
          student_profile_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_grade_item_id_fkey"
            columns: ["grade_item_id"]
            isOneToOne: false
            referencedRelation: "grade_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_success_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      institutional_initiatives: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          description: string
          due_at: string | null
          id: string
          initiative_type: string
          owner_id: string | null
          priority: string
          scope: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          description: string
          due_at?: string | null
          id?: string
          initiative_type: string
          owner_id?: string | null
          priority?: string
          scope?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          description?: string
          due_at?: string | null
          id?: string
          initiative_type?: string
          owner_id?: string | null
          priority?: string
          scope?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "institutional_initiatives_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institutional_initiatives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institutional_initiatives_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          interaction_type: string
          occurred_at: string
          student_id: string
          subject: string
          summary: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          interaction_type: string
          occurred_at?: string
          student_id: string
          subject: string
          summary: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          interaction_type?: string
          occurred_at?: string
          student_id?: string
          subject?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_success_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          audience_roles: string[]
          audience_scope: string
          category: string
          content: string
          created_at: string
          embedding: string | null
          id: string
          owner_id: string | null
          review_due_at: string | null
          review_notes: string
          reviewed_by: string | null
          search_document: unknown
          section_id: string | null
          source_event_id: string | null
          source_profile_id: string | null
          source_type: string
          source_url: string | null
          status: string
          summary: string
          title: string
          updated_at: string
          usage_count: number
          verified_at: string | null
        }
        Insert: {
          audience_roles?: string[]
          audience_scope?: string
          category: string
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          owner_id?: string | null
          review_due_at?: string | null
          review_notes?: string
          reviewed_by?: string | null
          search_document?: unknown
          section_id?: string | null
          source_event_id?: string | null
          source_profile_id?: string | null
          source_type?: string
          source_url?: string | null
          status?: string
          summary: string
          title: string
          updated_at?: string
          usage_count?: number
          verified_at?: string | null
        }
        Update: {
          audience_roles?: string[]
          audience_scope?: string
          category?: string
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          owner_id?: string | null
          review_due_at?: string | null
          review_notes?: string
          reviewed_by?: string | null
          search_document?: unknown
          section_id?: string | null
          source_event_id?: string | null
          source_profile_id?: string | null
          source_type?: string
          source_url?: string | null
          status?: string
          summary?: string
          title?: string
          updated_at?: string
          usage_count?: number
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_articles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "schedule_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_source_profile_id_fkey"
            columns: ["source_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          active: boolean
          chunk_key: string
          content: string
          content_checksum: string
          created_at: string
          document_id: string
          effective_at: string | null
          embedding: string | null
          embedding_model: string | null
          expires_at: string | null
          heading_path: string[]
          id: string
          language: string
          metadata: Json
          ordinal: number
          search_document: unknown
          source_locator: string | null
          token_count: number | null
        }
        Insert: {
          active?: boolean
          chunk_key: string
          content: string
          content_checksum: string
          created_at?: string
          document_id: string
          effective_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          expires_at?: string | null
          heading_path?: string[]
          id?: string
          language: string
          metadata?: Json
          ordinal: number
          search_document?: unknown
          source_locator?: string | null
          token_count?: number | null
        }
        Update: {
          active?: boolean
          chunk_key?: string
          content?: string
          content_checksum?: string
          created_at?: string
          document_id?: string
          effective_at?: string | null
          embedding?: string | null
          embedding_model?: string | null
          expires_at?: string | null
          heading_path?: string[]
          id?: string
          language?: string
          metadata?: Json
          ordinal?: number
          search_document?: unknown
          source_locator?: string | null
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          audience_roles: string[]
          audience_scope: string
          content_checksum: string
          created_at: string
          document_type: string
          domain: string
          effective_at: string | null
          expires_at: string | null
          extraction_status: string
          id: string
          language: string
          logical_key: string
          metadata: Json
          normalized_content: string
          owner_profile_id: string
          publication_status: string
          published_at: string | null
          review_due_at: string | null
          review_status: string
          reviewed_at: string | null
          reviewer_profile_id: string | null
          section_id: string | null
          sensitivity: string
          source_id: string
          source_published_at: string | null
          source_updated_at: string | null
          source_url: string
          supersedes_id: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          audience_roles?: string[]
          audience_scope?: string
          content_checksum: string
          created_at?: string
          document_type: string
          domain: string
          effective_at?: string | null
          expires_at?: string | null
          extraction_status?: string
          id?: string
          language: string
          logical_key: string
          metadata?: Json
          normalized_content?: string
          owner_profile_id: string
          publication_status?: string
          published_at?: string | null
          review_due_at?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewer_profile_id?: string | null
          section_id?: string | null
          sensitivity?: string
          source_id: string
          source_published_at?: string | null
          source_updated_at?: string | null
          source_url: string
          supersedes_id?: string | null
          title: string
          updated_at?: string
          version: number
        }
        Update: {
          audience_roles?: string[]
          audience_scope?: string
          content_checksum?: string
          created_at?: string
          document_type?: string
          domain?: string
          effective_at?: string | null
          expires_at?: string | null
          extraction_status?: string
          id?: string
          language?: string
          logical_key?: string
          metadata?: Json
          normalized_content?: string
          owner_profile_id?: string
          publication_status?: string
          published_at?: string | null
          review_due_at?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewer_profile_id?: string | null
          section_id?: string | null
          sensitivity?: string
          source_id?: string
          source_published_at?: string | null
          source_updated_at?: string | null
          source_url?: string
          supersedes_id?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_reviewer_profile_id_fkey"
            columns: ["reviewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_ingestion_attempts: {
        Row: { attempt_number:number; chunk_count:number; created_at:string; embedding_ms:number; estimated_cost_usd:number; failure_class:string|null; failure_code:string|null; fetch_ms:number; finished_at:string|null; id:string; input_token_count:number; model:string; normalize_ms:number; persistence_ms:number; provider:string; provider_request_id_hash:string|null; retry_delay_ms:number; run_id:string; started_at:string; state:string }
        Insert: { attempt_number:number; chunk_count?:number; created_at?:string; embedding_ms?:number; estimated_cost_usd?:number; failure_class?:string|null; failure_code?:string|null; fetch_ms?:number; finished_at?:string|null; id?:string; input_token_count?:number; model:string; normalize_ms?:number; persistence_ms?:number; provider?:string; provider_request_id_hash?:string|null; retry_delay_ms?:number; run_id:string; started_at?:string; state:string }
        Update: { attempt_number?:number; chunk_count?:number; created_at?:string; embedding_ms?:number; estimated_cost_usd?:number; failure_class?:string|null; failure_code?:string|null; fetch_ms?:number; finished_at?:string|null; id?:string; input_token_count?:number; model?:string; normalize_ms?:number; persistence_ms?:number; provider?:string; provider_request_id_hash?:string|null; retry_delay_ms?:number; run_id?:string; started_at?:string; state?:string }
        Relationships: [{ foreignKeyName:"knowledge_ingestion_attempts_run_id_fkey"; columns:["run_id"]; isOneToOne:false; referencedRelation:"knowledge_ingestion_runs"; referencedColumns:["id"] }]
      }
      knowledge_ingestion_runs: {
        Row: {
          attempt_count: number
          chunker_version: string | null
          chunk_count: number
          cost_estimation_status: string
          cost_rate_usd_per_million: number
          created_at: string
          dead_lettered_at: string | null
          discovered_count: number
          duration_ms: number | null
          embedding_model: string | null
          error_code: string | null
          error_message: string | null
          estimated_cost_usd: number | null
          failed_count: number
          finished_at: string | null
          id: string
          input_checksum: string | null
          input_token_count: number
          last_heartbeat_at: string | null
          max_attempts: number
          next_retry_at: string | null
          output_checksum: string | null
          parser_version: string | null
          published_count: number
          queued_at: string
          requested_by: string | null
          source_id: string
          started_at: string
          status: string
          trigger_type: string
        }
        Insert: {
          attempt_count?: number
          chunker_version?: string | null
          chunk_count?: number
          cost_estimation_status?: string
          cost_rate_usd_per_million?: number
          created_at?: string
          dead_lettered_at?: string | null
          discovered_count?: number
          duration_ms?: number | null
          embedding_model?: string | null
          error_code?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          input_checksum?: string | null
          input_token_count?: number
          last_heartbeat_at?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          output_checksum?: string | null
          parser_version?: string | null
          published_count?: number
          queued_at?: string
          requested_by?: string | null
          source_id: string
          started_at?: string
          status?: string
          trigger_type: string
        }
        Update: {
          attempt_count?: number
          chunker_version?: string | null
          chunk_count?: number
          cost_estimation_status?: string
          cost_rate_usd_per_million?: number
          created_at?: string
          dead_lettered_at?: string | null
          discovered_count?: number
          duration_ms?: number | null
          embedding_model?: string | null
          error_code?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          input_checksum?: string | null
          input_token_count?: number
          last_heartbeat_at?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          output_checksum?: string | null
          parser_version?: string | null
          published_count?: number
          queued_at?: string
          requested_by?: string | null
          source_id?: string
          started_at?: string
          status?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_ingestion_runs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_ingestion_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_review_events: {
        Row: {
          action: string
          actor_profile_id: string
          after_state: Json
          before_state: Json
          created_at: string
          document_id: string
          id: string
          reason: string
        }
        Insert: {
          action: string
          actor_profile_id: string
          after_state?: Json
          before_state?: Json
          created_at?: string
          document_id: string
          id?: string
          reason: string
        }
        Update: {
          action?: string
          actor_profile_id?: string
          after_state?: Json
          before_state?: Json
          created_at?: string
          document_id?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_review_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_review_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          active: boolean
          authority_level: string
          canonical_url: string
          crawl_interval: string | null
          crawl_policy: string
          created_at: string
          default_audience_scope: string
          default_language: string
          department_id: string | null
          id: string
          name: string
          official_domain: boolean
          owner_profile_id: string
          robots_reviewed_at: string | null
          source_type: string
          terms_reviewed_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          authority_level: string
          canonical_url: string
          crawl_interval?: string | null
          crawl_policy?: string
          created_at?: string
          default_audience_scope?: string
          default_language?: string
          department_id?: string | null
          id?: string
          name: string
          official_domain?: boolean
          owner_profile_id: string
          robots_reviewed_at?: string | null
          source_type: string
          terms_reviewed_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          authority_level?: string
          canonical_url?: string
          crawl_interval?: string | null
          crawl_policy?: string
          created_at?: string
          default_audience_scope?: string
          default_language?: string
          department_id?: string | null
          id?: string
          name?: string
          official_domain?: boolean
          owner_profile_id?: string
          robots_reviewed_at?: string | null
          source_type?: string
          terms_reviewed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_sources_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_sources_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_material_pages: {
        Row: {
          content_html: string
          created_at: string
          created_by: string | null
          id: string
          material_id: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          content_html?: string
          created_at?: string
          created_by?: string | null
          id?: string
          material_id: string
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          content_html?: string
          created_at?: string
          created_by?: string | null
          id?: string
          material_id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_material_pages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_material_pages_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "learning_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_materials: {
        Row: {
          content_markdown: string
          created_at: string
          created_by: string | null
          description: string
          estimated_minutes: number
          external_url: string | null
          id: string
          is_required: boolean
          material_type: string
          module_id: string
          position: number
          published_at: string | null
          status: string
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content_markdown?: string
          created_at?: string
          created_by?: string | null
          description?: string
          estimated_minutes?: number
          external_url?: string | null
          id?: string
          is_required?: boolean
          material_type: string
          module_id: string
          position: number
          published_at?: string | null
          status?: string
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content_markdown?: string
          created_at?: string
          created_by?: string | null
          description?: string
          estimated_minutes?: number
          external_url?: string | null
          id?: string
          is_required?: boolean
          material_type?: string
          module_id?: string
          position?: number
          published_at?: string | null
          status?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_materials_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "learning_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_modules: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          position: number
          published_at: string | null
          section_id: string
          status: string
          title: string
          unlocks_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          position: number
          published_at?: string | null
          section_id: string
          status?: string
          title: string
          unlocks_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          position?: number
          published_at?: string | null
          section_id?: string
          status?: string
          title?: string
          unlocks_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_modules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_modules_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_progress: {
        Row: {
          completed_at: string | null
          id: string
          last_viewed_at: string
          material_id: string
          started_at: string | null
          status: string
          student_profile_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          last_viewed_at?: string
          material_id: string
          started_at?: string | null
          status?: string
          student_profile_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          last_viewed_at?: string
          material_id?: string
          started_at?: string | null
          status?: string
          student_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_progress_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "learning_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_progress_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nexus_prompt_queue: {
        Row: {
          attachments: Json
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          mode: string
          owner_id: string
          prompt: string
          started_at: string | null
          status: string
          thread_id: string
        }
        Insert: {
          attachments?: Json
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          mode: string
          owner_id: string
          prompt: string
          started_at?: string | null
          status?: string
          thread_id: string
        }
        Update: {
          attachments?: Json
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          mode?: string
          owner_id?: string
          prompt?: string
          started_at?: string | null
          status?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nexus_prompt_queue_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nexus_prompt_queue_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          read_at: string | null
          recipient_id: string
          title: string
        }
        Insert: {
          action_url?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          recipient_id: string
          title: string
        }
        Update: {
          action_url?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          recipient_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_events: {
        Row: {
          created_at: string
          event_data: Json
          event_type: string
          id: string
          progress_id: string
          role: string
          step_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_data?: Json
          event_type: string
          id?: string
          progress_id: string
          role: string
          step_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_data?: Json
          event_type?: string
          id?: string
          progress_id?: string
          role?: string
          step_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_events_progress_owner_fk"
            columns: ["progress_id", "user_id", "role"]
            isOneToOne: false
            referencedRelation: "onboarding_progress"
            referencedColumns: ["id", "user_id", "role"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          check_results: Json
          completed_at: string | null
          completed_step_keys: string[]
          created_at: string
          current_step_key: string
          id: string
          journey_key: string
          journey_version: number
          last_seen_at: string
          role: string
          started_at: string | null
          status: string
          understanding_score: number
          updated_at: string
          user_id: string
          verified_action_keys: string[]
        }
        Insert: {
          check_results?: Json
          completed_at?: string | null
          completed_step_keys?: string[]
          created_at?: string
          current_step_key?: string
          id?: string
          journey_key?: string
          journey_version?: number
          last_seen_at?: string
          role: string
          started_at?: string | null
          status?: string
          understanding_score?: number
          updated_at?: string
          user_id: string
          verified_action_keys?: string[]
        }
        Update: {
          check_results?: Json
          completed_at?: string | null
          completed_step_keys?: string[]
          created_at?: string
          current_step_key?: string
          id?: string
          journey_key?: string
          journey_version?: number
          last_seen_at?: string
          role?: string
          started_at?: string | null
          status?: string
          understanding_score?: number
          updated_at?: string
          user_id?: string
          verified_action_keys?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_section_assignments: {
        Row: {
          assigned_by: string
          created_at: string
          id: string
          profile_id: string
          reason: string
          responsibility: string
          section_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string
          id?: string
          profile_id: string
          reason: string
          responsibility: string
          section_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string
          id?: string
          profile_id?: string
          reason?: string
          responsibility?: string
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_section_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_section_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_section_assignments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: string
          created_at: string
          department: string | null
          department_id: string | null
          employee_number: string | null
          full_name: string
          id: string
          is_platform_owner: boolean
          job_title: string | null
          phone: string | null
          program_id: string | null
          role: string
          status_changed_at: string | null
          status_changed_by: string | null
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          account_status?: string
          created_at?: string
          department?: string | null
          department_id?: string | null
          employee_number?: string | null
          full_name: string
          id: string
          is_platform_owner?: boolean
          job_title?: string | null
          phone?: string | null
          program_id?: string | null
          role?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: string
          created_at?: string
          department?: string | null
          department_id?: string | null
          employee_number?: string | null
          full_name?: string
          id?: string
          is_platform_owner?: boolean
          job_title?: string | null
          phone?: string | null
          program_id?: string | null
          role?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "academic_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      research_consent_records: {
        Row: {
          consented: boolean
          consented_at: string
          id: string
          ip_hash: string | null
          participant_id: string
          study_version_id: string
          user_agent_family: string | null
          withdrawn_at: string | null
        }
        Insert: {
          consented: boolean
          consented_at: string
          id?: string
          ip_hash?: string | null
          participant_id: string
          study_version_id: string
          user_agent_family?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          consented?: boolean
          consented_at?: string
          id?: string
          ip_hash?: string | null
          participant_id?: string
          study_version_id?: string
          user_agent_family?: string | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_consent_records_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "research_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_consent_records_study_version_id_fkey"
            columns: ["study_version_id"]
            isOneToOne: false
            referencedRelation: "research_study_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      research_participant_tokens: {
        Row: {
          created_at: string
          expires_at: string
          last_used_at: string | null
          participant_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          last_used_at?: string | null
          participant_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          last_used_at?: string | null
          participant_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_participant_tokens_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: true
            referencedRelation: "research_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      research_participants: {
        Row: {
          contact_ciphertext: string | null
          created_at: string
          familiarity_level: string
          id: string
          participant_code: string
          population_role: string
          status: string
          study_id: string
        }
        Insert: {
          contact_ciphertext?: string | null
          created_at?: string
          familiarity_level: string
          id?: string
          participant_code: string
          population_role: string
          status?: string
          study_id: string
        }
        Update: {
          contact_ciphertext?: string | null
          created_at?: string
          familiarity_level?: string
          id?: string
          participant_code?: string
          population_role?: string
          status?: string
          study_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_participants_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "research_studies"
            referencedColumns: ["id"]
          },
        ]
      }
      research_questionnaire_items: {
        Row: {
          construct: string | null
          id: string
          item_key: string
          ordinal: number
          prompt: string
          questionnaire_id: string
          response_type: string
          reverse_scored: boolean
        }
        Insert: {
          construct?: string | null
          id?: string
          item_key: string
          ordinal: number
          prompt: string
          questionnaire_id: string
          response_type: string
          reverse_scored?: boolean
        }
        Update: {
          construct?: string | null
          id?: string
          item_key?: string
          ordinal?: number
          prompt?: string
          questionnaire_id?: string
          response_type?: string
          reverse_scored?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "research_questionnaire_items_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "research_questionnaires"
            referencedColumns: ["id"]
          },
        ]
      }
      research_questionnaires: {
        Row: {
          id: string
          instrument: string
          language: string
          scoring_spec: Json
          study_version_id: string
          version: string
        }
        Insert: {
          id?: string
          instrument: string
          language: string
          scoring_spec?: Json
          study_version_id: string
          version: string
        }
        Update: {
          id?: string
          instrument?: string
          language?: string
          scoring_spec?: Json
          study_version_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_questionnaires_study_version_id_fkey"
            columns: ["study_version_id"]
            isOneToOne: false
            referencedRelation: "research_study_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      research_responses: {
        Row: {
          condition: string | null
          created_at: string
          id: string
          item_id: string
          numeric_value: number | null
          questionnaire_id: string
          session_id: string
          text_value: string | null
        }
        Insert: {
          condition?: string | null
          created_at?: string
          id?: string
          item_id: string
          numeric_value?: number | null
          questionnaire_id: string
          session_id: string
          text_value?: string | null
        }
        Update: {
          condition?: string | null
          created_at?: string
          id?: string
          item_id?: string
          numeric_value?: number | null
          questionnaire_id?: string
          session_id?: string
          text_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_responses_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "research_questionnaire_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_responses_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "research_questionnaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "research_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      research_sessions: {
        Row: {
          completed_at: string | null
          id: string
          participant_id: string
          sequence: string
          started_at: string
          status: string
          study_version_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          participant_id: string
          sequence: string
          started_at?: string
          status?: string
          study_version_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          participant_id?: string
          sequence?: string
          started_at?: string
          status?: string
          study_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_sessions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "research_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_sessions_study_version_id_fkey"
            columns: ["study_version_id"]
            isOneToOne: false
            referencedRelation: "research_study_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      research_studies: {
        Row: {
          code: string
          created_at: string
          id: string
          owner_profile_id: string
          purpose: string
          retention_days: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          owner_profile_id: string
          purpose: string
          retention_days: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          owner_profile_id?: string
          purpose?: string
          retention_days?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_studies_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      research_study_versions: {
        Row: {
          analysis_plan: Json
          consent_text_en: string
          consent_text_zh: string
          created_at: string
          frozen_at: string | null
          frozen_by: string | null
          id: string
          protocol: Json
          study_id: string
          version: number
        }
        Insert: {
          analysis_plan: Json
          consent_text_en: string
          consent_text_zh: string
          created_at?: string
          frozen_at?: string | null
          frozen_by?: string | null
          id?: string
          protocol: Json
          study_id: string
          version: number
        }
        Update: {
          analysis_plan?: Json
          consent_text_en?: string
          consent_text_zh?: string
          created_at?: string
          frozen_at?: string | null
          frozen_by?: string | null
          id?: string
          protocol?: Json
          study_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "research_study_versions_frozen_by_fkey"
            columns: ["frozen_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_study_versions_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "research_studies"
            referencedColumns: ["id"]
          },
        ]
      }
      research_task_attempts: {
        Row: {
          assistance_requests: number
          backtracks: number
          condition: string
          created_at: string
          duration_ms: number
          id: string
          navigation_steps: number
          notes: string | null
          reformulations: number
          seq_score: number | null
          session_id: string
          source_identification_correct: boolean | null
          success: string
          task_id: string
          variant: string
          wrong_page_visits: number
        }
        Insert: {
          assistance_requests?: number
          backtracks?: number
          condition: string
          created_at?: string
          duration_ms: number
          id?: string
          navigation_steps?: number
          notes?: string | null
          reformulations?: number
          seq_score?: number | null
          session_id: string
          source_identification_correct?: boolean | null
          success: string
          task_id: string
          variant: string
          wrong_page_visits?: number
        }
        Update: {
          assistance_requests?: number
          backtracks?: number
          condition?: string
          created_at?: string
          duration_ms?: number
          id?: string
          navigation_steps?: number
          notes?: string | null
          reformulations?: number
          seq_score?: number | null
          session_id?: string
          source_identification_correct?: boolean | null
          success?: string
          task_id?: string
          variant?: string
          wrong_page_visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "research_task_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "research_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_task_attempts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "research_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      research_tasks: {
        Row: {
          domain: string
          gold_answer: Json
          id: string
          max_seconds: number
          ordinal: number
          study_version_id: string
          task_key: string
          variant_a: string
          variant_b: string
        }
        Insert: {
          domain: string
          gold_answer: Json
          id?: string
          max_seconds: number
          ordinal: number
          study_version_id: string
          task_key: string
          variant_a: string
          variant_b: string
        }
        Update: {
          domain?: string
          gold_answer?: Json
          id?: string
          max_seconds?: number
          ordinal?: number
          study_version_id?: string
          task_key?: string
          variant_a?: string
          variant_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_tasks_study_version_id_fkey"
            columns: ["study_version_id"]
            isOneToOne: false
            referencedRelation: "research_study_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      role_change_audit: {
        Row: {
          changed_by: string
          created_at: string
          id: string
          new_role: string
          previous_role: string
          reason: string
          target_profile_id: string
        }
        Insert: {
          changed_by: string
          created_at?: string
          id?: string
          new_role: string
          previous_role: string
          reason: string
          target_profile_id: string
        }
        Update: {
          changed_by?: string
          created_at?: string
          id?: string
          new_role?: string
          previous_role?: string
          reason?: string
          target_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_change_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_change_audit_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_definitions: {
        Row: {
          capabilities: string[]
          category: string
          created_at: string
          description: string
          display_name: string
          hierarchy_level: number
          role_code: string
        }
        Insert: {
          capabilities?: string[]
          category: string
          created_at?: string
          description: string
          display_name: string
          hierarchy_level: number
          role_code: string
        }
        Update: {
          capabilities?: string[]
          category?: string
          created_at?: string
          description?: string
          display_name?: string
          hierarchy_level?: number
          role_code?: string
        }
        Relationships: []
      }
      schedule_events: {
        Row: {
          audience_roles: string[]
          created_at: string
          created_by: string | null
          description: string
          ends_at: string
          event_type: string
          id: string
          location: string | null
          owner_profile_id: string | null
          section_id: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          audience_roles?: string[]
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at: string
          event_type: string
          id?: string
          location?: string | null
          owner_profile_id?: string | null
          section_id?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          audience_roles?: string[]
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at?: string
          event_type?: string
          id?: string
          location?: string | null
          owner_profile_id?: string | null
          section_id?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_events_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_events_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      section_enrollments: {
        Row: {
          completed_at: string | null
          enrolled_at: string
          id: string
          section_id: string
          status: string
          student_id: string | null
          student_profile_id: string | null
        }
        Insert: {
          completed_at?: string | null
          enrolled_at?: string
          id?: string
          section_id: string
          status?: string
          student_id?: string | null
          student_profile_id?: string | null
        }
        Update: {
          completed_at?: string | null
          enrolled_at?: string
          id?: string
          section_id?: string
          status?: string
          student_id?: string | null
          student_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "section_enrollments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "course_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_success_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_enrollments_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sensitive_case_access: {
        Row: {
          accessed_at: string
          actor_id: string
          case_id: string
          id: string
          purpose: string
        }
        Insert: {
          accessed_at?: string
          actor_id: string
          case_id: string
          id?: string
          purpose: string
        }
        Update: {
          accessed_at?: string
          actor_id?: string
          case_id?: string
          id?: string
          purpose?: string
        }
        Relationships: [
          {
            foreignKeyName: "sensitive_case_access_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensitive_case_access_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      student_signals: {
        Row: {
          created_at: string
          detail: string
          id: string
          label: string
          observed_at: string
          resolved_at: string | null
          severity: string
          signal_type: string
          source_system: string
          student_id: string
        }
        Insert: {
          created_at?: string
          detail: string
          id?: string
          label: string
          observed_at?: string
          resolved_at?: string | null
          severity: string
          signal_type: string
          source_system: string
          student_id: string
        }
        Update: {
          created_at?: string
          detail?: string
          id?: string
          label?: string
          observed_at?: string
          resolved_at?: string | null
          severity?: string
          signal_type?: string
          source_system?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_signals_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_success_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_signals_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          advisor_id: string | null
          attendance_percent: number
          created_at: string
          email: string | null
          engagement_score: number
          full_name: string
          gpa: number
          id: string
          last_contact_at: string | null
          merged_into_id: string | null
          next_best_action: string | null
          outstanding_balance: number
          phone: string | null
          preferred_name: string | null
          profile_id: string | null
          program: string
          program_id: string | null
          record_status: string
          risk_level: string
          risk_score: number
          status_changed_at: string | null
          status_reason: string | null
          student_number: string
          tags: string[]
          updated_at: string
          year_level: string
        }
        Insert: {
          advisor_id?: string | null
          attendance_percent?: number
          created_at?: string
          email?: string | null
          engagement_score?: number
          full_name: string
          gpa?: number
          id?: string
          last_contact_at?: string | null
          merged_into_id?: string | null
          next_best_action?: string | null
          outstanding_balance?: number
          phone?: string | null
          preferred_name?: string | null
          profile_id?: string | null
          program: string
          program_id?: string | null
          record_status?: string
          risk_level?: string
          risk_score?: number
          status_changed_at?: string | null
          status_reason?: string | null
          student_number: string
          tags?: string[]
          updated_at?: string
          year_level: string
        }
        Update: {
          advisor_id?: string | null
          attendance_percent?: number
          created_at?: string
          email?: string | null
          engagement_score?: number
          full_name?: string
          gpa?: number
          id?: string
          last_contact_at?: string | null
          merged_into_id?: string | null
          next_best_action?: string | null
          outstanding_balance?: number
          phone?: string | null
          preferred_name?: string | null
          profile_id?: string | null
          program?: string
          program_id?: string | null
          record_status?: string
          risk_level?: string
          risk_score?: number
          status_changed_at?: string | null
          status_reason?: string | null
          student_number?: string
          tags?: string[]
          updated_at?: string
          year_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_advisor_id_fkey"
            columns: ["advisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "student_success_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "academic_programs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      student_success_summary: {
        Row: {
          active_signal_count: number | null
          attendance_percent: number | null
          engagement_score: number | null
          full_name: string | null
          gpa: number | null
          id: string | null
          next_best_action: string | null
          open_case_count: number | null
          program: string | null
          risk_level: string | null
          risk_score: number | null
          student_number: string | null
          year_level: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      administrative_workload_report: { Args: { p_office_code: string; p_study_id: string }; Returns: Json }
      knowledge_ingestion_operational_summary: { Args: { p_since?: string }; Returns: Json }
      begin_research_participation: {
        Args: { p_consent: boolean; p_familiarity_level: string; p_population_role: string; p_study_code: string; p_study_version_id: string; p_user_agent_family?: string }
        Returns: Json
      }
      complete_research_session: { Args: { p_token: string }; Returns: boolean }
      get_research_session: { Args: { p_language?: string; p_token: string }; Returns: Json }
      public_research_study: { Args: { p_language?: string; p_study_code: string }; Returns: Json }
      purge_administrative_workload_fixture: { Args: { p_study_id: string }; Returns: Json }
      recover_stale_ingestion_runs: { Args: { p_stale_before?: string }; Returns: number }
      review_knowledge_document: { Args: { p_decision: string; p_document_id: string; p_reason: string }; Returns: Json }
      research_anonymized_export: { Args: { p_study_id: string }; Returns: Json }
      research_sus_score: { Args: { p_condition: string; p_session_id: string }; Returns: number }
      set_research_session_status: { Args: { p_status: string; p_token: string }; Returns: string }
      submit_research_attempt: { Args: { p_condition: string; p_metrics: Json; p_task_id: string; p_token: string }; Returns: string }
      submit_research_response: { Args: { p_condition: string; p_item_id: string; p_numeric_value?: number; p_text_value?: string; p_token: string }; Returns: string }
      withdraw_research_participation: { Args: { p_delete_now?: boolean; p_token: string }; Returns: boolean }
      verify_administrative_workload_window: { Args: { p_decision: string; p_window_id: string }; Returns: undefined }
      approve_and_send_campaign: {
        Args: { p_campaign_id: string; p_reason: string }
        Returns: {
          approval_reason: string | null
          approved_at: string | null
          approved_by: string | null
          audience_definition: Json
          audience_scope: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          message_template: string
          name: string
          program_id: string | null
          scheduled_for: string | null
          section_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_grade_scan: {
        Args: { p_job_id: string; p_rows: Json }
        Returns: {
          saved_count: number
        }[]
      }
      archive_academic_program: {
        Args: { p_program_id: string; p_reason: string }
        Returns: {
          code: string
          created_at: string
          department_id: string
          description: string
          duration_years: number
          id: string
          level: string
          name: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "academic_programs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_platform_role: {
        Args: { p_new_role: string; p_profile_id: string; p_reason: string }
        Returns: {
          profile_id: string
          role: string
        }[]
      }
      claim_initial_admin: { Args: never; Returns: boolean }
      close_academic_term: {
        Args: { p_reason: string; p_term_id: string }
        Returns: {
          code: string
          created_at: string
          ends_on: string
          enrollment_ends_on: string | null
          enrollment_starts_on: string | null
          id: string
          name: string
          starts_on: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "academic_terms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      correct_published_grade: {
        Args: {
          p_feedback: string
          p_grade_id: string
          p_letter_grade: string
          p_reason: string
          p_score: number
        }
        Returns: {
          feedback: string | null
          grade_item_id: string
          graded_at: string
          graded_by: string | null
          id: string
          letter_grade: string | null
          published_at: string | null
          score: number
          status: string
          student_id: string | null
          student_profile_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "grades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_academic_curriculum: {
        Args: {
          p_department_id: string
          p_idempotency_key: string
          p_payload: Json
        }
        Returns: Json
      }
      create_lms_assessment: {
        Args: {
          p_due_at: string
          p_instructions: string
          p_max_score: number
          p_publish: boolean
          p_questions?: Json
          p_section_id: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      create_manual_academic_curriculum: {
        Args: {
          p_idempotency_key: string
          p_payload: Json
          p_program_id: string
          p_reason: string
        }
        Returns: Json
      }
      decide_attendance_correction: {
        Args: { p_approve: boolean; p_reason: string; p_request_id: string }
        Returns: {
          attendance_record_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          reason: string
          requested_status: string
          status: string
          student_profile_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "attendance_correction_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decide_communication_request: {
        Args: { p_approve: boolean; p_reason: string; p_request_id: string }
        Returns: {
          approval_reason: string | null
          approved_at: string | null
          approved_by: string | null
          body: string
          channel: string
          created_at: string
          id: string
          recipient_id: string
          sender_id: string
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "communication_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_draft_academic_curriculum: {
        Args: { p_plan_id: string; p_reason: string }
        Returns: Json
      }
      manage_section_enrollment: {
        Args: { p_section_id: string; p_status?: string; p_student_id: string }
        Returns: {
          capacity: number
          enrolled_count: number
          enrollment_id: string
          status: string
        }[]
      }
      merge_student_records: {
        Args: { p_reason: string; p_source_id: string; p_target_id: string }
        Returns: {
          advisor_id: string | null
          attendance_percent: number
          created_at: string
          email: string | null
          engagement_score: number
          full_name: string
          gpa: number
          id: string
          last_contact_at: string | null
          merged_into_id: string | null
          next_best_action: string | null
          outstanding_balance: number
          phone: string | null
          preferred_name: string | null
          profile_id: string | null
          program: string
          program_id: string | null
          record_status: string
          risk_level: string
          risk_score: number
          status_changed_at: string | null
          status_reason: string | null
          student_number: string
          tags: string[]
          updated_at: string
          year_level: string
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      publish_final_grade: {
        Args: { p_grade_id: string; p_reason: string }
        Returns: {
          feedback: string | null
          grade_item_id: string
          graded_at: string
          graded_by: string | null
          id: string
          letter_grade: string | null
          published_at: string | null
          score: number
          status: string
          student_id: string | null
          student_profile_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "grades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      publish_knowledge_document: {
        Args: { p_document_id: string; p_reason: string }
        Returns: Json
      }
      purge_knowledge_verification_fixture: {
        Args: { p_source_id: string }
        Returns: Json
      }
      read_assessment_attempts: {
        Args: never
        Returns: {
          assessment_id: string
          attempt_number: number
          graded_at: string
          id: string
          max_score: number
          score: number
          started_at: string
          status: string
          student_profile_id: string
          submitted_at: string
        }[]
      }
      read_assessment_questions: {
        Args: never
        Returns: {
          assessment_id: string
          explanation: string
          id: string
          points: number
          position: number
          prompt: string
          question_type: string
        }[]
      }
      read_assessment_review: {
        Args: { p_assessment_id: string }
        Returns: Json
      }
      record_sensitive_case_access: {
        Args: { p_case_id: string; p_purpose: string }
        Returns: undefined
      }
      remove_profile_section_assignment: {
        Args: { p_assignment_id: string; p_reason: string }
        Returns: undefined
      }
      request_admission_handoff: {
        Args: { p_lead_id: string; p_notes: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          lead_id: string
          notes: string
          requested_by: string
          status: string
          student_profile_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "admission_handoffs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_platform_sessions: {
        Args: {
          p_acted_by: string
          p_reason: string
          p_target_profile_id: string
        }
        Returns: number
      }
      rollback_knowledge_document: {
        Args: { p_document_id: string; p_reason: string }
        Returns: Json
      }
      search_public_knowledge: {
        Args: {
          p_domain?: string
          p_embedding: string
          p_language?: string
          p_limit?: number
          p_query: string
        }
        Returns: {
          authority_level: string
          chunk_id: string
          content: string
          content_checksum: string
          document_domain: string
          document_id: string
          document_language: string
          document_title: string
          document_version: number
          effective_at: string
          exact_score: number
          fused_score: number
          keyword_score: number
          reviewed_at: string
          source_id: string
          source_locator: string
          source_name: string
          source_url: string
          vector_score: number
        }[]
      }
      submit_assessment: {
        Args: { p_answers: Json; p_assessment_id: string }
        Returns: {
          attempt_id: string
          max_score: number
          score: number
          status: string
        }[]
      }
      sync_campaign_recipients: {
        Args: { p_campaign_id: string; p_student_ids?: string[] }
        Returns: Json
      }
      transition_assignment_submission: {
        Args: { p_action: string; p_reason: string; p_submission_id: string }
        Returns: {
          assessment_id: string
          created_at: string
          feedback: string
          graded_at: string | null
          graded_by: string | null
          id: string
          score: number | null
          status: string
          storage_path: string | null
          student_profile_id: string
          submission_text: string
          submitted_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "assignment_submissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_enrollment: {
        Args: { p_enrollment_id: string; p_reason: string; p_status: string }
        Returns: {
          completed_at: string | null
          enrolled_at: string
          id: string
          section_id: string
          status: string
          student_id: string | null
          student_profile_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "section_enrollments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_institutional_initiative: {
        Args: {
          p_action: string
          p_initiative_id: string
          p_owner_id: string
          p_reason: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          description: string
          due_at: string | null
          id: string
          initiative_type: string
          owner_id: string | null
          priority: string
          scope: string
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "institutional_initiatives"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_academic_curriculum: {
        Args: {
          p_payload: Json
          p_plan_id: string
          p_reason: string
          p_status: string
        }
        Returns: Json
      }
      update_department_staff_profile: {
        Args: {
          p_department: string
          p_full_name: string
          p_job_title: string
          p_profile_id: string
          p_reason: string
        }
        Returns: {
          account_status: string
          created_at: string
          department: string | null
          department_id: string | null
          employee_number: string | null
          full_name: string
          id: string
          is_platform_owner: boolean
          job_title: string | null
          phone: string | null
          program_id: string | null
          role: string
          status_changed_at: string | null
          status_changed_by: string | null
          status_reason: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_lms_assessment: {
        Args: {
          p_assessment_id: string
          p_due_at: string
          p_instructions: string
          p_max_score: number
          p_publish: boolean
          p_questions?: Json
          p_title: string
          p_type: string
        }
        Returns: string
      }
      withdraw_student_record: {
        Args: { p_reason: string; p_student_id: string }
        Returns: {
          advisor_id: string | null
          attendance_percent: number
          created_at: string
          email: string | null
          engagement_score: number
          full_name: string
          gpa: number
          id: string
          last_contact_at: string | null
          merged_into_id: string | null
          next_best_action: string | null
          outstanding_balance: number
          phone: string | null
          preferred_name: string | null
          profile_id: string | null
          program: string
          program_id: string | null
          record_status: string
          risk_level: string
          risk_score: number
          status_changed_at: string | null
          status_reason: string | null
          student_number: string
          tags: string[]
          updated_at: string
          year_level: string
        }
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
