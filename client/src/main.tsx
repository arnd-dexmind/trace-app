import { createRoot } from "react-dom/client";
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";
import { App } from "./App";
import "./index.css";

function sendMetric(metric: Metric) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
  });
  navigator.sendBeacon("/api/metrics", body);
}

onCLS(sendMetric);
onFCP(sendMetric);
onINP(sendMetric);
onLCP(sendMetric);
onTTFB(sendMetric);

createRoot(document.getElementById("root")!).render(<App />);
