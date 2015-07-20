goog.provide('ol.test.reproj.Tile');

describe('ol.reproj.Tile', function() {
  beforeEach(function() {
    proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 ' +
        '+k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy ' +
        '+towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 ' +
        '+units=m +no_defs');
    var proj27700 = ol.proj.get('EPSG:27700');
    proj27700.setExtent([0, 0, 700000, 1300000]);
  });

  afterEach(function() {
    delete proj4.defs['EPSG:27700'];
  });

  describe('constructor', function() {
    it('is empty when outside target tile grid', function() {
      var proj4326 = ol.proj.get('EPSG:4326');
      var proj3857 = ol.proj.get('EPSG:3857');
      var tile = new ol.reproj.Tile(
          proj3857, ol.tilegrid.createForProjection(proj3857),
          proj4326, ol.tilegrid.createForProjection(proj4326),
          0, -1, 0, 1, function() {
            expect().fail('No tiles should be required');
          });
      expect(tile.getState()).to.be(ol.TileState.EMPTY);
    });

    it('is empty when outside source tile grid', function() {
      var proj4326 = ol.proj.get('EPSG:4326');
      var proj27700 = ol.proj.get('EPSG:27700');
      var tile = new ol.reproj.Tile(
          proj27700, ol.tilegrid.createForProjection(proj27700),
          proj4326, ol.tilegrid.createForProjection(proj4326),
          3, 2, -2, 1, function() {
            expect().fail('No tiles should be required');
          });
      expect(tile.getState()).to.be(ol.TileState.EMPTY);
    });

    it('respects tile size of target tile grid', function(done) {
      var proj4326 = ol.proj.get('EPSG:4326');
      var proj3857 = ol.proj.get('EPSG:3857');
      var tile = new ol.reproj.Tile(
          proj3857, ol.tilegrid.createForProjection(proj3857),
          proj4326, ol.tilegrid.createForProjection(proj4326, 10, [100, 40]),
          3, 2, -2, 1, function(z, x, y, pixelRatio) {
            return new ol.ImageTile([z, x, y], ol.TileState.IDLE,
                'spec/ol/source/images/12-655-1583.png', '',
                function(tile, src) {
                  tile.getImage().src = src;
                });
          });
      expect(tile.getState()).to.be(ol.TileState.IDLE);
      tile.listen('change', function() {
        //expect(tile.getState()).to.be(ol.TileState.LOADING);
        if (tile.getState() == ol.TileState.LOADED) {
          var canvas = tile.getImage();
          expect(canvas.width).to.be(100);
          expect(canvas.height).to.be(40);
          done();
        }
      });
      tile.load();
    });
  });
});


goog.require('ol.ImageTile');
goog.require('ol.TileState');
goog.require('ol.proj');
goog.require('ol.reproj.Tile');
