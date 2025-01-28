# Simulation de Mécanique des Fluides avec Three.js

Ce projet est une simulation de mécanique des fluides basée sur un système de particules, utilisant Three.js pour la visualisation 3D dans le navigateur.

## Fonctionnalités

- Simulation de particules avec physique basique
- Visualisation 3D interactive
- Contrôles de caméra orbitaux
- Gestion des collisions avec les limites
- Interface utilisateur pour ajuster les paramètres (à venir)

## Prérequis

- Node.js (version 14 ou supérieure)
- npm (inclus avec Node.js)

## Installation

1. Clonez ce dépôt :
```bash
git clone [URL_DU_REPO]
cd fluid-simulation
```

2. Installez les dépendances :
```bash
npm install
```

## Utilisation

Pour lancer le serveur de développement :
```bash
npm run dev
```

L'application s'ouvrira automatiquement dans votre navigateur par défaut.

Pour construire la version de production :
```bash
npm run build
```

## Contrôles

- Clic gauche + déplacement : Rotation de la caméra
- Clic droit + déplacement : Translation de la caméra
- Molette de souris : Zoom avant/arrière

## Structure du Projet

```
fluid-simulation/
├── src/
│   ├── main.js           # Point d'entrée de l'application
│   └── FluidSimulation.js # Logique de simulation des fluides
├── index.html            # Page HTML principale
├── package.json          # Configuration npm et dépendances
├── vite.config.js        # Configuration de Vite
└── README.md            # Ce fichier
```

## Développement Futur

- Amélioration de la physique des fluides
- Ajout d'interactions utilisateur
- Optimisation des performances
- Ajout de différents types de fluides
- Visualisation de la pression et de la vélocité

## Licence

MIT 