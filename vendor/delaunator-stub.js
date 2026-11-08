// VENDORED STUB — replaces https://cdn.skypack.dev/delaunator@5.0.0 (upstream
// dependency used only for "piecewiseaffine" transforms). This app only uses
// "projective"/"affine", so the real dependency is not shipped; calling code
// gets a clear error instead of a network fetch.
export default class Delaunator {
  constructor() {
    throw new Error(
      'piecewiseaffine is not available in this vendored build (Delaunator stubbed for offline use)'
    );
  }
}
