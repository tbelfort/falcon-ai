import { useEffect, useState } from 'react'
import { FilterState, Category, Model, Severity, Verdict } from '../../types'

interface Study {
  id: number
  name: string
  slug: string
  description: string | null
  is_active: number
  created_at: string
}

interface HeaderProps {
  onToggleSidebar: () => void
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
}

export default function Header({ onToggleSidebar, filters, onFiltersChange }: HeaderProps) {
  const [studies, setStudies] = useState<Study[]>([])
  const [currentStudy, setCurrentStudy] = useState<Study | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const categories: (Category | 'all')[] = ['all', 'flat', 'hierarchical', 'volume', 'accumulation', 'saturation']
  const models: (Model | 'all')[] = ['all', 'haiku', 'sonnet', 'opus']
  const severities: (Severity | 'all')[] = ['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']
  const verdicts: (Verdict | 'all')[] = ['all', 'confirmed', 'rejected', 'modified']

  useEffect(() => {
    fetchStudies()
  }, [])

  const fetchStudies = async () => {
    try {
      const [studiesRes, currentRes] = await Promise.all([
        fetch('http://localhost:3001/api/studies'),
        fetch('http://localhost:3001/api/studies/current')
      ])
      const studiesData = await studiesRes.json()
      const currentData = await currentRes.json()
      setStudies(studiesData)
      setCurrentStudy(currentData)
    } catch (err) {
      console.error('Failed to fetch studies:', err)
    }
  }

  const handleStudyChange = async (studyId: number) => {
    if (studyId === currentStudy?.id) return

    setIsLoading(true)
    try {
      const res = await fetch(`http://localhost:3001/api/studies/select/${studyId}`, {
        method: 'POST'
      })
      if (res.ok) {
        // Refresh page to reload all data with new study
        window.location.reload()
      } else {
        const data = await res.json()
        console.error('Failed to switch study:', data.error)
      }
    } catch (err) {
      console.error('Failed to switch study:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-between px-4 h-16">
        <div className="flex items-center gap-4">
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900">Study Dashboard</h1>

          {studies.length > 0 && (
            <select
              className="select text-sm ml-4 min-w-[200px]"
              value={currentStudy?.id || ''}
              onChange={(e) => handleStudyChange(Number(e.target.value))}
              disabled={isLoading}
            >
              {studies.map((study) => (
                <option key={study.id} value={study.id}>
                  {study.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-3">
          <select
            className="select text-sm"
            value={filters.category}
            onChange={(e) => onFiltersChange({ ...filters, category: e.target.value as Category | 'all' })}
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>

          <select
            className="select text-sm"
            value={filters.model}
            onChange={(e) => onFiltersChange({ ...filters, model: e.target.value as Model | 'all' })}
          >
            {models.map((model) => (
              <option key={model} value={model}>
                {model === 'all' ? 'All Models' : model.charAt(0).toUpperCase() + model.slice(1)}
              </option>
            ))}
          </select>

          <select
            className="select text-sm"
            value={filters.severity}
            onChange={(e) => onFiltersChange({ ...filters, severity: e.target.value as Severity | 'all' })}
          >
            {severities.map((sev) => (
              <option key={sev} value={sev}>
                {sev === 'all' ? 'All Severities' : sev}
              </option>
            ))}
          </select>

          <select
            className="select text-sm"
            value={filters.verdict}
            onChange={(e) => onFiltersChange({ ...filters, verdict: e.target.value as Verdict | 'all' })}
          >
            {verdicts.map((v) => (
              <option key={v} value={v}>
                {v === 'all' ? 'All Verdicts' : v.charAt(0).toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>

          <button
            onClick={() => onFiltersChange({
              category: 'all',
              model: 'all',
              severity: 'all',
              verdict: 'all',
              seriesId: 'all',
            })}
            className="btn btn-secondary text-sm"
          >
            Clear
          </button>
        </div>
      </div>
    </header>
  )
}
