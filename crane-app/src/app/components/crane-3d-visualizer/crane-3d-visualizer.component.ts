import { Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import * as THREE from 'three';

@Component({
  selector: 'app-crane-3d-visualizer',
  standalone: false,
  templateUrl: './crane-3d-visualizer.component.html',
  styleUrls: ['./crane-3d-visualizer.component.scss']
})
export class Crane3dVisualizerComponent implements OnInit, OnChanges, OnDestroy {
  @ViewChild('rendererCanvas', { static: true }) rendererCanvas!: ElementRef<HTMLCanvasElement>;

  @Input() boomLengthM: number = 20.2;
  @Input() boomAngleDeg: number = 60;
  @Input() radiusM: number = 14;
  @Input() liftHeightM: number = 18;
  @Input() loadWeightKg: number = 8500;
  @Input() outriggerSpan: '100%' | '50%' = '100%';
  @Input() status: 'safe' | 'warning' | 'danger' | 'overload' | 'out_of_range' = 'safe';

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private animFrameId: number | null = null;

  // Crane Components
  private craneGroup!: THREE.Group;
  private superstructureGroup!: THREE.Group;
  private boomPivotGroup!: THREE.Group;
  private boomSectionsGroup!: THREE.Group;
  private hydraulicCylinderPivot!: THREE.Group;
  private hydraulicBarrelMesh!: THREE.Mesh;
  private hydraulicPistonMesh!: THREE.Mesh;
  private hookAssemblyGroup!: THREE.Group;
  private cableLinesGroup!: THREE.Group;
  private suspendedLoadMesh!: THREE.Mesh;
  private radiusIndicatorCircle!: THREE.Line;
  private outriggerBeams: THREE.Mesh[] = [];
  private outriggerJacks: THREE.Mesh[] = [];
  private outriggerPads: THREE.Mesh[] = [];

  // PBR Materials
  private matSanyRedGloss!: THREE.MeshStandardMaterial;
  private matSanyRedPlain!: THREE.MeshStandardMaterial;
  private matSanyYellowCab!: THREE.MeshStandardMaterial;
  private matChassisCharcoal!: THREE.MeshStandardMaterial;
  private matDarkMetal!: THREE.MeshStandardMaterial;
  private matChromePiston!: THREE.MeshStandardMaterial;
  private matCabGlass!: THREE.MeshPhysicalMaterial;
  private matTireRubber!: THREE.MeshStandardMaterial;
  private matAlloyRim!: THREE.MeshStandardMaterial;
  private matHazardChevron!: THREE.MeshStandardMaterial;
  private matCableSteel!: THREE.LineBasicMaterial;
  private matDiamondPlate!: THREE.MeshStandardMaterial;

  // Camera Orbit Controls
  private isDragging = false;
  private previousMousePosition = { x: 0, y: 0 };
  private cameraDistance = 34;
  private cameraPhi = Math.PI / 3.4;
  private cameraTheta = Math.PI / 3.8;
  private cameraTarget = new THREE.Vector3(0, 4.5, 0);

  ngOnInit(): void {
    this.initThreeEnvironment();
    this.createProceduralTexturesAndMaterials();
    this.assemblePhotorealisticSanyCrane();
    this.updateCranePose();
    this.startRenderLoop();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.scene) {
      this.updateCranePose();
    }
  }

  ngOnDestroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
  }

  private initThreeEnvironment(): void {
    const canvas = this.rendererCanvas.nativeElement;
    const width = canvas.parentElement?.clientWidth || window.innerWidth;
    const height = canvas.parentElement?.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c1017);
    this.scene.fog = new THREE.FogExp2(0x0c1017, 0.009);

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 400);
    this.syncCameraPosition();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    // Advanced Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x111625, 1.1);
    this.scene.add(hemiLight);

    // Main Sun / Key Light with detailed shadows
    const keyLight = new THREE.DirectionalLight(0xfffaed, 2.8);
    keyLight.position.set(28, 48, 32);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 140;
    const shadowDist = 26;
    keyLight.shadow.camera.left = -shadowDist;
    keyLight.shadow.camera.right = shadowDist;
    keyLight.shadow.camera.top = shadowDist;
    keyLight.shadow.camera.bottom = -shadowDist;
    keyLight.shadow.bias = -0.0004;
    this.scene.add(keyLight);

    // Rim / Back light for crisp machinery outlines
    const rimLight = new THREE.DirectionalLight(0x40a0ff, 1.6);
    rimLight.position.set(-28, 22, -30);
    this.scene.add(rimLight);

    // Fill Warm Side Light
    const fillLight = new THREE.DirectionalLight(0xffb070, 0.8);
    fillLight.position.set(10, 15, -25);
    this.scene.add(fillLight);

    // Ground Construction Site / High-tech Grid
    const grid = new THREE.GridHelper(100, 100, 0x00e5ff, 0x1b2838);
    grid.position.y = 0.01;
    this.scene.add(grid);

    // Realistic Ground Contact Shadow
    const groundGeo = new THREE.PlaneGeometry(120, 120);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.55 });
    const groundShadow = new THREE.Mesh(groundGeo, groundMat);
    groundShadow.rotation.x = -Math.PI / 2;
    groundShadow.receiveShadow = true;
    this.scene.add(groundShadow);

    this.bindMouseAndTouchControls();
    window.addEventListener('resize', () => this.handleResize());
  }

  private createProceduralTexturesAndMaterials(): void {
    const texLoader = new THREE.TextureLoader();
    const boomLogoTex = texLoader.load('assets/sany_boom_logo.png');
    const grilleLogoTex = texLoader.load('assets/sany_grille_logo.png');

    // 1. SANY Red High-Gloss Boom Material with Logo
    this.matSanyRedGloss = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.1,
      roughness: 0.3,
      map: boomLogoTex
    });

    // Plain SANY Red (without text, for intermediate sections)
    this.matSanyRedPlain = new THREE.MeshStandardMaterial({
      color: 0xeb2612,
      metalness: 0.15,
      roughness: 0.3
    });

    // 2. Grille with SANY Badge
    const matGrilleBadge = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: grilleLogoTex,
      roughness: 0.5
    });

    // 2b. SANY Golden Yellow Automotive Cab Paint
    this.matSanyYellowCab = new THREE.MeshStandardMaterial({
      color: 0xe69c10,
      metalness: 0.18,
      roughness: 0.26
    });

    // 3. Dark Charcoal Chassis & Structural Steel
    this.matChassisCharcoal = new THREE.MeshStandardMaterial({
      color: 0x181d24,
      metalness: 0.55,
      roughness: 0.5
    });

    // 4. Machinery Dark Cast Iron & Slewing Rings
    const stripeTex = texLoader.load('assets/boom_telescopic_stripe.png');
    stripeTex.wrapS = THREE.RepeatWrapping;
    stripeTex.wrapT = THREE.RepeatWrapping;
    stripeTex.repeat.set(1, 4);

    this.matDarkMetal = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: stripeTex,
      metalness: 0.8,
      roughness: 0.35
    });

    // 5. Mirror Chrome Hydraulic Ram Piston
    this.matChromePiston = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.05
    });

    // 6. Deep Tinted Automotive Glass with realistic transmission
    this.matCabGlass = new THREE.MeshPhysicalMaterial({
      color: 0x1a2636,
      metalness: 0.9,
      roughness: 0.05,
      transmission: 0.75,
      transparent: true,
      opacity: 0.85
    });

    // 7. Heavy Construction Tire Rubber (Low reflectivity, matte)
    const tireCanvas = document.createElement('canvas');
    tireCanvas.width = 64;
    tireCanvas.height = 256;
    const tCtx = tireCanvas.getContext('2d')!;
    tCtx.fillStyle = '#141414';
    tCtx.fillRect(0, 0, 64, 256);
    tCtx.fillStyle = '#080808';
    for (let y = 0; y < 256; y += 16) {
      tCtx.fillRect(0, y, 64, 6);
    }
    const tireTex = new THREE.CanvasTexture(tireCanvas);
    tireTex.wrapS = THREE.RepeatWrapping;
    tireTex.wrapT = THREE.RepeatWrapping;
    tireTex.repeat.set(1, 16);

    this.matTireRubber = new THREE.MeshStandardMaterial({
      color: 0x171717,
      bumpMap: tireTex,
      bumpScale: 0.04,
      roughness: 0.85,
      metalness: 0.1
    });

    // 8. Polished Aluminum Alloy Wheel Rim
    this.matAlloyRim = new THREE.MeshStandardMaterial({
      color: 0xd8d8d8,
      metalness: 0.88,
      roughness: 0.2
    });

    // 9. Hazard Chevron Striping for Hook Block & Bumpers
    const chevCanvas = document.createElement('canvas');
    chevCanvas.width = 128;
    chevCanvas.height = 128;
    const cCtx = chevCanvas.getContext('2d')!;
    cCtx.fillStyle = '#e69c10';
    cCtx.fillRect(0, 0, 128, 128);
    cCtx.fillStyle = '#111111';
    for (let x = -128; x < 256; x += 32) {
      cCtx.beginPath();
      cCtx.moveTo(x, 0);
      cCtx.lineTo(x + 32, 0);
      cCtx.lineTo(x + 64, 128);
      cCtx.lineTo(x + 32, 128);
      cCtx.closePath();
      cCtx.fill();
    }
    const chevTex = new THREE.CanvasTexture(chevCanvas);
    chevTex.wrapS = THREE.RepeatWrapping;
    chevTex.wrapT = THREE.RepeatWrapping;
    chevTex.repeat.set(2, 2);

    this.matHazardChevron = new THREE.MeshStandardMaterial({
      map: chevTex,
      roughness: 0.35,
      metalness: 0.2
    });

    // 10. Diamond Plate Decking
    this.matDiamondPlate = new THREE.MeshStandardMaterial({
      color: 0x242d38,
      metalness: 0.7,
      roughness: 0.45
    });

    // 11. Wire Rope Cable
    this.matCableSteel = new THREE.LineBasicMaterial({
      color: 0xd0d5dd,
      linewidth: 2
    });
  }

  private assemblePhotorealisticSanyCrane(): void {
    this.craneGroup = new THREE.Group();

    // 1. CARRIER CHASSIS (Detailed truck body & cab)
    this.buildDetailedCarrierChassis();

    // 2. SLEWING SUPERSTRUCTURE & OPERATOR CABIN
    this.buildDetailedSuperstructure();

    // 3. TELESCOPIC BOOM ASSEMBLY WITH SANY ROUNDED U-PROFILE
    this.buildTelescopicBoomAssembly();

    // 4. RIGGING, HEAVY HOOK BLOCK & CARGO
    this.buildHeavyHookAndRigging();

    this.scene.add(this.craneGroup);

    // 5. Working Radius Indicator Ring
    const ringPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 90; i++) {
      const th = (i / 90) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(Math.cos(th), 0.02, Math.sin(th)));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
    const ringMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2, transparent: true, opacity: 0.75 });
    this.radiusIndicatorCircle = new THREE.Line(ringGeo, ringMat);
    this.scene.add(this.radiusIndicatorCircle);
  }

  private buildDetailedCarrierChassis(): void {
    const carrierGroup = new THREE.Group();

    // Heavy Main Beam Chassis (14.4m length, 2.7m width)
    const chassisBox = new THREE.BoxGeometry(14.4, 1.1, 2.65);
    const chassisMesh = new THREE.Mesh(chassisBox, this.matChassisCharcoal);
    chassisMesh.position.set(0.6, 1.25, 0);
    chassisMesh.castShadow = true;
    chassisMesh.receiveShadow = true;
    carrierGroup.add(chassisMesh);

    // Upper Walking Deck with Diamond Plate Finish
    const deckGeo = new THREE.BoxGeometry(14.5, 0.25, 2.8);
    const deckMesh = new THREE.Mesh(deckGeo, this.matDiamondPlate);
    deckMesh.position.set(0.6, 1.9, 0);
    deckMesh.castShadow = true;
    carrierGroup.add(deckMesh);

    // Side Mudguards & Lower Yellow Aerodynamic Fairings
    const fairingGeo = new THREE.BoxGeometry(6.5, 0.8, 2.82);
    const fairingMesh = new THREE.Mesh(fairingGeo, this.matSanyYellowCab);
    fairingMesh.position.set(1.2, 1.45, 0);
    fairingMesh.castShadow = true;
    carrierGroup.add(fairingMesh);

    // Reflective Safety Stripe along the entire deck perimeter
    const tapeGeo = new THREE.BoxGeometry(14.52, 0.08, 2.84);
    const tapeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const tapeMesh = new THREE.Mesh(tapeGeo, tapeMat);
    tapeMesh.position.set(0.6, 2.02, 0);
    carrierGroup.add(tapeMesh);

    // ==========================================
    // SANY DRIVER CAB (Sculpted Modern Aerodynamic Cab)
    // ==========================================
    const cabGroup = new THREE.Group();
    cabGroup.position.set(5.7, 1.9, 0);

    // Lower Front Bumper (Black & Yellow Accents)
    const bumperGeo = new THREE.BoxGeometry(1.6, 0.7, 2.8);
    const bumper = new THREE.Mesh(bumperGeo, this.matDarkMetal);
    bumper.position.set(0.8, 0.35, 0);
    bumper.castShadow = true;
    cabGroup.add(bumper);

    // Front Tow Hook Bracket
    const towGeo = new THREE.TorusGeometry(0.2, 0.05, 8, 16);
    const towMesh = new THREE.Mesh(towGeo, this.matChromePiston);
    towMesh.position.set(1.62, 0.2, 0);
    cabGroup.add(towMesh);

    // Main Cab Body (Yellow Painted Steel)
    const cabLowerGeo = new THREE.BoxGeometry(2.7, 1.2, 2.76);
    const cabLower = new THREE.Mesh(cabLowerGeo, this.matSanyYellowCab);
    cabLower.position.set(0, 1.1, 0);
    cabLower.castShadow = true;
    cabGroup.add(cabLower);

    // Signature Black Front Grille with Chrome "SANY" Insignia
    const texLoader = new THREE.TextureLoader();
    const grilleLogoTex = texLoader.load('assets/sany_grille_logo.png');
    const matGrilleBadge = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: grilleLogoTex,
      roughness: 0.5
    });
    const grilleGeo = new THREE.BoxGeometry(0.12, 0.75, 2.0);
    const grille = new THREE.Mesh(grilleGeo, matGrilleBadge);
    grille.position.set(1.38, 1.0, 0);
    cabGroup.add(grille);

    // Front Windshield (Sloped forward-leaning aerodynamic glass)
    const glassGeo = new THREE.BoxGeometry(2.1, 1.15, 2.65);
    const cabGlass = new THREE.Mesh(glassGeo, this.matCabGlass);
    cabGlass.position.set(0.2, 2.1, 0);
    cabGroup.add(cabGlass);

    // Cab Sun Visor / Aerodynamic Roof Cap
    const roofCapGeo = new THREE.BoxGeometry(2.4, 0.18, 2.76);
    const roofCap = new THREE.Mesh(roofCapGeo, this.matSanyYellowCab);
    roofCap.position.set(0.05, 2.72, 0);
    roofCap.castShadow = true;
    cabGroup.add(roofCap);

    // Modern LED Projector Headlights
    const hlGeo = new THREE.BoxGeometry(0.06, 0.22, 0.55);
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const hlLeft = new THREE.Mesh(hlGeo, hlMat);
    hlLeft.position.set(1.4, 0.55, 0.95);
    const hlRight = new THREE.Mesh(hlGeo, hlMat);
    hlRight.position.set(1.4, 0.55, -0.95);
    cabGroup.add(hlLeft);
    cabGroup.add(hlRight);

    // Rearview Mirrors (Left & Right)
    [-1.48, 1.48].forEach(z => {
      const mirrorArmGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8);
      const arm = new THREE.Mesh(mirrorArmGeo, this.matDarkMetal);
      arm.position.set(0.8, 2.0, z);
      cabGroup.add(arm);

      const mirrorHousingGeo = new THREE.BoxGeometry(0.12, 0.6, 0.22);
      const housing = new THREE.Mesh(mirrorHousingGeo, this.matDarkMetal);
      housing.position.set(0.9, 2.2, z);
      cabGroup.add(housing);
    });

    carrierGroup.add(cabGroup);

    // ==========================================
    // 4 HEAVY AXLES = 8 WHEELS WITH HIGH-DETAIL RIMS
    // ==========================================
    const axleXCoords = [5.7, 4.2, -3.2, -4.7];
    axleXCoords.forEach((axX, idx) => {
      [-1.48, 1.48].forEach(zPos => {
        const wheel = this.createDetailedTruckWheel(idx < 2);
        wheel.position.set(axX, 0.68, zPos);
        wheel.rotation.x = zPos > 0 ? 0 : Math.PI;
        carrierGroup.add(wheel);
      });
    });

    // ==========================================
    // OUTRIGGER BOXES & EXTENDABLE BEAMS
    // ==========================================
    this.buildDynamicOutriggers(carrierGroup);

    this.craneGroup.add(carrierGroup);
  }

  private createDetailedTruckWheel(isSteerable: boolean): THREE.Group {
    const wg = new THREE.Group();

    // Heavy Tire Tread
    const tireGeo = new THREE.CylinderGeometry(0.68, 0.68, 0.52, 36);
    tireGeo.rotateX(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeo, this.matTireRubber);
    tire.castShadow = true;
    wg.add(tire);

    // Shiny Aluminum Alloy Wheel Rim
    const rimGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.55, 24);
    rimGeo.rotateX(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, this.matAlloyRim);
    wg.add(rim);

    // Inset Hub Center
    const hubGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.58, 16);
    hubGeo.rotateX(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeo, this.matChassisCharcoal);
    wg.add(hub);

    // Lug nuts ring (10 wheel bolts)
    for (let b = 0; b < 10; b++) {
      const ang = (b / 10) * Math.PI * 2;
      const nutGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6);
      nutGeo.rotateX(Math.PI / 2);
      const nut = new THREE.Mesh(nutGeo, this.matChromePiston);
      nut.position.set(Math.cos(ang) * 0.32, Math.sin(ang) * 0.32, 0);
      wg.add(nut);
    }

    return wg;
  }

  private buildDynamicOutriggers(parent: THREE.Group): void {
    const spanZ = this.outriggerSpan === '100%' ? 3.65 : 2.45;
    const xPositions = [4.1, -3.1];

    xPositions.forEach(xPos => {
      // Outrigger Cross Box Housing
      const boxHousingGeo = new THREE.BoxGeometry(0.9, 0.6, 2.75);
      const boxHousing = new THREE.Mesh(boxHousingGeo, this.matChassisCharcoal);
      boxHousing.position.set(xPos, 1.25, 0);
      parent.add(boxHousing);

      // Left and Right Telescoping Outrigger Beams
      [-1, 1].forEach(dir => {
        const targetZ = dir * spanZ;
        const beamGeo = new THREE.BoxGeometry(0.5, 0.4, spanZ - 1.2);
        const beam = new THREE.Mesh(beamGeo, this.matSanyYellowCab);
        beam.position.set(xPos, 1.2, (dir * (1.2 + spanZ)) / 2);
        beam.castShadow = true;
        parent.add(beam);
        this.outriggerBeams.push(beam);

        // Vertical Hydraulic Cylinder Jack
        const jackGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.0, 16);
        const jack = new THREE.Mesh(jackGeo, this.matChromePiston);
        jack.position.set(xPos, 0.55, targetZ);
        jack.castShadow = true;
        parent.add(jack);
        this.outriggerJacks.push(jack);

        // Large Hexagonal Ground Pad
        const padGeo = new THREE.CylinderGeometry(0.68, 0.68, 0.12, 8);
        const pad = new THREE.Mesh(padGeo, this.matChassisCharcoal);
        pad.position.set(xPos, 0.06, targetZ);
        pad.receiveShadow = true;
        parent.add(pad);
        this.outriggerPads.push(pad);
      });
    });
  }

  private buildDetailedSuperstructure(): void {
    this.superstructureGroup = new THREE.Group();
    this.superstructureGroup.position.set(-1.0, 2.1, 0); // Positioned above turntable bearing

    // Massive Slewing Ring Turntable
    const slewGeo = new THREE.CylinderGeometry(1.65, 1.65, 0.4, 36);
    const slewMesh = new THREE.Mesh(slewGeo, this.matDarkMetal);
    slewMesh.position.set(0, 0.2, 0);
    this.superstructureGroup.add(slewMesh);

    // Upper Rotating Steel Deck Platform
    const deckGeo = new THREE.BoxGeometry(5.4, 0.6, 2.8);
    const upperDeck = new THREE.Mesh(deckGeo, this.matChassisCharcoal);
    upperDeck.position.set(0.6, 0.65, 0);
    upperDeck.castShadow = true;
    this.superstructureGroup.add(upperDeck);

    // ==========================================
    // OPERATOR CRANE CAB (Modern Tiltable Panoramic Cab)
    // ==========================================
    const opCab = new THREE.Group();
    opCab.position.set(1.5, 1.6, 0.95);

    // SANY Golden Yellow Enclosed Cab Body
    const opBodyGeo = new THREE.BoxGeometry(2.3, 2.0, 1.25);
    const opBody = new THREE.Mesh(opBodyGeo, this.matSanyYellowCab);
    opBody.castShadow = true;
    opCab.add(opBody);

    // Panoramic Front, Top & Side Tinted Glass
    const opGlassGeo = new THREE.BoxGeometry(2.32, 1.5, 1.18);
    const opGlass = new THREE.Mesh(opGlassGeo, this.matCabGlass);
    opGlass.position.set(0.08, 0.25, 0.05);
    opCab.add(opGlass);

    // Operator Safety Roof Handrails
    const railGeo = new THREE.CylinderGeometry(0.025, 0.025, 2.1, 8);
    railGeo.rotateZ(Math.PI / 2);
    const rail = new THREE.Mesh(railGeo, this.matChromePiston);
    rail.position.set(0, 1.05, 0.6);
    opCab.add(rail);

    this.superstructureGroup.add(opCab);

    // ==========================================
    // 10.5T MODULAR COUNTERWEIGHT (Black & Yellow Slabs)
    // ==========================================
    const cwGroup = new THREE.Group();
    cwGroup.position.set(-1.85, 1.65, 0);

    // Base Tray (SANY Yellow)
    const cwTrayGeo = new THREE.BoxGeometry(2.2, 0.4, 2.75);
    const cwTray = new THREE.Mesh(cwTrayGeo, this.matSanyYellowCab);
    cwTray.castShadow = true;
    cwGroup.add(cwTray);

    // 4 Heavy Ballast Slabs (Dark Iron with Lifting Pins)
    for (let s = 0; s < 4; s++) {
      const slabGeo = new THREE.BoxGeometry(2.0, 0.35, 2.7);
      const slab = new THREE.Mesh(slabGeo, this.matChassisCharcoal);
      slab.position.set(-0.05, 0.38 * (s + 1), 0);
      slab.castShadow = true;
      cwGroup.add(slab);
    }

    this.superstructureGroup.add(cwGroup);

    // ==========================================
    // BOOM PIVOT PEDESTAL & TOWER PIN MOUNTS
    // ==========================================
    const towerGeo = new THREE.BoxGeometry(1.0, 1.8, 1.4);
    const tower = new THREE.Mesh(towerGeo, this.matChassisCharcoal);
    tower.position.set(0.3, 1.9, 0);
    tower.castShadow = true;
    this.superstructureGroup.add(tower);

    // Boom Main Pin
    const pinGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.6, 16);
    pinGeo.rotateX(Math.PI / 2);
    const pin = new THREE.Mesh(pinGeo, this.matChromePiston);
    pin.position.set(0.3, 2.65, 0);
    this.superstructureGroup.add(pin);

    this.craneGroup.add(this.superstructureGroup);
  }

  private buildTelescopicBoomAssembly(): void {
    // 1. Pivot Hinge Point
    this.boomPivotGroup = new THREE.Group();
    this.boomPivotGroup.position.set(0.3, 2.65, 0);

    // Nested sections group
    this.boomSectionsGroup = new THREE.Group();
    this.boomPivotGroup.add(this.boomSectionsGroup);

    // 2. Heavy Hydraulic Elevation Ram
    this.hydraulicCylinderPivot = new THREE.Group();
    this.hydraulicCylinderPivot.position.set(1.6, 0.95, 0);

    const barrelGeo = new THREE.CylinderGeometry(0.32, 0.32, 4.2, 24);
    this.hydraulicBarrelMesh = new THREE.Mesh(barrelGeo, this.matChassisCharcoal);
    this.hydraulicBarrelMesh.castShadow = true;
    this.hydraulicCylinderPivot.add(this.hydraulicBarrelMesh);

    const pistonGeo = new THREE.CylinderGeometry(0.22, 0.22, 4.2, 24);
    this.hydraulicPistonMesh = new THREE.Mesh(pistonGeo, this.matChromePiston);
    this.hydraulicCylinderPivot.add(this.hydraulicPistonMesh);

    this.superstructureGroup.add(this.hydraulicCylinderPivot);
    this.superstructureGroup.add(this.boomPivotGroup);
  }

  private buildHeavyHookAndRigging(): void {
    this.hookAssemblyGroup = new THREE.Group();

    // Heavy Block Shell with Chevron Warning Stripes
    const blockShellGeo = new THREE.BoxGeometry(1.0, 1.35, 0.65);
    const blockShell = new THREE.Mesh(blockShellGeo, this.matHazardChevron);
    blockShell.castShadow = true;
    this.hookAssemblyGroup.add(blockShell);

    // 4 Sheave Pulleys inside hook block
    const sheaveCylGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.58, 24);
    sheaveCylGeo.rotateZ(Math.PI / 2);
    const sheaves = new THREE.Mesh(sheaveCylGeo, this.matDarkMetal);
    sheaves.position.set(0, 0.45, 0);
    this.hookAssemblyGroup.add(sheaves);

    // Forged Steel Hook Shank & Swivel
    const shankGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 16);
    const shank = new THREE.Mesh(shankGeo, this.matChromePiston);
    shank.position.set(0, -0.85, 0);
    this.hookAssemblyGroup.add(shank);

    // Curved Hook Torus (Realistic industrial hook curvature)
    const curveGeo = new THREE.TorusGeometry(0.42, 0.12, 16, 24, Math.PI * 1.35);
    const hookCurve = new THREE.Mesh(curveGeo, this.matChromePiston);
    hookCurve.position.set(0, -1.2, 0);
    hookCurve.rotation.z = -Math.PI / 2;
    this.hookAssemblyGroup.add(hookCurve);

    this.scene.add(this.hookAssemblyGroup);

    // Multi-Fall Wire Rope Lines
    this.cableLinesGroup = new THREE.Group();
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -10, 0)
    ]);
    const cableLine = new THREE.Line(lineGeo, this.matCableSteel);
    this.cableLinesGroup.add(cableLine);
    this.scene.add(this.cableLinesGroup);

    // Industrial Container / Concrete Test Block
    const loadGeo = new THREE.BoxGeometry(2.6, 2.2, 2.6);
    const loadMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.35,
      roughness: 0.45
    });
    this.suspendedLoadMesh = new THREE.Mesh(loadGeo, loadMat);
    this.suspendedLoadMesh.castShadow = true;
    this.scene.add(this.suspendedLoadMesh);
  }

  private updateCranePose(): void {
    if (!this.boomSectionsGroup) return;

    // 1. RECONSTRUCT 5-SECTION TELESCOPIC BOOM
    while (this.boomSectionsGroup.children.length > 0) {
      this.boomSectionsGroup.remove(this.boomSectionsGroup.children[0]);
    }

    const totalLength = Math.max(11.7, this.boomLengthM || 11.7);
    const numSections = 5;
    const baseLength = 11.7;
    const extensionDelta = (totalLength - baseLength) / (numSections - 1);

    for (let i = 0; i < numSections; i++) {
      const sectionLength = (i === 0) ? baseLength : (baseLength / numSections) + extensionDelta;
      const width = 1.35 - i * 0.12;
      const height = 1.55 - i * 0.12;

      // Rounded U-Profile shape with bevelled appearance
      const secGeo = new THREE.BoxGeometry(width, height, sectionLength);
      const isBase = (i === 0);
      // Inner telescopic boom sections have the realistic metallic striped guide & wear plate texture
      const mat = isBase 
        ? this.matSanyRedGloss 
        : (i % 2 === 0 ? this.matSanyRedPlain : this.matDarkMetal);

      const secMesh = new THREE.Mesh(secGeo, mat);
      secMesh.castShadow = true;
      secMesh.receiveShadow = true;

      const zOffset = (i === 0)
        ? sectionLength / 2
        : (baseLength * 0.32) + (i * extensionDelta) + (sectionLength / 2);

      secMesh.position.set(0, 0, zOffset);
      this.boomSectionsGroup.add(secMesh);
    }

    // Left and Right SANY Branding Badges along the base boom
    const texLoader = new THREE.TextureLoader();
    const boomLogoTex = texLoader.load('assets/sany_boom_logo.png');
    const badgeMat = new THREE.MeshBasicMaterial({ map: boomLogoTex });
    const badgeGeo = new THREE.PlaneGeometry(4.2, 1.05);

    // Left side SANY Logo
    const badgeLeft = new THREE.Mesh(badgeGeo, badgeMat);
    badgeLeft.position.set(0.70, 0, baseLength * 0.45);
    badgeLeft.rotation.y = Math.PI / 2;
    this.boomSectionsGroup.add(badgeLeft);

    // Right side SANY Logo
    const badgeRight = new THREE.Mesh(badgeGeo, badgeMat);
    badgeRight.position.set(-0.70, 0, baseLength * 0.45);
    badgeRight.rotation.y = -Math.PI / 2;
    this.boomSectionsGroup.add(badgeRight);

    // Boom Head Assembly at the very tip (Red nose + Sheaves + Anti-two block weight)
    const noseGeo = new THREE.BoxGeometry(0.9, 1.25, 1.4);
    const nose = new THREE.Mesh(noseGeo, this.matSanyRedGloss);
    nose.position.set(0, 0, totalLength + 0.7);
    nose.castShadow = true;
    this.boomSectionsGroup.add(nose);

    // Tip Sheaves (Red Pulley Wheels as seen in SANY photo)
    const tipSheaveGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.85, 24);
    tipSheaveGeo.rotateX(Math.PI / 2);
    const tipSheave = new THREE.Mesh(tipSheaveGeo, this.matSanyRedGloss);
    tipSheave.position.set(0, -0.45, totalLength + 1.1);
    this.boomSectionsGroup.add(tipSheave);

    // Auxiliary Boom Point Sheave Bracket
    const auxGeo = new THREE.BoxGeometry(0.2, 0.8, 0.8);
    const auxBracket = new THREE.Mesh(auxGeo, this.matChassisCharcoal);
    auxBracket.position.set(0.55, -0.3, totalLength + 0.9);
    this.boomSectionsGroup.add(auxBracket);

    // 2. SET BOOM ANGLE (Pivot around local X)
    const angleRad = ((this.boomAngleDeg || 60) * Math.PI) / 180;
    this.boomPivotGroup.rotation.x = -angleRad;

    // 3. REALISTIC HYDRAULIC CYLINDER KINEMATICS
    const boomAttachPointLocal = new THREE.Vector3(0, -0.7, 3.6);
    const boomAttachPointWorld = boomAttachPointLocal.clone();
    this.boomPivotGroup.localToWorld(boomAttachPointWorld);

    const cylBaseWorld = new THREE.Vector3();
    this.hydraulicCylinderPivot.getWorldPosition(cylBaseWorld);

    const ramVec = new THREE.Vector3().subVectors(boomAttachPointWorld, cylBaseWorld);
    const ramLen = ramVec.length();

    this.hydraulicCylinderPivot.lookAt(boomAttachPointWorld);
    this.hydraulicBarrelMesh.rotation.x = Math.PI / 2;
    this.hydraulicBarrelMesh.position.set(0, 0, ramLen * 0.28);
    this.hydraulicBarrelMesh.scale.set(1, ramLen * 0.55 / 4.2, 1);

    this.hydraulicPistonMesh.rotation.x = Math.PI / 2;
    this.hydraulicPistonMesh.position.set(0, 0, ramLen * 0.72);
    this.hydraulicPistonMesh.scale.set(1, ramLen * 0.55 / 4.2, 1);

    // 4. CALCULATE HOOK & LOAD POSITIONS
    const tipWorld = new THREE.Vector3(0, -0.45, totalLength + 1.1);
    this.boomPivotGroup.localToWorld(tipWorld);

    // Working Radius Ring alignment
    const pivotWorld = new THREE.Vector3();
    this.boomPivotGroup.getWorldPosition(pivotWorld);
    const curRadius = this.radiusM || 14;
    this.radiusIndicatorCircle.scale.set(curRadius, 1, curRadius);
    this.radiusIndicatorCircle.position.set(pivotWorld.x, 0, pivotWorld.z);

    // Realistic Hook Cable length
    const hookY = Math.max(2.1, tipWorld.y - 6.0);
    this.hookAssemblyGroup.position.set(tipWorld.x, hookY, tipWorld.z);

    // Cargo block position
    const loadY = Math.max(1.1, hookY - 2.4);
    this.suspendedLoadMesh.position.set(tipWorld.x, loadY, tipWorld.z);

    // Dynamic Color-coding for Cargo Load
    const loadMat = this.suspendedLoadMesh.material as THREE.MeshStandardMaterial;
    if (this.status === 'overload' || this.status === 'danger') {
      loadMat.color.setHex(0xef4444);
    } else if (this.status === 'warning') {
      loadMat.color.setHex(0xf59e0b);
    } else {
      loadMat.color.setHex(0x38bdf8);
    }

    // Update Steel Cables between Sheaves and Hook
    const cableLine = this.cableLinesGroup.children[0] as THREE.Line;
    const cablePos = new Float32Array([
      tipWorld.x, tipWorld.y, tipWorld.z,
      tipWorld.x, hookY + 0.7, tipWorld.z
    ]);
    cableLine.geometry.setAttribute('position', new THREE.BufferAttribute(cablePos, 3));
    cableLine.geometry.attributes['position'].needsUpdate = true;
  }

  private bindMouseAndTouchControls(): void {
    const canvas = this.rendererCanvas.nativeElement;

    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.previousMousePosition.x;
      const dy = e.clientY - this.previousMousePosition.y;

      this.cameraTheta -= dx * 0.007;
      this.cameraPhi = Math.max(0.06, Math.min(Math.PI / 2 - 0.03, this.cameraPhi - dy * 0.007));

      this.previousMousePosition = { x: e.clientX, y: e.clientY };
      this.syncCameraPosition();
    });

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    });

    canvas.addEventListener('touchmove', (e) => {
      if (!this.isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - this.previousMousePosition.x;
      const dy = e.touches[0].clientY - this.previousMousePosition.y;

      this.cameraTheta -= dx * 0.007;
      this.cameraPhi = Math.max(0.06, Math.min(Math.PI / 2 - 0.03, this.cameraPhi - dy * 0.007));

      this.previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this.syncCameraPosition();
    });

    canvas.addEventListener('touchend', () => {
      this.isDragging = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance = Math.max(10, Math.min(85, this.cameraDistance + e.deltaY * 0.035));
      this.syncCameraPosition();
    }, { passive: false });
  }

  private syncCameraPosition(): void {
    this.camera.position.x = this.cameraTarget.x + this.cameraDistance * Math.sin(this.cameraPhi) * Math.sin(this.cameraTheta);
    this.camera.position.y = this.cameraTarget.y + this.cameraDistance * Math.cos(this.cameraPhi);
    this.camera.position.z = this.cameraTarget.z + this.cameraDistance * Math.sin(this.cameraPhi) * Math.cos(this.cameraTheta);
    this.camera.lookAt(this.cameraTarget);
  }

  private handleResize(): void {
    const canvas = this.rendererCanvas.nativeElement;
    const width = canvas.parentElement?.clientWidth || window.innerWidth;
    const height = canvas.parentElement?.clientHeight || window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private startRenderLoop = () => {
    this.animFrameId = requestAnimationFrame(this.startRenderLoop);
    this.renderer.render(this.scene, this.camera);
  };

  resetView(): void {
    this.cameraDistance = 34;
    this.cameraPhi = Math.PI / 3.4;
    this.cameraTheta = Math.PI / 3.8;
    this.cameraTarget.set(0, 4.5, 0);
    this.syncCameraPosition();
  }
}
