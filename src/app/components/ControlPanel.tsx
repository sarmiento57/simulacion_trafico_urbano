import { Dispatch, SetStateAction } from "react";
import { useDrag } from "react-dnd";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Car, TrafficCone, Plus, Settings, Zap, CircleDot, BarChart3 } from "lucide-react";

export type VehicleSelection = "random" | "sedan" | "motorcycle" | "cargo" | "bus";

export interface SimulationSettings {
  targetVehicles: number;
  speedMultiplier: number;
  lightDuration: number;
  selectedVehicleType: VehicleSelection;
  externalRoutes: boolean;
}

export interface SimulationStats {
  totalVehicles: number;
  sedans: number;
  motorcycles: number;
  cargo: number;
  buses: number;
  trafficLights: number;
  congestion: number;
}

interface ControlPanelProps {
  settings: SimulationSettings;
  stats: SimulationStats;
  onSettingsChange: Dispatch<SetStateAction<SimulationSettings>>;
}

function DraggableCar() {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: "car",
    item: { type: "car" },
    collect: (monitor) => ({ isDragging: !!monitor.isDragging() }),
  }));

  return (
    <div
      ref={drag}
      className={`cursor-move p-3 border-2 border-dashed border-blue-500 bg-blue-500/10 rounded-lg transition-opacity ${
        isDragging ? "opacity-50" : "opacity-100"
      }`}
    >
      <div className="flex items-center gap-2 text-blue-400">
        <Car className="size-5" />
        <span className="text-sm">Arrastrar vehiculo</span>
      </div>
    </div>
  );
}

function DraggableTrafficLight() {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: "trafficLight",
    item: { type: "trafficLight" },
    collect: (monitor) => ({ isDragging: !!monitor.isDragging() }),
  }));

  return (
    <div
      ref={drag}
      className={`cursor-move p-3 border-2 border-dashed border-amber-500 bg-amber-500/10 rounded-lg transition-opacity ${
        isDragging ? "opacity-50" : "opacity-100"
      }`}
    >
      <div className="flex items-center gap-2 text-amber-400">
        <CircleDot className="size-5" />
        <span className="text-sm">Arrastrar semaforo</span>
      </div>
    </div>
  );
}

export function ControlPanel({ settings, stats, onSettingsChange }: ControlPanelProps) {
  const update = (patch: Partial<SimulationSettings>) => onSettingsChange((prev) => ({ ...prev, ...patch }));

  return (
    <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-white flex items-center gap-2">
          <Settings className="size-5" />
          Panel de control
        </h2>
      </div>

      <div className="flex-1 p-4 space-y-5">
        <Card className="bg-gray-900 border-gray-700 p-4">
          <h3 className="text-white mb-3 flex items-center gap-2">
            <BarChart3 className="size-4" />
            Conteo de vehiculos
          </h3>
          <div className="space-y-2 text-sm text-gray-300">
            <div className="flex justify-between"><span>Total:</span><span>{stats.totalVehicles}</span></div>
            <div className="flex justify-between"><span>Sedanes:</span><span>{stats.sedans}</span></div>
            <div className="flex justify-between"><span>Motos:</span><span>{stats.motorcycles}</span></div>
            <div className="flex justify-between"><span>Carga:</span><span>{stats.cargo}</span></div>
            <div className="flex justify-between"><span>Buses:</span><span>{stats.buses}</span></div>
            <div className="flex justify-between"><span>Semaforos:</span><span>{stats.trafficLights}</span></div>
            <div className="flex justify-between"><span>Congestion:</span><span>{stats.congestion}%</span></div>
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-700 p-4">
          <h3 className="text-white mb-3 flex items-center gap-2">
            <Plus className="size-4" />
            Agregar elementos
          </h3>
          <div className="space-y-3">
            <DraggableCar />
            <DraggableTrafficLight />
          </div>
          <p className="text-xs text-gray-400 mt-3">Tambien puedes tocar un semaforo en el mapa para cambiar su color.</p>
        </Card>

        <Separator className="bg-gray-700" />

        <Card className="bg-gray-900 border-gray-700 p-4">
          <h3 className="text-white mb-3 flex items-center gap-2">
            <Zap className="size-4" />
            Flujo y velocidad
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-gray-300">Vehiculos activos</label>
                <Badge variant="secondary">{settings.targetVehicles}</Badge>
              </div>
              <Slider
                value={[settings.targetVehicles]}
                onValueChange={([value]) => update({ targetVehicles: value })}
                min={5}
                max={90}
                step={1}
                className="w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => update({ targetVehicles: Math.max(0, settings.targetVehicles - 5) })}>
                Disminuir
              </Button>
              <Button size="sm" variant="outline" onClick={() => update({ targetVehicles: settings.targetVehicles + 5 })}>
                Aumentar
              </Button>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-gray-300">Velocidad</label>
                <Badge variant="secondary">{settings.speedMultiplier.toFixed(1)}x</Badge>
              </div>
              <Slider
                value={[settings.speedMultiplier]}
                onValueChange={([value]) => update({ speedMultiplier: value })}
                min={0.3}
                max={2.5}
                step={0.1}
                className="w-full"
              />
            </div>
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-700 p-4">
          <h3 className="text-white mb-3 flex items-center gap-2">
            <Car className="size-4" />
            Vehiculos y rutas
          </h3>
          <div className="space-y-3">
            <label className="text-sm text-gray-300">Tipo de vehiculo</label>
            <select
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-md px-3 py-2 text-sm"
              value={settings.selectedVehicleType}
              onChange={(event) => update({ selectedVehicleType: event.target.value as VehicleSelection })}
            >
              <option value="random">Aleatorio</option>
              <option value="sedan">Sedan</option>
              <option value="motorcycle">Moto</option>
              <option value="cargo">Transporte de carga</option>
              <option value="bus">Bus / colectivo</option>
            </select>
            <Button
              size="sm"
              variant={settings.externalRoutes ? "secondary" : "outline"}
              className="w-full"
              onClick={() => update({ externalRoutes: !settings.externalRoutes })}
            >
              Rutas extraoficiales: {settings.externalRoutes ? "activas" : "inactivas"}
            </Button>
            <p className="text-xs text-gray-400">La direccion de circulacion se calcula por carril y por ruta.</p>
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-700 p-4">
          <h3 className="text-white mb-3 flex items-center gap-2">
            <TrafficCone className="size-4" />
            Semaforos
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-gray-300">Tiempo rojo/verde</label>
                <Badge variant="secondary">{settings.lightDuration}s</Badge>
              </div>
              <Slider
                value={[settings.lightDuration]}
                onValueChange={([value]) => update({ lightDuration: value })}
                min={4}
                max={30}
                step={1}
                className="w-full"
              />
            </div>
            <div className="flex gap-2 items-center">
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500" /><span className="text-xs text-gray-400">Rojo</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-yellow-500" /><span className="text-xs text-gray-400">Amarillo</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-green-500" /><span className="text-xs text-gray-400">Verde</span></div>
            </div>
          </div>
        </Card>

        <Card className="bg-gray-900 border-gray-700 p-4">
          <h3 className="text-white mb-3">Informacion</h3>
          <div className="space-y-2 text-sm text-gray-300">
            <div className="flex justify-between"><span>Intersecciones:</span><span className="text-gray-400">9 principales</span></div>
            <div className="flex justify-between"><span>Vias:</span><span className="text-gray-400">6 principales</span></div>
            <div className="flex justify-between"><span>Reinicio:</span><span className="text-gray-400">boton del mapa</span></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
