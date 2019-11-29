var mod44b = ee.ImageCollection('MODIS/051/MOD44B'),
  lc = ee.ImageCollection('COPERNICUS/CORINE/V18_5_1/100m'),
  nlcd = ee.ImageCollection('USGS/NLCD'),
  lsib = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017'),
  mod13q1 = ee.ImageCollection('MODIS/006/MOD13Q1'),
  mcd12q1 = ee.ImageCollection('MODIS/006/MCD12Q1'),
  start = '2006',
  end = '2007',
  region = lsib.filterMetadata('country_co', 'equals', 'US');

var nontree = mod44b
  .filterDate(start, end)
  .first()
  .select('Percent_NonTree_Vegetation')
  .clip(region);
var agri = nlcd
  .filterDate(start, end)
  .first()
  .select('landcover')
  .eq(82)
  .clip(region);
var crop = mcd12q1
  .filterDate(start, end)
  .first()
  .select('LC_Type1')
  .eq(12)
  .clip(region);

var ndviCollection = mod13q1.filterDate(start, end).select('NDVI');
var ndviList = ndviCollection.toList(ndviCollection.size());
var movAvg = [];
movAvg.push(ndviList.get(0));

for (var i = 1; i < 23 - 1; i++) {
  var last = ee.Image(ndviList.get(i - 1));
  var current = ee.Image(ndviList.get(i));
  var next = ee.Image(ndviList.get(i + 1));
  var avg = last
    .add(current)
    .add(next)
    .multiply(1 / 3);
  var image = current.addBands(avg);
  movAvg.push(image.select(['NDVI_1'], ['NDVI']));
}

movAvg.push(ndviList.get(22));

var harvCount = ee.Image.constant(0);
var flag = ee.Image.constant(1);

for (var i = 0; i < 23; i++) {
  var image = ee.Image(movAvg[i]);
  harvCount = image.expression(
    'image > 5000 && flag == 1 ? count + 1 : count',
    {
      image: image,
      flag: flag,
      count: harvCount,
    },
  );
  flag = image.expression('image > 5000 ? 0 : 1', {
    image: image,
    flag: flag,
    count: harvCount,
  });
}

var ndvi = mod13q1
  .filterDate(start, end)
  .select('NDVI')
  .max()
  .multiply(0.0001)
  .clip(region);

Map.centerObject(region, 6);
Map.addLayer(
  nontree,
  {min: 0, max: 70, palette: ['white', 'green']},
  'nontree',
);
Map.addLayer(
  nontree.updateMask(crop),
  {min: 0, max: 70, palette: ['white', 'green']},
  'masked',
);
Map.addLayer(
  harvCount.updateMask(crop),
  {min: 0, max: 3, palette: ['white', 'green']},
  'harvest count',
);

var panel = ui.Panel();
panel.style().set('width', '300px');

var intro = ui.Panel([
  ui.Label({
    value: 'Chart Inspector',
    style: {fontSize: '20px', fontWeight: 'bold'},
  }),
  ui.Label('Click a point on the map to inspect.'),
]);
panel.add(intro);

var lon = ui.Label();
var lat = ui.Label();
panel.add(ui.Panel([lon, lat], ui.Panel.Layout.flow('horizontal')));

Map.onClick(function(coords) {
  lon.setValue('lon: ' + coords.lon.toFixed(2)),
    lat.setValue('lat: ' + coords.lat.toFixed(2));
  var point = ee.Geometry.Point(coords.lon, coords.lat);

  var ndviChart = ui.Chart.image.series(
    ee.ImageCollection(movAvg),
    point,
    ee.Reducer.mean(),
    250,
  );
  ndviChart.setOptions({
    title: 'MODIS NDVI (smoothed)',
    vAxis: {title: 'NDVI', maxValue: 9000},
    hAxis: {title: 'date', format: 'MM-yy', gridlines: {count: 7}},
  });
  panel.widgets().set(2, ndviChart);

  var ndviChart2 = ui.Chart.image.series(
    ee.ImageCollection(ndviList),
    point,
    ee.Reducer.mean(),
    250,
  );
  ndviChart2.setOptions({
    title: 'MODIS NDVI',
    vAxis: {title: 'NDVI', maxValue: 9000},
    hAxis: {title: 'date', format: 'MM-yy', gridlines: {count: 7}},
  });
  panel.widgets().set(3, ndviChart2);
});

Map.style().set('cursor', 'crosshair');

ui.root.insert(0, panel);
