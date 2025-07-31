import { Fish } from './Fish.js';

export class Clownfish extends Fish {
    createModel() {
        const bodyGeo = new THREE.SphereGeometry(this.width / 2, 32, 16);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xFF4500 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        this.object.add(body);

        const tailGeo = new THREE.PlaneGeometry(this.width / 2, this.height);
        const tailMat = new THREE.MeshStandardMaterial({ color: 0xFF4500, side: THREE.DoubleSide });
        const tail = new THREE.Mesh(tailGeo, tailMat);
        tail.position.x = -this.width / 2;
        this.object.add(tail);
    }
}
