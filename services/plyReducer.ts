
import type { Splat } from '../types';

type ProcessStatus = 'idle' | 'loading' | 'calculating' | 'reducing' | 'saving' | 'success' | 'error';

type StatusCallback = (
    status: ProcessStatus, 
    message: string, 
    counts?: { original: number, reduced: number }
) => void;

interface ReductionOptions {
    opacityRemoval: number; // 0-100 percentage
    sizeRemoval: number;    // 0-100 percentage
    targetColor: string;
    colorThreshold: number; // 0-100 percentage
    protectedIndices?: Set<number>;
}

const SH_C0 = 0.28209479177387814;

// Mapping of PLY types to byte sizes
const TYPE_SIZES: Record<string, number> = {
    'char': 1, 'uchar': 1, 'int8': 1, 'uint8': 1,
    'short': 2, 'ushort': 2, 'int16': 2, 'uint16': 2,
    'int': 4, 'uint': 4, 'int32': 4, 'uint32': 4, 'float': 4, 'float32': 4,
    'double': 8, 'float64': 8
};

interface PlyProperty {
    name: string;
    type: string;
    size: number;
    offset: number;
}

interface PlyLayout {
    header: string;
    headerLength: number;
    vertexCount: number;
    rowSize: number; // Bytes per vertex
    properties: PlyProperty[];
    dataStart: number;
}

// --- Helper Functions ---

const parsePlyHeader = (buffer: ArrayBuffer): PlyLayout => {
    const decoder = new TextDecoder();
    const view = new Uint8Array(buffer);
    let headerLength = 0;
    
    // Naive search for end_header\n
    const endHeaderStr = "end_header";
    let matchIndex = 0;
    
    for (let i = 0; i < Math.min(view.length, 10000); i++) {
        const byte = view[i];
        const char = String.fromCharCode(byte);
        
        if (char === endHeaderStr[matchIndex]) {
            matchIndex++;
            if (matchIndex === endHeaderStr.length) {
                if (view[i+1] === 10) { // \n
                    headerLength = i + 2;
                } else if (view[i+1] === 13 && view[i+2] === 10) { // \r\n
                    headerLength = i + 3;
                }
                if (headerLength > 0) break;
            }
        } else {
            matchIndex = 0;
            if (char === 'e') matchIndex = 1; 
        }
    }

    if (headerLength === 0) throw new Error("Could not find end_header in PLY.");

    const headerText = decoder.decode(view.slice(0, headerLength));
    
    const lines = headerText.split(/\r?\n/);
    const properties: PlyProperty[] = [];
    let vertexCount = 0;
    let currentOffset = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("element vertex")) {
            vertexCount = parseInt(trimmed.split(/\s+/)[2], 10);
        } else if (trimmed.startsWith("property")) {
            const parts = trimmed.split(/\s+/);
            const type = parts[1];
            const name = parts[2];
            const size = TYPE_SIZES[type] || 4;
            
            properties.push({
                name,
                type,
                size,
                offset: currentOffset
            });
            currentOffset += size;
        }
    }

    return {
        header: headerText,
        headerLength,
        vertexCount,
        rowSize: currentOffset,
        properties,
        dataStart: headerLength
    };
};

const getFloatValue = (view: DataView, offset: number, type: string): number => {
    if (type === 'float' || type === 'float32') return view.getFloat32(offset, true);
    if (type === 'double' || type === 'float64') return view.getFloat64(offset, true);
    if (type === 'uchar' || type === 'uint8') return view.getUint8(offset) / 255.0;
    return 0;
};

const hexToRgb = (hex: string): [number, number, number] => {
    const bigint = parseInt(hex.replace('#', ''), 16);
    const r = ((bigint >> 16) & 255) / 255;
    const g = ((bigint >> 8) & 255) / 255;
    const b = (bigint & 255) / 255;
    return [r, g, b];
};

/**
 * Analyzes the PLY file to extract sorted arrays of opacities and volumes.
 * This is used to calculate accurate percentiles for the UI slider.
 */
