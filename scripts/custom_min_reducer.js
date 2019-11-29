// Example image collection
var imageCollection = ee
  .ImageCollection('LANDSAT/LC08/C01/T1_TOA')
  .filterDate('2017-03-30', '2017-05-31')
  .filterBounds(geometry);

// Core reducer
var accumulate = function(image, previous) {
  var lt = image.select('B4').lt(ee.Image(previous).select('B4'));
  var gte = image.select('B4').gte(ee.Image(previous).select('B4'));
  var added = image.multiply(lt).add(ee.Image(previous).multiply(gte));
  return added;
};

// Start from the first image
var first = ee.Image(imageCollection.toList(imageCollection.size()).get(0));
// Execute reduction
var cumulative = imageCollection.iterate(accumulate, first);

// Display the reduced image
var image = ee
  .Image(cumulative)
  .select(['B3', 'B4', 'B5'])
  .clip(geometry);

print(image);
