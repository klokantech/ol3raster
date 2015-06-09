goog.provide('ol.reproj');

goog.require('goog.array');
goog.require('ol.extent');
goog.require('ol.math');


/**
 * Renders the source into the canvas based on the triangulation.
 * @param {CanvasRenderingContext2D} context
 * @param {number} sourceResolution
 * @param {number} targetResolution
 * @param {ol.Extent} targetExtent
 * @param {ol.reproj.Triangulation} triangulation
 * @param {Array.<{extent: ol.Extent,
 *                 image: (HTMLCanvasElement|Image)}>} sources
 */
ol.reproj.renderTriangles = function(context,
    sourceResolution, targetResolution, targetExtent, triangulation, sources) {
  goog.array.forEach(triangulation, function(tri, i, arr) {
    context.save();

    var targetTL = ol.extent.getTopLeft(targetExtent);

    /* Calculate affine transform (src -> dst)
     * Resulting matrix can be used to transform coordinate
     * from `sourceProjection` to destination pixels.
     *
     * To optimize number of context calls and increase numerical stability,
     * we also do the following operations:
     * trans(-topLeftExtentCorner), scale(1 / targetResolution), scale(1, -1)
     * here before solving the linear system.
     *
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
    var x0 = tri[0][0][0], y0 = tri[0][0][1],
        x1 = tri[1][0][0], y1 = tri[1][0][1],
        x2 = tri[2][0][0], y2 = tri[2][0][1];
    var u0 = tri[0][1][0] - targetTL[0], v0 = -(tri[0][1][1] - targetTL[1]),
        u1 = tri[1][1][0] - targetTL[0], v1 = -(tri[1][1][1] - targetTL[1]),
        u2 = tri[2][1][0] - targetTL[0], v2 = -(tri[2][1][1] - targetTL[1]);
    var augmentedMatrix = [
      [x0, y0, 1, 0, 0, 0, u0 / targetResolution],
      [x1, y1, 1, 0, 0, 0, u1 / targetResolution],
      [x2, y2, 1, 0, 0, 0, u2 / targetResolution],
      [0, 0, 0, x0, y0, 1, v0 / targetResolution],
      [0, 0, 0, x1, y1, 1, v1 / targetResolution],
      [0, 0, 0, x2, y2, 1, v2 / targetResolution]
    ];
    var coefs = ol.math.solveLinearSystem(augmentedMatrix);
    if (goog.isNull(coefs)) {
      return;
    }

    context.setTransform(coefs[0], coefs[3], coefs[1],
                         coefs[4], coefs[2], coefs[5]);

    var pixelSize = sourceResolution;
    var centroid = [(x0 + x1 + x2) / 3, (y0 + y1 + y2) / 3];

    // moves the `point` farther away from the `anchor`
    var increasePointDistance = function(point, anchor, increment) {
      var dir = [point[0] - anchor[0], point[1] - anchor[1]];
      var distance = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]);
      var scaleFactor = (distance + increment) / distance;
      return [anchor[0] + scaleFactor * dir[0],
              anchor[1] + scaleFactor * dir[1]];
    };

    // enlarge the triangle so that the clip paths of individual triangles
    //   slightly (1px) overlap to prevent transparency errors on triangle edges
    var p0 = increasePointDistance([x0, y0], centroid, pixelSize);
    var p1 = increasePointDistance([x1, y1], centroid, pixelSize);
    var p2 = increasePointDistance([x2, y2], centroid, pixelSize);

    context.beginPath();
    context.moveTo(p0[0], p0[1]);
    context.lineTo(p1[0], p1[1]);
    context.lineTo(p2[0], p2[1]);
    context.closePath();
    context.clip();

    goog.array.forEach(sources, function(src, i, arr) {
      context.save();
      var tlSrcFromData = ol.extent.getTopLeft(src.extent);
      context.translate(tlSrcFromData[0], tlSrcFromData[1]);
      context.scale(sourceResolution, -sourceResolution);

      // the image has to be scaled by half a pixel in every direction
      //    in order to prevent artifacts between the original tiles
      //    that are introduced by the canvas antialiasing.
      context.drawImage(src.image, -0.5, -0.5,
                        src.image.width + 1, src.image.height + 1);
      context.restore();
    });

    if (goog.DEBUG) {
      context.strokeStyle = 'black';
      context.lineWidth = 2 * pixelSize;
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
