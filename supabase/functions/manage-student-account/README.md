# Manage student account

This Edge Function creates or updates a confirmed student Auth identity and its linked profile/SIS student record through one protected operator workflow.

- Only a fresh authenticated `owner`, `admin`, or `registrar` session is accepted.
- The account is always assigned the canonical `student` role; owner creation is impossible.
- Email, student number, names, program, year level, optional phone, and optional advisor are validated.
- A student number already linked to another identity and an email belonging to a non-student account are rejected.
- Temporary passwords are accepted only in the HTTPS request body and are never logged, returned, or stored in application tables.
- If a newly created Auth identity cannot be linked to the academic record, the function deletes that new identity as compensation.
