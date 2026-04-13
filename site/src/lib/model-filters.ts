import type { Engine } from './catalog'

export type TaskChip = 'llm' | 'vision' | 'image' | 'audio'

export interface FilterState {
  contextMin: number | null
  task: TaskChip | null
  engines: Engine[] | null  // null = all engines shown
}

export const EMPTY_FILTERS: FilterState = {
  contextMin: null,
  task: null,
  engines: null,
}
