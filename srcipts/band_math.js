/**
 * Function to mask clouds based on the pixel_qa band of Landsat 8 SR data.
 * @param {ee.Image} image input Landsat 8 SR image
 * @return {ee.Image} cloudmasked Landsat 8 image
 */
function maskL8sr(image) {
  // Bits 3 and 5 are cloud shadow and cloud, respectively.
  var cloudShadowBitMask = 1 << 3;
  var cloudsBitMask = 1 << 5;
  // Get the pixel QA band.
  var qa = image.select("pixel_qa");
  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa
    .bitwiseAnd(cloudShadowBitMask)
    .eq(0)
    .and(qa.bitwiseAnd(cloudsBitMask).eq(0));
  return image.updateMask(mask);
}

var table = ee.FeatureCollection("users/woshiwuzihua/huabei");

var ndvi = ee
  .ImageCollection("MODIS/006/MOD13Q1")
  .filterDate("2018-01-01", "2018-06-30")
  .filterBounds(table)
  .select(["NDVI"])
  .map(function(image) {
    return image.clip(table);
  });

var l8 = ee
  .ImageCollection("LANDSAT/LC08/C01/T1_SR")
  .filterDate("2018-04-01", "2018-06-30")
  .filterBounds(table)
  .map(maskL8sr)
  .median();

var ndviList = ndvi.toList(ndvi.size());

var ndvi1 = ndviList.get(8);
var ndvi2 = ndviList.get(11);

var maskVizParams = {
  opacity: 0.5,
  palette: ["black", "green"]
};

var l8VizParams = {
  bands: ["B4", "B3", "B2"],
  min: 0,
  max: 3000,
  gamma: 1.4
};

var mask = ee.Image(ndvi1).expression("FIRST > SECOND && FIRST > 0.6 ? 1 : 0", {
  FIRST: ee.Image(ndvi1).select("NDVI"),
  SECOND: ee.Image(ndvi2).select("NDVI")
});

Map.centerObject(table, 13);
Map.addLayer(l8, l8VizParams);
Map.addLayer(mask, maskVizParams);

/** Export the mask to Google Drive
 * `table` has multiple polygons, but `region`
 * only accepts single polygon, so we need
 *  to union all the polygons within `table`.
 */
Export.image.toDrive({
  image: mask,
  description: "wwmask2018huabei",
  scale: 500,
  region: table.union()
});
