import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { Layout } from './components/Layout'
import { Home, ErrorPage } from './components/Home'
import { fetchContestData, getLatestContestNumber } from './lib/lottery'
import { getBetsForContest, loadBets } from './lib/bets'
import { getErrorMessage } from './lib/validation'

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

app.route('/', route)
app.route('/loteca', route)

const port = 8126
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  hostname: '127.0.0.1',
  port
})
