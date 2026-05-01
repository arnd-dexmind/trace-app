import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TopNav } from "./components/TopNav";
import { Dashboard } from "./pages/Dashboard";
import { OperatorConsole } from "./pages/OperatorConsole";
import { ItemSearch } from "./pages/ItemSearch";
import { ItemDetail } from "./pages/ItemDetail";
import { RepairList } from "./pages/RepairList";
import { RepairDetail } from "./pages/RepairDetail";
import { Upload } from "./pages/Upload";
import { Capture } from "./pages/Capture";
import { Results } from "./pages/Results";
import { Spaces } from "./pages/Spaces";

export function App() {
  return (
    <BrowserRouter>
      <TopNav />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/spaces" element={<Spaces />} />
        <Route path="/review" element={<OperatorConsole />} />
        <Route path="/items" element={<ItemSearch />} />
        <Route path="/items/:itemId" element={<ItemDetail />} />
        <Route path="/repairs" element={<RepairList />} />
        <Route path="/repairs/:repairId" element={<RepairDetail />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/capture" element={<Capture />} />
        <Route path="/results/:walkthroughId" element={<Results />} />
      </Routes>
    </BrowserRouter>
  );
}
