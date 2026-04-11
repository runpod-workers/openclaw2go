import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  events: defineTable({
    event: v.string(),
    sentAt: v.string(),
    version: v.string(),
    source: v.string(),
    backend: v.string(),
    agent: v.string(),
    models: v.object({
      llm: v.optional(v.string()),
      image: v.optional(v.string()),
      audio: v.optional(v.string()),
    }),
    config: v.object({
      contextLengthBucket: v.optional(v.string()),
      maxOutputTokensBucket: v.optional(v.string()),
    }),
    system: v.object({
      os: v.string(),
      arch: v.string(),
      ramBucket: v.optional(v.string()),
      gpu: v.optional(
        v.object({
          family: v.optional(v.string()),
          count: v.optional(v.number()),
          vramBucket: v.optional(v.string()),
          unifiedMemory: v.optional(v.boolean()),
        }),
      ),
    }),
  })
    .index('by_event', ['event'])
    .index('by_sentAt', ['sentAt'])
    .index('by_version', ['version'])
    .index('by_backend', ['backend'])
    .index('by_source', ['source']),
})
