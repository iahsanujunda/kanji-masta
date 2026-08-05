import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "@/hooks/useAuth";
import { useCaptureQueue } from "@/hooks/useCaptureQueue";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLaunchScreen from "@/components/AppLaunchScreen";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import { preloadAuthenticatedRoutes, routeImports } from "@/lib/routePreloading";

// Lazy load non-critical routes
const Settings = lazy(routeImports.settings);
const Collection = lazy(routeImports.collection);
const Capture = lazy(routeImports.capture);
const Quiz = lazy(routeImports.quiz);
const KanjiList = lazy(routeImports.kanjiList);
const Dictionary = lazy(routeImports.dictionary);
const WordDetail = lazy(routeImports.wordDetail);
const AddKanji = lazy(routeImports.addKanji);
const Onboarding = lazy(routeImports.onboarding);
const Signup = lazy(() => import("@/pages/Signup"));
const Landing = lazy(() => import("@/pages/Landing"));
const Admin = lazy(routeImports.admin);
const InsightDetail = lazy(routeImports.insightDetail);
const LocalCaptureDetail = lazy(routeImports.localCaptureDetail);
const CaptureQueue = lazy(routeImports.captureQueue);
const ScanDetail = lazy(routeImports.scanDetail);

function Loading() {
  return (
    <Box sx={{ minHeight: "var(--app-height)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <CircularProgress />
    </Box>
  );
}

export default function App() {
  const { user, isLoading, status } = useAuth();
  useCaptureQueue(user?.id);

  useEffect(() => {
    if (status !== "authenticated") return;
    const windowWithIdleCallback = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (windowWithIdleCallback.requestIdleCallback) {
      const handle = windowWithIdleCallback.requestIdleCallback(
        () => { void preloadAuthenticatedRoutes(); },
        { timeout: 1_500 },
      );
      return () => windowWithIdleCallback.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(() => { void preloadAuthenticatedRoutes(); }, 0);
    return () => window.clearTimeout(handle);
  }, [status]);

  if (status === "initializing") return <AppLaunchScreen />;

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route
          path="/"
          element={user ? <Navigate to="/home" replace /> : <Landing />}
        />
        <Route
          path="/login"
          element={user ? <Navigate to="/home" replace /> : <Login />}
        />
        <Route
          path="/signup"
          element={user ? <Navigate to="/home" replace /> : <Signup />}
        />
        <Route
          path="/home"
          element={
            <ProtectedRoute user={user} isLoading={isLoading}>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute user={user} isLoading={isLoading}>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/collection"
          element={
            <ProtectedRoute user={user} isLoading={isLoading}>
              <Collection />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quiz"
          element={
            <ProtectedRoute user={user} isLoading={isLoading}>
              <Quiz />
            </ProtectedRoute>
          }
        />
        <Route
          path="/capture"
          element={
            <ProtectedRoute user={user} isLoading={isLoading}>
              <Capture />
            </ProtectedRoute>
          }
        />
        <Route
          path="/captures"
          element={
            <ProtectedRoute user={user} isLoading={isLoading}>
              <CaptureQueue />
            </ProtectedRoute>
          }
        />
        <Route
          path="/captures/:clientCaptureId"
          element={
            <ProtectedRoute user={user} isLoading={isLoading}>
              <LocalCaptureDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scans/:sessionId"
          element={
            <ProtectedRoute user={user} isLoading={isLoading}>
              <ScanDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/collection/list"
          element={
            <ProtectedRoute user={user} isLoading={isLoading}>
              <KanjiList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dictionary"
          element={
            <ProtectedRoute user={user} isLoading={isLoading}>
              <Dictionary />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dictionary/:id"
          element={
            <ProtectedRoute user={user} isLoading={isLoading}>
              <WordDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/kanji/add"
          element={
            <ProtectedRoute user={user} isLoading={isLoading}>
              <AddKanji />
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute user={user} isLoading={isLoading}>
              <Onboarding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute user={user} isLoading={isLoading}>
              <Admin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/insights/:id"
          element={
            <ProtectedRoute user={user} isLoading={isLoading}>
              <InsightDetail />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Suspense>
  );
}
