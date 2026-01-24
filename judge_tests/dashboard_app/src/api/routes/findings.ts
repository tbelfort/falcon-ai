import { Router } from 'express'
import { getStudyDb } from '../db'

const router = Router()

router.get('/', (req, res) => {
  const db = getStudyDb()
  const { severity, category, search, limit = '100', offset = '0' } = req.query

  let sql = `
    SELECT
      f.*,
      sf2.filename as source_filename,
      COUNT(DISTINCT sf.id) as scout_count,
      COUNT(DISTINCT jc.id) as judge_confirmations,
      SUM(CASE WHEN jc.verdict = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count
    FROM findings f
    LEFT JOIN source_files sf2 ON sf2.id = f.source_file_id
    LEFT JOIN scout_findings sf ON sf.finding_id = f.id
    LEFT JOIN judge_confirmations jc ON jc.scout_finding_id = sf.id
    WHERE 1=1
  `

  const params: unknown[] = []

  if (severity && severity !== 'all') {
    sql += ' AND f.severity = ?'
    params.push(severity)
  }

  if (category && category !== 'all') {
    sql += ' AND f.category = ?'
    params.push(category)
  }

  if (search) {
    sql += ' AND (f.title LIKE ? OR f.description LIKE ?)'
    params.push(`%${search}%`, `%${search}%`)
  }

  sql += ` GROUP BY f.id ORDER BY
    CASE f.severity
      WHEN 'CRITICAL' THEN 1
      WHEN 'HIGH' THEN 2
      WHEN 'MEDIUM' THEN 3
      WHEN 'LOW' THEN 4
      WHEN 'INFO' THEN 5
    END,
    f.id
    LIMIT ? OFFSET ?
  `

  params.push(Number(limit), Number(offset))

  const rows = db.prepare(sql).all(...params)

  const countSql = `
    SELECT COUNT(DISTINCT f.id) as total
    FROM findings f
    WHERE 1=1
    ${severity && severity !== 'all' ? 'AND f.severity = ?' : ''}
    ${category && category !== 'all' ? 'AND f.category = ?' : ''}
    ${search ? 'AND (f.title LIKE ? OR f.description LIKE ?)' : ''}
  `

  const countParams: unknown[] = []
  if (severity && severity !== 'all') countParams.push(severity)
  if (category && category !== 'all') countParams.push(category)
  if (search) countParams.push(`%${search}%`, `%${search}%`)

  const total = (db.prepare(countSql).get(...countParams) as { total: number }).total

  res.json({ data: rows, total })
})

router.get('/:id', (req, res) => {
  const db = getStudyDb()
  const { id } = req.params

  const finding = db.prepare(`
    SELECT f.*, sf.filename as source_filename
    FROM findings f
    LEFT JOIN source_files sf ON sf.id = f.source_file_id
    WHERE f.id = ?
  `).get(id)

  if (!finding) {
    return res.status(404).json({ error: 'Finding not found' })
  }

  const scoutFindings = db.prepare(`
    SELECT
      sf.*,
      a.model,
      a.role,
      ai.pipeline,
      ts.id as series_id,
      tr.run_number
    FROM scout_findings sf
    JOIN agent_instances ai ON ai.id = sf.agent_instance_id
    JOIN agents a ON a.id = ai.agent_id
    JOIN test_runs tr ON tr.id = ai.test_run_id
    JOIN test_series ts ON ts.id = tr.series_id
    WHERE sf.finding_id = ?
    ORDER BY ts.id, tr.run_number
  `).all(id)

  const judgeConfirmations = db.prepare(`
    SELECT
      jc.*,
      a.model,
      a.role,
      ts.id as series_id,
      tr.run_number
    FROM judge_confirmations jc
    JOIN scout_findings sf ON sf.id = jc.scout_finding_id
    JOIN agent_instances ai ON ai.id = jc.agent_instance_id
    JOIN agents a ON a.id = ai.agent_id
    JOIN test_runs tr ON tr.id = ai.test_run_id
    JOIN test_series ts ON ts.id = tr.series_id
    WHERE sf.finding_id = ?
    ORDER BY ts.id, tr.run_number
  `).all(id)

  const highJudgeVerdicts = db.prepare(`
    SELECT
      hjv.*,
      a.model,
      a.role,
      ts.id as series_id,
      tr.run_number
    FROM high_judge_verdicts hjv
    JOIN agent_instances ai ON ai.id = hjv.agent_instance_id
    JOIN agents a ON a.id = ai.agent_id
    JOIN test_runs tr ON tr.id = ai.test_run_id
    JOIN test_series ts ON ts.id = tr.series_id
    WHERE hjv.finding_id = ?
    ORDER BY ts.id, tr.run_number
  `).all(id)

  res.json({
    finding,
    scoutFindings,
    judgeConfirmations,
    highJudgeVerdicts,
  })
})

