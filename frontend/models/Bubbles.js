export class Bubbles {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.particles = [];
        this.geometry = new THREE.SphereGeometry(1, 8, 8);
        this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });

        for (let i = 0; i < 20; i++) {
            const bubble = new THREE.Mesh(this.geometry, this.material);
            bubble.position.set(
                Math.random() * this.world.width - this.world.width / 2,
                Math.random() * this.world.height - this.world.height / 2,
                Math.random() * 400 - 200
            );
            bubble.scale.setScalar(Math.random() * 5 + 2);
            this.particles.push(bubble);
            this.scene.add(bubble);
        }
    }

    update(deltaTime) {
        this.particles.forEach(p => {
            p.position.y += 50 * deltaTime;
            if (p.position.y > this.world.height / 2) {
                p.position.y = -this.world.height / 2;
            }
        });
    }
}
