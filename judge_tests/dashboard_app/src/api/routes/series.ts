import { Router } from 'express'
import { getStudyDb } from '../db'

const router = Router()

router.get('/', (_req, res) => {
  const db = getStudyDb()
  const rows = db.prepare(`
    SELECT
      ts.*,
      COUNT(DISTINCT tr.id) as run_count,
      COUNT(DISTINCT f.id) as finding_count,
      ROUND(
        CAST(SUM(CASE WHEN jc.verdict = 'confirmed' THEN 1 ELSE 0 END) AS FLOAT) /
        NULLIF(COUNT(jc.id), 0) * 100,
        1
      ) as confirmation_rate
    FROM test_series ts
    LEFT JOIN test_runs tr ON tr.series_id = ts.id
    LEFT JOIN agent_instances ai ON ai.test_run_id = tr.id
    LEFT JOIN scout_findings sf ON sf.agent_instance_id = ai.id
    LEFT JOIN findings f ON f.id = sf.finding_id
    LEFT JOIN judge_confirmations jc ON jc.scout_finding_id = sf.id
    GROUP BY ts.id
    ORDER BY ts.id
  `).all()

  res.json(rows)
})

router.get('/:id', (req, res) => {
  const db = getStudyDb()
  const { id } = req.params
  const series = db.prepare('SELECT * FROM test_series WHERE id = ?').get(id)

  if (!series) {
    return res.status(404).json({ error: 'Series not found' })
  }

  const runs = db.prepare(`
    SELECT tr.*,
      COUNT(DISTINCT ai.id) as agent_count,
      COUNT(DISTINCT sf.finding_id) as finding_count
    FROM test_runs tr
    LEFT JOIN agent_instances ai ON ai.test_run_id = tr.id
    LEFT JOIN scout_findings sf ON sf.agent_instance_id = ai.id
    WHERE tr.series_id = ?
    GROUP BY tr.id
    ORDER BY tr.run_number
  `).all(id)

  res.json({ series, runs })
})

router.get('/:id/runs', (req, res) => {
  const db = getStudyDb()
  const { id } = req.params
  const rows = db.prepare(`
    SELECT tr.*,
      COUNT(DISTINCT ai.id) as agent_count,
      COUNT(DISTINCT sf.finding_id) as finding_count,
      ROUND(
        CAST(SUM(CASE WHEN jc.verdict = 'confirmed' THEN 1 ELSE 0 END) AS FLOAT) /
        NULLIF(COUNT(jc.id), 0) * 100,
        1
      ) as confirmation_rate
    FROM test_runs tr
    LEFT JOIN agent_instances ai ON ai.test_run_id = tr.id
    LEFT JOIN scout_findings sf ON sf.agent_instance_id = ai.id
    LEFT JOIN judge_confirmations jc ON jc.scout_finding_id = sf.id
    WHERE tr.series_id = ?
    GROUP BY tr.id
    ORDER BY tr.run_number
  `).all(id)

  res.json(rows)
})

export default router
