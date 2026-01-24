# Dashboard Testing Guide

## Prerequisites

- Node.js installed
- Terminal access
- The dashboard app at `judge_tests/dashboard_app/`

## Quick Start

```bash
cd judge_tests/dashboard_app
npm install
npm start
```

This starts both:
- API server at http://localhost:3001
- Frontend at http://localhost:5173

## Testing the Multi-Study Architecture

### 1. Test Studies API

**List all studies:**
```bash
curl http://localhost:3001/api/studies
```

Expected: JSON array with at least one study:
```json
[{"id":1,"name":"Falcon Security Review 2026-01","slug":"falcon-security-review-2026-01","description":"Multi-agent PR review test comparing model configurations","is_active":1,"created_at":"2026-01-21 18:33:32"}]
```

**Get current active study:**
```bash
curl http://localhost:3001/api/studies/current
```

Expected: Single study object with `is_active: 1`

**Switch study (when multiple exist):**
```bash
curl -X POST http://localhost:3001/api/studies/select/1
```

Expected: `{"success":true,"studyId":1}`

### 2. Test Existing Endpoints Still Work

**Stats overview:**
```bash
curl http://localhost:3001/api/stats/overview
```

Expected: JSON with `totalSeries`, `totalRuns`, `totalFindings`, etc.

**Series list:**
```bash
curl http://localhost:3001/api/series
```

Expected: Array of test series with run counts and finding counts

**Findings list:**
```bash
curl http://localhost:3001/api/findings
```

Expected: `{"data":[...],"total":N}` with finding objects

**Agents:**
```bash
curl http://localhost:3001/api/agents
```

Expected: Array of agent performance data

**Pipeline flow:**
```bash
curl http://localhost:3001/api/pipeline/flow
```

Expected: Summary counts and flow data for visualization

### 3. Test Frontend

1. Open http://localhost:5173 in browser
2. Verify the header shows:
   - "Study Dashboard" title
   - Study selector dropdown (next to title)
   - Filter dropdowns (Category, Model, Severity, Verdict)
3. The study dropdown should show "Falcon Security Review 2026-01"
4. All dashboard pages should load data correctly

### 4. Test Study Switching (Manual)

To test study switching, first add a second study to the database:

```bash
# Add a test study (pointing to same db for testing)
sqlite3 data/main.db "INSERT INTO studies (name, slug, db_path, description) VALUES ('Test Study', 'test-study', '../../studies/falcon-security-review-2026-01/study.db', 'Test study for switching');"
```

Then in the browser:
1. Refresh the page
2. Study dropdown should now show both studies
3. Select "Test Study"
4. Page should reload with the new study active
5. Verify data loads correctly

To clean up:
```bash
sqlite3 data/main.db "DELETE FROM studies WHERE slug = 'test-study';"
```

## Database Locations

| Database | Path | Purpose |
|----------|------|---------|
| Main DB | `dashboard_app/data/main.db` | Studies registry |
| Study DB | `studies/falcon-security-review-2026-01/study.db` | Actual study data |

## Inspecting Databases

**View studies table:**
```bash
sqlite3 data/main.db "SELECT * FROM studies;"
```

**View study data tables:**
```bash
sqlite3 ../studies/falcon-security-review-2026-01/study.db ".tables"
```

## Troubleshooting

### Port 3001 already in use
```bash
lsof -ti:3001 | xargs kill -9
npm start
```

### API returns "No active study configured"
```bash
sqlite3 data/main.db "UPDATE studies SET is_active = 1 WHERE id = 1;"
```

### Study database not found
Check the `db_path` in the studies table is correct relative to `dashboard_app/data/`:
```bash
sqlite3 data/main.db "SELECT db_path FROM studies WHERE is_active = 1;"
```

The path should resolve to an existing `.db` file.

## API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/studies` | List all studies |
| GET | `/api/studies/current` | Get active study |
| POST | `/api/studies/select/:id` | Switch to study by ID |
| GET | `/api/stats/overview` | Dashboard statistics |
| GET | `/api/stats/severity-distribution` | Findings by severity |
| GET | `/api/stats/verdict-distribution` | Judge verdicts breakdown |
| GET | `/api/series` | List test series |
| GET | `/api/series/:id` | Get series details |
| GET | `/api/findings` | List findings (paginated) |
| GET | `/api/findings/:id` | Get finding details |
| GET | `/api/agents` | Agent performance summary |
| GET | `/api/pipeline/flow` | Pipeline flow data |
| GET | `/api/pipeline/funnel` | Funnel stage counts |
| GET | `/api/health` | Health check |
