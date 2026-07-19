import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import https from 'node:https'
import { load } from 'cheerio'
import { fileTypeFromBuffer } from 'file-type'
import { chunkKnowledgeText, normalizeKnowledgeText, sha256 } from './knowledgePipeline.js'

export const MAX_ACQUISITION_BYTES = 4_000_000
export const MAX_REDIRECTS = 3
export const ACQUISITION_TIMEOUT_MS = 20_000
const acceptedMimeTypes = new Set(['text/html', 'text/plain', 'text/markdown', 'application/pdf'])

function isReservedIpv4(address) {
  const octets = address.split('.').map(Number)
  const [a, b, c] = octets
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
}

export function isPublicAddress(address) {
  const normalized = String(address).toLowerCase().split('%')[0]
  const family = isIP(normalized)
  if (family === 4) return !isReservedIpv4(normalized)
  if (family !== 6) return false
  if (normalized.startsWith('::ffff:')) return isPublicAddress(normalized.slice(7))
  return normalized !== '::' && normalized !== '::1' && !normalized.startsWith('fc') && !normalized.startsWith('fd') &&
    !normalized.startsWith('fe8') && !normalized.startsWith('fe9') && !normalized.startsWith('fea') && !normalized.startsWith('feb') && !normalized.startsWith('fec') && !normalized.startsWith('fed') && !normalized.startsWith('fee') && !normalized.startsWith('fef') &&
    !normalized.startsWith('ff') && !normalized.startsWith('2001:db8')
}

export async function validatePublicHttpsUrl(value, resolver = dnsLookup) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') throw new Error('Only credential-free HTTPS sources on the standard port are accepted.')
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) throw new Error('Local or private source hosts are not accepted.')
  const literalAddress=url.hostname.replace(/^\[|\]$/g,'')
  const literalFamily = isIP(literalAddress)
  const addresses = literalFamily ? [{ address: literalAddress, family: literalFamily }] : await resolver(url.hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) throw new Error('The source host resolves to a private, reserved, or unavailable address.')
  return { url, addresses }
}

function contentType(value) {
  return String(value || '').split(';')[0].trim().toLowerCase()
}

async function requestOnce(value, options = {}) {
  const { url } = await validatePublicHttpsUrl(value, options.resolver)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || ACQUISITION_TIMEOUT_MS)
  try {
    return await new Promise((resolve, reject) => {
      const request = https.request(url, {
        method: 'GET',
        headers: { Accept: 'text/html,application/pdf,text/plain,text/markdown;q=0.9', 'User-Agent': 'STU-Nexus-Knowledge-Ingestion/1.0' },
        signal: controller.signal,
        lookup: async (hostname, lookupOptions, callback) => {
          try {
            const values = await (options.resolver || dnsLookup)(hostname, { all: true, verbatim: true })
            if (!values.length || values.some((item) => !isPublicAddress(item.address))) return callback(new Error('Connection target is not a public address.'))
            const selected = values[0]
            callback(null, selected.address, selected.family)
          } catch (error) { callback(error) }
        },
      }, (response) => {
        const status = response.statusCode || 0
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume()
          resolve({ redirect: new URL(response.headers.location, url).toString(), status })
          return
        }
        if (status < 200 || status >= 300) {
          response.resume()
          reject(new Error(`The source returned HTTP ${status}.`))
          return
        }
        const declaredLength = Number(response.headers['content-length'] || 0)
        if (declaredLength > MAX_ACQUISITION_BYTES) {
          response.destroy()
          reject(new Error('The source exceeds the 4 MB acquisition limit.'))
          return
        }
        const parts = []
        let total = 0
        response.on('data', (part) => {
          total += part.length
          if (total > MAX_ACQUISITION_BYTES) {
            response.destroy(new Error('The source exceeds the 4 MB acquisition limit.'))
            return
          }
          parts.push(part)
        })
        response.on('end', () => resolve({ bytes: Buffer.concat(parts), mimeType: contentType(response.headers['content-type']), finalUrl: url.toString(), status }))
        response.on('error', reject)
      })
      request.on('error', reject)
      request.end()
    })
  } finally { clearTimeout(timeout) }
}

export async function acquireHttpsSource(value, options = {}) {
  let current = value
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const result = await requestOnce(current, options)
    if (!result.redirect) return result
    if (redirects === MAX_REDIRECTS) throw new Error('The source exceeded the redirect limit.')
    current = result.redirect
  }
  throw new Error('The source could not be acquired.')
}

