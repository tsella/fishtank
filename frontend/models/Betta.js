import { Fish } from './Fish.js';

export class Betta extends Fish {
    createModel() {
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8B008B });
        
        const bodyGroup = new THREE.Group();
        const radius = this.width / 4;
        const length = this.width / 2;

        const cylinderGeo = new THREE.CylinderGeometry(radius, radius, length, 8);
        const cylinder = new THREE.Mesh(cylinderGeo, bodyMat);
        bodyGroup.add(cylinder);

        const sphereGeo = new THREE.SphereGeometry(radius, 8, 4);
        const topCap = new THREE.Mesh(sphereGeo, bodyMat);
        topCap.position.y = length / 2;
        bodyGroup.add(topCap);

        const bottomCap = new THREE.Mesh(sphereGeo, bodyMat);
        bottomCap.position.y = -length / 2;
        bodyGroup.add(bottomCap);
        
        bodyGroup.rotation.z = Math.PI / 2;
        this.object.add(bodyGroup);

        const tailGeo = new THREE.PlaneGeometry(this.width, this.height * 1.5);
        const tailMat = new THREE.MeshStandardMaterial({ color: 0x8B008B, side: THREE.DoubleSide });
        const tail = new THREE.Mesh(tailGeo, tailMat);
        tail.position.x = -this.width / 2;
        this.object.add(tail);
    }
}
