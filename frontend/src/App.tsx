import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Home from "@/pages/Home";
import Login from "@/pages/Login";

// Lazy load non-critical routes
const Settings = lazy(() => import("@/pages/Settings"));
const Collection = lazy(() => import("@/pages/Collection"));
const Capture = lazy(() => import("@/pages/Capture"));
const Quiz = lazy(() => import("@/pages/Quiz"));
const KanjiList = lazy(() => import("@/pages/KanjiList"));
const Dictionary = lazy(() => import("@/pages/Dictionary"));
const AddKanji = lazy(() => import("@/pages/AddKanji"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));

function Loading() {
  return (
    <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <CircularProgress />
    </Box>
  );
}

export default function App() {
  const { user, isLoading } = useAuth();

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/"
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
