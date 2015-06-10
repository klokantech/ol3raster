goog.provide('ol.reproj.Triangulation');
goog.provide('ol.reproj.triangulation');

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
 * `needsShift` indicates that _any_ of the triangles has to be shifted during
 *  reprojection. See {@link ol.reproj.Triangle}.
 * @typedef {{triangles: Array.<ol.reproj.Triangle>,
 *            needsShift: boolean}}
 */
ol.reproj.Triangulation;


/**
 * Calculates intersection of triangle (`a`,`b`,`c`) and `extent`.
 * Uses Sutherland-Hodgman algorithm for intersection calculation.
 * Triangulates the polygon if necessary.
 *
 * @param {ol.Coordinate} a
 * @param {ol.Coordinate} b
 * @param {ol.Coordinate} c
 * @param {ol.Extent} extent
 * @return {Array.<ol.Coordinate>} Raw triangles (flat array)
 */
ol.reproj.triangulation.triangulateTriangleExtentIntersection = function(
    a, b, c, extent) {
  var tl = ol.extent.getTopLeft(extent);
  var tr = ol.extent.getTopRight(extent);
  var bl = ol.extent.getBottomLeft(extent);
  var br = ol.extent.getBottomRight(extent);
  var edges = [[tl, tr], [tr, br], [br, bl], [bl, tl]];
  var vertices = [a, b, c];

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
  } else {
    // triangulate the result
    return ol.ext.earcut([vertices], false);
  }
};


/**
 * Adds triangle to the triangulation (and reprojects the vertices) if valid.
 * @param {ol.reproj.Triangulation} triangulation
 * @param {ol.Coordinate} a
 * @param {ol.Coordinate} b
 * @param {ol.Coordinate} c
 * @param {ol.proj.Projection} sourceProj
 * @param {ol.proj.Projection} targetProj
 * @param {ol.Extent=} opt_maxTargetExtent
 * @param {ol.Extent=} opt_maxSourceExtent
 * @param {ol.Coordinate=} opt_aSrc Already transformed source point for a.
 * @param {ol.Coordinate=} opt_bSrc Already transformed source point for b.
 * @param {ol.Coordinate=} opt_cSrc Already transformed source point for c.
 */
ol.reproj.triangulation.addTriangleIfValid = function(triangulation, a, b, c,
    sourceProj, targetProj, opt_maxTargetExtent, opt_maxSourceExtent,
    opt_aSrc, opt_bSrc, opt_cSrc) {
  if (goog.isDefAndNotNull(opt_maxTargetExtent)) {
    if (!ol.extent.containsCoordinate(opt_maxTargetExtent, a) &&
        !ol.extent.containsCoordinate(opt_maxTargetExtent, b) &&
        !ol.extent.containsCoordinate(opt_maxTargetExtent, c)) {
      // whole triangle outside target projection extent -> ignore
      return;
    }
    // clamp the vertices to the extent edges before transforming
    a = ol.extent.closestCoordinate(opt_maxTargetExtent, a);
    b = ol.extent.closestCoordinate(opt_maxTargetExtent, b);
    c = ol.extent.closestCoordinate(opt_maxTargetExtent, c);
  }
  var transformInv = ol.proj.getTransform(targetProj, sourceProj);
  var aSrc = goog.isDef(opt_aSrc) ? opt_aSrc : transformInv(a);
  var bSrc = goog.isDef(opt_bSrc) ? opt_bSrc : transformInv(b);
  var cSrc = goog.isDef(opt_cSrc) ? opt_cSrc : transformInv(c);
  if (goog.isDefAndNotNull(opt_maxSourceExtent)) {
    var srcTriangleExtent = ol.extent.boundingExtent([aSrc, bSrc, cSrc]);
    if (!ol.extent.intersects(srcTriangleExtent, opt_maxSourceExtent)) {
      // whole triangle outside source projection extent -> ignore
      // TODO: intersect triangle with the extent rather than bbox ?
      return;
    }
    if (!ol.extent.containsCoordinate(opt_maxSourceExtent, aSrc) ||
        !ol.extent.containsCoordinate(opt_maxSourceExtent, bSrc) ||
        !ol.extent.containsCoordinate(opt_maxSourceExtent, cSrc)) {
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

      var tris = ol.reproj.triangulation.triangulateTriangleExtentIntersection(
          aSrc, bSrc, cSrc, opt_maxSourceExtent);
      var transformFwd = ol.proj.getTransform(sourceProj, targetProj);
      var triCount = Math.floor(tris.length / 3);
      for (var i = 0; i < triCount; i++) {
        var aSrc_ = tris[3 * i],
            bSrc_ = tris[3 * i + 1],
            cSrc_ = tris[3 * i + 2];
        var a_ = transformFwd(aSrc_),
            b_ = transformFwd(bSrc_),
            c_ = transformFwd(cSrc_);
        // Add the triangle. Do not have to pass the extents, because
        // the validation is already done. Also pass the already transformed
        // points to optimize performance.
        ol.reproj.triangulation.addTriangleIfValid(triangulation, a_, b_, c_,
            sourceProj, targetProj, undefined, undefined, aSrc_, bSrc_, cSrc_);
      }
      return;
    }
  }
  var needsShift = false;
  if (sourceProj.canWrapX()) {
    // determine if the triangle crosses the dateline here
    // This can be detected by transforming centroid of the target triangle.
    // If the transformed centroid is outside the transformed triangle,
    // the triangle wraps around projection extent.

    var centroid = [(a[0] + b[0] + c[0]) / 3,
                    (a[1] + b[1] + c[1]) / 3];
    var centroidSrc = transformInv(centroid);

    if (!ol.coordinate.isInTriangle(centroidSrc, aSrc, bSrc, cSrc)) {
      needsShift = true;
    }
  }
  triangulation.triangles.push({
    source: [aSrc, bSrc, cSrc],
    target: [a, b, c],
    needsShift: needsShift
  });
  if (needsShift) {
    triangulation.needsShift = true;
  }
};


