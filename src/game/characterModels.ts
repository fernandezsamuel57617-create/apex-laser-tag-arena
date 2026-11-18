import * as THREE from 'three';
import { clampOutfitLevel, getOutfitById, type OutfitId } from '../shared/outfits';
import type { Gender } from '../shared/types';
import { type WeaponId } from '../shared/weapons';
import { getWeaponSkinById, type WeaponSkinId } from '../shared/weaponSkins';
import { createContactShadowTexture, createEmoteSprite, createNameplateSprite } from './proceduralAssets';

export interface CharacterRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  blasterMesh: THREE.Group;
  shieldBubble: THREE.Mesh;
  nameplate: THREE.Sprite;
  emoteSprite: THREE.Sprite;
  emissiveMaterials: THREE.MeshStandardMaterial[];
  baseEmissiveColor: THREE.Color;
}

let sharedShadowTex: THREE.CanvasTexture | null = null;
function getShadowTexture(): THREE.CanvasTexture {
  if (!sharedShadowTex) {
    sharedShadowTex = createContactShadowTexture();
    sharedShadowTex.userData = { ...sharedShadowTex.userData, isSharedCache: true };
  }
  return sharedShadowTex;
}

function buildWeaponGeometry(
  weaponId: WeaponId,
  chassisMat: THREE.MeshStandardMaterial,
  titaniumMat: THREE.MeshStandardMaterial,
  gripMat: THREE.MeshStandardMaterial,
  coreMat: THREE.MeshStandardMaterial,
  coreColor: THREE.Color,
): { group: THREE.Group; muzzleZ: number; muzzleY: number } {
  const group = new THREE.Group();

  if (weaponId === 'twin_smg') {
    // Compact wide receiver + dual parallel barrels + top energy cell
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.11, 0.28), chassisMat);
    receiver.position.set(0, 0, -0.09);
    group.add(receiver);

    const topCell = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.14, 12), coreMat);
    topCell.rotation.z = Math.PI / 2;
    topCell.position.set(0, 0.068, -0.09);
    group.add(topCell);

    const barrelL = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.22, 10), titaniumMat);
    barrelL.rotation.x = Math.PI / 2;
    barrelL.position.set(-0.028, 0.01, -0.3);
    const barrelR = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.22, 10), titaniumMat);
    barrelR.rotation.x = Math.PI / 2;
    barrelR.position.set(0.028, 0.01, -0.3);
    group.add(barrelL, barrelR);

    const muzzleL = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 8, 14), coreMat);
    muzzleL.position.set(-0.028, 0.01, -0.41);
    const muzzleR = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 8, 14), coreMat);
    muzzleR.position.set(0.028, 0.01, -0.41);
    group.add(muzzleL, muzzleR);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.14, 0.07), gripMat);
    grip.position.set(0, -0.1, 0.0);
    grip.rotation.x = 0.22;
    group.add(grip);

    return { group, muzzleZ: -0.43, muzzleY: 0.01 };
  }

  if (weaponId === 'scatter_shotgun') {
    // Heavy wide scatter chassis + pump shroud + wide prism emitter mouth
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.145, 0.44), chassisMat);
    receiver.position.set(0, 0, -0.15);
    group.add(receiver);

    const upperShroud = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.045, 0.48), titaniumMat);
    upperShroud.position.set(0, 0.082, -0.2);
    group.add(upperShroud);

    const underPump = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.065, 0.28), gripMat);
    underPump.position.set(0, -0.075, -0.26);
    group.add(underPump);

    const sideCoilL = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.036, 0.24), coreMat);
    sideCoilL.position.set(0, 0.015, -0.24);
    group.add(sideCoilL);

    const prismMouth = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.07), coreMat);
    prismMouth.position.set(0, 0.015, -0.45);
    group.add(prismMouth);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.15, 0.08), gripMat);
    grip.position.set(0, -0.115, 0.02);
    grip.rotation.x = 0.28;
    group.add(grip);

    return { group, muzzleZ: -0.49, muzzleY: 0.015 };
  }

  if (weaponId === 'rail_sniper') {
    // Long electromagnetic railgun with split twin rails, tall scope, & stock
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.12, 0.48), chassisMat);
    receiver.position.set(0, 0, -0.14);
    group.add(receiver);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.11, 0.22), gripMat);
    stock.position.set(0, -0.02, 0.18);
    group.add(stock);

    // Split twin electromagnetic rails extending far forward
    const railTop = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.028, 0.56), titaniumMat);
    railTop.position.set(0, 0.045, -0.56);
    const railBottom = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.028, 0.56), titaniumMat);
    railBottom.position.set(0, -0.02, -0.56);
    group.add(railTop, railBottom);

    // Glowing rail core running between rails
    const beamCore = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.024, 0.54), coreMat);
    beamCore.position.set(0, 0.012, -0.54);
    group.add(beamCore);

    // Long precision optical scope
    const scopeMount = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.12), titaniumMat);
    scopeMount.position.set(0, 0.082, -0.12);
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.026, 0.28, 12), chassisMat);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.115, -0.12);
    const scopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.022, 12), coreMat);
    scopeLens.position.set(0, 0.115, -0.262);
    scopeLens.rotation.y = Math.PI;
    group.add(scopeMount, scopeTube, scopeLens);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.075), gripMat);
    grip.position.set(0, -0.11, 0.02);
    grip.rotation.x = 0.22;
    group.add(grip);

    return { group, muzzleZ: -0.84, muzzleY: 0.012 };
  }

  // Default: pulse_carbine
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.125, 0.42), chassisMat);
  receiver.position.set(0, 0, -0.14);
  group.add(receiver);

  const upperRail = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.048, 0.5), titaniumMat);
  upperRail.position.set(0, 0.072, -0.18);
  group.add(upperRail);

  const coreTube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 12), coreMat);
  coreTube.rotation.x = Math.PI / 2;
  coreTube.position.set(0, 0.015, -0.2);
  group.add(coreTube);

  const sideCoreL = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.022, 0.26), coreMat);
  sideCoreL.position.set(0, 0.02, -0.17);
  group.add(sideCoreL);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.26, 12), titaniumMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, -0.015, -0.43);
  group.add(barrel);

  const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 8, 18), coreMat);
  muzzleRing.position.set(0, 0.015, -0.55);
  group.add(muzzleRing);

  const sightFrame = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.038, 0.06), chassisMat);
  sightFrame.position.set(0, 0.112, -0.06);
  group.add(sightFrame);

  const sightGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.036, 0.028),
    new THREE.MeshBasicMaterial({
      color: coreColor,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  sightGlass.position.set(0, 0.116, -0.06);
  group.add(sightGlass);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.15, 0.078), gripMat);
  grip.position.set(0, -0.11, -0.01);
  grip.rotation.x = 0.24;
  group.add(grip);

  return { group, muzzleZ: -0.57, muzzleY: 0.015 };
}

