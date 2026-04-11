import { v } from 'convex/values'
import { mutation } from './_generated/server'

export const ingest = mutation({
  args: {
    event: v.object({
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
    }),
  },
  handler: async (ctx, { event }) => {
    await ctx.db.insert('events', event)
  },
})
