function clipImage(image) {
  return image.clip(region);
}

function standardize(image) {
  return image.multiply(0.0001).toFloat();
}

function renameBand(index) {
  return function(bandName) {
    return bandName + "_" + index;
  };
}

function l8CloudMask(image) {
  var cloudsBitMask = 1 << 4;
  var qa = image.select("BQA");
  var mask = qa.bitwiseAnd(cloudsBitMask).eq(0);
  return image.updateMask(mask);
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
  var qa = image.select("QA60");
  var mask = qa
    .bitwiseAnd(cloudBitMask)
    .eq(0)
    .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask);
}

function calcNDVI(image) {
  return image.addBands(
    image.normalizedDifference(["nir", "red"]).select(["nd"], ["NDVI"]),
    ["NDVI"]
  );
}

function getTimeSeriesImage(timeSeries) {
  var images = [];
  for (var i = 0; i < timeSeries.length; i++) {
    var s2Image = ee
      .ImageCollection("COPERNICUS/S2")
      .filterDate(timeSeries[i][0], timeSeries[i][1])
      .filterBounds(region)
      .map(s2CloudMask)
      .map(clipImage)
      .select(s2Bands, opticalBands)
      .map(standardize)
      .map(calcNDVI);

    var l8Image = ee
      .ImageCollection("LANDSAT/LC08/C01/T1_TOA")
      .filterDate(timeSeries[i][0], timeSeries[i][1])
      .filterBounds(region)
      .map(l8CloudMask)
      .map(clipImage)
      .select(l8Bands, opticalBands)
      .map(calcNDVI);

    var modisImage = ee
      .ImageCollection("MODIS/006/MOD09A1")
      .filterDate(timeSeries[i][0], timeSeries[i][1])
      .filterBounds(region)
      .map(clipImage)
      .select(modisBands, opticalBands)
      .map(standardize)
      .map(calcNDVI);

    // projection = s2Image
    //   .first()
    //   .select("red")
    //   .projection();
    var comp = ee.ImageCollection.fromImages([
      s2Image.median(),
      l8Image.median(),
      modisImage.median()
    ]).reduce(ee.Reducer.firstNonNull());
    images.push(comp);
  }
  return ee.Image.cat(images);
}

function generateData(validation_split) {
  var crop_features = ee.FeatureCollection(
    crop.coordinates().map(function(f) {
      return ee.Feature(ee.Geometry.Polygon(f), {
        class: 1
      });
    })
  );

  var noncrop_features = ee.FeatureCollection(
    noncrop.coordinates().map(function(f) {
      return ee.Feature(ee.Geometry.Polygon(f), {
        class: 0
      });
    })
  );

  var training_features = crop_features.merge(noncrop_features);
  var training = image.sampleRegions({
    collection: training_features,
    scale: 10
  });
  var withRandom = training.randomColumn("random");
  var trainingPartition = withRandom.filter(
    ee.Filter.gt("random", validation_split)
  );
  var testingPartition = withRandom.filter(
    ee.Filter.lte("random", validation_split)
  );
  return [trainingPartition, testingPartition];
}

function trainRFClassifier(rfBands, trainingPartition, testingPartition) {
  var trainedClassifier = ee.Classifier.randomForest(10).train({
    features: trainingPartition,
    classProperty: "class",
    inputProperties: rfBands
  });

  var test = testingPartition.classify(trainedClassifier);

  var confusionMatrix = test.errorMatrix("class", "classification");
  print("Confusion Matrix", confusionMatrix);
  print("Validation overall accuracy: ", confusionMatrix.accuracy());

  return trainedClassifier;
}

function classifyImage(image, rfBands, classifier) {
  return image.select(rfBands).classify(classifier);
}

var opticalBands = ["blue", "green", "red", "nir", "swir1", "swir2"];
var s2Bands = ["B2", "B3", "B4", "B8", "B11", "B12"];
var l8Bands = ["B2", "B3", "B4", "B5", "B6", "B7"];
var modisBands = [
  "sur_refl_b03",
  "sur_refl_b04",
  "sur_refl_b01",
  "sur_refl_b02",
  "sur_refl_b06",
  "sur_refl_b07"
];
var rfBands = [
  "blue_first",
  "green_first",
  "red_first",
  "nir_first",
  "swir1_first",
  "swir2_first",
  "NDVI_first",
  "blue_first_1",
  "green_first_1",
  "red_first_1",
  "nir_first_1",
  "swir1_first_1",
  "swir2_first_1",
  "NDVI_first_1"
];

var timeSeries = [["2016-05-01", "2016-05-30"], ["2016-06-15", "2016-07-15"]];
var region = ee.Geometry(
  table
    .geometry()
    .geometries()
    .get(32)
);
Map.centerObject(region, 6);

// var projection;
var image = getTimeSeriesImage(timeSeries);
var data = generateData(0.3);
var rf = trainRFClassifier(rfBands, data[0], data[1]);

timeSeries = [["2017-05-01", "2017-05-30"], ["2017-06-15", "2017-07-15"]];
image = getTimeSeriesImage(timeSeries)
var res = classifyImage(image, rfBands, rf);

// var resample = res
//   .toFloat()
//   .reproject(projection)
//   .reduceResolution(ee.Reducer.mean(), false, 36);
// var thresh = resample.expression("val > 0.6 ? 1 : 0", {
//   val: resample
// });

Map.addLayer(
  res,
  {
    min: 0,
    max: 1,
    palette: ["000000", "00FF00"]
  },
  "classification"
);

Export.image.toDrive({
  image: res,
  description: "HH2017ARE_190613_v01",
  scale: 100,
  region: region,
  crs: "EPSG: 4326",
  maxPixels: 1e10
});
