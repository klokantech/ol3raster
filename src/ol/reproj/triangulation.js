goog.provide('ol.reproj.Triangulation');

goog.require('goog.array');
goog.require('goog.math');
goog.require('ol.coordinate');
goog.require('ol.ext.earcut');
goog.require('ol.extent');
goog.require('ol.proj');


/**
 * Single triangle; consists of 3 source points and 3 target points.
 *   `needsShift` can be used to indicate that the whole triangle has to be
 *   shifted during reprojection. This is needed for triangles crossing edges
 *   of the source projection (dateline).
 *
 * @typedef {{source: Array.<ol.Coordinate>,
 *            target: Array.<ol.Coordinate>,
 *            needsShift: boolean}}
 */
ol.reproj.Triangle;



/**
 * @constructor
 */
ol.reproj.Triangulation = function() {
  /**
   * @type {Array.<ol.reproj.Triangle>}
   * @private
   */
  this.triangles_ = [];

  /**
   * Indicates that _any_ of the triangles has to be shifted during
   *   reprojection. See {@link ol.reproj.Triangle}.
   * @type {boolean}
   * @private
   */
  this.needsShift_ = false;
};


/**
 * Calculates intersection of quad (`a`,`b`,`c`,`d`) and `extent`.
 * Uses Sutherland-Hodgman algorithm for intersection calculation.
 * Triangulates the polygon if necessary.
 *
 * @param {ol.Coordinate} a
 * @param {ol.Coordinate} b
 * @param {ol.Coordinate} c
 * @param {ol.Coordinate} d
 * @param {ol.Extent} extent
 * @return {Array.<ol.Coordinate>} Raw triangles (flat array)
 * @private
 */
ol.reproj.Triangulation.triangulateQuadExtentIntersection_ = function(
    a, b, c, d, extent) {
  var tl = ol.extent.getTopLeft(extent);
  var tr = ol.extent.getTopRight(extent);
  var bl = ol.extent.getBottomLeft(extent);
  var br = ol.extent.getBottomRight(extent);
  var edges = [[tl, tr], [tr, br], [br, bl], [bl, tl]];
  var vertices = [a, b, c, d];

  var isInside = function(a, b, p) {
    return ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) <= 0;
  };

  goog.array.forEach(edges, function(edge, i, arr) {
    var newVertices = [];
    var S = vertices[vertices.length - 1];
    goog.array.forEach(vertices, function(E, i, arr) {
      if (isInside(edge[0], edge[1], E)) {
        if (!isInside(edge[0], edge[1], S)) {
          newVertices.push(ol.coordinate.getLineIntersection([S, E], edge));
        }
        newVertices.push(E);
      } else if (isInside(edge[0], edge[1], S)) {
        newVertices.push(ol.coordinate.getLineIntersection([S, E], edge));
      }
      S = E;
    });
    vertices = newVertices;
  });

  if (vertices.length < 3) {
    // less than 3 (usually 0) -> no valid triangle left
    return [];
  } else if (vertices.length == 3) {
    return vertices;
  } else if (vertices.length == 4) {
    // most common case -- don't use earcut for this
    return [vertices[0], vertices[1], vertices[2],
            vertices[0], vertices[2], vertices[3]];
  } else {
    // triangulate the result
    return ol.ext.earcut([vertices], false);
  }
};


/**
 * Adds triangle to the triangulation.
 * @param {ol.Coordinate} a
 * @param {ol.Coordinate} b
 * @param {ol.Coordinate} c
 * @param {ol.Coordinate} aSrc
 * @param {ol.Coordinate} bSrc
 * @param {ol.Coordinate} cSrc
 * @param {ol.proj.Projection} sourceProj
 * @param {ol.proj.Projection} targetProj
 * @private
 */
ol.reproj.Triangulation.prototype.addTriangle_ = function(a, b, c,
    aSrc, bSrc, cSrc, sourceProj, targetProj) {
  var needsShift = false;
  if (sourceProj.canWrapX()) {
    // determine if the triangle crosses the dateline here
    // This can be detected by transforming centroid of the target triangle.
    // If the transformed centroid is outside the transformed triangle,
    // the triangle wraps around projection extent.

    var centroid = [(a[0] + b[0] + c[0]) / 3,
                    (a[1] + b[1] + c[1]) / 3];
    var centroidSrc = ol.proj.transform(centroid, targetProj, sourceProj);
    if (!ol.coordinate.isInTriangle(centroidSrc, aSrc, bSrc, cSrc)) {
      needsShift = true;
    }
  }
  this.triangles_.push({
    source: [aSrc, bSrc, cSrc],
    target: [a, b, c],
    needsShift: needsShift
  });
  if (needsShift) {
    this.needsShift_ = true;
  }
};