export function createCharacterRig(
  gender: Gender,
  name: string,
  isBot: boolean,
  accentHex: string,
  outfitId: OutfitId = 'default',
  country?: string,
  weaponSkinId: WeaponSkinId = 'default',
  weaponId: WeaponId = 'pulse_carbine',
  outfitLevel = 1,
): CharacterRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const outfit = getOutfitById(outfitId);
  const lvl = clampOutfitLevel(outfitLevel);
  const weaponSkin = getWeaponSkinById(weaponSkinId);
  const isDefaultOutfit = outfit.id === 'default';
  const accentColor = new THREE.Color(isDefaultOutfit ? accentHex : outfit.trimHex);

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0x7a4b31,
    roughness: 0.58,
    metalness: 0.04,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x1b1613,
    roughness: 0.92,
    metalness: 0.02,
  });
  const vestMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(outfit.vestHex),
    roughness: 0.35,
    metalness: 0.72,
  });
  const neonMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 1.45 + (lvl - 1) * 0.35,
    roughness: 0.2,
    metalness: 0.3,
  });
  const blasterBodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(weaponSkin.bodyHex),
    roughness: weaponSkin.roughness,
    metalness: weaponSkin.metalness,
  });
  const blasterTitaniumMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(weaponSkin.railHex),
    roughness: Math.max(0.14, weaponSkin.roughness - 0.06),
    metalness: Math.min(0.96, weaponSkin.metalness + 0.05),
  });
  const blasterGripMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(weaponSkin.gripHex),
    roughness: 0.8,
    metalness: 0.15,
  });
  const blasterCoreColor = new THREE.Color(
    weaponSkin.id === 'default' ? accentHex : weaponSkin.coreHex,
  );
  const blasterRailMat = new THREE.MeshStandardMaterial({
    color: blasterCoreColor,
    emissive: blasterCoreColor,
    emissiveIntensity: 1.7,
    roughness: 0.2,
    metalness: 0.35,
  });

  // Ground contact shadow plane
  const shadowGeo = new THREE.PlaneGeometry(1.15, 1.15);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: getShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.52,
  });
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.02;
  root.add(shadowPlane);

  const isMale = gender === 'male';
  const topColor = isDefaultOutfit ? (isMale ? 0x2b5b84 : 0x5e6b47) : outfit.topHex;
  const pantsColor = isDefaultOutfit ? (isMale ? 0x224163 : 0x1f2429) : outfit.pantsHex;
  const shoeColor = isDefaultOutfit ? (isMale ? 0xf8fafc : 0x5e6b47) : outfit.shoeHex;

  const topMat = new THREE.MeshStandardMaterial({
    color: topColor,
    roughness: isDefaultOutfit ? (isMale ? 0.72 : 0.84) : 0.42,
    metalness: isDefaultOutfit ? 0.06 : 0.38,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: pantsColor,
    roughness: 0.76,
    metalness: 0.08,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: shoeColor,
    roughness: 0.45,
    metalness: 0.14,
  });
  const soleMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.65,
    metalness: 0.02,
  });

  // Legs (articulated at hip y = 0.78)
  const makeLeg = (offsetX: number) => {
    const legGroup = new THREE.Group();
    legGroup.position.set(offsetX, 0.78, 0);

    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.66, 0.2), pantsMat);
    thigh.position.y = -0.33;
    thigh.castShadow = true;
    legGroup.add(thigh);

    // Level 3+: Armored Shin & Knee Guards
    if (lvl >= 3) {
      const shinPlate = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.28, 0.22), vestMat);
      shinPlate.position.set(0, -0.45, -0.01);
      const shinTrim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.23), neonMat);
      shinTrim.position.set(0, -0.33, -0.01);
      legGroup.add(shinPlate, shinTrim);
    }

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.3), shoeMat);
    shoe.position.set(0, -0.71, -0.04);
    shoe.castShadow = true;
    legGroup.add(shoe);

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.035, 0.31), soleMat);
    sole.position.set(0, -0.76, -0.04);
    legGroup.add(sole);

    return legGroup;
  };

  const leftLeg = makeLeg(-0.14);
  const rightLeg = makeLeg(0.14);
  bodyGroup.add(leftLeg, rightLeg);

  // Torso (y = 0.78 to 1.38)
  const torsoWidth = isMale ? 0.5 : 0.44;
  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(torsoWidth, 0.58, 0.27), topMat);
  torsoMesh.position.y = 1.07;
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  bodyGroup.add(torsoMesh);

  if (isMale && isDefaultOutfit) {
    const shirtStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.54, 0.285),
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.85, metalness: 0.02 }),
    );
    shirtStrip.position.set(0, 1.07, -0.005);
    bodyGroup.add(shirtStrip);
  }

  // Armored high collar for premium outfits OR upgraded suits (Lv. 2+)
  if (outfit.hasCollar || lvl >= 2) {
    const collar = new THREE.Mesh(new THREE.BoxGeometry(torsoWidth * 0.76, 0.12, 0.25), vestMat);
    collar.position.set(0, 1.4, 0.02);
    bodyGroup.add(collar);
  }

  // Laser Tag Tactical Vest Harness + Glowing Sensor Cores
  const vestPlate = new THREE.Mesh(new THREE.BoxGeometry(torsoWidth + 0.04, 0.36, 0.31), vestMat);
  vestPlate.position.y = 1.11;
  vestPlate.castShadow = true;
  bodyGroup.add(vestPlate);

  const frontSensor = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 16), neonMat);
  frontSensor.rotation.x = Math.PI / 2;
  frontSensor.position.set(0, 1.13, -0.155);
  bodyGroup.add(frontSensor);

  // Level 3+: Armored reactor halo ring around chest core
  if (lvl >= 3) {
    const chestRing = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.018, 8, 20), neonMat);
    chestRing.position.set(0, 1.13, -0.165);
    bodyGroup.add(chestRing);
  }

  const backSensor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.04), neonMat);
  backSensor.position.set(0, 1.13, 0.155);
  bodyGroup.add(backSensor);

  // Level 4: Élite Maestro energy stabilizer wings on back
  if (lvl >= 4) {
    const wingGeo = new THREE.BoxGeometry(0.04, 0.36, 0.22);
    const wingL = new THREE.Mesh(wingGeo, vestMat);
    wingL.position.set(-0.22, 1.24, 0.22);
    wingL.rotation.set(0.25, -0.25, -0.35);
    const wingR = new THREE.Mesh(wingGeo, vestMat);
    wingR.position.set(0.22, 1.24, 0.22);
    wingR.rotation.set(0.25, 0.25, 0.35);

    const edgeGeo = new THREE.BoxGeometry(0.02, 0.38, 0.05);
    const edgeL = new THREE.Mesh(edgeGeo, neonMat);
    edgeL.position.set(-0.24, 1.26, 0.31);
    edgeL.rotation.set(0.25, -0.25, -0.35);
    const edgeR = new THREE.Mesh(edgeGeo, neonMat);
    edgeR.position.set(0.24, 1.26, 0.31);
    edgeR.rotation.set(0.25, 0.25, 0.35);

    bodyGroup.add(wingL, wingR, edgeL, edgeR);
  }

  // Arms (articulated at shoulder y = 1.30)
  let blasterMesh = new THREE.Group();
  const makeArm = (offsetX: number, withBlaster: boolean) => {
    const armGroup = new THREE.Group();
    armGroup.position.set(offsetX, 1.3, 0);

    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.15), topMat);
    sleeve.position.y = -0.22;
    sleeve.castShadow = true;
    armGroup.add(sleeve);

    // Shoulder pads from outfit definition OR suit upgrade Level 2+
    if (outfit.hasShoulderPads || lvl >= 2) {
      const padScale = lvl >= 3 ? 1.14 : 1.0;
      const pauldron = new THREE.Mesh(
        new THREE.BoxGeometry(0.18 * padScale, 0.14 * padScale, 0.19 * padScale),
        vestMat,
      );
      pauldron.position.set(0, -0.04, 0);
      pauldron.castShadow = true;
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(0.19 * padScale, 0.032, 0.2 * padScale),
        neonMat,
      );
      trim.position.set(0, -0.09, 0);
      armGroup.add(pauldron, trim);
    }

    // Level 3+: Armored forearm gauntlet
    if (lvl >= 3) {
      const gauntlet = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.17), vestMat);
      gauntlet.position.y = -0.35;
      armGroup.add(gauntlet);
    }

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.12), skinMat);
    hand.position.y = -0.49;
    armGroup.add(hand);

    if (withBlaster) {
      armGroup.rotation.x = Math.PI * 0.42;
      const { group: builtWeapon } = buildWeaponGeometry(
        weaponId,
        blasterBodyMat,
        blasterTitaniumMat,
        blasterGripMat,
        blasterRailMat,
        blasterCoreColor,
      );
      builtWeapon.scale.setScalar(0.86);
      builtWeapon.position.set(0, -0.5, -0.04);
      armGroup.add(builtWeapon);
      blasterMesh = builtWeapon;
    }

    return armGroup;
  };

  const leftArm = makeArm(isMale ? -0.34 : -0.3, false);
  const rightArm = makeArm(isMale ? 0.34 : 0.3, true);
  bodyGroup.add(leftArm, rightArm);

  // Neck + Head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 12), skinMat);
  neck.position.y = 1.4;
  bodyGroup.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.y = 1.56;
  bodyGroup.add(headGroup);

  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), skinMat);
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  if (outfit.hasVisor || lvl >= 4) {
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.075, 0.05), neonMat);
    visor.position.set(0, 0.025, -0.135);
    headGroup.add(visor);
  } else {
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x1e130c,
      roughness: 0.2,
      metalness: 0.1,
    });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.036, 0.02), eyeMat);
    eyeL.position.set(-0.06, 0.02, -0.142);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.036, 0.02), eyeMat);
    eyeR.position.set(0.06, 0.02, -0.142);
    headGroup.add(eyeL, eyeR);
  }

  if (isMale) {
    const fadeTop = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.13, 0.29), hairMat);
    fadeTop.position.set(0, 0.19, 0.01);
    fadeTop.castShadow = true;
    headGroup.add(fadeTop);

    const fadeBack = new THREE.Mesh(new THREE.BoxGeometry(0.295, 0.18, 0.08), hairMat);
    fadeBack.position.set(0, 0.08, 0.12);
    headGroup.add(fadeBack);

    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.04), hairMat);
    beard.position.set(0, -0.11, -0.13);
    headGroup.add(beard);
  } else {
    const afroMain = new THREE.Mesh(new THREE.DodecahedronGeometry(0.23, 1), hairMat);
    afroMain.position.set(0, 0.1, 0.05);
    afroMain.castShadow = true;
    const afroL = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 1), hairMat);
    afroL.position.set(-0.15, 0.06, 0.02);
    const afroR = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 1), hairMat);
    afroR.position.set(0.15, 0.06, 0.02);
    const afroTop = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 1), hairMat);
    afroTop.position.set(0, 0.21, 0.01);
    headGroup.add(afroMain, afroL, afroR, afroTop);
  }

  const shieldBubble = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 16, 12),
    new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.18,
      wireframe: true,
      depthWrite: false,
    }),
  );
  shieldBubble.position.y = 0.95;
  shieldBubble.visible = false;
  root.add(shieldBubble);

  const nameplate = createNameplateSprite(name, gender, isBot, accentHex, country);
  root.add(nameplate);

  const emoteSprite = createEmoteSprite();
  root.add(emoteSprite);

  return {
    root,
    bodyGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    blasterMesh,
    shieldBubble,
    nameplate,
    emoteSprite,
    emissiveMaterials: [neonMat],
    baseEmissiveColor: accentColor,
  };
}

