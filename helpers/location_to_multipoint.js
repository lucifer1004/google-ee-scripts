/**
 * Transform .csv format (comma separated) files with geo-locations to Google Earth Engine script.
 * @param {string} points Comma separated geo-locations.
 * @return {string} Google Earth Engine script for creating multiple points.
 */
const locationToMultiPoint = points => {
  const _points = points.split('\n').map(point => `[${point.split(',').splice(0,2).join(',')}]`).join(',')
  return `var sites = ee.Geometry.MultiPoint([${_points}])`
}