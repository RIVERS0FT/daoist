const PATHS: Record<string, string> = {
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16',
  bike: 'M8 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm16 0a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 17l5-9 5 9H4m5-9h8l3 9M7 5h4m4-2h3l1 5',
  home: 'm3 10 9-7 9 7v11H3Zm6 11v-8h6v8',
  moon: 'M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z',
  users: 'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm5-4a4 4 0 0 1 0 8m1 4a4 4 0 0 1 3 4v3',
  spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3ZM3 2v4m-2-2h4',
  more: 'M4 5h16M4 12h16M4 19h16',
  book: 'M12 5C9 3 5 3 2 4v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v16',
  wallet: 'M21 8V4H3v16h18V8ZM3 8h18m0 4h-6v5h6m-3-3h.01',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  close: 'm6 6 12 12M6 18 18 6', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  focus: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3',
  leaf: 'M20 3C4 1 0 12 6 18s18 0 14-15ZM5 21l11-12',
  shop: 'M3 10v11h18V10M2 10l2-7h16l2 7M2 10c2 3 4 3 6 0 2 3 6 3 8 0 2 3 4 3 6 0M9 21v-7h6v7',
  hospital: 'M4 21V5h16v16ZM12 8v6m-3-3h6M9 21v-4h6v4',
  mountain: 'm1 21 8-15 5 8 3-5 6 12H1Zm5-9 3 2 3-2',
  battery: 'M3 6h16v12H3Zm19 3v6M7 9v6m4-6v6m4-6v6',
  building: 'M4 21V3h12v18M16 9h5v12H4M8 7h4m-4 4h4m-4 4h4',
  arrow: 'M4 12h16m-6-6 6 6-6 6', flag: 'M5 22V2h15l-3 5 3 5H5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 3v6l4 2',
  heart: 'M12 21 3 12a6 6 0 0 1 9-8 6 6 0 0 1 9 8Z',
};
export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="-1 -1 26 26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name] ?? PATHS.spark} /></svg>;
}
