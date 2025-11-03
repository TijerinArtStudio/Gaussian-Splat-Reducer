export interface Splat {
  // Position
  x: number;
  y: number;
  z: number;
  // Spherical Harmonics (DC component)
  f_dc_0: number;
  f_dc_1: number;
  f_dc_2: number;
  // Opacity (logit)
  opacity: number;
  // Scale (log)
  scale_0: number;
  scale_1: number;
  scale_2: number;
  // Rotation (quaternion)
  rot_0: number;
  rot_1: number;
  rot_2: number;
  rot_3: number;
}