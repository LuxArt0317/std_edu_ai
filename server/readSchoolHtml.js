const maxBytes = 512_000;

export async function readSchoolHtml(response) {
  if (!response.ok || response.redirected || !response.body ||
      !/^text\/html\b/i.test(response.headers.get('content-type') ?? '') ||
      Number(response.headers.get('content-length')) > maxBytes) throw Error('School response unavailable');
  const reader = response.body.getReader();
  try {
    const decoder = new TextDecoder('utf-8',{fatal:true});
    let size=0, html='';
    for (;;) {
      const part=await reader.read();
      if (part.done) break;
      size+=part.value.byteLength;
      if (size>maxBytes) throw Error('School response too large');
      html+=decoder.decode(part.value,{stream:true});
    }
    return html+decoder.decode();
  } catch (error) {
    await reader.cancel().catch(()=>{});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
