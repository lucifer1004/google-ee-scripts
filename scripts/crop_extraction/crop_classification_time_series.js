function clipImage(image) {
  return image.clip(region);
}

function renameBand(index) {
  return function(bandName) {
    if (bandName === "nd") return "NDVI_" + index;
    else return bandName + "_" + index;
  };
}

function calcNDVI(image) {
  return image.addBands(image.normalizedDifference(["B8", "B4"]), ["nd"]);
}

function getTimeSeriesImage(s2Bands, s1Bands, timeSeries) {
  var images = [];
  for (var i = 0; i < timeSeries.length; i++) {
    var s2Image = ee
      .ImageCollection("COPERNICUS/S2")
      .filterDate(timeSeries[i][0], timeSeries[i][1])
      .filterBounds(region)
      .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 5))
      .map(clipImage)
      .map(calcNDVI)
      .select(s2Bands, s2Bands.map(renameBand(i)))
      .min();
    images.push(s2Image);

    var s1Image = ee
      .ImageCollection("COPERNICUS/S1_GRD")
      .filterDate(timeSeries[i][0], timeSeries[i][1])
      .filterBounds(region)
      .map(clipImage)
      .select(s1Bands, s1Bands.map(renameBand(i)))
      .min();
    images.push(s1Image);
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

function visualization() {
  Map.centerObject(region, 13);
  var vizBands = ["B8", "B4", "B3"];
  for (var i = 0; i < timeSeries.length; i++) {
    Map.addLayer(
      image,
      {
        bands: vizBands.map(renameBand(i)),
        min: 0,
        max: 5000
      },
      "From " + timeSeries[i][0] + " to " + timeSeries[i][1]
    );
  }

  Map.addLayer(
    image.select("NDVI_1").subtract(image.select("NDVI_0")),
    {
      min: -0.2,
      max: 0.2,
      palette: ["red", "orange", "yellow", "lightgreen", "green"]
    },
    "Delta NDVI"
  );

  var s1VizBands = ["VH_0", "VV_0", "VV_1"];
  Map.addLayer(
    image,
    {
      bands: s1VizBands,
      min: -25,
      max: 0
    },
    "S1 Change"
  );
}

function classifyImage(image, rfBands, classifier) {
  var classified = image.select(rfBands).classify(classifier);
  var mask = image.expression("A > 0 && B > 0 ? 1 : 0", {
    A: image.select("B2_0"),
    B: image.select("B2_1")
  });
  var masked = classified.updateMask(mask);
  Map.addLayer(
    masked,
    {
      min: 0,
      max: 1,
      palette: ["000000", "00FF00"]
    },
    "classification"
  );
}

var s2Bands = ["B2", "B3", "B4", "B8", "nd"];
var s1Bands = ["VH", "VV"];
var rfBands = [
  "B2_0",
  "B3_0",
  "B4_0",
  "B8_0",
  "NDVI_0",
  "VH_0",
  "VV_0",
  "B2_1",
  "B3_1",
  "B4_1",
  "B8_1",
  "NDVI_1",
  "VH_1",
  "VV_1"
];
var timeSeries = [["2016-05-01", "2016-05-30"], ["2016-06-15", "2016-07-15"]];
var region = ee.Geometry(
  table
    .geometry()
    .geometries()
    .get(32)
);
var image = getTimeSeriesImage(s2Bands, s1Bands, timeSeries);

visualization();
var data = generateData(0.3);
var classifier = trainRFClassifier(rfBands, data[0], data[1]);
classifyImage(image, rfBands, classifier);
