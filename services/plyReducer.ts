
import type { Splat } from '../types';

type ProcessStatus = 'idle' | 'loading' | 'calculating' | 'reducing' | 'saving' | 'success' | 'error';

type StatusCallback = (
    status: ProcessStatus, 
    message: string, 
    counts?: { original: number, reduced: number }
) => void;

interface ReductionOptions {
    mode: 'standard' | 'color';
    percentage: number;
    targetColor: string;
    colorThreshold: number;
}

const W_OPACITY = 0.7;
const W_SIZE = 0.3;
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
    // Decode enough bytes to likely capture the header
    const view = new Uint8Array(buffer);
    // Find the end_header
    let headerText = '';
    let headerLength = 0;
    
    // Naive search for end_header\n
    // We scan byte by byte to find the exact end to avoid decoding the huge binary body
    const endHeaderStr = "end_header";
    let matchIndex = 0;
    
    for (let i = 0; i < Math.min(view.length, 10000); i++) {
        const byte = view[i];
        const char = String.fromCharCode(byte);
        
        if (char === endHeaderStr[matchIndex]) {
            matchIndex++;
            if (matchIndex === endHeaderStr.length) {
                // Check if next char is newline
                if (view[i+1] === 10) { // \n
                    headerLength = i + 2;
                } else if (view[i+1] === 13 && view[i+2] === 10) { // \r\n
                    headerLength = i + 3;
                }
                if (headerLength > 0) break;
            }
        } else {
            matchIndex = 0;
            // Retry current char as start if it matches 'e'
            if (char === 'e') matchIndex = 1; 
        }
    }

    if (headerLength === 0) throw new Error("Could not find end_header in PLY.");

    headerText = decoder.decode(view.slice(0, headerLength));
    
    // Parse properties
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
            // Format: property <type> <name>
            // or: property list <type> <type> <name> (Not supported for simple Splats, but standard Gaussian Splatting doesn't use lists usually)
            const type = parts[1];
            const name = parts[2];
            const size = TYPE_SIZES[type] || 4; // Default to 4 if unknown, risky but usually float
            
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
    // We mostly assume standard Gaussian Splats are float32
    if (type === 'float' || type === 'float32') return view.getFloat32(offset, true);
    if (type === 'double' || type === 'float64') return view.getFloat64(offset, true);
    // Handle normalized colors if uchar
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

    statusCallback('loading', `Found ${layout.vertexCount.toLocaleString()} splats. Row size: ${layout.rowSize} bytes.`);

    // Find critical property offsets
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
    
    // For Color mode
    const pFdc0 = getProp(['f_dc_0', 'f_dc0', 'red']);
    const pFdc1 = getProp(['f_dc_1', 'f_dc1', 'green']);
    const pFdc2 = getProp(['f_dc_2', 'f_dc2', 'blue']);

    if (!pOpacity || !pScale0) {
        throw new Error("Could not find opacity or scale properties in PLY.");
    }

    // --- Analysis Pass ---
    statusCallback('calculating', 'Analyzing splats...');
    
    const dataView = new DataView(buffer, layout.dataStart);
    const indicesToKeep: number[] = [];
    const items = [];

    // Helper to calculate SH to Color
    // RGB = 0.5 + C0 * f_dc
    const shToColor = (val: number) => 0.5 + (SH_C0 * val);

    let minVolume = Infinity;
    let maxVolume = -Infinity;

    // Optimization: Loop once to gather data for sorting or filtering
    for (let i = 0; i < layout.vertexCount; i++) {
        const base = i * layout.rowSize;
        
        // Read Opacity (usually logit)
        const opacityRaw = getFloatValue(dataView, base + pOpacity.offset, pOpacity.type);
        const opacity = 1 / (1 + Math.exp(-opacityRaw)); // Sigmoid

        // Read Scale (usually log)
        const s0 = getFloatValue(dataView, base + pScale0.offset, pScale0.type);
        const s1 = getFloatValue(dataView, base + pScale1!.offset, pScale1!.type);
        const s2 = getFloatValue(dataView, base + pScale2!.offset, pScale2!.type);
        const vol = Math.exp(s0) * Math.exp(s1) * Math.exp(s2);

        if (vol < minVolume) minVolume = vol;
        if (vol > maxVolume) maxVolume = vol;

        // Read Color if needed
        let r=0, g=0, b=0;
        if (options.mode === 'color' && pFdc0 && pFdc1 && pFdc2) {
             const f0 = getFloatValue(dataView, base + pFdc0.offset, pFdc0.type);
             const f1 = getFloatValue(dataView, base + pFdc1.offset, pFdc1.type);
             const f2 = getFloatValue(dataView, base + pFdc2.offset, pFdc2.type);
             
             // If property name implies simple color (red/green/blue), usually 0-1 or 0-255. 
             // But Gaussian Splats use Spherical Harmonics (f_dc).
             // We assume standard 3DGS SH if names are f_dc_*.
             if (pFdc0.name.startsWith('f_dc')) {
                 r = shToColor(f0);
                 g = shToColor(f1);
                 b = shToColor(f2);
             } else {
                 // Fallback for direct color properties
                 r = f0; g = f1; b = f2;
             }
        }

        items.push({
            index: i,
            opacity,
            vol,
            r, g, b
        });
    }

    // --- Reduction Logic ---
    
    if (options.mode === 'standard') {
        const volRange = maxVolume - minVolume;
        
        // Calculate scores
        const scoredItems = items.map(item => {
            const opacityScore = 1.0 - item.opacity; // Lower opacity = Higher score (candidate for removal) ??
            // Wait, logic: We want to REMOVE low importance.
            // Importance = Opacity * Size.
            // Actually, usually we remove transparent and small things.
            // So Score should be "Importance". Keep High Score.
            // Opacity: 0 (invisible) -> 1 (solid).
            // Volume: Small -> Big.
            
            // Normalized inputs 0..1
            const normVol = volRange > 0 ? (item.vol - minVolume) / volRange : 0;
            
            // Score: Higher means MORE IMPORTANT (Keep)
            // Let's invert the previous logic to be clearer.
            // We want to keep Solid (opacity 1) and Big (vol 1).
            const score = (W_OPACITY * item.opacity) + (W_SIZE * normVol);
            
            return { index: item.index, score };
        });

        statusCallback('reducing', `Smart Removing bottom ${options.percentage}%...`);
        
        // Sort Ascending (Smallest score first)
        scoredItems.sort((a, b) => a.score - b.score);
        
        const removeCount = Math.floor(layout.vertexCount * (options.percentage / 100));
        // Keep from removeCount to end
        for (let i = removeCount; i < scoredItems.length; i++) {
            indicesToKeep.push(scoredItems[i].index);
        }

    } else {
        // Color Mode
        const targetRgb = hexToRgb(options.targetColor);
        const maxDist = 0.8; // Approximate max euclidean dist in RGB space roughly
        const thresholdDist = (options.colorThreshold / 100) * maxDist;

        statusCallback('reducing', `Filtering by color...`);
        
        items.forEach(item => {
            const dist = Math.sqrt(
                Math.pow(item.r - targetRgb[0], 2) +
                Math.pow(item.g - targetRgb[1], 2) +
                Math.pow(item.b - targetRgb[2], 2)
            );
            
            // If distance is LESS than threshold, it matches the target color -> REMOVE IT.
            // So we KEEP if dist > threshold
            if (dist > thresholdDist) {
                indicesToKeep.push(item.index);
            }
        });
    }

    const reducedCount = indicesToKeep.length;
    statusCallback('saving', `Generating new PLY with ${reducedCount.toLocaleString()} splats...`, { original: layout.vertexCount, reduced: reducedCount });

    // --- Reconstruction ---
    // 1. Create New Header
    // We just replace the vertex count in the original header text
    let newHeaderText = layout.header.replace(
        /element vertex \d+/, 
        `element vertex ${reducedCount}`
    );
    // Ensure clean newlines
    newHeaderText = newHeaderText.trim() + '\n';
    
    const encoder = new TextEncoder();
    const newHeaderBytes = encoder.encode(newHeaderText);
    
    // 2. Build Data Buffer
    const newBuffer = new Uint8Array(reducedCount * layout.rowSize);
    const sourceBytes = new Uint8Array(buffer, layout.dataStart);

    // Copy rows
    for (let i = 0; i < reducedCount; i++) {
        const originalIndex = indicesToKeep[i];
        const srcStart = originalIndex * layout.rowSize;
        const srcEnd = srcStart + layout.rowSize;
        const destStart = i * layout.rowSize;
        
        // Fast copy using TypedArray set (sub-array view)
        newBuffer.set(sourceBytes.subarray(srcStart, srcEnd), destStart);
    }

    return new Blob([newHeaderBytes, newBuffer], { type: 'application/octet-stream' });
};
