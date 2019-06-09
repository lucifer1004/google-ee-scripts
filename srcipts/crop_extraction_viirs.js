function clipImage(image) {
  return image.clip(region);
}

function renameBand(index) {
  return function(bandName) {
    return bandName + "_" + index;
  };
}

function getTimeSeriesImage(bands, timeSeries) {
  var images = [];
  for (var i = 0; i < timeSeries.length; i++) {
    var image = ee
      .ImageCollection("NOAA/VIIRS/001/VNP13A1")
      .filterDate(timeSeries[i][0], timeSeries[i][1])
      .filterBounds(region)
      .map(clipImage)
      .select(bands, bands.map(renameBand(i)))
      .median();
    images.push(image);
  }
  return ee.Image.cat(images);
}

function generateData(validation_split) {
  var crop_features = ee.FeatureCollection(
    crop.coordinates().map(function(f) {
      return ee.Feature(ee.Geometry.Polygon(f), { class: 1 });
    })
  );

  var noncrop_features = ee.FeatureCollection(
    noncrop.coordinates().map(function(f) {
      return ee.Feature(ee.Geometry.Polygon(f), { class: 0 });
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
  var classified = image.select(rfBands).classify(classifier);
  Map.centerObject(image, 6);
  Map.addLayer(
    classified,
    {
      min: 0,
      max: 1,
      palette: ["000000", "00FF00"]
    },
    "classification"
  );
}

var bands = ["EVI", "EVI2", "NDVI"];
var timeSeries = [
  ["2016-03-15", "2016-04-15"],
  ["2016-05-01", "2016-05-30"],
  ["2016-06-15", "2016-07-15"]
];
var rfBands = [
  "EVI_0",
  "EVI2_0",
  "NDVI_0",
  "EVI_1",
  "EVI2_1",
  "NDVI_1",
  "EVI_2",
  "EVI2_2",
  "NDVI_2"
];
var region = ee.Geometry(
  table
    .geometry()
    .geometries()
    .get(32)
);
var image = getTimeSeriesImage(bands, timeSeries);

var data = generateData(0.3);
var classifier = trainRFClassifier(rfBands, data[0], data[1]);
var res = classifyImage(image, rfBands, classifier);

Export.image.toDrive({
  image: res,
  description: "VIIRS_2016",
  scale: 500,
  region: region,
  crs: "EPSG: 4326",
  maxPixels: 1e10
});
