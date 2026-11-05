// Monotone interpolation passes through every point without overshooting. Smooth curves such as
// curveNatural can draw values that were never recorded, which misrepresents tracked data.
export { curveMonotoneX } from "d3-shape";
