import { curriculumDocumentSource } from '../src/features/public/affairs/curriculumPlans.js';

const maxPlanBytes = 4_400_000;
const pdfSignature = Buffer.from('%PDF-');
async function readPlan(source, fetchPlan) {
  const upstream = await fetchPlan(source, { redirect:'error', signal:AbortSignal.timeout(12000) });
  if (!upstream.ok || !upstream.body) throw new Error('Plan response unavailable');
  const reader = upstream.body.getReader();
  try {
    const type = upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (type !== 'application/pdf' && type !== 'application/octet-stream') throw new Error('Invalid media type');
    if (Number(upstream.headers.get('content-length')) > maxPlanBytes) throw new Error('Plan too large');
    const chunks = [];
    let length = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maxPlanBytes) throw new Error('Plan too large');
      chunks.push(next.value);
    }
    const data = Buffer.concat(chunks,length);
    if (!data.subarray(0,pdfSignature.length).equals(pdfSignature)) throw new Error('Invalid PDF bytes');
    return data;
  } catch (error) {
    await reader.cancel().catch(()=>{});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function serveCurriculumPlan(request, response, fetchPlan = fetch) {
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Referrer-Policy','no-referrer');
  if (request.method !== 'GET') {
    response.setHeader('Allow','GET');
    response.status(405).json({error:'Method not allowed.'});
    return;
  }
  const {scope,code,...extras} = request.query ?? {};
  if (scope !== 'curriculum-plan' || typeof code !== 'string' || Object.keys(extras).length) {
    response.status(400).json({error:'Choose one curriculum plan.'});
    return;
  }
  const source = curriculumDocumentSource(code);
  if (!source) {
    response.status(404).json({error:'Curriculum plan not found.'});
    return;
  }
  if (!response.end) {
    response.status(500).json({error:'The document viewer is unavailable.'});
    return;
  }
  try {
    const data = await readPlan(source,fetchPlan);
    response.setHeader('Content-Type','application/pdf');
    response.setHeader('Content-Disposition',`inline; filename="curriculum-${code}.pdf"`);
    response.setHeader('Content-Length',String(data.length));
    response.setHeader('Cache-Control','public, max-age=900, s-maxage=3600');
    response.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'self'");
    response.status(200);
    response.end(data);
  } catch {
    response.status(502).json({error:'The university PDF could not be previewed. Use the direct download link.'});
  }
}