/**
 * Adds quad (points in clock-wise order) to the triangulation
 * (and reprojects the vertices) if valid.
 * @param {ol.Coordinate} a
 * @param {ol.Coordinate} b
 * @param {ol.Coordinate} c
 * @param {ol.Coordinate} d
 * @param {ol.Coordinate} aSrc
 * @param {ol.Coordinate} bSrc
 * @param {ol.Coordinate} cSrc
 * @param {ol.Coordinate} dSrc
 * @param {ol.proj.Projection} sourceProj
 * @param {ol.proj.Projection} targetProj
 * @param {ol.Extent=} opt_maxSourceExtent
 * @param {number=} opt_maxSubdiv Maximal subdivision.
 * @param {number=} opt_errorThreshold Acceptable error threshold (in pixels).
 * @private
 */
ol.reproj.Triangulation.prototype.addQuadIfValid_ = function(a, b, c, d,
    aSrc, bSrc, cSrc, dSrc,
    sourceProj, targetProj, opt_maxSourceExtent,
    opt_maxSubdiv, opt_errorThreshold) {

  if (goog.isDefAndNotNull(opt_maxSourceExtent)) {
    var srcQuadExtent = ol.extent.boundingExtent([aSrc, bSrc, cSrc, dSrc]);
    if (!ol.extent.intersects(srcQuadExtent, opt_maxSourceExtent)) {
      // whole quad outside source projection extent -> ignore
      return;
    }
  }
  if (goog.isDef(opt_errorThreshold) && opt_maxSubdiv > 0) {
    var transformInv = ol.proj.getTransform(targetProj, sourceProj);

    var centerTarget = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
    var centerSource = transformInv(centerTarget);
    var centerSourceEstim = [(aSrc[0] + cSrc[0]) / 2, (aSrc[1] + cSrc[1]) / 2];

    var centerSourceErrorSquared = ol.coordinate.squaredDistance(
        centerSourceEstim, centerSource);
    if (centerSourceErrorSquared >
        (opt_errorThreshold) * (opt_errorThreshold)) {
      var ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      var abSrc = transformInv(ab);
      var bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
      var bcSrc = transformInv(bc);
      var cd = [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2];
      var cdSrc = transformInv(cd);
      var da = [(d[0] + a[0]) / 2, (d[1] + a[1]) / 2];
      var daSrc = transformInv(da);

      this.addQuadIfValid_(
          a, ab, centerTarget, da,
          aSrc, abSrc, centerSource, daSrc,
          sourceProj, targetProj, opt_maxSourceExtent,
          opt_maxSubdiv - 1, opt_errorThreshold);
      this.addQuadIfValid_(
          ab, b, bc, centerTarget,
          abSrc, bSrc, bcSrc, centerSource,
          sourceProj, targetProj, opt_maxSourceExtent,
          opt_maxSubdiv - 1, opt_errorThreshold);
      this.addQuadIfValid_(
          centerTarget, bc, c, cd,
          centerSource, bcSrc, cSrc, cdSrc,
          sourceProj, targetProj, opt_maxSourceExtent,
          opt_maxSubdiv - 1, opt_errorThreshold);
      this.addQuadIfValid_(
          da, centerTarget, cd, d,
          daSrc, centerSource, cdSrc, dSrc,
          sourceProj, targetProj, opt_maxSourceExtent,
          opt_maxSubdiv - 1, opt_errorThreshold);

      return;
    }
  }

  if (goog.isDefAndNotNull(opt_maxSourceExtent)) {
    if (!ol.extent.containsCoordinate(opt_maxSourceExtent, aSrc) ||
        !ol.extent.containsCoordinate(opt_maxSourceExtent, bSrc) ||
        !ol.extent.containsCoordinate(opt_maxSourceExtent, cSrc) ||
        !ol.extent.containsCoordinate(opt_maxSourceExtent, dSrc)) {
      // if any vertex is outside projection range, modify the target triangle

      var makeFinite = function(coord, extent) {
        if (!goog.math.isFiniteNumber(coord[0])) {
          coord[0] = goog.math.clamp(coord[0], extent[0], extent[2]);
        }
        if (!goog.math.isFiniteNumber(coord[1])) {
          coord[1] = goog.math.clamp(coord[1], extent[1], extent[3]);
        }
      };
      makeFinite(aSrc, opt_maxSourceExtent);
      makeFinite(bSrc, opt_maxSourceExtent);
      makeFinite(cSrc, opt_maxSourceExtent);
      makeFinite(dSrc, opt_maxSourceExtent);

      var tris = ol.reproj.Triangulation.triangulateQuadExtentIntersection_(
          aSrc, bSrc, cSrc, dSrc, opt_maxSourceExtent);
      var transformFwd = ol.proj.getTransform(sourceProj, targetProj);
      var triCount = Math.floor(tris.length / 3);
      for (var i = 0; i < triCount; i++) {
        var aSrc_ = tris[3 * i],
            bSrc_ = tris[3 * i + 1],
            cSrc_ = tris[3 * i + 2];
        var a_ = transformFwd(aSrc_),
            b_ = transformFwd(bSrc_),
            c_ = transformFwd(cSrc_);
        this.addTriangle_(a_, b_, c_, aSrc_, bSrc_, cSrc_,
                          sourceProj, targetProj);
      }
      return;
    }
  }
  this.addTriangle_(a, c, d, aSrc, cSrc, dSrc, sourceProj, targetProj);
  this.addTriangle_(a, b, c, aSrc, bSrc, cSrc, sourceProj, targetProj);
};


