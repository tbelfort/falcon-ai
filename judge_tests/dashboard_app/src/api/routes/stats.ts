import { Router } from 'express'
import { getStudyDb } from '../db'

const router = Router()

router.get('/overview', (_req, res) => {
  const db = getStudyDb()
  const stats = {
    totalSeries: db.prepare('SELECT COUNT(*) as count FROM test_series').get() as { count: number },
    totalRuns: db.prepare('SELECT COUNT(*) as count FROM test_runs').get() as { count: number },
    totalFindings: db.prepare('SELECT COUNT(*) as count FROM findings').get() as { count: number },
    totalScoutFindings: db.prepare('SELECT COUNT(*) as count FROM scout_findings').get() as { count: number },
    totalJudgeConfirmations: db.prepare('SELECT COUNT(*) as count FROM judge_confirmations').get() as { count: number },
    totalHighJudgeVerdicts: db.prepare('SELECT COUNT(*) as count FROM high_judge_verdicts').get() as { count: number },
    confirmedCount: db.prepare("SELECT COUNT(*) as count FROM judge_confirmations WHERE verdict = 'confirmed'").get() as { count: number },
    criticalCount: db.prepare("SELECT COUNT(*) as count FROM findings WHERE severity = 'CRITICAL'").get() as { count: number },
    highCount: db.prepare("SELECT COUNT(*) as count FROM findings WHERE severity = 'HIGH'").get() as { count: number },
    mediumCount: db.prepare("SELECT COUNT(*) as count FROM findings WHERE severity = 'MEDIUM'").get() as { count: number },
    lowCount: db.prepare("SELECT COUNT(*) as count FROM findings WHERE severity = 'LOW'").get() as { count: number },
  }

  res.json({
    totalSeries: stats.totalSeries.count,
    totalRuns: stats.totalRuns.count,
    totalFindings: stats.totalFindings.count,
    totalScoutFindings: stats.totalScoutFindings.count,
    totalJudgeConfirmations: stats.totalJudgeConfirmations.count,
    totalHighJudgeVerdicts: stats.totalHighJudgeVerdicts.count,
    confirmationRate: stats.totalJudgeConfirmations.count > 0
      ? (stats.confirmedCount.count / stats.totalJudgeConfirmations.count * 100).toFixed(1)
      : 0,
    criticalCount: stats.criticalCount.count,
    highCount: stats.highCount.count,
    mediumCount: stats.mediumCount.count,
    lowCount: stats.lowCount.count,
  })
})

router.get('/severity-distribution', (_req, res) => {
  const db = getStudyDb()
  const rows = db.prepare(`
    SELECT severity, COUNT(*) as count
    FROM findings
    WHERE severity IS NOT NULL
    GROUP BY severity
    ORDER BY
      CASE severity
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH' THEN 2
        WHEN 'MEDIUM' THEN 3
        WHEN 'LOW' THEN 4
        WHEN 'INFO' THEN 5
      END
  `).all()

  res.json(rows)
})

router.get('/verdict-distribution', (_req, res) => {
  const db = getStudyDb()
  const rows = db.prepare(`
    SELECT verdict, COUNT(*) as count
    FROM judge_confirmations
    GROUP BY verdict
    ORDER BY count DESC
  `).all()

  res.json(rows)
})

router.get('/category-distribution', (_req, res) => {
  const db = getStudyDb()
  const rows = db.prepare(`
    SELECT ts.category, COUNT(DISTINCT f.id) as count
    FROM test_series ts
    JOIN test_runs tr ON tr.series_id = ts.id
    JOIN agent_instances ai ON ai.test_run_id = tr.id
    JOIN scout_findings sf ON sf.agent_instance_id = ai.id
    JOIN findings f ON f.id = sf.finding_id
    GROUP BY ts.category
    ORDER BY count DESC
  `).all()

  res.json(rows)
})

router.get('/timeline', (_req, res) => {
  const db = getStudyDb()
  const rows = db.prepare(`
    SELECT
      ts.id || '-' || COALESCE(tr.run_number, 1) as run,
      COUNT(DISTINCT sf.finding_id) as findings,
      SUM(CASE WHEN jc.verdict = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
      SUM(CASE WHEN jc.verdict = 'rejected' THEN 1 ELSE 0 END) as rejected
    FROM test_series ts
    JOIN test_runs tr ON tr.series_id = ts.id
    JOIN agent_instances ai ON ai.test_run_id = tr.id
    LEFT JOIN scout_findings sf ON sf.agent_instance_id = ai.id
    LEFT JOIN judge_confirmations jc ON jc.scout_finding_id = sf.id
    GROUP BY ts.id, tr.run_number
    ORDER BY ts.id, tr.run_number
  `).all()

  res.json(rows)
})

export default router
