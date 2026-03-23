import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Settings from "@/pages/Settings";
import Collection from "@/pages/Collection";
import Capture from "@/pages/Capture";
import Quiz from "@/pages/Quiz";
import KanjiList from "@/pages/KanjiList";
import Dictionary from "@/pages/Dictionary";
import AddKanji from "@/pages/AddKanji";

export default function App() {
  const { user, isLoading } = useAuth();

  return (
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
