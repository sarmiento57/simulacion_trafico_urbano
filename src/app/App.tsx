import { SimulationCanvas } from "./components/SimulationCanvas";
import { ControlPanel, SimulationSettings, SimulationStats } from "./components/ControlPanel";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useState } from "react";

export default function App() {
  const [settings, setSettings] = useState<SimulationSettings>({
    targetVehicles: 46,
    speedMultiplier: 1,
    lightDuration: 8,
    selectedVehicleType: "random",
    externalRoutes: true,
  });
  const [stats, setStats] = useState<SimulationStats>({
    totalVehicles: 0,
    sedans: 0,
    motorcycles: 0,
    cargo: 0,
    buses: 0,
    trafficLights: 0,
    congestion: 0,
  });

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex h-screen bg-gray-900">
        <div className="flex-1 relative">
          <SimulationCanvas settings={settings} onStatsChange={setStats} />
        </div>
        <ControlPanel settings={settings} stats={stats} onSettingsChange={setSettings} />
      </div>
    </DndProvider>
  );
}
