import type { Splat } from '../types';

type ProcessStatus = 'idle' | 'loading' | 'calculating' | 'reducing' | 'saving' | 'success' | 'error';

type StatusCallback = (
    status: ProcessStatus, 
    message: string, 
    counts?: { original: number, reduced: number }
) => void;

// --- Helper Functions ---

const readPlyHeader = (buffer: ArrayBuffer): { header: string; dataOffset: number; vertexCount: number } => {
  const decoder = new TextDecoder();
  let header = '';
  let dataOffset = 0;
  let vertexCount = 0;

  const view = new Uint8Array(buffer);
  const endHeaderToken = 'end_header\n';
  let headerEndIndex = -1;

  // Search for end_header, considering the buffer might be large
  const searchEnd = Math.min(view.length, 4096); // Search in the first 4KB
  for (let i = 0; i < searchEnd - endHeaderToken.length + 1; i++) {
    const chunk = decoder.decode(view.slice(i, i + endHeaderToken.length));
    if (chunk === endHeaderToken) {
        headerEndIndex = i + endHeaderToken.length;
        break;
    }
  }

  if (headerEndIndex === -1) {
    throw new Error('Could not find "end_header" in the PLY file.');
  }
  
  dataOffset = headerEndIndex;
  header = decoder.decode(view.slice(0, dataOffset));
  
  const match = header.match(/element vertex (\d+)/);
  if (match) {
    vertexCount = parseInt(match[1], 10);
  } else {
    throw new Error('Could not find vertex count in PLY header.');
  }

  return { header, dataOffset, vertexCount };
};

export const getVertexCount = async (file: File | Blob): Promise<number> => {
    const buffer = await file.arrayBuffer();
    const { vertexCount } = readPlyHeader(buffer);
    return vertexCount;
}

const parseSplatData = (buffer: ArrayBuffer, dataOffset: number, vertexCount: number): Splat[] => {
  const dataView = new DataView(buffer, dataOffset);
  const splats: Splat[] = [];
  const bytesPerSplat = 14 * 4; // 56 bytes
  
  if (dataView.byteLength < vertexCount * bytesPerSplat) {
      throw new Error(`Buffer is too small for the declared number of vertices. Expected at least ${vertexCount * bytesPerSplat} bytes, but got ${dataView.byteLength}.`);
  }

  for (let i = 0; i < vertexCount; i++) {
    const offset = i * bytesPerSplat;
    const splat: Splat = {
      x: dataView.getFloat32(offset + 0, true),
      y: dataView.getFloat32(offset + 4, true),
      z: dataView.getFloat32(offset + 8, true),
      f_dc_0: dataView.getFloat32(offset + 12, true),
      f_dc_1: dataView.getFloat32(offset + 16, true),
      f_dc_2: dataView.getFloat32(offset + 20, true),
      opacity: dataView.getFloat32(offset + 24, true),
      scale_0: dataView.getFloat32(offset + 28, true),
      scale_1: dataView.getFloat32(offset + 32, true),
      scale_2: dataView.getFloat32(offset + 36, true),
      rot_0: dataView.getFloat32(offset + 40, true),
      rot_1: dataView.getFloat32(offset + 44, true),
      rot_2: dataView.getFloat32(offset + 48, true),
      rot_3: dataView.getFloat32(offset + 52, true),
    };
    splats.push(splat);
  }
  return splats;
};

const generatePlyFile = (splats: Splat[], originalHeader: string): Blob => {
  const newVertexCount = splats.length;
  const newHeader = originalHeader.replace(
    /element vertex \d+/,
    `element vertex ${newVertexCount}`
  );

  const bytesPerSplat = 14 * 4;
  const dataSize = newVertexCount * bytesPerSplat;
  const buffer = new ArrayBuffer(dataSize);
  const dataView = new DataView(buffer);

  splats.forEach((splat, i) => {
    const offset = i * bytesPerSplat;
    dataView.setFloat32(offset + 0, splat.x, true);
    dataView.setFloat32(offset + 4, splat.y, true);
    dataView.setFloat32(offset + 8, splat.z, true);
    dataView.setFloat32(offset + 12, splat.f_dc_0, true);
    dataView.setFloat32(offset + 16, splat.f_dc_1, true);
    dataView.setFloat32(offset + 20, splat.f_dc_2, true);
    dataView.setFloat32(offset + 24, splat.opacity, true);
    dataView.setFloat32(offset + 28, splat.scale_0, true);
    dataView.setFloat32(offset + 32, splat.scale_1, true);
    dataView.setFloat32(offset + 36, splat.scale_2, true);
    dataView.setFloat32(offset + 40, splat.rot_0, true);
    dataView.setFloat32(offset + 44, splat.rot_1, true);
    dataView.setFloat32(offset + 48, splat.rot_2, true);
    dataView.setFloat32(offset + 52, splat.rot_3, true);
  });

  const headerBytes = new TextEncoder().encode(newHeader);
  return new Blob([headerBytes, buffer], { type: 'application/octet-stream' });
};

