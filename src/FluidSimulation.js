import * as THREE from 'three';

export class FluidSimulation {
    constructor(particleCount = 1000) {
        this.params = {
            particleCount: particleCount,
            particleSize: 0.1,
            gravity: 9.81,
            damping: 0.8,          // Augmenté pour plus de stabilité
            gridSize: 1,
            collisionThreshold: 0.1,
            // Paramètres SPH ajustés
            smoothingLength: 0.4,   // Augmenté pour plus d'interaction
            particleMass: 0.1,      // Augmenté pour plus d'impact
            restDensity: 100.0,     // Réduit pour plus de compressibilité
            gasConstant: 100.0,     // Réduit pour des forces de pression plus douces
            viscosity: 0.5,         // Augmenté pour plus de cohésion
            surfaceTension: 0.2,    // Augmenté pour plus de cohésion
            timeStep: 0.016,        // Augmenté pour des mouvements plus visibles
            maxVelocity: 5.0,       // Augmenté pour plus de dynamisme
            boundaryDamping: 0.8,   // Augmenté pour des rebonds plus énergiques
            // Paramètres d'interaction
            interactionRadius: 1.0,  // Rayon d'interaction avec la souris
            interactionForce: 10.0,   // Force d'interaction avec la souris
            // Paramètres spécifiques aux scénarios
            sourceRate: 10,
            waveAmplitude: 0.5,
            waveFrequency: 1.0,
            whirlpoolStrength: 2.0
        };

        // Limites de la simulation
        this.boundingBox = new THREE.Box3(
            new THREE.Vector3(-5, -5, -5),
            new THREE.Vector3(5, 5, 5)
        );

        // Structures de données SPH
        this.particles = [];           // Positions
        this.velocities = [];          // Vitesses
        this.accelerations = [];       // Accélérations
        this.densities = [];           // Densités
        this.pressures = [];           // Pressions
        this.neighbors = [];           // Liste des voisins
        this.spatialHash = new Map();  // Structure de hachage spatial

        // Configuration de l'interaction
        this.currentTool = 'orbit';
        this.interactionPoint = new THREE.Vector3();
        this.raycaster = new THREE.Raycaster();
        this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.planeHelper = this.createPlaneHelper();
        this.mousePosition = new THREE.Vector2();
        this.isInteracting = false;
        this.sources = [];
        this.obstacles = [];

        // Noyaux SPH précalculés
        this.kernels = this.initKernels();

        // Initialisation des scénarios
        this.currentScenario = 'default';
        this.scenarioSources = [];
        this.setupScenarios();

        // Initialisation
        this.initSimulation();
        this.createMesh();
        this.setupControls();
        this.setupToolbar();
    }

    initKernels() {
        const h = this.params.smoothingLength;
        const h2 = h * h;
        const h3 = h2 * h;
        const h4 = h2 * h2;
        const h5 = h3 * h2;
        const h6 = h3 * h3;
        const h9 = h6 * h3;
        const pi = Math.PI;

        return {
            // Noyau de densité (Poly6)
            poly6: {
                W: (r, h) => {
                    if (r > h) return 0;
                    const h2 = h * h;
                    const r2 = r * r;
                    return 315.0 / (64.0 * pi * h9) * Math.pow(h2 - r2, 3);
                },
                gradW: (r, dx, dy, dz, h) => {
                    const r2 = r * r;
                    if (r > h || r2 < 1e-12) return new THREE.Vector3(0, 0, 0);
                    const coef = -945.0 / (32.0 * pi * h9) * Math.pow(h2 - r2, 2);
                    return new THREE.Vector3(dx * coef, dy * coef, dz * coef);
                }
            },
            // Noyau de pression (Spiky)
            spiky: {
                W: (r, h) => {
                    if (r > h) return 0;
                    return 15.0 / (pi * h6) * Math.pow(h - r, 3);
                },
                gradW: (r, dx, dy, dz, h) => {
                    if (r > h || r < 1e-12) return new THREE.Vector3(0, 0, 0);
                    const coef = -45.0 / (pi * h6) * Math.pow(h - r, 2) / r;
                    return new THREE.Vector3(dx * coef, dy * coef, dz * coef);
                }
            },
            // Noyau de viscosité (Laplacien)
            viscosity: {
                laplacianW: (r, h) => {
                    if (r > h) return 0;
                    return 45.0 / (pi * h6) * (h - r);
                }
            }
        };
    }

