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
          due_at: string | null
          duration_minutes: number | null
          id: string
          instructions: string
          max_score: number
          opens_at: string | null
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
          due_at?: string | null
          duration_minutes?: number | null
          id?: string
          instructions?: string
          max_score?: number
          opens_at?: string | null
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
          due_at?: string | null
          duration_minutes?: number | null
          id?: string
          instructions?: string
          max_score?: number
          opens_at?: string | null
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
          audience_definition: Json
          channel: string
          created_at: string
          created_by: string | null
          id: string
          message_template: string
          name: string
          scheduled_for: string | null
          status: string
          updated_at: string
        }
        Insert: {
          audience_definition?: Json
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          message_template?: string
          name: string
          scheduled_for?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          audience_definition?: Json
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          message_template?: string
          name?: string
          scheduled_for?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          author_role: string
          citations: string[]
          content: string
          created_at: string
          id: string
          thread_id: string
        }
        Insert: {
          author_role: string
          citations?: string[]
          content: string
          created_at?: string
          id?: string
          thread_id: string
        }
        Update: {
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
          category: string
          content: string
          created_at: string
          embedding: string | null
          id: string
          owner_id: string | null
          review_due_at: string | null
          search_document: unknown
          source_url: string | null
          status: string
          summary: string
          title: string
          updated_at: string
          usage_count: number
          verified_at: string | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          owner_id?: string | null
          review_due_at?: string | null
          search_document?: unknown
          source_url?: string | null
          status?: string
          summary: string
          title: string
          updated_at?: string
          usage_count?: number
          verified_at?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          owner_id?: string | null
          review_due_at?: string | null
          search_document?: unknown
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
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string
          created_at: string
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
          id?: string
          kind?: string
          read_at?: string | null
          recipient_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          department: string | null
          employee_number: string | null
          full_name: string
          id: string
          is_platform_owner: boolean
          job_title: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          employee_number?: string | null
          full_name: string
          id: string
          is_platform_owner?: boolean
          job_title?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          employee_number?: string | null
          full_name?: string
          id?: string
          is_platform_owner?: boolean
          job_title?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
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
          next_best_action: string | null
          outstanding_balance: number
          phone: string | null
          preferred_name: string | null
          profile_id: string | null
          program: string
          risk_level: string
          risk_score: number
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
          next_best_action?: string | null
          outstanding_balance?: number
          phone?: string | null
          preferred_name?: string | null
          profile_id?: string | null
          program: string
          risk_level?: string
          risk_score?: number
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
          next_best_action?: string | null
          outstanding_balance?: number
          phone?: string | null
          preferred_name?: string | null
          profile_id?: string | null
          program?: string
          risk_level?: string
          risk_score?: number
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
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
      approve_grade_scan: {
        Args: { p_job_id: string; p_rows: Json }
        Returns: {
          saved_count: number
        }[]
      }
      assign_platform_role: {
        Args: { p_new_role: string; p_profile_id: string; p_reason: string }
        Returns: {
          profile_id: string
          role: string
        }[]
      }
      claim_initial_admin: { Args: never; Returns: boolean }
      submit_assessment: {
        Args: { p_answers: Json; p_assessment_id: string }
        Returns: {
          attempt_id: string
          max_score: number
          score: number
          status: string
        }[]
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