// --- Color Calculation Helpers ---

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
};

const SH_C0 = 0.28209479177;
const shToRgb = (splat: Splat): { r: number; g: number; b: number } => {
    let r = 0.5 + SH_C0 * splat.f_dc_0;
    let g = 0.5 + SH_C0 * splat.f_dc_1;
    let b = 0.5 + SH_C0 * splat.f_dc_2;
    
    r = Math.max(0, Math.min(1, r)) * 255;
    g = Math.max(0, Math.min(1, g)) * 255;
    b = Math.max(0, Math.min(1, b)) * 255;

    return { r, g, b };
}

const colorDistance = (
  color1: { r: number; g: number; b: number },
  color2: { r: number; g: number; b: number }
): number => {
  const dr = color1.r - color2.r;
  const dg = color1.g - color2.g;
  const db = color1.b - color2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};


// --- Main Reducer Logic ---

const sigmoid = (t: number) => 1 / (1 + Math.exp(-t));

export const reduceSplatsByProperties = async (
    file: File | Blob,
    opacityThresholdPercent: number, // 0-100
    scaleThresholdPercent: number, // 0-100
    statusCallback: StatusCallback
): Promise<Blob> => {
    statusCallback('loading', `Loading and parsing file...`);
    const buffer = await file.arrayBuffer();
    const { header, dataOffset, vertexCount } = readPlyHeader(buffer);
    const splats = parseSplatData(buffer, dataOffset, vertexCount);
    statusCallback('loading', `File loaded with ${vertexCount.toLocaleString()} splats.`);
    const originalCount = splats.length;

    statusCallback('calculating', 'Analyzing splat properties...');
    
    const opacityThreshold = opacityThresholdPercent / 100;

    // FIX: Use reduce to safely find the maximum scale value from a large array
    const maxScale = splats.reduce((max, s) => {
        const s0 = Math.exp(s.scale_0);
        const s1 = Math.exp(s.scale_1);
        const s2 = Math.exp(s.scale_2);
        return Math.max(max, s0, s1, s2);
    }, -Infinity);
    
    const scaleThresholdValue = maxScale * (scaleThresholdPercent / 100);
    
    statusCallback('reducing', `Reducing splats based on thresholds...`);

    const keptSplats = splats.filter(splat => {
        const opacity = sigmoid(splat.opacity);
        if (opacity < opacityThreshold) {
            return false;
        }

        const scale0 = Math.exp(splat.scale_0);
        const scale1 = Math.exp(splat.scale_1);
        const scale2 = Math.exp(splat.scale_2);

        if (scale0 < scaleThresholdValue && scale1 < scaleThresholdValue && scale2 < scaleThresholdValue) {
            return false;
        }

        return true;
    });

    const reducedCount = keptSplats.length;
    statusCallback('saving', `Saving file with ${reducedCount.toLocaleString()} remaining splats...`, {original: originalCount, reduced: reducedCount});

    const newPlyBlob = generatePlyFile(keptSplats, header);
    
    statusCallback('success', `Process complete! The result is now loaded for the next operation.`, {original: originalCount, reduced: reducedCount});

    return newPlyBlob;
};

export const reduceSplatsInFile = async (
    file: File | Blob,
    targetColorHex: string,
    tolerance: number, // 0-100
    statusCallback: StatusCallback
): Promise<Blob> => {
    statusCallback('loading', `Loading and parsing file...`);
    const buffer = await file.arrayBuffer();
    const { header, dataOffset, vertexCount } = readPlyHeader(buffer);
    const splats = parseSplatData(buffer, dataOffset, vertexCount);
    statusCallback('loading', `File loaded with ${vertexCount.toLocaleString()} splats.`);
    const originalCount = splats.length;

    statusCallback('calculating', 'Analyzing splat colors...');
    const targetRgb = hexToRgb(targetColorHex);
    const distanceThreshold = (tolerance / 100) * 150;

    statusCallback('reducing', `Deleting splats with the selected color...`);

    const keptSplats = splats.filter(splat => {
        const splatRgb = shToRgb(splat);
        const distance = colorDistance(splatRgb, targetRgb);
        return distance > distanceThreshold;
    });

    const reducedCount = keptSplats.length;

    statusCallback('saving', `Saving file with ${reducedCount.toLocaleString()} remaining splats...`, {original: originalCount, reduced: reducedCount});

    const newPlyBlob = generatePlyFile(keptSplats, header);
    
    statusCallback('success', `Process complete! The result is now loaded for the next operation.`, {original: originalCount, reduced: reducedCount});

    return newPlyBlob;
};