export const analyzeFile = async (file: File): Promise<{ opacities: Float32Array, volumes: Float32Array }> => {
    const buffer = await file.arrayBuffer();
    const layout = parsePlyHeader(buffer);
    
    const propMap = new Map<string, PlyProperty>();
    layout.properties.forEach(p => propMap.set(p.name, p));
    const getProp = (keys: string[]) => {
        for (const k of keys) {
            if (propMap.has(k)) return propMap.get(k);
        }
        return null;
    };

    const pOpacity = getProp(['opacity', 'alpha']);
    const pScale0 = getProp(['scale_0', 'scale0']);
    const pScale1 = getProp(['scale_1', 'scale1']);
    const pScale2 = getProp(['scale_2', 'scale2']);

    if (!pOpacity || !pScale0) {
        throw new Error("Could not find opacity or scale properties for analysis.");
    }

    const dataView = new DataView(buffer, layout.dataStart);
    const opacities = new Float32Array(layout.vertexCount);
    const volumes = new Float32Array(layout.vertexCount);

    for (let i = 0; i < layout.vertexCount; i++) {
        const base = i * layout.rowSize;
        
        // Read Opacity (sigmoid)
        const opacityRaw = getFloatValue(dataView, base + pOpacity.offset, pOpacity.type);
        const opacity = 1 / (1 + Math.exp(-opacityRaw));
        opacities[i] = opacity;

        // Read Scale (exp) to Volume
        const s0 = getFloatValue(dataView, base + pScale0.offset, pScale0.type);
        const s1 = getFloatValue(dataView, base + pScale1!.offset, pScale1!.type);
        const s2 = getFloatValue(dataView, base + pScale2!.offset, pScale2!.type);
        
        const vol = Math.exp(s0) * Math.exp(s1) * Math.exp(s2);
        volumes[i] = vol;
    }

    // Return sorted arrays for percentile lookup
    return {
        opacities: opacities.sort(),
        volumes: volumes.sort()
    };
};

