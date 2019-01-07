var sentinelImage = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(ee.Geometry.Rectangle([113.7, 33.6, 114.1, 33.8])) // Set the bounding box
  .filterDate('2018-04-07', '2018-04-09') // Set the time range
  .reduce(ee.Reducer.first()); // Reduce to the first image

var point = ee.Geometry.Point([113.8601, 33.69933]); // Define a point

var sites = ee.Geometry.MultiPoint([
  [113.86017,33.69933],
  [113.84617,33.71367],
]); // Define multiple points

print(sentinelImage.reduceRegion({
  reducer: ee.Reducer.toList(),
  geometry: sites,
  crs: 'EPSG:4326',
  scale: 10,
})); // Print values of multiple points