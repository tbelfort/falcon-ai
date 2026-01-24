import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Main database (always connected)
const mainDbPath = path.resolve(__dirname, '../../data/main.db')
export const mainDb = new Database(mainDbPath)

// Study database (dynamically connected)
let studyDb: Database.Database | null = null
let currentStudyId: number | null = null

export function getStudyDb(): Database.Database {
  if (!studyDb) {
    // Load active study on first access
    const active = mainDb.prepare(
      'SELECT * FROM studies WHERE is_active = 1 LIMIT 1'
    ).get() as { id: number; db_path: string } | undefined

    if (!active) {
      throw new Error('No active study configured')
    }

    const studyPath = path.resolve(__dirname, '../../data', active.db_path)
    studyDb = new Database(studyPath, { readonly: true })
    currentStudyId = active.id
  }
  return studyDb
}

export function switchStudy(studyId: number): void {
  const study = mainDb.prepare(
    'SELECT * FROM studies WHERE id = ?'
  ).get(studyId) as { id: number; db_path: string } | undefined

  if (!study) {
    throw new Error(`Study not found: ${studyId}`)
  }

  // Close existing connection
  if (studyDb) {
    studyDb.close()
  }

  // Update active flag
  mainDb.prepare('UPDATE studies SET is_active = 0').run()
  mainDb.prepare('UPDATE studies SET is_active = 1 WHERE id = ?').run(studyId)

  // Open new connection
  const studyPath = path.resolve(__dirname, '../../data', study.db_path)
  studyDb = new Database(studyPath, { readonly: true })
  currentStudyId = studyId
}

export function getCurrentStudyId(): number | null {
  return currentStudyId
}

// Default export for backward compatibility
export default { get: () => getStudyDb() }
