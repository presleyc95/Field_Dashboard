/** Links between pages. IDs are encoded because permit IDs can contain `#`, `/` and spaces. */
export const permitPath = (id: string) => `/permit/${encodeURIComponent(id)}`;
export const personPath = (name: string) => `/people/${encodeURIComponent(name)}`;
export const opcoPath = (opco: string) => `/projects/${encodeURIComponent(opco)}`;
export const hitchPath = (hitchId: number) => `/hitches?h=${hitchId}`;
export const searchPath = (query: string) => `/search?q=${encodeURIComponent(query)}`;
