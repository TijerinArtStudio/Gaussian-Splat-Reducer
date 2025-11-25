
import React, { useRef, useEffect, useState } from 'react';

interface PlyViewerProps {
  title?: string;
  fileBuffer: ArrayBuffer | null;
}

const Spinner: React.FC = () => (
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
);

export const PlyViewer: React.FC<PlyViewerProps> = ({ title, fileBuffer }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null); // Store Three.js renderer
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // We only initialize if we have a file buffer to show
    if (!fileBuffer || !containerRef.current) return;

    let scene: any, camera: any, renderer: any, controls: any, splatMesh: any;
    let animationId: number;
    let blobUrl: string | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let mounted = true;

    const initViewer = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // 1. Dynamic Imports
        const THREE = await import('three');
        const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
        const { SplatMesh } = await import('@sparkjsdev/spark');

        if (!mounted) return;

        // 2. Setup Basic Three.js Scene
        const width = containerRef.current!.clientWidth;
        const height = containerRef.current!.clientHeight;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000); // Black background

        camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
        camera.position.set(0, 0, 5);
        camera.up.set(0, 1, 0);

        renderer = new THREE.WebGLRenderer({ 
            antialias: false, // Performance optimization for dual viewers
            alpha: false,
            powerPreference: 'high-performance'
        });
        // Pass false as third argument to prevent style modification which causes ResizeObserver loops
        renderer.setSize(width, height, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for perf
        
        // We handle styles via CSS
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        
        containerRef.current!.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // 3. Controls
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        // 4. Load Splat using Blob URL
        const blob = new Blob([fileBuffer]);
        blobUrl = URL.createObjectURL(blob);

        splatMesh = new SplatMesh({ url: blobUrl });
        scene.add(splatMesh);

        // 5. Animation Loop
        const animate = () => {
          if (!mounted) return;
          animationId = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();

        // 6. Handle Window Resize
        const onResize = () => {
            // Wrap in requestAnimationFrame to avoid "ResizeObserver loop completed with undelivered notifications"
            requestAnimationFrame(() => {
                if (!mounted || !containerRef.current || !camera || !renderer) return;
                const w = containerRef.current.clientWidth;
                const h = containerRef.current.clientHeight;
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
                // Update internal resolution only, do not touch CSS styles
                renderer.setSize(w, h, false);
            });
        };
        
        resizeObserver = new ResizeObserver(() => onResize());
        resizeObserver.observe(containerRef.current!);

        setIsLoading(false);

      } catch (err: any) {
        console.error("3D Error:", err);
        setError(`Failed to initialize 3D Viewer: ${err.message}`);
        setIsLoading(false);
      }
    };

    initViewer();

    // Cleanup function
    return () => {
      mounted = false;
      if (resizeObserver) resizeObserver.disconnect();
      if (animationId) cancelAnimationFrame(animationId);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      
      if (rendererRef.current) {
        const r = rendererRef.current;
        r.dispose();
        // Crucial for dual viewers to prevent context limits
        r.forceContextLoss(); 
        if (r.domElement && r.domElement.parentNode) {
            r.domElement.parentNode.removeChild(r.domElement);
        }
        rendererRef.current = null;
      }
      if (splatMesh && splatMesh.dispose) splatMesh.dispose();
    };
  }, [fileBuffer]);

  return (
    <div className="flex flex-col h-full w-full relative">
      {title && <h3 className="text-lg font-semibold text-cyan-400 mb-3 text-center">{title}</h3>}
      
      <div 
        ref={containerRef}
        className="flex-grow w-full h-full relative overflow-hidden bg-black rounded-lg shadow-inner"
      >
        {/* Status Overlays */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10">
            {isLoading && (
               <div className="flex flex-col items-center space-y-3 bg-gray-900/80 px-8 py-6 rounded-xl backdrop-blur-md border border-gray-700">
                    <Spinner />
                    <span className="text-cyan-200 text-sm font-medium tracking-wide">Initializing Engine...</span>
                </div>
            )}

            {!fileBuffer && !isLoading && !error && (
              <div className="text-gray-500 text-lg font-medium bg-gray-900/80 px-6 py-4 rounded-xl backdrop-blur-sm border border-gray-700">
                  Ready.
              </div>
            )}

            {error && (
                <div className="bg-red-900/90 text-white px-8 py-6 rounded-xl text-center shadow-xl border border-red-500/50 backdrop-blur-md max-w-md">
                    <p className="font-bold text-lg mb-2">Error</p>
                    <p className="text-red-200 text-sm">{error}</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
