var table = ee.FeatureCollection("users/woshiwuzihua/huabei");

var ndvi = ee
  .ImageCollection("MODIS/006/MOD13Q1")
  .filter(ee.Filter.date("2018-01-01", "2018-06-30"))
  .filterBounds(table)
  .select(["NDVI"])
  .map(function(image) {
    return image.clip(table);
  });

var ndviList = ndvi.toList(ndvi.size());

var ndvi1 = ndviList.get(8);
var ndvi2 = ndviList.get(11);

var mask = ee.Image(ndvi1).expression("FIRST > SECOND && FIRST > 0.6 ? 1 : 0", {
  FIRST: ee.Image(ndvi1).select("NDVI"),
  SECOND: ee.Image(ndvi2).select("NDVI")
});

Map.centerObject(table, 7);
Map.addLayer(mask);
