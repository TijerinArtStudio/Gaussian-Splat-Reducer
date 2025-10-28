import type { Splat } from '../types';

type ProcessStatus = 'idle' | 'loading' | 'calculating' | 'reducing' | 'saving' | 'success' | 'error';

type StatusCallback = (
    status: ProcessStatus, 
    message: string, 
    counts?: { original: number, reduced: number }
) => void;

// Configuration for score calculation
const W_OPACITY = 0.7;
const W_SIZE = 0.3;

// --- Helper Functions ---

const readPlyHeader = (buffer: ArrayBuffer): { header: string; dataOffset: number; vertexCount: number } => {
  const decoder = new TextDecoder();
  let header = '';
  let dataOffset = 0;
  let vertexCount = 0;

  const view = new Uint8Array(buffer);
  const endHeaderToken = 'end_header\n';
  let headerEndIndex = -1;

  for (let i = 0; i < view.length - endHeaderToken.length + 1; i++) {
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

const parseSplatData = (buffer: ArrayBuffer, dataOffset: number, vertexCount: number): Splat[] => {
  const dataView = new DataView(buffer, dataOffset);
  const splats: Splat[] = [];
  // Per Gaussian Splatting standard, properties are 3x pos, 3x color, 1x opacity, 3x scale, 4x rot = 14 floats
  // This is a simplified parser assuming this structure.
  const bytesPerSplat = 14 * 4; // 14 floats * 4 bytes/float
  
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

// --- Main Reducer Logic ---

export const reduceSplatsInFile = async (
    file: File, 
    percentage: number,
    statusCallback: StatusCallback
): Promise<Blob> => {
    // 1. Loading and Parsing
    statusCallback('loading', `Loading file: ${file.name}...`);
    const buffer = await file.arrayBuffer();
    const { header, dataOffset, vertexCount } = readPlyHeader(buffer);
    const splats = parseSplatData(buffer, dataOffset, vertexCount);
    statusCallback('loading', `File loaded with ${vertexCount.toLocaleString()} splats.`);
    const originalCount = splats.length;

    // 2. Calculating Scores
    statusCallback('calculating', 'Calculating elimination scores...');
    
    let minVolume = Infinity;
    let maxVolume = -Infinity;

    // First pass: Calculate intermediate scores and find min/max volume in a single loop
    // to avoid creating a massive intermediate array for volumes and hitting the call stack limit.
    const intermediateSplats = splats.map(splat => {
      // Opacity Score (low opacity -> high score)
      const realOpacity = 1 / (1 + Math.exp(-splat.opacity));
      const opacityScore = 1.0 - realOpacity;

      // Size Score (small size -> high score)
      const realScale0 = Math.exp(splat.scale_0);
      const realScale1 = Math.exp(splat.scale_1);
      const realScale2 = Math.exp(splat.scale_2);
      const volume = realScale0 * realScale1 * realScale2;

      if (volume < minVolume) minVolume = volume;
      if (volume > maxVolume) maxVolume = volume;
      
      return { splat, volume, opacityScore };
    });

    const volumeRange = maxVolume - minVolume;

    // Second pass: Calculate final scores using the min/max volume
    const splatsWithFinalScores = intermediateSplats.map(({ splat, volume, opacityScore }) => {
        const normalizedVolume = volumeRange > 0 ? (volume - minVolume) / volumeRange : 0;
        const sizeScore = 1.0 - normalizedVolume;
        const finalScore = (W_OPACITY * opacityScore) + (W_SIZE * sizeScore);
        return { splat, finalScore };
    });

    // 3. Reducing Splats
    statusCallback('reducing', `Reducing ${percentage}% of the least important splats...`);
    splatsWithFinalScores.sort((a, b) => b.finalScore - a.finalScore); // Sort descending by score

    const numToRemove = Math.floor(originalCount * (percentage / 100));
    const keptSplatsData = splatsWithFinalScores.slice(numToRemove);
    const keptSplats = keptSplatsData.map(s => s.splat); // Extract original splat objects
    const reducedCount = keptSplats.length;

    statusCallback('saving', `Saving ${reducedCount.toLocaleString()} splats remaining...`, {original: originalCount, reduced: reducedCount});

    // 4. Generating Output File
    const newPlyBlob = generatePlyFile(keptSplats, header);
    
    statusCallback('success', `Process completed successfully! Your download will begin shortly.`, {original: originalCount, reduced: reducedCount});

    return newPlyBlob;
};