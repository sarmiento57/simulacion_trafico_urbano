import { useRef, useEffect, useState } from "react";
import { useDrop } from "react-dnd";
import { Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { SimulationSettings, SimulationStats } from "./ControlPanel";

type Direction = "right" | "left" | "up" | "down";
type Orientation = "horizontal" | "vertical";
type RoadKind = "main" | "local";
type VehicleType = "sedan" | "motorcycle" | "cargo" | "bus";

interface Car {
  id: string;
  x: number;
  y: number;
  color: string;
  speed: number;
  direction: Direction;
  lane: number;
  roadId: string;
  vehicleType: VehicleType;
  turnCooldown?: number;
  crashed?: boolean;
  crashedUntil?: number;
}

interface TrafficLight {
  id: string;
  x: number;
  y: number;
  controlX?: number;
  controlY?: number;
  controlsOrientation?: Orientation;
  state: "red" | "yellow" | "green";
  timeRemaining: number;
}

interface RoadSegment {
  id: string;
  orientation: Orientation;
  center: number;
  start: number;
  end: number;
  width: number;
  kind: RoadKind;
  direction?: Direction;
  name?: string;
}

interface CityBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  col: number;
  row: number;
}

const MAIN_ROAD_WIDTH = 78;
const LOCAL_ROAD_WIDTH = 18;
const MAIN_LANE_OFFSETS: Record<Direction, number[]> = {
  right: [-25, -11],
  left: [11, 25],
  down: [-25, -11],
  up: [11, 25],
};
const VEHICLE_COLORS = ["#2563EB", "#DC2626", "#059669", "#D97706", "#7C3AED", "#DB2777", "#0891B2", "#EA580C"];
const VEHICLE_TYPES: VehicleType[] = ["sedan", "motorcycle", "cargo", "bus"];

const MAIN_AVENUES = ["Alameda Juan Pablo II", "Bulevar de Los Heroes", "Av. Masferrer"];
const MAIN_STREETS = ["Calle Arce", "Paseo General Escalon", "Carretera Panamericana"];
const EXTRA_AVENUES = [
  "Alameda Roosevelt",
  "Bulevar Mons. Romero",
  "Av. Olimpica",
  "Av. Bernal",
  "Av. La Capilla",
  "Av. Las Camelias",
  "Av. Espana",
];

const yellowDuration = 3;

const getMainCenters = (size: number) => [size * 0.25, size * 0.5, size * 0.75];

const getNextLightState = (state: TrafficLight["state"]) => {
  if (state === "green") return "yellow";
  if (state === "yellow") return "red";
  return "green";
};

const laneOffset = (road: RoadSegment, direction: Direction, lane: number) =>
  road.kind === "local" ? 0 : MAIN_LANE_OFFSETS[direction][lane % 2];

const directionForRoad = (road: RoadSegment, preferred: Direction, lane: number): Direction => {
  if (road.kind === "local" && road.direction) return road.direction;
  if (road.orientation === "horizontal") return preferred === "left" || lane === 1 ? "left" : "right";
  return preferred === "up" || lane === 1 ? "up" : "down";
};

const createBlocks = (width: number, height: number): CityBlock[] => {
  const avenues = getMainCenters(width);
  const streets = getMainCenters(height);
  const xs = [0, ...avenues.map((x) => x + MAIN_ROAD_WIDTH / 2)];
  const xe = [...avenues.map((x) => x - MAIN_ROAD_WIDTH / 2), width];
  const ys = [0, ...streets.map((y) => y + MAIN_ROAD_WIDTH / 2)];
  const ye = [...streets.map((y) => y - MAIN_ROAD_WIDTH / 2), height];
  const blocks: CityBlock[] = [];

  for (let col = 0; col < xs.length; col += 1) {
    for (let row = 0; row < ys.length; row += 1) {
      const block = {
        x: xs[col] + 8,
        y: ys[row] + 8,
        width: xe[col] - xs[col] - 16,
        height: ye[row] - ys[row] - 16,
        col,
        row,
      };
      if (block.width > 58 && block.height > 58) blocks.push(block);
    }
  }

  return blocks;
};

const createRoadNetwork = (width: number, height: number): RoadSegment[] => {
  const avenues = getMainCenters(width);
  const streets = getMainCenters(height);
  return [
    ...avenues.map((center, index) => ({
      id: `main-avenue-${index}`,
      orientation: "vertical" as const,
      center,
      start: 0,
      end: height,
      width: MAIN_ROAD_WIDTH,
      kind: "main" as const,
      name: MAIN_AVENUES[index],
    })),
    ...streets.map((center, index) => ({
      id: `main-street-${index}`,
      orientation: "horizontal" as const,
      center,
      start: 0,
      end: width,
      width: MAIN_ROAD_WIDTH,
      kind: "main" as const,
      name: MAIN_STREETS[index],
    })),
  ];
};

const createTrafficLights = (width: number, height: number, lightDuration: number): TrafficLight[] => {
  const avenues = getMainCenters(width);
  const streets = getMainCenters(height);
  return avenues.flatMap((x, avenueIndex) =>
    streets.flatMap((y, streetIndex) => {
      const horizontalGreen = (avenueIndex + streetIndex) % 2 === 0;
      const corners = [
        { x: x - MAIN_ROAD_WIDTH / 2 - 10, y: y - MAIN_ROAD_WIDTH / 2 - 10, controlsOrientation: "horizontal" as const },
        { x: x + MAIN_ROAD_WIDTH / 2 + 10, y: y - MAIN_ROAD_WIDTH / 2 - 10, controlsOrientation: "vertical" as const },
        { x: x - MAIN_ROAD_WIDTH / 2 - 10, y: y + MAIN_ROAD_WIDTH / 2 + 10, controlsOrientation: "vertical" as const },
        { x: x + MAIN_ROAD_WIDTH / 2 + 10, y: y + MAIN_ROAD_WIDTH / 2 + 10, controlsOrientation: "horizontal" as const },
      ];
      return corners.map((corner, cornerIndex) => ({
        id: `light-${avenueIndex}-${streetIndex}-${cornerIndex}`,
        x: corner.x,
        y: corner.y,
        controlX: x,
        controlY: y,
        controlsOrientation: corner.controlsOrientation,
        state: corner.controlsOrientation === "horizontal" ? (horizontalGreen ? "green" : "red") : horizontalGreen ? "red" : "green",
        timeRemaining: corner.controlsOrientation === "horizontal" ? (horizontalGreen ? lightDuration : lightDuration) : lightDuration,
      }));
    })
  );
};

