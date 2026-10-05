# Backend setup

1. Copy `.env.example` to `.env` and set the MySQL connection values and a long, random `JWT_SECRET`.
2. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey). Do not commit or paste the key into source code or chat.
3. To save the key without echoing it in the terminal, run this from PowerShell:

   ```powershell
   .\scripts\set-gemini-key.ps1
   ```

   The script writes `GEMINI_API_KEY` into this directory's `.env` file. `.env` is ignored by Git.
4. Start or restart the backend with `npm start`. The default AI model is `gemini-2.5-flash`; set `GEMINI_MODEL` in `.env` to override it.

The database schema creates empty application tables. It does not create demo users, internships, placements, reports, or evaluations. Existing database records are not automatically deleted.