export const reduceSplatsInFile = async (
    file: File, 
    options: ReductionOptions,
    statusCallback: StatusCallback
): Promise<Blob> => {
    statusCallback('loading', `Reading file structure...`);
    const buffer = await file.arrayBuffer();
    
    let layout: PlyLayout;
    try {
        layout = parsePlyHeader(buffer);
    } catch (e) {
        console.error(e);
        throw new Error("Failed to parse PLY header. Is this a valid binary PLY?");
    }

    statusCallback('loading', `Found ${layout.vertexCount.toLocaleString()} splats. Analyzing...`);

    const propMap = new Map<string, PlyProperty>();
    layout.properties.forEach(p => propMap.set(p.name, p));
    const getProp = (keys: string[]) => {
        for (const k of keys) {
            if (propMap.has(k)) return propMap.get(k);
        }
        return null;
    };

    const pOpacity = getProp(['opacity', 'alpha']);
    const pScale0 = getProp(['scale_0', 'scale0']);
    const pScale1 = getProp(['scale_1', 'scale1']);
    const pScale2 = getProp(['scale_2', 'scale2']);
    
    // Robust Color Property Finding
    const pFdc0 = getProp(['f_dc_0', 'f_dc0', 'red', 'diffuse_red']);
    const pFdc1 = getProp(['f_dc_1', 'f_dc1', 'green', 'diffuse_green']);
    const pFdc2 = getProp(['f_dc_2', 'f_dc2', 'blue', 'diffuse_blue']);

    if (!pOpacity || !pScale0) {
        throw new Error("Could not find opacity or scale properties in PLY.");
    }

    const dataView = new DataView(buffer, layout.dataStart);
    const shToColor = (val: number) => 0.5 + (SH_C0 * val);

    // --- Pass 1: Gather Value Distributions ---
    
    statusCallback('calculating', 'Analyzing splat distributions...');
    
    const opacities = new Float32Array(layout.vertexCount);
    const volumes = new Float32Array(layout.vertexCount);
    
    for (let i = 0; i < layout.vertexCount; i++) {
        const base = i * layout.rowSize;
        
        // Read Opacity (sigmoid)
        const opacityRaw = getFloatValue(dataView, base + pOpacity.offset, pOpacity.type);
        const opacity = 1 / (1 + Math.exp(-opacityRaw));
        opacities[i] = opacity;

        // Read Scale (exp) to Volume
        const s0 = getFloatValue(dataView, base + pScale0.offset, pScale0.type);
        const s1 = getFloatValue(dataView, base + pScale1!.offset, pScale1!.type);
        const s2 = getFloatValue(dataView, base + pScale2!.offset, pScale2!.type);
        // Approximation of volume is product of dimensions
        const vol = Math.exp(s0) * Math.exp(s1) * Math.exp(s2);
        volumes[i] = vol;
    }

    // --- Calculate Thresholds ---
    
    let opacityThreshold = -Infinity;
    if (options.opacityRemoval > 0) {
        // Sort a copy to find percentile
        const sortedOpacities = opacities.slice().sort();
        const index = Math.floor(layout.vertexCount * (options.opacityRemoval / 100));
        opacityThreshold = sortedOpacities[Math.min(index, layout.vertexCount - 1)];
        statusCallback('calculating', `Opacity Cutoff: ${opacityThreshold.toFixed(4)}`);
    }

    let volumeThreshold = -Infinity;
    if (options.sizeRemoval > 0) {
        const sortedVolumes = volumes.slice().sort();
        const index = Math.floor(layout.vertexCount * (options.sizeRemoval / 100));
        volumeThreshold = sortedVolumes[Math.min(index, layout.vertexCount - 1)];
        statusCallback('calculating', `Size Cutoff: ${volumeThreshold.toExponential(2)}`);
    }

    // --- Pass 2: Filter ---
    
    statusCallback('reducing', `Applying filters...`);
    
    const indicesToKeep: number[] = [];
    const targetRgb = hexToRgb(options.targetColor);
    // Increased max distance for looser matching
    const maxColorDist = 1.75; 
    const colorDistThreshold = (options.colorThreshold / 100) * maxColorDist;
    const filterColor = options.colorThreshold > 0;
    const protectedIndices = options.protectedIndices || new Set();

    for (let i = 0; i < layout.vertexCount; i++) {
        // Force keep if protected
        if (protectedIndices.has(i)) {
            indicesToKeep.push(i);
            continue;
        }

        let keep = true;

        // 1. Opacity Check
        if (options.opacityRemoval > 0) {
            // If splat opacity is less than threshold, remove it
            if (opacities[i] < opacityThreshold) keep = false;
        }

        // 2. Size Check
        if (keep && options.sizeRemoval > 0) {
            if (volumes[i] < volumeThreshold) keep = false;
        }

        // 3. Color Check
        if (keep && filterColor && pFdc0 && pFdc1 && pFdc2) {
            const base = i * layout.rowSize;
            let r=0, g=0, b=0;
            const f0 = getFloatValue(dataView, base + pFdc0.offset, pFdc0.type);
            const f1 = getFloatValue(dataView, base + pFdc1.offset, pFdc1.type);
            const f2 = getFloatValue(dataView, base + pFdc2.offset, pFdc2.type);
            
            if (pFdc0.name.startsWith('f_dc')) {
                r = shToColor(f0);
                g = shToColor(f1);
                b = shToColor(f2);
            } else {
                r = f0; g = f1; b = f2;
            }

            const dist = Math.sqrt(
                Math.pow(r - targetRgb[0], 2) +
                Math.pow(g - targetRgb[1], 2) +
                Math.pow(b - targetRgb[2], 2)
            );

            // If color is close enough to target, remove it
            if (dist <= colorDistThreshold) keep = false;
        }

        if (keep) {
            indicesToKeep.push(i);
        }
    }

    const reducedCount = indicesToKeep.length;
    statusCallback('saving', `Building optimized file (${reducedCount.toLocaleString()} splats)...`, { original: layout.vertexCount, reduced: reducedCount });

    // --- Build New PLY ---
    
    let newHeaderText = layout.header.replace(
        /element vertex \d+/, 
        `element vertex ${reducedCount}`
    );
    newHeaderText = newHeaderText.trim() + '\n';
    
    const encoder = new TextEncoder();
    const newHeaderBytes = encoder.encode(newHeaderText);
    
    const newBuffer = new Uint8Array(reducedCount * layout.rowSize);
    const sourceBytes = new Uint8Array(buffer, layout.dataStart);

    for (let i = 0; i < reducedCount; i++) {
        const originalIndex = indicesToKeep[i];
        const srcStart = originalIndex * layout.rowSize;
        const srcEnd = srcStart + layout.rowSize;
        const destStart = i * layout.rowSize;
        newBuffer.set(sourceBytes.subarray(srcStart, srcEnd), destStart);
    }

    return new Blob([newHeaderBytes, newBuffer], { type: 'application/octet-stream' });
};
