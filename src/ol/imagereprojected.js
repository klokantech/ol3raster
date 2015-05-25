goog.provide('ol.ImageReprojected');

goog.require('ol.ImageBase');
goog.require('ol.ImageState');



/**
 * @constructor
 * @extends {ol.ImageBase}
 * @param {ol.Extent} extent Extent.
 * @param {number} resolution Resolution.
 * @param {number} pixelRatio Pixel ratio.
 * @param {Array.<ol.Attribution>} attributions Attributions.
 */
ol.ImageReprojected = function(extent, resolution, pixelRatio, attributions) {
  goog.base(this, extent, resolution, pixelRatio, ol.ImageState.LOADING,
      attributions);

  /**
   * @private
   * @type {HTMLCanvasElement}
   */
  this.canvas_ = null;
};
goog.inherits(ol.ImageReprojected, ol.ImageBase);


/**
 * @inheritDoc
 */
ol.ImageReprojected.prototype.getImage = function(opt_context) {
  return this.canvas_;
};


/**
 * @param {HTMLCanvasElement} canvas Canvas.
 */
ol.ImageReprojected.prototype.setImage = function(canvas) {
  this.canvas_ = canvas;
  this.state = ol.ImageState.LOADED;
  this.changed();
};
