var region = ee.Geometry(
  table
  .geometry()
  .geometries()
  .get(32)
);

var image = ee
  .ImageCollection("COPERNICUS/S2")
  .filterDate("2018-05-01", "2018-05-31")
  .filterBounds(region)
  .map(function (image) {
    return image.clip(region);
  })
  .min();

/**
 * This script builds up a feature collection via ee.Geometry.MultiPoint,
 * adds geometry to each feature, as well as a class property.
 */
var crop_features = ee.FeatureCollection(
  crop_points.coordinates().map(function (f) {
    return ee.Feature(ee.Geometry.Point(f), {
      class: 1
    });
  })
);

var non_crop_features = ee.FeatureCollection(
  non_crop_points.coordinates().map(function (f) {
    return ee.Feature(ee.Geometry.Point(f), {
      class: 0
    });
  })
);

// Merge crop and non-crop features
var training_features = crop_features.merge(non_crop_features);

var training = image.sampleRegions({
  collection: training_features,
  scale: 10
});

var bands = ["B2", "B3", "B4", "B8"];
var cart = ee.Classifier.cart().train(training, "class", bands);
var trainAccuracy = cart.confusionMatrix();
print("Re-substitution error matrix: ", trainAccuracy);
print("Training overall accuracy: ", trainAccuracy.accuracy());

var classified = image.select(bands).classify(cart);
Map.centerObject(region, 10);
Map.addLayer(image, {
  bands: ['B4', 'B3', 'B2'],
  max: 4000
}, 'image');
Map.addLayer(classified, {
    min: 0,
    max: 1,
    palette: ['000000', '00FF00']
  },
  'classification');

var crop_validation_features = ee.FeatureCollection(
  crop_validation.coordinates().map(function (f) {
    return ee.Feature(
      ee.Geometry.Point(f), {
        class: 1
      })
  })
)

var non_crop_validation_features = ee.FeatureCollection(
  non_crop_validation.coordinates().map(function (f) {
    return ee.Feature(
      ee.Geometry.Point(f), {
        class: 0
      })
  })
)

var validation_features = crop_validation_features.merge(non_crop_validation_features)

var validation = image.sampleRegions({
  collection: validation_features,
  scale: 10
})

var validation_results = validation.classify(cart);

// Get a confusion matrix representing expected accuracy.
var validationAccuracy = validation_results.errorMatrix('class', 'class');
print('Validation error matrix: ', validationAccuracy);
print('Validation overall accuracy: ', validationAccuracy.accuracy());