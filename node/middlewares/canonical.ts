import { json as parseBody } from 'co-body'
import { prop, split, toLower } from 'ramda'

import { isSearch, precedence, removeQuerystring, Route, routeIdToStoreRoute } from '../resources/route'

const isVtex = (platform: string | undefined) => platform && toLower(platform) === 'vtex'

const cleanPath = (path: string) => split('/', path)[1]

const routeTypeToStoreRoute: any = {
  'Brand': (path: string) => ({
    ...routeIdToStoreRoute.brands,
    domain: 'store',
    params: {
      p1: path,
    },
    path:`${path}/b`,
  }),
  'Department': (path: string) => ({
    ...routeIdToStoreRoute.departments,
    domain: 'store',
    params: {
      p1: path,
    },
    path:`${path}/d`,
  }),
  'FullText': (path: string) => ({
    domain: 'store',
    id: 'store.search',
    params: {
      p1: path,
    },
    path:`${path}/s`,
    pathId: '/:p1/s',
  }),
}

const routeFromCatalogPageType = (
  catalogPageTypeResponse: CatalogPageTypeResponse,
  canonicalPath: string
) => {
  console.log(catalogPageTypeResponse)
  const pageType = prop('pageType', catalogPageTypeResponse)
  //console.log(`Returned pageType: ${pageType}`)
  const routeGenerator = routeTypeToStoreRoute[pageType] || routeTypeToStoreRoute.FullText
  return routeGenerator(canonicalPath)
}

export const getCanonical: Middleware = async (ctx: Context) => {
  const {clients: {canonicals, catalog, logger}, query: {canonicalPath}, state: {platform}} = ctx
  const path = removeQuerystring(canonicalPath)
  let maybeRoute = await canonicals.load(path)
  if (isVtex(platform)) {
    const cleanCanonicalPath = cleanPath(canonicalPath)
    const catalogRoute = routeFromCatalogPageType(
      await catalog.pageType(cleanCanonicalPath),
      cleanCanonicalPath
    )

    const catalogRoutePath = prop('path', catalogRoute)
    const vbaseRoutePath = prop('path', maybeRoute as any)
    console.log(`catalog route path: ${catalogRoutePath} `)
    console.log(`vbase route path: ${vbaseRoutePath} `)
    logger.debug(
      `catalog pagetype API returned route path ${catalogRoutePath} but route stored in vbase was ${vbaseRoutePath}`
    )

    maybeRoute = catalogRoute
  }
  if (maybeRoute) {
    ctx.body = maybeRoute
    ctx.status = 200
    ctx.set('content-type', 'application/json')
  }
}

export const saveCanonical: Middleware = async (ctx: Context) => {
  const {clients: {canonicals}} = ctx
  const newRoute = Route.from(await parseBody(ctx))
  const {canonical: canonicalPath} = newRoute
  const path = removeQuerystring(canonicalPath)
  const savedRoute = await canonicals.load(path)
  if (!isSearch(newRoute) && (!savedRoute || precedence(newRoute, savedRoute))) {
    await canonicals.save(newRoute)
  }

  ctx.status = 204
}
