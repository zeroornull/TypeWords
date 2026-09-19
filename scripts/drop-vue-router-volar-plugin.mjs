const MISSING_VUE_ROUTER_VOLAR_PLUGIN = 'vue-router/volar/sfc-route-blocks'

export function dropMissingVueRouterVolarPlugin(tsConfig) {
  const plugins = tsConfig?.vueCompilerOptions?.plugins
  if (!Array.isArray(plugins)) return tsConfig
  tsConfig.vueCompilerOptions.plugins = plugins.filter(item => {
    const name = typeof item === 'string' ? item : item?.name
    return name !== MISSING_VUE_ROUTER_VOLAR_PLUGIN
  })
  return tsConfig
}

export default function dropVueRouterVolarPlugin(_options, nuxt) {
  nuxt.hook('modules:done', () => {
    nuxt.hook('prepare:types', ctx => {
      dropMissingVueRouterVolarPlugin(ctx.tsConfig)
      dropMissingVueRouterVolarPlugin(ctx.sharedTsConfig)
      dropMissingVueRouterVolarPlugin(ctx.nodeTsConfig)
      dropMissingVueRouterVolarPlugin(ctx.appTsConfig)
    })
  })
}
