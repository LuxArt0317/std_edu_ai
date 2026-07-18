# Nexus action tools

Nexus is a confirmation-gated agent over the same production repositories and Supabase row-level-security policies used by the visible portal. It receives bounded live record IDs, proposes one mutation at a time, waits for the signed-in person to confirm it, executes as that person, reloads real data, and then reassesses the original goal.

## Executable tools

Academic Office tools cover department, program, term, subject, section, enrollment, and complete curriculum creation, plus updates to the corresponding academic records. A newly created department is returned to the goal loop so a dependent curriculum can continue without asking the operator to leave Nexus.

Teaching and LMS tools cover module, rich material, multi-page material, assessment, announcement, attendance-session, and schedule-event creation; applicable update and delete operations; and student-owned learning-progress updates. Repository constraints remain authoritative, including the prohibition on deleting an assessment with attempts.

School-service tools cover portal communication requests, student support cases, student attendance-correction requests, authorized attendance decisions, institutional initiative proposals, and governed initiative approval, assignment, completion, rejection, and escalation.

Every tool is filtered twice: the API uses the trusted Supabase role, and the client repeats the role check before execution. Supabase RLS or controlled RPC authorization is the final enforcement boundary. Successful mutations are written to the AI audit log and returned to the bounded goal loop as observations.

## Deliberate safety boundaries

Nexus does not receive credential, owner-replacement, direct role-change, final-grade-publication, binary-upload, or student assessed-work tools. Those operations require dedicated screens, additional review evidence, or direct human interaction. A student can ask for explanations, navigate, request support, request an attendance correction, and mark their own learning progress, but Nexus cannot answer, complete, alter, grade, or submit their assessed work.

When a requested operation is outside the safe tool catalog, Nexus must explain the boundary and can navigate the user to the authorized workflow. It must never claim that an unavailable action occurred.

## Goal execution contract

1. Nexus resolves exact IDs from the privacy-minimized current platform context and infers harmless defaults before asking the operator.
2. It proposes one reviewable mutation and shows its effect.
3. The user confirms or cancels.
4. The repository executes under the current Supabase session.
5. Nexus reloads the platform, records the real outcome and any returned ID, and continues automatically while its explicit remaining-work plan is non-empty.
6. If a material decision cannot be inferred, Nexus pauses with one clarification card and two to four choices. The answer is recorded as an observation and the same run resumes.
7. Repeated actions, the thirty-minute runtime limit, the 32-action safety limit, missing authority, and repository errors stop the run as impossible instead of looping or fabricating success.

The goal card is compact by default and shows completed and remaining work plus the current thinking, execution, refresh, confirmation, clarification, or terminal phase. Its Details control reveals the full plan and action evidence. Closing the Nexus drawer only hides it: the mounted portal retains the active request, and the floating Nexus control displays its background state. Reopening restores the last-used valid thread at its newest message; new content follows automatically only while the reader remains near the bottom.
