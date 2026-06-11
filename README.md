# Español — personal Spanish trainer

A single-user web app for drilling Spanish vocabulary and verb conjugation. Mobile-friendly,
password-gated, progress synced to a database. Built with Next.js (App Router) + TypeScript +
Tailwind. All conjugation logic runs in-app from a rules engine (no external API at runtime).

## Modes
- **Learn** — tracks everything. Each round serves the **top 10** words by frequency in a category
  that you haven't mastered for that exercise.
- **Free Play** — pick your own words, no tracking.
- **Review** — endless random draw of mastered words; no mid-round stats.

## Exercises
1. **Verb Conjugation** — type every person across your selected tenses. One attempt per card,
   correct only if every box is right.
2. **Fill in the Word** — English word + English sentence → type the full Spanish word (with article).
3. **Fill in the Sentence** — complete a Spanish sentence with the missing word.
4. **Word Bank** — write a paragraph using a set of words; copy an LLM grading prompt, paste the
   JSON reply back to be scored.
5. **Spelling** — English meaning → type the Spanish word (accents count).
6. **Flashcards** — flip to reveal, no scoring.

## Mastery rule ("10 / 80% / 3")
A word is flagged **review** once it reaches **≥10 attempts and ≥80% accuracy in at least 3
different counting exercises** (everything except Flashcards). Review words leave the Learn rotation
and only appear in Review mode. Tenses are configurable; Word Bank shares the conjugation tenses.

## Local development
```bash
npm install
cp .env.example .env.local   # set APP_USERNAME / APP_PASSWORD / AUTH_SECRET
npm run dev                  # http://localhost:3000
```
Without `DATABASE_URL`, progress is saved to a local JSON file in `./.data` (fine for one machine).

## Environment variables
| var | required | purpose |
| --- | --- | --- |
| `APP_USERNAME` / `APP_PASSWORD` | yes | login credentials (single user) |
| `AUTH_SECRET` | yes | signs the session cookie (`openssl rand -base64 32`) |
| `DATABASE_URL` | for hosting | Postgres connection string; enables cross-device sync |

## Deploy
### Render (recommended — includes the database)
Push to GitHub, then in Render: **New → Blueprint** and select this repo. `render.yaml` provisions a
web service + free Postgres and wires `DATABASE_URL`/`AUTH_SECRET` automatically. Set `APP_USERNAME`
and `APP_PASSWORD` in the dashboard. The app creates its table on first run.

### Vercel + Neon
Import the repo into Vercel (zero config). Create a Neon Postgres DB and add `DATABASE_URL`,
`APP_USERNAME`, `APP_PASSWORD`, `AUTH_SECRET` as environment variables.

## Data
`words.txt` is the source of truth. Generated artifacts live in `data/`:
```bash
npm run data:parse              # words.txt -> data/words.json
npm run data:conjugations       # -> data/conjugations.json (+ .txt audit dump)
npm run data:sentences:split    # words.json -> data/_chunks/* (then generate parts)
npm run data:sentences:merge    # data/_sentences/* -> data/sentences.json
```
Conjugations are produced by `lib/conjugation/` (engine + irregular overrides) and verified by
`npm test`.

## Tests
```bash
npm test   # conjugation engine + progress rules
```
