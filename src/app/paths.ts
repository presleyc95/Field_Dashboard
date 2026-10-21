/** Links between pages. IDs are encoded because permit IDs can contain `#`, `/` and spaces. */
export const permitPath = (id: string) => `/permit/${encodeURIComponent(id)}`;
export const personPath = (name: string) => `/people/${encodeURIComponent(name)}`;
export const opcoPath = (opco: string) => `/projects/${encodeURIComponent(opco)}`;
/** Umbrellas get their own path: "Oncor" and "Entergy" share names with OPCOs. */
export const umbrellaPath = (umbrella: string) => `/projects/umbrella/${encodeURIComponent(umbrella)}`;
export const hitchPath = (hitchId: number) => `/hitches?h=${hitchId}`;
export const searchPath = (query: string) => `/search?q=${encodeURIComponent(query)}`;
