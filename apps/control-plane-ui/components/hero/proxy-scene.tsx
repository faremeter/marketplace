"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, RoundedBox, Environment, Line } from "@react-three/drei";
import { SITE_NAME } from "@/lib/brand";

import * as THREE from "three";

function createNoiseTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);

  for (let i = 0; i < size * size; i++) {
    const noise = Math.random() * 30 + 225;
    data[i * 4] = noise;
    data[i * 4 + 1] = noise;
    data[i * 4 + 2] = noise;
    data[i * 4 + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.needsUpdate = true;
  return texture;
}

function MetallicBlock({
  position,
  label,
  highlight = false,
  offset = 0,
}: {
  position: [number, number, number];
  label: string;
  highlight?: boolean;
  offset?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  const roughnessMap = useMemo(() => createNoiseTexture(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime + offset;
    if (groupRef.current && !highlight) {
      groupRef.current.position.y = Math.sin(t * 1.2) * 0.08;
      groupRef.current.rotation.y = Math.sin(t * 0.8) * 0.08;
      groupRef.current.rotation.x = Math.sin(t * 0.6 + 1) * 0.03;
      groupRef.current.rotation.z = Math.sin(t * 0.7 + 2) * 0.02;
    }
    if (groupRef.current && highlight) {
      groupRef.current.rotation.y = Math.sin(t * 0.5) * 0.15;
      groupRef.current.rotation.x = Math.sin(t * 0.4) * 0.02;
      groupRef.current.rotation.z = Math.sin(t * 0.3 + 1) * 0.015;
    }
  });

  const baseColor = highlight ? "#2a2a2a" : "#1a1a1a";

  return (
    <group position={position}>
      <group ref={groupRef}>
        <RoundedBox
          ref={meshRef}
          args={highlight ? [1.8, 1.4, 1.2] : [1.5, 1, 1]}
          radius={0.08}
          smoothness={4}
        >
          <meshStandardMaterial
            color={highlight ? "#3d2a1a" : baseColor}
            metalness={0.95}
            roughness={0.25}
            roughnessMap={roughnessMap}
            envMapIntensity={highlight ? 2 : 1.5}
          />
        </RoundedBox>
        {!highlight && (
          <Text
            position={[0, 0.85, 0]}
            fontSize={0.18}
            color="#aaaaaa"
            anchorX="center"
            anchorY="middle"
          >
            {label}
          </Text>
        )}
      </group>
      {highlight && (
        <Text
          position={[0, 1.0, 0]}
          fontSize={0.18}
          color="#ea862a"
          anchorX="center"
          anchorY="middle"
        >
          {label}
        </Text>
      )}
    </group>
  );
}

function DataParticles({
  from,
  to,
  color = "#00a3ff",
  delay = 0,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color?: string;
  delay?: number;
}) {
  const particleCount = 12;
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, speeds } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const spd = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const t = i / particleCount;
      pos[i * 3] = from[0] + (to[0] - from[0]) * t;
      pos[i * 3 + 1] = from[1] + (to[1] - from[1]) * t;
      pos[i * 3 + 2] = from[2] + (to[2] - from[2]) * t;
      spd[i] = 0.8 + Math.random() * 0.4;
    }

    return { positions: pos, speeds: spd };
  }, [from, to]);

  useFrame((state) => {
    if (!pointsRef.current) return;

    const posAttr = pointsRef.current.geometry.attributes.position;
    const time = state.clock.elapsedTime + delay;

    for (let i = 0; i < particleCount; i++) {
      const t = (time * speeds[i] * 0.5 + i / particleCount) % 1;

      const x = from[0] + (to[0] - from[0]) * t;
      const y = from[1] + (to[1] - from[1]) * t + Math.sin(t * Math.PI) * 0.1;
      const z = from[2] + (to[2] - from[2]) * t;

      posAttr.setXYZ(i, x, y, z);
    }

    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={0.06}
        transparent
        opacity={0.9}
        sizeAttenuation
      />
    </points>
  );
}

