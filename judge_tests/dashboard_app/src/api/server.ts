import express from 'express'
import cors from 'cors'
import statsRoutes from './routes/stats'
import seriesRoutes from './routes/series'
import findingsRoutes from './routes/findings'
import agentsRoutes from './routes/agents'
import pipelineRoutes from './routes/pipeline'
import studiesRoutes from './routes/studies'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

// Routes
app.use('/api/studies', studiesRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/series', seriesRoutes)
app.use('/api/findings', findingsRoutes)
app.use('/api/agents', agentsRoutes)
app.use('/api/pipeline', pipelineRoutes)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`)
})
