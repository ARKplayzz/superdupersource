import type { DesignObject } from '@sds/core/browser'

// Box fills, by source. Greys only: the boxes stand for sources, they aren't pictures of them.
const TONE: Record<string, [string, string]> = {
  Presentation: ['#d4d4d4', '#111'],
  'Presentation 2': ['#a8a8a8', '#111'],
  'Presentation 3': ['#bdbdbd', '#111'],
  'Presentation 4': ['#969696', '#111'],
  Static: ['#4d4d4d', '#eee'],
  Wide: ['#363636', '#ddd'],
  'Camera 3': ['#6a6a6a', '#f2f2f2'],
  'Camera 4': ['#585858', '#f2f2f2'],
  'Camera 5': ['#424242', '#eee'],
  'Camera 6': ['#5f5f5f', '#f2f2f2'],
}

export function tone(o: DesignObject): [string, string] {
  return ('role' in o.source && TONE[o.source.role]) || ['#585858', '#eee']
}
