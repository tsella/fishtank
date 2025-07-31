import { Fish } from './Fish.js';

export class Dragonfish extends Fish {
    createModel() {
        const bodyGeo = new THREE.CylinderGeometry(this.height / 4, this.height / 4, this.width, 32);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4B0082 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.rotation.z = Math.PI / 2;
        this.object.add(body);

        const tailGeo = new THREE.PlaneGeometry(this.width / 2, this.height);
        const tailMat = new THREE.MeshStandardMaterial({ color: 0x4B0082, side: THREE.DoubleSide });
        const tail = new THREE.Mesh(tailGeo, tailMat);
        tail.position.x = -this.width / 2;
        this.object.add(tail);
    }
}