router.get('/search/:query', (req, res) => {
  const db = getStudyDb()
  const { query } = req.params
  const searchTerm = `%${query}%`

  const rows = db.prepare(`
    SELECT f.*, sf.filename as source_filename
    FROM findings f
    LEFT JOIN source_files sf ON sf.id = f.source_file_id
    WHERE f.title LIKE ? OR f.description LIKE ?
    ORDER BY
      CASE f.severity
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH' THEN 2
        WHEN 'MEDIUM' THEN 3
        WHEN 'LOW' THEN 4
        WHEN 'INFO' THEN 5
      END
    LIMIT 50
  `).all(searchTerm, searchTerm)

  res.json(rows)
})

// Merged findings endpoints
router.get('/merged/all', (_req, res) => {
  const db = getStudyDb()
  const merges = db.prepare(`
    SELECT
      fm.*,
      COUNT(fmm.id) as member_count
    FROM finding_merges fm
    LEFT JOIN finding_merge_members fmm ON fmm.finding_merge_id = fm.id
    GROUP BY fm.id
    ORDER BY
      CASE fm.canonical_severity
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH' THEN 2
        WHEN 'MEDIUM' THEN 3
        WHEN 'LOW' THEN 4
        WHEN 'INFO' THEN 5
      END
  `).all()

  res.json(merges)
})

router.get('/merged/:id', (req, res) => {
  const db = getStudyDb()
  const { id } = req.params

  const merge = db.prepare(`
    SELECT * FROM finding_merges WHERE id = ?
  `).get(id)

  if (!merge) {
    return res.status(404).json({ error: 'Merged finding not found' })
  }

  // Get all member findings with their details
  const members = db.prepare(`
    SELECT
      f.*,
      sf.filename as source_filename,
      fmm.id as member_id
    FROM finding_merge_members fmm
    JOIN findings f ON f.id = fmm.finding_id
    LEFT JOIN source_files sf ON sf.id = f.source_file_id
    WHERE fmm.finding_merge_id = ?
    ORDER BY f.id
  `).all(id)

  // Get high judge verdicts for findings in this merge (via finding_merge_members)
  const highJudgeVerdicts = db.prepare(`
    SELECT DISTINCT
      hjv.*,
      a.model,
      a.role,
      ts.id as series_id,
      tr.run_number,
      f.title as finding_title
    FROM high_judge_verdicts hjv
    JOIN agent_instances ai ON ai.id = hjv.agent_instance_id
    JOIN agents a ON a.id = ai.agent_id
    JOIN test_runs tr ON tr.id = ai.test_run_id
    JOIN test_series ts ON ts.id = tr.series_id
    JOIN findings f ON f.id = hjv.finding_id
    JOIN finding_merge_members fmm ON fmm.finding_id = f.id
    WHERE fmm.finding_merge_id = ?
    ORDER BY ts.id, tr.run_number
  `).all(id)

  res.json({
    merge,
    members,
    highJudgeVerdicts,
  })
})

export default router
