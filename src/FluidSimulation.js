import * as THREE from 'three';

export class FluidSimulation {
    constructor(particleCount = 1000) {
        // Paramètres modifiables
        this.params = {
            particleCount: particleCount,
            particleSize: 0.1,
            gravity: 9.81,
            damping: 0.5,
            gridSize: 1,
            collisionThreshold: 0.1,
            interactionForce: 5,
            interactionRadius: 1
        };

        this.particles = [];
        this.velocities = [];
        this.acceleration = new THREE.Vector3(0, -this.params.gravity, 0);
        this.boundingBox = new THREE.Box3(
            new THREE.Vector3(-5, -5, -5),
            new THREE.Vector3(5, 5, 5)
        );
        this.gridLines = this.generateGridLines();
        this.currentTool = 'orbit';
        this.interactionPoint = new THREE.Vector3();
        this.raycaster = new THREE.Raycaster();
        this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.planeHelper = this.createPlaneHelper();
        this.mousePosition = new THREE.Vector2();
        this.isInteracting = false;
        this.sources = [];
        this.obstacles = [];

        this.initParticles();
        this.createMesh();
        this.setupControls();
        this.setupToolbar();
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
            button.addEventListener('click', () => {
                toolButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                this.currentTool = button.dataset.tool;

                // Mettre à jour le message d'aide
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
            });
        });
    }

    handleMouseMove(event, camera) {
        this.mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;

        if (this.isInteracting) {
            this.raycaster.setFromCamera(this.mousePosition, camera);
            
            switch(this.currentTool) {
                case 'interact':
                    const intersects = this.raycaster.ray.intersectPlane(this.plane, this.interactionPoint);
                    if (intersects) {
                        this.applyForceToNearbyParticles(this.interactionPoint);
                    }
                    break;
                case 'rotate-plane':
                    // Rotation du plan basée sur le mouvement de la souris
                    const rotationSpeed = 0.01;
                    this.plane.normal.applyAxisAngle(new THREE.Vector3(1, 0, 0), event.movementY * rotationSpeed);
                    this.plane.normal.applyAxisAngle(new THREE.Vector3(0, 1, 0), -event.movementX * rotationSpeed);
                    this.planeHelper.rotation.setFromVector3(this.plane.normal);
                    break;
            }
        }
    }

    handleMouseDown(event, camera) {
        this.isInteracting = true;
        this.raycaster.setFromCamera(this.mousePosition, camera);

        switch(this.currentTool) {
            case 'add-obstacle':
                const intersectPoint = new THREE.Vector3();
                if (this.raycaster.ray.intersectPlane(this.plane, intersectPoint)) {
                    this.addObstacle(intersectPoint);
                }
                break;
            case 'source':
                const sourcePoint = new THREE.Vector3();
                if (this.raycaster.ray.intersectPlane(this.plane, sourcePoint)) {
                    this.addSource(sourcePoint);
                }
                break;
        }
    }

    handleMouseUp() {
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
        this.sources.forEach(source => {
            if (now - source.lastSpawn > 1000 / source.rate) {
                this.addParticleAtPosition(source.position.clone().add(
                    new THREE.Vector3(
                        (Math.random() - 0.5) * 0.1,
                        0.1,
                        (Math.random() - 0.5) * 0.1
                    )
                ));
                source.lastSpawn = now;
            }
        });
    }

    addParticleAtPosition(position) {
        this.particles.push(position);
        this.velocities.push(new THREE.Vector3(0, 0, 0));
        this.updateGeometry();
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
        // Mise à jour des valeurs affichées
        const updateValue = (id, value) => {
            const element = document.getElementById(id + 'Value');
            if (element) element.textContent = value;
        };

        // Configuration des contrôles
        Object.keys(this.params).forEach(param => {
            const element = document.getElementById(param);
            if (element) {
                element.value = this.params[param];
                updateValue(param, this.params[param]);

                element.addEventListener('input', (e) => {
                    this.params[param] = parseFloat(e.target.value);
                    updateValue(param, this.params[param]);

                    // Mises à jour spécifiques selon le paramètre
                    switch(param) {
                        case 'particleCount':
                            this.resetSimulation();
                            break;
                        case 'particleSize':
                            this.mesh.material.size = this.params.particleSize;
                            break;
                        case 'gravity':
                            this.acceleration.y = -this.params.gravity;
                            break;
                        case 'gridSize':
                            this.gridLines = this.generateGridLines();
                            break;
                    }
                });
            }
        });

        // Bouton de réinitialisation
        const resetButton = document.getElementById('resetSimulation');
        if (resetButton) {
            resetButton.addEventListener('click', () => this.resetSimulation());
        }

        // Bouton de couleurs aléatoires
        const colorButton = document.getElementById('randomizeColors');
        if (colorButton) {
            colorButton.addEventListener('click', () => this.randomizeColors());
        }
    }

    resetSimulation() {
        this.particles = [];
        this.velocities = [];
        this.initParticles();
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
        const lines = [];
        const size = 5;
        
        for (let i = -size; i <= size; i += this.params.gridSize) {
            lines.push({
                start: new THREE.Vector3(-size, 0, i),
                end: new THREE.Vector3(size, 0, i),
                normal: new THREE.Vector3(0, 1, 0)
            });
            
            lines.push({
                start: new THREE.Vector3(i, 0, -size),
                end: new THREE.Vector3(i, 0, size),
                normal: new THREE.Vector3(0, 1, 0)
            });
        }
        return lines;
    }

    initParticles() {
        for (let i = 0; i < this.params.particleCount; i++) {
            const position = new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                Math.random() * 5,
                (Math.random() - 0.5) * 2
            );
            this.particles.push(position);
            this.velocities.push(new THREE.Vector3(0, 0, 0));
        }
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
        // Vérifier la collision avec le plan Y=0 (la grille)
        if (Math.abs(position.y) < this.params.collisionThreshold && velocity.y < 0) {
            position.y = 0;
            velocity.y = Math.abs(velocity.y) * this.params.damping;

            velocity.x += (Math.random() - 0.5) * 0.1;
            velocity.z += (Math.random() - 0.5) * 0.1;
        }

        // Collision avec les lignes verticales de la grille
        const gridX = Math.round(position.x / this.params.gridSize) * this.params.gridSize;
        const gridZ = Math.round(position.z / this.params.gridSize) * this.params.gridSize;

        if (Math.abs(position.x - gridX) < this.params.collisionThreshold) {
            velocity.x *= -this.params.damping;
            position.x = gridX + (position.x < gridX ? -this.params.collisionThreshold : this.params.collisionThreshold);
        }

        if (Math.abs(position.z - gridZ) < this.params.collisionThreshold) {
            velocity.z *= -this.params.damping;
            position.z = gridZ + (position.z < gridZ ? -this.params.collisionThreshold : this.params.collisionThreshold);
        }
    }

    update() {
        const dt = 0.016;

        // Mise à jour des sources
        this.updateSources(dt);

        for (let i = 0; i < this.particles.length; i++) {
            this.velocities[i].add(this.acceleration.clone().multiplyScalar(dt));
            this.particles[i].add(this.velocities[i].clone().multiplyScalar(dt));
            
            // Collisions
            this.handleBoundaryCollisions(i);
            this.handleGridCollision(this.particles[i], this.velocities[i]);
            this.handleObstacleCollisions(this.particles[i], this.velocities[i]);
        }

        const positions = this.mesh.geometry.attributes.position.array;
        for (let i = 0; i < this.particles.length; i++) {
            positions[i * 3] = this.particles[i].x;
            positions[i * 3 + 1] = this.particles[i].y;
            positions[i * 3 + 2] = this.particles[i].z;
        }
        this.mesh.geometry.attributes.position.needsUpdate = true;
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
} 