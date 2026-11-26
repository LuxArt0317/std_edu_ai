// Kept outside the dispatch function so non-Vite consumers retain safe defaults.
export function unifiedAssistantDiscoveryEnabled(){return import.meta.env?.VITE_ASSISTANT_UNIFIED_DISCOVERY==='true';}
