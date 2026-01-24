import { Router } from 'express'
import { getStudyDb } from '../db'

const router = Router()

router.get('/flow', (_req, res) => {
  const db = getStudyDb()
  // Get counts for each stage
  const sourceFiles = (db.prepare('SELECT COUNT(*) as count FROM source_files').get() as { count: number }).count
  const scoutInstances = (db.prepare(`
    SELECT COUNT(*) as count FROM agent_instances ai
    JOIN agents a ON a.id = ai.agent_id
    WHERE a.role = 'scout'
  `).get() as { count: number }).count
  const scoutFindings = (db.prepare('SELECT COUNT(*) as count FROM scout_findings').get() as { count: number }).count
  const judgeConfirmations = (db.prepare('SELECT COUNT(*) as count FROM judge_confirmations').get() as { count: number }).count
  const highJudgeVerdicts = (db.prepare('SELECT COUNT(*) as count FROM high_judge_verdicts').get() as { count: number }).count

  // Get verdict breakdowns
  const judgeVerdicts = db.prepare(`
    SELECT verdict, COUNT(*) as count FROM judge_confirmations GROUP BY verdict
  `).all() as { verdict: string; count: number }[]

  const highJudgeVerdictsBreakdown = db.prepare(`
    SELECT verdict, COUNT(*) as count FROM high_judge_verdicts GROUP BY verdict
  `).all() as { verdict: string; count: number }[]

  // Build Sankey flow data
  const flows = [
    { source: 'Source Files', target: 'Scouts', value: sourceFiles * 100 }, // Amplify for visualization
    { source: 'Scouts', target: 'Scout Findings', value: scoutFindings },
    ...judgeVerdicts.map((v) => ({
      source: 'Scout Findings',
      target: `Judge: ${v.verdict}`,
      value: v.count,
    })),
    ...highJudgeVerdictsBreakdown.map((v) => ({
      source: `Judge: confirmed`,
      target: `High Judge: ${v.verdict}`,
      value: v.count,
    })),
  ]

  res.json({
    summary: {
      sourceFiles,
      scoutInstances,
      scoutFindings,
      judgeConfirmations,
      highJudgeVerdicts,
    },
    flows,
    judgeVerdicts,
    highJudgeVerdicts: highJudgeVerdictsBreakdown,
  })
})

router.get('/funnel', (_req, res) => {
  const db = getStudyDb()
  const stages = [
    {
      name: 'Scout Findings',
      count: (db.prepare('SELECT COUNT(*) as count FROM scout_findings').get() as { count: number }).count,
    },
    {
      name: 'Judge Reviewed',
      count: (db.prepare('SELECT COUNT(*) as count FROM judge_confirmations').get() as { count: number }).count,
    },
    {
      name: 'Judge Confirmed',
      count: (db.prepare("SELECT COUNT(*) as count FROM judge_confirmations WHERE verdict = 'confirmed'").get() as { count: number }).count,
    },
    {
      name: 'High Judge Reviewed',
      count: (db.prepare('SELECT COUNT(*) as count FROM high_judge_verdicts').get() as { count: number }).count,
    },
    {
      name: 'High Judge Accepted',
      count: (db.prepare("SELECT COUNT(*) as count FROM high_judge_verdicts WHERE verdict = 'accepted'").get() as { count: number }).count,
    },
  ]

  res.json(stages)
})

export default router
