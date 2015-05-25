goog.provide('ol.reproj');

goog.require('ol.ImageReprojected');
goog.require('ol.ImageState');
goog.require('ol.dom');
goog.require('ol.math');
goog.require('ol.proj');


/**
 * Array of triangles,
 *   each triangles is Array (length=3) of
 *   projected point pairs (length=2; [src, dst]),
 *   each point is ol.Coordinate.
 * @typedef {Array.<Array.<Array.<ol.Coordinate>>>}
 * @private
 */
ol.reproj.Triangles_;


/**
 * @param {ol.proj.Projection} sourceProj
 * @param {ol.proj.Projection} targetProj
 * @param {ol.Extent} targetExtent
 * @param {number} targetResolution
 * @param {number} pixelRatio
 * @param {function(ol.Extent, number, number, ol.proj.Projection) :
 *             ol.ImageBase} getImageFunction
 * @return {ol.ImageBase}
 * @api
 */
ol.reproj.createImage = function(sourceProj, targetProj,
    targetExtent, targetResolution, pixelRatio, getImageFunction) {

  var transformInv = ol.proj.getTransform(targetProj, sourceProj);
  var triangles = ol.reproj.triangulateExtent_(targetExtent, transformInv);

  var idealSourceResolution =
      targetProj.getPointResolution(targetResolution,
                                    ol.extent.getCenter(targetExtent)) *
      targetProj.getMetersPerUnit() / sourceProj.getMetersPerUnit();

  var srcExtent = ol.reproj.calcSourceExtent_(triangles);

  var srcImage = getImageFunction(srcExtent, idealSourceResolution,
                                  pixelRatio, sourceProj);
  if (goog.isNull(srcImage)) {
    return null;
  }

  var dstImage = new ol.ImageReprojected(
      targetExtent, targetResolution, pixelRatio, srcImage.getAttributions());

  var reproject = function() {
    // create the canvas
    var dstWidth = ol.extent.getWidth(targetExtent) / targetResolution + 1;
    var dstHeight = ol.extent.getHeight(targetExtent) / targetResolution + 1;
    var dstContext = ol.dom.createCanvasContext2D(dstWidth, dstHeight);

    if (goog.DEBUG) {
      dstContext.fillStyle = 'rgba(255,0,0,0.1)';
      dstContext.fillRect(0, 0, dstWidth, dstHeight);
    }

    // render the reprojected content
    ol.reproj.renderTriangles_(dstContext, targetResolution, triangles, [{
      extent: srcImage.getExtent(),
      resolution: srcImage.getResolution(),
      image: srcImage.getImage()
    }]);

    dstImage.setImage(dstContext.canvas);
  };

  var state = srcImage.getState();
  if (state == ol.ImageState.LOADED || state == ol.ImageState.ERROR) {
    reproject();
  } else {
    srcImage.listenOnce(goog.events.EventType.CHANGE, function(e) {
      var state = srcImage.getState();
      if (state == ol.ImageState.LOADED) {
        reproject();
      }
    });
    srcImage.load();
  }
  return dstImage;
};


/**
 * Triangulates given extent and reprojects vertices.
 * TODO: improved triangulation, better error handling of some trans fails
 * @param {ol.Extent} extent
 * @param {ol.TransformFunction} transformInv Inverse transform (dst -> src).
 * @return {ol.reproj.Triangles_}
 * @private
 */
ol.reproj.triangulateExtent_ = function(extent, transformInv) {
  var tlDst = ol.extent.getTopLeft(extent);
  var trDst = ol.extent.getTopRight(extent);
  var blDst = ol.extent.getBottomLeft(extent);
  var brDst = ol.extent.getBottomRight(extent);

  var tlSrc = transformInv(tlDst);
  var trSrc = transformInv(trDst);
  var blSrc = transformInv(blDst);
  var brSrc = transformInv(brDst);

  var triangles = [
    [[tlSrc, tlDst], [trSrc, trDst], [blSrc, blDst]],
    [[blSrc, blDst], [trSrc, trDst], [brSrc, brDst]]
  ];

  return triangles;
};


/**
 * @param {ol.reproj.Triangles_} triangles
 * @return {ol.Extent}
 * @private
 */
ol.reproj.calcSourceExtent_ = function(triangles) {
  var extent = ol.extent.createEmpty();

  goog.array.forEach(triangles, function(triangle, i, arr) {
    ol.extent.extendCoordinate(extent, triangle[0][0]);
    ol.extent.extendCoordinate(extent, triangle[1][0]);
    ol.extent.extendCoordinate(extent, triangle[2][0]);
  });

  return extent;
};


/**
 * Renders the source into the canvas based on the triangles.
 * @param {Canvas2DRenderingContext} context
 * @param {number} targetResolution
 * @param {ol.reproj.Triangles_} triangles
 * @param {Array.<{extent: ol.Extent,
 *                 resolution: number,
 *                 image: HTMLCanvasElement|Image|HTMLVideoElement}>} sources
 * @private
 */
ol.reproj.renderTriangles_ = function(context, targetResolution,
                                      triangles, sources) {
  goog.array.forEach(triangles, function(triangle, i, arr) {
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
    context.translate(-triangle[0][1][0], -triangle[1][1][1]);
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
      var tlSrcFromData = ol.extent.getTopLeft(src.extent);
      context.translate(tlSrcFromData[0], tlSrcFromData[1]);
      context.scale(src.resolution, -src.resolution);

      context.drawImage(src.image, 0, 0);
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
