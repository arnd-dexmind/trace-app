import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TopNav } from "./components/TopNav";
import { OperatorConsole } from "./pages/OperatorConsole";
import { ItemSearch } from "./pages/ItemSearch";
import { ItemDetail } from "./pages/ItemDetail";
import { RepairList } from "./pages/RepairList";
import { getSpaceId } from "./api";

export function App() {
  const spaceId = getSpaceId();

  return (
    <BrowserRouter>
      <TopNav />
      <Routes>
        <Route
          path="/"
          element={
            spaceId ? (
              <Navigate to="/review" replace />
            ) : (
              <Navigate to="/items" replace />
            )
          }
        />
        <Route path="/review" element={<OperatorConsole />} />
        <Route path="/items" element={<ItemSearch />} />
        <Route path="/items/:itemId" element={<ItemDetail />} />
        <Route path="/repairs" element={<RepairList />} />
      </Routes>
    </BrowserRouter>
  );
}
