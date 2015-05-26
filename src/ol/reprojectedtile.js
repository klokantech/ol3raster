goog.provide('ol.ReprojectedTile');

goog.require('goog.object');
goog.require('ol.Tile');
goog.require('ol.TileState');



/**
 * @constructor
 * @extends {ol.Tile}
 * @param {ol.TileCoord} tileCoord Tile coordinate.
 * @param {ol.TileState} state
 */
ol.ReprojectedTile = function(tileCoord, state) {
  //if (state != ol.TileState.EMPTY) {
  //  window['console']['log']('Creating new tile');
  //}
  goog.base(this, tileCoord, state);


  /**
   * @private
   * @type {HTMLCanvasElement}
   */
  this.canvas_ = null;

  /**
   * @private
   * @type {Object.<number, HTMLCanvasElement>}
   */
  this.canvasByContext_ = {};

};
goog.inherits(ol.ReprojectedTile, ol.Tile);


/**
 * @inheritDoc
 */
ol.ReprojectedTile.prototype.getImage = function(opt_context) {
  if (goog.isDef(opt_context)) {
    var image;
    var key = goog.getUid(opt_context);
    if (key in this.canvasByContext_) {
      return this.canvasByContext_[key];
    } else if (goog.object.isEmpty(this.canvasByContext_)) {
      image = this.canvas_;
    } else {
      image = /** @type {HTMLCanvasElement} */ (this.canvas_.cloneNode(false));
    }
    this.canvasByContext_[key] = image;
    return image;
  } else {
    return this.canvas_;
  }
};


/**
 * @param {HTMLCanvasElement} canvas Canvas.
 */
ol.ReprojectedTile.prototype.setImage = function(canvas) {
  this.canvas_ = canvas;
  this.state = ol.TileState.LOADED;
  this.canvasByContext_ = {};
  this.changed();
};