const findRoad = (roads: RoadSegment[], id: string) => roads.find((road) => road.id === id) ?? roads[0];

const placeCar = (car: Car, road: RoadSegment, progress: number, direction: Direction, lane: number): Car => {
  const offset = laneOffset(road, direction, lane);
  if (road.orientation === "horizontal") {
    return { ...car, x: progress, y: road.center + offset, roadId: road.id, direction, lane };
  }
  return { ...car, x: road.center + offset, y: progress, roadId: road.id, direction, lane };
};

const makeCar = (
  id: string,
  road: RoadSegment,
  progress: number,
  seed: number,
  selectedVehicleType: SimulationSettings["selectedVehicleType"] = "random"
): Car => {
  const lane = road.kind === "main" ? seed % 2 : 0;
  const fallback: Direction = road.orientation === "horizontal" ? (seed % 2 === 0 ? "right" : "left") : seed % 2 === 0 ? "down" : "up";
  const direction = directionForRoad(road, fallback, lane);
  return placeCar(
    {
      id,
      x: 0,
      y: 0,
      color: VEHICLE_COLORS[seed % VEHICLE_COLORS.length],
      speed: road.kind === "main" ? 0.85 + (seed % 5) * 0.14 : 0.58 + (seed % 4) * 0.1,
      direction,
      lane,
      roadId: road.id,
      vehicleType: selectedVehicleType === "random" ? VEHICLE_TYPES[seed % VEHICLE_TYPES.length] : selectedVehicleType,
    },
    road,
    progress,
    direction,
    lane
  );
};

const respawnCar = (car: Car, roads: RoadSegment[]): Car => {
  const road = roads[Math.floor(Math.random() * roads.length)];
  const lane = road.kind === "main" ? Math.floor(Math.random() * 2) : 0;
  const fallback: Direction =
    road.orientation === "horizontal" ? (Math.random() > 0.5 ? "right" : "left") : Math.random() > 0.5 ? "down" : "up";
  const direction = directionForRoad(road, fallback, lane);
  const progress = direction === "right" || direction === "down" ? road.start + 6 : road.end - 6;
  return placeCar(
    {
      ...car,
      speed: road.kind === "main" ? 0.9 + Math.random() * 0.55 : 0.55 + Math.random() * 0.35,
      color: VEHICLE_COLORS[Math.floor(Math.random() * VEHICLE_COLORS.length)],
      vehicleType: VEHICLE_TYPES[Math.floor(Math.random() * VEHICLE_TYPES.length)],
      crashed: false,
      crashedUntil: undefined,
    },
    road,
    progress,
    direction,
    lane
  );
};

const shouldRespawnAtRoadEnd = (car: Car, road: RoadSegment) => {
  const progress = road.orientation === "horizontal" ? car.x : car.y;
  const edgeBuffer = 18;
  if (car.direction === "right" || car.direction === "down") return progress >= road.end - edgeBuffer;
  return progress <= road.start + edgeBuffer;
};

const createInitialCars = (width: number, height: number, count: number, selectedVehicleType: SimulationSettings["selectedVehicleType"]) => {
  const roads = createRoadNetwork(width, height);
  return Array.from({ length: count }, (_, index) => {
    const road = roads[(index * 5) % roads.length];
    const progress = road.start + ((index * 83) % Math.max(1, road.end - road.start));
    return makeCar(`car-${index}`, road, progress, index, selectedVehicleType);
  });
};

interface SimulationCanvasProps {
  settings: SimulationSettings;
  onStatsChange: (stats: SimulationStats) => void;
}

