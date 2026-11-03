export interface CraneData {
  id: string;
  name: string;
  manufacturer: string;
  type: string;
  maxCapacityKg: number;
  maxBoomLengthM: number;
  maxTipHeightM: number;
  counterweightKg: number;
  outriggers100: OutriggerConfig;
  outriggers50: OutriggerConfig;
  jibChart: JibRow[];
}

export interface OutriggerConfig {
  boomLengths: number[];
  chart: RadiusRow[];
}

export interface RadiusRow {
  radius: number;
  capacities: { [boomLength: string]: number | null };
}

export interface JibRow {
  boomAngle: number;
  jib9_2m: {
    offset0: number | null;
    offset15: number | null;
    offset30: number | null;
  };
  jib16m: {
    offset0: number | null;
    offset15: number | null;
    offset30: number | null;
  };
}

export interface LiftCalculationInput {
  loadWeightKg: number;
  radiusM: number;
  liftHeightM: number;
  outriggerType: '100%' | '50%';
  useJib: boolean;
  jibLength?: 9.2 | 16;
  jibOffset?: 0 | 15 | 30;
  slingSafetyWeightKg?: number;
}

export interface LiftCalculationResult {
  isFeasible: boolean;
  bestBoomLengthM: number | null;
  boomAngleDeg: number | null;
  ratedCapacityKg: number | null;
  totalLoadKg: number;
  utilizationPercent: number | null;
  status: 'safe' | 'warning' | 'danger' | 'overload' | 'out_of_range';
  message: string;
  hookHeightM: number | null;
  allEligibleOptions: BoomOption[];
}

export interface BoomOption {
  boomLengthM: number;
  capacityKg: number;
  utilizationPercent: number;
  boomAngleDeg: number;
  hookHeightM: number;
  status: 'safe' | 'warning' | 'danger';
}
