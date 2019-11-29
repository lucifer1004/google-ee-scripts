function cal_ndvi(image) {
  return image.addBands(
    image
      .normalizedDifference([
        'Nadir_Reflectance_Band2',
        'Nadir_Reflectance_Band1',
      ])
      .rename('NDVI'),
  );
}

function validation(mask) {
  var crop_features = ee.FeatureCollection(
    crop.coordinates().map(function(f) {
      return ee.Feature(ee.Geometry.Polygon(f), {
        class: 1,
      });
    }),
  );

  var noncrop_features = ee.FeatureCollection(
    noncrop.coordinates().map(function(f) {
      return ee.Feature(ee.Geometry.Polygon(f), {
        class: 0,
      });
    }),
  );

  var features = crop_features.merge(noncrop_features);
  var val = mask.sampleRegions({
    collection: features,
    scale: 100,
  });

  var matrix = val.errorMatrix('class', 'constant');

  print(matrix);
  print(matrix.accuracy());
}

function visualization(mask) {
  var maskVizParams = {
    opacity: 0.8,
    palette: ['white', 'green'],
  };

  Map.centerObject(region, 7);
  Map.addLayer(mask, maskVizParams, 'winter wheat cropland');
}

var region = ee.Geometry(
  table
    .geometry()
    .geometries()
    .get(32),
);

var MODIS_NBAR = ee.ImageCollection('MODIS/006/MCD43A4').filterBounds(region);

for (var i = 0; i < 4; i++) {
  var year = (2016 + i).toString();
  var mayMax = MODIS_NBAR.filterDate(year + '-04-25', year + '-05-15')
    .map(cal_ndvi)
    .max()
    .clip(region);

  var juneMin = MODIS_NBAR.filterDate(year + '-06-10', year + '-06-25')
    .map(cal_ndvi)
    .min()
    .clip(region);

  var mask = ee
    .Image(mayMax)
    .expression('FIRST > 0.55 && SECOND < 0.45 ? 1 : 0', {
      FIRST: mayMax.select('NDVI'),
      SECOND: juneMin.select('NDVI'),
    })
    .clip(region);

  // validation();
  // visualization();

  Export.image.toDrive({
    image: mask,
    region: region,
    description: 'HH' + year + 'ARE_MODIS_v01',
    crs: 'EPSG: 4326',
    scale: 500,
  });
}
