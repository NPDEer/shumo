import type { RecentItem } from './types'

/** The recent list without the entry for filePath, order unchanged. */
export function removeRecent(list: readonly RecentItem[], filePath: string): RecentItem[] {
  return list.filter((item) => item.path !== filePath)
}
