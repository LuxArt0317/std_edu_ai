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
