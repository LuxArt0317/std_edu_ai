/** Read bounded assistant SSE frames, preserving JSON for older servers. */
export async function readAssistantReply(response,onProgress) {
  if (!response.headers?.get?.('content-type')?.includes('text/event-stream')) return response.json().catch(()=>null);
  if (!response.body) throw new Error('The assistant stream could not be opened.');
  const reader=response.body.getReader(), decoder=new TextDecoder();
  let buffer='',bytes=0,terminal=null;
  try {
    while (true) {
      const {value,done}=await reader.read();
      if (done) break;
      bytes+=value.byteLength;
      if (bytes>300_000) throw new Error('The assistant response was too large.');
      buffer+=decoder.decode(value,{stream:true});
      let boundary;
      while ((boundary=/\r?\n\r?\n/.exec(buffer))) {
        const frame=buffer.slice(0,boundary.index).replace(/\r/g,'');
        buffer=buffer.slice(boundary.index+boundary[0].length);
        const type=frame.match(/^event: (.+)$/m)?.[1];
        const data=frame.match(/^data: (.+)$/m)?.[1];
        if (!type || !data) continue;
        let payload;
        try {payload=JSON.parse(data)} catch {throw new Error('The assistant sent an invalid update.');}
        if (type==='progress' && payload && typeof payload==='object') {
          if (typeof payload.kind==='string' && typeof payload.label==='string' && typeof payload.detail==='string' && ['running','complete','unavailable'].includes(payload.status)) onProgress?.(payload);
        } else if (type==='result') terminal=payload;
        else if (type==='error') throw new Error(typeof payload?.error==='string' ? payload.error : 'The assistant could not finish.');
      }
    }
  } finally {reader.releaseLock()}
  if (!terminal) throw new Error('The assistant response ended before an answer was ready.');
  return terminal;
}
