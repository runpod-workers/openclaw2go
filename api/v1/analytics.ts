import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'

const client = new ConvexHttpClient(process.env.CONVEX_URL!)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, User-Agent')
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' })
  }

  const body = req.body
  if (!body || typeof body !== 'object' || !body.event) {
    return res.status(400).json({ error: 'invalid payload' })
  }

  try {
    await client.mutation(api.analytics.ingest, { event: body })
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('convex ingest error:', err)
    return res.status(500).json({ error: 'ingestion failed' })
  }
}
