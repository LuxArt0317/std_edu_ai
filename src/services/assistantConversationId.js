const conversationIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[47][a-f0-9]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function isConversationId(value){
  return typeof value==='string'&&conversationIdPattern.test(value);
}

/* UUIDv7 encodes the first-save time without storing a reservation per draft. */
export function newConversationId(now=Date.now()){
  const bytes=crypto.getRandomValues(new Uint8Array(16)),view=new DataView(bytes.buffer);
  view.setUint16(0,Math.floor(now/2**32));
  view.setUint32(2,now);
  bytes[6]=(bytes[6]&0x0f)|0x70;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