function cleanText(value) {
  return String(value || '').replace(/[\t ]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim()
}

function markdownLinks($, element, baseUrl) {
  const clone = $(element).clone()
  clone.find('a[href]').each((_, anchor) => {
    const text = cleanText($(anchor).text())
    try {
      const href = new URL($(anchor).attr('href'), baseUrl).toString()
      $(anchor).replaceWith(text ? `${text} (${href})` : href)
    } catch { $(anchor).replaceWith(text) }
  })
  return cleanText(clone.text())
}

export function extractHtmlSections(html, sourceUrl) {
  const $ = load(html)
  $('script,style,noscript,template,svg,iframe,object,embed,[hidden],[aria-hidden="true"],input[type="hidden"]').remove()
  const root = $('main').first().length ? $('main').first() : $('article').first().length ? $('article').first() : $('body')
  const headingPath = []
  const sections = []
  let ordinal = 0
  root.find('h1,h2,h3,h4,h5,h6,p,li,table,form').each((_, element) => {
    const tag = element.tagName.toLowerCase()
    if ($(element).parents('table,form').length) return
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1])
      const value = cleanText($(element).text())
      if (value) { headingPath.splice(level - 1); headingPath[level - 1] = value }
      return
    }
    let text = ''
    if (tag === 'table') {
      text = $(element).find('tr').map((__, row) => `| ${$(row).find('th,td').map((___, cell) => cleanText($(cell).text())).get().filter(Boolean).join(' | ')} |`).get().filter((row) => row !== '|  |').join('\n')
    } else if (tag === 'form') {
      const labels = $(element).find('label').map((__, label) => cleanText($(label).text())).get().filter(Boolean)
      const options = $(element).find('option').map((__, option) => cleanText($(option).text())).get().filter(Boolean)
      text = [...labels, ...options].join('; ')
    } else text = markdownLinks($, element, sourceUrl)
    text = normalizeKnowledgeText(text)
    if (!text) return
    ordinal += 1
    sections.push({ headingPath: headingPath.filter(Boolean), content: text, sourceLocator: `html:${tag}:${ordinal}` })
  })
  if (!sections.length) throw new Error('The HTML source did not contain readable main content.')
  return { title: cleanText($('title').first().text()), sections }
}

export function extractTextSections(text, mimeType = 'text/plain') {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  const sections = []
  const headingPath = []
  let block = []
  let startLine = 1
  const flush = (endLine) => {
    const content = normalizeKnowledgeText(block.join('\n'))
    if (content) sections.push({ headingPath: [...headingPath], content, sourceLocator: `text:lines:${startLine}-${endLine}` })
    block = []
  }
  lines.forEach((line, index) => {
    const markdownHeading = mimeType === 'text/markdown' ? line.match(/^(#{1,6})\s+(.+)$/) : null
    if (markdownHeading) {
      flush(index)
      const level = markdownHeading[1].length
      headingPath.splice(level - 1)
      headingPath[level - 1] = markdownHeading[2].trim()
      startLine = index + 2
    } else if (!line.trim()) { flush(index); startLine = index + 2 } else block.push(line)
  })
  flush(lines.length)
  if (!sections.length) throw new Error('The text source is empty after normalization.')
  return { title: '', sections }
}

export async function extractPdfSections(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  let document
  try { document = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true }).promise }
  catch { throw new Error('The PDF is malformed, encrypted, or unsupported.') }
  const sections = []
  const metadata = await document.getMetadata().catch(() => null)
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = normalizeKnowledgeText(content.items.map((item) => 'str' in item ? item.str : '').join(' '))
    if (text) sections.push({ headingPath: [`Page ${pageNumber}`], content: text, sourceLocator: `pdf:page:${pageNumber}` })
  }
  if (!sections.length) throw new Error('The PDF has no extractable text and requires reviewed OCR before ingestion.')
  return { title: cleanText(metadata?.info?.Title), sections, pageCount: document.numPages }
}

export async function detectAndExtractSource(bytes, declaredMimeType, sourceUrl = '') {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength) throw new Error('The acquired source is empty.')
  if (bytes.byteLength > MAX_ACQUISITION_BYTES) throw new Error('The source exceeds the 4 MB acquisition limit.')
  const detected = await fileTypeFromBuffer(bytes)
  const declared = contentType(declaredMimeType)
  const mimeType = detected?.mime || declared
  if (!acceptedMimeTypes.has(mimeType)) throw new Error(`Unsupported source type: ${mimeType || 'unknown'}.`)
  if (detected && declared && declared !== 'application/octet-stream' && detected.mime !== declared) throw new Error('The file signature does not match its declared media type.')
  if (mimeType === 'application/pdf') return { ...(await extractPdfSections(bytes)), mimeType, parserVersion: 'pdfjs-6.1.200@1' }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (mimeType === 'text/html') return { ...extractHtmlSections(text, sourceUrl), mimeType, parserVersion: 'cheerio-1.2.0@1' }
  return { ...extractTextSections(text, mimeType), mimeType, parserVersion: 'stu-text-structure@1' }
}

export async function chunkKnowledgeSections(sections, options = {}) {
  const output = []
  for (const section of sections) {
    const chunks = await chunkKnowledgeText(section.content, options)
    for (const part of chunks) {
      const contentChecksum = await sha256(part.content)
      const identity = await sha256(`${section.sourceLocator}\n${part.ordinal}\n${part.content}`)
      output.push({ ...part, ordinal: output.length, chunkKey: `sha256:${identity.slice(0, 24)}`, contentChecksum, headingPath: section.headingPath, sourceLocator: chunks.length > 1 ? `${section.sourceLocator}:part:${part.ordinal + 1}` : section.sourceLocator })
    }
  }
  return output
}
