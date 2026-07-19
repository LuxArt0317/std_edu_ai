function normalized(value) {
  return String(value || "").normalize("NFKC").trim().toLocaleLowerCase("en").replace(/[\s_-]+/g, " ");
}

function withinHours(edge, clock) {
  if (!edge.opens_at && !edge.closes_at) return true;
  if (!edge.opens_at || !edge.closes_at) return false;
  const current = clock.slice(0, 5);
  const opens = edge.opens_at.slice(0, 5);
  const closes = edge.closes_at.slice(0, 5);
  return opens <= closes ? current >= opens && current < closes : current >= opens || current < closes;
}

export function resolvePlace(query, places, aliases) {
  const target = normalized(query);
  if (!target) return {status: "missing", matches: []};
  const aliasesByPlace = new Map();
  for (const alias of aliases) {
    const list = aliasesByPlace.get(alias.place_id) || [];
    list.push(normalized(alias.alias));
    aliasesByPlace.set(alias.place_id, list);
  }
  const scored = places.flatMap((place) => {
    const names = [place.code, place.name_zh, place.name_en, place.room, ...(aliasesByPlace.get(place.id) || [])].filter(Boolean).map(normalized);
    const exact = names.some((name) => name === target);
    const prefix = names.some((name) => name.startsWith(target) || target.startsWith(name));
    const contains = names.some((name) => name.includes(target) || target.includes(name));
    const score = exact ? 3 : prefix ? 2 : contains ? 1 : 0;
    return score ? [{place, score}] : [];
  }).sort((a, b) => b.score - a.score || a.place.code.localeCompare(b.place.code));
  if (!scored.length) return {status: "not_found", matches: []};
  const best = scored[0].score;
  const matches = scored.filter((item) => item.score === best).map((item) => item.place);
  return matches.length === 1 ? {status: "resolved", place: matches[0], matches} : {status: "ambiguous", matches};
}

export function calculateCampusRoute({originPlaceId, destinationPlaceId, nodes, edges, wheelchair = false, clock = "12:00"}) {
  if (originPlaceId === destinationPlaceId) return {status: "same_place", steps: [], distanceMeters: 0, estimatedSeconds: 0};
  const activeNodes = new Map(nodes.filter((node) => node.active).map((node) => [node.id, node]));
  const starts = nodes.filter((node) => node.active && node.place_id === originPlaceId).map((node) => node.id);
  const destinations = new Set(nodes.filter((node) => node.active && node.place_id === destinationPlaceId).map((node) => node.id));
  if (!starts.length || !destinations.size) return {status: "unmapped", steps: []};
  const adjacency = new Map();
  const add = (from, to, edge, reverse) => {
    const list = adjacency.get(from) || [];
    list.push({to, edge, reverse});
    adjacency.set(from, list);
  };
  for (const edge of edges) {
    if (edge.status !== "active" || !edge.verified_at || !activeNodes.has(edge.from_node_id) || !activeNodes.has(edge.to_node_id)) continue;
    if (wheelchair && (!edge.wheelchair_suitable || edge.traversal_type === "stairs")) continue;
    if (!withinHours(edge, clock)) continue;
    add(edge.from_node_id, edge.to_node_id, edge, false);
    if (edge.bidirectional) add(edge.to_node_id, edge.from_node_id, edge, true);
  }
  const distance = new Map();
  const previous = new Map();
  const queue = [];
  for (const id of starts) { distance.set(id, 0); queue.push({id, cost: 0}); }
  let target = null;
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
    const current = queue.shift();
    if (current.cost !== distance.get(current.id)) continue;
    if (destinations.has(current.id)) { target = current.id; break; }
    for (const connection of adjacency.get(current.id) || []) {
      const cost = current.cost + connection.edge.estimated_seconds;
      if (cost >= (distance.get(connection.to) ?? Number.POSITIVE_INFINITY)) continue;
      distance.set(connection.to, cost);
      previous.set(connection.to, {from: current.id, ...connection});
      queue.push({id: connection.to, cost});
    }
  }
  if (!target) return {status: "unreachable", steps: []};
  const steps = [];
  let cursor = target;
  while (!starts.includes(cursor)) {
    const item = previous.get(cursor);
    if (!item) return {status: "unreachable", steps: []};
    const edge = item.edge;
    steps.push({
      edgeId: edge.id,
      fromNodeId: item.from,
      toNodeId: cursor,
      distanceMeters: Number(edge.distance_m),
      estimatedSeconds: edge.estimated_seconds,
      environment: edge.environment,
      traversalType: edge.traversal_type,
      wheelchairSuitable: edge.wheelchair_suitable,
      instructionZh: item.reverse ? edge.instruction_reverse_zh : edge.instruction_zh,
      instructionEn: item.reverse ? edge.instruction_reverse_en : edge.instruction_en,
    });
    cursor = item.from;
  }
  steps.reverse();
  return {
    status: "routed",
    steps,
    distanceMeters: Math.round(steps.reduce((total, step) => total + step.distanceMeters, 0)),
    estimatedSeconds: steps.reduce((total, step) => total + step.estimatedSeconds, 0),
  };
}
