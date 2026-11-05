const baseUrl = (process.env.STU_BASE_URL || 'https://stdeduai.vercel.app').replace(/\/$/, '')

const home = await fetch(`${baseUrl}/`, { headers: { 'Cache-Control': 'no-cache' } })
const homeHtml = await home.text()
if (!home.ok || !homeHtml.includes('校園網站介面預覽（非官方）') || homeHtml.includes('data-stu-boot') || homeHtml.includes('<iframe')) {
  throw new Error('The public homepage must render a direct copied document without the SPA loader.')
}
for (const route of ['/在校學生/', '/admissions', '/freshman', '/教職員工/', '/進修人士/', '/畢業校友/', '/alumni-association', '/校外訪客/', '/國際學生/', '/international']) {
  const response = await fetch(`${baseUrl}${route}`, { headers: { 'Cache-Control': 'no-cache' } })
  const html = await response.text()
  if (!response.ok || !html.includes('校園網站介面預覽（非官方）') || html.includes('data-stu-boot') || html.includes('<iframe')) {
    throw new Error(`${route} must render a direct copied document without the SPA loader.`)
  }
}
for (const route of ['/signin', '/signup', '/login', '/app', '/app/cases', '/crm', '/campus-assistant', '/campus-directory']) {
  const response = await fetch(`${baseUrl}${route}`, { headers: { 'Cache-Control': 'no-cache' } })
  const html = await response.text()
  if (!response.ok) throw new Error(`${route} returned HTTP ${response.status}.`)
  if (!html.includes('data-stu-boot') || !html.includes('Loading the page')) {
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
  const verifiedAssets = new Set([entryPath])
  let onboardingUiPresent = false
  let crmAuthStyles = false
  const expectedSupabaseHost = process.env.STU_EXPECTED_SUPABASE_HOST
  let expectedSupabaseFound = Boolean(expectedSupabaseHost && entry.includes(expectedSupabaseHost))
  const queue = [...dynamicAssets]
  while (queue.length) {
    const assetPath = queue.shift()
    if (!assetPath || verifiedAssets.has(assetPath)) continue
    const asset = await fetch(new URL(assetPath, baseUrl), { headers: { 'Cache-Control': 'no-cache' } })
    const body = await asset.text()
    if (!asset.ok) throw new Error(`${assetPath} returned HTTP ${asset.status}.`)
    verifiedAssets.add(assetPath)
    if (expectedSupabaseHost && body.includes(expectedSupabaseHost)) expectedSupabaseFound = true
    if (assetPath.endsWith('.css') && body.includes('.nexus-auth-shell') && body.includes('.nexus-auth-card')) crmAuthStyles = true
    if (!assetPath.endsWith('.js')) continue
    if (body.includes('ROLE READINESS CENTER') || body.includes('Click the highlighted control') || body.includes('stu-nexus-role-foundations')) onboardingUiPresent = true
    for (const match of body.matchAll(/assets\/[A-Za-z0-9_.-]+\.(?:js|css)/g)) queue.push(`/${match[0]}`)
    for (const match of body.matchAll(/\.\/([A-Za-z0-9_.-]+\.(?:js|css))/g)) queue.push(`/assets/${match[1]}`)
  }
  if (onboardingUiPresent) throw new Error(`${route} still exposes onboarding UI code even though onboarding is temporarily disabled.`)
  if (!crmAuthStyles) {
    throw new Error(`${route} did not expose a linked CRM stylesheet containing .nexus-auth-shell and .nexus-auth-card. The portal may return HTTP 200 while rendering an unstyled sign-in form.`)
  }

  if (expectedSupabaseHost && !expectedSupabaseFound) throw new Error(`${route} does not reference the expected client database ${expectedSupabaseHost}.`)

  console.log(JSON.stringify({ route, status: response.status, bootShell: true, entry: entryPath, verifiedAssets: verifiedAssets.size, onboardingDisabled: true, crmAuthStyles }))
}

for (const path of ['/assets/missing-boot-recovery.js', '/school-pages/missing-boot-recovery.html', '/school-assets/missing-boot-recovery.css']) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { 'Cache-Control': 'no-cache' } })
  if (response.status !== 404) throw new Error(`${path} returned ${response.status} instead of 404; a missing asset must not serve the app boot shell.`)
}
