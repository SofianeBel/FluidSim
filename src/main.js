import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { FluidSimulation } from './FluidSimulation';

/**
 * The main application class for running the 3D fluid simulation.
 * It initializes the scene, simulation, camera, controls, and event listeners.
 */
class App {
    /**
     * Creates an instance of App and initializes the simulation.
     */
    constructor() {
        this.init();
        this.setupScene();
        this.setupSimulation();
        this.setupControls();
        this.setupEventListeners();
        this.animate();
    }

    /**
     * Initializes the Three.js scene, camera, and renderer.
     */
    init() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);

        // Gestion du redimensionnement
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    /**
     * Sets up the scene including camera configuration, lighting, and helper elements.
     */
    setupScene() {
        // Configuration de la caméra
        this.camera.position.set(5, 5, 5);
        this.camera.lookAt(0, 0, 0);

        // Ajout des contrôles orbitaux
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        // Éclairage
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);

        // Grille de référence
        const gridHelper = new THREE.GridHelper(10, 10);
        this.scene.add(gridHelper);
    }

    /**
     * Initializes the fluid simulation and adds related objects (mesh and helpers) to the scene.
     */
    setupSimulation() {
        this.simulation = new FluidSimulation();
        this.scene.add(this.simulation.mesh);
        this.scene.add(this.simulation.planeHelper);
    }

    /**
     * Enables the orbital controls.
     */
    setupControls() {
        this.controls.enabled = true;
    }

    /**
     * Sets up event listeners for handling user interactions with the simulation.
     */
    setupEventListeners() {
        this.renderer.domElement.addEventListener('mousemove', (event) => {
            if (this.simulation.currentTool === 'orbit') {
                return; // Laisser OrbitControls gérer le mouvement
            }
            this.simulation.handleMouseMove(event, this.camera);
        });

        this.renderer.domElement.addEventListener('mousedown', (event) => {
            if (this.simulation.currentTool === 'orbit') {
                return; // Laisser OrbitControls gérer le clic
            }
            this.simulation.handleMouseDown(event, this.camera);
        });

        this.renderer.domElement.addEventListener('mouseup', () => {
            if (this.simulation.currentTool === 'orbit') {
                return;
            }
            this.simulation.handleMouseUp();
        });

        // Gestion des changements d'outils
        document.querySelectorAll('.tool-button').forEach(button => {
            button.addEventListener('click', () => {
                const tool = button.dataset.tool;
                this.controls.enabled = tool === 'orbit';
            });
        });
    }

    /**
     * Animates the scene by updating controls, simulation, and rendering each frame.
     */
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.controls.update();
        this.simulation.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// Démarrage de l'application
new App(); 