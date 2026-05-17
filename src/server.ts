import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { Layout } from './components/Layout'
import { Home, ErrorPage } from './components/Home'
import { fetchContestData, getLatestContestNumber } from './lib/lottery'
import { getBetsForContest, loadBets } from './lib/bets'
import { getErrorMessage } from './lib/validation'
import { getContest, getLatestContest, saveContest, getBets, saveBets, getAppState, setAppState } from './lib/db'

const app = new Hono()
const route = new Hono()

route.use('*', logger())

// Home Route
route.get('/', async (c) => {
  const contest = c.req.query('concurso') || ''
  
  try {
    const [contestData, latestContestNumber, betsConfig] = await Promise.all([
      fetchContestData(contest),
      getLatestContestNumber(),
      loadBets(),
    ])

    const bets = getBetsForContest(betsConfig, contestData.numero)

    return c.html(
      Layout({
        children: Home({ contestData, latestContestNumber, bets }),
        title: `Concurso ${contestData.numero} - NewLoteca`
      })
    )
  } catch (error) {
    return c.html(
      Layout({
        children: ErrorPage({ message: getErrorMessage(error) }),
        title: 'Erro - NewLoteca'
      }),
      500
    )
  }
})

// API Routes

// Legacy aliases for n8n compatibility
route.get('/api/contest/latest', async (c) => {
  try {
    const data = await fetchContestData('')
    return c.json(data)
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 503)
  }
})

route.get('/api/contest/:contestNumber', async (c) => {
  try {
    const contestNumber = c.req.param('contestNumber')
    const data = await fetchContestData(contestNumber)
    return c.json(data)
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 400)
  }
})

route.get('/api/cache/contest/:contestNumber', async (c) => {
  try {
    const contestNumber = parseInt(c.req.param('contestNumber'), 10)
    const data = getContest(contestNumber)
    if (!data) return c.json({ error: 'Not found' }, 404)
    return c.json(data)
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 500)
  }
})

route.get('/api/cache/latest', async (c) => {
  try {
    const data = getLatestContest()
    if (!data) return c.json({ error: 'Not found' }, 404)
    return c.json(data)
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 500)
  }
})

route.post('/api/cache/contest', async (c) => {
  try {
    const body = await c.req.json()
    const ok = saveContest(body)
    return c.json({ ok })
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 500)
  }
})

route.get('/api/bets', async (c) => {
  try {
    const data = getBets()
    if (!data) return c.json({ permanent: [], one_off: {} })
    return c.json(data)
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 500)
  }
})

route.post('/api/bets', async (c) => {
  try {
    const body = await c.req.json()
    const ok = saveBets(body)
    return c.json({ ok })
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 500)
  }
})

route.get('/api/state/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const value = getAppState(key)
    return c.json({ key, value })
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 500)
  }
})

route.post('/api/state', async (c) => {
  try {
    const { key, value } = await c.req.json()
    const ok = setAppState(key, String(value))
    return c.json({ ok })
  } catch (error) {
    return c.json({ error: getErrorMessage(error) }, 500)
  }
})

app.route('/', route)
app.route('/loteca', route)

const port = 8126
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  hostname: '0.0.0.0',
  port
})
