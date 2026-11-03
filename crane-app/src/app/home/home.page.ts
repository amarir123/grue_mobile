import { Component, OnInit } from '@angular/core';
import { CraneCalculatorService } from '../services/crane-calculator.service';
import { CraneData, LiftCalculationInput, LiftCalculationResult, OutriggerConfig } from '../models/crane.models';

@Component({
  selector: 'app-home',
  standalone: false,
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage implements OnInit {
  crane!: CraneData;

  // Selected Tab
  currentSegment: 'calculator' | 'chart' | 'spec' = 'calculator';

  // Calculator inputs
  loadWeightTons: number = 8.5; // in Tons
  radiusM: number = 14;         // in Meters
  liftHeightM: number = 18;     // in Meters
  outriggerType: '100%' | '50%' = '100%';
  safetySlingKg: number = 300;  // Rigging hook/slings weight

  // Calculation Output
  calcResult!: LiftCalculationResult;

  // Chart table view
  chartOutriggerFilter: '100%' | '50%' = '100%';
  activeConfig!: OutriggerConfig;

  // Floating Window State
  isPanelOpen: boolean = true;

  constructor(private craneService: CraneCalculatorService) {}

  ngOnInit() {
    this.crane = this.craneService.getCraneData();
    this.updateActiveConfig();
    this.recalculate();
  }

  onOutriggerChange() {
    this.recalculate();
  }

  updateActiveConfig() {
    this.activeConfig = this.chartOutriggerFilter === '100%' 
      ? this.crane.outriggers100 
      : this.crane.outriggers50;
  }

  onChartFilterChange() {
    this.updateActiveConfig();
  }

  recalculate() {
    const input: LiftCalculationInput = {
      loadWeightKg: (this.loadWeightTons || 0) * 1000,
      radiusM: Number(this.radiusM) || 3,
      liftHeightM: Number(this.liftHeightM) || 0,
      outriggerType: this.outriggerType,
      useJib: false,
      slingSafetyWeightKg: Number(this.safetySlingKg) || 0
    };

    this.calcResult = this.craneService.calculateLift(input);
  }

  selectOption(opt: any) {
    if (this.calcResult) {
      this.calcResult.bestBoomLengthM = opt.boomLengthM;
      this.calcResult.boomAngleDeg = opt.boomAngleDeg;
      this.calcResult.ratedCapacityKg = opt.capacityKg;
      this.calcResult.utilizationPercent = opt.utilizationPercent;
      this.calcResult.status = opt.status;
      this.calcResult.hookHeightM = opt.hookHeightM;
    }
  }

  isCurrentSelectedCell(radius: number, boomLength: number): boolean {
    if (!this.calcResult || !this.calcResult.isFeasible) return false;
    return this.radiusM === radius && this.calcResult.bestBoomLengthM === boomLength;
  }
}
