import { Injectable } from '@angular/core';
import { CraneData, LiftCalculationInput, LiftCalculationResult, BoomOption } from '../models/crane.models';
import { SANY_STC500BEV } from '../data/sany-crane.data';

@Injectable({
  providedIn: 'root'
})
export class CraneCalculatorService {
  private crane: CraneData = SANY_STC500BEV;
  // Pivot height from ground for SANY STC500BEV is ~2.3 meters
  private readonly BOOM_PIVOT_HEIGHT_M = 2.3;
  // Pivot offset from center of rotation is ~-1.2m
  private readonly BOOM_PIVOT_OFFSET_M = 1.0;

  getCraneData(): CraneData {
    return this.crane;
  }

  calculateLift(input: LiftCalculationInput): LiftCalculationResult {
    const totalLoadKg = input.loadWeightKg + (input.slingSafetyWeightKg || 0);
    const config = input.outriggerType === '50%' ? this.crane.outriggers50 : this.crane.outriggers100;
    
    // Find closest radius row in chart (rounding up for safety as per ISO 4305 / Crane standard)
    const availableRadii = config.chart.map(r => r.radius).sort((a, b) => a - b);
    const targetRadius = input.radiusM;

    // Check minimum / maximum radius limits
    if (targetRadius < availableRadii[0] || targetRadius > availableRadii[availableRadii.length - 1]) {
      return {
        isFeasible: false,
        bestBoomLengthM: null,
        boomAngleDeg: null,
        ratedCapacityKg: null,
        totalLoadKg,
        utilizationPercent: null,
        status: 'out_of_range',
        message: `Radius ${targetRadius}m is out of chart range (${availableRadii[0]}m - ${availableRadii[availableRadii.length - 1]}m).`,
        hookHeightM: null,
        allEligibleOptions: []
      };
    }

    // Standard rule: if actual radius falls between two values, take the larger radius (more conservative)
    let matchedRadius = availableRadii.find(r => r >= targetRadius);
    if (!matchedRadius) {
      matchedRadius = availableRadii[availableRadii.length - 1];
    }

    const row = config.chart.find(r => r.radius === matchedRadius);
    if (!row) {
      return {
        isFeasible: false,
        bestBoomLengthM: null,
        boomAngleDeg: null,
        ratedCapacityKg: null,
        totalLoadKg,
        utilizationPercent: null,
        status: 'out_of_range',
        message: 'Could not find load data for specified radius.',
        hookHeightM: null,
        allEligibleOptions: []
      };
    }

    const eligibleOptions: BoomOption[] = [];

    // Check each boom length
    for (const bLengthStr of Object.keys(row.capacities)) {
      const boomLength = parseFloat(bLengthStr);
      const cap = row.capacities[bLengthStr];
      if (cap === null || cap === undefined) continue;

      // Geometrical calculations
      // radius approx = boomLength * cos(angle) + pivotOffset
      // cos(angle) = (targetRadius - pivotOffset) / boomLength
      const effectiveRadius = Math.max(0.5, targetRadius - this.BOOM_PIVOT_OFFSET_M);
      if (effectiveRadius > boomLength) {
        // Boom cannot reach this radius physically
        continue;
      }

      const cosVal = Math.min(1, Math.max(0, effectiveRadius / boomLength));
      const angleRad = Math.acos(cosVal);
      const angleDeg = Math.round((angleRad * 180) / Math.PI * 10) / 10;

      // Hook height = pivotHeight + boomLength * sin(angle)
      const hookHeight = Math.round((this.BOOM_PIVOT_HEIGHT_M + boomLength * Math.sin(angleRad)) * 10) / 10;

      // Check if height requirement is satisfied (if user specified liftHeightM)
      if (input.liftHeightM > 0 && hookHeight < input.liftHeightM) {
        continue;
      }

      const util = Math.round((totalLoadKg / cap) * 1000) / 10;
      let status: 'safe' | 'warning' | 'danger' = 'safe';
      if (util > 90) status = 'danger';
      else if (util >= 75) status = 'warning';

      eligibleOptions.push({
        boomLengthM: boomLength,
        capacityKg: cap,
        utilizationPercent: util,
        boomAngleDeg: angleDeg,
        hookHeightM: hookHeight,
        status
      });
    }

    if (eligibleOptions.length === 0) {
      // Find what capacity would be at this radius regardless of height
      let maxCapAtRadius = 0;
      for (const b of Object.keys(row.capacities)) {
        const c = row.capacities[b];
        if (c && c > maxCapAtRadius) maxCapAtRadius = c;
      }
      return {
        isFeasible: false,
        bestBoomLengthM: null,
        boomAngleDeg: null,
        ratedCapacityKg: maxCapAtRadius || null,
        totalLoadKg,
        utilizationPercent: maxCapAtRadius ? Math.round((totalLoadKg / maxCapAtRadius) * 1000) / 10 : null,
        status: 'overload',
        message: input.liftHeightM > 0 
          ? `No boom configuration can reach both height ${input.liftHeightM}m and support ${totalLoadKg}kg at ${targetRadius}m radius.`
          : `Load ${totalLoadKg}kg exceeds maximum rated capacity (${maxCapAtRadius}kg) at ${targetRadius}m radius.`,
        hookHeightM: null,
        allEligibleOptions: []
      };
    }

    // Filter feasible options where utilization <= 100%
    const viableOptions = eligibleOptions.filter(o => o.utilizationPercent <= 100);

    if (viableOptions.length === 0) {
      const closest = eligibleOptions.sort((a, b) => a.utilizationPercent - b.utilizationPercent)[0];
      return {
        isFeasible: false,
        bestBoomLengthM: closest.boomLengthM,
        boomAngleDeg: closest.boomAngleDeg,
        ratedCapacityKg: closest.capacityKg,
        totalLoadKg,
        utilizationPercent: closest.utilizationPercent,
        status: 'overload',
        message: `Overload! Best capacity is ${closest.capacityKg} kg (${closest.utilizationPercent}% utilization) at ${closest.boomLengthM}m boom.`,
        hookHeightM: closest.hookHeightM,
        allEligibleOptions: eligibleOptions
      };
    }

    // Sort viable options:
    // Prefer safe status (<75%), then smallest boom length (stiffer and safer in practice)
    viableOptions.sort((a, b) => {
      if (a.status === 'safe' && b.status !== 'safe') return -1;
      if (b.status === 'safe' && a.status !== 'safe') return 1;
      return a.boomLengthM - b.boomLengthM;
    });

    const best = viableOptions[0];

    return {
      isFeasible: true,
      bestBoomLengthM: best.boomLengthM,
      boomAngleDeg: best.boomAngleDeg,
      ratedCapacityKg: best.capacityKg,
      totalLoadKg,
      utilizationPercent: best.utilizationPercent,
      status: best.status,
      message: `Safe Lift: ${best.boomLengthM}m boom at ${best.boomAngleDeg}° angle. Rated capacity: ${best.capacityKg} kg (${best.utilizationPercent}% utilization).`,
      hookHeightM: best.hookHeightM,
      allEligibleOptions: viableOptions
    };
  }
}
