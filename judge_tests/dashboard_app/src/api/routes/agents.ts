import { Router } from 'express'
import { getStudyDb } from '../db'

const router = Router()

router.get('/', (_req, res) => {
  const db = getStudyDb()
  const rows = db.prepare(`
    SELECT
      a.model,
      a.role,
      COUNT(DISTINCT ai.id) as instances,
      COUNT(DISTINCT CASE WHEN a.role = 'scout' THEN sf.finding_id END) as findings,
      COUNT(DISTINCT CASE WHEN a.role = 'judge' AND jc.verdict = 'confirmed' THEN jc.id END) as confirmed,
      COUNT(DISTINCT CASE WHEN a.role = 'judge' AND jc.verdict = 'rejected' THEN jc.id END) as rejected
    FROM agents a
    JOIN agent_instances ai ON ai.agent_id = a.id
    LEFT JOIN scout_findings sf ON sf.agent_instance_id = ai.id AND a.role = 'scout'
    LEFT JOIN judge_confirmations jc ON jc.agent_instance_id = ai.id AND a.role = 'judge'
    GROUP BY a.model, a.role
    ORDER BY a.role, a.model
  `).all()

  res.json(rows)
})

router.get('/performance', (_req, res) => {
  const db = getStudyDb()
  const models = db.prepare(`
    SELECT DISTINCT model FROM agents ORDER BY model
  `).all() as { model: string }[]

  const performance = models.map((m) => {
    const scoutStats = db.prepare(`
      SELECT
        COUNT(DISTINCT sf.finding_id) as total_findings,
        COUNT(DISTINCT CASE WHEN jc.verdict = 'confirmed' THEN sf.finding_id END) as confirmed_findings,
        COUNT(DISTINCT CASE WHEN jc.verdict = 'rejected' THEN sf.finding_id END) as rejected_findings
      FROM agents a
      JOIN agent_instances ai ON ai.agent_id = a.id
      JOIN scout_findings sf ON sf.agent_instance_id = ai.id
      LEFT JOIN judge_confirmations jc ON jc.scout_finding_id = sf.id
      WHERE a.model = ? AND a.role = 'scout'
    `).get(m.model) as {
      total_findings: number
      confirmed_findings: number
      rejected_findings: number
    }

    const judgeStats = db.prepare(`
      SELECT
        COUNT(*) as total_verdicts,
        SUM(CASE WHEN verdict = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN verdict = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN verdict = 'modified' THEN 1 ELSE 0 END) as modified
      FROM judge_confirmations jc
      JOIN agent_instances ai ON ai.id = jc.agent_instance_id
      JOIN agents a ON a.id = ai.agent_id
      WHERE a.model = ? AND a.role = 'judge'
    `).get(m.model) as {
      total_verdicts: number
      confirmed: number
      rejected: number
      modified: number
    }

    return {
      model: m.model,
      scout: scoutStats,
      judge: judgeStats,
    }
  })

  res.json(performance)
})

router.get('/:model/:role', (req, res) => {
  const db = getStudyDb()
  const { model, role } = req.params

  const agent = db.prepare(`
    SELECT * FROM agents WHERE model = ? AND role = ?
  `).get(model, role)

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' })
  }

  const instances = db.prepare(`
    SELECT
      ai.*,
      ts.id as series_id,
      ts.category,
      tr.run_number,
      COUNT(DISTINCT sf.id) as finding_count
    FROM agent_instances ai
    JOIN test_runs tr ON tr.id = ai.test_run_id
    JOIN test_series ts ON ts.id = tr.series_id
    LEFT JOIN scout_findings sf ON sf.agent_instance_id = ai.id
    WHERE ai.agent_id = (SELECT id FROM agents WHERE model = ? AND role = ?)
    GROUP BY ai.id
    ORDER BY ts.id, tr.run_number
  `).all(model, role)

  res.json({ agent, instances })
})

export default router
