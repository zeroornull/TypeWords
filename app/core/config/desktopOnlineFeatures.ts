export const DESKTOP_WORD_QUERY_DISABLED_MESSAGE = '桌面在线查询 API 未配置有效的 HTTPS 服务，当前功能未启用'
export const DESKTOP_BAIDU_TRANSLATE_DISABLED_MESSAGE = '桌面百度翻译未启用：需要独立的远端翻译服务；请手动填写译文'
export const DESKTOP_CLOUD_SYNC_DISABLED_MESSAGE = '本地桌面版暂不提供云同步'

const LOOPBACK_HOST = /^(localhost\.?|127(?:\.\d+){3}|\[::1\])$/i

export function resolveDesktopApiBase(raw: unknown): URL | undefined {
  let endpoint: URL | undefined
  try {
    endpoint = new URL(String(raw ?? '').trim())
  } catch {
    return undefined
  }
  if (
    endpoint.protocol !== 'https:' ||
    LOOPBACK_HOST.test(endpoint.hostname) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    return undefined
  }
  return endpoint
}

export function isDesktopWordQueryEnabled(desktopApiBase: unknown): boolean {
  return Boolean(resolveDesktopApiBase(desktopApiBase))
}

export function normalizeDesktopApiBase(desktopApiBase: unknown): string | undefined {
  const endpoint = resolveDesktopApiBase(desktopApiBase)
  return endpoint ? endpoint.href.replace(/\/?$/, '/') : undefined
}

export type DesktopOnlineFeatureState = 'enabled' | 'enabled-local' | 'disabled' | 'optional-https' | 'inventory-only'

export type DesktopOnlineFeature = {
  id: string
  desktop: DesktopOnlineFeatureState
  note: string
}

/** Official P1-02 desktop online enable/disable list. True-service acceptance stays P3. */
export const DESKTOP_ONLINE_FEATURES: readonly DesktopOnlineFeature[] = [
  {
    id: 'word-query-api',
    desktop: 'optional-https',
    note: 'Disabled unless TYPEWORDS_DESKTOP_API_BASE is a non-loopback HTTPS origin without credentials, query, or hash.',
  },
  {
    id: 'baidu-translate',
    desktop: 'disabled',
    note: 'Desktop skips the /baidu proxy and empty Baidu credentials. Manual translation remains.',
  },
  {
    id: 'baidu-dev-proxy',
    desktop: 'disabled',
    note: 'Desktop nitro.devProxy is empty. Web keeps /baidu.',
  },
  {
    id: 'cloud-sync',
    desktop: 'disabled',
    note: 'D09 local-only desktop. Settings sync tab hidden. Runtime refuses the cloud client.',
  },
  {
    id: 'website-analytics',
    desktop: 'disabled',
    note: 'Desktop init skips t.js.',
  },
  {
    id: 'service-worker',
    desktop: 'disabled',
    note: 'Desktop init skips service-worker registration.',
  },
  {
    id: 'remote-google-fonts',
    desktop: 'disabled',
    note: 'Desktop CSS omits web-fonts.css.',
  },
  {
    id: 'youdao-pronunciation',
    desktop: 'enabled',
    note: 'Online enhancement. PronunciationApi remains https://dict.youdao.com/dictvoice.',
  },
  {
    id: 'bundled-dict-lists',
    desktop: 'enabled-local',
    note: 'DICT_LIST uses empty RESOURCE_URL plus /list/*.json. Not a remote dynamic catalog service.',
  },
  {
    id: 'allowlisted-hosts-without-new-dest-entry',
    desktop: 'inventory-only',
    note: '2study.top, www.google.cn, and pan.quark.cn stay allowlisted. Dest: old-host banner / IE-only / QR-only. Do not add dest product buttons.',
  },
]

export type DesktopLeftoverHostKind = 'no-dest-entry' | 'qr-only' | 'settings-hidden'

export type DesktopLeftoverHost = {
  host: string
  kind: DesktopLeftoverHostKind
  note: string
}

/**
 * Official P3-02 leftover T09 host inventory. Dest-click exhausted (V090/V093).
 * Source-lock only. Do not add dest product buttons for 2study.top / google.cn / 夸克.
 * Cloud D09 stays deferred.
 */
export const DESKTOP_LEFTOVER_HOST_INVENTORY: readonly DesktopLeftoverHost[] = [
  {
    host: '2study.top',
    kind: 'no-dest-entry',
    note: 'Old-host banner only when location.host===2study.top. Dest is tauri.localhost. Do not add dest product buttons.',
  },
  {
    host: 'www.google.cn',
    kind: 'no-dest-entry',
    note: 'IeDialog IE-only Chrome download. Dest WebView is Edge. Do not add dest product buttons.',
  },
  {
    host: 'pan.quark.cn',
    kind: 'qr-only',
    note: '/doc ResourceCard openLink shows QR. No dest <a href=pan.quark.cn>. Do not add dest product buttons.',
  },
  {
    host: 'supabase.com',
    kind: 'settings-hidden',
    note: 'D09. Settings sync tab and supabase/kdocs tutorial links hidden on desktop. Do not add dest product buttons.',
  },
  {
    host: 'www.kdocs.cn',
    kind: 'settings-hidden',
    note: 'Settings tutorial kdocs hidden with the sync tab. About/help WeChat kdocs stays dest-clicked. Do not add dest product buttons.',
  },
]
