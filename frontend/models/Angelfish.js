import { Fish } from './Fish.js';

export class Angelfish extends Fish {
    createModel() {
        const bodyGeo = new THREE.CylinderGeometry(this.height / 2, this.height / 2, this.width / 4, 32);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xFFD700 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.rotation.z = Math.PI / 2;
        this.object.add(body);

        const tailGeo = new THREE.PlaneGeometry(this.width / 2, this.height);
        const tailMat = new THREE.MeshStandardMaterial({ color: 0xFFD700, side: THREE.DoubleSide });
        const tail = new THREE.Mesh(tailGeo, tailMat);
        tail.position.x = -this.width / 4;
        this.object.add(tail);
    }
}
