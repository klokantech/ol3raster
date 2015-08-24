goog.provide('ol.test.source.TileImageSource');

describe('ol.source.TileImage', function() {
  function createSource() {
    return new ol.source.TileImage({
      projection: 'EPSG:3857',
      tileGrid: ol.tilegrid.createForProjection('EPSG:3857'),
      tileUrlFunction: ol.TileUrlFunction.createFromTemplate(
          'spec/ol/source/images/12-655-1583.png')
    });
  }

  describe('#setTileGridForProjection', function() {
    it('uses the tilegrid for given projection', function() {
      var source = createSource();
      var tileGrid = ol.tilegrid.createForProjection('EPSG:4326', 3, [10, 20]);
      source.setTileGridForProjection('EPSG:4326', tileGrid);
      var retrieved = source.getTileGridForProjection(ol.proj.get('EPSG:4326'));
      expect(retrieved).to.be(tileGrid);
    });
  });
});

goog.require('ol.Tile');
goog.require('ol.TileUrlFunction');
goog.require('ol.proj');
goog.require('ol.source.TileImage');
