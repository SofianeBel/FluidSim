import * as THREE from 'three';

export class FluidSimulation {
    constructor(particleCount = 1000) {
        this.particleCount = particleCount;
        this.particles = [];
        this.velocities = [];
        this.acceleration = new THREE.Vector3(0, -9.81, 0); // Gravité
        this.boundingBox = new THREE.Box3(
            new THREE.Vector3(-5, -5, -5),
            new THREE.Vector3(5, 5, 5)
        );

        this.initParticles();
        this.createMesh();
    }

    initParticles() {
        for (let i = 0; i < this.particleCount; i++) {
            // Position aléatoire dans une sphère
            const position = new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                Math.random() * 5,
                (Math.random() - 0.5) * 2
            );
            this.particles.push(position);
            
            // Vitesse initiale
            this.velocities.push(new THREE.Vector3(0, 0, 0));
        }
    }

    createMesh() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.particleCount * 3);
        
        for (let i = 0; i < this.particleCount; i++) {
            positions[i * 3] = this.particles[i].x;
            positions[i * 3 + 1] = this.particles[i].y;
            positions[i * 3 + 2] = this.particles[i].z;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: 0x00ffff,
            size: 0.1,
            transparent: true,
            opacity: 0.8
        });

        this.mesh = new THREE.Points(geometry, material);
    }

    update() {
        const dt = 0.016; // Pas de temps fixe (environ 60 FPS)

        for (let i = 0; i < this.particleCount; i++) {
            // Mise à jour des vitesses
            this.velocities[i].add(this.acceleration.clone().multiplyScalar(dt));
            
            // Mise à jour des positions
            this.particles[i].add(this.velocities[i].clone().multiplyScalar(dt));

            // Gestion des collisions avec la boîte
            this.handleBoundaryCollisions(i);
        }

        // Mise à jour de la géométrie
        const positions = this.mesh.geometry.attributes.position.array;
        for (let i = 0; i < this.particleCount; i++) {
            positions[i * 3] = this.particles[i].x;
            positions[i * 3 + 1] = this.particles[i].y;
            positions[i * 3 + 2] = this.particles[i].z;
        }
        this.mesh.geometry.attributes.position.needsUpdate = true;
    }

    handleBoundaryCollisions(index) {
        const position = this.particles[index];
        const velocity = this.velocities[index];
        const damping = 0.5; // Coefficient d'amortissement

        // Vérification des collisions pour chaque axe
        if (position.x < this.boundingBox.min.x) {
            position.x = this.boundingBox.min.x;
            velocity.x = Math.abs(velocity.x) * damping;
        } else if (position.x > this.boundingBox.max.x) {
            position.x = this.boundingBox.max.x;
            velocity.x = -Math.abs(velocity.x) * damping;
        }

        if (position.y < this.boundingBox.min.y) {
            position.y = this.boundingBox.min.y;
            velocity.y = Math.abs(velocity.y) * damping;
        } else if (position.y > this.boundingBox.max.y) {
            position.y = this.boundingBox.max.y;
            velocity.y = -Math.abs(velocity.y) * damping;
        }

        if (position.z < this.boundingBox.min.z) {
            position.z = this.boundingBox.min.z;
            velocity.z = Math.abs(velocity.z) * damping;
        } else if (position.z > this.boundingBox.max.z) {
            position.z = this.boundingBox.max.z;
            velocity.z = -Math.abs(velocity.z) * damping;
        }
    }
} 