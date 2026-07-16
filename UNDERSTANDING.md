# Understanding of `research.md`

## Core Goal

The project is not to invent a separate unrelated website. The goal is to recreate and improve the existing Shu-Te University website experience, based on `https://www.stu.edu.tw`, and add an AI layer that makes university information easier to access.

## What The Website Is About

This website is an AI-enhanced smart campus platform for Shu-Te University. It is intended to help students, faculty, staff, and visitors find information faster and with less friction than the current website flow.

The research repeatedly points to a few major problems:

- important information is spread across many pages
- users have to navigate deep menu structures
- students spend too much time searching for routine information
- administrative offices receive repetitive questions

## Proposed Solution

The proposed website solves those problems by combining:

- an improved website interface
- intelligent information retrieval
- an AI chatbot / assistant
- campus navigation support
- a structured university knowledge base

## Main Information Domains

Based on the research, the AI-enhanced website should help users with:

- admissions and enrollment
- academic policies and procedures
- graduation requirements
- campus services
- administrative office information
- campus facility and navigation questions
- frequently asked questions

## Technical Direction Implied By The Research

The research suggests a system using:

- Natural Language Processing (NLP)
- Natural Language Understanding (NLU)
- Retrieval-Augmented Generation (RAG)
- a centralized institutional information repository
- a chatbot interface that returns context-aware answers

## Practical Product Interpretation

My understanding is that the first version of this project should:

1. visually establish a modern replacement for the current university website experience
2. make common student and visitor tasks easier to start from the homepage
3. provide an AI assistant that answers university-related questions in natural language
4. feel like a real production-oriented platform, even if early AI responses are mocked locally

## Build Goal For This Repo

For this repository, the immediate goal is:

to maintain a section-complete, responsive reconstruction of the current Shu-Te University homepage and add a working AI assistant experience aligned with the research without changing the official homepage flow.

## Homepage Structure Observed From `stu.edu.tw`

From inspecting the live STU homepage source, the current design is organized around:

- a sticky transparent header with the STU logo and anchor-style navigation
- a large full-width visual hero
- a role-based entry section for different visitor groups
- visual campus showcase sections
- an admissions section with image-based entry cards
- a latest news section
- a hot links section for common systems and services

The recreation in this repo now follows the full live section order and current official destinations, while keeping the AI assistant in an independent floating drawer not present on the current homepage.

## Visual Fidelity Direction

The user clarified that the target is not only structural similarity. The implementation should closely follow the visible homepage treatment from the live site and screenshots, including:

- the dark green translucent header overlay
- the large blue-sky hero with centered white headline and outlined button
- the turquoise `分眾入口` band and tall gradient entry cards
- the white `看見樹德` section with dotted divider and serif English subtitle
- the slanted turquoise performance band
- the image-and-text storytelling blocks
- the banner strip, contact section, social row, and footer-like lower layout

The AI feature should remain present, but it should be added in a way that does not disrupt the copied homepage look.

## Supabase Integration Status

Supabase has now been wired into the Vite app using the provided project URL and publishable key. The frontend integration is valid and the query path works at the client level, but the example `todos` query currently depends on a `public.todos` table being present and exposed in the target Supabase project.

Verification against the provided project currently returns:

- `Could not find the table 'public.todos' in the schema cache`

That means the code path is working, but the target project does not currently provide the example table expected by the sample query.

## Implemented Research Modules

The current prototype now implements the main system elements described in the research as a frontend information-support platform:

- AI chatbot assistance
- structured knowledge base coverage
- intelligent information retrieval
- FAQ support
- smart navigation and campus assistance
- user evaluation survey flow

This remains within the research scope because it is still an information and support layer, not an administrative processing or decision-making system.