    initSimulation() {
        // Créer un bloc de fluide plus compact
        const spacing = 0.2;  // Espacement entre les particules
        const width = 10;     // Nombre de particules en largeur
        const height = 10;    // Nombre de particules en hauteur
        const depth = 10;     // Nombre de particules en profondeur

        this.particles = [];
        this.velocities = [];
        this.accelerations = [];
        this.densities = [];
        this.pressures = [];
        this.neighbors = [];

        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                for (let z = 0; z < depth; z++) {
                    if (this.particles.length < this.params.particleCount) {
                        const position = new THREE.Vector3(
                            (x - width/2) * spacing,
                            3 + y * spacing,  // Commencer plus haut
                            (z - depth/2) * spacing
                        );
                        // Ajouter un peu de randomisation pour éviter la grille parfaite
                        position.add(new THREE.Vector3(
                            (Math.random() - 0.5) * 0.1,
                            (Math.random() - 0.5) * 0.1,
                            (Math.random() - 0.5) * 0.1
                        ));
                        this.particles.push(position);
                        this.velocities.push(new THREE.Vector3(0, 0, 0));
                        this.accelerations.push(new THREE.Vector3(0, -this.params.gravity, 0));
                        this.densities.push(0);
                        this.pressures.push(0);
                        this.neighbors.push([]);
                    }
                }
            }
        }
    }

    updateSpatialHash() {
        this.spatialHash.clear();
        const cellSize = this.params.smoothingLength;

        for (let i = 0; i < this.particles.length; i++) {
            const pos = this.particles[i];
            const hashKey = this.getHashKey(
                Math.floor(pos.x / cellSize),
                Math.floor(pos.y / cellSize),
                Math.floor(pos.z / cellSize)
            );

            if (!this.spatialHash.has(hashKey)) {
                this.spatialHash.set(hashKey, []);
            }
            this.spatialHash.get(hashKey).push(i);
        }
    }

    findNeighbors() {
        this.updateSpatialHash();
        const h = this.params.smoothingLength;

        for (let i = 0; i < this.particles.length; i++) {
            this.neighbors[i] = [];
            const pos = this.particles[i];
            const cellX = Math.floor(pos.x / h);
            const cellY = Math.floor(pos.y / h);
            const cellZ = Math.floor(pos.z / h);

            // Recherche dans les cellules voisines
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const hashKey = this.getHashKey(cellX + dx, cellY + dy, cellZ + dz);
                        const cell = this.spatialHash.get(hashKey);
                        if (cell) {
                            for (const j of cell) {
                                if (i !== j) {
                                    const r = pos.distanceTo(this.particles[j]);
                                    if (r < h) {
                                        this.neighbors[i].push(j);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    computeDensityPressure() {
        const h = this.params.smoothingLength;
        const mass = this.params.particleMass;

        for (let i = 0; i < this.particles.length; i++) {
            let density = 0;
            const pos_i = this.particles[i];

            // Contribution de la particule elle-même
            density += this.kernels.poly6.W(0, h) * mass;

            // Contribution des voisins
            for (const j of this.neighbors[i]) {
                const r = pos_i.distanceTo(this.particles[j]);
                density += mass * this.kernels.poly6.W(r, h);
            }

            this.densities[i] = density;
            // Équation d'état pour la pression (Tait)
            this.pressures[i] = this.params.gasConstant * (
                Math.pow(density / this.params.restDensity, 7) - 1
            );
        }
    }

    computeForces() {
        const h = this.params.smoothingLength;
        const mass = this.params.particleMass;

        // Réinitialiser les accélérations avec la gravité
        for (let i = 0; i < this.particles.length; i++) {
            this.accelerations[i].set(0, -this.params.gravity, 0);
        }

        // Calcul des forces
        for (let i = 0; i < this.particles.length; i++) {
            const pos_i = this.particles[i];
            const density_i = Math.max(this.densities[i], 0.1);
            const pressure_i = this.pressures[i];

            for (const j of this.neighbors[i]) {
                const pos_j = this.particles[j];
                const density_j = Math.max(this.densities[j], 0.1);
                const pressure_j = this.pressures[j];

                const r = pos_i.clone().sub(pos_j);
                const dist = r.length();
                if (dist < 1e-12) continue;

                // Force de pression plus forte
                const pressureForce = r.clone().normalize().multiplyScalar(
                    -mass * (pressure_i + pressure_j) / (2 * density_j) * 
                    Math.pow((h - dist) / h, 2)
                );
                this.accelerations[i].add(pressureForce.multiplyScalar(3.0));

                // Force de viscosité plus significative
                const velDiff = this.velocities[j].clone().sub(this.velocities[i]);
                const viscosityForce = velDiff.multiplyScalar(
                    this.params.viscosity * mass / density_j * (h - dist)
                );
                this.accelerations[i].add(viscosityForce);

                // Force de cohésion renforcée
                if (dist < h * 0.9) {
                    const cohesionForce = r.normalize().multiplyScalar(
                        -mass * this.params.surfaceTension * Math.pow(1 - dist/h, 2)
                    );
                    this.accelerations[i].add(cohesionForce);
                }
            }
        }
    }

    update() {
        const dt = this.params.timeStep;

        // Mise à jour SPH
        this.findNeighbors();
        this.computeDensityPressure();
        this.computeForces();
        this.updateSources(dt);

        // Intégration du mouvement avec sous-pas
        const subSteps = 2;
        const subDt = dt / subSteps;

        for (let step = 0; step < subSteps; step++) {
            for (let i = 0; i < this.particles.length; i++) {
                // Mise à jour de la vitesse
                this.velocities[i].add(this.accelerations[i].multiplyScalar(subDt));

                // Limite de vitesse
                const speed = this.velocities[i].length();
                if (speed > this.params.maxVelocity) {
                    this.velocities[i].multiplyScalar(this.params.maxVelocity / speed);
                }

                // Mise à jour de la position
                this.particles[i].add(this.velocities[i].clone().multiplyScalar(subDt));

                // Collisions
                this.handleBoundaryCollisions(i);
                this.handleGridCollision(this.particles[i], this.velocities[i]);
                this.handleObstacleCollisions(this.particles[i], this.velocities[i]);
            }
        }

        // Mise à jour de la géométrie
        const positions = this.mesh.geometry.attributes.position.array;
        for (let i = 0; i < this.particles.length; i++) {
            positions[i * 3] = this.particles[i].x;
            positions[i * 3 + 1] = this.particles[i].y;
            positions[i * 3 + 2] = this.particles[i].z;
        }
        this.mesh.geometry.attributes.position.needsUpdate = true;
    }

    createPlaneHelper() {
        const geometry = new THREE.PlaneGeometry(10, 10);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
    }

    setupToolbar() {
        const toolButtons = document.querySelectorAll('.tool-button');
        const toolInfo = document.getElementById('tool-info');

        toolButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                toolButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                this.currentTool = button.dataset.tool;

                // Mettre à jour le message d'aide de manière synchrone
                if (toolInfo) {
                    switch(this.currentTool) {
                        case 'orbit':
                            toolInfo.textContent = "Utilisez le clic gauche pour orbiter, le clic droit pour se déplacer";
                            break;
                        case 'interact':
                            toolInfo.textContent = "Cliquez et déplacez pour interagir avec le fluide";
                            break;
                        case 'rotate-plane':
                            toolInfo.textContent = "Cliquez et déplacez pour faire pivoter le plan";
                            break;
                        case 'add-force':
                            toolInfo.textContent = "Cliquez pour ajouter une force directionnelle";
                            break;
                        case 'add-obstacle':
                            toolInfo.textContent = "Cliquez pour placer un obstacle";
                            break;
                        case 'source':
                            toolInfo.textContent = "Cliquez pour ajouter une source de fluide";
                            break;
                    }
                    toolInfo.style.display = 'block';
                }
            }, { passive: true });
        });
    }

    handleMouseMove(event, camera) {
        event.preventDefault();
        this.mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;

        if (this.isInteracting) {
            this.raycaster.setFromCamera(this.mousePosition, camera);
            
            switch(this.currentTool) {
                case 'interact':
                    const intersectPoint = new THREE.Vector3();
                    if (this.raycaster.ray.intersectPlane(this.plane, intersectPoint)) {
                        requestAnimationFrame(() => this.applyForceToNearbyParticles(intersectPoint));
                    }
                    break;
                case 'rotate-plane':
                    if (event.movementX || event.movementY) {
                        const rotationSpeed = 0.01;
                        this.plane.normal.applyAxisAngle(
                            new THREE.Vector3(1, 0, 0),
                            event.movementY * rotationSpeed
                        );
                        this.plane.normal.applyAxisAngle(
                            new THREE.Vector3(0, 1, 0),
                            -event.movementX * rotationSpeed
                        );
                        this.planeHelper.rotation.setFromVector3(this.plane.normal);
                    }
                    break;
            }
        }
    }

    handleMouseDown(event, camera) {
        event.preventDefault();
        this.isInteracting = true;
        this.raycaster.setFromCamera(this.mousePosition, camera);

        switch(this.currentTool) {
            case 'add-obstacle':
            case 'source':
                const intersectPoint = new THREE.Vector3();
                if (this.raycaster.ray.intersectPlane(this.plane, intersectPoint)) {
                    requestAnimationFrame(() => {
                        if (this.currentTool === 'add-obstacle') {
                            this.addObstacle(intersectPoint);
                        } else {
                            this.addSource(intersectPoint);
                        }
                    });
                }
                break;
        }
    }

    handleMouseUp(event) {
        event.preventDefault();
        this.isInteracting = false;
    }

    addObstacle(position) {
        const obstacle = {
            position: position.clone(),
            radius: 0.5
        };
        this.obstacles.push(obstacle);
    }

    addSource(position) {
        const source = {
            position: position.clone(),
            rate: 10, // particules par seconde
            lastSpawn: 0
        };
        this.sources.push(source);
    }

    applyForceToNearbyParticles(center) {
        for (let i = 0; i < this.particles.length; i++) {
            const distance = center.distanceTo(this.particles[i]);
            if (distance < this.params.interactionRadius) {
                const force = center.clone().sub(this.particles[i]);
                force.normalize().multiplyScalar(this.params.interactionForce * (1 - distance / this.params.interactionRadius));
                this.velocities[i].add(force);
            }
        }
    }

    updateSources(dt) {
        const now = Date.now();
        const allSources = [...this.sources, ...this.scenarioSources];
        
        allSources.forEach(source => {
            if (now - source.lastSpawn > 1000 / source.rate) {
                const position = source.position.clone().add(
                    new THREE.Vector3(
                        (Math.random() - 0.5) * 0.1,
                        (Math.random() - 0.5) * 0.1,
                        (Math.random() - 0.5) * 0.1
                    )
                );
                const velocity = source.velocity ? source.velocity.clone() : new THREE.Vector3(0, 0, 0);
                this.addParticleWithVelocity(position, velocity);
                source.lastSpawn = now;
            }
        });
    }

    addParticleWithVelocity(position, velocity) {
        if (this.particles.length < this.params.particleCount) {
            this.particles.push(position);
            this.velocities.push(velocity);
            this.accelerations.push(new THREE.Vector3(0, -this.params.gravity, 0));
            this.densities.push(0);
            this.pressures.push(0);
            this.neighbors.push([]);
            this.updateGeometry();
        }
    }

    handleObstacleCollisions(position, velocity) {
        this.obstacles.forEach(obstacle => {
            const toObstacle = position.clone().sub(obstacle.position);
            const distance = toObstacle.length();
            if (distance < obstacle.radius) {
                const normal = toObstacle.normalize();
                position.copy(obstacle.position.clone().add(normal.multiplyScalar(obstacle.radius)));
                const reflection = velocity.clone().reflect(normal);
                velocity.copy(reflection.multiplyScalar(this.params.damping));
            }
        });
    }

    setupControls() {
        // Mise à jour des valeurs affichées de manière synchrone
        const updateValue = (id, value) => {
            const element = document.getElementById(id + 'Value');
            if (element) {
                element.textContent = value.toString();
            }
        };

        // Configuration des contrôles
        Object.keys(this.params).forEach(param => {
            const element = document.getElementById(param);
            if (element) {
                element.value = this.params[param];
                updateValue(param, this.params[param]);

                element.addEventListener('input', (e) => {
                    e.preventDefault();
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value)) {
                        this.params[param] = value;
                        updateValue(param, value);

                        // Mises à jour spécifiques synchrones
                        switch(param) {
                            case 'particleCount':
                                requestAnimationFrame(() => this.resetSimulation());
                                break;
                            case 'particleSize':
                                if (this.mesh && this.mesh.material) {
                                    this.mesh.material.size = value;
                                }
                                break;
                            case 'gravity':
                                this.accelerations.forEach(acc => acc.y = -value);
                                break;
                            case 'smoothingLength':
                                this.kernels = this.initKernels();
                                break;
                        }
                    }
                }, { passive: true });
            }
        });

        // Gestion des boutons
        const resetButton = document.getElementById('resetSimulation');
        if (resetButton) {
            resetButton.addEventListener('click', (e) => {
                e.preventDefault();
                requestAnimationFrame(() => this.resetSimulation());
            }, { passive: true });
        }

        const colorButton = document.getElementById('randomizeColors');
        if (colorButton) {
            colorButton.addEventListener('click', (e) => {
                e.preventDefault();
                requestAnimationFrame(() => this.randomizeColors());
            }, { passive: true });
        }
    }

    resetSimulation() {
        this.particles = [];
        this.velocities = [];
        this.initSimulation();
        this.updateGeometry();
    }

    randomizeColors() {
        const colors = new Float32Array(this.params.particleCount * 3);
        for (let i = 0; i < this.params.particleCount; i++) {
            colors[i * 3] = Math.random();
            colors[i * 3 + 1] = Math.random();
            colors[i * 3 + 2] = Math.random();
        }
        this.mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.mesh.material.vertexColors = true;
    }

    generateGridLines() {
        // Cette méthode n'est plus nécessaire car nous n'utilisons plus de grille
        return [];
    }

    createMesh() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.params.particleCount * 3);
        
        for (let i = 0; i < this.params.particleCount; i++) {
            positions[i * 3] = this.particles[i].x;
            positions[i * 3 + 1] = this.particles[i].y;
            positions[i * 3 + 2] = this.particles[i].z;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: 0x00ffff,
            size: this.params.particleSize,
            transparent: true,
            opacity: 0.8
        });

        this.mesh = new THREE.Points(geometry, material);
    }

    updateGeometry() {
        const positions = new Float32Array(this.params.particleCount * 3);
        for (let i = 0; i < this.params.particleCount; i++) {
            positions[i * 3] = this.particles[i].x;
            positions[i * 3 + 1] = this.particles[i].y;
            positions[i * 3 + 2] = this.particles[i].z;
        }
        this.mesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    }

    handleGridCollision(position, velocity) {
        // Collision avec le plan horizontal (Y=0)
        if (Math.abs(position.y) < this.params.collisionThreshold && velocity.y < 0) {
            position.y = 0;
            
            // Réflexion plus douce sur le plan
            velocity.y = Math.abs(velocity.y) * this.params.damping;
            
            // Friction avec le plan
            const friction = 0.98;
            velocity.x *= friction;
            velocity.z *= friction;

            // Ajout d'une légère perturbation pour plus de réalisme
            if (Math.random() < 0.1) {  // 10% de chance d'ajouter une perturbation
                const perturbation = 0.05;
                velocity.x += (Math.random() - 0.5) * perturbation;
                velocity.z += (Math.random() - 0.5) * perturbation;
            }
        }

        // Limites du plan pour éviter que les particules ne s'échappent trop loin
        const planLimit = 10;
        if (Math.abs(position.x) > planLimit) {
            position.x = Math.sign(position.x) * planLimit;
            velocity.x *= -this.params.damping;
        }
        if (Math.abs(position.z) > planLimit) {
            position.z = Math.sign(position.z) * planLimit;
            velocity.z *= -this.params.damping;
        }
    }

    handleBoundaryCollisions(index) {
        const position = this.particles[index];
        const velocity = this.velocities[index];

        if (position.x < this.boundingBox.min.x) {
            position.x = this.boundingBox.min.x;
            velocity.x = Math.abs(velocity.x) * this.params.damping;
        } else if (position.x > this.boundingBox.max.x) {
            position.x = this.boundingBox.max.x;
            velocity.x = -Math.abs(velocity.x) * this.params.damping;
        }

        if (position.y < this.boundingBox.min.y) {
            position.y = this.boundingBox.min.y;
            velocity.y = Math.abs(velocity.y) * this.params.damping;
        } else if (position.y > this.boundingBox.max.y) {
            position.y = this.boundingBox.max.y;
            velocity.y = -Math.abs(velocity.y) * this.params.damping;
        }

        if (position.z < this.boundingBox.min.z) {
            position.z = this.boundingBox.min.z;
            velocity.z = Math.abs(velocity.z) * this.params.damping;
        } else if (position.z > this.boundingBox.max.z) {
            position.z = this.boundingBox.max.z;
            velocity.z = -Math.abs(velocity.z) * this.params.damping;
        }
    }

    getHashKey(x, y, z) {
        // Fonction de hachage spatial simple pour les coordonnées 3D
        const p1 = 73856093;   // Nombres premiers pour éviter les collisions
        const p2 = 19349663;
        const p3 = 83492791;
        return `${Math.floor(x * p1)}|${Math.floor(y * p2)}|${Math.floor(z * p3)}`;
    }

    setupScenarios() {
        const scenarioButtons = document.querySelectorAll('.scenario-button');
        scenarioButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                scenarioButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                const scenario = button.dataset.scenario;
                this.loadScenario(scenario);
            });
        });
    }

    loadScenario(scenario) {
        this.currentScenario = scenario;
        this.clearSources();
        this.clearObstacles();
        
        switch(scenario) {
            case 'waterfall':
                this.setupWaterfall();
                break;
            case 'lake':
                this.setupLake();
                break;
            case 'waves':
                this.setupWaves();
                break;
            case 'fountain':
                this.setupFountain();
                break;
            case 'rain':
                this.setupRain();
                break;
            case 'whirlpool':
                this.setupWhirlpool();
                break;
            default:
                this.resetSimulation();
                break;
        }
    }

    clearSources() {
        this.sources = [];
        this.scenarioSources = [];
    }

    clearObstacles() {
        this.obstacles = [];
    }

    setupWaterfall() {
        // Création d'une cascade
        const sourceCount = 10;
        for (let i = 0; i < sourceCount; i++) {
            this.scenarioSources.push({
                position: new THREE.Vector3(-4 + (i * 0.8), 4, 0),
                rate: this.params.sourceRate,
                lastSpawn: 0,
                velocity: new THREE.Vector3(0.5, -2, 0)
            });
        }
        // Ajout d'obstacles pour créer des paliers
        this.addObstacle(new THREE.Vector3(-2, 2, 0), 1);
        this.addObstacle(new THREE.Vector3(2, 1, 0), 1);
    }

    setupLake() {
        // Création d'un lac calme
        this.params.viscosity = 1.0;
        this.params.surfaceTension = 0.5;
        this.initSimulation();
        // Ajout de bords pour contenir l'eau
        this.addObstacle(new THREE.Vector3(-4, 0, 0), 0.5);
        this.addObstacle(new THREE.Vector3(4, 0, 0), 0.5);
        this.addObstacle(new THREE.Vector3(0, 0, -4), 0.5);
        this.addObstacle(new THREE.Vector3(0, 0, 4), 0.5);
    }

    setupWaves() {
        this.params.viscosity = 0.3;
        this.params.surfaceTension = 0.1;
        this.initSimulation();
        
        // Générateur de vagues
        setInterval(() => {
            if (this.currentScenario === 'waves') {
                const time = Date.now() * 0.001;
                for (let i = 0; i < this.particles.length; i++) {
                    const x = this.particles[i].x;
                    const z = this.particles[i].z;
                    this.velocities[i].y += 
                        Math.sin(time * this.params.waveFrequency + x * 0.5) * 
                        Math.cos(time * this.params.waveFrequency + z * 0.5) * 
                        this.params.waveAmplitude;
                }
            }
        }, 16);
    }

    setupFountain() {
        // Création d'une fontaine centrale
        const centerSource = {
            position: new THREE.Vector3(0, 0, 0),
            rate: this.params.sourceRate * 2,
            lastSpawn: 0,
            velocity: new THREE.Vector3(0, 4, 0)
        };
        this.scenarioSources.push(centerSource);

        // Sources secondaires pour l'effet de fontaine
        const subSourceCount = 8;
        for (let i = 0; i < subSourceCount; i++) {
            const angle = (i / subSourceCount) * Math.PI * 2;
            this.scenarioSources.push({
                position: new THREE.Vector3(
                    Math.cos(angle) * 2,
                    2,
                    Math.sin(angle) * 2
                ),
                rate: this.params.sourceRate,
                lastSpawn: 0,
                velocity: new THREE.Vector3(
                    Math.cos(angle) * 1.5,
                    2,
                    Math.sin(angle) * 1.5
                )
            });
        }
    }

    setupRain() {
        // Création de sources de pluie
        const rainSourceCount = 20;
        for (let i = 0; i < rainSourceCount; i++) {
            this.scenarioSources.push({
                position: new THREE.Vector3(
                    (Math.random() - 0.5) * 8,
                    5,
                    (Math.random() - 0.5) * 8
                ),
                rate: this.params.sourceRate / 2,
                lastSpawn: 0,
                velocity: new THREE.Vector3(0, -3, 0)
            });
        }
    }

    setupWhirlpool() {
        this.params.viscosity = 0.2;
        this.params.surfaceTension = 0.1;
        this.initSimulation();

        // Force de tourbillon
        setInterval(() => {
            if (this.currentScenario === 'whirlpool') {
                const center = new THREE.Vector3(0, 0, 0);
                for (let i = 0; i < this.particles.length; i++) {
                    const toCenter = center.clone().sub(this.particles[i]);
                    const distance = toCenter.length();
                    if (distance > 0.1) {
                        const tangent = new THREE.Vector3(-toCenter.z, 0, toCenter.x).normalize();
                        const force = tangent.multiplyScalar(
                            this.params.whirlpoolStrength / Math.max(1, distance)
                        );
                        this.velocities[i].add(force);
                    }
                }
            }
        }, 16);
    }
} 