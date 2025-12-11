"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { ProxyScene } from "./proxy-scene";

export function ProxyVisualization() {
  return (
    <div className="h-[350px] w-full">
      <Canvas
        camera={{ position: [0, 1.5, 7], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <ProxyScene />
        </Suspense>
      </Canvas>
    </div>
  );
}