export function SimulationCanvas({ settings, onStatsChange }: SimulationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cars, setCars] = useState<Car[]>([]);
  const [trafficLights, setTrafficLights] = useState<TrafficLight[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoveredCar, setHoveredCar] = useState<string | null>(null);
  const [hoveredLight, setHoveredLight] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [draggedCar, setDraggedCar] = useState<string | null>(null);
  const [draggedLight, setDraggedLight] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const animationRef = useRef<number>();
  const carsRef = useRef<Car[]>([]);
  const trafficLightsRef = useRef<TrafficLight[]>([]);
  const hoveredCarRef = useRef<string | null>(null);
  const hoveredLightRef = useRef<string | null>(null);

  useEffect(() => {
    carsRef.current = cars;
  }, [cars]);

  useEffect(() => {
    trafficLightsRef.current = trafficLights;
  }, [trafficLights]);

  useEffect(() => {
    hoveredCarRef.current = hoveredCar;
  }, [hoveredCar]);

  useEffect(() => {
    hoveredLightRef.current = hoveredLight;
  }, [hoveredLight]);

  const seedCity = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setCars(createInitialCars(canvas.width, canvas.height, settings.targetVehicles, settings.selectedVehicleType));
    setTrafficLights(createTrafficLights(canvas.width, canvas.height, settings.lightDuration));
  };

  const nearestRoad = (x: number, y: number, width: number, height: number) => {
    const roads = createRoadNetwork(width, height);
    return roads
      .map((road) => ({
        road,
        distance:
          road.orientation === "horizontal"
            ? Math.abs(y - road.center) + (x < road.start || x > road.end ? 10000 : 0)
            : Math.abs(x - road.center) + (y < road.start || y > road.end ? 10000 : 0),
      }))
      .sort((a, b) => a.distance - b.distance)[0].road;
  };

  const addCar = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const road = nearestRoad(x, y, canvas.width, canvas.height);
    const progress = road.orientation === "horizontal" ? x : y;
    setCars((prev) => [...prev, makeCar(Date.now().toString(), road, progress, Math.floor(Math.random() * 1000), settings.selectedVehicleType)]);
  };

  const addTrafficLight = (x: number, y: number) => {
    setTrafficLights((prev) => [
      ...prev,
      { id: Date.now().toString(), x, y, state: "red", timeRemaining: settings.lightDuration },
    ]);
  };

  const [{ isOver }, drop] = useDrop(() => ({
    accept: ["car", "trafficLight"],
    drop: (item: { type: string }, monitor) => {
      const offset = monitor.getClientOffset();
      const canvas = canvasRef.current;
      if (!offset || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = offset.x - rect.left;
      const y = offset.y - rect.top;
      if (item.type === "car") addCar(x, y);
      if (item.type === "trafficLight") addTrafficLight(x, y);
    },
    collect: (monitor) => ({ isOver: !!monitor.isOver() }),
  }));

  const crossingRoads = (car: Car, roads: RoadSegment[]) => {
    const current = findRoad(roads, car.roadId);
    return roads.filter((road) => {
      if (road.id === current.id || road.orientation === current.orientation) return false;
      const crossX = current.orientation === "horizontal" ? road.center : current.center;
      const crossY = current.orientation === "horizontal" ? current.center : road.center;
      const onCurrent =
        current.orientation === "horizontal"
          ? crossX >= current.start && crossX <= current.end
          : crossY >= current.start && crossY <= current.end;
      const onOther =
        road.orientation === "horizontal" ? crossX >= road.start && crossX <= road.end : crossY >= road.start && crossY <= road.end;
      return onCurrent && onOther && Math.hypot(car.x - crossX, car.y - crossY) < (current.kind === "main" ? 24 : 15);
    });
  };

  const maybeTurn = (car: Car, roads: RoadSegment[]) => {
    if ((car.turnCooldown ?? 0) > 0) return car;
    const current = findRoad(roads, car.roadId);
    const options = crossingRoads(car, roads);
    if (options.length === 0) return car;
    if (!settings.externalRoutes) return car;
    const chance = current.kind === "main" ? 0.01 : 0.04;
    if (Math.random() > chance) return car;
    const road = options[Math.floor(Math.random() * options.length)];
    const lane = road.kind === "main" ? car.lane : 0;
    const direction = directionForRoad(road, car.direction, lane);
    const progress = road.orientation === "horizontal" ? car.x : car.y;
    return { ...placeCar(car, road, progress, direction, lane), turnCooldown: 48 };
  };

  useEffect(() => {
    const totalVehicles = cars.length;
    const blockedVehicles = cars.filter((car) => car.crashed || (car.crashedUntil ?? 0) > Date.now()).length;
    onStatsChange({
      totalVehicles,
      sedans: cars.filter((car) => car.vehicleType === "sedan").length,
      motorcycles: cars.filter((car) => car.vehicleType === "motorcycle").length,
      cargo: cars.filter((car) => car.vehicleType === "cargo").length,
      buses: cars.filter((car) => car.vehicleType === "bus").length,
      trafficLights: trafficLights.length,
      congestion: totalVehicles === 0 ? 0 : Math.min(100, Math.round((blockedVehicles / totalVehicles) * 100)),
    });
  }, [cars, trafficLights, onStatsChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setCars((prev) => {
      if (prev.length === settings.targetVehicles) return prev;
      const roads = createRoadNetwork(canvas.width, canvas.height);
      if (prev.length > settings.targetVehicles) return prev.slice(0, settings.targetVehicles);
      const nextCars = [...prev];
      while (nextCars.length < settings.targetVehicles) {
        const road = roads[(nextCars.length * 5) % roads.length];
        const progress = road.start + ((nextCars.length * 97) % Math.max(1, road.end - road.start));
        nextCars.push(makeCar(`car-auto-${Date.now()}-${nextCars.length}`, road, progress, nextCars.length, settings.selectedVehicleType));
      }
      return nextCars;
    });
  }, [settings.targetVehicles, settings.selectedVehicleType]);

  const forceDetour = (car: Car, roads: RoadSegment[]) => {
    const options = crossingRoads(car, roads);
    if (options.length === 0) return car;
    const current = findRoad(roads, car.roadId);
    const optionsAwayFromCurrent = options.filter((road) => road.id !== current.id);
    const road = (optionsAwayFromCurrent.length > 0 ? optionsAwayFromCurrent : options)[
      Math.floor(Math.random() * (optionsAwayFromCurrent.length > 0 ? optionsAwayFromCurrent.length : options.length))
    ];
    const lane = road.kind === "main" ? car.lane : 0;
    const direction = directionForRoad(road, car.direction, lane);
    const progress = road.orientation === "horizontal" ? car.x : car.y;
    return { ...placeCar(car, road, progress, direction, lane), turnCooldown: 70 };
  };

  const isAheadOnRoad = (car: Car, obstacle: Car, road: RoadSegment, maxDistance: number) => {
    const carTrack = road.orientation === "horizontal" ? car.y : car.x;
    const obstacleTrack = road.orientation === "horizontal" ? obstacle.y : obstacle.x;
    const lateralGap = Math.abs(obstacleTrack - carTrack);
    if (lateralGap > 8) return false;
    const forwardDistance =
      car.direction === "right"
        ? obstacle.x - car.x
        : car.direction === "left"
          ? car.x - obstacle.x
          : car.direction === "down"
            ? obstacle.y - car.y
            : car.y - obstacle.y;
    return forwardDistance > 0 && forwardDistance < maxDistance;
  };

  const hasCrashBlockAhead = (car: Car, carsToCheck: Car[], road: RoadSegment) =>
    carsToCheck.some((other) => other.id !== car.id && other.crashed && isAheadOnRoad(car, other, road, 90));

  const shouldStopForLight = (car: Car) => {
    if (!car.roadId.startsWith("main")) return false;
    const carOrientation: Orientation = car.direction === "right" || car.direction === "left" ? "horizontal" : "vertical";
    for (const light of trafficLightsRef.current) {
      if (light.controlsOrientation && light.controlsOrientation !== carOrientation) continue;
      if (light.state === "green") continue;
      const lightX = light.controlX ?? light.x;
      const lightY = light.controlY ?? light.y;
      const stopPadding = 9;
      const stopXRight = lightX - MAIN_ROAD_WIDTH / 2 - stopPadding;
      const stopXLeft = lightX + MAIN_ROAD_WIDTH / 2 + stopPadding;
      const stopYDown = lightY - MAIN_ROAD_WIDTH / 2 - stopPadding;
      const stopYUp = lightY + MAIN_ROAD_WIDTH / 2 + stopPadding;
      if (car.direction === "right" && stopXRight > car.x && stopXRight - car.x < 42 && Math.abs(lightY - car.y) < MAIN_ROAD_WIDTH / 2) return true;
      if (car.direction === "left" && stopXLeft < car.x && car.x - stopXLeft < 42 && Math.abs(lightY - car.y) < MAIN_ROAD_WIDTH / 2) return true;
      if (car.direction === "down" && stopYDown > car.y && stopYDown - car.y < 42 && Math.abs(lightX - car.x) < MAIN_ROAD_WIDTH / 2) return true;
      if (car.direction === "up" && stopYUp < car.y && car.y - stopYUp < 42 && Math.abs(lightX - car.x) < MAIN_ROAD_WIDTH / 2) return true;
    }
    return false;
  };

  const drawLabel = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, rotate = 0, size = 11) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotate);
    ctx.fillStyle = "#F8FAFC";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    ctx.font = `${size}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeText(text, 0, 0);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };

  const drawBuilding = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = "#DBEAFE";
    for (let row = 0; row < Math.max(1, Math.floor(height / 18)); row += 1) {
      for (let col = 0; col < Math.max(1, Math.floor(width / 22)); col += 1) {
        if ((row + col) % 2 === 0) ctx.fillRect(x + 8 + col * 20, y + 8 + row * 16, 7, 6);
      }
    }
  };

  const drawTrees = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, count: number) => {
    for (let i = 0; i < count; i += 1) {
      const treeX = x + 12 + ((i * 29) % Math.max(20, width - 24));
      const treeY = y + 12 + ((i * 37) % Math.max(20, height - 24));
      ctx.fillStyle = "#14532D";
      ctx.beginPath();
      ctx.arc(treeX, treeY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#22C55E";
      ctx.beginPath();
      ctx.arc(treeX - 3, treeY - 3, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const localClearZones = (block: CityBlock) => ({
    verticalX: null,
    horizontalY: null,
  });

  const drawHouseBlock = (ctx: CanvasRenderingContext2D, block: CityBlock) => {
    const { verticalX, horizontalY } = localClearZones(block);
    const zones = [
      { x: block.x + 10, y: block.y + 10, w: (verticalX ?? block.x + block.width) - block.x - 24, h: (horizontalY ?? block.y + block.height) - block.y - 24 },
      { x: (verticalX ?? block.x) + 18, y: block.y + 10, w: block.x + block.width - (verticalX ?? block.x) - 28, h: (horizontalY ?? block.y + block.height) - block.y - 24 },
      { x: block.x + 10, y: (horizontalY ?? block.y) + 18, w: (verticalX ?? block.x + block.width) - block.x - 24, h: block.y + block.height - (horizontalY ?? block.y) - 28 },
      { x: (verticalX ?? block.x) + 18, y: (horizontalY ?? block.y) + 18, w: block.x + block.width - (verticalX ?? block.x) - 28, h: block.y + block.height - (horizontalY ?? block.y) - 28 },
    ].filter((zone) => zone.w > 30 && zone.h > 24);

    zones.slice(0, 4).forEach((zone) => {
      const w = Math.min(42, zone.w);
      const h = Math.min(32, zone.h);
      ctx.fillStyle = "#D97706";
      ctx.fillRect(zone.x, zone.y + 10, w, h - 10);
      ctx.fillStyle = "#7C2D12";
      ctx.beginPath();
      ctx.moveTo(zone.x - 3, zone.y + 12);
      ctx.lineTo(zone.x + w / 2, zone.y);
      ctx.lineTo(zone.x + w + 3, zone.y + 12);
      ctx.closePath();
      ctx.fill();
    });
  };

  const drawRiver = (ctx: CanvasRenderingContext2D, block: CityBlock) => {
    ctx.fillStyle = "#38BDF8";
    ctx.beginPath();
    ctx.moveTo(block.x + block.width * 0.2, block.y);
    ctx.bezierCurveTo(block.x, block.y + block.height * 0.3, block.x + block.width * 0.55, block.y + block.height * 0.62, block.x + block.width * 0.35, block.y + block.height);
    ctx.lineTo(block.x + block.width * 0.78, block.y + block.height);
    ctx.bezierCurveTo(block.x + block.width, block.y + block.height * 0.64, block.x + block.width * 0.45, block.y + block.height * 0.28, block.x + block.width * 0.64, block.y);
    ctx.closePath();
    ctx.fill();
    drawLabel(ctx, "Rio Lempa", block.x + block.width * 0.5, block.y + block.height * 0.5, -0.25, 10);
  };

  const drawBlockDetails = (ctx: CanvasRenderingContext2D, block: CityBlock, variant: number) => {
    const dots = Math.max(3, Math.floor((block.width * block.height) / 3600));
    for (let i = 0; i < dots; i += 1) {
      const x = block.x + 14 + ((i * 31 + block.col * 17) % Math.max(20, block.width - 28));
      const y = block.y + 14 + ((i * 23 + block.row * 19) % Math.max(20, block.height - 28));
      if (variant === 0 && x > block.x + block.width * 0.18 && x < block.x + block.width * 0.78) continue;
      ctx.fillStyle = i % 3 === 0 ? "#166534" : "#22C55E";
      ctx.beginPath();
      ctx.arc(x, y, i % 2 === 0 ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#EAB308";
    for (let i = 0; i < 3; i += 1) {
      const x = block.x + 12 + ((i * 43 + block.row * 11) % Math.max(18, block.width - 24));
      const y = block.y + 12 + ((i * 29 + block.col * 13) % Math.max(18, block.height - 24));
      ctx.fillRect(x, y, 10, 3);
    }
  };

  const drawCityBlocks = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    createBlocks(width, height).forEach((block) => {
      ctx.fillStyle = "#86EFAC";
      ctx.fillRect(block.x, block.y, block.width, block.height);
      const variant = (block.col * 5 + block.row) % 8;
      const { verticalX, horizontalY } = localClearZones(block);
      const left = block.x + 12;
      const top = block.y + 12;
      const rightStart = (verticalX ?? block.x + block.width) + 18;
      const bottomStart = (horizontalY ?? block.y + block.height) + 18;

      if (variant === 0) {
        drawRiver(ctx, block);
        drawTrees(ctx, block.x, block.y, block.width, block.height, 7);
      } else if (variant === 1 || variant === 6) {
        ctx.fillStyle = "#A7F3D0";
        ctx.fillRect(left, top, Math.max(20, (verticalX ?? block.x + block.width) - block.x - 24), Math.max(20, (horizontalY ?? block.y + block.height) - block.y - 24));
        drawTrees(ctx, left, top, Math.max(25, block.width * 0.45), Math.max(25, block.height * 0.45), 8);
        drawLabel(ctx, variant === 1 ? "Parque Cuscatlan" : "Parque Bicentenario", block.x + block.width / 2, block.y + block.height * 0.28, 0, 10);
      } else if (variant === 2) {
        drawBuilding(ctx, left, top, Math.max(34, block.width * 0.34), Math.max(28, block.height * 0.32), "#94A3B8");
        ctx.fillStyle = "#F8FAFC";
        ctx.fillRect(left + 18, top + 14, 22, 22);
        ctx.fillStyle = "#DC2626";
        ctx.fillRect(left + 25, top + 16, 7, 18);
        ctx.fillRect(left + 19, top + 22, 19, 7);
        drawLabel(ctx, "Hospital", block.x + block.width * 0.5, block.y + block.height * 0.78, 0, 10);
      } else if (variant === 3 || variant === 7) {
        drawHouseBlock(ctx, block);
      } else {
        drawBuilding(ctx, left, top, Math.max(34, block.width * 0.28), Math.max(28, block.height * 0.28), "#64748B");
        if (rightStart + 34 < block.x + block.width) drawBuilding(ctx, rightStart, top, Math.max(34, block.width * 0.25), Math.max(28, block.height * 0.3), "#94A3B8");
        if (bottomStart + 28 < block.y + block.height) drawBuilding(ctx, left, bottomStart, Math.max(38, block.width * 0.32), Math.max(24, block.height * 0.22), "#B45309");
      }
      drawBlockDetails(ctx, block, variant);
    });
  };

  const drawLocalRoads = (ctx: CanvasRenderingContext2D, roads: RoadSegment[]) => {
    roads.filter((road) => road.kind === "local").forEach((road, index) => {
      ctx.fillStyle = "#667085";
      if (road.orientation === "horizontal") ctx.fillRect(road.start, road.center - road.width / 2, road.end - road.start, road.width);
      else ctx.fillRect(road.center - road.width / 2, road.start, road.width, road.end - road.start);

      ctx.strokeStyle = "#F8FAFC";
      ctx.lineWidth = 1;
      ctx.setLineDash([7, 7]);
      ctx.beginPath();
      if (road.orientation === "horizontal") {
        ctx.moveTo(road.start + 6, road.center);
        ctx.lineTo(road.end - 6, road.center);
      } else {
        ctx.moveTo(road.center, road.start + 6);
        ctx.lineTo(road.center, road.end - 6);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      const arrowX = road.orientation === "horizontal" ? (road.start + road.end) / 2 : road.center;
      const arrowY = road.orientation === "horizontal" ? road.center : (road.start + road.end) / 2;
      ctx.save();
      ctx.translate(arrowX, arrowY);
      ctx.rotate(road.direction === "left" ? Math.PI : road.direction === "down" ? Math.PI / 2 : road.direction === "up" ? -Math.PI / 2 : 0);
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-4, -5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      if (road.name) drawLabel(ctx, road.name, arrowX + 11, arrowY, road.orientation === "vertical" ? -Math.PI / 2 : 0, 8);
      if (index % 3 === 0) {
        ctx.fillStyle = "#DC2626";
        ctx.fillRect(arrowX - 10, arrowY + 10, 20, 14);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "7px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("STOP", arrowX, arrowY + 17);
      }
    });
  };

  const drawMainRoads = (ctx: CanvasRenderingContext2D, width: number, height: number, roads: RoadSegment[]) => {
    const mainRoads = roads.filter((road) => road.kind === "main");
    ctx.fillStyle = "#2F3743";
    mainRoads.forEach((road) => {
      if (road.orientation === "horizontal") ctx.fillRect(road.start, road.center - road.width / 2, road.end - road.start, road.width);
      else ctx.fillRect(road.center - road.width / 2, road.start, road.width, road.end - road.start);
    });

    ctx.strokeStyle = "#FCD34D";
    ctx.lineWidth = 2;
    mainRoads.forEach((road) => {
      ctx.beginPath();
      if (road.orientation === "horizontal") {
        ctx.moveTo(road.start, road.center - 3);
        ctx.lineTo(road.end, road.center - 3);
        ctx.moveTo(road.start, road.center + 3);
        ctx.lineTo(road.end, road.center + 3);
      } else {
        ctx.moveTo(road.center - 3, road.start);
        ctx.lineTo(road.center - 3, road.end);
        ctx.moveTo(road.center + 3, road.start);
        ctx.lineTo(road.center + 3, road.end);
      }
      ctx.stroke();
    });

    ctx.strokeStyle = "#E5E7EB";
    ctx.lineWidth = 1.2;
    ctx.setLineDash([14, 9]);
    mainRoads.forEach((road) => {
      ctx.beginPath();
      if (road.orientation === "horizontal") {
        ctx.moveTo(road.start, road.center - 14);
        ctx.lineTo(road.end, road.center - 14);
        ctx.moveTo(road.start, road.center + 14);
        ctx.lineTo(road.end, road.center + 14);
      } else {
        ctx.moveTo(road.center - 14, road.start);
        ctx.lineTo(road.center - 14, road.end);
        ctx.moveTo(road.center + 14, road.start);
        ctx.lineTo(road.center + 14, road.end);
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);

    const avenues = mainRoads.filter((road) => road.orientation === "vertical");
    const streets = mainRoads.filter((road) => road.orientation === "horizontal");
    ctx.fillStyle = "#3F4A59";
    avenues.forEach((avenue) => streets.forEach((street) => ctx.fillRect(avenue.center - MAIN_ROAD_WIDTH / 2, street.center - MAIN_ROAD_WIDTH / 2, MAIN_ROAD_WIDTH, MAIN_ROAD_WIDTH)));
    avenues.forEach((road) => drawLabel(ctx, road.name ?? "", road.center - 29, height * 0.5, -Math.PI / 2, 11));
    streets.forEach((road) => drawLabel(ctx, road.name ?? "", width * 0.5, road.center - 27, 0, 11));
  };

  const drawTrafficSigns = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const avenues = getMainCenters(width);
    const streets = getMainCenters(height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "8px system-ui";
    streets.forEach((streetY, index) => {
      const x = Math.max(28, avenues[index % avenues.length] - MAIN_ROAD_WIDTH / 2 - 22);
      ctx.fillStyle = "#DC2626";
      ctx.fillRect(x - 12, streetY + MAIN_ROAD_WIDTH / 2 + 10, 24, 17);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText("STOP", x, streetY + MAIN_ROAD_WIDTH / 2 + 18);
    });
    avenues.forEach((avenueX, index) => {
      const y = Math.max(38, streets[index % streets.length] - MAIN_ROAD_WIDTH / 2 - 22);
      ctx.fillStyle = "#E5E7EB";
      ctx.beginPath();
      ctx.arc(avenueX + MAIN_ROAD_WIDTH / 2 + 18, y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#111827";
      ctx.stroke();
      ctx.fillStyle = "#111827";
      ctx.fillText(index % 2 === 0 ? "40" : "30", avenueX + MAIN_ROAD_WIDTH / 2 + 18, y);
    });
  };

  const drawTrafficLights = (ctx: CanvasRenderingContext2D) => {
    trafficLightsRef.current.forEach((light) => {
      ctx.fillStyle = "#111827";
      ctx.fillRect(light.x - 5, light.y - 15, 11, 31);
      ctx.fillStyle = light.state === "red" ? "#EF4444" : "#450A0A";
      ctx.beginPath();
      ctx.arc(light.x, light.y - 9, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = light.state === "yellow" ? "#F59E0B" : "#451A03";
      ctx.beginPath();
      ctx.arc(light.x, light.y, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = light.state === "green" ? "#10B981" : "#064E3B";
      ctx.beginPath();
      ctx.arc(light.x, light.y + 9, 3.8, 0, Math.PI * 2);
      ctx.fill();
      if (hoveredLightRef.current === light.id) {
        ctx.fillStyle = "#EF4444";
        ctx.beginPath();
        ctx.arc(light.x + 13, light.y - 19, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(light.x + 10, light.y - 22);
        ctx.lineTo(light.x + 16, light.y - 16);
        ctx.moveTo(light.x + 16, light.y - 22);
        ctx.lineTo(light.x + 10, light.y - 16);
        ctx.stroke();
      }
    });
  };

  const vehicleAngle = (direction: Direction) => {
    if (direction === "left") return Math.PI;
    if (direction === "down") return Math.PI / 2;
    if (direction === "up") return -Math.PI / 2;
    return 0;
  };

  const drawVehicle = (ctx: CanvasRenderingContext2D, car: Car) => {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(vehicleAngle(car.direction));
    ctx.shadowBlur = 8;
    ctx.shadowColor = car.color;
    ctx.fillStyle = car.color;
    if (car.vehicleType === "motorcycle") {
      ctx.fillRect(-5, -2, 10, 4);
      ctx.beginPath();
      ctx.arc(-7, 0, 2, 0, Math.PI * 2);
      ctx.arc(7, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (car.vehicleType === "cargo") {
      ctx.fillRect(-14, -6, 17, 12);
      ctx.fillRect(3, -5, 9, 10);
    } else if (car.vehicleType === "bus") {
      ctx.fillRect(-13, -6, 26, 12);
      ctx.fillStyle = "#E0F2FE";
      for (let i = 0; i < 4; i += 1) ctx.fillRect(-9 + i * 5, -4, 3, 3);
    } else {
      ctx.fillRect(-10, -5, 20, 10);
      ctx.fillStyle = "#DBEAFE";
      ctx.fillRect(-4, -4, 7, 3);
      ctx.fillRect(-4, 1, 7, 3);
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#111827";
    ctx.fillRect(-8, -7, 4, 2);
    ctx.fillRect(5, -7, 4, 2);
    ctx.fillRect(-8, 5, 4, 2);
    ctx.fillRect(5, 5, 4, 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(7, -3);
    ctx.lineTo(7, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const drawCars = (ctx: CanvasRenderingContext2D) => {
    carsRef.current.forEach((car) => {
      drawVehicle(ctx, car);
      if (car.crashed || (car.crashedUntil ?? 0) > Date.now()) {
        ctx.strokeStyle = "#F87171";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(car.x, car.y, 13, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (hoveredCarRef.current === car.id) {
        ctx.fillStyle = "#EF4444";
        ctx.beginPath();
        ctx.arc(car.x + 15, car.y - 14, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(car.x + 12, car.y - 17);
        ctx.lineTo(car.x + 18, car.y - 11);
        ctx.moveTo(car.x + 18, car.y - 17);
        ctx.lineTo(car.x + 12, car.y - 11);
        ctx.stroke();
      }
    });
  };

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const roads = createRoadNetwork(canvas.width, canvas.height);
    ctx.fillStyle = "#76C96F";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawCityBlocks(ctx, canvas.width, canvas.height);
    drawMainRoads(ctx, canvas.width, canvas.height, roads);
    drawTrafficSigns(ctx, canvas.width, canvas.height);
    drawTrafficLights(ctx);
    drawCars(ctx);
    animationRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCars((prevCars) => {
        const canvas = canvasRef.current;
        if (!canvas) return prevCars;
        const roads = createRoadNetwork(canvas.width, canvas.height);
        const now = Date.now();
        const crashedIds = new Set<string>();

        for (let i = 0; i < prevCars.length; i += 1) {
          for (let j = i + 1; j < prevCars.length; j += 1) {
            const a = prevCars[i];
            const b = prevCars[j];
            const differentRoads = a.roadId !== b.roadId;
            const aMovingAxis = a.direction === "right" || a.direction === "left" ? "horizontal" : "vertical";
            const bMovingAxis = b.direction === "right" || b.direction === "left" ? "horizontal" : "vertical";
            const crossing = differentRoads && aMovingAxis !== bMovingAxis;
            if (crossing && Math.hypot(a.x - b.x, a.y - b.y) < 12 && Math.random() < 0.018) {
              crashedIds.add(a.id);
              crashedIds.add(b.id);
            }
          }
        }

        return prevCars.map((car) => {
          const road = findRoad(roads, car.roadId);
          if (!road) return respawnCar(car, roads);
          if (shouldRespawnAtRoadEnd(car, road)) return respawnCar(car, roads);
          if (car.crashed || (car.crashedUntil ?? 0) > now) return car;
          if (crashedIds.has(car.id)) return { ...car, crashed: true, crashedUntil: undefined };
          const activeCar = { ...car, turnCooldown: Math.max(0, (car.turnCooldown ?? 0) - 1) };
          let nextCar = maybeTurn(activeCar, roads);
          let nextRoad = findRoad(roads, nextCar.roadId);
          const crashBlockAhead = hasCrashBlockAhead(nextCar, prevCars, nextRoad);
          if (crashBlockAhead) {
            const canDetourHere = crossingRoads(nextCar, roads).length > 0;
            const detouredCar = canDetourHere ? forceDetour(nextCar, roads) : nextCar;
            if (canDetourHere && detouredCar.roadId !== nextCar.roadId) {
              nextCar = detouredCar;
              nextRoad = findRoad(roads, nextCar.roadId);
            }
          }
          let trafficAhead = false;
          for (const other of prevCars) {
            if (other.id === nextCar.id) continue;
            if (other.crashed && isAheadOnRoad(nextCar, other, nextRoad, 90)) {
              trafficAhead = true;
              break;
            }
            if (other.roadId !== nextCar.roadId || other.lane !== nextCar.lane) continue;
            const lateralGap =
              nextRoad.orientation === "horizontal" ? Math.abs(other.y - nextCar.y) : Math.abs(other.x - nextCar.x);
            if (lateralGap > 5) continue;
            const ahead =
              (nextCar.direction === "right" && other.x > nextCar.x) ||
              (nextCar.direction === "left" && other.x < nextCar.x) ||
              (nextCar.direction === "down" && other.y > nextCar.y) ||
              (nextCar.direction === "up" && other.y < nextCar.y);
            if (ahead && Math.hypot(nextCar.x - other.x, nextCar.y - other.y) < 27) {
              trafficAhead = true;
              break;
            }
          }
          if (!trafficAhead && !shouldStopForLight(nextCar)) {
            const speed = nextCar.speed * settings.speedMultiplier;
            if (nextCar.direction === "right") nextCar = { ...nextCar, x: nextCar.x + speed };
            if (nextCar.direction === "left") nextCar = { ...nextCar, x: nextCar.x - speed };
            if (nextCar.direction === "down") nextCar = { ...nextCar, y: nextCar.y + speed };
            if (nextCar.direction === "up") nextCar = { ...nextCar, y: nextCar.y - speed };
          }
          const progress = nextRoad.orientation === "horizontal" ? nextCar.x : nextCar.y;
          if (progress < nextRoad.start - 8 || progress > nextRoad.end + 8) return respawnCar(nextCar, roads);
          return nextCar;
        });
      });
    }, 16);
    return () => clearInterval(interval);
  }, [isPlaying, settings.speedMultiplier, settings.externalRoutes]);

  useEffect(() => {
    setTrafficLights((prev) =>
      prev.map((light) => ({
        ...light,
        timeRemaining: light.state === "yellow" ? yellowDuration : settings.lightDuration,
      }))
    );
  }, [settings.lightDuration]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setTrafficLights((prev) =>
        prev.map((light) => {
          if (light.timeRemaining > 1) return { ...light, timeRemaining: light.timeRemaining - 1 };
          const nextState = getNextLightState(light.state);
          return { ...light, state: nextState, timeRemaining: nextState === "yellow" ? yellowDuration : settings.lightDuration };
        })
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, settings.lightDuration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resizeCanvas();
    seedCity();
    window.addEventListener("resize", resizeCanvas);
    animate();
    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const toggleTrafficLight = (id: string) => {
    setTrafficLights((prev) =>
      prev.map((light) => {
        const target = prev.find((item) => item.id === id);
        if (!target) return light;
        const sameIntersection =
          (light.controlX ?? light.x) === (target.controlX ?? target.x) &&
          (light.controlY ?? light.y) === (target.controlY ?? target.y);
        const sameOrientation = light.controlsOrientation === target.controlsOrientation;
        if (!sameIntersection || !sameOrientation) {
          if (sameIntersection && target.controlsOrientation && light.controlsOrientation !== target.controlsOrientation) {
            return {
              ...light,
              state: "red",
              timeRemaining: settings.lightDuration,
            };
          }
          return light;
        }
        const states: TrafficLight["state"][] = ["red", "yellow", "green"];
        const nextState = states[(states.indexOf(target.state) + 1) % states.length];
        return {
          ...light,
          state: nextState,
          timeRemaining: nextState === "yellow" ? yellowDuration : settings.lightDuration,
        };
      })
    );
  };

  const deleteCar = (id: string) => {
    setCars((prev) => prev.filter((car) => car.id !== id));
  };

  const deleteTrafficLight = (id: string) => {
    setTrafficLights((prev) => prev.filter((light) => light.id !== id));
  };

  const handleReset = () => {
    seedCity();
    setIsPlaying(false);
  };

  return (
    <div ref={drop} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${isOver ? "ring-4 ring-blue-500" : ""} ${
          draggedCar || draggedLight ? "cursor-grabbing" : "cursor-default"
        }`}
        onMouseDown={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          for (const car of cars) {
            if (Math.hypot(x - (car.x + 15), y - (car.y - 14)) < 9) return;
          }
          for (const light of trafficLights) {
            if (Math.hypot(x - (light.x + 13), y - (light.y - 19)) < 9) return;
          }
          for (const car of cars) {
            if (Math.hypot(x - car.x, y - car.y) < 16) {
              setDraggedCar(car.id);
              setDragOffset({ x: x - car.x, y: y - car.y });
              return;
            }
          }
          for (const light of trafficLights) {
            if (Math.hypot(x - light.x, y - light.y) < 16) {
              setDraggedLight(light.id);
              setDragOffset({ x: x - light.x, y: y - light.y });
              return;
            }
          }
        }}
        onClick={(e) => {
          if (draggedCar || draggedLight) return;
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          for (const car of cars) {
            if (Math.hypot(x - (car.x + 15), y - (car.y - 14)) < 8) {
              deleteCar(car.id);
              return;
            }
          }
          for (const light of trafficLights) {
            if (Math.hypot(x - (light.x + 13), y - (light.y - 19)) < 8) {
              deleteTrafficLight(light.id);
              return;
            }
          }
          trafficLights.forEach((light) => {
            if (Math.hypot(x - light.x, y - light.y) < 16) toggleTrafficLight(light.id);
          });
        }}
        onMouseMove={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          setMousePos({ x, y });
          if (draggedCar) {
            setCars((prev) =>
              prev.map((car) =>
                car.id === draggedCar
                  ? { ...car, x: x - dragOffset.x, y: y - dragOffset.y, crashed: false, crashedUntil: undefined }
                  : car
              )
            );
            return;
          }
          if (draggedLight) {
            setTrafficLights((prev) =>
              prev.map((light) => (light.id === draggedLight ? { ...light, x: x - dragOffset.x, y: y - dragOffset.y } : light))
            );
            return;
          }
          const car = cars.find(
            (item) =>
              Math.hypot(x - item.x, y - item.y) < 16 ||
              Math.hypot(x - (item.x + 15), y - (item.y - 14)) < 11
          );
          setHoveredCar(car?.id ?? null);
          const light = trafficLights.find(
            (item) =>
              Math.hypot(x - item.x, y - item.y) < 16 ||
              Math.hypot(x - (item.x + 13), y - (item.y - 19)) < 11
          );
          setHoveredLight(light?.id ?? null);
        }}
        onMouseUp={() => {
          setDraggedCar(null);
          setDraggedLight(null);
        }}
        onMouseLeave={() => {
          setHoveredCar(null);
          setHoveredLight(null);
          setDraggedCar(null);
          setDraggedLight(null);
        }}
      />

      <div className="absolute top-4 left-4 flex gap-2">
        <Button onClick={() => setIsPlaying(!isPlaying)} variant="secondary" size="sm">
          {isPlaying ? <Pause className="size-4 mr-2" /> : <Play className="size-4 mr-2" />}
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <Button onClick={handleReset} variant="secondary" size="sm">
          <RotateCcw className="size-4 mr-2" />
          Reset
        </Button>
      </div>

      <div className="absolute bottom-4 left-4 bg-gray-800/90 p-3 rounded-lg">
        <div className="text-white text-sm space-y-1">
          <div>Vehiculos: {cars.length}</div>
          <div>Semaforos: {trafficLights.length}</div>
          <div>Avenidas:</div>
          <div>Intersecciones principales: 9</div>
          <div>Status: {isPlaying ? "Running" : "Paused"}</div>
        </div>
      </div>

      {hoveredCar && (
        <div className="absolute bg-gray-800/90 p-3 rounded-lg pointer-events-none" style={{ left: mousePos.x + 10, top: mousePos.y + 10 }}>
          <div className="text-white text-sm space-y-1">
            <div>Car ID: {hoveredCar}</div>
            {(() => {
              const hovered = cars.find((car) => car.id === hoveredCar);
              return hovered ? <div>Type: {hovered.vehicleType}</div> : null;
            })()}
          </div>
        </div>
      )}

      {hoveredLight && (
        <div className="absolute bg-gray-800/90 p-3 rounded-lg pointer-events-none" style={{ left: mousePos.x + 10, top: mousePos.y + 10 }}>
          <div className="text-white text-sm space-y-1">
            <div>Traffic Light ID: {hoveredLight}</div>
            {(() => {
              const hovered = trafficLights.find((light) => light.id === hoveredLight);
              return hovered ? <div>Timer: {hovered.timeRemaining}s</div> : null;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
