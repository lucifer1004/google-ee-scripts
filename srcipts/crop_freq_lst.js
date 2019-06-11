function lsib_region(code) {
  return lsib.filterMetadata("country_co", "equals", code);
}

function calc_effective_lst(image) {
  return image.expression("LST > 10 && LST < 35 ? LST : 0", {
    LST: image
      .select("LST_Day_1km")
      .add(image.select("LST_Night_1km"))
      .multiply(0.01)
      .subtract(273.15)
  });
}

function calc_accumulated_lst() {
  return myd11a1
    .filterDate(start, end)
    .filterBounds(region)
    .map(calc_effective_lst)
    .sum()
    .select(["constant"], ["Accu"])
    .clip(region)
    .updateMask(cropMask);
}

function visulization() {
  Map.centerObject(region, 5);
  Map.addLayer(
    acc,
    { min: 500, max: 2000, palette: ["blue", "red"] },
    "Accumulated Temperature"
  );
}

function count_harv() {
  var ndviCollection = mod13q1.filterDate(start, end).select("NDVI");
  var ndviList = ndviCollection.toList(ndviCollection.size());
  var movAvg = [];
  movAvg.push(ndviList.get(0));

  var len = 23 * (parseInt(end) - parseInt(start));

  for (var i = 1; i < len - 1; i++) {
    var last = ee.Image(ndviList.get(i - 1));
    var current = ee.Image(ndviList.get(i));
    var next = ee.Image(ndviList.get(i + 1));
    var avg = last
      .add(current)
      .add(next)
      .multiply(1 / 3);
    var image = current.addBands(avg);
    movAvg.push(image.select(["NDVI_1"], ["NDVI"]));
  }

  movAvg.push(ndviList.get(len - 1));

  var harvCount = ee.Image.constant(0);

  for (var i = 1; i < len; i++) {
    var last = ee.Image(movAvg[i - 1]);
    var current = ee.Image(movAvg[i]);
    harvCount = current.expression(
      "(current > 5000 && last < 5000) || (current < 5000 && last > 5000) ? count + 1 : count",
      {
        current: current,
        last: last,
        count: harvCount
      }
    );
  }

  harvCount = harvCount
    .select(["constant"], ["Harv"])
    .toFloat()
    .multiply(0.5)
    .clip(region)
    .updateMask(cropMask);

  return harvCount;
}

function create_scatter(acc, harvCount, point_num) {
  var res = ee.Image.constant(0)
    .addBands(acc)
    .addBands(harvCount);

  var pts = ee.FeatureCollection.randomPoints(region, point_num, 0, 10);
  var result = res.reduceRegion(ee.Reducer.toList(), pts, 1000);

  var yValues = ee.Array(result.get("Harv"));
  var xValues = result.get("Accu");

  var chart = ui.Chart.array
    .values(yValues, 0, xValues)
    .setSeriesNames(["Harv"])
    .setOptions({
      title: "Accu v.s. Harv",
      hAxis: { title: "Accu" },
      vAxis: { title: "Harv" },
      pointSize: 3
    });

  print(chart);
}

function main() {
  var mod44b = ee.ImageCollection("MODIS/051/MOD44B"),
    lc = ee.ImageCollection("COPERNICUS/CORINE/V18_5_1/100m"),
    nlcd = ee.ImageCollection("USGS/NLCD"),
    lsib = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017"),
    mod13q1 = ee.ImageCollection("MODIS/006/MOD13Q1"),
    mcd12q1 = ee.ImageCollection("MODIS/006/MCD12Q1"),
    mod11a1 = ee.ImageCollection("MODIS/006/MOD11A1"),
    myd11a1 = ee.ImageCollection("MODIS/006/MYD11A1"),
    ncep_st = ee.ImageCollection("NCEP_RE/surface_temp"),
    start = "2006",
    end = "2007",
    region = lsib_region("CH");

  var cropMask = mcd12q1
    .filterDate(start, end)
    .first()
    .select("LC_Type1")
    .eq(12)
    .clip(region);

  var acc = calc_accumulated_lst();
  var harvCount = count_harv();

  create_scatter(acc, harvCount, 2000);
}

main();
