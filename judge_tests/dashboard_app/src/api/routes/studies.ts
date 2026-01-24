import { Router } from 'express'
import { mainDb, switchStudy } from '../db'

const router = Router()

// List all studies
router.get('/', (_req, res) => {
  const studies = mainDb.prepare(`
    SELECT id, name, slug, description, is_active, created_at
    FROM studies
    ORDER BY created_at DESC
  `).all()
  res.json(studies)
})

// Get current active study
router.get('/current', (_req, res) => {
  const study = mainDb.prepare(`
    SELECT id, name, slug, description, is_active, created_at
    FROM studies WHERE is_active = 1 LIMIT 1
  `).get()
  res.json(study || null)
})

// Switch to a different study
router.post('/select/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid study ID' })
    }
    switchStudy(id)
    res.json({ success: true, studyId: id })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

export default router
