export class Submarine {
    constructor() {
        this.object = new THREE.Group();
        this.createModel();
    }

    createModel() {
        const mat = new THREE.MeshStandardMaterial({ color: 0x444444 });

        const bodyGroup = new THREE.Group();
        const radius = 120;
        const length = 360;

        const cylinderGeo = new THREE.CylinderGeometry(radius, radius, length, 16);
        const cylinder = new THREE.Mesh(cylinderGeo, mat);
        bodyGroup.add(cylinder);

        const sphereGeo = new THREE.SphereGeometry(radius, 16, 8);
        const topCap = new THREE.Mesh(sphereGeo, mat);
        topCap.position.y = length / 2;
        bodyGroup.add(topCap);

        const bottomCap = new THREE.Mesh(sphereGeo, mat);
        bottomCap.position.y = -length / 2;
        bodyGroup.add(bottomCap);

        bodyGroup.rotation.z = Math.PI / 2;
        this.object.add(bodyGroup);


        const towerGeo = new THREE.BoxGeometry(240, 180, 120);
        const tower = new THREE.Mesh(towerGeo, mat);
        tower.position.y = 150;
        this.object.add(tower);

        this.object.position.set(540, -210, -100);
    }
}
