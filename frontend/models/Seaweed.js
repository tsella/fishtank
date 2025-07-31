export class Seaweed {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.object = new THREE.Group();

        for (let i = 0; i < 8; i++) {
            const weed = this.createSeaweedSegment();
            const xPos = (this.world.width / 8) * (i + 0.5) - this.world.width / 2;
            weed.position.set(xPos, -this.world.height / 2, -200);
            this.object.add(weed);
        }
        this.scene.add(this.object);
    }

    createSeaweedSegment() {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x228B22 });
        const height = 100 + Math.random() * 150;
        
        const baseGeo = new THREE.BoxGeometry(10, height, 10);
        const base = new THREE.Mesh(baseGeo, mat);
        base.position.y = height / 2;
        group.add(base);

        return group;
    }

    update(deltaTime) {
        this.object.children.forEach((weed, i) => {
            weed.rotation.z = Math.sin(Date.now() * 0.001 + i) * 0.1;
        });
    }
}
