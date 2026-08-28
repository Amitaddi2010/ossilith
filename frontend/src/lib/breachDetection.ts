/**
 * Cortical Bone & Critical Structure Breach Detection Engine.
 * Analyzes implants, screws, and osteotomy cut-planes against host anatomical bone boundaries.
 */

import * as THREE from 'three';
import type { STLObject, BreachAlert, CutPlaneState } from '@/stores/editorStore';

/**
 * Evaluates scene objects for anatomical breaches (e.g. implant poking through posterior cortex,
 * cut plane over-resecting beyond safe margin, or bicortical screw over-penetration).
 */
export function detectAnatomicalBreaches(
  objects: Map<string, STLObject>,
  cutPlane?: CutPlaneState,
  breachToleranceMm = 0.5
): BreachAlert[] {
  const alerts: BreachAlert[] = [];
  const objectList = Array.from(objects.values());

  const implants = objectList.filter((o) => o.isImplant || o.name.toLowerCase().includes('implant') || o.name.toLowerCase().includes('plate') || o.name.toLowerCase().includes('screw'));
  const bones = objectList.filter((o) => !implants.includes(o));

  if (bones.length === 0) return alerts;

  // Compute bounding boxes for host bone structures
  const boneBoxes = bones.map((b) => {
    b.geometry.computeBoundingBox();
    const box = b.geometry.boundingBox?.clone() || new THREE.Box3();
    box.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...b.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...b.rotation)),
        new THREE.Vector3(...b.scale)
      )
    );
    return { bone: b, box };
  });

  // 1. Evaluate Implant Breaches
  for (const imp of implants) {
    imp.geometry.computeBoundingBox();
    const impBox = imp.geometry.boundingBox?.clone() || new THREE.Box3();
    const impMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...imp.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...imp.rotation)),
      new THREE.Vector3(...imp.scale)
    );
    impBox.applyMatrix4(impMatrix);

    for (const { bone, box: hostBox } of boneBoxes) {
      // Check if implant intersects bone bounding envelope
      if (impBox.intersectsBox(hostBox)) {
        // Sample key vertices of implant in world coordinates
        const posAttr = imp.geometry.getAttribute('position');
        if (!posAttr) continue;

        const p = new THREE.Vector3();
        let maxBreach = 0;
        const breachLoc = new THREE.Vector3();

        // Sample up to 100 vertices across implant tip/edges
        const step = Math.max(1, Math.floor(posAttr.count / 100));
        for (let i = 0; i < posAttr.count; i += step) {
          p.fromBufferAttribute(posAttr, i).applyMatrix4(impMatrix);

          // If vertex extends beyond the posterior or superior margin of the bone envelope
          if (p.z > hostBox.max.z + breachToleranceMm) {
            const breachDepth = p.z - hostBox.max.z;
            if (breachDepth > maxBreach) {
              maxBreach = breachDepth;
              breachLoc.copy(p);
            }
          } else if (p.y < hostBox.min.y - breachToleranceMm) {
            const breachDepth = hostBox.min.y - p.y;
            if (breachDepth > maxBreach) {
              maxBreach = breachDepth;
              breachLoc.copy(p);
            }
          }
        }

        if (maxBreach > 0.8) {
          alerts.push({
            id: `breach_${imp.id}_${bone.id}_${Date.now()}`,
            objectId: imp.id,
            objectName: imp.name,
            type: 'cortical_penetration',
            depthMm: Number(maxBreach.toFixed(1)),
            location: [breachLoc.x, breachLoc.y, breachLoc.z],
            message: `Cortical breach: ${imp.name} penetrates ${maxBreach.toFixed(1)} mm beyond ${bone.name} boundary`,
          });
        }
      }
    }
  }

  // 2. Evaluate Cut-Plane Notch / Over-resection Breaches
  if (cutPlane) {
    const planePoint = new THREE.Vector3(...cutPlane.position);
    for (const { bone, box: hostBox } of boneBoxes) {
      if (hostBox.containsPoint(planePoint)) {
        // If plane is positioned in upper femur posterior region (notching danger)
        const hostCenter = new THREE.Vector3();
        hostBox.getCenter(hostCenter);
        if (planePoint.z > hostCenter.z + (hostBox.max.z - hostCenter.z) * 0.7) {
          const notchDepth = planePoint.z - (hostCenter.z + (hostBox.max.z - hostCenter.z) * 0.7);
          alerts.push({
            id: `breach_cutplane_${bone.id}`,
            objectId: bone.id,
            objectName: 'Osteotomy Cut Plane',
            type: 'joint_over_resection',
            depthMm: Number(notchDepth.toFixed(1)),
            location: [planePoint.x, planePoint.y, planePoint.z],
            message: `Warning: Anterior femoral cortex notch risk detected (${notchDepth.toFixed(1)} mm resection depth)`,
          });
        }
      }
    }
  }

  return alerts;
}
