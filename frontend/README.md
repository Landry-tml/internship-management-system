# Internship Management System

IMS provides separate workspaces for interns, supervisors, and administrators.

## Run locally

1. Configure the backend environment with MySQL connection settings, a `JWT_SECRET` of at least 32 characters, and `GEMINI_API_KEY` for AI review and evaluation.
2. Start the backend from `backend` with `npm run dev`. It listens on port `5050` by default and runs safe, idempotent database migrations at startup.
3. Start the frontend from `frontend` with `npm run dev`.

## Workflows

- Interns apply with a motivation letter, CV, recommendation letter, and internship dates; submit daily, weekly, and final reports; and complete assigned tasks and evaluations.
- Supervisors review assigned applications, assign individual or department tasks, review reports, and create AI-generated intern assessments.
- Administrators manage users, departments and supervisors, internship opportunities, applications awaiting review, and organization-wide reports and task boards.

Uploads accept PDF, DOCX, and TXT documents up to 5 MiB. AI review uses report text and, for final reports, the text of the uploaded school template. Evaluation generation uses the text from the uploaded course notes or task description; paste that text in the provided field when submitting PDF or DOCX files.
