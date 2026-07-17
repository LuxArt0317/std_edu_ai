const baseUrl = (process.env.STU_BASE_URL || 'https://www.stu.best').replace(/\/$/, '')

for (const route of ['/', '/crm']) {
  const response = await fetch(`${baseUrl}${route}`, { headers: { 'Cache-Control': 'no-cache' } })
  const html = await response.text()
  if (!response.ok) throw new Error(`${route} returned HTTP ${response.status}.`)
  if (!html.includes('data-stu-boot') || !html.includes('Opening your workspace')) {
    throw new Error(`${route} does not contain the dependency-free recovery shell.`)
  }
  if (/<div id="root"><\/div>/.test(html)) throw new Error(`${route} still ships an empty application root.`)

  const entryPath = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1]
  const stylePath = html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1]
  if (!entryPath || !stylePath) throw new Error(`${route} is missing its compiled entry assets.`)

  const entryResponse = await fetch(new URL(entryPath, baseUrl), { headers: { 'Cache-Control': 'no-cache' } })
  const entry = await entryResponse.text()
  if (!entryResponse.ok) throw new Error(`${entryPath} returned HTTP ${entryResponse.status}.`)

  const dynamicAssets = new Set([
    stylePath,
    ...[...entry.matchAll(/assets\/[A-Za-z0-9_.-]+\.(?:js|css)/g)].map((match) => `/${match[0]}`),
    ...[...entry.matchAll(/\.\/([A-Za-z0-9_.-]+\.js)/g)].map((match) => `/assets/${match[1]}`),
  ])
  for (const assetPath of dynamicAssets) {
    const asset = await fetch(new URL(assetPath, baseUrl), { headers: { 'Cache-Control': 'no-cache' } })
    if (!asset.ok) throw new Error(`${assetPath} returned HTTP ${asset.status}.`)
  }

  console.log(JSON.stringify({ route, status: response.status, bootShell: true, entry: entryPath, verifiedAssets: dynamicAssets.size + 1 }))
}
