export class Sunrays {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.object = new THREE.Group();
        this.material = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });

        for (let i = 0; i < 5; i++) {
            const geo = new THREE.PlaneGeometry(40, this.world.height * 1.5);
            const ray = new THREE.Mesh(geo, this.material);
            const xPos = (this.world.width / 5) * (i + 0.5) - this.world.width / 2;
            ray.position.set(xPos, 0, -200);
            ray.rotation.z = Math.PI / 16;
            this.object.add(ray);
        }
        this.scene.add(this.object);
    }

    update(deltaTime) {
        this.object.children.forEach((ray, i) => {
            ray.position.x += Math.sin(Date.now() * 0.0005 + i) * 0.5;
        });
    }

    setVisible(visible) {
        this.object.visible = visible;
    }
}
