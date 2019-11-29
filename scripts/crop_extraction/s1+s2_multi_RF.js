function clipImage(image) {
  return image.clip(region);
}

function renameBand(index) {
  return function(bandName) {
    if (bandName === 'nd') return 'NDVI_' + index;
    else return bandName + '_' + index;
  };
}

function calcNDVI(image) {
  return image.addBands(image.normalizedDifference(['B8', 'B4']), ['nd']);
}

function s2CloudMask(image) {
  var cloudBitMask = ee
    .Number(2)
    .pow(10)
    .int();
  var cirrusBitMask = ee
    .Number(2)
    .pow(11)
    .int();
  var qa = image.select('QA60');
  var mask = qa
    .bitwiseAnd(cloudBitMask)
    .eq(0)
    .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.addBands(mask.select(['QA60'], ['Cloud']), ['Cloud']);
}

function getTimeSeriesImage(s2Bands, s1Bands, timeSeries) {
  var images = [];
  for (var i = 0; i < timeSeries.length; i++) {
    var s2Image = ee
      .ImageCollection('COPERNICUS/S2')
      .filterDate(timeSeries[i][0], timeSeries[i][1])
      .filterBounds(region)
      .map(s2CloudMask)
      .map(clipImage)
      .map(calcNDVI)
      .select(s2Bands, s2Bands.map(renameBand(i)))
      .median();
    images.push(s2Image);

    var s1Image = ee
      .ImageCollection('COPERNICUS/S1_GRD')
      .filterDate(timeSeries[i][0], timeSeries[i][1])
      .filterBounds(region)
      .map(clipImage)
      .select(s1Bands, s1Bands.map(renameBand(i)))
      .median();
    images.push(s1Image);
  }
  return ee.Image.cat(images);
}

function generateData(validation_split) {
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

  var training_features = crop_features.merge(noncrop_features);
  var training = image.sampleRegions({
    collection: training_features,
    scale: 10,
  });
  var withRandom = training.randomColumn('random');
  var trainingPartition = withRandom.filter(
    ee.Filter.gt('random', validation_split),
  );
  var testingPartition = withRandom.filter(
    ee.Filter.lte('random', validation_split),
  );
  return [trainingPartition, testingPartition];
}

function trainRFClassifier(rfBands, trainingPartition, testingPartition) {
  var trainedClassifier = ee.Classifier.randomForest(10).train({
    features: trainingPartition,
    classProperty: 'class',
    inputProperties: rfBands,
  });

  var test = testingPartition.classify(trainedClassifier);

  var confusionMatrix = test.errorMatrix('class', 'classification');
  print('Confusion Matrix', confusionMatrix);
  print('Validation overall accuracy: ', confusionMatrix.accuracy());

  return trainedClassifier;
}

function visualization() {
  Map.centerObject(region, 6);
  var vizBands = ['B8', 'B4', 'B3'];
  for (var i = 0; i < timeSeries.length; i++) {
    Map.addLayer(
      image,
      {
        bands: vizBands.map(renameBand(i)),
        min: 0,
        max: 5000,
      },
      'From ' + timeSeries[i][0] + ' to ' + timeSeries[i][1],
    );
  }

  Map.addLayer(
    image.select('NDVI_1').subtract(image.select('NDVI_0')),
    {
      min: -0.2,
      max: 0.2,
      palette: ['red', 'orange', 'yellow', 'lightgreen', 'green'],
    },
    'Delta NDVI',
  );

  var s1VizBands = ['VH_0', 'VV_0', 'VV_1'];
  Map.addLayer(
    image,
    {
      bands: s1VizBands,
      min: -25,
      max: 0,
    },
    'S1 Change',
  );
}

function classifyImage(image, rfBands, classifier) {
  return image.select(rfBands).classify(classifier);
}

var s2Bands = ['B2', 'B3', 'B4', 'B8', 'nd', 'Cloud'];
var s1Bands = ['VH', 'VV'];
var timeSeries = [
  ['2016-05-01', '2016-05-30'],
  ['2016-06-15', '2016-07-15'],
];
var region = ee.Geometry(
  table
    .geometry()
    .geometries()
    .get(32),
);
var image = getTimeSeriesImage(s2Bands, s1Bands, timeSeries);

// visualization();
var data = generateData(0.3);
var t0s2 = ['B2_0', 'B3_0', 'B4_0', 'B8_0', 'NDVI_0'];
var t1s2 = ['B2_1', 'B3_1', 'B4_1', 'B8_1', 'NDVI_1'];
var s1 = ['VH_0', 'VV_0', 'VH_1', 'VV_1'];

var rfBands = [
  t0s2.concat(t1s2).concat(s1),
  t0s2.concat(s1),
  t1s2.concat(s1),
  s1,
];
var rf1 = trainRFClassifier(rfBands[0], data[0], data[1]);
var rf2 = trainRFClassifier(rfBands[1], data[0], data[1]);
var rf3 = trainRFClassifier(rfBands[2], data[0], data[1]);
var rf4 = trainRFClassifier(rfBands[3], data[0], data[1]);

var mask1 = image
  .expression('A == 1 && B == 1 ? 1 : 0', {
    A: image.select('Cloud_0'),
    B: image.select('Cloud_1'),
  })
  .clip(region);

var mask2 = image
  .expression('A == 1 && B != 1 ? 1 : 0', {
    A: image.select('Cloud_0'),
    B: image.select('Cloud_1'),
  })
  .clip(region);

var mask3 = image
  .expression('A != 1 && B == 1 ? 1 : 0', {
    A: image.select('Cloud_0'),
    B: image.select('Cloud_1'),
  })
  .clip(region);

var mask4 = ee
  .Image(1)
  .clip(region)
  .subtract(mask1)
  .subtract(mask2)
  .subtract(mask3);

var res1 = classifyImage(image, rfBands[0], rf1)
  .multiply(mask1)
  .toByte();
var res2 = classifyImage(image, rfBands[1], rf2)
  .multiply(mask2)
  .toByte();
var res3 = classifyImage(image, rfBands[2], rf3)
  .multiply(mask3)
  .toByte();
var res4 = classifyImage(image, rfBands[3], rf4)
  .multiply(mask4)
  .toByte();

Map.centerObject(region, 10);
Map.addLayer(res1, {min: 0, max: 1});
Map.addLayer(res2, {min: 0, max: 1});
Map.addLayer(res3, {min: 0, max: 1});
Map.addLayer(res4, {min: 0, max: 1});

var res = res1
  .add(res2)
  .add(res3)
  .add(res4)
  .toByte();

print(res);

Map.addLayer(
  res,
  {
    min: 0,
    max: 1,
    palette: ['000000', '00FF00'],
  },
  'classification',
);

Export.image.toDrive({
  image: res,
  description: 'HH2016ARE_190602_v01',
  scale: 60,
  region: region,
  crs: 'EPSG: 4326',
  maxPixels: 1e10,
});
