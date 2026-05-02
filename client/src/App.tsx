import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { TopNav } from "./components/TopNav";
import { GuidedTour } from "./components/GuidedTour";
import { useOnboarding } from "./hooks/useOnboarding";
import { Dashboard } from "./pages/Dashboard";
import { OperatorConsole } from "./pages/OperatorConsole";
import { ItemSearch } from "./pages/ItemSearch";
import { ItemDetail } from "./pages/ItemDetail";
import { RepairList } from "./pages/RepairList";
import { RepairDetail } from "./pages/RepairDetail";
import { Upload } from "./pages/Upload";
import { Capture } from "./pages/Capture";
import { Processing } from "./pages/Processing";
import { Results } from "./pages/Results";
import { ItemDetailEdit } from "./pages/ItemDetailEdit";
import { Spaces } from "./pages/Spaces";
import { Welcome } from "./pages/Welcome";

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    status,
    loading,
    isFirstRun,
    showTour,
    advanceStep,
    finishTour,
    dismiss,
  } = useOnboarding();

  const isWelcomePage = location.pathname === "/welcome";

  useEffect(() => {
    if (loading) return;
    if (isFirstRun && !isWelcomePage) {
      navigate("/welcome", { replace: true });
    }
  }, [loading, isFirstRun, isWelcomePage, navigate]);

  if (loading) {
    return (
      <div style={loadingShell}>
        <div style={spinner} />
      </div>
    );
  }

  if (isWelcomePage) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      {showTour && status && (
        <GuidedTour
          currentStep={status.tourCurrentStep}
          onNext={advanceStep}
          onDismiss={dismiss}
          onFinish={finishTour}
        />
      )}
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <OnboardingGate>
        <TopNav />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/spaces" element={<Spaces />} />
          <Route path="/review" element={<OperatorConsole />} />
          <Route path="/items" element={<ItemSearch />} />
          <Route path="/items/:itemId" element={<ItemDetail />} />
          <Route path="/repairs" element={<RepairList />} />
          <Route path="/repairs/:repairId" element={<RepairDetail />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/capture" element={<Capture />} />
          <Route path="/processing/:walkthroughId" element={<Processing />} />
          <Route path="/results/:walkthroughId" element={<Results />} />
          <Route path="/results/:walkthroughId/items/:itemId" element={<ItemDetailEdit />} />
        </Routes>
      </OnboardingGate>
    </BrowserRouter>
  );
}

const loadingShell: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
};

const spinner: React.CSSProperties = {
  width: 32,
  height: 32,
  border: "3px solid var(--sm-border-default)",
  borderTopColor: "var(--sm-brand-600)",
  borderRadius: "50%",
  animation: "spin 0.8s linear infinite",
};
