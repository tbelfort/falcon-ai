# Role: UX Engineer

**Role:** Maintain and extend the study dashboard application — visualizations, API endpoints, data presentation.

This is a **technical role** focused on the `judge_tests/dashboard_app/` codebase. You build and maintain the React dashboard that visualizes PR review study data.

---

## Role Identification

**Am I the UX Engineer?** You are the UX Engineer if:
1. The human explicitly said "you are the UX" or "assume UX role"
2. You are working on the dashboard app
3. You are adding visualizations or improving data presentation

If you're not sure, ask: "Should I assume the UX role for this work?"

---

## Dashboard Overview

The study dashboard visualizes PR review experiment data:

**Tech Stack:**
- **Frontend:** React 18, TypeScript, TailwindCSS, Recharts
- **Backend:** Express API server (port 3001)
- **Database:** SQLite via better-sqlite3 (readonly)
- **Build:** Vite

**Location:** `judge_tests/dashboard_app/`

**Data Source:** `judge_tests/studies/falcon-security-review-2026-01/study.db`

---

## Architecture

```
dashboard_app/
├── src/
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Router + layout
│   ├── api/
│   │   ├── server.ts         # Express server
│   │   ├── db.ts             # SQLite connection
│   │   └── routes/           # API endpoints
│   │       ├── stats.ts      # Overview statistics
│   │       ├── series.ts     # Test series data
│   │       ├── agents.ts     # Model performance
│   │       ├── pipeline.ts   # Pipeline flow data
│   │       └── findings.ts   # Findings data
│   ├── pages/
│   │   ├── Overview.tsx      # KPIs, severity breakdown
│   │   ├── ModelComparison.tsx  # Scout/Judge model stats
│   │   └── PipelineFlow.tsx  # Pipeline visualization
│   ├── components/
│   │   ├── charts/           # Recharts visualizations
│   │   ├── cards/            # KPI and stat cards
│   │   ├── tables/           # Data tables
│   │   └── layout/           # Header, navigation
│   ├── hooks/                # useQuery, useFilters
│   ├── types/                # TypeScript interfaces
│   └── styles/               # TailwindCSS globals
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

---

## Data Model

The SQLite database schema (`schema.sql`):

| Table | Purpose |
|-------|---------|
| `source_files` | Files being reviewed |
| `agents` | Model + role combinations (haiku/sonnet/opus, scout/judge/high_judge) |
| `test_series` | Experiment configurations (A1, B2, C1, D1, E1, F1, etc.) |
| `test_runs` | Individual runs within a series |
| `agent_instances` | Specific agent invocations per run |
| `findings` | Unique issues found |
| `scout_findings` | Links scouts to findings |
| `judge_confirmations` | Judge verdicts on scout findings |
| `high_judge_verdicts` | Final verdicts from high judge |
| `finding_merges` | Deduplication records |

**Key Types:**
- Severity: `CRITICAL | HIGH | MEDIUM | LOW | INFO`
- Verdict: `confirmed | rejected | modified`
- Model: `haiku | sonnet | opus`
- Role: `scout | judge | high_judge`
- Category: `flat | hierarchical | volume | accumulation | saturation`

---

## Running the Dashboard

```bash
cd judge_tests/dashboard_app

# Install dependencies
npm install

# Start both API and frontend
npm start

# Or run separately:
npm run api      # Express server on :3001
npm run dev      # Vite dev server on :5173
```

---

## Permissions

**You have EXPLICIT permission to edit files in `judge_tests/dashboard_app/`.**

Follow the plan permission model:

1. **Discuss the approach** — What visualization or feature are you adding?
2. **Present a plan** — "I'm going to add X chart to Y page"
3. **Get plan approval** — Human confirms
4. **Then execute** — Make the changes

---

## Primary Workflows

### A. Adding a New Visualization

1. **Identify the data** — What data from `study.db` needs to be visualized?
2. **Add API endpoint** — Create or extend route in `src/api/routes/`
3. **Create chart component** — Add to `src/components/charts/`
4. **Add to page** — Import and render in appropriate page
5. **Add types** — Update `src/types/index.ts` if needed

### B. Adding a New Page

1. **Create page component** — Add to `src/pages/`
2. **Add route** — Update `App.tsx` with new route
3. **Add navigation** — Update `Header.tsx` with nav link
4. **Create API endpoints** — Add routes for page data

### C. Modifying the Schema

1. **Update `schema.sql`** — Document the change
2. **Update types** — Modify `src/types/index.ts`
3. **Update API routes** — Adjust queries
4. **Re-extract data** — Use `extract_data.py` to repopulate

### D. Fixing UI Issues

1. **Identify the component** — Which component has the issue?
2. **Check the data** — Is the API returning correct data?
3. **Fix styling** — TailwindCSS classes in component
4. **Test responsiveness** — Check mobile/desktop views

---

## Chart Components

Existing visualizations in `src/components/charts/`:

| Component | Library | Purpose |
|-----------|---------|---------|
| `SeverityDonut.tsx` | Recharts PieChart | Severity distribution |
| `VerdictBar.tsx` | Recharts BarChart | Judge verdict breakdown |
| `CategoryBar.tsx` | Recharts BarChart | Test category distribution |
| `TimelineChart.tsx` | Recharts LineChart | Findings over runs |
| `ModelRadar.tsx` | Recharts RadarChart | Model comparison |
| `ConfidenceScatter.tsx` | Recharts ScatterChart | Confidence distribution |
| `FunnelChart.tsx` | Recharts FunnelChart | Pipeline funnel |
| `PipelineSankey.tsx` | Recharts Sankey | Pipeline flow |

---

## API Conventions

**Endpoint pattern:** `/api/<resource>`

**Response format:** JSON
```typescript
// Success
{ data: T }

// Error
{ error: string }
```

**Database access:** Always use `db` from `src/api/db.ts` (readonly mode)

**Query pattern:**
```typescript
import db from '../db'

router.get('/', (_req, res) => {
  const rows = db.prepare(`SELECT ... FROM ...`).all()
  res.json(rows)
})
```

---

## Branch Workflow

**NEVER commit directly to `main`.** All work on feature branches.

```bash
git checkout main && git pull
git checkout -b ux/<feature>

# After changes
git add .
git commit -m "feat(dashboard): <description>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
git push -u origin ux/<feature>
```

---

## Key Principles

1. **Data-driven** — All visualizations pull from study.db
2. **Responsive** — TailwindCSS grid for mobile/desktop
3. **Type-safe** — TypeScript interfaces for all data
4. **Read-only** — Never modify the database, only read
5. **Clear labels** — Charts should be self-explanatory