function FloatingDollars({ position }: { position: [number, number, number] }) {
  const count = 11;
  const textsRef = useRef<THREE.Group[]>([]);

  const offsets = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      startX: (Math.random() - 0.5) * 1.6,
      startZ: (Math.random() - 0.5) * 1.0,
      driftX: (Math.random() - 0.5) * 0.3,
      speed: 0.4 + Math.random() * 0.25,
      phase: (i / count) * Math.PI * 2 + Math.random() * 0.5,
    }));
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    textsRef.current.forEach((textGroup, i) => {
      if (textGroup && offsets[i]) {
        const offset = offsets[i];
        const cycleTime = 4;
        const progress =
          ((t * offset.speed + offset.phase) % cycleTime) / cycleTime;

        textGroup.position.y = progress * 1.5;
        textGroup.position.x =
          offset.startX + Math.sin(t * 0.5 + offset.phase) * offset.driftX;
        textGroup.position.z = offset.startZ;

        const fadeStart = 0.4;
        const opacity =
          progress < fadeStart
            ? Math.min(progress * 4, 1)
            : 1 - (progress - fadeStart) / (1 - fadeStart);

        const textMesh = textGroup.children[0] as THREE.Mesh;
        const glowMesh = textGroup.children[1] as THREE.Mesh;
        if (textMesh && textMesh.material) {
          (textMesh.material as THREE.MeshBasicMaterial).opacity =
            opacity * 0.9;
        }
        if (glowMesh && glowMesh.material) {
          (glowMesh.material as THREE.MeshBasicMaterial).opacity =
            opacity * 0.3;
        }
      }
    });
  });

  return (
    <group position={position}>
      {Array.from({ length: count }).map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            if (el) textsRef.current[i] = el;
          }}
        >
          <Text
            fontSize={0.28}
            color="#4ade80"
            anchorX="center"
            anchorY="middle"
            material-transparent={true}
            material-opacity={0.9}
            material-toneMapped={false}
          >
            $
          </Text>
          <Text
            fontSize={0.35}
            color="#22c55e"
            anchorX="center"
            anchorY="middle"
            material-transparent={true}
            material-opacity={0.3}
            material-toneMapped={false}
          >
            $
          </Text>
        </group>
      ))}
    </group>
  );
}

function ConnectionLine({
  from,
  to,
}: {
  from: [number, number, number];
  to: [number, number, number];
}) {
  const points = useMemo(() => {
    return [from, to];
  }, [from, to]);

  return (
    <Line
      points={points}
      color="#1a1a1a"
      lineWidth={1}
      transparent
      opacity={0.4}
    />
  );
}

export function ProxyScene() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y =
        Math.sin(state.clock.elapsedTime * 0.15) * 0.1;
    }
  });

  const clientPos: [number, number, number] = [-3.5, 0, 0];
  const proxyPos: [number, number, number] = [0, 0, 0];
  const apiPos: [number, number, number] = [3.5, 0, 0];

  return (
    <>
      <Environment preset="city" />
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.6} color="#ffffff" />
      <directionalLight
        position={[-5, 3, -5]}
        intensity={0.3}
        color="#ea862a"
      />
      <directionalLight position={[0, 0, 8]} intensity={0.8} color="#ffffff" />
      <pointLight position={[0, 3, 5]} intensity={0.5} color="#ffffff" />
      <pointLight position={[-4, 0, 4]} intensity={0.4} color="#ffffff" />
      <pointLight position={[4, 0, 4]} intensity={0.4} color="#ffffff" />

      <group ref={groupRef}>
        <ConnectionLine from={[-2.7, 0, 0]} to={[-0.85, 0, 0]} />
        <ConnectionLine from={[0.85, 0, 0]} to={[2.7, 0, 0]} />

        <MetallicBlock position={clientPos} label="Client" offset={0} />
        <MetallicBlock
          position={proxyPos}
          label={SITE_NAME.split(" ")[0]}
          highlight
          offset={1.5}
        />
        <MetallicBlock position={apiPos} label="Your API" offset={3} />

        <FloatingDollars position={[0, 0.9, 0]} />

        <DataParticles
          from={[-2.7, 0, 0]}
          to={[-0.85, 0, 0]}
          color="#ea862a"
          delay={0}
        />
        <DataParticles
          from={[0.85, 0, 0]}
          to={[2.7, 0, 0]}
          color="#ea862a"
          delay={0.5}
        />

        <DataParticles
          from={[2.7, 0, 0]}
          to={[0.85, 0, 0]}
          color="#22c55e"
          delay={1.5}
        />
        <DataParticles
          from={[-0.85, 0, 0]}
          to={[-2.7, 0, 0]}
          color="#22c55e"
          delay={2}
        />
      </group>
    </>
  );
}