/**
 * Triangulates given extent and reprojects vertices.
 * TODO: improved triangulation, better error handling of some trans fails
 * @param {ol.Extent} extent
 * @param {ol.proj.Projection} sourceProj
 * @param {ol.proj.Projection} targetProj
 * @param {ol.Extent=} opt_maxTargetExtent
 * @param {ol.Extent=} opt_maxSourceExtent
 * @param {number=} opt_subdiv Subdivision factor (default 4).
 * @return {ol.reproj.Triangulation}
 */
ol.reproj.triangulation.createForExtent = function(extent, sourceProj,
    targetProj, opt_maxTargetExtent, opt_maxSourceExtent, opt_subdiv) {

  var triangulation = {
    triangles: [],
    needsShift: false
  };

  var tlDst = ol.extent.getTopLeft(extent);
  var brDst = ol.extent.getBottomRight(extent);

  var subdiv = opt_subdiv || 4;
  for (var y = 0; y < subdiv; y++) {
    for (var x = 0; x < subdiv; x++) {
      // do 2 triangle: [(x, y), (x + 1, y + 1), (x, y + 1)]
      //                [(x, y), (x + 1, y), (x + 1, y + 1)]

      var x0y0dst = [
        goog.math.lerp(tlDst[0], brDst[0], x / subdiv),
        goog.math.lerp(tlDst[1], brDst[1], y / subdiv)
      ];
      var x1y0dst = [
        goog.math.lerp(tlDst[0], brDst[0], (x + 1) / subdiv),
        goog.math.lerp(tlDst[1], brDst[1], y / subdiv)
      ];
      var x0y1dst = [
        goog.math.lerp(tlDst[0], brDst[0], x / subdiv),
        goog.math.lerp(tlDst[1], brDst[1], (y + 1) / subdiv)
      ];
      var x1y1dst = [
        goog.math.lerp(tlDst[0], brDst[0], (x + 1) / subdiv),
        goog.math.lerp(tlDst[1], brDst[1], (y + 1) / subdiv)
      ];

      ol.reproj.triangulation.addTriangleIfValid(
          triangulation, x0y0dst, x1y1dst, x0y1dst,
          sourceProj, targetProj, opt_maxTargetExtent, opt_maxSourceExtent);
      ol.reproj.triangulation.addTriangleIfValid(
          triangulation, x0y0dst, x1y0dst, x1y1dst,
          sourceProj, targetProj, opt_maxTargetExtent, opt_maxSourceExtent);
    }
  }

  return triangulation;
};


/**
 * @param {ol.reproj.Triangulation} triangulation
 * @param {ol.proj.Projection} sourceProj
 * @return {ol.Extent}
 */
ol.reproj.triangulation.getSourceExtent = function(triangulation, sourceProj) {
  var extent = ol.extent.createEmpty();

  if (triangulation.needsShift) {
    // although only some of the triangles are crossing the dateline,
    // all coordiantes need to be "shifted" to be positive
    // to properly calculate the extent (and then possibly shifted back)

    var sourceProjExtent = sourceProj.getExtent();
    var sourceProjWidth = ol.extent.getWidth(sourceProjExtent);
    goog.array.forEach(triangulation.triangles, function(triangle, i, arr) {
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
    goog.array.forEach(triangulation.triangles, function(triangle, i, arr) {
      var src = triangle.source;
      ol.extent.extendCoordinate(extent, src[0]);
      ol.extent.extendCoordinate(extent, src[1]);
      ol.extent.extendCoordinate(extent, src[2]);
    });
  }

  return extent;
};
