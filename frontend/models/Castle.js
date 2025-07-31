export class Castle {
    constructor() {
        this.object = new THREE.Group();
        this.createModel();
    }

    createModel() {
        const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
        
        const baseGeo = new THREE.BoxGeometry(600, 360, 300);
        const base = new THREE.Mesh(baseGeo, mat);
        base.position.y = -180;
        this.object.add(base);

        const towerGeo = new THREE.CylinderGeometry(90, 90, 480, 16);
        const leftTower = new THREE.Mesh(towerGeo, mat);
        leftTower.position.set(-180, -240, 0);
        this.object.add(leftTower);

        const rightTower = new THREE.Mesh(towerGeo, mat);
        rightTower.position.set(180, -240, 0);
        this.object.add(rightTower);
        
        // Position is now relative to center of the world
        this.object.position.set(-660, -260, -300);
    }
}
