import {privateCampusTransitionPath} from '../../server/campusEntryContract.js';
import {legacyDtmWorkspacePath} from '../../server/learningEntryContract.js';

const assistantRoute=location=>{
  const path=location.pathname;
  return privateCampusTransitionPath(path)??(legacyDtmWorkspacePath(path)??path)+location.search;
};

/** An embedded assistant belongs to its immediate same-origin host page.
 * This supplies navigation context only; the API still authorizes every route.
 * Never infer a parent route from a cross-origin referrer or URL parameter. */
export function assistantPageRoute(embedded,host=typeof window==='undefined'?null:window) {
  if(!host)return '';
  let ownRoute='';
  try { ownRoute=assistantRoute(host.location); }
  catch { return ''; }
  if(!embedded)return ownRoute;
  try {
    const parent=host.parent;
    const origin=host.location.origin;
    if(parent&&parent!==host&&origin&&origin!=='null'&&parent.location.origin===origin)
      return assistantRoute(parent.location);
  } catch { /* A different-origin or unavailable parent has no trusted context. */ }
  return ownRoute;
}
