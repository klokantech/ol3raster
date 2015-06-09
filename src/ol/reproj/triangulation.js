goog.provide('ol.reproj.Triangulation');
goog.provide('ol.reproj.triangulation');

goog.require('goog.array');
goog.require('ol.extent');


/**
 * Array of triangles,
 *   each triangles is Array (length=3) of
 *   projected point pairs (length=2; [src, dst]),
 *   each point is ol.Coordinate.
 * @typedef {Array.<Array.<Array.<ol.Coordinate>>>}
 */
ol.reproj.Triangulation;


/**
 * Triangulates given extent and reprojects vertices.
 * TODO: improved triangulation, better error handling of some trans fails
 * @param {ol.Extent} extent
 * @param {ol.TransformFunction} transformInv Inverse transform (dst -> src).
 * @return {ol.reproj.Triangulation}
 */
ol.reproj.triangulation.createForExtent = function(extent, transformInv) {
  var tlDst = ol.extent.getTopLeft(extent);
  var trDst = ol.extent.getTopRight(extent);
  var blDst = ol.extent.getBottomLeft(extent);
  var brDst = ol.extent.getBottomRight(extent);

  var tlSrc = transformInv(tlDst);
  var trSrc = transformInv(trDst);
  var blSrc = transformInv(blDst);
  var brSrc = transformInv(brDst);

  var triangulation = [
    [[tlSrc, tlDst], [brSrc, brDst], [blSrc, blDst]],
    [[tlSrc, tlDst], [trSrc, trDst], [brSrc, brDst]]
  ];

  return triangulation;
};


/**
 * @param {ol.reproj.Triangulation} triangulation
 * @return {ol.Extent}
 */
ol.reproj.triangulation.getSourceExtent = function(triangulation) {
  var extent = ol.extent.createEmpty();

  goog.array.forEach(triangulation, function(triangle, i, arr) {
    ol.extent.extendCoordinate(extent, triangle[0][0]);
    ol.extent.extendCoordinate(extent, triangle[1][0]);
    ol.extent.extendCoordinate(extent, triangle[2][0]);
  });

  return extent;
};
