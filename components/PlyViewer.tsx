
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
// @ts-ignore - Importación de Spark y el módulo 'dyno'
import { SparkRenderer, SplatMesh, SparkControls, dyno } from '@sparkjsdev/spark';

interface ReductionSettings {
  opacityThreshold: number; // Absolute value computed from percentile
  sizeThreshold: number;    // Absolute value computed from percentile
  targetColor: string;
  colorThreshold: number;   // Percentage (0-100)
}

interface PlyViewerProps {
  fileBuffer: ArrayBuffer | null;
  reductionSettings?: ReductionSettings;
  protectedIndices?: Set<number>;
  onSplatClick?: (index: number) => void;
  onLog?: (msg: string) => void;
  mode?: 'live' | 'static';
}

const hexToVec3 = (hex: string) => {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
};

export const PlyViewer: React.FC<PlyViewerProps> = ({
  fileBuffer: buffer,
  reductionSettings,
  protectedIndices,
  onSplatClick,
  onLog,
  mode = 'static'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const meshRef = useRef<any>(null);
  const dynoParamsRef = useRef<any>(null);

  // ========================================================================
  // BLOQUE 1: LÓGICA COMÚN (Funciona para OPTIMIZED RESULT y LIVE PREVIEW)
  // Este efecto monta el visor 3D básico.
  // ========================================================================
  useEffect(() => {
    if (!buffer || !containerRef.current) return;

    if (onLog) onLog(`[${mode.toUpperCase()}] Starting Core Viewer...`);

    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let controls: any;
    let splatMesh: any;
    let blobUrl: string | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let mounted = true;

    try {
      // 1. Configuración del Canvas (Igual para ambos)
      containerRef.current.innerHTML = '';
      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      containerRef.current.appendChild(canvas);
      
      const width = containerRef.current.clientWidth || 800;
      const height = containerRef.current.clientHeight || 600;

      // 2. Configuración Three.js + Spark (Igual para ambos)
      renderer = new THREE.WebGLRenderer({ 
          canvas, 
          antialias: false, 
          alpha: false,
          powerPreference: 'high-performance'
      });
      renderer.setSize(width, height, false);
      renderer.setClearColor(new THREE.Color(0x111827), 1);

      scene = new THREE.Scene();
      const spark = new SparkRenderer({ renderer });
      scene.add(spark);

      camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 1000);
      camera.position.set(0, 0, 5);

      controls = new SparkControls({ canvas });

      // 3. Carga del Archivo PLY (Igual para ambos)
      const blob = new Blob([buffer]);
      blobUrl = URL.createObjectURL(blob);
      
      splatMesh = new SplatMesh({
          url: blobUrl,
          // Callback vacío, necesario para evitar errores si Spark intenta llamar listeners
          onFrame: () => {} 
      });

      scene.add(splatMesh);
      meshRef.current = splatMesh;

      // 4. Interacción / Clicks (Igual para ambos)
      const raycaster = new THREE.Raycaster();
      raycaster.params.Points.threshold = 0.05;
      
      const handleClick = (e: MouseEvent) => {
          if (!onSplatClick) return;
          const rect = canvas.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
          const intersects = raycaster.intersectObject(splatMesh);
          if (intersects.length > 0 && intersects[0].index !== undefined) {
              onSplatClick(intersects[0].index);
          }
      };
      canvas.addEventListener('click', handleClick);

      // 5. Resize y Loop de Renderizado (Igual para ambos)
      resizeObserver = new ResizeObserver((entries) => {
           window.requestAnimationFrame(() => {
               if (!mounted || !containerRef.current) return;
               for (let entry of entries) {
                  const { width, height } = entry.contentRect;
                  if (width > 0 && height > 0) {
                      renderer.setSize(width, height, false);
                      camera.aspect = width / height;
                      camera.updateProjectionMatrix();
                  }
               }
          });
      });
      resizeObserver.observe(containerRef.current);

      renderer.setAnimationLoop(() => {
          if (!mounted) return;
          controls.update(camera);
          renderer.render(scene, camera);
      });

      if (onLog) onLog(`[${mode.toUpperCase()}] Core Viewer Ready.`);

    } catch (e: any) {
      console.error("Viewer Setup Error:", e);
      if (onLog) onLog(`[ERROR] ${e.message}`);
    }

    return () => {
      mounted = false;
      if (renderer) {
          renderer.setAnimationLoop(null);
          renderer.dispose();
          renderer.forceContextLoss();
      }
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [buffer]);

  // ========================================================================
  // BLOQUE 2: SOLO LIVE PREVIEW (Inyección de Shaders)
  // El 'Optimized Result' NUNCA ejecuta esto (porque mode='static').
  // ========================================================================
  useEffect(() => {
    // Si no es Live, salimos inmediatamente.
    if (mode !== 'live' || !meshRef.current) return;

    if (!dyno) {
        if (onLog) onLog("[WARN] 'dyno' module missing. Showing static mesh.");
        return;
    }

    if (onLog) onLog("[LIVE] Injecting Shader Graph...");

    try {
        // A. Definir Inputs
        const params = {
            opacityThreshold: dyno.dynoFloat(0.0),
            scaleThreshold: dyno.dynoFloat(0.0),
            targetColor: dyno.dynoVec3(new THREE.Vector3(1, 1, 1)),
            colorThreshold: dyno.dynoFloat(0.0),
            isActive: dyno.dynoBool(true) 
        };
        dynoParamsRef.current = params;

        // B. Definir Shader Graph
        const reductionLogic = dyno.dynoBlock(
            { gsplat: dyno.Gsplat }, 
            { gsplat: dyno.Gsplat }, 
            ({ gsplat }: any) => {
                const split = dyno.splitGsplat(gsplat);
                // Handle different Spark versions return structures
                const outputs = (split as any).outputs || split;
                const { scales, opacity, rgb } = outputs;
                
                // Calcular volumen aproximado
                const volume = dyno.mul(dyno.mul(scales.x, scales.y), scales.z);
                
                // Distancia de color
                const colorDiff = dyno.sub(rgb, params.targetColor);
                const colorDist = dyno.length(colorDiff);

                // Condiciones
                const isLowOpacity = dyno.lessThan(opacity, params.opacityThreshold);
                const isSmall = dyno.lessThan(volume as any, params.scaleThreshold);
                const isColorMatch = dyno.and(
                      dyno.greaterThan(params.colorThreshold, dyno.dynoFloat(0.001)),
                      dyno.lessThan(colorDist, params.colorThreshold)
                );

                // Lógica final: ¿Debe borrarse?
                const shouldRemove = dyno.or(isLowOpacity as any, dyno.or(isSmall as any, isColorMatch as any) as any);

                // Color rojo para visualización
                const redColor = dyno.dynoVec3(new THREE.Vector3(1.0, 0.0, 0.0));
                
                // Selección condicional
                const finalRgb = dyno.select(
                    shouldRemove as any, 
                    redColor, 
                    rgb
                );

                return { 
                    gsplat: dyno.combineGsplat({ gsplat, rgb: finalRgb }) 
                };
            }
        );

        // C. Aplicar al Mesh
        meshRef.current.worldModifier = reductionLogic;
        
        // D. Forzar recompilación del shader
        if (meshRef.current.updateGenerator) {
            meshRef.current.updateGenerator();
        }

        if (onLog) onLog("[LIVE] Shader injected successfully.");

    } catch (e: any) {
        console.error("Error building dyno graph:", e);
        if (onLog) onLog(`[LIVE ERROR] Failed to inject shader: ${e.message}`);
        
        // FALLBACK DE SEGURIDAD:
        if (meshRef.current) {
           meshRef.current.worldModifier = null;
           if (meshRef.current.updateGenerator) meshRef.current.updateGenerator();
        }
    }
  }, [mode, buffer]);

  // ========================================================================
  // BLOQUE 3: SOLO LIVE PREVIEW (Actualización de Valores)
  // ========================================================================
  useEffect(() => {
    if (mode !== 'live' || !reductionSettings || !meshRef.current || !dynoParamsRef.current) return;

    const { opacityThreshold, sizeThreshold, targetColor, colorThreshold } = reductionSettings;
    const params = dynoParamsRef.current;

    try {
        // 1. Actualizar valores en los objetos dyno
        // IMPORTANT: We now pass the absolute threshold values derived from statistics
        params.opacityThreshold.value = opacityThreshold;
        params.scaleThreshold.value = sizeThreshold;
        
        params.targetColor.value = hexToVec3(targetColor);
        // Color threshold remains percentage based (0-1 mapped to distance)
        params.colorThreshold.value = (colorThreshold / 100.0) * 1.75;
        
        // 2. Notificar cambio de versión (Ligero)
        if (meshRef.current.updateVersion) {
            meshRef.current.updateVersion();
        } else if (meshRef.current.updateGenerator) {
           meshRef.current.updateGenerator();
        }

    } catch (e) {
        console.error("Error updating uniforms", e);
    }
  }, [
    mode,
    reductionSettings?.opacityThreshold,
    reductionSettings?.sizeThreshold,
    reductionSettings?.targetColor,
    reductionSettings?.colorThreshold
  ]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative bg-gray-900"
      style={{ minHeight: '100%' }}
    />
  );
};
