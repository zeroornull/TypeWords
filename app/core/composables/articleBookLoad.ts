export type ArticleBookLike = {
  id?: unknown
  articles?: unknown[]
  custom?: boolean
  system?: boolean
  is_default?: boolean
}

export function needsOfficialArticleFetch(dict: ArticleBookLike | null | undefined): boolean {
  return !!dict && !dict.articles?.length && !dict.custom && !dict.system && !dict.is_default
}

export function resolveArticleBookForEdit<T extends ArticleBookLike>(
  dict: T | null | undefined,
  fetched?: T | null
): T | null {
  if (!dict?.id) return null
  if (needsOfficialArticleFetch(dict)) return fetched?.id ? fetched : dict
  return dict
}