export interface BlasterViewmodel {
  group: THREE.Group;
  muzzlePoint: THREE.Object3D;
  muzzleFlash: THREE.Mesh;
  coreMat: THREE.MeshStandardMaterial;
}

export function createFirstPersonBlaster(
  accentHex: string,
  weaponSkinId: WeaponSkinId = 'default',
  weaponId: WeaponId = 'pulse_carbine',
): BlasterViewmodel {
  const skin = getWeaponSkinById(weaponSkinId);
  const coreColor = new THREE.Color(skin.id === 'default' ? accentHex : skin.coreHex);

  const chassisMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(skin.bodyHex),
    roughness: skin.roughness,
    metalness: skin.metalness,
  });
  const titaniumMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(skin.railHex),
    roughness: Math.max(0.14, skin.roughness - 0.06),
    metalness: Math.min(0.96, skin.metalness + 0.05),
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(skin.gripHex),
    roughness: 0.8,
    metalness: 0.15,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: coreColor,
    emissive: coreColor,
    emissiveIntensity: 2.2,
    roughness: 0.15,
    metalness: 0.2,
  });

  const { group, muzzleZ, muzzleY } = buildWeaponGeometry(
    weaponId,
    chassisMat,
    titaniumMat,
    gripMat,
    coreMat,
    coreColor,
  );

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, muzzleY, muzzleZ);
  group.add(muzzlePoint);

  const muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(weaponId === 'scatter_shotgun' ? 0.095 : 0.065, 10, 10),
    new THREE.MeshBasicMaterial({
      color: coreColor,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  muzzleFlash.position.copy(muzzlePoint.position);
  muzzleFlash.visible = false;
  group.add(muzzleFlash);

  return { group, muzzlePoint, muzzleFlash, coreMat };
}

export function createStandaloneBlasterPreview(
  weaponSkinId: WeaponSkinId = 'default',
  accentHex = '#06b6d4',
  weaponId: WeaponId = 'pulse_carbine',
): THREE.Group {
  const wrapper = new THREE.Group();
  const { group } = createFirstPersonBlaster(accentHex, weaponSkinId, weaponId);
  const zOffset = weaponId === 'rail_sniper' ? 0.36 : weaponId === 'twin_smg' ? 0.16 : 0.24;
  const scale = weaponId === 'rail_sniper' ? 1.85 : 2.35;
  group.position.set(0, 0.02, zOffset);
  group.scale.setScalar(scale);
  wrapper.add(group);
  return wrapper;
}

export interface FirstPersonArmsViewmodel {
  group: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
}

export function createFirstPersonArms(
  gender: Gender = 'male',
  outfitId: OutfitId = 'default',
): FirstPersonArmsViewmodel {
  const group = new THREE.Group();
  const outfit = getOutfitById(outfitId);
  const isDefault = outfit.id === 'default';
  const isMale = gender === 'male';

  const sleeveColor = isDefault ? (isMale ? 0x2b5b84 : 0x5e6b47) : outfit.topHex;
  const trimColor = isDefault ? (isMale ? 0x38bdf8 : 0x10b981) : outfit.trimHex;

  const sleeveMat = new THREE.MeshStandardMaterial({
    color: sleeveColor,
    roughness: isDefault ? 0.72 : 0.42,
    metalness: isDefault ? 0.08 : 0.35,
  });
  const cuffMat = new THREE.MeshStandardMaterial({
    color: trimColor,
    emissive: trimColor,
    emissiveIntensity: 0.75,
    roughness: 0.3,
    metalness: 0.4,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0x7a4b31,
    roughness: 0.58,
    metalness: 0.04,
  });

  const makeViewArm = (sideSign: -1 | 1) => {
    const arm = new THREE.Group();
    arm.position.set(sideSign * 0.34, -0.34, -0.22);

    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.34), sleeveMat);
    sleeve.position.set(0, 0, -0.06);
    arm.add(sleeve);

    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.118, 0.04), cuffMat);
    cuff.position.set(0, 0, -0.23);
    arm.add(cuff);

    const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.086, 0.11), skinMat);
    wrist.position.set(0, 0, -0.3);
    arm.add(wrist);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.085, 0.11), skinMat);
    hand.position.set(0, -0.01, -0.39);
    arm.add(hand);

    return arm;
  };

  const leftArm = makeViewArm(-1);
  const rightArm = makeViewArm(1);
  group.add(leftArm, rightArm);

  return { group, leftArm, rightArm };
}

export function createGoldCrownMesh(): THREE.Group {
  const crown = new THREE.Group();

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xd97706,
    emissiveIntensity: 0.45,
    metalness: 0.92,
    roughness: 0.16,
  });

  const rubyMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.9,
    metalness: 0.35,
    roughness: 0.12,
  });

  const band = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.042, 12, 28), goldMat);
  band.rotation.x = Math.PI / 2;
  crown.add(band);

  const spireGeo = new THREE.ConeGeometry(0.055, 0.18, 6);
  const jewelGeo = new THREE.SphereGeometry(0.028, 10, 10);
  const count = 5;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const spire = new THREE.Mesh(spireGeo, goldMat);
    spire.position.set(Math.sin(angle) * 0.21, 0.1, Math.cos(angle) * 0.21);
    crown.add(spire);

    const jewel = new THREE.Mesh(jewelGeo, rubyMat);
    jewel.position.set(Math.sin(angle) * 0.21, 0.195, Math.cos(angle) * 0.21);
    crown.add(jewel);
  }

  const centerGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), rubyMat);
  centerGem.position.set(0, 0.03, 0.25);
  crown.add(centerGem);

  return crown;
}
