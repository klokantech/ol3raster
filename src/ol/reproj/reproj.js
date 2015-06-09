goog.provide('ol.reproj');

goog.require('goog.array');
goog.require('ol.extent');
goog.require('ol.math');


/**
 * Renders the source into the canvas based on the triangulation.
 * @param {CanvasRenderingContext2D} context
 * @param {number} sourceResolution
 * @param {number} targetResolution
 * @param {ol.reproj.Triangulation} triangulation
 * @param {Array.<{extent: ol.Extent,
 *                 image: (HTMLCanvasElement|Image)}>} sources
 */
ol.reproj.renderTriangles = function(context,
    sourceResolution, targetResolution, triangulation, sources) {
  goog.array.forEach(triangulation, function(triangle, i, arr) {
    context.save();

    // calc affine transform (src -> dst)
    /*
     * Src points: xi, yi
     * Dst points: ui, vi
     * Affine coefficients: aij
     *
     * | x0 y0 1  0  0 0 |   |a00|   |u0|
     * | x1 y1 1  0  0 0 |   |a01|   |u1|
     * | x2 y2 1  0  0 0 | x |a02| = |u2|
     * |  0  0 0 x0 y0 1 |   |a10|   |v0|
     * |  0  0 0 x1 y1 1 |   |a11|   |v1|
     * |  0  0 0 x2 y2 1 |   |a12|   |v2|
     */
    var x0 = triangle[0][0][0], y0 = triangle[0][0][1],
        x1 = triangle[1][0][0], y1 = triangle[1][0][1],
        x2 = triangle[2][0][0], y2 = triangle[2][0][1];
    var u0 = triangle[0][1][0], v0 = triangle[0][1][1],
        u1 = triangle[1][1][0], v1 = triangle[1][1][1],
        u2 = triangle[2][1][0], v2 = triangle[2][1][1];
    var augmentedMatrix = [
      [x0, y0, 1, 0, 0, 0, u0],
      [x1, y1, 1, 0, 0, 0, u1],
      [x2, y2, 1, 0, 0, 0, u2],
      [0, 0, 0, x0, y0, 1, v0],
      [0, 0, 0, x1, y1, 1, v1],
      [0, 0, 0, x2, y2, 1, v2]
    ];
    var coefs = ol.math.solveLinearSystem(augmentedMatrix);
    if (goog.isNull(coefs)) {
      return;
    }

    //context.translate(0, destinationHeight);
    context.scale(1, -1);

    context.scale(1 / targetResolution, 1 / targetResolution);
    context.translate(-u0, -v0);
    context.transform(coefs[0], coefs[3], coefs[1],
                      coefs[4], coefs[2], coefs[5]);

    //context.translate(tlSrc[0], tlSrc[1]);
    //context.scale(1 / targetResolution, 1 / targetResolution);
    //context.scale(1 / 2, 1 / 2);

    context.save();

    context.beginPath();
    context.moveTo(x0, y0);
    context.lineTo(x1, y1);
    context.lineTo(x2, y2);
    context.closePath();
    context.clip();

    goog.array.forEach(sources, function(src, i, arr) {
      context.save();
      var tlSrcFromData = ol.extent.getTopLeft(src.extent);
      context.translate(tlSrcFromData[0], tlSrcFromData[1]);
      context.scale(sourceResolution, -sourceResolution);

      context.drawImage(src.image, 0, 0);
      context.restore();
    });

    context.restore();

    if (goog.DEBUG) {
      context.strokeStyle = 'black';
      context.lineWidth = 4000;
      context.beginPath();
      context.moveTo(x0, y0);
      context.lineTo(x1, y1);
      context.lineTo(x2, y2);
      context.closePath();
      context.stroke();
    }

    context.restore();
  });
};