/**
 * Triangulates given extent and reprojects vertices.
 * @param {ol.Extent} extent
 * @param {ol.proj.Projection} sourceProj
 * @param {ol.proj.Projection} targetProj
 * @param {ol.Extent=} opt_maxSourceExtent
 * @param {number=} opt_maxSubdiv Maximal subdivision (default 4).
 * @param {number=} opt_errorThreshold Acceptable error threshold (in pixels).
 * @return {!ol.reproj.Triangulation}
 */
ol.reproj.Triangulation.createForExtent = function(extent, sourceProj,
    targetProj, opt_maxSourceExtent,
    opt_maxSubdiv, opt_errorThreshold) {

  var triangulation = new ol.reproj.Triangulation();

  var transformInv = ol.proj.getTransform(targetProj, sourceProj);
  var tlDst = ol.extent.getTopLeft(extent);
  var trDst = ol.extent.getTopRight(extent);
  var brDst = ol.extent.getBottomRight(extent);
  var blDst = ol.extent.getBottomLeft(extent);
  var tlDstSrc = transformInv(tlDst);
  var trDstSrc = transformInv(trDst);
  var brDstSrc = transformInv(brDst);
  var blDstSrc = transformInv(blDst);

  triangulation.addQuadIfValid_(
      tlDst, trDst, brDst, blDst,
      tlDstSrc, trDstSrc, brDstSrc, blDstSrc,
      sourceProj, targetProj, opt_maxSourceExtent,
      opt_maxSubdiv, opt_errorThreshold);

  return triangulation;
};


/**
 * @param {ol.proj.Projection} sourceProj
 * @return {ol.Extent}
 */
ol.reproj.Triangulation.prototype.calculateSourceExtent = function(sourceProj) {
  var extent = ol.extent.createEmpty();

  if (this.needsShift_) {
    // although only some of the triangles are crossing the dateline,
    // all coordiantes need to be "shifted" to be positive
    // to properly calculate the extent (and then possibly shifted back)

    var sourceProjExtent = sourceProj.getExtent();
    var sourceProjWidth = ol.extent.getWidth(sourceProjExtent);
    goog.array.forEach(this.triangles_, function(triangle, i, arr) {
      var src = triangle.source;
      ol.extent.extendCoordinate(extent,
          [goog.math.modulo(src[0][0], sourceProjWidth), src[0][1]]);
      ol.extent.extendCoordinate(extent,
          [goog.math.modulo(src[1][0], sourceProjWidth), src[1][1]]);
      ol.extent.extendCoordinate(extent,
          [goog.math.modulo(src[2][0], sourceProjWidth), src[2][1]]);
    });

    var right = sourceProjExtent[2];
    if (extent[0] > right) extent[0] -= sourceProjWidth;
    if (extent[2] > right) extent[2] -= sourceProjWidth;
  } else {
    goog.array.forEach(this.triangles_, function(triangle, i, arr) {
      var src = triangle.source;
      ol.extent.extendCoordinate(extent, src[0]);
      ol.extent.extendCoordinate(extent, src[1]);
      ol.extent.extendCoordinate(extent, src[2]);
    });
  }

  return extent;
};


/**
 * @return {Array.<ol.reproj.Triangle>}
 */
ol.reproj.Triangulation.prototype.getTriangles = function() {
  return this.triangles_;
};
