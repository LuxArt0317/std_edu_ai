/** Shared browser/server limits for observable operations, never private reasoning. */
export const MAX_ASSISTANT_ACTIVITY = 64;
export const ASSISTANT_ACTIVITY_BYTES = 16000;
export const ASSISTANT_CONVERSATION_BYTES = 170000;
const encoder = new TextEncoder();
const bytes = value => encoder.encode(typeof value === 'string' ? value : JSON.stringify(value)).byteLength;
/** PostgreSQL JSONB cannot store NUL or isolated UTF-16 surrogates. Preserve the
 * existing UTF-16 limits while keeping complete Unicode code points. */
export function boundedAssistantText(value, maximum) {
  if (!Number.isInteger(maximum) || maximum < 0) throw new RangeError('Invalid stored text limit.');
  if (typeof value !== 'string' || !maximum) return '';
  let result = '';
  for (const character of value) {
    if (character === '\u0000') continue;
    const code = character.charCodeAt(0);
    const safe = character.length === 1 && code >= 0xd800 && code <= 0xdfff ? '\uFFFD' : character;
    if (result.length + safe.length > maximum) break;
    result += safe;
  }
  return result;
}
function storedBytes(value) {
  const serialized = JSON.stringify(value);
  let separators = 0, quoted = false, escaped = false;
  for (const character of serialized) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === ':' || character === ',') separators++;
  }
  // PostgreSQL checks octet_length(jsonb::text), which includes spaces after
  // structural colons/commas. Compact transport JSON is not its storage size.
  return bytes(serialized) + separators;
}
const states = new Set(['running', 'complete', 'unavailable']);
const omissionKind = 'activity-history-limit';
const unknownOmissionDetail = 'Earlier operation entries were abbreviated. Their exact count cannot be recovered from the retained history.';
function omissionMetadata(values) {
  let present = false, count = 0;
  for (const value of Array.isArray(values) ? values : []) {
    if (value?.kind !== omissionKind || value.status !== 'unavailable') continue;
    if (value.detail === unknownOmissionDetail) {present = true; count = null; continue;}
    const parsed = Number(/^(\d+) earlier operation entries exceeded the 64-step history limit\.$/.exec(value.detail)?.[1] || 0);
    if (Number.isSafeInteger(parsed) && parsed > 0) {present = true; if (count !== null) count = Math.max(count, parsed);}
  }
  return {present, count};
}

function characterClip(value, maximum) {
  // Keep the historical UTF-16 field limits without splitting surrogate pairs.
  value = boundedAssistantText(value, value.length);
  if (value.length <= maximum) return value;
  let result = '';
  for (const character of value) {
    if (result.length + character.length > maximum - 1) break;
    result += character;
  }
  return result + '…';
}

function clip(value, maximum) {
  if (bytes(value) <= maximum) return value;
  if (maximum < 3) return '';
  let result = '', used = 3;
  for (const character of value) {
    const size = bytes(character);
    if (used + size > maximum) break;
    result += character; used += size;
  }
  return result + '…';
}

function activityRows(values) {
  const steps = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    if (value?.kind === omissionKind) continue; // Reserved metadata is rebuilt.
    if (!value || typeof value.kind !== 'string' || !/^[A-Za-z0-9:_-]{1,64}$/.test(value.kind)
      || typeof value.label !== 'string' || typeof value.detail !== 'string' || !states.has(value.status)
      || /[\ud800-\udfff]/u.test(value.label + value.detail)) continue;
    steps.set(value.kind, {kind:value.kind, label:characterClip(value.label,120), detail:characterClip(value.detail,500), status:value.status});
  }
  return [...steps.values()];
}

function boundActivityRows(rows, omission, budget, preferredKinds = new Set(), stableAllocation = false) {
  if (!Number.isInteger(budget) || budget < 4096 || budget > ASSISTANT_ACTIVITY_BYTES) throw new RangeError('Invalid activity byte budget.');
  let values = rows;
  if (omission.present || values.length > MAX_ASSISTANT_ACTIVITY) {
    const capacity = MAX_ASSISTANT_ACTIVITY - 1;
    if (preferredKinds.size && values.length > capacity) {
      // The final snapshot can restore its own steps on another reconciliation;
      // streamed-only observations cannot be restored from that snapshot. Keep
      // those first, while reserving at least one slot for final activity.
      const preferred = values.filter(row => preferredKinds.has(row.kind));
      const ordinary = values.filter(row => !preferredKinds.has(row.kind));
      const retainedPreferred = preferred.slice(-(capacity - (ordinary.length ? 1 : 0)));
      const retained = new Set([...retainedPreferred, ...ordinary.slice(-(capacity - retainedPreferred.length))].map(row => row.kind));
      values = values.filter(row => retained.has(row.kind));
    } else values = values.slice(-capacity);
    const omitted = omission.count === null ? null : omission.count + rows.length - values.length;
    values = [{kind:omissionKind, label:'Earlier activity omitted', detail:omitted === null ? unknownOmissionDetail : `${omitted} earlier operation entries exceeded the ${MAX_ASSISTANT_ACTIVITY}-step history limit.`, status:'unavailable'}, ...values];
  }
  if (!values.length || !stableAllocation && bytes(values) <= budget) return values;
  // The reserved marker must survive byte clipping intact so a later merge can
  // carry its omission count forward. Budget ordinary steps around it.
  const marker = values[0]?.kind === omissionKind ? values[0] : null;
  const ordinary = marker ? values.slice(1) : values;
  const rowBudget = Math.floor((budget - 2 - (values.length - 1) - (marker ? bytes(marker) : 0)) / ordinary.length);
  const bounded = ordinary.map(value => {
    // A final snapshot uses the same fair row budget on every replay. Otherwise
    // clipped streamed-only rows can free space and cause final text to grow on
    // the second replay, despite receiving the identical final snapshot.
    if (bytes(value) <= rowBudget) return value;
    const row = {...value, label:clip(value.label, Math.min(80, Math.max(0, rowBudget - bytes({...value,label:'',detail:''}) - 20))), detail:''};
    row.detail = clip(value.detail, Math.max(0, rowBudget - bytes(row)));
    // JSON escaping can cost more bytes than the text's UTF-8 encoding.
    while (bytes(row) > rowBudget && row.detail) row.detail = clip(row.detail, Math.max(0, bytes(row.detail) - 8));
    while (bytes(row) > rowBudget && row.label) row.label = clip(row.label, Math.max(0, bytes(row.label) - 8));
    return row;
  });
  if (marker) bounded.unshift(marker);
  if (bytes(bounded) > budget) throw new RangeError('Activity identity metadata exceeds its budget.');
  return bounded;
}

