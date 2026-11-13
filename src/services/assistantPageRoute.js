/** An embedded assistant belongs to its immediate same-origin host page.
 * This supplies navigation context only; the API still authorizes every route.
 * Never infer a parent route from a cross-origin referrer or URL parameter. */
export function assistantPageRoute(embedded,host=typeof window==='undefined'?null:window) {
  if(!host)return '';
  let ownRoute='';
  try { ownRoute=host.location.pathname+host.location.search; }
  catch { return ''; }
  if(!embedded)return ownRoute;
  try {
    const parent=host.parent;
    const origin=host.location.origin;
    if(parent&&parent!==host&&origin&&origin!=='null'&&parent.location.origin===origin)
      return parent.location.pathname+parent.location.search;
  } catch { /* A different-origin or unavailable parent has no trusted context. */ }
  return ownRoute;
}
