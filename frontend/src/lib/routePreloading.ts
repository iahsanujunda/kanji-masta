type RouteImporter = () => Promise<unknown>;

export const routeImports = {
  settings: () => import("@/pages/Settings"),
  collection: () => import("@/pages/Collection"),
  capture: () => import("@/pages/Capture"),
  quiz: () => import("@/pages/Quiz"),
  kanjiList: () => import("@/pages/KanjiList"),
  dictionary: () => import("@/pages/Dictionary"),
  wordDetail: () => import("@/pages/WordDetail"),
  addKanji: () => import("@/pages/AddKanji"),
  onboarding: () => import("@/pages/Onboarding"),
  admin: () => import("@/pages/Admin"),
  insightDetail: () => import("@/pages/InsightDetail"),
  localCaptureDetail: () => import("@/pages/LocalCaptureDetail"),
  captureQueue: () => import("@/pages/CaptureQueue"),
  captureGallery: () => import("@/pages/CaptureGallery"),
  captureDetail: () => import("@/pages/CaptureDetail"),
  scanDetail: () => import("@/pages/ScanDetail"),
};

const commonAuthenticatedRoutes: RouteImporter[] = [
  routeImports.collection,
  routeImports.capture,
  routeImports.dictionary,
  routeImports.captureGallery,
  routeImports.settings,
];

export async function preloadAuthenticatedRoutes(
  importers: RouteImporter[] = commonAuthenticatedRoutes,
): Promise<void> {
  await Promise.allSettled(importers.map((loadRoute) => loadRoute()));
}