/** Merge incremental events only. Once discarded identities are unknown, a new
 * unseen kind might be a replay; never manufacture a cumulative omission count. */
export function boundedAssistantActivity(current = [], incoming = [], {budget = ASSISTANT_ACTIVITY_BYTES} = {}) {
  const before = activityRows(current), after = activityRows(incoming);
  const oldOmission = omissionMetadata(current), newOmission = omissionMetadata(incoming);
  const knownBefore = new Set(before.map(row => row.kind)), knownAfter = new Set(after.map(row => row.kind));
  let omission = oldOmission.present ? oldOmission : newOmission;
  if (oldOmission.present && (newOmission.present || after.some(row => !knownBefore.has(row.kind))) ||
    newOmission.present && before.some(row => !knownAfter.has(row.kind))) omission = {present:true, count:null};
  const merged = new Map([...before, ...after].map(row => [row.kind, row]));
  return boundActivityRows([...merged.values()], omission, budget);
}

/** Reconcile a completed authoritative snapshot, rather than appending a replay
 * of its earlier events. Final kinds keep canonical order and latest values;
 * current-only observations stay beside their closest shared anchor. A bounded
 * prior history cannot prove which discarded kinds overlap the final snapshot. */
export function reconcileAssistantActivity(current = [], finalSnapshot = [], {budget = ASSISTANT_ACTIVITY_BYTES} = {}) {
  const before = activityRows(current), final = activityRows(finalSnapshot);
  const finalKinds = new Set(final.map(row => row.kind)), streamedOnly = before.filter(row => !finalKinds.has(row.kind));
  const beforeAnchor = new Map(), afterAnchor = new Map(), unanchored = [];
  function anchor(map, kind, row) {const group = map.get(kind) || []; group.push(row); map.set(kind, group);}
  for (let index = 0; index < before.length; index++) {
    const row = before[index];
    if (finalKinds.has(row.kind)) continue;
    let previous = index - 1, next = index + 1;
    while (previous >= 0 && !finalKinds.has(before[previous].kind)) previous--;
    while (next < before.length && !finalKinds.has(before[next].kind)) next++;
    if (previous >= 0 && (next === before.length || index - previous <= next - index)) anchor(afterAnchor, before[previous].kind, row);
    else if (next < before.length) anchor(beforeAnchor, before[next].kind, row);
    else unanchored.push(row);
  }
  const ordered = final.flatMap(row => [...(beforeAnchor.get(row.kind) || []), row, ...(afterAnchor.get(row.kind) || [])]);
  ordered.push(...unanchored);
  const omittedBefore = omissionMetadata(current), omittedFinal = omissionMetadata(finalSnapshot);
  // Use one stable marker for abbreviated reconciliation, including the first
  // final snapshot. Without discarded identities, a subsequent replay cannot
  // establish exact overlap; do not change a numeric claim on every replay.
  const omission = omittedBefore.present || omittedFinal.present || ordered.length > MAX_ASSISTANT_ACTIVITY
    ? {present:true, count:null} : {present:false, count:0};
  return boundActivityRows(ordered, omission, budget, new Set(streamedOnly.map(row => row.kind)), true);
}

/** Input must already have passed the caller's field allowlist. Retain complete
 * recent turns and budget UTF-8 bytes, not JavaScript character count. */
export function boundedConversationMessages(messages, {budget = ASSISTANT_CONVERSATION_BYTES} = {}) {
  if (!Number.isInteger(budget) || budget < 1000 || budget > ASSISTANT_CONVERSATION_BYTES) throw new RangeError('Invalid conversation byte budget.');
  if (!Array.isArray(messages)) return [];
  const result = [...messages];
  while ((storedBytes(result) > budget || result.length > 24) && result.length > 1) {
    const nextUser = result.findIndex((message, index) => index > 0 && message?.role === 'user');
    if (nextUser > 0) result.splice(0, nextUser);
    else break;
  }
  if (storedBytes(result) > budget || result.length > 24) throw new RangeError('The latest conversation turn exceeds its storage budget.');
  return result;
}
